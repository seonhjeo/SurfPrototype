import Phaser from 'phaser';
import { BattleScene, GAME_SIZE } from './game/BattleScene';
import { completeDeck, DECK_DURATION, DECK_SIZE, FORT_RADIUS, GAME_MODES, MAPS, MATCH_DURATION, PLAYER_RADIUS, randomEnvironment, SP_MAX, UNIT_IDS, UNITS, WEATHER } from './game/data';
import type { Environment, GameModeId, Side, UnitId } from './game/data';
import { Simulation } from './game/simulation';
import type { BattleState } from './game/simulation';
import { BattleSnapshotInterpolator } from './game/battle-presentation';
import { RoomConnection } from './network';
import type { RoomMessage, RoomStateMessage } from './network';

type Phase = 'lobby' | 'waiting' | 'battle' | 'result';
type Position = { x: number; y: number };
type Drag = { pointer: number; unit: UnitId; x: number; y: number; moved: boolean; button: HTMLButtonElement };
const other = (side: Side): Side => side === 'player' ? 'enemy' : 'player';
const spRecovery = (gameMode: GameModeId) => GAME_MODES[gameMode].spRegen ? `+${GAME_MODES[gameMode].spRegen} / 초` : '자동 획득 없음';
const killSpRule = (gameMode: GameModeId) => GAME_MODES[gameMode].killSpRewards ? '처치 SP 획득' : '처치 SP 없음';
const spRules = (gameMode: GameModeId) => `시작 ${GAME_MODES[gameMode].initialSp} SP · ${spRecovery(gameMode)} · ${killSpRule(gameMode)}`;
const clock = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, '0')}:${Math.floor(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`;
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const resultReason = (reason: string) => ({ 'fort-destroyed': '성채가 파괴되어 전투가 종료되었습니다.', timeout: '제한시간 종료 · 남은 성채 체력으로 판정했습니다.', surrender: '상대가 경기를 떠났습니다.' })[reason] ?? reason;
const crest = `<svg viewBox="0 0 320 220" aria-hidden="true" class="crest-art">
  <defs><linearGradient id="crest-ground" x2="0" y2="1"><stop stop-color="#b6cab5"/><stop offset="1" stop-color="#829f95"/></linearGradient></defs>
  <circle cx="160" cy="101" r="81" fill="#e9ddbf"/><circle cx="219" cy="48" r="17" fill="#e8b871"/>
  <path d="M27 153Q85 115 157 145T294 139V201H27Z" fill="url(#crest-ground)"/><path d="M123 183L157 132L172 135L197 184" fill="#ebdfc9"/>
  <path d="M94 101V75h11v9h11v-9h11v26M192 101V75h11v9h11v-9h11v26" fill="#477877"/>
  <path d="M96 97h29v74H96zM194 97h29v74h-29z" fill="#477877"/><path d="M117 102h85v71h-85z" fill="#5e9390"/>
  <path d="M116 112h86M116 143h86M99 127h23M197 127h23" stroke="#32605f" stroke-width="3" opacity=".6"/>
  <path d="M148 173v-31a12 12 0 0 1 24 0v31" fill="#263d46"/><path d="M155 102V57" stroke="#304952" stroke-width="3"/>
  <path d="M157 58h35l-7 10 7 10h-35" fill="#dcca80"/><path d="M79 177l-5-25-5 25M241 177l5-25 5 25" stroke="#3f7373" stroke-width="3" fill="none"/>
  <path d="M53 184h215" stroke="#e4d9c4" stroke-width="2"/><circle cx="78" cy="122" r="3" fill="#d9b879"/><circle cx="243" cy="110" r="3" fill="#d9b879"/>
</svg>`;

export class SurfApp {
  private screen = document.querySelector<HTMLElement>('#screen')!;
  private status = document.querySelector<HTMLElement>('#status')!;
  private phase: Phase = 'lobby';
  private mode: 'ai' | 'room' = 'ai';
  private gameMode: GameModeId = 'standard';
  private environment: Environment = randomEnvironment();
  private deck: UnitId[] = [];
  private detail: UnitId = 'warrior';
  private ready = false;
  private opponentReady = false;
  private waitingStarted = 0;
  private deadline = 0;
  private side: Side = 'player';
  private connection: RoomConnection | null = null;
  private room: RoomStateMessage | null = null;
  private simulation: Simulation | null = null;
  private state: BattleState | null = null;
  private presentation = new BattleSnapshotInterpolator();
  private game: Phaser.Game | null = null;
  private scene: BattleScene | null = null;
  private screenEvents = new AbortController();
  private globalEvents = new AbortController();
  private raf = 0;
  private previous = 0;
  private accumulator = 0;
  private lastPaint = 0;
  private generation = 0;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private drag: Drag | null = null;
  private pending = false;
  private destroyed = false;

  constructor() {
    this.fitViewport();
    this.renderLobby();
    const signal = this.globalEvents.signal;
    window.addEventListener('resize', this.fitViewport, { signal });
    window.addEventListener('pagehide', () => this.exitConnection(), { signal });
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) { this.returnLobby(false); this.notice('로비로 돌아왔습니다. 새로운 대전을 시작하세요.'); }
    }, { signal });
    document.addEventListener('visibilitychange', () => {
      if (this.mode === 'ai' && this.phase === 'battle' && !document.hidden) this.notice('다른 탭을 보는 동안에도 전투 시간이 진행됩니다.');
    }, { signal });
    this.raf = requestAnimationFrame(this.frame);
  }

  private fitViewport = () => {
    const scale = Math.min(1, (window.innerHeight - 16) / 667, (window.innerWidth - 16) / 375);
    document.documentElement.style.setProperty('--landscape-scale', String(Math.max(0.1, scale)));
  };

  private listen(type: string, listener: (event: Event) => void, element: EventTarget = this.screen) {
    element.addEventListener(type, listener, { signal: this.screenEvents.signal });
  }
  private clearScreen() {
    this.screenEvents.abort(); this.screenEvents = new AbortController();
    this.drag = null; this.scene?.setPreview(null, false); this.destroyGame();
    document.querySelector('#toast')?.classList.remove('visible');
  }
  private destroyGame() { this.game?.destroy(true); this.game = null; this.scene = null; }
  private text(selector: string, content: string) {
    const element = this.screen.querySelector<HTMLElement>(selector);
    if (element && element.textContent !== content) element.textContent = content;
  }
  private notice(message: string) {
    const toast = document.querySelector<HTMLElement>('#toast')!;
    toast.textContent = message; toast.classList.add('visible'); this.status.textContent = message;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove('visible'), 4500);
  }

  private renderLobby() {
    this.clearScreen(); this.phase = 'lobby'; this.pending = false;
    this.status.textContent = '플레이할 준비가 되었습니다.';
    this.screen.innerHTML = `<section class="lobby screen-content" aria-labelledby="lobby-title">
      <div class="lobby-intro"><p class="eyebrow">A LITTLE STRATEGY. A BIG BATTLE.</p><h1 id="lobby-title">작은 선택,<br><span>큰 전투.</span></h1><p class="intro-copy">나만의 다섯 유닛으로<br>상대의 성채를 공략하세요.</p></div>
      <div class="hero-art">${crest}<span class="art-label">BUILD YOUR DECK · DEFEND YOUR FORT</span></div>
      <div class="mode-card"><span class="mode-icon" aria-hidden="true">♜</span><div><span class="eyebrow">GAME MODE</span><h2>성채 공방전</h2><p>1대1 전략 대전 · 최대 5분</p></div></div>
      <div class="mode-options" role="group" aria-label="게임 모드 선택">${Object.values(GAME_MODES).map((mode) => `<button class="mode-option${mode.id === this.gameMode ? ' selected' : ''}" type="button" data-game-mode="${mode.id}" aria-pressed="${mode.id === this.gameMode}"><strong>${mode.name}</strong><small>${spRules(mode.id)}</small></button>`).join('')}</div>
      <button class="button primary ai-button" type="button" data-action="ai"><span>AI와 대전</span><span aria-hidden="true">↗</span></button>
      <div class="private-heading"><span>친구와 함께 플레이</span><span class="hairline"></span></div>
      <button class="button secondary create-button" type="button" data-action="create">비공개 방 만들기 <span aria-hidden="true">＋</span></button>
      <form class="join-form"><label class="sr-only" for="room-code">6자리 초대 코드</label><input id="room-code" name="code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="6자리 초대 코드" autocomplete="off" required aria-describedby="join-help"><button class="button join-button" type="submit">참가 <span aria-hidden="true">→</span></button></form>
      <p class="muted tiny" id="join-help">초대 코드로 참가하면 방장이 선택한 모드로 플레이합니다.</p><p class="lobby-footnote"><span class="status-dot"></span>PROTOTYPE 001 <span>아이디어를 플레이로.</span></p>
    </section>`;
    this.listen('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button || this.pending) return;
      if (button.dataset.gameMode) {
        this.gameMode = button.dataset.gameMode as GameModeId;
        this.screen.querySelectorAll<HTMLButtonElement>('[data-game-mode]').forEach((option) => {
          const selected = option.dataset.gameMode === this.gameMode;
          option.classList.toggle('selected', selected); option.setAttribute('aria-pressed', String(selected));
        });
        this.status.textContent = `${GAME_MODES[this.gameMode].name} 선택. ${spRules(this.gameMode)}.`;
        return;
      }
      if (button.dataset.action === 'ai') this.startAI();
      else if (button.dataset.action === 'create') void this.connectRoom();
    });
    this.listen('input', (event) => { const input = event.target as HTMLInputElement; if (input.id === 'room-code') input.value = input.value.replace(/\D/g, '').slice(0, 6); });
    this.listen('submit', (event) => {
      event.preventDefault(); if (this.pending) return;
      const code = this.screen.querySelector<HTMLInputElement>('#room-code')!.value;
      if (!/^\d{6}$/.test(code)) { this.notice('초대 코드 여섯 자리를 입력하세요.'); return; }
      void this.connectRoom(code);
    });
  }

  private startAI() {
    this.exitConnection(false);
    this.mode = 'ai'; this.side = 'player'; this.environment = randomEnvironment();
    this.deck = []; this.ready = false; this.opponentReady = false; this.room = null; this.state = null; this.simulation = null;
    this.waitingStarted = performance.now(); this.deadline = Date.now() + DECK_DURATION * 1000; this.renderWaiting();
  }
  private async connectRoom(code?: string) {
    this.exitConnection(false);
    this.pending = true; this.screen.querySelectorAll<HTMLButtonElement>('button').forEach((button) => { button.disabled = true; });
    this.notice('대전 서버에 연결 중입니다. 첫 실행은 1분 정도 걸릴 수 있습니다.');
    const token = ++this.generation;
    const connection = new RoomConnection((message) => { if (this.connection === connection) this.handleMessage(message); });
    this.connection = connection; this.mode = 'room';
    try {
      await connection.connect();
      if (token !== this.generation || this.destroyed) { connection.close(); return; }
      connection.send(code ? { type: 'join', code } : { type: 'create', gameMode: this.gameMode });
    } catch (error) {
      if (token !== this.generation || this.destroyed) return;
      this.connection = null; connection.close(); this.renderLobby();
      this.notice(error instanceof Error ? error.message : '방에 연결하지 못했습니다. 다시 시도하세요.');
    }
  }
  private handleMessage(message: RoomMessage) {
    if (message.type === 'error') {
      if (this.phase === 'lobby') { this.exitConnection(false); this.renderLobby(); }
      this.notice(message.message); return;
    }
    if (message.type === 'closed') { this.returnLobby(false); this.notice(message.message); return; }
    if (message.type === 'battle') {
      if (this.mode === 'room' && !this.presentation.push(message.state, performance.now())) return;
      this.state = message.state;
      this.gameMode = message.state.gameMode;
      if (this.state.result) { if (this.phase !== 'result') this.renderResult(); }
      else if (this.phase !== 'battle') this.renderBattle();
      return;
    }
    this.room = message; this.side = message.side; this.gameMode = message.gameMode; this.environment = { map: message.map, weather: message.weather };
    this.deck = [...message.deck]; this.ready = message.ready; this.opponentReady = message.opponentReady; this.pending = false;
    if (message.phase === 'waiting') {
      if (this.phase !== 'waiting') { this.state = null; this.presentation.reset(); this.renderWaiting(); } else this.syncWaiting();
    } else if (message.phase === 'battle' && this.phase !== 'battle' && !this.state?.result) this.renderBattle();
    else if (message.phase === 'result' && this.phase === 'result') this.syncResult();
  }

  private renderWaiting() {
    this.clearScreen(); this.phase = 'waiting'; this.status.textContent = '유닛을 선택하고 준비를 완료하세요.';
    this.screen.innerHTML = `<section class="waiting screen-content" aria-labelledby="deck-title">
      <div class="screen-heading"><button class="text-button" data-action="leave" type="button" aria-label="대기방을 나가 로비로 돌아가기">← 로비</button><span class="eyebrow">${GAME_MODES[this.gameMode].name}</span></div>
      <div class="deck-title-row"><div><h1 id="deck-title">전투를 준비하세요</h1><p>${spRules(this.gameMode)}</p></div><div class="timer-pill"><span id="deck-timer">30</span><small>초</small></div></div>
      <div class="environment-card"><span class="environment-symbol" aria-hidden="true">${WEATHER[this.environment.weather].icon}</span><div><strong>${MAPS[this.environment.map].name} <span>· ${WEATHER[this.environment.weather].name}</span></strong><p class="map-gimmick">${MAPS[this.environment.map].gimmickDescription}</p><p>${WEATHER[this.environment.weather].description}</p></div></div>
      ${this.mode === 'room' ? `<div class="invite-row"><span>초대 코드</span><button class="code-button" data-action="copy" type="button" aria-label="초대 코드 복사">${escape(this.room!.code)} <small>복사</small></button></div>` : ''}
      <div class="selection-label"><strong>나의 덱 <span id="deck-count">0 / 5</span></strong><span>상대 덱은 비공개</span></div><div class="deck-slots" id="deck-slots" aria-label="선택한 다섯 유닛"></div>
      <div class="catalog-heading"><span>유닛 선택 <small>↕ 스크롤</small></span><span>선택한 유닛을 누르면 제외</span></div>
      <div class="unit-catalog" aria-label="선택 가능한 유닛">${UNIT_IDS.map((id) => {
        const unit = UNITS[id];
        return `<button class="unit-option" type="button" data-unit="${id}" aria-pressed="false" aria-label="${unit.name}, ${unit.cost} SP, 체력 ${unit.hp}, 공격력 ${unit.attack}. 선택"><span class="unit-symbol" aria-hidden="true">${unit.icon}</span><span class="unit-option-copy"><strong>${unit.name}</strong><small>체력 ${unit.hp} <span>·</span> 공격 ${unit.attack}</small></span><span class="unit-cost">${unit.cost}<small>SP</small></span><span class="selected-check" aria-hidden="true">✓</span></button>`;
      }).join('')}</div><div class="unit-detail" id="unit-detail"></div>
      <div class="waiting-footer"><div class="ready-states"><span id="own-ready"></span><span id="opponent-ready"></span></div><button class="button primary" id="ready-button" type="button" data-action="ready">준비 완료 <span aria-hidden="true">→</span></button><p class="tiny muted" id="ready-help">하나 이상 선택하면 준비할 수 있어요. 빈 슬롯은 자동으로 채워집니다.</p></div>
    </section>`;
    this.listen('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!target) return;
      const unit = target.dataset.unit as UnitId | undefined; if (unit) { this.toggleUnit(unit); return; }
      if (target.dataset.action === 'leave') this.returnLobby();
      else if (target.dataset.action === 'ready') this.toggleReady();
      else if (target.dataset.action === 'copy' && this.room) {
        if (navigator.clipboard) void navigator.clipboard.writeText(this.room.code).then(() => this.notice('초대 코드를 복사했습니다. 친구에게 알려주세요.')).catch(() => this.notice(`초대 코드: ${this.room?.code ?? ''}`));
        else this.notice(`초대 코드: ${this.room.code}`);
      }
    });
    this.syncWaiting();
  }
  private toggleUnit(id: UnitId) {
    this.detail = id;
    if (this.ready) { this.notice('준비 중에는 덱을 바꿀 수 없습니다.'); return; }
    if (this.deck.includes(id)) this.deck = this.deck.filter((unit) => unit !== id);
    else if (this.deck.length < DECK_SIZE) this.deck.push(id);
    else { this.notice('다섯 유닛을 모두 선택했습니다. 먼저 한 유닛을 제외하세요.'); this.syncWaiting(); return; }
    if (this.mode === 'room') this.connection?.send({ type: 'deck', deck: this.deck });
    this.syncWaiting();
  }
  private toggleReady() {
    if (!this.deck.length || (this.ready && this.opponentReady)) return;
    if (this.mode === 'room') this.connection?.send({ type: 'ready', ready: !this.ready });
    else { this.ready = !this.ready; this.syncWaiting(); }
  }
  private syncWaiting() {
    if (this.phase !== 'waiting') return;
    const remaining = this.mode === 'room' ? this.room?.remaining ?? null : Math.max(0, (this.deadline - Date.now()) / 1000);
    this.text('#deck-timer', remaining === null ? '—' : Math.ceil(remaining).toString()); this.text('#deck-count', `${this.deck.length} / ${DECK_SIZE}`);
    const slots = this.screen.querySelector<HTMLElement>('#deck-slots')!;
    const contents = Array.from({ length: DECK_SIZE }, (_, index) => {
      const id = this.deck[index];
      return id ? `<button class="deck-slot filled" data-unit="${id}" type="button" ${this.ready ? 'disabled' : ''} aria-label="${UNITS[id].name} 제외"><span>${UNITS[id].icon}</span><small>${UNITS[id].name}</small></button>` : `<div class="deck-slot empty"><span>＋</span><small>${index + 1}</small></div>`;
    }).join('');
    const signature = `${this.ready}:${this.deck.join(',')}`;
    if (slots.dataset.signature !== signature) { slots.innerHTML = contents; slots.dataset.signature = signature; }
    this.screen.querySelectorAll<HTMLButtonElement>('.unit-option').forEach((button) => {
      const id = button.dataset.unit as UnitId; const selected = this.deck.includes(id);
      button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); button.disabled = this.ready;
    });
    const unit = UNITS[this.detail]; const detail = this.screen.querySelector<HTMLElement>('#unit-detail')!;
    const detailHtml = `<span class="detail-icon" aria-hidden="true">${unit.icon}</span><div><strong>${unit.name} <span>사거리 ${unit.range} U · ${unit.role}</span></strong><p>${unit.skillDescription}</p></div>`;
    if (detail.innerHTML !== detailHtml) detail.innerHTML = detailHtml;
    this.text('#own-ready', this.ready ? '● 나 · 준비 완료' : '○ 나 · 선택 중');
    const connected = this.mode === 'ai' || Boolean(this.room?.opponentConnected);
    this.text('#opponent-ready', !connected ? '○ 상대 입장 대기' : this.opponentReady ? '● 상대 · 준비 완료' : `○ ${this.mode === 'ai' ? 'AI' : '상대'} · 선택 중`);
    const button = this.screen.querySelector<HTMLButtonElement>('#ready-button')!;
    button.disabled = !this.deck.length || (this.ready && this.opponentReady);
    const label = this.ready ? '준비 취소' : '준비 완료';
    if (button.textContent?.trim() !== `${label} →`) button.innerHTML = `${label} <span aria-hidden="true">→</span>`;
    button.classList.toggle('is-ready', this.ready);
    this.text('#ready-help', !connected ? '친구가 입장하면 30초 동안 덱을 선택합니다.' : this.ready ? '상대도 준비하면 바로 시작합니다. 남은 슬롯은 자동 선택됩니다.' : '하나 이상 선택하면 준비할 수 있어요. 빈 슬롯은 자동으로 채워집니다.');
  }

  private startLocalBattle() {
    this.deck = completeDeck(this.deck);
    this.simulation = new Simulation({ ...this.environment, gameMode: this.gameMode, decks: { player: this.deck, enemy: completeDeck(['warrior', 'archer', 'hunter']) }, aiSides: ['enemy'], seed: Date.now() });
    this.state = this.simulation.state; this.accumulator = 0; this.previous = 0; this.renderBattle();
  }
  private renderBattle() {
    this.clearScreen(); this.phase = 'battle'; const map = MAPS[this.environment.map]; const weather = WEATHER[this.environment.weather];
    this.status.textContent = '전투 시작. 카드를 누르거나 전장 아래쪽으로 드래그해 소환하세요.';
    this.screen.innerHTML = `<section class="battle screen-content" aria-label="성채 공방전 ${GAME_MODES[this.gameMode].name}">
      <div class="battle-heading"><div><span class="live-dot"></span><strong>${map.name}</strong><span>${weather.icon} ${weather.name}</span></div><strong class="match-timer" id="match-timer">05:00</strong><button class="text-button exit-button" data-action="leave" type="button" title="전투에서 나가면 패배합니다">나가기</button></div>
      <p class="battle-map-gimmick">${GAME_MODES[this.gameMode].name} · ${killSpRule(this.gameMode)} · ${map.gimmickDescription}</p>
      <div class="fort-hud"><div class="fort-tile own"><div><span>♜ 나의 성채</span><strong id="own-hp">1,000</strong></div><div class="hp-track"><span id="own-hp-bar"></span></div></div><span class="versus">VS</span><div class="fort-tile enemy"><div><span>상대 성채 ♜</span><strong id="enemy-hp">1,000</strong></div><div class="hp-track"><span id="enemy-hp-bar"></span></div></div></div>
      <div class="battle-arena"><div id="game" role="img" aria-label="자동 전투 전장. 내 유닛은 아래에서 위로 전진합니다."></div><div class="wave-pill" id="wave-info">첫 웨이브 준비 중</div><div class="boss-alert" id="boss-alert" role="status"></div></div>
      <div class="battle-footer"><div class="resource-row"><div class="sp-label"><span class="sp-gem" aria-hidden="true">◆</span><strong id="sp-value">${GAME_MODES[this.gameMode].initialSp}</strong><span>/ ${SP_MAX} SP</span></div><div class="sp-track"><span id="sp-bar"></span></div><span class="regen-label">${spRecovery(this.gameMode)}</span></div><div class="battle-hand">${this.deck.map((id) => `<button class="battle-card" type="button" data-summon="${id}" aria-label="${UNITS[id].name} 소환, ${UNITS[id].cost} SP"><span class="battle-card-cost">${UNITS[id].cost}</span><span class="battle-card-icon" aria-hidden="true">${UNITS[id].icon}</span><strong>${UNITS[id].name}</strong></button>`).join('')}</div><p class="battle-instruction" id="battle-instruction">눌러서 소환 · 아래쪽 전장으로 드래그해 위치 지정</p></div>
    </section>`;
    this.scene = new BattleScene(
      () => this.state, () => this.side,
      this.mode === 'room' ? () => this.presentation.sample(performance.now()) : undefined,
    );
    this.game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', backgroundColor: '#e6decd', scale: { mode: Phaser.Scale.NONE, ...GAME_SIZE }, scene: [this.scene], render: { antialias: true } });
    this.listen('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button) return;
      if (button.dataset.action === 'leave') { this.returnLobby(); return; }
      if ((event as MouseEvent).detail === 0 && button.dataset.summon) this.summon(button.dataset.summon as UnitId);
    });
    this.listen('pointerdown', (event) => this.pointerDown(event as PointerEvent));
    this.listen('pointermove', (event) => this.pointerMove(event as PointerEvent));
    this.listen('pointerup', (event) => this.pointerUp(event as PointerEvent));
    this.listen('pointercancel', () => this.cancelDrag()); this.listen('lostpointercapture', () => this.cancelDrag()); this.paintBattle();
  }
  private pointerDown(event: PointerEvent) {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-summon]');
    if (!button || button.disabled || this.drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); button.setPointerCapture(event.pointerId); button.classList.add('holding');
    this.drag = { pointer: event.pointerId, unit: button.dataset.summon as UnitId, x: event.clientX, y: event.clientY, moved: false, button };
  }
  private validPosition(position: Position | null): position is Position {
    if (!position || position.x < 0 || position.x > 12 || position.y < 0 || position.y > 20 || (this.side === 'player' ? position.y < 10 : position.y > 10)) return false;
    return !this.state || Object.values(this.state.forts).every((fort) => Math.hypot(position.x - fort.x, position.y - fort.y) >= FORT_RADIUS + PLAYER_RADIUS);
  }
  private pointerMove(event: PointerEvent) {
    const drag = this.drag; if (!drag || event.pointerId !== drag.pointer) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8) drag.moved = true;
    if (!drag.moved) return;
    event.preventDefault(); const position = this.scene?.screenToWorld(event.clientX, event.clientY) ?? null; const valid = this.validPosition(position);
    this.scene?.setPreview(position, valid, UNITS[drag.unit].icon);
    this.text('#battle-instruction', valid ? `${UNITS[drag.unit].name} · 손을 떼면 이 위치에 소환` : '아래쪽 아군 영역으로 옮겨주세요');
  }
  private pointerUp(event: PointerEvent) {
    const drag = this.drag; if (!drag || drag.pointer !== event.pointerId) return;
    const position = drag.moved ? this.scene?.screenToWorld(event.clientX, event.clientY) ?? null : undefined;
    this.cancelDrag();
    if (drag.moved && !this.validPosition(position ?? null)) { this.notice('아군 영역 안에서 손을 떼세요. SP는 사용되지 않았습니다.'); return; }
    this.summon(drag.unit, position ?? undefined);
  }
  private cancelDrag() {
    this.drag?.button.classList.remove('holding'); this.drag = null; this.scene?.setPreview(null, false);
    this.text('#battle-instruction', '눌러서 소환 · 아래쪽 전장으로 드래그해 위치 지정');
  }
  private summon(unit: UnitId, position?: Position) {
    if (this.phase !== 'battle' || !this.state || this.state.result) return;
    if (this.state.sp[this.side] < UNITS[unit].cost) { this.notice(`${UNITS[unit].name} 소환에는 ${UNITS[unit].cost} SP가 필요합니다.`); return; }
    if (this.mode === 'room') this.connection?.send({ type: 'summon', unitId: unit, position });
    else if (!this.simulation?.summon(this.side, unit, position)) { this.notice('이 위치에는 소환할 수 없습니다. SP는 사용되지 않았습니다.'); return; }
    this.status.textContent = `${UNITS[unit].name} 소환${position ? ', 지정한 위치' : ', 성채 앞'}.`; this.paintBattle();
  }
  private paintBattle() {
    const state = this.state; if (this.phase !== 'battle' || !state) return;
    const own = state.forts[this.side]; const enemy = state.forts[other(this.side)];
    this.text('#match-timer', clock(MATCH_DURATION - state.time)); this.text('#own-hp', Math.ceil(Math.max(0, own.hp)).toLocaleString('ko-KR')); this.text('#enemy-hp', Math.ceil(Math.max(0, enemy.hp)).toLocaleString('ko-KR'));
    this.screen.querySelector<HTMLElement>('#own-hp-bar')!.style.width = `${Math.max(0, own.hp / own.maxHp) * 100}%`;
    this.screen.querySelector<HTMLElement>('#enemy-hp-bar')!.style.width = `${Math.max(0, enemy.hp / enemy.maxHp) * 100}%`;
    const sp = state.sp[this.side]; this.text('#sp-value', Math.floor(sp).toString()); this.screen.querySelector<HTMLElement>('#sp-bar')!.style.width = `${sp / SP_MAX * 100}%`;
    this.screen.querySelectorAll<HTMLButtonElement>('[data-summon]').forEach((button) => {
      const unit = UNITS[button.dataset.summon as UnitId]; button.disabled = sp < unit.cost;
      button.setAttribute('aria-label', `${unit.name} 소환, ${unit.cost} SP${button.disabled ? ', SP 부족' : ''}`);
    });
    this.text('#wave-info', state.wave ? `WAVE ${state.wave.toString().padStart(2, '0')}` : '첫 웨이브 준비 중');
    const warning = state.warnings.length > 0; const alert = this.screen.querySelector<HTMLElement>('#boss-alert')!; alert.classList.toggle('active', warning);
    if (warning && !alert.textContent) alert.textContent = '⚠ 중립 보스가 곧 등장합니다'; if (!warning) alert.textContent = '';
  }

  private renderResult() {
    if (!this.state?.result) return;
    this.clearScreen(); this.phase = 'result'; const result = this.state.result;
    const draw = result.winner === 'draw'; const won = result.winner === this.side;
    const title = draw ? '무승부' : won ? '승리했습니다' : '패배했습니다';
    const subtitle = draw ? '두 성채가 팽팽하게 맞섰습니다.' : won ? '당신의 전략이 전장을 바꿨습니다.' : '새로운 덱으로 다시 도전해 보세요.';
    const own = this.state.forts[this.side]; const opponent = this.state.forts[other(this.side)];
    const reason = resultReason(result.reason);
    this.status.textContent = `${draw ? '무승부' : won ? '승리' : '패배'}. ${reason}`;
    this.screen.innerHTML = `<section class="result screen-content ${won ? 'win' : draw ? 'draw' : 'loss'}" aria-labelledby="result-title"><p class="eyebrow">${GAME_MODES[this.gameMode].name} · BATTLE COMPLETE</p><div class="result-emblem" aria-hidden="true">${won ? '♜' : draw ? '⚔' : '⚑'}</div><span class="result-label">${draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT'}</span><h1 id="result-title">${title}</h1><p class="result-subtitle">${subtitle}</p>
      <div class="result-score"><div><span>나의 성채</span><strong>${Math.ceil(Math.max(0, own.hp)).toLocaleString('ko-KR')}</strong><small>남은 체력</small></div><span class="versus">VS</span><div><span>상대 성채</span><strong>${Math.ceil(Math.max(0, opponent.hp)).toLocaleString('ko-KR')}</strong><small>남은 체력</small></div></div>
      <div class="result-meta"><span>${MAPS[this.environment.map].name} · ${WEATHER[this.environment.weather].name}</span><span>${clock(this.state.time)} 플레이</span></div><p class="result-reason">${escape(reason)}</p><div class="result-deck">${this.deck.map((id) => `<span title="${UNITS[id].name}">${UNITS[id].icon}</span>`).join('')}</div>
      <div class="result-actions"><button class="button primary" type="button" id="rematch-button" data-action="rematch">다시 대전 <span aria-hidden="true">↻</span></button><button class="button secondary" type="button" data-action="leave">로비로 돌아가기 <span aria-hidden="true">→</span></button><p class="tiny muted" id="rematch-status">새로운 맵과 날씨에서 덱을 다시 선택합니다.</p></div></section>`;
    this.listen('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
      if (button?.dataset.action === 'leave') this.returnLobby();
      else if (button?.dataset.action === 'rematch') {
        if (this.mode === 'ai') this.startAI();
        else { this.connection?.send({ type: 'rematch' }); button.disabled = true; this.text('#rematch-status', '상대의 재대전 신청을 기다리는 중입니다.'); }
      }
    }); this.syncResult();
  }
  private syncResult() {
    if (this.phase !== 'result' || this.mode !== 'room' || !this.room) return;
    const button = this.screen.querySelector<HTMLButtonElement>('#rematch-button')!; button.disabled = this.room.rematchRequested;
    if (this.room.rematchRequested) this.text('#rematch-status', '상대의 재대전 신청을 기다리는 중입니다.');
    else if (this.room.opponentRematchRequested) this.text('#rematch-status', '상대가 다시 대전하고 싶어 합니다. 신청하면 바로 덱 선택으로 이동합니다.');
  }
  private exitConnection(sendLeave = true) {
    this.presentation.reset();
    const connection = this.connection; this.connection = null;
    if (sendLeave) connection?.send({ type: 'leave' }); connection?.close();
    if (this.phase === 'battle') this.simulation?.surrender(this.side);
  }
  private returnLobby(sendLeave = true) {
    ++this.generation; this.exitConnection(sendLeave); this.simulation = null; this.state = null; this.room = null; this.deck = []; this.ready = false; this.opponentReady = false; this.renderLobby();
  }
  private frame = (now: number) => {
    if (this.destroyed) return;
    let delta = this.previous ? Math.min(Math.max(0, (now - this.previous) / 1000), MATCH_DURATION) : 0; this.previous = now;
    if (this.phase === 'waiting' && this.mode === 'ai') {
      if (!this.opponentReady && now - this.waitingStarted >= 1500) { this.opponentReady = true; this.syncWaiting(); }
      if ((this.ready && this.opponentReady) || Date.now() >= this.deadline) {
        this.startLocalBattle();
        this.previous = now;
        delta = 0; // Preparation time must never advance a newly created battle.
      }
    }
    if (this.phase === 'battle' && this.simulation) {
      this.accumulator += Math.min(delta, Math.max(0, MATCH_DURATION - this.simulation.state.time));
      while (this.accumulator >= 0.05 && !this.simulation.state.result) { this.simulation.update(0.05); this.accumulator -= 0.05; }
      this.state = this.simulation.state; if (this.state.result) this.renderResult();
    }
    if (now - this.lastPaint >= 100) { if (this.phase === 'waiting') this.syncWaiting(); else if (this.phase === 'battle') this.paintBattle(); this.lastPaint = now; }
    this.raf = requestAnimationFrame(this.frame);
  };
  destroy() {
    this.destroyed = true; cancelAnimationFrame(this.raf); this.screenEvents.abort(); this.globalEvents.abort();
    if (this.toastTimer) clearTimeout(this.toastTimer); this.exitConnection(); this.destroyGame();
  }
}
