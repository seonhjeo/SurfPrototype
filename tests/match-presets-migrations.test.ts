import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchSettings, validateMatchSettings } from '../src/game/match-settings.ts';
import type { MatchSettings } from '../src/game/match-settings.ts';
import { createMatchPresetStore, MATCH_PRESETS_STORAGE_KEY } from '../src/match-presets.ts';
import type { MatchPresetStorage } from '../src/match-presets.ts';
import {
  applyPresetSettingsChanges, createPresetSettingsSchema, MATCH_PRESET_SETTINGS_SCHEMA, MATCH_PRESET_SETTINGS_VERSION,
} from '../src/match-presets-migrations.ts';
import { validatePresetSettingsV1 } from '../src/match-presets-schema-v1.ts';

function object(value: unknown): asserts value is Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value));
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
}

/** These invented versions/fields are fixtures, never supported production schemas. */
function validateFixture(value: unknown, version: number): Record<string, unknown> {
  object(value);
  const keys = ['enabled', version < 3 ? 'amount' : 'budget', 'nullable', 'environment'];
  if (version < 4) keys.push('obsolete');
  if (version >= 2) keys.push('feature');
  assert.deepEqual(Object.keys(value).sort(), keys.sort());
  assert.equal(typeof value.enabled, 'boolean');
  const amount = value[version < 3 ? 'amount' : 'budget'];
  assert.ok(typeof amount === 'number' && Number.isInteger(amount) && amount >= 0 && amount <= 50);
  assert.equal(value.nullable, null);
  object(value.environment);
  assert.deepEqual(Object.keys(value.environment).sort(), version >= 2 ? ['map', 'weather'] : ['map']);
  assert.ok(['random', 'forest'].includes(value.environment.map as string));
  if (version >= 2) {
    assert.ok(['random', 'rain'].includes(value.environment.weather as string));
    object(value.feature);
    assert.deepEqual(value.feature, { enabled: true, count: 3 });
  }
  if (version < 4) assert.equal(value.obsolete, 'old-field');
  return structuredClone(value);
}

const fixtureSchema = createPresetSettingsSchema({
  currentVersion: 4,
  validateCurrent: (value) => validateFixture(value, 4),
  previousVersions: [
    { version: 1, validate: (value) => validateFixture(value, 1), changes: [
      { kind: 'add', path: ['feature'], defaultValue: { enabled: true, count: 3 } },
      { kind: 'add', path: ['environment', 'weather'], defaultValue: 'random' },
    ] },
    { version: 2, validate: (value) => validateFixture(value, 2), changes: [
      { kind: 'rename', from: ['amount'], to: ['budget'] },
    ] },
    { version: 3, validate: (value) => validateFixture(value, 3), changes: [
      { kind: 'remove', path: ['obsolete'] },
    ] },
  ],
});

const oldFixture = () => ({ enabled: false, amount: 0, nullable: null, environment: { map: 'random' }, obsolete: 'old-field' });

test('explicit future fixture adds top-level and nested defaults, renames, and removes only named fields', () => {
  const source = oldFixture();
  const before = structuredClone(source);
  const migrated = fixtureSchema.read(source, 1);
  assert.deepEqual(migrated, {
    enabled: false, budget: 0, nullable: null, environment: { map: 'random', weather: 'random' },
    feature: { enabled: true, count: 3 },
  });
  assert.deepEqual(source, before);
  (migrated.environment as Record<string, unknown>).map = 'forest';
  assert.deepEqual(source, before);
});

test('loading any known fixture version gives the same current snapshot without replacing existing values', () => {
  const version1 = oldFixture();
  const version2 = { ...version1, feature: { enabled: true, count: 3 }, environment: { map: 'forest', weather: 'rain' } };
  const { amount, ...other } = version2;
  const version3 = { ...other, budget: amount };
  const { obsolete: _obsolete, ...version4 } = version3;
  for (const [version, source] of [[2, version2], [3, version3], [4, version4]] as const) {
    const before = structuredClone(source);
    assert.deepEqual(fixtureSchema.read(source, version), version4);
    assert.deepEqual(source, before);
  }
});

test('damaged existing fields, unknown fields, and missing current fields are not filled with defaults', () => {
  const { amount: _amount, ...missing } = oldFixture();
  for (const damaged of [missing, { ...oldFixture(), amount: '0' }, { ...oldFixture(), enabled: null },
    { ...oldFixture(), extra: true }, { ...oldFixture(), environment: {} }, { ...oldFixture(), feature: { enabled: false } }]) {
    assert.throws(() => fixtureSchema.read(damaged, 1));
  }
  assert.throws(() => fixtureSchema.read(oldFixture(), 4));
});

test('future, fractional, zero, missing, and incomplete version paths are rejected', () => {
  for (const version of [5, 1.5, 0, -1, '1', undefined, null, NaN, Infinity]) {
    assert.throws(() => fixtureSchema.read(oldFixture(), version), /버전/);
  }
  const missingPath = createPresetSettingsSchema({ currentVersion: 3, validateCurrent: (value) => value,
    previousVersions: [{ version: 1, validate: (value) => value, changes: [] }] });
  assert.throws(() => missingPath.read(oldFixture(), 1), /변환 경로/);
  assert.throws(() => createPresetSettingsSchema({ currentVersion: 0, validateCurrent: (value) => value }), /버전/);
  assert.throws(() => createPresetSettingsSchema({ currentVersion: 2, validateCurrent: (value) => value,
    previousVersions: [1, 1].map((version) => ({ version, validate: (value) => value, changes: [] })) }), /버전/);
});

test('rename collisions and missing paths fail without silent loss or source mutation', () => {
  const source = { source: { enabled: false }, target: null, untouched: 0 };
  const before = structuredClone(source);
  for (const changes of [
    [{ kind: 'rename', from: ['source'], to: ['target'] }],
    [{ kind: 'rename', from: ['absent'], to: ['new'] }],
    [{ kind: 'rename', from: ['source'], to: ['source', 'inside'] }],
    [{ kind: 'add', path: ['source'], defaultValue: true }],
    [{ kind: 'add', path: ['absent', 'child'], defaultValue: true }],
    [{ kind: 'remove', path: ['absent'] }],
    [{ kind: 'add', path: ['__proto__'], defaultValue: true }],
    [{ kind: 'remove', path: [] }],
  ] as const) assert.throws(() => applyPresetSettingsChanges(source, changes));
  assert.deepEqual(source, before);
  assert.deepEqual(applyPresetSettingsChanges(source, [{ kind: 'remove', path: ['source'] }]), { target: null, untouched: 0 });
});

test('invalid intermediate schemas stop before subsequent changes or final validation', () => {
  let finalCalls = 0;
  const schema = createPresetSettingsSchema({ currentVersion: 3, validateCurrent: (value) => { finalCalls++; return value; },
    previousVersions: [
      { version: 1, validate: (value) => validateFixture(value, 1), changes: [] },
      { version: 2, validate: (value) => validateFixture(value, 2), changes: [] },
    ] });
  assert.throws(() => schema.read(oldFixture(), 1));
  assert.equal(finalCalls, 0);
});

test('pipeline isolates source references even from validators and default objects', () => {
  const defaults = { enabled: true, count: 3 };
  const source = { enabled: false };
  const schema = createPresetSettingsSchema({ currentVersion: 2,
    previousVersions: [{ version: 1, validate: (value) => { object(value); value.checked = true; return value; },
      changes: [{ kind: 'add', path: ['feature'], defaultValue: defaults }] }],
    validateCurrent: (value) => { object(value); return value; },
  });
  const result = schema.read(source, 1);
  (result.feature as Record<string, unknown>).count = 9;
  assert.deepEqual(source, { enabled: false });
  assert.deepEqual(defaults, { enabled: true, count: 3 });
});

test('production schema version guard matches the fixed v1 snapshot and current strict settings', () => {
  assert.equal(MATCH_PRESET_SETTINGS_VERSION, 1);
  const current = createMatchSettings();
  assert.deepEqual(validatePresetSettingsV1(current), current);
  assert.deepEqual(MATCH_PRESET_SETTINGS_SCHEMA.read(current, 1), current);
  // Future changes to live fields must bump settingsVersion/register a migration.
  assert.throws(() => validatePresetSettingsV1({ ...current, futureField: { enabled: true } }));
  assert.throws(() => MATCH_PRESET_SETTINGS_SCHEMA.read(current, 2), /버전/);
  const preserved = structuredClone(current);
  preserved.startingSp = { enabled: false, amount: 42 };
  preserved.lanes = { enabled: false, count: 0 };
  preserved.neutralWaves = { enabled: false, count: null };
  preserved.summonedReward = { enabled: false, amount: null };
  assert.deepEqual(validatePresetSettingsV1(preserved), validateMatchSettings(preserved));
});

test('fixed schema1 remains usable after an explicit future fixture adds a field', () => {
  const source = createMatchSettings();
  const schema = createPresetSettingsSchema({ currentVersion: 2,
    previousVersions: [{ version: 1, validate: validatePresetSettingsV1,
      changes: [{ kind: 'add', path: ['futureField'], defaultValue: { enabled: false } }] }],
    validateCurrent(value) {
      object(value);
      const { futureField, ...old } = value;
      assert.deepEqual(futureField, { enabled: false });
      validatePresetSettingsV1(old);
      return structuredClone(value);
    },
  });
  assert.deepEqual(schema.read(source, 1), { ...source, futureField: { enabled: false } });
  assert.deepEqual(source, createMatchSettings());
});

class MemoryStorage implements MatchPresetStorage {
  value: string | null = null;
  writes = 0;
  failWrites = false;
  getItem(key: string) { assert.equal(key, MATCH_PRESETS_STORAGE_KEY); return this.value; }
  setItem(key: string, value: string) {
    assert.equal(key, MATCH_PRESETS_STORAGE_KEY);
    if (this.failWrites) throw new DOMException('full', 'QuotaExceededError');
    this.value = value; this.writes++;
  }
}

function preset(id: string, settings: unknown = createMatchSettings()) {
  return { id, name: id, createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T01:00:00.000Z', settings };
}

// Only injected into these tests: a historical renamed field, no fake production alias.
const renamedFixtureSchema = createPresetSettingsSchema<MatchSettings>({
  currentVersion: 2, validateCurrent: validateMatchSettings,
  previousVersions: [{ version: 1, validate(value) {
    object(value);
    assert.ok(Object.hasOwn(value, 'initialSp') && !Object.hasOwn(value, 'startingSp'));
    const { initialSp, ...other } = value;
    validatePresetSettingsV1({ ...other, startingSp: initialSp });
    return structuredClone(value);
  }, changes: [{ kind: 'rename', from: ['initialSp'], to: ['startingSp'] }] }],
});

function oldSettings() {
  const current = createMatchSettings();
  current.startingSp = { enabled: false, amount: 42 };
  current.summonedReward = { enabled: false, amount: null };
  const { startingSp, ...other } = current;
  return { ...other, initialSp: startingSp };
}

function storeFixture(useRenamedSchema = false) {
  const storage = new MemoryStorage();
  let sequence = 0;
  const store = createMatchPresetStore({ getStorage: () => storage, createId: () => `new-${++sequence}`,
    now: () => new Date('2026-10-01T00:00:00.000Z'),
    settingsSchema: useRenamedSchema ? renamedFixtureSchema : undefined,
  });
  return { storage, store };
}

test('legacy v1 list/load/export are read only; output envelope2 retains settingsVersion1 and original values', () => {
  const { storage, store } = storeFixture();
  const first = preset('legacy');
  storage.value = JSON.stringify({ version: 1, presets: [first] });
  const original = storage.value;
  assert.deepEqual(store.list(), [first]);
  const loaded = store.load(first.id);
  loaded.startingSp.amount = 20;
  assert.deepEqual(store.load(first.id), first.settings);
  assert.deepEqual(JSON.parse(store.exportJson()), { version: 2, presets: [{ ...first, settingsVersion: 1 }] });
  assert.equal(storage.value, original);
  assert.equal(storage.writes, 0);
});

test('virtual migrations and exports leave legacy storage and raw fields untouched', () => {
  const { storage, store } = storeFixture(true);
  const first = preset('old', oldSettings());
  storage.value = JSON.stringify({ version: 1, presets: [first] });
  const original = storage.value;
  assert.deepEqual(store.load(first.id).startingSp, { enabled: false, amount: 42 });
  assert.deepEqual(store.list()[0].settings.summonedReward, { enabled: false, amount: null });
  for (const json of [store.exportJson(), store.exportJson(first.id)]) {
    assert.deepEqual(JSON.parse(json), { version: 2, presets: [{ ...first, settingsVersion: 1 }] });
  }
  assert.equal(storage.value, original);
  assert.equal(storage.writes, 0);
});

test('save/rename/delete/import preserve other raw settings; explicit overwrite only upgrades its target', () => {
  const { storage, store } = storeFixture(true);
  const old = [preset('first', oldSettings()), preset('second', oldSettings())];
  storage.value = JSON.stringify({ version: 1, presets: old });
  const rawEntries = () => JSON.parse(storage.value!).presets;
  const untouched = { ...old[1], settingsVersion: 1 };
  const fresh = store.save('new', createMatchSettings());
  assert.deepEqual(rawEntries()[1], untouched);
  assert.equal(rawEntries()[2].settingsVersion, 2);
  store.rename(old[0].id, 'renamed');
  assert.deepEqual(rawEntries()[0].settings, old[0].settings);
  assert.equal(rawEntries()[0].settingsVersion, 1);
  assert.deepEqual(rawEntries()[1], untouched);
  const [imported] = store.importJson(JSON.stringify({ version: 2, presets: [{ ...old[0], settingsVersion: 1 }] }));
  assert.deepEqual(rawEntries()[3].settings, old[0].settings);
  assert.equal(rawEntries()[3].settingsVersion, 1);
  const overwritten = createMatchSettings();
  overwritten.startingSp.amount = 33;
  store.overwrite(old[0].id, overwritten);
  assert.equal(rawEntries()[0].settingsVersion, 2);
  assert.deepEqual(rawEntries()[0].settings, overwritten);
  assert.deepEqual(rawEntries()[1], untouched);
  assert.deepEqual(rawEntries()[3].settings, old[0].settings);
  assert.equal(rawEntries()[3].settingsVersion, 1);
  store.delete(fresh.id);
  assert.deepEqual(rawEntries()[1], untouched);
  assert.equal(store.load(imported.id).startingSp.amount, 42);
  assert.equal(storage.writes, 5);
});

test('mixed version2 imports round trip original versions and atomically reject a bad entry', () => {
  const { storage, store } = storeFixture(true);
  const incoming = { version: 2, presets: [
    { ...preset('old', oldSettings()), settingsVersion: 1 },
    { ...preset('current'), settingsVersion: 2 },
  ] };
  const added = store.importJson(JSON.stringify(incoming));
  const exported = JSON.parse(store.exportJson());
  assert.deepEqual(exported.presets.map((entry: Record<string, unknown>) => entry.settingsVersion), [1, 2]);
  assert.deepEqual(exported.presets.map((entry: Record<string, unknown>) => entry.settings), incoming.presets.map((entry) => entry.settings));
  assert.deepEqual(store.load(added[0].id).startingSp, { enabled: false, amount: 42 });
  const before = storage.value;
  assert.throws(() => store.importJson(JSON.stringify({ ...incoming, presets: [incoming.presets[0], { ...incoming.presets[1], settingsVersion: 9 }] })));
  assert.equal(storage.value, before);
  assert.equal(storage.writes, 1);
  storage.failWrites = true;
  assert.throws(() => store.overwrite(added[0].id, createMatchSettings()), /저장하지 못했습니다/);
  assert.equal(storage.value, before);
  assert.equal(storage.writes, 1);
});

test('version2 metadata, fake historical aliases, and malformed settings block writes and exports', () => {
  for (const settingsVersion of [undefined, null, 0, 1.5, 2, '1']) {
    const { storage, store } = storeFixture();
    storage.value = JSON.stringify({ version: 2, presets: [{ ...preset('bad'), settingsVersion }] });
    const before = storage.value;
    for (const action of [() => store.list(), () => store.load('bad'), () => store.exportJson(),
      () => store.save('new', createMatchSettings()), () => store.overwrite('bad', createMatchSettings()),
      () => store.rename('bad', 'rename'), () => store.delete('bad'),
      () => store.importJson(JSON.stringify({ version: 1, presets: [preset('incoming')] }))]) assert.throws(action);
    assert.equal(storage.value, before);
    assert.equal(storage.writes, 0);
  }
  const { storage, store } = storeFixture();
  for (const document of [
    { version: 1, presets: [{ ...preset('bad'), settingsVersion: 1 }] },
    { version: 1, presets: [preset('fake', oldSettings())] },
    { version: 2, presets: [{ ...preset('bad'), settingsVersion: 1, extra: true }] },
    { version: 2, presets: [{ ...preset('missing', {}), settingsVersion: 1 }] },
  ]) assert.throws(() => store.importJson(JSON.stringify(document)));
  assert.equal(storage.value, null);
  assert.equal(storage.writes, 0);
});
