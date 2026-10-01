import {
  UNITS, MAPS, WEATHER, resolveModeRules, MATCH_DURATION,
  FORT_HP, WAVE_FIRST, WAVE_INTERVAL, WAVE_GROWTH, PROJECTILE_SPEED,
  PLAYER_RADIUS, MONSTER_RADIUS, BOSS_RADIUS, FORT_RADIUS,
  SKILLS, BASIC_ATTACK_SHAPES, STATUS, completeDeck,
} from './data.ts';
import type { Side, UnitId, GameModeId, MapId, WeatherId, MonsterDefinition } from './data.ts';
import type { ModeRules, ModeRulesOverride, RewardRule, AreaWeaponRule } from './mode-settings.ts';
import { getLaneRoutes, nearestLane, pointOnLane, projectToLane } from './lanes.ts';
import type { LaneRoute } from './lanes.ts';
export type { Side, UnitId, GameModeId, MapId, WeatherId } from './data.ts';

export const ARENA_WIDTH = 12;
export const ARENA_HEIGHT = 20;
export const FIXED_STEP = 1 / 30;
const EPS = 1e-7;
const SIDES: Side[] = ['player', 'enemy'];
type EntitySide = Side | 'neutral';
type TargetId = number | `fort:${Side}`;
interface Point { x: number; y: number }
interface Burn { sourceSide: EntitySide; damage: number; expiresAt: number; nextTickAt: number; canDamageBox?: boolean }
interface Charge { x: number; y: number; remaining: number; hits: TargetId[] }
interface Knockback { x: number; y: number; remaining: number; laneVelocity?: number }

export interface Fort extends Point {
  hp: number; maxHp: number; burn: Burn | null; iceDamageAt: number;
  catapultReadyAt: number; oilReadyAt: number;
}
export interface StructureEntity extends Point {
  id: number; kind: 'tower' | 'sp-box'; side: EntitySide; lane: number | null;
  hp: number; maxHp: number; radius: number; interactionRadius: number;
  attackReadyAt: number; burn: Burn | null; iceDamageAt: number;
}
export interface UnitEntity extends Point {
  id: number; side: EntitySide; unitId?: UnitId; name: string; icon: string;
  kind: 'summoned' | 'neutral' | 'minion'; elite: boolean;
  lane: number | null; laneProgress: number; laneEntering: boolean;
  hp: number; maxHp: number; radius: number; boss: boolean;
  facingX: number; facingY: number; hiddenUntil: number; stunUntil: number; buffUntil: number;
  targetSide: Side; target: TargetId | null; attack: number; speed: number;
  detection: number; range: number; attackInterval: number; reward: number;
  attackReadyAt: number; skillReadyAt: number; burn: Burn | null;
  charge: Charge | null; knockback: Knockback | null; iceDamageAt: number;
}
export interface Projectile extends Point {
  id: number; side: EntitySide; sourceId: number; target: TargetId;
  sourceX: number; sourceY: number;
  targetX: number; targetY: number; damage: number; radius: number;
  burn: boolean; stagger: number; knockback: number;
  lane: number | null; canDamageBox: boolean;
  unitsOnly?: boolean;
}
export interface IceZone extends Point {
  id: number; side: Side; radius: number; expiresAt: number; nextTickAt: number;
  lane: number | null;
}
export interface Effect extends Point { kind: string; expiresAt: number; side?: EntitySide; radius?: number }
export interface BossWarning extends Point { spawnAt: number; targetSide: Side }
export interface BattleState {
  time: number; gameMode: GameModeId; map: MapId; weather: WeatherId; decks: Record<Side, UnitId[]>;
  sp: Record<Side, number>; forts: Record<Side, Fort>; units: UnitEntity[];
  rules: ModeRules; structures: StructureEntity[];
  projectiles: Projectile[]; zones: IceZone[]; effects: Effect[];
  wave: number; warnings: BossWarning[];
  result: null | { winner: Side | 'draw'; reason: string };
}
export interface SimulationOptions {
  map: MapId; weather: WeatherId; decks: Record<Side, UnitId[]>;
  gameMode?: GameModeId; aiSides?: Side[]; seed?: number;
  rules?: ModeRulesOverride;
}
interface Target extends Point { id: TargetId; side: EntitySide; hp: number; unit?: UnitEntity; fort?: Fort; structure?: StructureEntity }

const opposite = (side: Side): Side => side === 'player' ? 'enemy' : 'player';
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function direction(a: Point, b: Point): Point {
  const length = distance(a, b);
  return length > EPS ? { x: (b.x - a.x) / length, y: (b.y - a.y) / length } : { x: 0, y: -1 };
}

/** Browser-independent, deterministic combat. Only the authority advances this instance. */
export class Simulation {
  readonly state: BattleState;
  private accumulator = 0;
  private nextId = 1;
  private randomState: number;
  private aiSides: Side[];
  private aiNext: Record<Side, number> = { player: 0, enemy: 0 };
  private aiSummons: Record<Side, number> = { player: 0, enemy: 0 };
  private routes: LaneRoute[];
  private boxRespawns: { at: number; position: Point }[] = [];

  constructor(options: SimulationOptions) {
    this.randomState = (options.seed ?? 123456789) >>> 0;
    this.aiSides = options.aiSides ?? [];
    const gameMode = options.gameMode ?? 'standard';
    const rules = resolveModeRules(gameMode, options.rules);
    this.routes = getLaneRoutes(rules.lanes.count);
    const makeFort = (y: number): Fort => ({ x: 6, y, hp: FORT_HP, maxHp: FORT_HP, burn: null, iceDamageAt: -100, catapultReadyAt: 0, oilReadyAt: 0 });
    this.state = {
      time: 0, gameMode, map: options.map, weather: options.weather,
      decks: { player: completeDeck(options.decks.player, () => this.random()), enemy: completeDeck(options.decks.enemy, () => this.random()) },
      sp: { player: rules.sp.initial, enemy: rules.sp.initial },
      rules, structures: [],
      forts: { player: makeFort(19), enemy: makeFort(1) }, units: [], projectiles: [],
      zones: [], effects: [], wave: 0, warnings: [], result: null,
    };
    this.createStructures();
  }

  snapshot(): BattleState { return structuredClone(this.state); }

  summon(side: Side, unitId: UnitId, position?: Point): boolean {
    const definition = UNITS[unitId];
    if (this.state.result || !definition || !this.state.decks[side].includes(unitId)) return false;
    if (this.state.sp[side] + EPS < definition.cost) return false;
    const fort = this.state.forts[side];
    const point = position ?? { x: fort.x, y: fort.y + (side === 'player' ? -1.4 : 1.4) };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    if (point.x < 0 || point.x > ARENA_WIDTH || point.y < 0 || point.y > ARENA_HEIGHT) return false;
    if (side === 'player' ? point.y < ARENA_HEIGHT / 2 : point.y > ARENA_HEIGHT / 2) return false;
    if (SIDES.some((fortSide) => distance(point, this.state.forts[fortSide]) < FORT_RADIUS + PLAYER_RADIUS)) return false;
    if (this.state.structures.some((structure) => structure.hp > 0 && distance(point, structure) < structure.radius + PLAYER_RADIUS)) return false;
    this.state.sp[side] = Math.max(0, this.state.sp[side] - definition.cost);
    const unit = this.createUnit(side, opposite(side), point, definition, false);
    unit.unitId = unitId;
    unit.kind = 'summoned';
    unit.icon = definition.icon;
    unit.skillReadyAt = this.state.time + definition.skillCooldown;
    if (this.state.rules.lanes.count > 0) {
      const lane = position ? nearestLane(this.routes, point).lane : this.leastPopulatedLane(side);
      this.assignLane(unit, lane);
    }
    this.state.units.push(unit);
    this.effect(point, 'summon', 0.45, side);
    return true;
  }

  surrender(side: Side): void {
    if (!this.state.result) this.finish(opposite(side), 'surrender');
  }

  update(dt: number): void {
    if (this.state.result || !Number.isFinite(dt) || dt <= 0) return;
    this.accumulator += dt;
    while (this.accumulator + EPS >= FIXED_STEP && !this.state.result) {
      this.accumulator -= FIXED_STEP;
      this.step(FIXED_STEP);
    }
    if (this.accumulator < 0) this.accumulator = 0;
  }

  private random(): number {
    this.randomState = (Math.imul(1664525, this.randomState) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }

  private createUnit(side: EntitySide, targetSide: Side, position: Point, definition: MonsterDefinition, boss: boolean): UnitEntity {
    const heading = direction(position, this.state.forts[targetSide]);
    return {
      id: this.nextId++, side, targetSide, x: position.x, y: position.y,
      kind: side === 'neutral' ? 'neutral' : 'summoned', elite: false,
      lane: null, laneProgress: 0, laneEntering: false,
      name: definition.name, icon: definition.icon ?? '·', hp: definition.hp, maxHp: definition.hp,
      radius: side !== 'neutral' ? PLAYER_RADIUS : boss ? BOSS_RADIUS : MONSTER_RADIUS,
      boss, facingX: heading.x, facingY: heading.y,
      hiddenUntil: 0, stunUntil: 0, buffUntil: 0, target: null,
      attack: definition.attack, speed: definition.speed, detection: definition.detection,
      range: definition.range, attackInterval: definition.attackInterval, reward: definition.reward,
      attackReadyAt: this.state.time, skillReadyAt: Number.MAX_SAFE_INTEGER,
      burn: null, charge: null, knockback: null, iceDamageAt: -100,
    };
  }

  private step(dt: number): void {
    this.state.time = Math.min(MATCH_DURATION, Math.round((this.state.time + dt) / FIXED_STEP) * FIXED_STEP);
    const now = this.state.time;
    const sp = this.state.rules.sp;
    // The maximum stops passive income; rewards above it remain available to spend.
    if (sp.passive.enabled && sp.passive.amount > 0) for (const side of SIDES) {
      if (this.state.sp[side] < sp.maximum) this.state.sp[side] = Math.min(sp.maximum, this.state.sp[side] + sp.passive.amount * dt);
    }
    this.spawnWaves();
    for (const side of this.aiSides) this.updateAI(side);
    this.updatePersistentEffects();
    this.updateStructureAttacks();
    // Creation order is the stable tie-breaker for attacks and simultaneous last hits.
    for (const unit of this.state.units) if (unit.hp > 0) this.updateUnit(unit, dt);
    this.updateProjectiles(dt);
    this.state.units = this.state.units.filter((unit) => unit.hp > 0);
    this.state.structures = this.state.structures.filter((structure) => structure.hp > 0);
    this.boxRespawns = this.boxRespawns.filter((respawn) => {
      if (now < respawn.at - EPS) return true;
      this.createBox(respawn.position);
      return false;
    });
    this.state.zones = this.state.zones.filter((zone) => zone.expiresAt > now + EPS);
    this.state.effects = this.state.effects.filter((effect) => effect.expiresAt > now);
    const playerDead = this.state.forts.player.hp <= 0;
    const enemyDead = this.state.forts.enemy.hp <= 0;
    if (playerDead || enemyDead) this.finish(playerDead && enemyDead ? 'draw' : playerDead ? 'enemy' : 'player', 'fort-destroyed');
    else if (now >= MATCH_DURATION - EPS) {
      const difference = this.state.forts.player.hp - this.state.forts.enemy.hp;
      this.finish(difference === 0 ? 'draw' : difference > 0 ? 'player' : 'enemy', 'timeout');
    }
  }

  private finish(winner: Side | 'draw', reason: string): void {
    this.state.result = { winner, reason };
    this.state.warnings = [];
  }

  private spawnWaves(): void {
    const now = this.state.time;
    const wave = this.state.wave + 1;
    const spawnAt = WAVE_FIRST + (wave - 1) * WAVE_INTERVAL;
    if (this.state.rules.neutralWaves.enabled && wave % 5 === 0 && now >= spawnAt - 3 - EPS && !this.state.warnings.length) {
      this.state.warnings = SIDES.map((targetSide) => ({ x: this.random() < 0.5 ? 0.65 : 11.35, y: targetSide === 'player' ? 10.35 : 9.65, spawnAt, targetSide }));
    }
    if (now < spawnAt - EPS || spawnAt > MATCH_DURATION) return;
    const map = MAPS[this.state.map];
    const multiplier = WAVE_GROWTH ** (wave - 1);
    const grow = (definition: MonsterDefinition) => ({ ...definition, hp: definition.hp * multiplier, attack: definition.attack * multiplier });
    const neutralCount = this.state.rules.neutralWaves.count ?? map.monstersPerSpawnPoint;
    if (this.state.rules.neutralWaves.enabled) for (const targetSide of SIDES) for (const x of [0.6, 11.4]) for (let index = 0; index < neutralCount; index++) {
      // Extra monsters extend into their destination half, keeping every body off the center line.
      const point = { x: x + (x < 6 ? 1 : -1) * index * 0.28, y: ARENA_HEIGHT / 2 + (targetSide === 'player' ? 1 : -1) * (0.18 + index * 0.12) };
      const unit = this.createUnit('neutral', targetSide, point, grow(map.monster), false);
      if (this.state.rules.lanes.count > 0) this.assignLane(unit, nearestLane(this.routes, point).lane);
      this.state.units.push(unit);
    }
    for (const warning of this.state.warnings) {
      const unit = this.createUnit('neutral', warning.targetSide, warning, grow(map.boss), true);
      if (this.state.rules.lanes.count > 0) this.assignLane(unit, nearestLane(this.routes, warning).lane);
      this.state.units.push(unit);
    }
    if (this.state.rules.minions.enabled) this.spawnMinions(wave);
    this.state.warnings = [];
    this.state.wave = wave;
  }

  private leastPopulatedLane(side: Side): number {
    const counts = this.routes.map((route) => this.state.units.filter((unit) => unit.hp > 0 && unit.side === side && unit.lane === route.id).length);
    return counts.indexOf(Math.min(...counts));
  }

  private assignLane(unit: UnitEntity, lane: number): void {
    const projection = projectToLane(this.routes[lane], unit);
    unit.lane = lane; unit.laneProgress = projection.progress; unit.laneEntering = projection.distance > EPS;
    const facing = pointOnLane(this.routes[lane], projection.progress + (unit.targetSide === 'enemy' ? 0.1 : -0.1));
    const heading = direction(projection, facing);
    unit.facingX = heading.x; unit.facingY = heading.y;
  }

  private spawnMinions(wave: number): void {
    const rules = this.state.rules.minions;
    for (const side of SIDES) for (const route of this.routes) {
      const eliteWave = wave % rules.eliteEvery === 0;
      for (let index = 0; index < rules.perLane + (eliteWave ? 1 : 0); index++) {
        const elite = index === rules.perLane;
        const definition = elite ? MAPS.road.boss : MAPS.road.monster;
        const progress = side === 'player' ? 0 : route.length;
        const unit = this.createUnit(side, opposite(side), pointOnLane(route, progress), { ...definition, hp: definition.hp * rules.statMultiplier, attack: definition.attack * rules.statMultiplier }, false);
        unit.kind = 'minion'; unit.elite = elite; unit.icon = elite ? '♟' : '·';
        unit.name = elite ? '성채 엘리트' : '성채 미니언';
        if (this.state.rules.lanes.count > 0) { unit.lane = route.id; unit.laneProgress = progress; }
        this.state.units.push(unit);
      }
    }
  }

  private createStructures(): void {
    const rules = this.state.rules.towers;
    const towerRoutes = getLaneRoutes(rules.laneCount);
    if (rules.enabled) for (const side of SIDES) for (const route of towerRoutes) for (let index = 0; index < rules.count; index++) {
      // Multiple towers occupy the separated lane segment, clear of the shared
      // fort approach and of the center-line boxes. One tower keeps its old spot.
      const fromFort = rules.count === 1 ? route.length * rules.progress
        : route.cumulative[2] + (route.length / 2 - 1.5 - route.cumulative[2]) * index / (rules.count - 1);
      const progress = side === 'player' ? fromFort : route.length - fromFort;
      this.state.structures.push({ id: this.nextId++, kind: 'tower', side, lane: null, ...pointOnLane(route, progress), hp: rules.hp, maxHp: rules.hp, radius: rules.radius, interactionRadius: rules.radius, attackReadyAt: 0, burn: null, iceDamageAt: -100 });
    }
    if (this.state.rules.spBox.enabled) for (let index = 0; index < this.state.rules.spBox.count; index++) {
      const x = ARENA_WIDTH / 2 + (index - (this.state.rules.spBox.count - 1) / 2) * 4;
      this.createBox({ x, y: ARENA_HEIGHT / 2 });
    }
  }

  private createBox(position: Point): void {
    const rules = this.state.rules.spBox;
    this.state.structures.push({ id: this.nextId++, kind: 'sp-box', side: 'neutral', lane: null, ...position, hp: rules.hp, maxHp: rules.hp, radius: rules.radius, interactionRadius: rules.interactionRadius, attackReadyAt: 0, burn: null, iceDamageAt: -100 });
  }

  private updateStructureAttacks(): void {
    const now = this.state.time;
    const nearestTarget = (side: Side, origin: Point, range: number, lane: number | null) => this.targets(side, lane)
      .filter((target) => target.unit && this.visible(target) && distance(origin, target) <= range + this.targetRadius(target) + EPS)
      .sort((a, b) => distance(origin, a) - distance(origin, b) || Number(a.id) - Number(b.id))[0];
    const launch = (side: Side, origin: Point, sourceId: number, target: Target, damage: number, radius: number, lane: number | null) => {
      this.state.projectiles.push({ id: this.nextId++, side, sourceId, lane, canDamageBox: false, unitsOnly: true, ...origin, sourceX: origin.x, sourceY: origin.y, target: target.id, targetX: target.x, targetY: target.y, damage, radius, burn: false, stagger: 0, knockback: 0 });
    };
    for (const side of SIDES) {
      const fort = this.state.forts[side];
      if (fort.hp <= 0) continue;
      const attack = (weapon: AreaWeaponRule, key: 'catapultReadyAt' | 'oilReadyAt', kind: 'catapult' | 'oil') => {
        if (!weapon.enabled || fort[key] > now + EPS) return;
        const target = nearestTarget(side, fort, weapon.range, null);
        if (!target) return;
        fort[key] = now + weapon.interval;
        const lane = this.targetLane(target);
        if (kind === 'catapult') launch(side, fort, 0, target, weapon.damage, weapon.radius, lane);
        else for (const victim of this.targets(side, lane)) if (victim.unit && distance(fort, victim) <= weapon.radius + this.targetRadius(victim) + EPS) this.damage(victim, weapon.damage, side);
        this.effect(fort, kind, 0.4, side, kind === 'oil' ? weapon.radius : undefined);
      };
      attack(this.state.rules.fortAttacks.catapult, 'catapultReadyAt', 'catapult');
      attack(this.state.rules.fortAttacks.oil, 'oilReadyAt', 'oil');
    }
    const rules = this.state.rules.towers;
    for (const tower of this.state.structures) {
      if (tower.kind !== 'tower' || tower.hp <= 0 || tower.side === 'neutral' || tower.attackReadyAt > now + EPS) continue;
      const target = nearestTarget(tower.side, tower, rules.range, tower.lane);
      if (!target) continue;
      tower.attackReadyAt = now + rules.interval;
      launch(tower.side, tower, tower.id, target, rules.damage, 0, tower.lane);
      this.effect(tower, 'tower', 0.3, tower.side);
    }
  }

  private sameLane(a: number | null, b: number | null): boolean { return this.state.rules.lanes.count === 0 || a === null || b === null || a === b; }
  private targetLane(target: Target): number | null { return target.unit?.lane ?? target.structure?.lane ?? null; }
  private targetRadius(target: Target, interaction = false): number { return target.fort ? FORT_RADIUS : target.structure ? (interaction ? target.structure.interactionRadius : target.structure.radius) : 0; }
  private targetEntity(target: Target): UnitEntity | Fort | StructureEntity { return target.unit ?? target.fort ?? target.structure!; }

  private targets(side: EntitySide, lane: number | null = null, canDamageBox = false): Target[] {
    const targets: Target[] = [];
    for (const unit of this.state.units) if (unit.hp > 0 && unit.side !== side && !(side === 'neutral' && unit.side === 'neutral') && this.sameLane(lane, unit.lane)) {
      targets.push({ id: unit.id, side: unit.side, x: unit.x, y: unit.y, hp: unit.hp, unit });
    }
    for (const structure of this.state.structures) if (structure.hp > 0 && structure.side !== side && this.sameLane(lane, structure.lane) && (structure.kind !== 'sp-box' || canDamageBox)) {
      targets.push({ id: structure.id, side: structure.side, x: structure.x, y: structure.y, hp: structure.hp, structure });
    }
    for (const fortSide of SIDES) if (side !== fortSide && this.state.forts[fortSide].hp > 0) {
      const fort = this.state.forts[fortSide];
      targets.push({ id: `fort:${fortSide}`, side: fortSide, x: fort.x, y: fort.y, hp: fort.hp, fort });
    }
    return targets;
  }

  private resolve(id: TargetId): Target | null {
    if (typeof id === 'number') {
      const unit = this.state.units.find((candidate) => candidate.id === id && candidate.hp > 0);
      if (unit) return { id, side: unit.side, x: unit.x, y: unit.y, hp: unit.hp, unit };
      const structure = this.state.structures.find((candidate) => candidate.id === id && candidate.hp > 0);
      return structure ? { id, side: structure.side, x: structure.x, y: structure.y, hp: structure.hp, structure } : null;
    }
    const side = id.slice(5) as Side;
    const fort = this.state.forts[side];
    return fort.hp > 0 ? { id, side, x: fort.x, y: fort.y, hp: fort.hp, fort } : null;
  }

  private visible(target: Target): boolean { return !target.unit || target.unit.hiddenUntil <= this.state.time + EPS; }
  private inRange(unit: UnitEntity, target: Target): boolean { return this.sameLane(unit.lane, this.targetLane(target)) && distance(unit, target) <= unit.range + this.targetRadius(target, true) + EPS; }

  private acquire(unit: UnitEntity): Target | null {
    const detection = unit.detection * (unit.kind === 'neutral' ? 1 : WEATHER[this.state.weather].detectionMultiplier);
    let selected: Target | null = null;
    let nearest = Infinity;
    for (const target of this.targets(unit.side, unit.lane, unit.kind === 'summoned')) {
      if (target.fort || !this.visible(target)) continue;
      const length = distance(unit, target);
      if (length > detection + (target.structure?.kind === 'sp-box' ? target.structure.interactionRadius : 0) + EPS) continue;
      const vector = direction(unit, target);
      if (target.structure?.kind !== 'sp-box' && length > EPS && vector.x * unit.facingX + vector.y * unit.facingY < 0.5 - EPS) continue;
      if (length < nearest - EPS || (Math.abs(length - nearest) <= EPS && Number(target.id) < Number(selected?.id ?? Infinity))) {
        nearest = length; selected = target;
      }
    }
    if (selected) return selected;
    const fort = this.resolve(`fort:${unit.targetSide}`);
    return fort && this.inRange(unit, fort) ? fort : null;
  }

  private updateUnit(unit: UnitEntity, dt: number): void {
    const now = this.state.time;
    if (unit.knockback) {
      const move = Math.min(unit.knockback.remaining, dt);
      if (unit.knockback.laneVelocity !== undefined && unit.lane !== null) this.advanceOnLane(unit, unit.knockback.laneVelocity * move);
      else this.move(unit, unit.knockback.x * move, unit.knockback.y * move);
      unit.knockback.remaining -= move;
      if (unit.knockback.remaining <= EPS) unit.knockback = null;
      return;
    }
    if (unit.stunUntil > now + EPS) { unit.charge = null; return; }
    if (unit.laneEntering) { this.advance(unit, this.state.forts[unit.targetSide], dt); return; }
    if (unit.charge) { this.updateCharge(unit, dt); return; }
    if (unit.hiddenUntil > now + EPS) {
      unit.target = null;
      this.advance(unit, this.state.forts[unit.targetSide], dt, STATUS.stealthSpeedMultiplier);
      return;
    }
    let target = unit.target === null ? null : this.resolve(unit.target);
    if (target && (!this.visible(target) || !this.sameLane(unit.lane, this.targetLane(target)) || (target.structure?.kind === 'sp-box' && unit.kind !== 'summoned'))) target = null;
    if (!target) { target = this.acquire(unit); unit.target = target?.id ?? null; }
    if (target) {
      const heading = direction(unit, target);
      unit.facingX = heading.x; unit.facingY = heading.y;
    }
    const skillReady = unit.unitId && unit.skillReadyAt <= now + EPS;
    if (skillReady && (unit.unitId === 'knight' || unit.unitId === 'commander' || (target && this.inRange(unit, target)))) {
      this.useSkill(unit, target);
      return;
    }
    if (target && this.inRange(unit, target)) {
      if (unit.attackReadyAt <= now + EPS) this.basicAttack(unit, target);
    } else this.advance(unit, target ?? this.state.forts[unit.targetSide], dt);
  }

  private movementMultiplier(unit: UnitEntity): number {
    let multiplier = unit.kind === 'neutral' ? MAPS[this.state.map].neutralMoveMultiplier : WEATHER[this.state.weather].moveMultiplier;
    if (this.state.zones.some((zone) => zone.side !== unit.side && this.sameLane(unit.lane, zone.lane) && zone.expiresAt > this.state.time && distance(zone, unit) <= zone.radius + EPS)) multiplier *= STATUS.slowMultiplier;
    return multiplier;
  }

  private advance(unit: UnitEntity, target: Point, dt: number, extraMultiplier = 1): void {
    if (unit.lane !== null && this.state.rules.lanes.count > 0) {
      const route = this.routes[unit.lane];
      const travel = unit.speed * this.movementMultiplier(unit) * extraMultiplier * dt;
      if (unit.laneEntering) {
        const entry = pointOnLane(route, unit.laneProgress);
        const heading = direction(unit, entry);
        const step = Math.min(distance(unit, entry), travel);
        unit.x += heading.x * step; unit.y += heading.y * step;
        unit.facingX = heading.x; unit.facingY = heading.y;
        if (distance(unit, entry) <= EPS) { unit.x = entry.x; unit.y = entry.y; unit.laneEntering = false; }
      } else {
        const destination = projectToLane(route, target).progress;
        this.advanceOnLane(unit, Math.sign(destination - unit.laneProgress) * Math.min(Math.abs(destination - unit.laneProgress), travel));
      }
      return;
    }
    const heading = direction(unit, target);
    unit.facingX = heading.x; unit.facingY = heading.y;
    const travel = Math.min(distance(unit, target), unit.speed * this.movementMultiplier(unit) * extraMultiplier * dt);
    this.move(unit, heading.x * travel, heading.y * travel);
  }

  private move(unit: UnitEntity, dx: number, dy: number): void {
    if (unit.lane !== null && this.state.rules.lanes.count > 0 && !unit.laneEntering) {
      const projected = projectToLane(this.routes[unit.lane], { x: unit.x + dx, y: unit.y + dy });
      this.advanceOnLane(unit, projected.progress - unit.laneProgress);
      return;
    }
    let next = { x: clamp(unit.x + dx, 0, ARENA_WIDTH), y: clamp(unit.y + dy, 0, ARENA_HEIGHT) };
    for (const side of SIDES) {
      const fort = this.state.forts[side];
      const separation = FORT_RADIUS + unit.radius;
      if (distance(next, fort) < separation) {
        const heading = direction(fort, next);
        next = { x: fort.x + heading.x * separation, y: fort.y + heading.y * separation };
      }
    }
    unit.x = clamp(next.x, 0, ARENA_WIDTH); unit.y = clamp(next.y, 0, ARENA_HEIGHT);
  }

  private advanceOnLane(unit: UnitEntity, amount: number): number {
    const route = this.routes[unit.lane!];
    const previous = unit.laneProgress;
    unit.laneProgress = clamp(previous + amount, 0, route.length);
    const point = pointOnLane(route, unit.laneProgress);
    const heading = direction(unit, point);
    if (distance(unit, point) > EPS) { unit.facingX = heading.x; unit.facingY = heading.y; }
    unit.x = point.x; unit.y = point.y;
    return Math.abs(unit.laneProgress - previous);
  }

  private attackInterval(unit: UnitEntity): number { return unit.attackInterval / (unit.buffUntil > this.state.time ? STATUS.attackSpeedMultiplier : 1); }

  private basicAttack(unit: UnitEntity, target: Target): void {
    unit.attackReadyAt = this.state.time + this.attackInterval(unit);
    const kind = unit.unitId ? UNITS[unit.unitId].attackKind : 'melee';
    if (kind === 'slash') {
      const shape = BASIC_ATTACK_SHAPES[unit.unitId === 'commander' ? 'commander' : 'warrior'];
      this.areaAttack(unit, unit.attack, (candidate) => this.inRectangle(unit, candidate, shape.length, shape.width), unit.unitId === 'commander' ? STATUS.staggerDuration : 0);
    }
    else if (kind === 'projectile' || kind === 'fireball' || kind === 'iceball') this.launch(unit, target, unit.attack, kind === 'fireball' ? BASIC_ATTACK_SHAPES.mage.radius : kind === 'iceball' ? BASIC_ATTACK_SHAPES.archmage.radius : 0, false, kind === 'iceball' ? STATUS.staggerDuration : 0);
    else this.damage(target, this.hunterDamage(unit, target, unit.attack), unit.side, unit.kind === 'summoned');
    this.effect(unit, 'attack', 0.2, unit.side);
  }

  private hunterDamage(unit: UnitEntity, target: Target, damage: number): number { return damage * (unit.unitId === 'hunter' && target.unit?.kind === 'neutral' ? 2 : 1); }

  private inRectangle(unit: UnitEntity, target: Target, length: number, width: number): boolean {
    const dx = target.x - unit.x, dy = target.y - unit.y;
    const forward = dx * unit.facingX + dy * unit.facingY;
    const sideways = Math.abs(dx * unit.facingY - dy * unit.facingX);
    const margin = this.targetRadius(target, true);
    return forward >= -margin - EPS && forward <= length + margin + EPS && sideways <= width / 2 + margin + EPS;
  }

  private areaAttack(unit: UnitEntity, amount: number, inside: (target: Target) => boolean, stagger = 0, knockback = 0): void {
    for (const target of this.targets(unit.side, unit.lane, unit.kind === 'summoned')) if (inside(target)) {
      this.damage(target, amount, unit.side, unit.kind === 'summoned');
      if (target.unit && target.unit.hp > 0) {
        if (stagger) this.stun(target.unit, stagger);
        if (knockback) this.knock(target.unit, unit, knockback);
      }
    }
  }

  private useSkill(unit: UnitEntity, target: Target | null): void {
    const id = unit.unitId!;
    const skill = SKILLS[id];
    unit.skillReadyAt = this.state.time + UNITS[id].skillCooldown;
    unit.attackReadyAt = this.state.time + this.attackInterval(unit);
    this.effect(unit, 'skill', 0.5, unit.side);
    switch (id) {
      case 'warrior': this.areaAttack(unit, skill.damage!, (candidate) => this.inRectangle(unit, candidate, skill.length!, skill.width!)); break;
      case 'archer': if (target) this.launch(unit, target, skill.damage!, 0, false, 0, skill.knockback!); break;
      case 'rogue': unit.hiddenUntil = this.state.time + skill.duration!; unit.target = null; break;
      case 'shield': this.areaAttack(unit, skill.damage!, (candidate) => {
        const heading = direction(unit, candidate);
        return distance(unit, candidate) <= skill.radius! + this.targetRadius(candidate, true) + EPS && heading.x * unit.facingX + heading.y * unit.facingY >= Math.SQRT1_2 - EPS;
      }, 0, skill.knockback!); break;
      case 'mage': if (target) this.launch(unit, target, skill.damage!, skill.radius!, true); break;
      case 'knight': {
        const heading = direction(unit, this.state.forts[unit.targetSide]);
        unit.facingX = heading.x; unit.facingY = heading.y;
        unit.charge = { x: heading.x, y: heading.y, remaining: skill.chargeDistance!, hits: [] };
        break;
      }
      case 'warlock': {
        const nearest = this.targets(unit.side, unit.lane, true).filter((candidate) => this.visible(candidate) && this.inRange(unit, candidate)).sort((a, b) => distance(unit, a) - distance(unit, b) || Number(a.id) - Number(b.id))[0];
        if (nearest?.unit) this.stun(nearest.unit, skill.duration!);
        break;
      }
      case 'hunter': if (target) this.damage(target, this.hunterDamage(unit, target, skill.damage!), unit.side, true); break;
      case 'commander': for (const friend of this.state.units) if (friend.side === unit.side && friend.kind === 'summoned' && this.sameLane(unit.lane, friend.lane) && friend.hp > 0) friend.buffUntil = Math.max(friend.buffUntil, this.state.time + skill.duration!); break;
      case 'archmage': if (target && unit.side !== 'neutral') this.state.zones.push({ id: this.nextId++, side: unit.side, lane: unit.lane, x: target.x, y: target.y, radius: skill.radius!, expiresAt: this.state.time + skill.duration!, nextTickAt: this.state.time + 1 }); break;
    }
  }

  private launch(unit: UnitEntity, target: Target, damage: number, radius = 0, burn = false, stagger = 0, knockback = 0): void {
    this.state.projectiles.push({ id: this.nextId++, side: unit.side, lane: unit.lane, canDamageBox: unit.kind === 'summoned', sourceId: unit.id, sourceX: unit.x, sourceY: unit.y, x: unit.x, y: unit.y, target: target.id, targetX: target.x, targetY: target.y, damage, radius, burn, stagger, knockback });
  }

  private updateProjectiles(dt: number): void {
    const remaining: Projectile[] = [];
    for (const projectile of this.state.projectiles) {
      const resolved = this.resolve(projectile.target);
      const target = resolved && this.sameLane(projectile.lane, this.targetLane(resolved)) ? resolved : null;
      if (target && (projectile.radius > 0 || this.visible(target))) { projectile.targetX = target.x; projectile.targetY = target.y; }
      else if (projectile.radius === 0) continue;
      const aim = { x: projectile.targetX, y: projectile.targetY };
      const heading = direction(projectile, aim);
      const travel = PROJECTILE_SPEED * dt;
      if (distance(projectile, aim) > travel + EPS) {
        projectile.x += heading.x * travel; projectile.y += heading.y * travel;
        remaining.push(projectile); continue;
      }
      projectile.x = aim.x; projectile.y = aim.y;
      const victims = projectile.radius ? this.targets(projectile.side, projectile.lane, projectile.canDamageBox).filter((candidate) => (!projectile.unitsOnly || candidate.unit) && distance(aim, candidate) <= projectile.radius + this.targetRadius(candidate) + EPS) : target ? [target] : [];
      for (const victim of victims) {
        this.damage(victim, projectile.damage, projectile.side, projectile.canDamageBox);
        if (victim.hp <= 0 || (victim.unit && victim.unit.hp <= 0)) continue;
        if (projectile.burn) this.burn(victim, projectile.side, projectile.canDamageBox);
        if (victim.unit) {
          if (projectile.stagger) this.stun(victim.unit, projectile.stagger);
          if (projectile.knockback) {
            const source = this.state.units.find((unit) => unit.id === projectile.sourceId);
            this.knock(victim.unit, source ?? { x: projectile.sourceX, y: projectile.sourceY }, projectile.knockback);
          }
        }
      }
      this.effect(aim, projectile.radius ? 'explosion' : 'hit', 0.3, projectile.side, projectile.radius);
    }
    this.state.projectiles = remaining;
  }

  private damage(target: Target, amount: number, source: EntitySide, canDamageBox = false): void {
    const entity = this.targetEntity(target);
    if (entity.hp <= 0) return;
    if (target.structure?.kind === 'sp-box' && (!canDamageBox || source === 'neutral')) return;
    const actualDamage = Math.min(entity.hp, Math.max(0, amount));
    entity.hp = Math.max(0, entity.hp - amount);
    if (target.structure?.kind === 'sp-box' && source !== 'neutral') {
      this.awardSp(source, actualDamage * this.state.rules.spBox.spPerDamage);
      if (entity.hp <= 0 && this.state.rules.spBox.respawnDelay !== null) this.boxRespawns.push({ at: this.state.time + this.state.rules.spBox.respawnDelay, position: { x: entity.x, y: entity.y } });
    }
    if (entity.hp <= 0 && target.structure?.kind === 'tower' && target.structure.side !== 'neutral') {
      const reward = this.state.rules.sp.towerLoss;
      if (reward.enabled) this.awardSp(target.structure.side, reward.amount);
    }
    if (entity.hp <= 0 && target.unit) {
      const victim = target.unit;
      const rewardSide = victim.side !== 'neutral' ? opposite(victim.side) : source !== 'neutral' ? source : null;
      const rule: RewardRule = victim.kind === 'minion' ? (victim.elite ? this.state.rules.sp.elite : this.state.rules.sp.minion) : victim.side === 'neutral' ? this.state.rules.sp.neutral : this.state.rules.sp.summoned;
      if (rewardSide && rule.enabled) this.awardSp(rewardSide, (rule.amount ?? victim.reward) * rule.multiplier);
      this.effect(target, 'death', 0.4, target.side);
    }
  }

  private awardSp(side: Side, amount: number): void { this.state.sp[side] += amount; }

  private burn(target: Target, sourceSide: EntitySide, canDamageBox = false): void {
    const entity = this.targetEntity(target);
    entity.burn = { sourceSide, canDamageBox, damage: SKILLS.mage.burnDamage!, expiresAt: this.state.time + SKILLS.mage.burnDuration!, nextTickAt: entity.burn?.nextTickAt ?? this.state.time + 1 };
  }

  private stun(unit: UnitEntity, seconds: number): void {
    unit.stunUntil = Math.max(unit.stunUntil, this.state.time + seconds);
    unit.charge = null;
  }

  private knock(unit: UnitEntity, source: Point, amount: number): void {
    const heading = direction(source, unit);
    unit.knockback = { x: heading.x * amount / 0.2, y: heading.y * amount / 0.2, remaining: 0.2 };
    if (unit.lane !== null && !unit.laneEntering) {
      const sourceProgress = projectToLane(this.routes[unit.lane], source).progress;
      unit.knockback.laneVelocity = (unit.laneProgress >= sourceProgress ? 1 : -1) * amount / 0.2;
    }
    unit.charge = null;
  }

  private updateCharge(unit: UnitEntity, dt: number): void {
    const charge = unit.charge!;
    const travel = Math.min(charge.remaining, SKILLS.knight.chargeSpeed! * this.movementMultiplier(unit) * dt);
    const start = { x: unit.x, y: unit.y };
    const onLane = unit.lane !== null && this.state.rules.lanes.count > 0;
    const previousProgress = unit.laneProgress;
    if (onLane) this.advanceOnLane(unit, (unit.targetSide === 'enemy' ? 1 : -1) * travel);
    else this.move(unit, charge.x * travel, charge.y * travel);
    const travelled = onLane ? Math.abs(unit.laneProgress - previousProgress) : distance(start, unit);
    for (const target of this.targets(unit.side, unit.lane, true)) {
      if (charge.hits.includes(target.id)) continue;
      const dx = target.x - start.x, dy = target.y - start.y;
      const forward = dx * charge.x + dy * charge.y;
      const perpendicular = Math.abs(dx * charge.y - dy * charge.x);
      const margin = this.targetRadius(target) + (target.fort ? unit.radius : 0);
      const projected = onLane ? projectToLane(this.routes[unit.lane!], target) : null;
      const crossed = projected && projected.progress >= Math.min(previousProgress, unit.laneProgress) - margin - EPS && projected.progress <= Math.max(previousProgress, unit.laneProgress) + margin + EPS && projected.distance <= SKILLS.knight.width! / 2 + margin + EPS;
      if (onLane ? crossed : forward >= -margin && forward <= travelled + margin + EPS && perpendicular <= SKILLS.knight.width! / 2 + margin + EPS) {
        charge.hits.push(target.id);
        this.damage(target, SKILLS.knight.damage!, unit.side, true);
      }
    }
    charge.remaining -= travelled;
    if (charge.remaining <= EPS || travelled < travel - EPS) unit.charge = null;
  }

  private updatePersistentEffects(): void {
    const now = this.state.time;
    for (const target of [
      ...this.state.units.map((unit): Target => ({ id: unit.id, side: unit.side, x: unit.x, y: unit.y, hp: unit.hp, unit })),
      ...SIDES.map((side): Target => ({ id: `fort:${side}`, side, ...this.state.forts[side], fort: this.state.forts[side] })),
      ...this.state.structures.map((structure): Target => ({ ...structure, structure })),
    ]) {
      const entity = this.targetEntity(target);
      const burn = entity.burn;
      if (!burn) continue;
      while (burn.nextTickAt <= now + EPS && burn.nextTickAt <= burn.expiresAt + EPS && entity.hp > 0) {
        this.damage(target, burn.damage, burn.sourceSide, burn.canDamageBox); burn.nextTickAt += 1;
      }
      if (now >= burn.expiresAt - EPS || entity.hp <= 0) entity.burn = null;
    }
    for (const zone of this.state.zones) {
      while (zone.nextTickAt <= now + EPS && zone.nextTickAt <= zone.expiresAt + EPS) {
        for (const target of this.targets(zone.side, zone.lane, true)) if (distance(zone, target) <= zone.radius + this.targetRadius(target) + EPS) {
          const entity = this.targetEntity(target);
          if (entity.iceDamageAt + 1 <= zone.nextTickAt + EPS) {
            this.damage(target, SKILLS.archmage.damage!, zone.side, true); entity.iceDamageAt = zone.nextTickAt;
          }
        }
        zone.nextTickAt += 1;
      }
    }
  }

  private effect(point: Point, kind: string, duration: number, side?: EntitySide, radius?: number): void {
    const effect: Effect = { x: point.x, y: point.y, kind, expiresAt: this.state.time + duration };
    if (side !== undefined) effect.side = side;
    if (radius !== undefined) effect.radius = radius;
    this.state.effects.push(effect);
  }

  private updateAI(side: Side): void {
    const now = this.state.time;
    if (now < this.aiNext[side]) return;
    this.aiNext[side] = now + 0.8 + this.random() * 0.5;
    const fort = this.state.forts[side];
    const pressure = this.state.units.filter((unit) => unit.hp > 0 && unit.side !== side && (unit.side !== 'neutral' || unit.targetSide === side) && distance(unit, fort) < 6);
    const deck = this.state.decks[side];
    const expensive = deck.filter((id) => UNITS[id].cost >= 30);
    // Without passive income, deploy affordable units until kills can fund an expensive unit.
    const passive = this.state.rules.sp.passive;
    const canSave = (passive.enabled && passive.amount > 0) || this.state.sp[side] >= 30 - EPS;
    const saving = canSave && !pressure.length && expensive.length > 0 && this.aiSummons[side] % 5 >= 3;
    if (saving && this.state.sp[side] < 30 - EPS) return;
    const affordable = deck.filter((id) => UNITS[id].cost <= this.state.sp[side] + EPS);
    if (!affordable.length) return;
    let selected: UnitId;
    if (saving) selected = expensive[Math.floor(this.random() * expensive.length)];
    else if (pressure.some((unit) => unit.side === 'neutral') && affordable.includes('hunter')) selected = 'hunter';
    else if (pressure.length > 3 && affordable.includes('mage')) selected = 'mage';
    else selected = affordable[Math.floor(this.random() * affordable.length)];
    const threat = pressure.sort((a, b) => distance(a, fort) - distance(b, fort))[0];
    const x = clamp(threat?.x ?? 3 + this.random() * 6, 0.6, 11.4);
    const y = side === 'player' ? clamp((threat?.y ?? 14.5) + (UNITS[selected].range > 1 ? 2 : 0.7), 10.4, 17.5) : clamp((threat?.y ?? 5.5) - (UNITS[selected].range > 1 ? 2 : 0.7), 2.5, 9.6);
    if (this.summon(side, selected, { x, y })) this.aiSummons[side]++;
  }
}
