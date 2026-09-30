import type { GameModeId, MapId, Side, UnitId, WeatherId } from './game/data.ts';
import type { BattleState } from './game/simulation.ts';

export type RoomRequest =
  | { type: 'create'; gameMode: GameModeId }
  | { type: 'join'; code: string }
  | { type: 'deck'; deck: UnitId[] }
  | { type: 'ready'; ready: boolean }
  | { type: 'summon'; unitId: UnitId; position?: { x: number; y: number } }
  | { type: 'leave' }
  | { type: 'rematch' };

export interface RoomStateMessage {
  type: 'room';
  code: string;
  side: Side;
  phase: 'waiting' | 'battle' | 'result';
  gameMode: GameModeId;
  map: MapId;
  weather: WeatherId;
  deck: UnitId[];
  ready: boolean;
  opponentReady: boolean;
  opponentConnected: boolean;
  remaining: number | null;
  rematchRequested: boolean;
  opponentRematchRequested: boolean;
}

export interface BattleMessage { type: 'battle'; state: BattleState }
export interface ErrorMessage { type: 'error'; message: string }
export interface ClosedMessage { type: 'closed'; message: string }
export type RoomMessage = RoomStateMessage | BattleMessage | ErrorMessage | ClosedMessage;

function connectionUrl(): string {
  const configured = import.meta.env.VITE_MULTIPLAYER_URL as string | undefined;
  const url = new URL(configured || '/ws', window.location.href);
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (url.pathname === '/') url.pathname = '/ws';
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error('멀티플레이 서버 주소는 ws 또는 wss 주소여야 합니다.');
  }
  return url.href;
}

/** The server owns room timing, decks, resources, and every battle update. */
export class RoomConnection {
  private socket: WebSocket | null = null;
  private connecting: Promise<void> | null = null;
  private cancelConnect: (() => void) | null = null;

  constructor(private readonly onMessage: (message: RoomMessage) => void) {}

  get connected(): boolean { return this.socket?.readyState === WebSocket.OPEN }

  connect(): Promise<void> {
    if (this.connected) return Promise.resolve();
    if (this.connecting) return this.connecting;

    const connecting = new Promise<void>((resolve, reject) => {
      let socket: WebSocket;
      try { socket = new WebSocket(connectionUrl()); }
      catch (error) { reject(error); return; }
      this.socket = socket;
      let opened = false;
      let finished = false;
      let intentional = false;
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        this.cancelConnect = null;
        if (error) reject(error);
        else resolve();
      };
      const timeout = window.setTimeout(() => {
        intentional = true;
        finish(new Error('서버에 연결하지 못했습니다. 접속 주소와 네트워크를 확인해 주세요.'));
        socket.close();
      }, 8000);
      this.cancelConnect = () => {
        intentional = true;
        finish(new Error('서버 연결을 취소했습니다.'));
      };

      socket.onopen = () => { opened = true; finish(); };
      socket.onerror = () => {
        finish(new Error('멀티플레이 서버에 연결하지 못했습니다. 서버 실행 상태를 확인해 주세요.'));
      };
      socket.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        try {
          const message: unknown = JSON.parse(event.data);
          if (typeof message === 'object' && message !== null && 'type' in message
            && ['room', 'battle', 'error', 'closed'].includes(String(message.type))) {
            this.onMessage(message as RoomMessage);
          }
        } catch {
          this.onMessage({ type: 'error', message: '서버 응답을 읽지 못했습니다. 다시 접속해 주세요.' });
        }
      };
      socket.onclose = () => {
        if (this.socket === socket) this.socket = null;
        finish(new Error('서버 연결이 종료되었습니다. 다시 접속해 주세요.'));
        if (opened && !intentional) {
          this.onMessage({ type: 'closed', message: '서버 연결이 끊어졌습니다. 경기 중 연결 종료는 패배로 처리됩니다.' });
        }
      };
    });
    this.connecting = connecting;
    void connecting.then(
      () => { if (this.connecting === connecting) this.connecting = null; },
      () => { if (this.connecting === connecting) this.connecting = null; },
    );
    return connecting;
  }

  send(request: RoomRequest): void {
    if (!this.connected || !this.socket) {
      this.onMessage({ type: 'error', message: '서버에 연결되어 있지 않습니다. 다시 접속해 주세요.' });
      return;
    }
    this.socket.send(JSON.stringify(request));
  }

  close(): void {
    this.cancelConnect?.();
    this.cancelConnect = null;
    this.connecting = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onclose = null;
      socket.close(1000, 'Client left');
    }
  }
}
