import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, FIXED_STEP } from '../src/game/simulation.ts';
import type { UnitEntity } from '../src/game/simulation.ts';
import { GAME_MODES, MAPS, UNITS, resolveModeRules } from '../src/game/data.ts';
import type { GameModeId, MapId, ModeRulesOverride, Side, UnitId, WeatherId } from '../src/game/data.ts';
import { getLaneRoutes, nearestLane, pointOnLane, projectToLane } from '../src/game/lanes.ts';

const deck: UnitId[] = ['warrior', 'archer', 'hunter', 'knight', 'commander'];
const near = (actual: number, expected: number, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
const create = (rules: ModeRulesOverride = {}, map: MapId = 'desert', weather: WeatherId = 'sunny', gameMode: GameModeId = 'standard') => new Simulation({ map, weather, gameMode, seed: 23, decks: { player: deck, enemy: deck }, rules: { neutralWaves: { enabled: false }, sp: { initial: 50, passive: { enabled: false } }, ...rules } });
function spawn(sim: Simulation, side: Side, id: UnitId, lane = 0, progress = 5): UnitEntity {
  sim.state.sp[side] = sim.state.rules.sp.maximum;
  if (!sim.state.decks[side].includes(id)) sim.state.decks[side].push(id);
  assert.equal(sim.summon(side, id), true);
  const unit = sim.state.units.at(-1)!;
  if (sim.state.rules.lanes.count > 0) place(sim, unit, lane, progress);
  unit.speed = 0; unit.attackReadyAt = 1e6; unit.skillReadyAt = 1e6;
  return unit;
}
function place(sim: Simulation, unit: UnitEntity, lane: number, progress: number) {
  const route = getLaneRoutes(sim.state.rules.lanes.count)[lane];
  Object.assign(unit, pointOnLane(route, progress), { lane, laneProgress: progress, laneEntering: false });
  const next = pointOnLane(route, progress + (unit.targetSide === 'enemy' ? 0.01 : -0.01));
  const length = Math.hypot(next.x - unit.x, next.y - unit.y);
  unit.facingX = (next.x - unit.x) / length; unit.facingY = (next.y - unit.y) / length;
}

test('all registered modes preserve their economy and opt out of every new feature by default', () => {
  for (const [id, mode] of Object.entries(GAME_MODES)) {
    const rules = resolveModeRules(id as GameModeId);
    assert.equal(rules.lanes.count, 0);
    assert.equal(rules.minions.enabled, false); assert.equal(rules.towers.enabled, false); assert.equal(rules.spBox.enabled, false);
    assert.equal(rules.fortAttacks.catapult.enabled, false); assert.equal(rules.fortAttacks.oil.enabled, false);
    const sim = new Simulation({ map: 'desert', weather: 'sunny', gameMode: id as GameModeId, decks: { player: deck, enemy: deck } });
    assert.deepEqual(sim.state.rules, mode.rules);
    assert.equal(sim.state.sp.player, id === 'standard' ? 5 : 20);
    assert.equal(rules.sp.passive.enabled, id !== 'limited-sp');
    assert.equal(rules.sp.summoned.enabled, id !== 'no-kill-sp');
    assert.equal(rules.sp.neutral.enabled, id !== 'no-kill-sp');
    assert.equal(sim.state.structures.length, 0);
  }
});

test('nested rules merge, snapshots are isolated, and invalid geometry/economy are rejected', () => {
  const sim = create({ lanes: { count: 2 }, towers: { enabled: true }, sp: { initial: 17, maximum: 22, passive: { enabled: true, amount: 2.5 } } });
  assert.equal(sim.state.rules.towers.damage, 12); assert.equal(sim.state.sp.player, 17);
  sim.update(2); near(sim.state.sp.player, 22);
  const snapshot = sim.snapshot(); snapshot.rules.sp.maximum = 1;
  assert.equal(sim.state.rules.sp.maximum, 22); assert.equal(GAME_MODES.standard.rules.sp.maximum, 50);
  assert.throws(() => create({ lanes: { count: 4 as 3 } }));
  assert.throws(() => create({ sp: { maximum: 0 } }));
  assert.throws(() => create({ towers: { interval: 0 } }));
  assert.throws(() => create({ minions: { eliteEvery: 0 } }));
  assert.throws(() => create({ spBox: { radius: 4 } }));
});

test('routes have shared fort approaches, deterministic nearest projections and continuous progression', () => {
  for (const count of [1, 2, 3]) {
    const routes = getLaneRoutes(count);
    assert.equal(routes.length, count);
    for (const route of routes) {
      assert.deepEqual(route.points[0], { x: 6, y: 17.6 });
      assert.deepEqual(route.points.at(-1), { x: 6, y: 2.4 });
      assert.deepEqual(pointOnLane(route, 0.6), { x: 6, y: 17 });
      for (let progress = 0; progress <= route.length; progress += 0.25) near(projectToLane(route, pointOnLane(route, progress)).distance, 0);
    }
    assert.equal(nearestLane(routes, { x: 6, y: 17 }).lane, 0, 'shared approaches break equal distance by lowest lane ID');
  }
});

test('drag and neutral spawns enter the nearest route along a shortest straight segment, then stay on it', () => {
  const sim = create({ lanes: { count: 2 }, neutralWaves: { enabled: true } });
  assert.equal(sim.summon('player', 'warrior', { x: 1, y: 12 }), true);
  const unit = sim.state.units[0];
  assert.equal(unit.lane, 0); assert.equal(unit.laneEntering, true);
  const route = getLaneRoutes(2)[0]; const progress = unit.laneProgress;
  sim.update(0.5); near(unit.x, 1 + UNITS.warrior.speed * 0.5); near(unit.y, 12);
  sim.update(2); assert.equal(unit.laneEntering, false); near(projectToLane(route, unit).distance, 0);
  assert.ok(unit.laneProgress > progress);
  sim.update(2.5);
  const neutrals = sim.state.units.filter((entity) => entity.kind === 'neutral');
  assert.ok(neutrals.length > 0);
  for (const neutral of neutrals) assert.equal(neutral.lane, neutral.x < 6 ? 0 : 1);
});

test('tap summons choose the fewest living allies including minions, with stable lane ID ties', () => {
  const sim = create({ lanes: { count: 3 }, minions: { enabled: true } });
  sim.update(5);
  assert.equal(sim.summon('player', 'hunter'), true); assert.equal(sim.state.units.at(-1)!.lane, 0);
  sim.state.sp.player = 50;
  assert.equal(sim.summon('player', 'hunter'), true); assert.equal(sim.state.units.at(-1)!.lane, 1);
  for (const unit of sim.state.units) if (unit.side === 'player' && unit.lane === 2) unit.hp = 0;
  sim.state.sp.player = 50;
  assert.equal(sim.summon('player', 'hunter'), true); assert.equal(sim.state.units.at(-1)!.lane, 2);
});

test('minions use road base HP/ATK x1.5 in every map and add one unscaled elite per lane on wave five', () => {
  for (const map of ['desert', 'forest', 'swamp', 'road'] as MapId[]) for (const count of [0, 1, 2, 3] as const) {
    const sim = create({ lanes: { count }, minions: { enabled: true } }, map);
    sim.update(4.9); assert.equal(sim.state.units.length, 0);
    sim.update(0.1);
    const perSide = Math.max(1, count) * 3;
    assert.equal(sim.state.units.length, perSide * 2);
    for (const unit of sim.state.units) {
      assert.equal(unit.kind, 'minion'); assert.equal(unit.maxHp, MAPS.road.monster.hp * 1.5);
      assert.equal(unit.attack, MAPS.road.monster.attack * 1.5); assert.equal(unit.speed, MAPS.road.monster.speed);
      unit.speed = 0;
    }
    sim.state.units = []; sim.state.wave = 4; sim.state.time = 84.9; sim.update(0.1);
    assert.equal(sim.state.units.length, Math.max(1, count) * 8);
    const elites = sim.state.units.filter((unit) => unit.elite);
    assert.equal(elites.length, Math.max(1, count) * 2);
    for (const elite of elites) { assert.equal(elite.maxHp, MAPS.road.boss.hp * 1.5); assert.equal(elite.attack, MAPS.road.boss.attack * 1.5); assert.equal(elite.boss, false); }
    for (const ordinary of sim.state.units.filter((unit) => !unit.elite)) assert.equal(ordinary.maxHp, MAPS.road.monster.hp * 1.5);
  }
});

test('minions use weather rather than map movement modifiers, including fog detection', () => {
  for (const map of ['desert', 'forest', 'swamp', 'road'] as MapId[]) {
    for (const weather of ['sunny', 'rain'] as WeatherId[]) {
      const sim = create({ minions: { enabled: true } }, map, weather); sim.update(5);
      const minion = sim.state.units.find((unit) => unit.side === 'player')!;
      sim.state.units = [minion]; const y = minion.y; sim.update(1);
      near(y - minion.y, MAPS.road.monster.speed * (weather === 'rain' ? 0.8 : 1));
    }
    const sim = create({ minions: { enabled: true } }, map, 'fog'); sim.update(5);
    const minion = sim.state.units.find((unit) => unit.side === 'player')!;
    sim.state.units = [minion]; minion.x = 6; minion.y = 13; minion.speed = 0;
    const victim = spawn(sim, 'enemy', 'shield'); victim.x = 6; victim.y = 10.5;
    sim.update(FIXED_STEP); assert.equal(minion.target, null);
    victim.y = 11; sim.update(FIXED_STEP); assert.equal(minion.target, victim.id);
  }
});

test('melee, slash, projectile, explosions, CC, ice and charge cannot affect a different lane at shared approaches', () => {
  for (const id of ['warrior', 'archer', 'shield', 'mage', 'warlock', 'hunter', 'archmage', 'knight'] as UnitId[]) {
    const sim = create({ lanes: { count: 2 } });
    const attacker = spawn(sim, 'player', id, 0, 0.2);
    const same = spawn(sim, 'enemy', 'shield', 0, 1);
    const other = spawn(sim, 'enemy', 'shield', 1, 1);
    attacker.attackReadyAt = 0; attacker.skillReadyAt = 0;
    sim.update(2);
    assert.equal(other.hp, 200, id); assert.equal(other.stunUntil, 0, id); assert.equal(other.knockback, null, id); assert.equal(other.burn, null, id);
    assert.equal(other.laneProgress, 1, id);
    if (id !== 'archmage' && id !== 'warlock') assert.ok(same.hp < 200, `${id} still affects its own lane`);
  }
});

test('commander buffs only same-lane summoned units, excluding allied minions', () => {
  const sim = create({ lanes: { count: 2 }, minions: { enabled: true } }); sim.update(5);
  const commander = spawn(sim, 'player', 'commander', 0, 0.5);
  const friend = spawn(sim, 'player', 'hunter', 0, 0.5);
  const other = spawn(sim, 'player', 'hunter', 1, 0.5);
  commander.skillReadyAt = 0; sim.update(FIXED_STEP);
  assert.ok(commander.buffUntil > 0); assert.ok(friend.buffUntil > 0); assert.equal(other.buffUntil, 0);
  for (const minion of sim.state.units.filter((unit) => unit.kind === 'minion')) assert.equal(minion.buffUntil, 0);
});

test('stealth, charge and knockback follow route arc length through corners', () => {
  const route = getLaneRoutes(2)[0];
  const sim = create({ lanes: { count: 2 } });
  const rogue = spawn(sim, 'player', 'rogue', 0, 1.1); rogue.speed = UNITS.rogue.speed; rogue.hiddenUntil = 10;
  sim.update(1); near(rogue.laneProgress, 1.1 + UNITS.rogue.speed * 1.5); near(projectToLane(route, rogue).distance, 0);
  const knight = spawn(sim, 'player', 'knight', 0, 1.1); knight.skillReadyAt = 0;
  sim.update(FIXED_STEP); sim.update(1); near(knight.laneProgress, 5.1); near(projectToLane(route, knight).distance, 0);
  const knockSim = create({ lanes: { count: 2 } });
  const archer = spawn(knockSim, 'player', 'archer', 0, 0.6);
  const victim = spawn(knockSim, 'enemy', 'shield', 0, 1.1);
  archer.skillReadyAt = 0; knockSim.update(0.6);
  near(victim.laneProgress, 2.6); near(projectToLane(route, victim).distance, 0);
});

test('towers spawn symmetrically per lane, forbid overlapping summons, and preserve fort access before destruction', () => {
  for (const count of [0, 1, 2, 3] as const) {
    const sim = create({ lanes: { count }, towers: { enabled: true } });
    assert.equal(sim.state.structures.length, Math.max(1, count) * 2);
    const own = sim.state.structures.find((structure) => structure.side === 'player')!;
    const before = sim.state.sp.player;
    assert.equal(sim.summon('player', 'hunter', own), false); assert.equal(sim.state.sp.player, before);
    const attacker = spawn(sim, 'player', 'hunter');
    attacker.x = 6; attacker.y = 2.4;
    if (count > 0) place(sim, attacker, 0, getLaneRoutes(count)[0].length);
    attacker.attackReadyAt = 0; const hp = sim.state.forts.enemy.hp;
    sim.update(FIXED_STEP); assert.ok(sim.state.forts.enemy.hp < hp);
    assert.ok(sim.state.structures.filter((structure) => structure.side === 'enemy').every((structure) => structure.hp > 0));
  }
});

test('catapult and oil can independently damage enemies and reward neutral kills to the owning player', () => {
  for (const kind of ['catapult', 'oil'] as const) {
    const sim = create({ fortAttacks: { [kind]: { enabled: true, damage: 30 } } });
    const victim = spawn(sim, 'enemy', 'shield'); victim.x = 6; victim.y = 17.3; victim.hp = 7; victim.kind = 'neutral'; victim.side = 'neutral'; victim.reward = 4;
    sim.state.sp.player = 0; sim.update(1);
    assert.equal(victim.hp, 0); near(sim.state.sp.player, 4);
    assert.ok(sim.state.effects.some((effect) => effect.kind === kind) || sim.state.forts.player[`${kind}ReadyAt`] > 0);
  }
});

test('shared fort area weapons select one target lane and do not spill into another overlapping lane', () => {
  for (const kind of ['catapult', 'oil'] as const) {
    const sim = create({ lanes: { count: 2 }, fortAttacks: { [kind]: { enabled: true, range: 8, radius: 8, damage: 12 } } });
    const first = spawn(sim, 'enemy', 'shield', 0, 0.1);
    const other = spawn(sim, 'enemy', 'shield', 1, 0.1);
    sim.update(1); assert.ok(first.hp < 200); assert.equal(other.hp, 200);
  }
});

test('SP box grants fractional actual damage rewards, excludes excess damage and hunter neutral multiplier, and respawns optionally', () => {
  const sim = create({ spBox: { enabled: true, hp: 3, spPerDamage: 0.25, respawnDelay: 1 } });
  const hunter = spawn(sim, 'player', 'hunter'); hunter.x = 6; hunter.y = 12; hunter.attackReadyAt = 0;
  sim.state.sp.player = 0; sim.update(FIXED_STEP);
  near(sim.state.sp.player, 0.75); assert.equal(sim.state.structures.length, 0);
  sim.state.units = []; sim.update(1); assert.equal(sim.state.structures.length, 1); assert.equal(sim.state.structures[0].hp, 3);
  const noRespawn = create({ spBox: { enabled: true, hp: 30 } });
  const second = spawn(noRespawn, 'player', 'hunter'); second.x = 6; second.y = 12; second.attackReadyAt = 0;
  noRespawn.update(FIXED_STEP); assert.equal(noRespawn.state.structures[0].hp, 25, 'hunter deals base five, not neutral ten');
  noRespawn.state.structures[0].hp = 1; second.attackReadyAt = 0; noRespawn.update(FIXED_STEP);
  noRespawn.state.units = []; noRespawn.update(5); assert.equal(noRespawn.state.structures.length, 0);
});

test('only summoned units target and damage the common box, with access from all three lanes', () => {
  for (const lane of [0, 1, 2]) {
    const sim = create({ lanes: { count: 3 }, spBox: { enabled: true } });
    const route = getLaneRoutes(3)[lane]; const progress = projectToLane(route, { x: 6, y: 10 }).progress;
    const hunter = spawn(sim, 'player', 'hunter', lane, progress); hunter.attackReadyAt = 0;
    sim.update(FIXED_STEP); assert.equal(sim.state.structures[0].hp, 195);
    for (const kind of ['neutral', 'minion'] as const) {
      hunter.kind = kind; if (kind === 'neutral') hunter.side = 'neutral';
      hunter.target = null; hunter.attackReadyAt = 0;
      const before = sim.state.structures[0].hp;
      sim.update(FIXED_STEP); assert.notEqual(hunter.target, sim.state.structures[0].id); assert.equal(sim.state.structures[0].hp, before);
    }
  }
});

test('SP categories independently enable, scale and cap summoned, normal/elite minion and neutral rewards', () => {
  for (const kind of ['summoned', 'minion', 'elite', 'neutral'] as const) for (const enabled of [true, false]) {
    const sim = create({ sp: { maximum: 13, passive: { enabled: false }, [kind]: { enabled, amount: 4, multiplier: 0.5 } } });
    const attacker = spawn(sim, 'player', 'hunter'); attacker.x = 6; attacker.y = 12; attacker.attack = 100; attacker.attackReadyAt = 0;
    const victim = spawn(sim, 'enemy', 'shield'); victim.x = 6; victim.y = 11.2; victim.hp = 1;
    if (kind === 'neutral') { victim.kind = 'neutral'; victim.side = 'neutral'; }
    if (kind === 'minion' || kind === 'elite') { victim.kind = 'minion'; victim.elite = kind === 'elite'; }
    sim.state.sp.player = 12; sim.update(FIXED_STEP); near(sim.state.sp.player, enabled ? 13 : 12);
  }
});
