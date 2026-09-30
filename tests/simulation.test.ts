import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, FIXED_STEP } from '../src/game/simulation.ts';
import type { UnitEntity } from '../src/game/simulation.ts';
import { UNITS, MAPS, SP_MAX, FORT_HP } from '../src/game/data.ts';
import type { UnitId, Side, WeatherId, MapId } from '../src/game/data.ts';

const deck: UnitId[] = ['warrior', 'archer', 'hunter', 'knight', 'commander'];
const create = (weather: WeatherId = 'sunny', map: MapId = 'desert', aiSides: Side[] = []) => new Simulation({ map, weather, decks: { player: [...deck], enemy: [...deck] }, aiSides, seed: 23 });
const near = (actual: number, expected: number, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

// Combat fixtures use the public state so focused scenarios do not require waiting
// for units to walk across a whole arena or inventing production-only debug APIs.
function spawn(sim: Simulation, side: Side, id: UnitId, x = 6, y = side === 'player' ? 12 : 8): UnitEntity {
  sim.state.sp[side] = 50;
  if (!sim.state.decks[side].includes(id)) sim.state.decks[side].push(id);
  assert.equal(sim.summon(side, id), true);
  const unit = sim.state.units.at(-1)!;
  unit.x = x; unit.y = y; unit.speed = 0;
  unit.attackReadyAt = 1e6; unit.skillReadyAt = 1e6;
  return unit;
}
function duel(id: UnitId, range = 0.8) {
  const sim = create();
  const attacker = spawn(sim, 'player', id, 6, 12);
  const victim = spawn(sim, 'enemy', 'shield', 6, 12 - range);
  return { sim, attacker, victim };
}

test('summons enforce selected deck, available SP, halves and fort collision without charging failed input', () => {
  const sim = create();
  assert.equal(sim.summon('player', 'mage'), false);
  assert.equal(sim.summon('player', 'knight'), false);
  assert.equal(sim.summon('player', 'warrior', { x: 5, y: 9.9 }), false);
  assert.equal(sim.summon('player', 'warrior', { x: 6, y: 19 }), false);
  assert.equal(sim.summon('player', 'warrior', { x: NaN, y: 12 }), false);
  assert.equal(sim.state.sp.player, 5);
  assert.equal(sim.summon('player', 'warrior', { x: 0, y: 10 }), true);
  assert.equal(sim.state.sp.player, 0);
  sim.state.sp.player = 5;
  assert.equal(sim.summon('player', 'warrior', { x: 0, y: 10 }), true, 'unit overlap is permitted');
  sim.state.sp.enemy = 5;
  assert.equal(sim.summon('enemy', 'warrior', { x: 6, y: 11 }), false);
  assert.equal(sim.summon('enemy', 'warrior', { x: 6, y: 5 }), true);
});

test('economy regens exactly one SP/sec, caps, and snapshots are isolated JSON', () => {
  const sim = create();
  sim.update(3);
  near(sim.state.sp.player, 8);
  sim.state.sp.player = 49.9;
  sim.update(1);
  assert.equal(sim.state.sp.player, SP_MAX);
  const copy = sim.snapshot();
  copy.forts.player.hp = 1;
  assert.equal(sim.state.forts.player.hp, FORT_HP);
  assert.deepEqual(JSON.parse(JSON.stringify(copy)), copy);
});

test('fixed-step state is independent of frame partition and seeded AI is deterministic', () => {
  const first = create('rain', 'forest', ['player', 'enemy']);
  const second = create('rain', 'forest', ['player', 'enemy']);
  first.update(60);
  for (let frame = 0; frame < 3600; frame++) second.update(1 / 60);
  assert.deepEqual(first.snapshot(), second.snapshot());
});

test('rain scales player movement but not neutral movement; fog preserves range and uses a real sector', () => {
  const sim = create('rain');
  const unit = spawn(sim, 'player', 'warrior', 6, 17);
  unit.speed = UNITS.warrior.speed;
  sim.update(1);
  near(unit.y, 17 - 1.1 * 0.8);
  sim.update(4);
  const neutral = sim.state.units.find((entity) => entity.side === 'neutral')!;
  const before = { x: neutral.x, y: neutral.y };
  sim.update(1);
  near(Math.hypot(neutral.x - before.x, neutral.y - before.y), MAPS.desert.monster.speed);
  const fog = create('fog');
  const archer = spawn(fog, 'player', 'archer', 6, 12);
  const enemy = spawn(fog, 'enemy', 'shield', 6, 7.05);
  fog.update(FIXED_STEP);
  assert.equal(archer.target, null, '4.95 U is outside fog detection 4.9');
  enemy.y = 7.1;
  fog.update(FIXED_STEP);
  assert.equal(archer.target, enemy.id);
  assert.equal(archer.range, 5);
  const sector = create();
  const warrior = spawn(sector, 'player', 'warrior', 6, 12);
  const behind = spawn(sector, 'enemy', 'shield', 6, 12.5);
  sector.update(FIXED_STEP);
  assert.equal(warrior.target, null, 'behind target is outside forward sector');
  behind.x = 7; behind.y = 12 - Math.sqrt(1 / 3);
  sector.update(FIXED_STEP);
  assert.equal(warrior.target, behind.id, '60 degree boundary is included');
});

test('target locks survive closer arrivals and detection escape; stealth and death release locks', () => {
  const { sim, attacker, victim } = duel('warrior', 2);
  sim.update(FIXED_STEP);
  assert.equal(attacker.target, victim.id);
  const arrival = spawn(sim, 'enemy', 'shield', 6, 11.5);
  victim.y = 3;
  sim.update(FIXED_STEP);
  assert.equal(attacker.target, victim.id);
  victim.hiddenUntil = 3;
  sim.update(FIXED_STEP);
  assert.equal(attacker.target, arrival.id);
  arrival.hp = 0;
  sim.update(FIXED_STEP);
  assert.equal(attacker.target, null);
});

test('off-center summons face their destination before the first detection cone', () => {
  const sim = create();
  sim.state.decks.enemy.push('shield');
  sim.state.sp.player = 50; sim.state.sp.enemy = 50;
  assert.equal(sim.summon('player', 'warrior', { x: 1, y: 10 }), true);
  assert.equal(sim.summon('enemy', 'shield', { x: 0.2, y: 9.4 }), true);
  const warrior = sim.state.units[0];
  const shield = sim.state.units[1];
  near(warrior.facingX, 5 / Math.hypot(5, 9));
  near(warrior.facingY, -9 / Math.hypot(5, 9));
  sim.update(FIXED_STEP);
  assert.equal(warrior.target, null, '82-degree target is outside the initial 60-degree half-cone');
  assert.equal(shield.hp, 200, 'first frame must not attack or lock the outside target');
});

test('equidistant targets choose oldest entity and melee stops while in range', () => {
  const { sim, attacker, victim } = duel('warrior');
  spawn(sim, 'enemy', 'shield', 6, 11.2);
  attacker.speed = 1.1; attacker.attackReadyAt = 0;
  sim.update(FIXED_STEP);
  assert.equal(attacker.target, victim.id);
  assert.equal(attacker.y, 12);
  assert.equal(victim.hp, 190);
});

test('slash damages each enemy fully, excludes friendlies, respects width; commander staggers bosses', () => {
  const { sim, attacker, victim } = duel('warrior');
  const other = spawn(sim, 'enemy', 'shield', 6.4, 11.2);
  const outside = spawn(sim, 'enemy', 'shield', 6.6, 11.2);
  const friend = spawn(sim, 'player', 'shield', 6, 11.3);
  attacker.target = victim.id; attacker.attackReadyAt = 0;
  sim.update(FIXED_STEP);
  assert.equal(victim.hp, 190); assert.equal(other.hp, 190);
  assert.equal(outside.hp, 200); assert.equal(friend.hp, 200);
  const captain = duel('commander');
  captain.attacker.attackReadyAt = 0; captain.victim.boss = true;
  captain.sim.update(FIXED_STEP);
  assert.equal(captain.victim.hp, 170);
  near(captain.victim.stunUntil - captain.sim.state.time, 0.15);
});

test('projectiles travel at 8 U/sec, strike only the selected target; explosions hit hidden targets', () => {
  const { sim, attacker, victim } = duel('archer', 4);
  attacker.attackReadyAt = 0;
  const other = spawn(sim, 'enemy', 'shield', 6.2, 8);
  sim.update(0.2);
  assert.equal(victim.hp, 200);
  near(sim.state.projectiles[0].y, 12 - 1.6);
  sim.update(0.3);
  assert.equal(victim.hp, 185); assert.equal(other.hp, 200);
  const mage = duel('mage', 4);
  const hidden = spawn(mage.sim, 'enemy', 'rogue', 6.5, 8);
  hidden.hiddenUntil = 3;
  mage.attacker.attackReadyAt = 0;
  mage.sim.update(0.5);
  assert.equal(hidden.hp, 40);
  assert.ok(hidden.hiddenUntil > mage.sim.state.time);
});

test('archer skill fires 45 damage and pushes away from caster over exactly 0.2 seconds', () => {
  const { sim, attacker, victim } = duel('archer', 4);
  attacker.skillReadyAt = 0;
  sim.update(0.5);
  assert.equal(victim.hp, 155);
  assert.equal(victim.y, 8, 'push starts after projectile impact');
  sim.update(0.1);
  near(victim.y, 7.25);
  sim.update(0.1);
  near(victim.y, 6.5);
  assert.equal(victim.knockback, null);
});

test('first skills wait full cooldown, target-required readiness persists without enemies', () => {
  const sim = create();
  const knight = spawn(sim, 'player', 'knight', 6, 17);
  knight.skillReadyAt = 10;
  sim.update(9.9);
  assert.equal(knight.charge, null);
  sim.update(0.1);
  assert.ok(knight.charge);
  const warrior = spawn(sim, 'player', 'warrior', 6, 16);
  warrior.skillReadyAt = sim.state.time + 0.1;
  sim.update(0.2);
  assert.ok(warrior.skillReadyAt < sim.state.time);
  const victim = spawn(sim, 'enemy', 'shield', 6, 15.2);
  warrior.target = victim.id;
  sim.update(FIXED_STEP);
  assert.equal(victim.hp, 175);
  near(warrior.attackReadyAt - sim.state.time, 1.2);
});

test('warrior/shield/hunter skills apply exact damage and boss control/double damage', () => {
  const warrior = duel('warrior');
  warrior.attacker.skillReadyAt = 0; warrior.attacker.attackReadyAt = 0;
  warrior.sim.update(FIXED_STEP);
  assert.equal(warrior.victim.hp, 175, 'skill takes priority over basic attack');
  const shield = duel('shield');
  shield.attacker.skillReadyAt = 0; shield.victim.boss = true;
  shield.sim.update(FIXED_STEP);
  assert.equal(shield.victim.hp, 190);
  shield.sim.update(0.2);
  near(shield.victim.y, 11.2 - 1.5);
  const hunter = duel('hunter');
  hunter.victim.side = 'neutral'; hunter.victim.boss = true;
  hunter.attacker.skillReadyAt = 0;
  hunter.sim.update(FIXED_STEP);
  assert.equal(hunter.victim.hp, 170);
  hunter.attacker.attackReadyAt = 0;
  hunter.sim.update(FIXED_STEP);
  assert.equal(hunter.victim.hp, 160);
});

test('rogue stealth lasts 3 seconds, accelerates without attacking, remains after AoE and releases tracking', () => {
  const { sim, attacker, victim } = duel('rogue');
  attacker.speed = UNITS.rogue.speed; attacker.skillReadyAt = 0;
  victim.target = attacker.id;
  sim.update(FIXED_STEP);
  assert.ok(attacker.hiddenUntil > 0);
  const y = attacker.y;
  sim.update(1);
  near(attacker.y, y - 1.4 * 1.5);
  assert.equal(victim.hp, 200);
  assert.notEqual(victim.target, attacker.id);
  sim.update(2);
  assert.ok(attacker.hiddenUntil <= sim.state.time + 1e-6);
});

test('knight charges 4 U, hits each crossed enemy once, uses rain/slow and is interrupted by control', () => {
  const { sim, attacker, victim } = duel('knight', 1);
  const second = spawn(sim, 'enemy', 'shield', 6, 9);
  attacker.skillReadyAt = 0;
  sim.update(FIXED_STEP);
  sim.update(0.7);
  near(attacker.y, 8); assert.equal(victim.hp, 175); assert.equal(second.hp, 175);
  const rain = create('rain');
  const knight = spawn(rain, 'player', 'knight', 6, 15);
  knight.skillReadyAt = 0;
  rain.update(FIXED_STEP); rain.update(0.5);
  near(knight.y, 15 - 6 * 0.8 * 0.5);
  knight.stunUntil = rain.state.time + 2;
  rain.update(FIXED_STEP);
  assert.equal(knight.charge, null);
});

test('warlock stuns nearest eligible target, deals no skill damage, boss is not immune', () => {
  const { sim, attacker, victim } = duel('warlock', 4);
  const nearest = spawn(sim, 'enemy', 'shield', 6, 10);
  nearest.boss = true;
  attacker.target = victim.id; attacker.skillReadyAt = 0;
  sim.update(FIXED_STEP);
  near(nearest.stunUntil - sim.state.time, 2);
  assert.equal(nearest.hp, 200); assert.equal(victim.stunUntil, 0);
});

test('commander buffs only existing allied units including himself, divides attack interval by 1.5', () => {
  const { sim, attacker, victim } = duel('commander');
  const ally = spawn(sim, 'player', 'warrior', 6, 12.1);
  attacker.skillReadyAt = 0;
  sim.update(FIXED_STEP);
  assert.equal(ally.buffUntil, attacker.buffUntil); assert.equal(victim.buffUntil, 0);
  const later = spawn(sim, 'player', 'warrior', 8, 14);
  assert.equal(later.buffUntil, 0);
  ally.target = victim.id; ally.attackReadyAt = 0;
  sim.update(FIXED_STEP);
  near(ally.attackReadyAt - sim.state.time, 1.2 / 1.5);
});

test('mage burn ticks at hit+1/2/3, refresh does not stack or reset next tick', () => {
  const { sim, attacker, victim } = duel('mage', 4);
  attacker.skillReadyAt = 0;
  sim.update(0.5);
  assert.equal(victim.hp, 180);
  const next = victim.burn!.nextTickAt;
  sim.update(0.4);
  attacker.skillReadyAt = sim.state.time;
  sim.update(0.5);
  assert.equal(victim.hp, 160);
  assert.equal(victim.burn!.nextTickAt, next);
  attacker.attackReadyAt = 1e6;
  sim.update(0.1);
  assert.equal(victim.hp, 157);
  sim.update(2);
  assert.equal(victim.hp, 151);
});

test('ice zones tick five times, overlap applies one damage/slow, hidden targets and bosses remain susceptible', () => {
  const { sim, attacker, victim } = duel('archmage', 4);
  victim.boss = true; attacker.skillReadyAt = 0;
  sim.update(FIXED_STEP);
  const first = sim.state.zones[0];
  sim.state.zones.push({ ...first, id: first.id + 100 });
  victim.hiddenUntil = 100; victim.speed = 1;
  victim.target = null;
  const before = victim.y;
  sim.update(0.5);
  near(victim.y, before + 0.7 * 1.5 * 0.5);
  victim.speed = 0;
  sim.update(4.5);
  assert.equal(victim.hp, 180);
  assert.equal(sim.state.zones.length, 0);
});

test('ice slow immediately clears outside the final zone; distinct burn and ice damage combine', () => {
  const { sim, attacker, victim } = duel('archmage', 4);
  attacker.skillReadyAt = 0;
  sim.update(FIXED_STEP);
  attacker.attackReadyAt = 1e6;
  victim.burn = { sourceSide: 'player', damage: 3, expiresAt: sim.state.time + 3, nextTickAt: sim.state.time + 1 };
  sim.update(3);
  assert.equal(victim.hp, 179, 'three 4-point ice ticks plus three 3-point burns');
  victim.x = 10; victim.speed = 1;
  const before = { x: victim.x, y: victim.y };
  sim.update(0.5);
  near(Math.hypot(victim.x - before.x, victim.y - before.y), 0.5);
});

test('neutral entities never target each other, can target either player, then march to designated fort', () => {
  const sim = create();
  const neutral = spawn(sim, 'player', 'shield', 6, 12);
  neutral.side = 'neutral'; neutral.targetSide = 'enemy';
  const other = spawn(sim, 'enemy', 'shield', 6, 11.2);
  other.side = 'neutral';
  sim.update(FIXED_STEP);
  assert.equal(neutral.target, null);
  const opponent = spawn(sim, 'player', 'warrior', 6, 11);
  sim.update(FIXED_STEP);
  assert.equal(neutral.target, opponent.id);
  opponent.hp = 0; neutral.speed = 1;
  const before = neutral.y;
  sim.update(FIXED_STEP);
  assert.ok(neutral.y < before);
});

test('surrender resolves once and freezes clock, economy, warnings and future summons', () => {
  const sim = create();
  sim.surrender('player');
  const snapshot = sim.snapshot();
  sim.surrender('enemy'); sim.update(300);
  assert.deepEqual(sim.state.result, { winner: 'enemy', reason: 'surrender' });
  assert.deepEqual(sim.snapshot(), snapshot);
  assert.equal(sim.summon('player', 'warrior'), false);
});

test('forts receive skill and burn damage, ignore controls; destruction precedes timeout and simultaneous destruction draws', () => {
  const sim = create();
  const mage = spawn(sim, 'player', 'mage', 6, 5);
  mage.target = 'fort:enemy'; mage.skillReadyAt = 0;
  sim.update(0.5);
  assert.equal(sim.state.forts.enemy.hp, 980);
  mage.attackReadyAt = 1e6;
  sim.update(3);
  assert.equal(sim.state.forts.enemy.hp, 971);
  const ending = create();
  const player = spawn(ending, 'player', 'hunter', 6, 2.5);
  const enemy = spawn(ending, 'enemy', 'hunter', 6, 17.5);
  player.target = 'fort:enemy'; enemy.target = 'fort:player';
  player.attackReadyAt = 0; enemy.attackReadyAt = 0;
  ending.state.forts.player.hp = 5; ending.state.forts.enemy.hp = 5;
  ending.state.time = 300 - FIXED_STEP;
  ending.update(FIXED_STEP);
  assert.deepEqual(ending.state.result, { winner: 'draw', reason: 'fort-destroyed' });
  const snapshot = ending.snapshot(); ending.update(10);
  assert.deepEqual(ending.snapshot(), snapshot);
});

test('neutral kills of summoned units reward opponent, neutral simultaneous kills reward first processed player only', () => {
  const { sim, attacker, victim } = duel('hunter');
  victim.side = 'neutral'; victim.attack = 100; victim.attackReadyAt = 0;
  victim.target = attacker.id;
  sim.state.sp.enemy = 10;
  sim.update(FIXED_STEP);
  near(sim.state.sp.enemy, 11 + FIXED_STEP);
  const two = create();
  const first = spawn(two, 'player', 'hunter', 6, 12);
  const second = spawn(two, 'enemy', 'hunter', 6, 10.4);
  const neutral = spawn(two, 'enemy', 'shield', 6, 11.2);
  neutral.side = 'neutral'; neutral.hp = 6; neutral.reward = 1;
  first.target = neutral.id; second.target = neutral.id;
  first.attackReadyAt = 0; second.attackReadyAt = 0;
  two.state.sp.player = 10; two.state.sp.enemy = 10;
  two.update(FIXED_STEP);
  near(two.state.sp.player, 11 + FIXED_STEP);
  near(two.state.sp.enemy, 10 + FIXED_STEP);
});

test('wave schedule/count/growth and boss warning positions match through wave 15', () => {
  const sim = create();
  for (const side of ['player', 'enemy'] as Side[]) sim.state.forts[side].hp = 1e9;
  sim.update(5 - FIXED_STEP);
  assert.equal(sim.state.wave, 0);
  sim.update(FIXED_STEP);
  assert.equal(sim.state.wave, 1);
  assert.equal(sim.state.units.length, 12);
  const original = sim.state.units[0];
  assert.equal(original.maxHp, 6);
  sim.update(77);
  assert.equal(sim.state.time, 82);
  assert.equal(sim.state.warnings.length, 2);
  const warnings = structuredClone(sim.state.warnings);
  sim.update(3);
  assert.equal(sim.state.wave, 5);
  const bosses = sim.state.units.filter((unit) => unit.boss);
  assert.equal(bosses.length, 2);
  for (const boss of bosses) {
    near(boss.maxHp, 180 * 1.07 ** 4);
    const warning = warnings.find((item) => item.targetSide === boss.targetSide)!;
    assert.ok(Math.hypot(boss.x - warning.x, boss.y - warning.y) < 0.1);
  }
  assert.equal(original.maxHp, 6, 'already living entities keep old stats');
  sim.update(200);
  assert.equal(sim.state.wave, 15);
  assert.equal(sim.state.units.filter((unit) => unit.boss).length, 6);
  near(sim.state.units.at(-1)!.maxHp, 180 * 1.07 ** 14);
  sim.update(15);
  assert.equal(sim.state.result?.reason, 'timeout');
  assert.equal(sim.state.wave, 15);
});

test('all 12 environments finish fair AI vs AI matches with low and expensive summons and finite JSON', () => {
  for (const map of ['desert', 'forest', 'swamp', 'road'] as MapId[]) for (const weather of ['sunny', 'rain', 'fog'] as WeatherId[]) {
    const sim = create(weather, map, ['player', 'enemy']);
    const seen = new Set<UnitId>();
    for (let second = 0; second < 300 && !sim.state.result; second++) {
      sim.update(1);
      for (const unit of sim.state.units) if (unit.unitId) seen.add(unit.unitId);
      for (const side of ['player', 'enemy'] as Side[]) assert.ok(sim.state.sp[side] >= 0 && sim.state.sp[side] <= SP_MAX);
    }
    assert.ok(sim.state.result, `${map}/${weather} completes`);
    assert.ok(seen.has('hunter'), 'AI uses affordable defensive unit');
    assert.ok(seen.has('commander'), 'AI can save for expensive units');
    assert.deepEqual(JSON.parse(JSON.stringify(sim.snapshot())), sim.snapshot());
    assert.ok(sim.state.units.every((unit) => Number.isFinite(unit.x + unit.y + unit.hp)));
  }
});
