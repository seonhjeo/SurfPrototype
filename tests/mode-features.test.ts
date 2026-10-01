import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, FIXED_STEP } from '../src/game/simulation.ts';
import type { UnitEntity } from '../src/game/simulation.ts';
import { GAME_MODES, MAPS, UNITS, FORT_RADIUS, resolveModeRules } from '../src/game/data.ts';
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

test('the sole standard mode preserves the default economy and feature settings', () => {
  assert.deepEqual(Object.keys(GAME_MODES), ['standard']);
  for (const [id, mode] of Object.entries(GAME_MODES)) {
    const rules = resolveModeRules(id as GameModeId);
    assert.equal(rules.lanes.count, 0);
    assert.equal(rules.minions.enabled, false); assert.equal(rules.towers.enabled, false); assert.equal(rules.spBox.enabled, false);
    assert.equal(rules.fortAttacks.catapult.enabled, false); assert.equal(rules.fortAttacks.oil.enabled, false);
    const sim = new Simulation({ map: 'desert', weather: 'sunny', gameMode: id as GameModeId, decks: { player: deck, enemy: deck } });
    assert.deepEqual(sim.state.rules, mode.rules);
    assert.equal(sim.state.sp.player, 5);
    assert.equal(rules.neutralWaves.count, null);
    assert.deepEqual(rules.sp.towerLoss, { enabled: false, amount: 5 });
    assert.equal(rules.sp.passive.enabled, true);
    assert.equal(rules.sp.summoned.enabled, true);
    assert.equal(rules.sp.neutral.enabled, true);
    assert.equal(sim.state.structures.length, 0);
  }
});

test('nested rules merge, snapshots are isolated, and invalid geometry/economy are rejected', () => {
  const sim = create({ lanes: { count: 2 }, towers: { enabled: true, laneCount: 2 }, sp: { initial: 17, maximum: 22, passive: { enabled: true, amount: 2.5 } } });
  assert.equal(sim.state.rules.towers.damage, 12); assert.equal(sim.state.sp.player, 17);
  sim.update(2); near(sim.state.sp.player, 22);
  const snapshot = sim.snapshot(); snapshot.rules.sp.maximum = 1;
  assert.equal(sim.state.rules.sp.maximum, 22); assert.equal(GAME_MODES.standard.rules.sp.maximum, 50);
  assert.throws(() => create({ lanes: { count: 4 as 3 } }));
  assert.throws(() => create({ sp: { maximum: 0 } }));
  assert.throws(() => create({ towers: { interval: 0 } }));
  assert.throws(() => create({ minions: { eliteEvery: 0 } }));
  assert.throws(() => create({ spBox: { radius: 4 } }));
  for (const count of [0, 1.5, 11]) {
    assert.throws(() => create({ neutralWaves: { count } }));
    assert.throws(() => create({ minions: { perLane: count } }));
  }
  for (const count of [0, 1.5, 4]) {
    assert.throws(() => create({ towers: { count } }));
    assert.throws(() => create({ towers: { laneCount: count } }));
    assert.throws(() => create({ spBox: { count } }));
  }
  for (const amount of [0, 1.5, 51]) assert.throws(() => create({ sp: { towerLoss: { amount } } }));
});

test('neutral counts override every map per spawn point and destination side, while null preserves map defaults', () => {
  for (const map of Object.keys(MAPS) as MapId[]) for (const count of [null, 1, 10]) {
    const sim = create({ neutralWaves: { enabled: true, count } }, map);
    sim.update(5);
    const expected = count ?? MAPS[map].monstersPerSpawnPoint;
    assert.equal(sim.state.units.length, expected * 4);
    for (const side of ['player', 'enemy']) assert.equal(sim.state.units.filter((unit) => unit.targetSide === side).length, expected * 2);
    for (const unit of sim.state.units) near(unit.maxHp, MAPS[map].monster.hp);
  }
  const disabled = create({ neutralWaves: { enabled: false, count: 10 } });
  disabled.update(85);
  assert.equal(disabled.state.units.length, 0);
  assert.equal(disabled.state.warnings.length, 0);
});

test('minion quantities preserve stats and add one elite per side and movement lane on the fifth wave', () => {
  for (const lanes of [0, 1, 2, 3] as const) for (const perLane of [1, 10]) {
    const sim = create({ lanes: { count: lanes }, minions: { enabled: true, perLane } });
    sim.update(5);
    const groups = Math.max(1, lanes) * 2;
    assert.equal(sim.state.units.length, groups * perLane);
    for (const unit of sim.state.units) near(unit.maxHp, MAPS.road.monster.hp * 1.5);
    sim.state.units = [];
    sim.state.wave = 4;
    sim.state.time = 85 - FIXED_STEP;
    sim.update(FIXED_STEP);
    assert.equal(sim.state.units.filter((unit) => !unit.elite).length, groups * perLane);
    assert.equal(sim.state.units.filter((unit) => unit.elite).length, groups);
    for (const elite of sim.state.units.filter((unit) => unit.elite)) near(elite.maxHp, MAPS.road.boss.hp * 1.5);
  }
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
    const sim = create({ lanes: { count }, towers: { enabled: true, laneCount: Math.max(1, count) } });
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

test('tower layout and quantities are independent of movement lanes, symmetric and clear of structures and forts', () => {
  for (const movement of [0, 1, 2, 3] as const) for (const laneCount of [1, 2, 3]) for (const count of [1, 2, 3]) for (const boxes of [1, 2, 3]) {
    const sim = create({ lanes: { count: movement }, towers: { enabled: true, laneCount, count }, spBox: { enabled: true, count: boxes } });
    const towers = sim.state.structures.filter((entity) => entity.kind === 'tower');
    assert.equal(towers.length, 2 * laneCount * count);
    assert.ok(towers.every((entity) => entity.lane === null), 'tower layout IDs never restrict movement-lane combat');
    const friendly = towers.filter((entity) => entity.side === 'player');
    const enemy = towers.filter((entity) => entity.side === 'enemy');
    for (let index = 0; index < friendly.length; index++) {
      near(friendly[index].x, enemy[index].x); near(friendly[index].y + enemy[index].y, 20);
      assert.equal(friendly[index].hp, 250);
    }
    if (count === 1) for (const [index, route] of getLaneRoutes(laneCount).entries()) {
      const legacy = pointOnLane(route, route.length * sim.state.rules.towers.progress);
      near(friendly[index].x, legacy.x); near(friendly[index].y, legacy.y);
    }
    for (const [index, structure] of sim.state.structures.entries()) {
      for (const other of sim.state.structures.slice(index + 1)) {
        assert.ok(Math.hypot(structure.x - other.x, structure.y - other.y) >= structure.radius + other.radius);
      }
      for (const fort of Object.values(sim.state.forts)) assert.ok(Math.hypot(structure.x - fort.x, structure.y - fort.y) >= structure.radius + FORT_RADIUS);
    }
    const baseline = create({ lanes: { count: 0 }, towers: { enabled: true, laneCount, count }, spBox: { enabled: true, count: boxes } });
    assert.deepEqual(sim.state.structures, baseline.state.structures, 'changing only movement lanes leaves the tower layout intact');
  }
});

test('towers select nearby enemy units across movement lanes', () => {
  const sim = create({ lanes: { count: 3 }, towers: { enabled: true, laneCount: 1 } });
  const route = getLaneRoutes(3)[2];
  const victim = spawn(sim, 'enemy', 'shield', 2, route.cumulative[2]);
  sim.update(1);
  assert.ok(victim.hp < victim.maxHp);
  assert.ok(sim.state.structures.some((tower) => tower.side === 'player' && tower.attackReadyAt > 0));
});

test('destroyed towers reward their owner once for summoned, minion or neutral attacks, respecting OFF and the SP cap', () => {
  for (const owner of ['player', 'enemy'] as const) for (const kind of ['summoned', 'minion', 'neutral'] as const) for (const enabled of [false, true]) for (const initial of [10, 49, 50]) {
    const sim = create({ towers: { enabled: true, hp: 1 }, sp: { passive: { enabled: false }, towerLoss: { enabled, amount: 7 } } });
    for (const tower of sim.state.structures) tower.attackReadyAt = 1e6;
    const tower = sim.state.structures.find((entity) => entity.side === owner)!;
    const opponent = owner === 'player' ? 'enemy' : 'player';
    for (let index = 0; index < 2; index++) {
      const attacker = spawn(sim, opponent, 'hunter');
      Object.assign(attacker, { x: tower.x, y: tower.y + (owner === 'player' ? -0.8 : 0.8), target: tower.id, attackReadyAt: 0, attack: 1000, kind });
      if (kind === 'neutral') attacker.side = 'neutral';
    }
    sim.state.sp[owner] = initial; sim.state.sp[opponent] = 10;
    sim.update(FIXED_STEP);
    assert.equal(tower.hp, 0);
    near(sim.state.sp[owner], enabled ? Math.min(50, initial + 7) : initial);
    assert.equal(sim.state.sp[opponent], 10, 'the attacking side receives no tower loss reward');
    assert.ok(!sim.state.structures.some((entity) => entity.id === tower.id));
    sim.update(1);
    near(sim.state.sp[owner], enabled ? Math.min(50, initial + 7) : initial, 1e-6);
    near(sim.state.sp[opponent], 10);
  }
});

test('simultaneous tower losses pay per tower and to each owner independently', () => {
  const sim = create({ towers: { enabled: true, count: 2, hp: 1 }, sp: { passive: { enabled: false }, towerLoss: { enabled: true, amount: 5 } } });
  for (const tower of sim.state.structures) {
    tower.attackReadyAt = 1e6;
    const opponent = tower.side === 'player' ? 'enemy' : 'player';
    const attacker = spawn(sim, opponent, 'hunter');
    Object.assign(attacker, { x: tower.x, y: tower.y + (tower.side === 'player' ? -0.8 : 0.8), target: tower.id, attackReadyAt: 0 });
  }
  sim.state.sp.player = 0; sim.state.sp.enemy = 0;
  sim.update(FIXED_STEP);
  assert.equal(sim.state.structures.length, 0);
  assert.deepEqual(sim.state.sp, { player: 10, enemy: 10 });
});

test('burn and ice tower deaths pay their owner once, including overlapping persistent damage', () => {
  for (const owner of ['player', 'enemy'] as const) for (const effect of ['burn', 'ice', 'both']) for (const amount of [1, 7, 50]) {
    const sim = create({ towers: { enabled: true, hp: 1 }, sp: { passive: { enabled: false }, towerLoss: { enabled: true, amount } } });
    const tower = sim.state.structures.find((entity) => entity.side === owner)!;
    const opponent = owner === 'player' ? 'enemy' : 'player';
    if (effect !== 'ice') tower.burn = { sourceSide: 'neutral', damage: 2, expiresAt: 2, nextTickAt: FIXED_STEP };
    if (effect !== 'burn') sim.state.zones.push({ id: 1000, side: opponent, lane: null, x: tower.x, y: tower.y, radius: 2, expiresAt: 2, nextTickAt: FIXED_STEP });
    sim.state.sp.player = 0; sim.state.sp.enemy = 0;
    sim.update(FIXED_STEP);
    assert.equal(tower.hp, 0);
    assert.equal(sim.state.sp[owner], amount);
    assert.equal(sim.state.sp[opponent], 0);
    sim.update(2);
    assert.equal(sim.state.sp[owner], amount);
    assert.equal(sim.state.sp[opponent], 0);
  }
});

test('box damage income and tower loss rewards remain independent', () => {
  const sim = create({ towers: { enabled: true, hp: 1 }, spBox: { enabled: true, hp: 1 }, sp: { passive: { enabled: false }, towerLoss: { enabled: true, amount: 7 } } });
  const box = sim.state.structures.find((entity) => entity.kind === 'sp-box')!;
  const tower = sim.state.structures.find((entity) => entity.side === 'player')!;
  const attacker = spawn(sim, 'player', 'hunter');
  Object.assign(attacker, { x: box.x, y: box.y + 1, target: box.id, attackReadyAt: 0 });
  sim.state.sp.player = 0; sim.state.sp.enemy = 0;
  sim.update(FIXED_STEP);
  near(sim.state.sp.player, 0.1);
  tower.burn = { sourceSide: 'neutral', damage: 2, expiresAt: 2, nextTickAt: sim.state.time + FIXED_STEP };
  sim.update(FIXED_STEP);
  near(sim.state.sp.player, 7.1);
  near(sim.state.sp.enemy, 0);
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

test('one to three boxes use symmetric center positions and independently preserve respawn positions and timers', () => {
  for (const count of [1, 2, 3]) {
    const sim = create({ spBox: { enabled: true, count } });
    const expected = count === 1 ? [6] : count === 2 ? [4, 8] : [2, 6, 10];
    assert.deepEqual(sim.state.structures.map((box) => box.x), expected);
    assert.ok(sim.state.structures.every((box) => box.y === 10 && box.hp === 200));
  }
  const sim = create({ spBox: { enabled: true, count: 3, hp: 1, respawnDelay: 1 } });
  const hunter = spawn(sim, 'player', 'hunter');
  hunter.x = 2; hunter.y = 11; hunter.attackReadyAt = 0;
  sim.update(FIXED_STEP);
  assert.deepEqual(sim.state.structures.map((box) => box.x), [6, 10]);
  hunter.attackReadyAt = 1e6;
  sim.update(0.4);
  hunter.x = 6; hunter.y = 11; hunter.target = null; hunter.attackReadyAt = 0;
  sim.update(FIXED_STEP);
  assert.deepEqual(sim.state.structures.map((box) => box.x), [10]);
  sim.state.units = [];
  sim.update(0.6);
  assert.deepEqual(sim.state.structures.map((box) => box.x).sort((a, b) => a - b), [2, 10]);
  sim.update(0.4);
  assert.deepEqual(sim.state.structures.map((box) => box.x).sort((a, b) => a - b), [2, 6, 10]);
  assert.ok(sim.state.structures.every((box) => box.y === 10 && box.hp === 1));
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
