import assert from 'node:assert/strict';
import test from 'node:test';
import { BattleSnapshotInterpolator, NETWORK_RENDER_DELAY } from '../src/game/battle-presentation.ts';
import { Simulation } from '../src/game/simulation.ts';
import type { BattleState } from '../src/game/simulation.ts';
import { getLaneRoutes, pointOnLane, projectToLane } from '../src/game/lanes.ts';

function snapshot(time: number, x: number): BattleState {
  const simulation = new Simulation({ map: 'desert', weather: 'rain', decks: { player: ['warrior'], enemy: ['warrior'] }, seed: 3 });
  assert.equal(simulation.summon('player', 'warrior'), true);
  const state = simulation.snapshot();
  state.time = time; state.units[0].x = x;
  state.projectiles = [{
    id: 2, side: 'player', sourceId: 1, target: 'fort:enemy', x: x + 1, y: 4,
    sourceX: 0, sourceY: 4, targetX: 10, targetY: 4, damage: 1, radius: 0, burn: false, stagger: 0, knockback: 0,
  }];
  return state;
}
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('network rendering follows lane bends instead of cutting across the terrain', () => {
  const simulation = new Simulation({ map: 'road', weather: 'sunny', decks: { player: ['warrior'], enemy: ['warrior'] }, rules: { lanes: { count: 3 } } });
  assert.equal(simulation.summon('player', 'warrior'), true);
  const route = getLaneRoutes(3)[0];
  const previous = simulation.snapshot();
  const latest = simulation.snapshot();
  const bend = route.cumulative[1];
  for (const [state, progress] of [[previous, bend - 0.6], [latest, bend + 0.6]] as const) {
    Object.assign(state.units[0], { lane: 0, laneEntering: false, laneProgress: progress }, pointOnLane(route, progress));
  }
  latest.time = 0.1;
  const interpolation = new BattleSnapshotInterpolator();
  interpolation.push(previous, 0); interpolation.push(latest, 100);
  for (const offset of [20, 50, 80]) {
    const frame = interpolation.sample(NETWORK_RENDER_DELAY + offset)!;
    near(projectToLane(route, frame.state.units[0]).distance, 0);
  }
  const middle = interpolation.sample(NETWORK_RENDER_DELAY + 50)!;
  const point = pointOnLane(route, bend);
  near(middle.state.units[0].x, point.x); near(middle.state.units[0].y, point.y);
});

test('100 ms snapshots render continuous unit and projectile positions between authoritative updates', () => {
  const interpolation = new BattleSnapshotInterpolator();
  interpolation.push(snapshot(0, 0), 0);
  interpolation.push(snapshot(0.1, 1), 100);
  interpolation.push(snapshot(0.2, 2), 200);
  const first = interpolation.sample(NETWORK_RENDER_DELAY + 25)!;
  const middle = interpolation.sample(NETWORK_RENDER_DELAY + 50)!;
  const last = interpolation.sample(NETWORK_RENDER_DELAY + 75)!;
  near(first.state.units[0].x, 0.25); near(middle.state.units[0].x, 0.5); near(last.state.units[0].x, 0.75);
  near(middle.state.projectiles[0].x, 1.5); near(middle.visualTime, 0.05);
  assert.equal(middle.state.time, 0.2);
});

test('resources, HP, hit effects and hidden status use the latest state while drawing coordinates lag', () => {
  const interpolation = new BattleSnapshotInterpolator();
  const previous = snapshot(1, 0);
  const latest = snapshot(1.1, 1);
  latest.sp.player = 0; latest.forts.player.hp = 500;
  latest.units[0].hp = 12; latest.units[0].hiddenUntil = 1.08; latest.units[0].stunUntil = 1.2;
  latest.effects = [{ kind: 'hit', x: 1, y: 4, expiresAt: 1.4 }];
  const untouched = structuredClone(latest);
  interpolation.push(previous, 1_000); interpolation.push(latest, 1_100);
  const frame = interpolation.sample(1_200)!;
  near(frame.state.units[0].x, 0.5); near(frame.visualTime, 1.05);
  assert.equal(frame.state.sp.player, 0); assert.equal(frame.state.forts.player.hp, 500); assert.equal(frame.state.units[0].hp, 12);
  assert.equal(frame.state.units[0].hiddenUntil > frame.state.time, false);
  assert.equal(frame.state.units[0].stunUntil > frame.state.time, true);
  assert.deepEqual(frame.state.effects, latest.effects);
  assert.deepEqual(latest, untouched);
});

test('jittered arrivals interpolate by arrival times without reversing the visual clock', () => {
  const interpolation = new BattleSnapshotInterpolator();
  interpolation.push(snapshot(0, 0), 0);
  interpolation.push(snapshot(0.1, 1), 120);
  interpolation.push(snapshot(0.2, 2), 210);
  const times: number[] = [];
  const positions: number[] = [];
  for (let now = 150; now <= 360; now += 15) {
    const frame = interpolation.sample(now)!;
    times.push(frame.visualTime); positions.push(frame.state.units[0].x);
  }
  assert.ok(times.every((value, index) => index === 0 || value >= times[index - 1]));
  assert.ok(positions.every((value, index) => index === 0 || value >= positions[index - 1]));
  near(positions.at(-1)!, 2);
});

test('missing snapshots hold known positions and resume smoothly when a delayed packet arrives', () => {
  const interpolation = new BattleSnapshotInterpolator();
  interpolation.push(snapshot(0, 0), 0); interpolation.push(snapshot(0.1, 1), 100);
  near(interpolation.sample(500)!.state.units[0].x, 1);
  near(interpolation.sample(1_000)!.state.units[0].x, 1);
  interpolation.push(snapshot(1, 10), 1_000);
  near(interpolation.sample(1_000)!.state.units[0].x, 1);
  near(interpolation.sample(1_050)!.state.units[0].x, 4);
  near(interpolation.sample(1_100)!.state.units[0].x, 7);
  near(interpolation.sample(1_150)!.state.units[0].x, 10);
  near(interpolation.sample(10_000)!.state.units[0].x, 10);
});

test('new entities appear at their spawn positions and never move backwards when the buffer catches up', () => {
  const interpolation = new BattleSnapshotInterpolator();
  const empty = snapshot(0, 0); empty.units = []; empty.projectiles = [];
  interpolation.push(empty, 0);
  interpolation.push(snapshot(0.1, 1), 100);
  near(interpolation.sample(100)!.state.units[0].x, 1);
  interpolation.push(snapshot(0.2, 2), 200);
  near(interpolation.sample(200)!.state.units[0].x, 1);
  near(interpolation.sample(300)!.state.units[0].x, 1.5);
  near(interpolation.sample(350)!.state.units[0].x, 2);
});

test('deleted units and projectiles disappear immediately without lingering interpolation ghosts', () => {
  const interpolation = new BattleSnapshotInterpolator();
  interpolation.push(snapshot(0, 0), 0);
  const removed = snapshot(0.1, 1); removed.units = []; removed.projectiles = [];
  interpolation.push(removed, 100);
  assert.deepEqual(interpolation.sample(100)!.state.units, []);
  assert.deepEqual(interpolation.sample(100)!.state.projectiles, []);
});

test('old packets cannot rewind a battle or revive it after a result; rematch reset accepts fresh IDs and time', () => {
  const interpolation = new BattleSnapshotInterpolator();
  interpolation.push(snapshot(10, 4), 1_000);
  assert.equal(interpolation.push(snapshot(9, 0), 1_100), false);
  const result = snapshot(10, 4); result.result = { winner: 'player', reason: 'surrender' };
  assert.equal(interpolation.push(result, 1_200), true);
  assert.equal(interpolation.sample(1_200)!.state, result);
  assert.equal(interpolation.push(snapshot(10.1, 5), 1_300), false);
  assert.equal(interpolation.sample(1_300)!.state.result?.winner, 'player');
  interpolation.reset(); assert.equal(interpolation.sample(1_300), null);
  const rematch = snapshot(0, 9);
  assert.equal(interpolation.push(rematch, 1_400), true);
  near(interpolation.sample(1_400)!.state.units[0].x, 9);
  assert.equal(interpolation.sample(1_400)!.state.time, 0);
});
