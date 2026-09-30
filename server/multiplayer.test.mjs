import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { WebSocket } from 'ws';
import { Simulation } from '../src/game/simulation.ts';
import { GAME_MODES, resolveModeRules } from '../src/game/data.ts';
import { createMultiplayerServer } from './multiplayer.mjs';

const hostDeck = ['warrior', 'archer', 'shield', 'hunter', 'mage'];
const guestDeck = ['rogue', 'knight', 'warlock', 'commander', 'archmage'];

async function fixture(t, options = {}) {
  const server = createServer((_, response) => { response.writeHead(404); response.end(); });
  const multiplayer = createMultiplayerServer(server, options);
  const clients = [];
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `ws://127.0.0.1:${server.address().port}/ws`;
  t.after(async () => {
    await multiplayer.close();
    for (const client of clients) client.socket.terminate();
    await new Promise((resolve) => server.close(resolve));
  });
  return {
    async client() {
      const socket = new WebSocket(url);
      const client = { socket, messages: [], listeners: new Set() };
      clients.push(client);
      socket.on('error', () => {});
      socket.on('message', (data) => {
        client.messages.push(JSON.parse(data.toString()));
        for (const listener of client.listeners) listener();
      });
      await once(socket, 'open');
      return client;
    },
  };
}

function waitFor(client, predicate, after = 0) {
  return new Promise((resolve, reject) => {
    const check = () => {
      const message = client.messages.slice(after).find(predicate);
      if (message) { clearTimeout(timer); client.listeners.delete(check); resolve(message); }
    };
    const timer = setTimeout(() => {
      client.listeners.delete(check);
      reject(new Error(`Timed out waiting for message; recent: ${JSON.stringify(client.messages.slice(-2))}`));
    }, 3000);
    client.listeners.add(check);
    check();
  });
}

function request(client, message, predicate) {
  const after = client.messages.length;
  client.socket.send(JSON.stringify(message));
  return waitFor(client, predicate, after);
}
const isRoom = (message) => message.type === 'room';
const isError = (message) => message.type === 'error';

async function pair(f, decks = [hostDeck, guestDeck], gameMode = 'standard') {
  const host = await f.client();
  const room = await request(host, { type: 'create', gameMode }, isRoom);
  const guest = await f.client();
  await request(guest, { type: 'join', code: room.code }, isRoom);
  await request(host, { type: 'deck', deck: decks[0] }, isRoom);
  await request(guest, { type: 'deck', deck: decks[1] }, isRoom);
  return { host, guest, code: room.code };
}

async function start(host, guest) {
  await request(host, { type: 'ready', ready: true }, (message) => isRoom(message) && message.ready);
  return request(guest, { type: 'ready', ready: true }, (message) => isRoom(message) && message.phase === 'battle');
}

for (const gameMode of Object.keys(GAME_MODES)) test(`${gameMode}: server owns mode rules through joining and battle`, async (t) => {
  const f = await fixture(t);
  const host = await f.client();
  const forgedRules = { lanes: { count: 3 }, sp: { initial: 9999, max: 9999 }, minions: { enabled: true } };
  const expected = resolveModeRules(gameMode);
  const created = await request(host, { type: 'create', gameMode, rules: forgedRules }, isRoom);
  assert.deepEqual(created.rules, expected, 'untrusted create settings cannot change the server preset');
  const guest = await f.client();
  const joined = await request(guest, { type: 'join', code: created.code, gameMode: 'standard', rules: forgedRules }, isRoom);
  assert.deepEqual(joined.rules, expected);
  await request(host, { type: 'deck', deck: hostDeck }, isRoom);
  await request(guest, { type: 'deck', deck: guestDeck }, isRoom);
  await start(host, guest);
  const hostBattle = await waitFor(host, (message) => message.type === 'battle');
  const guestBattle = await waitFor(guest, (message) => message.type === 'battle');
  assert.deepEqual(hostBattle.state.rules, expected);
  assert.deepEqual(guestBattle.state.rules, expected);
  assert.deepEqual(hostBattle.state.decks.enemy, []);
  assert.deepEqual(guestBattle.state.decks.player, []);
});

test('enabled feature presets reach both clients with lane assignments, minions and structures', async (t) => {
  const original = GAME_MODES.standard.rules;
  t.after(() => { GAME_MODES.standard.rules = original; });
  GAME_MODES.standard.rules = resolveModeRules('standard', {
    lanes: { count: 3 }, neutralWaves: { enabled: false }, minions: { enabled: true },
    towers: { enabled: true }, spBox: { enabled: true },
    sp: { initial: 100, maximum: 100, passive: { enabled: false } },
  });
  const f = await fixture(t, {
    createSimulation(configuration) {
      const simulation = new Simulation(configuration);
      simulation.update(5);
      return simulation;
    },
  });
  const { host, guest } = await pair(f);
  await start(host, guest);
  const first = (await waitFor(host, (message) => message.type === 'battle')).state;
  assert.equal(first.rules.lanes.count, 3);
  assert.equal(first.structures.filter((entity) => entity.kind === 'tower').length, 6);
  assert.equal(first.structures.filter((entity) => entity.kind === 'sp-box').length, 1);
  assert.equal(first.units.filter((entity) => entity.kind === 'minion').length, 18);
  const guestState = (await waitFor(guest, (message) => message.type === 'battle')).state;
  assert.deepEqual(guestState.rules, first.rules);
  assert.deepEqual(guestState.structures, first.structures);
  for (const client of [host, guest]) {
    const side = client === host ? 'player' : 'enemy';
    await request(client, { type: 'summon', unitId: client === host ? 'warrior' : 'rogue', rules: { lanes: { count: 0 } } },
      (message) => message.type === 'battle' && message.state.units.some((entity) => entity.kind === 'summoned' && entity.side === side));
  }
  const after = await request(host, { type: 'summon', unitId: 'warrior' },
    (message) => message.type === 'battle' && message.state.units.filter((entity) => entity.kind === 'summoned' && entity.side === 'player').length === 2);
  const own = after.state.units.filter((entity) => entity.kind === 'summoned' && entity.side === 'player');
  assert.equal(own.length, 2);
  assert.notEqual(own[0].lane, own[1].lane, 'the authority balances tap summons across friendly lane populations');
  assert.equal(after.state.rules.lanes.count, 3);
  const tower = after.state.structures.find((entity) => entity.kind === 'tower' && entity.side === 'player');
  const rejected = await request(host, { type: 'summon', unitId: 'warrior', position: { x: tower.x, y: tower.y } }, isError);
  assert.match(rejected.message, /소환하지 못했습니다/);
});

test('private room validates codes and capacity, starts on readiness, and keeps opponent deck private', async (t) => {
  const f = await fixture(t);
  const host = await f.client();
  const created = await request(host, { type: 'create' }, isRoom);
  assert.match(created.code, /^\d{6}$/);
  assert.equal(created.side, 'player');
  assert.equal(created.gameMode, 'standard');
  assert.equal(created.remaining, null);
  assert.equal(created.opponentConnected, false);
  await request(host, { type: 'deck', deck: ['warrior'] }, isRoom);
  await request(host, { type: 'ready', ready: true }, (message) => isRoom(message) && message.ready);
  const guest = await f.client();
  assert.match((await request(guest, { type: 'join', code: 'abc' }, isError)).message, /6자리/);
  const missing = created.code === '999999' ? '999998' : '999999';
  assert.match((await request(guest, { type: 'join', code: missing }, isError)).message, /방이 없습니다/);
  const joined = await request(guest, { type: 'join', code: created.code }, isRoom);
  assert.equal(joined.side, 'enemy');
  assert.deepEqual(joined.deck, []);
  assert.ok(joined.remaining > 29 && joined.remaining <= 30);
  assert.equal(joined.opponentReady, true);
  assert.equal(JSON.stringify(joined).includes('warrior'), false);
  const third = await f.client();
  assert.match((await request(third, { type: 'join', code: created.code }, isError)).message, /두 명/);
  await request(guest, { type: 'deck', deck: ['hunter'] }, isRoom);
  const guestStart = await request(guest, { type: 'ready', ready: true }, (message) => isRoom(message) && message.phase === 'battle');
  const hostStart = await waitFor(host, (message) => isRoom(message) && message.phase === 'battle');
  assert.equal(hostStart.deck[0], 'warrior');
  assert.equal(guestStart.deck[0], 'hunter');
  assert.equal(hostStart.deck.length, 5);
  assert.equal(new Set(guestStart.deck).size, 5);
  assert.equal(hostStart.map, guestStart.map);
  assert.equal(hostStart.weather, guestStart.weather);
  assert.equal(hostStart.gameMode, 'standard');
  assert.equal(guestStart.gameMode, 'standard');
  const hostBattle = await waitFor(host, (message) => message.type === 'battle');
  const guestBattle = await waitFor(guest, (message) => message.type === 'battle');
  assert.deepEqual(hostBattle.state.decks.enemy, []);
  assert.deepEqual(guestBattle.state.decks.player, []);
  assert.deepEqual(hostBattle.state.decks.player, hostStart.deck);
  assert.deepEqual(guestBattle.state.decks.enemy, guestStart.deck);
  assert.equal(hostBattle.state.gameMode, 'standard');
  assert.deepEqual(hostBattle.state.sp, { player: 5, enemy: 5 });
});

for (const gameMode of ['limited-sp', 'no-kill-sp']) test(`${gameMode}: room validates its mode and applies host rules to both players`, async (t) => {
  const f = await fixture(t);
  const host = await f.client();
  for (const gameMode of ['unknown', '__proto__', 'constructor', null, 20, {}]) {
    assert.match((await request(host, { type: 'create', gameMode }, isError)).message, /게임 모드/);
  }
  const created = await request(host, { type: 'create', gameMode }, isRoom);
  assert.equal(created.gameMode, gameMode);
  const guest = await f.client();
  const joined = await request(guest, { type: 'join', code: created.code, gameMode: 'standard' }, isRoom);
  assert.equal(joined.gameMode, gameMode, 'joining uses the room rules');
  await request(host, { type: 'deck', deck: hostDeck }, isRoom);
  await request(guest, { type: 'deck', deck: guestDeck }, isRoom);
  await start(host, guest);
  const initial = await waitFor(host, (message) => message.type === 'battle');
  assert.equal(initial.state.gameMode, gameMode);
  assert.deepEqual(initial.state.sp, { player: 20, enemy: 20 });
  const elapsed = await waitFor(guest, (message) => message.type === 'battle' && message.state.time >= 1);
  assert.equal(elapsed.state.gameMode, gameMode);
  const assertSp = (state, costs) => {
    for (const side of ['player', 'enemy']) {
      const expected = 20 + state.time * (resolveModeRules(gameMode).sp.passive.enabled ? resolveModeRules(gameMode).sp.passive.amount : 0) - costs[side];
      assert.ok(Math.abs(state.sp[side] - expected) < 1e-8, `${side} SP follows room income and summon costs`);
    }
  };
  assertSp(elapsed.state, { player: 0, enemy: 0 });
  const summoned = await request(host, { type: 'summon', unitId: 'mage' }, (message) => message.type === 'battle' && message.state.units.some((unit) => unit.side === 'player' && unit.unitId === 'mage'));
  assertSp(summoned.state, { player: 10, enemy: 0 });
  const opponent = await request(guest, { type: 'summon', unitId: 'knight' }, (message) => message.type === 'battle' && message.state.units.some((unit) => unit.side === 'enemy' && unit.unitId === 'knight'));
  assertSp(opponent.state, { player: 10, enemy: 10 });
});

test('empty, duplicate, unknown and locked decks are rejected and guest departure resets preparation', async (t) => {
  const f = await fixture(t);
  const { host, guest, code } = await pair(f, [[], []]);
  assert.match((await request(host, { type: 'ready', ready: true }, isError)).message, /한 종류/);
  for (const deck of [['warrior', 'warrior'], ['unknown'], [...hostDeck, 'rogue']]) {
    assert.match((await request(host, { type: 'deck', deck }, isError)).message, /서로 다른/);
  }
  await request(host, { type: 'deck', deck: ['warrior'] }, isRoom);
  await request(host, { type: 'ready', ready: true }, (message) => isRoom(message) && message.ready);
  assert.match((await request(host, { type: 'deck', deck: ['hunter'] }, isError)).message, /준비를 취소/);
  const before = host.messages.length;
  await request(guest, { type: 'leave' }, (message) => message.type === 'closed');
  const alone = await waitFor(host, (message) => isRoom(message) && !message.opponentConnected, before);
  assert.equal(alone.ready, false);
  assert.equal(alone.remaining, null);
  assert.deepEqual(alone.deck, ['warrior']);
  const replacement = await f.client();
  const rejoined = await request(replacement, { type: 'join', code }, isRoom);
  assert.ok(rejoined.remaining > 29);
});

test('cancel readiness preserves the deadline and timeout fills only empty slots', async (t) => {
  const f = await fixture(t, { preparationSeconds: 0.9 });
  const { host, guest } = await pair(f, [['warrior'], []]);
  const ready = await request(host, { type: 'ready', ready: true }, (message) => isRoom(message) && message.ready);
  const timed = await waitFor(host, (message) => isRoom(message) && message.remaining !== null && message.remaining < ready.remaining - 0.1);
  const cancelled = await request(host, { type: 'ready', ready: false }, (message) => isRoom(message) && !message.ready);
  assert.ok(cancelled.remaining <= timed.remaining);
  const hostStart = await waitFor(host, (message) => isRoom(message) && message.phase === 'battle');
  const guestStart = await waitFor(guest, (message) => isRoom(message) && message.phase === 'battle');
  assert.equal(hostStart.deck[0], 'warrior');
  assert.equal(new Set(hostStart.deck).size, 5);
  assert.equal(new Set(guestStart.deck).size, 5);
});

test('host waiting departure closes the room and invalidates its code', async (t) => {
  const f = await fixture(t);
  const { host, guest, code } = await pair(f);
  const after = guest.messages.length;
  await request(host, { type: 'leave' }, (message) => message.type === 'closed');
  const closed = await waitFor(guest, (message) => message.type === 'closed', after);
  assert.match(closed.message, /방장/);
  assert.match((await request(guest, { type: 'join', code }, isError)).message, /방이 없습니다/);
});

test('summoning is authoritative and battle disconnection forfeits without reconnect', async (t) => {
  const f = await fixture(t);
  const { host, guest, code } = await pair(f);
  await start(host, guest);
  assert.match((await request(host, { type: 'summon', unitId: 'rogue' }, isError)).message, /덱/);
  assert.match((await request(host, { type: 'summon', unitId: 'warrior', position: { x: 6, y: 1 } }, isError)).message, /아군 영역/);
  assert.match((await request(host, { type: 'summon', unitId: 'warrior', position: { x: null, y: 19 } }, isError)).message, /위치/);
  await request(host, { type: 'summon', unitId: 'warrior' }, (message) => message.type === 'battle');
  assert.match((await request(host, { type: 'summon', unitId: 'warrior' }, isError)).message, /SP/);
  const after = host.messages.length;
  guest.socket.terminate();
  const result = await waitFor(host, (message) => message.type === 'battle' && message.state.result !== null, after);
  assert.equal(result.state.result.winner, 'player');
  await waitFor(host, (message) => isRoom(message) && message.phase === 'result' && !message.opponentConnected, after);
  assert.match((await request(host, { type: 'rematch' }, isError)).message, /상대가 방을 나갔/);
  const reconnect = await f.client();
  assert.match((await request(reconnect, { type: 'join', code }, isError)).message, /종료된 경기/);
});

for (const gameMode of Object.keys(GAME_MODES)) test(`${gameMode}: both rematch requests preserve mode and reset the battle`, async (t) => {
  const f = await fixture(t, {
    createSimulation(configuration) {
      const simulation = new Simulation(configuration);
      const update = simulation.update.bind(simulation);
      simulation.update = (dt) => { update(dt); if (simulation.state.time >= 0.1) simulation.surrender('enemy'); };
      return simulation;
    },
  });
  const { host, guest, code } = await pair(f, [hostDeck, guestDeck], gameMode);
  await start(host, guest);
  await waitFor(host, (message) => isRoom(message) && message.phase === 'result');
  const asked = await request(host, { type: 'rematch' }, (message) => isRoom(message) && message.rematchRequested);
  assert.equal(asked.phase, 'result');
  assert.equal(asked.opponentRematchRequested, false);
  const hostAfter = host.messages.length;
  const restarted = await request(guest, { type: 'rematch' }, (message) => isRoom(message) && message.phase === 'waiting');
  const hostRestart = await waitFor(host, (message) => isRoom(message) && message.phase === 'waiting', hostAfter);
  assert.equal(restarted.code, code);
  assert.equal(restarted.gameMode, gameMode);
  assert.equal(hostRestart.gameMode, gameMode);
  assert.deepEqual(restarted.rules, resolveModeRules(gameMode));
  assert.deepEqual(hostRestart.rules, restarted.rules);
  assert.deepEqual(restarted.deck, []);
  assert.deepEqual(hostRestart.deck, []);
  assert.equal(restarted.ready, false);
  assert.equal(restarted.opponentReady, false);
  assert.equal(restarted.rematchRequested, false);
  assert.equal(restarted.opponentRematchRequested, false);
  assert.ok(restarted.remaining > 29);
  await request(host, { type: 'deck', deck: hostDeck }, isRoom);
  await request(guest, { type: 'deck', deck: guestDeck }, isRoom);
  const after = host.messages.length;
  await start(host, guest);
  const battle = await waitFor(host, (message) => message.type === 'battle', after);
  assert.equal(battle.state.gameMode, gameMode);
  assert.deepEqual(battle.state.rules, restarted.rules);
  const initialSp = resolveModeRules(gameMode).sp.initial;
  assert.deepEqual(battle.state.sp, { player: initialSp, enemy: initialSp });
});

test('malformed JSON and unsupported actions return errors without losing the connection', async (t) => {
  const f = await fixture(t);
  const client = await f.client();
  client.socket.send('{bad json');
  await waitFor(client, isError);
  await request(client, { type: 'create' }, isRoom);
  assert.match((await request(client, { type: 'cheat' }, isError)).message, /지원하지 않는/);
  const room = await request(client, { type: 'deck', deck: ['warrior'] }, isRoom);
  assert.deepEqual(room.deck, ['warrior']);
});

test('oversized and excessive requests are bounded by the WebSocket authority', async (t) => {
  const f = await fixture(t);
  const oversized = await f.client();
  const oversizedClosed = once(oversized.socket, 'close');
  oversized.socket.send('x'.repeat(5000));
  assert.equal((await oversizedClosed)[0], 1009);
  const rapid = await f.client();
  const rateClosed = once(rapid.socket, 'close');
  for (let i = 0; i < 45; i += 1) rapid.socket.send('{}');
  assert.equal((await rateClosed)[0], 1008);
});
