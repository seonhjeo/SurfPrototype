import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, WEATHER } from '../src/game/data.ts';
import type { MapId, WeatherId } from '../src/game/data.ts';
import { createMatchSettings, resolveMatchEnvironment, resolveMatchSettings, validateMatchSettings } from '../src/game/match-settings.ts';

test('fixed environment choices survive repeated matches without consuming randomness', () => {
  for (const map of Object.keys(MAPS) as MapId[]) for (const weather of Object.keys(WEATHER) as WeatherId[]) {
    const settings = createMatchSettings();
    settings.environment = { map, weather };
    const validated = validateMatchSettings(settings);
    const random = () => { throw new Error('a fixed choice must not be randomized'); };
    assert.deepEqual(resolveMatchEnvironment(validated.environment, random), { map, weather });
    assert.deepEqual(resolveMatchEnvironment(validated.environment, random), { map, weather });
  }
});

test('only random environment fields are drawn again at preparation and rematch', () => {
  const draws = [0, 0.99];
  let index = 0;
  const random = () => draws[index++];
  assert.deepEqual(resolveMatchEnvironment({ map: 'forest', weather: 'random' }, random), { map: 'forest', weather: 'sunny' });
  assert.deepEqual(resolveMatchEnvironment({ map: 'forest', weather: 'random' }, random), { map: 'forest', weather: 'fog' });
  assert.equal(index, 2);
  assert.deepEqual(resolveMatchEnvironment({ map: 'random', weather: 'rain' }, () => 0), { map: 'desert', weather: 'rain' });
  assert.deepEqual(resolveMatchEnvironment({ map: 'random', weather: 'rain' }, () => 0.99), { map: 'road', weather: 'rain' });
  assert.deepEqual(resolveMatchEnvironment(createMatchSettings().environment, () => 0), { map: 'desert', weather: 'sunny' });
});

test('environment and tower-loss settings are strictly validated and snapshotted', () => {
  const settings = createMatchSettings();
  assert.deepEqual(settings.environment, { map: 'random', weather: 'random' });
  assert.deepEqual(resolveMatchSettings(settings).sp.towerLoss, { enabled: false, amount: 5 });
  settings.environment = { map: 'swamp', weather: 'fog' };
  settings.towerLossReward = { enabled: true, amount: 50 };
  const snapshot = validateMatchSettings(settings);
  settings.environment.map = 'road'; settings.towerLossReward.amount = 1;
  assert.deepEqual(snapshot.environment, { map: 'swamp', weather: 'fog' });
  assert.deepEqual(resolveMatchSettings(snapshot).sp.towerLoss, { enabled: true, amount: 50 });
  for (const environment of [null, [], {}, { map: '__proto__', weather: 'rain' }, { map: 'forest', weather: 'constructor' }, { map: 'random', weather: 'random', extra: true }]) {
    assert.throws(() => validateMatchSettings({ ...snapshot, environment }), /맵과 날씨/);
  }
  for (const amount of [0, 51, 1.5, NaN, Infinity, null, '5']) {
    assert.throws(() => validateMatchSettings({ ...snapshot, towerLossReward: { enabled: true, amount } }), /내 포탑/);
  }
});
