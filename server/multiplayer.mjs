import { randomInt } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { WebSocket, WebSocketServer } from 'ws';
import { DECK_DURATION, DECK_SIZE, GAME_MODES, UNIT_IDS, completeDeck, randomEnvironment, resolveModeRules } from '../src/game/data.ts';
import { Simulation } from '../src/game/simulation.ts';

const SIDES = ['player', 'enemy'];
const opposite = (side) => side === 'player' ? 'enemy' : 'player';
const unitIds = new Set(UNIT_IDS);
const error = (socket, message) => send(socket, { type: 'error', message });
const member = (socket) => ({ socket, deck: [], ready: false, rematch: false });

function send(socket, message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  // A stalled receiver must not accumulate unbounded battle snapshots.
  if (socket.bufferedAmount > 1_000_000) { socket.terminate(); return; }
  socket.send(JSON.stringify(message));
}

/** Attach authoritative private rooms to an existing HTTP server. */
export function createMultiplayerServer(httpServer, options = {}) {
  const rooms = new Map();
  const sessions = new Map();
  const maxRooms = options.maxRooms ?? 100;
  const maxConnections = options.maxConnections ?? 250;
  const preparationSeconds = options.preparationSeconds ?? DECK_DURATION;
  const createSimulation = options.createSimulation ?? ((configuration) => new Simulation(configuration));
  const allowedOrigins = options.allowedOrigins ?? (process.env.MULTIPLAYER_ALLOWED_ORIGINS || '')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });

  const roomMessage = (room, side) => {
    const own = room.members[side];
    const other = room.members[opposite(side)];
    return {
      type: 'room', code: room.code, side, phase: room.phase,
      map: room.map, weather: room.weather, gameMode: room.gameMode, deck: [...own.deck],
      rules: room.simulation?.state.rules ?? room.rules,
      ready: own.ready, opponentReady: other?.ready ?? false,
      opponentConnected: other?.socket?.readyState === WebSocket.OPEN,
      remaining: room.phase === 'waiting' && room.deadline !== null
        ? Math.max(0, (room.deadline - performance.now()) / 1000) : null,
      rematchRequested: own.rematch, opponentRematchRequested: other?.rematch ?? false,
    };
  };
  const broadcastRoom = (room) => {
    for (const side of SIDES) if (room.members[side]) send(room.members[side].socket, roomMessage(room, side));
  };
  const broadcastBattle = (room) => {
    const state = room.simulation.snapshot();
    for (const side of SIDES) send(room.members[side]?.socket, {
      type: 'battle',
      state: { ...state, decks: { ...state.decks, [opposite(side)]: [] } },
    });
  };
  const closeRoom = (room, message) => {
    rooms.delete(room.code);
    for (const side of SIDES) {
      const socket = room.members[side]?.socket;
      const session = sessions.get(socket);
      if (session) { session.room = null; session.side = null; }
      send(socket, { type: 'closed', message });
    }
  };
  const startBattle = (room) => {
    if (room.phase !== 'waiting' || !room.members.enemy?.socket) return;
    for (const side of SIDES) room.members[side].deck = completeDeck(room.members[side].deck);
    room.simulation = createSimulation({
      map: room.map, weather: room.weather, gameMode: room.gameMode,
      rules: room.rules,
      decks: { player: room.members.player.deck, enemy: room.members.enemy.deck },
      seed: randomInt(0, 2 ** 31),
    });
    room.phase = 'battle';
    room.deadline = null;
    broadcastRoom(room);
    broadcastBattle(room);
  };
  const leaveRoom = (socket, notify = true) => {
    const session = sessions.get(socket);
    const room = session?.room;
    if (!room) return;
    const side = session.side;
    session.room = null;
    session.side = null;
    if (room.phase === 'waiting' && side === 'player') {
      closeRoom(room, '방장이 대기방을 나가 방이 종료되었습니다.');
      return;
    }
    room.members[side].socket = null;
    if (notify) send(socket, { type: 'closed', message: '방에서 나왔습니다.' });
    if (room.phase === 'waiting') {
      room.members.enemy = null;
      room.members.player.ready = false;
      room.deadline = null;
    } else if (room.phase === 'battle') {
      room.simulation.surrender(side);
      room.phase = 'result';
      broadcastBattle(room);
    }
    if (!SIDES.some((key) => room.members[key]?.socket)) rooms.delete(room.code);
    else broadcastRoom(room);
  };

  function processRequest(socket, request) {
    const session = sessions.get(socket);
    if (!session) return;
    if (!request || typeof request !== 'object' || Array.isArray(request) || typeof request.type !== 'string') {
      error(socket, '요청 형식이 올바르지 않습니다.'); return;
    }
    if (request.type === 'create' || request.type === 'join') {
      if (session.room) { error(socket, '현재 방에서 나온 뒤 새 방을 이용해 주세요.'); return; }
      if (request.type === 'create') {
        const gameMode = request.gameMode === undefined ? 'standard' : request.gameMode;
        if (typeof gameMode !== 'string' || !Object.hasOwn(GAME_MODES, gameMode)) {
          error(socket, '지원하지 않는 게임 모드입니다.'); return;
        }
        if (rooms.size >= maxRooms) { error(socket, '현재 방이 많아 새 방을 만들 수 없습니다. 잠시 후 다시 시도해 주세요.'); return; }
        let code;
        do { code = String(randomInt(100000, 1000000)); } while (rooms.has(code));
        const room = {
          code, gameMode, rules: resolveModeRules(gameMode), ...randomEnvironment(), phase: 'waiting', deadline: null,
          members: { player: member(socket), enemy: null }, simulation: null,
        };
        rooms.set(code, room);
        session.room = room; session.side = 'player';
      } else {
        if (typeof request.code !== 'string' || !/^\d{6}$/.test(request.code)) {
          error(socket, '초대 코드는 숫자 6자리로 입력해 주세요.'); return;
        }
        const room = rooms.get(request.code);
        if (!room) { error(socket, '초대 코드에 해당하는 방이 없습니다. 코드를 다시 확인해 주세요.'); return; }
        if (room.members.enemy?.socket) { error(socket, '이미 두 명이 입장한 방입니다.'); return; }
        if (room.phase !== 'waiting') { error(socket, '이미 시작되거나 종료된 경기에는 참가할 수 없습니다. 새 방을 만들어 주세요.'); return; }
        room.members.enemy = member(socket);
        room.deadline = performance.now() + preparationSeconds * 1000;
        session.room = room; session.side = 'enemy';
      }
      broadcastRoom(session.room);
      return;
    }
    const room = session.room;
    if (!room) { error(socket, '먼저 방을 만들거나 초대 코드로 참가해 주세요.'); return; }
    const own = room.members[session.side];
    const other = room.members[opposite(session.side)];
    switch (request.type) {
      case 'leave': leaveRoom(socket); return;
      case 'deck':
        if (room.phase !== 'waiting') { error(socket, '덱은 대기방에서만 변경할 수 있습니다.'); return; }
        if (own.ready) { error(socket, '준비를 취소한 뒤 덱을 변경해 주세요.'); return; }
        if (!Array.isArray(request.deck) || request.deck.length > DECK_SIZE
          || request.deck.some((id) => !unitIds.has(id)) || new Set(request.deck).size !== request.deck.length) {
          error(socket, '덱에는 서로 다른 유닛을 최대 5종 선택할 수 있습니다.'); return;
        }
        own.deck = [...request.deck];
        broadcastRoom(room); return;
      case 'ready':
        if (room.phase !== 'waiting' || typeof request.ready !== 'boolean') {
          error(socket, '대기방에서 준비 상태를 선택해 주세요.'); return;
        }
        if (request.ready && own.deck.length === 0) { error(socket, '유닛을 한 종류 이상 선택하면 준비할 수 있습니다.'); return; }
        if (!request.ready && own.ready && other?.ready) { error(socket, '상대가 준비한 뒤에는 준비를 취소할 수 없습니다.'); return; }
        own.ready = request.ready;
        if (own.ready && other?.ready && other.socket) startBattle(room);
        else broadcastRoom(room);
        return;
      case 'summon': {
        if (room.phase !== 'battle') { error(socket, '경기가 진행 중일 때 소환할 수 있습니다.'); return; }
        const position = request.position;
        if (!unitIds.has(request.unitId) || (position !== undefined && (!position || typeof position !== 'object'
          || !Number.isFinite(position.x) || !Number.isFinite(position.y)))) {
          error(socket, '유닛이나 소환 위치가 올바르지 않습니다.'); return;
        }
        if (!room.simulation.summon(session.side, request.unitId, position)) {
          error(socket, '소환하지 못했습니다. 덱에 있는 유닛인지, SP가 충분한지, 아군 영역인지 확인해 주세요.');
        } else broadcastBattle(room);
        return;
      }
      case 'rematch':
        if (room.phase !== 'result') { error(socket, '경기가 끝난 뒤 재대결을 요청할 수 있습니다.'); return; }
        if (!other?.socket) { error(socket, '상대가 방을 나갔습니다. 새 방을 만들어 주세요.'); return; }
        own.rematch = true;
        if (other.rematch) {
          Object.assign(room, randomEnvironment(), { phase: 'waiting', simulation: null, deadline: performance.now() + preparationSeconds * 1000 });
          for (const side of SIDES) Object.assign(room.members[side], { deck: [], ready: false, rematch: false });
        }
        broadcastRoom(room); return;
      default: error(socket, '지원하지 않는 요청입니다.');
    }
  }

  function upgrade(request, socket, head) {
    let pathname;
    try { pathname = new URL(request.url || '/', 'http://localhost').pathname; }
    catch { socket.destroy(); return; }
    // Other paths belong to the development server's HMR connection.
    if (pathname !== '/ws') return;
    const origin = request.headers.origin;
    if ((allowedOrigins.length && (!origin || !allowedOrigins.includes(origin))) || wss.clients.size >= maxConnections) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(request, socket, head, (client) => wss.emit('connection', client));
  }
  httpServer.on('upgrade', upgrade);
  wss.on('connection', (socket) => {
    const session = { room: null, side: null, tokens: 40, rateTime: performance.now(), alive: true };
    sessions.set(socket, session);
    socket.on('pong', () => { session.alive = true; });
    socket.on('error', () => {});
    socket.on('close', () => { leaveRoom(socket, false); sessions.delete(socket); });
    socket.on('message', (data, isBinary) => {
      const now = performance.now();
      session.tokens = Math.min(40, session.tokens + (now - session.rateTime) / 1000 * 20);
      session.rateTime = now;
      if (session.tokens < 1) { error(socket, '요청이 너무 빠릅니다. 잠시 후 다시 접속해 주세요.'); socket.close(1008, 'Rate limit'); return; }
      session.tokens -= 1;
      if (isBinary) { error(socket, '텍스트 요청만 사용할 수 있습니다.'); return; }
      let request;
      try { request = JSON.parse(data.toString()); }
      catch { error(socket, '요청을 읽지 못했습니다. 다시 시도해 주세요.'); return; }
      processRequest(socket, request);
    });
  });

  let lastTick = performance.now();
  let lastRoomBroadcast = lastTick;
  const tick = setInterval(() => {
    const now = performance.now();
    const dt = Math.min((now - lastTick) / 1000, 0.25);
    lastTick = now;
    for (const room of rooms.values()) {
      if (room.phase === 'waiting') {
        if (room.deadline !== null && now >= room.deadline) startBattle(room);
        else if (now - lastRoomBroadcast >= 250) broadcastRoom(room);
      } else if (room.phase === 'battle') {
        room.simulation.update(dt);
        if (room.simulation.state.result) { room.phase = 'result'; broadcastRoom(room); }
        broadcastBattle(room);
      }
    }
    if (now - lastRoomBroadcast >= 250) lastRoomBroadcast = now;
  }, 50);
  const heartbeat = setInterval(() => {
    for (const [socket, session] of sessions) {
      if (!session.alive) { socket.terminate(); continue; }
      session.alive = false;
      socket.ping();
    }
  }, 10_000);
  tick.unref(); heartbeat.unref();

  return {
    wss,
    async close() {
      clearInterval(tick); clearInterval(heartbeat);
      httpServer.off('upgrade', upgrade);
      for (const socket of wss.clients) socket.terminate();
      await new Promise((resolve) => wss.close(resolve));
      rooms.clear(); sessions.clear();
    },
  };
}
