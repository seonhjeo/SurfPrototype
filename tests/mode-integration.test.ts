import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation, ARENA_WIDTH, ARENA_HEIGHT, FIXED_STEP } from '../src/game/simulation.ts';
import type { BattleState, SimulationOptions } from '../src/game/simulation.ts';
import { GAME_MODES, MATCH_DURATION, UNITS, WEATHER } from '../src/game/data.ts';
import type { GameModeId, MapId, UnitId, WeatherId } from '../src/game/data.ts';
import type { ModeRulesOverride } from '../src/game/mode-settings.ts';
import { getLaneRoutes, pointOnLane } from '../src/game/lanes.ts';

const decks: UnitId[][] = [
  ['hunter', 'archer', 'rogue', 'knight', 'commander'],
  ['warrior', 'shield', 'mage', 'warlock', 'archmage'],
];
const maps: MapId[] = ['desert', 'forest', 'swamp', 'road'];
const weathers: WeatherId[] = ['sunny', 'rain', 'fog'];
const modes: GameModeId[] = ['standard', 'limited-sp', 'no-kill-sp'];

// Twelve matches cover every map/weather pair and every lane count in each
// weather. Rotating the base mode and decks also exercises every summon skill.
const scenarios = ([0, 1, 2, 3] as const).flatMap((lanes) => weathers.map((weather, index) => ({
  lanes, weather, map: maps[(lanes + index) % maps.length],
  gameMode: modes[(lanes + index) % modes.length],
  seed: 1_901 + lanes * 101 + index * 17,
})));

function enabledRules(lanes: 0 | 1 | 2 | 3): ModeRulesOverride {
  return {
    lanes: { count: lanes },
    minions: { enabled: true },
    fortAttacks: { catapult: { enabled: true }, oil: { enabled: true } },
    towers: { enabled: true },
    spBox: { enabled: true, respawnDelay: 4 },
    sp: {
      initial: 50, maximum: 37, passive: { enabled: true, amount: 1.25 },
      summoned: { enabled: true, amount: 4.5, multiplier: 2 },
      minion: { enabled: true, amount: 1.5 },
      elite: { enabled: true, amount: 8 },
      neutral: { enabled: true, amount: null, multiplier: 1.75 },
    },
  };
}

function options(scenario: typeof scenarios[number], deckIndex: number): SimulationOptions {
  return {
    map: scenario.map, weather: scenario.weather, gameMode: scenario.gameMode,
    seed: scenario.seed, aiSides: ['enemy'], rules: enabledRules(scenario.lanes),
    decks: { player: [...decks[deckIndex % decks.length]], enemy: [...decks[(deckIndex + 1) % decks.length]] },
  };
}

function finite(value: unknown, path: string): void {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `${path} is finite`);
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) finite(child, `${path}.${key}`);
  }
}

interface UnitPosition { lane: number | null; progress: number; entering: boolean }
function checkState(state: BattleState, previous: Map<number, UnitPosition>, label: string): void {
  finite(state, label);
  for (const side of ['player', 'enemy'] as const) {
    assert.ok(state.sp[side] >= 0 && state.sp[side] <= state.rules.sp.maximum, `${label}/${side} obeys custom SP cap`);
    assert.ok(state.forts[side].hp >= 0 && state.forts[side].hp <= state.forts[side].maxHp);
  }
  const routes = getLaneRoutes(state.rules.lanes.count);
  for (const unit of state.units) {
    assert.ok(unit.x >= 0 && unit.x <= ARENA_WIDTH && unit.y >= 0 && unit.y <= ARENA_HEIGHT, `${label}/unit ${unit.id} stays in arena`);
    assert.ok(unit.hp > 0 && unit.hp <= unit.maxHp, `${label}/unit ${unit.id} has bounded health`);
    const old = previous.get(unit.id);
    if (old) assert.equal(unit.lane, old.lane, `${label}/unit ${unit.id} keeps its assigned lane`);
    if (state.rules.lanes.count === 0) assert.equal(unit.lane, null, `${label} keeps free movement`);
    else {
      assert.ok(unit.lane !== null && routes[unit.lane], `${label}/unit ${unit.id} has a valid lane`);
      const route = routes[unit.lane!];
      assert.ok(unit.laneProgress >= 0 && unit.laneProgress <= route.length, `${label}/unit ${unit.id} progress stays on route`);
      const point = pointOnLane(route, unit.laneProgress);
      if (!unit.laneEntering) {
        assert.ok(Math.hypot(unit.x - point.x, unit.y - point.y) < 1e-6, `${label}/unit ${unit.id} coordinates follow lane progress`);
      } else if (old?.entering) {
        assert.equal(unit.laneProgress, old.progress, `${label}/unit ${unit.id} keeps its shortest entry destination`);
      }
    }
    previous.set(unit.id, { lane: unit.lane, progress: unit.laneProgress, entering: unit.laneEntering });
  }
  for (const structure of state.structures) {
    assert.ok(structure.hp > 0 && structure.hp <= structure.maxHp, `${label} has no dead structures in the public state`);
  }
}

function summonPlayer(simulation: Simulation, second: number): boolean {
  const deck = simulation.state.decks.player;
  const candidates = [...deck.slice(second % deck.length), ...deck.slice(0, second % deck.length)];
  const selected = candidates.find((id) => UNITS[id].cost <= simulation.state.sp.player);
  if (!selected) return false;
  // Alternate touch placement and drag placement so both public input paths run.
  const position = second % 2 === 0 ? undefined : { x: [1.2, 6, 10.8][second % 3], y: 14.5 };
  return simulation.summon('player', selected, position);
}

for (const [index, scenario] of scenarios.entries()) {
  test(`all features complete player vs AI: ${scenario.lanes} lanes/${scenario.map}/${scenario.weather}/${scenario.gameMode}`, () => {
    const simulation = new Simulation(options(scenario, index));
    const initial = simulation.snapshot();
    assert.equal(initial.structures.filter((entity) => entity.kind === 'tower').length, 2 * Math.max(1, scenario.lanes));
    assert.ok(initial.structures.some((entity) => entity.kind === 'sp-box'));
    const previous = new Map<number, UnitPosition>();
    let playerSummons = 0;
    let sawEnemySummon = false;
    let sawMinion = false;
    let sawNeutral = false;
    let sawLaneEntry = false;
    for (let second = 0; second < MATCH_DURATION && !simulation.state.result; second++) {
      if (summonPlayer(simulation, second)) playerSummons++;
      simulation.update(1);
      checkState(simulation.state, previous, `${scenario.lanes}/${scenario.map}/${scenario.weather}/${second}`);
      sawEnemySummon ||= simulation.state.units.some((unit) => unit.side === 'enemy' && unit.kind === 'summoned');
      sawMinion ||= simulation.state.units.some((unit) => unit.kind === 'minion');
      sawNeutral ||= simulation.state.units.some((unit) => unit.kind === 'neutral');
      sawLaneEntry ||= simulation.state.units.some((unit) => unit.laneEntering);
    }
    assert.ok(playerSummons > 0 && sawEnemySummon, 'both sides participate in the 1v1 match');
    assert.ok(sawMinion && sawNeutral, 'new minions coexist with the existing neutral waves');
    if (scenario.lanes > 0) assert.ok(sawLaneEntry, 'off-lane spawns exercise lane entry');
    assert.ok(simulation.state.result, 'the match reaches a result');
    assert.ok(['player', 'enemy', 'draw'].includes(simulation.state.result.winner));
    assert.ok(['timeout', 'fort-destroyed'].includes(simulation.state.result.reason));
    assert.ok(simulation.state.time > 0 && simulation.state.time <= MATCH_DURATION);
    const ended = simulation.snapshot();
    assert.deepEqual(JSON.parse(JSON.stringify(ended)), ended, 'new mode state remains serializable');
    simulation.update(30);
    assert.equal(simulation.summon('player', simulation.state.decks.player[0]), false);
    assert.deepEqual(simulation.snapshot(), ended, 'finished matches freeze every feature');
  });
}

test('isolated off-lane summons enter by the shortest straight path before beginning lane movement', () => {
  for (const lanes of [1, 2, 3] as const) for (const side of ['player', 'enemy'] as const) {
    const weather = weathers[lanes - 1];
    const simulation = new Simulation({
      map: 'swamp', weather, decks: { player: ['knight'], enemy: ['knight'] },
      rules: { lanes: { count: lanes }, neutralWaves: { enabled: false }, sp: { initial: 10 } },
    });
    const origin = { x: 0.8, y: side === 'player' ? 12 : 8 };
    assert.equal(simulation.summon(side, 'knight', origin), true);
    const unit = simulation.state.units[0];
    const lane = unit.lane;
    assert.ok(lane !== null && unit.laneEntering);
    assert.deepEqual({ x: unit.x, y: unit.y }, origin, 'drag creation preserves continuous coordinates');
    const route = getLaneRoutes(lanes)[lane!];
    const progress = unit.laneProgress;
    const entry = pointOnLane(route, progress);
    const distance = Math.hypot(origin.x - entry.x, origin.y - entry.y);
    const speed = unit.speed * WEATHER[weather].moveMultiplier;
    const skillReadyAt = unit.skillReadyAt;
    for (let step = 1; step <= 10 / FIXED_STEP && unit.laneEntering; step++) {
      simulation.update(FIXED_STEP);
      const ratio = Math.min(1, speed * step * FIXED_STEP / distance);
      assert.ok(Math.abs(unit.x - (origin.x + (entry.x - origin.x) * ratio)) < 1e-6);
      assert.ok(Math.abs(unit.y - (origin.y + (entry.y - origin.y) * ratio)) < 1e-6);
      assert.equal(unit.lane, lane);
      assert.equal(unit.laneProgress, progress, 'entry does not change the assigned progress');
      assert.equal(unit.skillReadyAt, skillReadyAt, 'entry does not activate a combat skill');
      assert.equal(unit.target, null, 'entry does not acquire a combat target');
    }
    assert.equal(unit.laneEntering, false, `${lanes}/${side}/${weather} completes entry`);
    assert.ok(Math.hypot(unit.x - entry.x, unit.y - entry.y) < 1e-6);
  }
});

test('seeded full-feature battles stay deterministic across update partitioning', () => {
  const scenario = scenarios.at(-1)!;
  const whole = new Simulation(options(scenario, 1));
  const partitioned = new Simulation(options(scenario, 1));
  for (let second = 0; second < MATCH_DURATION && !whole.state.result; second++) {
    assert.equal(summonPlayer(partitioned, second), summonPlayer(whole, second));
    whole.update(1);
    for (const duration of [0.13, 0.27, 0.6]) partitioned.update(duration);
    assert.deepEqual(partitioned.snapshot(), whole.snapshot(), `deterministic state at second ${second + 1}`);
  }
  assert.ok(whole.state.result && partitioned.state.result);
});

test('mode overrides, per-match settings, decks and exported snapshots do not share mutable state', () => {
  const presetsBefore = structuredClone(GAME_MODES);
  const configuration = options(scenarios.at(-1)!, 0);
  const originalRules = structuredClone(configuration.rules);
  const first = new Simulation(configuration);
  const second = new Simulation(configuration);
  const untouched = second.snapshot();

  configuration.rules!.towers!.damage = 999;
  configuration.rules!.sp!.neutral!.multiplier = 99;
  configuration.decks.player.splice(0, configuration.decks.player.length, 'mage');
  assert.equal(first.state.rules.towers.damage, untouched.rules.towers.damage);
  assert.equal(first.state.rules.sp.neutral.multiplier, untouched.rules.sp.neutral.multiplier);
  assert.deepEqual(first.state.decks, untouched.decks);

  first.state.rules.fortAttacks.catapult.enabled = false;
  first.state.rules.sp.minion.amount = 999;
  first.state.rules.lanes.count = 1;
  first.state.decks.player.splice(0, 1);
  first.state.structures[0].hp = 1;
  assert.deepEqual(second.snapshot(), untouched, 'a different match cannot alter settings or entities');

  const exported = second.snapshot();
  exported.rules.sp.maximum = 1;
  exported.rules.spBox.enabled = false;
  exported.decks.enemy.length = 0;
  exported.structures[0].hp = 0;
  assert.deepEqual(second.snapshot(), untouched, 'snapshot consumers cannot alter the authoritative match');
  assert.deepEqual(GAME_MODES, presetsBefore, 'preset settings cannot be changed by match overrides');

  const fresh = new Simulation({ ...options(scenarios.at(-1)!, 0), rules: originalRules });
  assert.deepEqual(fresh.snapshot(), untouched, 'a rematch starts with fresh counters, structures and resources');
});
