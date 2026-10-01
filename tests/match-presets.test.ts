import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchSettings } from '../src/game/match-settings.ts';
import {
  createMatchPresetStore, MATCH_PRESETS_STORAGE_KEY, MATCH_PRESET_NAME_MAX_LENGTH,
  MATCH_PRESET_MAX_COUNT, MATCH_PRESET_IMPORT_MAX_BYTES,
} from '../src/match-presets.ts';
import type { MatchPreset, MatchPresetStorage } from '../src/match-presets.ts';

class MemoryStorage implements MatchPresetStorage {
  value: string | null = null;
  writes = 0;
  readError: Error | undefined;
  writeError: Error | undefined;
  getItem(key: string) {
    assert.equal(key, MATCH_PRESETS_STORAGE_KEY);
    if (this.readError) throw this.readError;
    return this.value;
  }
  setItem(key: string, value: string) {
    assert.equal(key, MATCH_PRESETS_STORAGE_KEY);
    if (this.writeError) throw this.writeError;
    this.value = value; this.writes++;
  }
}

function fixture(storage = new MemoryStorage()) {
  let id = 0;
  let date = new Date('2026-10-01T00:00:00.000Z');
  const store = createMatchPresetStore({ getStorage: () => storage, createId: () => `preset-${++id}`, now: () => date });
  return { storage, store, setDate: (value: string) => { date = new Date(value); } };
}

function sample(name = '테스트', id = 'source-id'): MatchPreset {
  return { id, name, createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T01:00:00.000Z', settings: createMatchSettings() };
}

function json(presets: MatchPreset[]) {
  return JSON.stringify({ version: 1, presets });
}

test('preset CRUD persists complete snapshots with stable IDs and creation timestamps', () => {
  const { storage, store, setDate } = fixture();
  assert.deepEqual(store.list(), []);
  const settings = createMatchSettings();
  settings.environment = { map: 'random', weather: 'fog' };
  settings.startingSp = { enabled: false, amount: 42 };
  settings.summonedReward = { enabled: false, amount: null };
  settings.neutralWaves = { enabled: false, count: null };
  settings.lanes = { enabled: false, count: 0 };
  settings.towers = { enabled: false, count: 3, laneCount: 2 };
  const expected = structuredClone(settings);
  const saved = store.save('  내가 만든 설정  ', settings);
  assert.equal(saved.name, '내가 만든 설정');
  assert.equal(saved.createdAt, '2026-10-01T00:00:00.000Z');
  assert.equal(saved.updatedAt, saved.createdAt);
  assert.deepEqual(store.load(saved.id), expected);
  settings.startingSp.amount = 1;
  saved.settings.startingSp.amount = 2;
  const loaded = store.load(saved.id);
  loaded.startingSp.amount = 3;
  const listed = store.list();
  listed[0].settings.startingSp.amount = 4; listed[0].name = '수정';
  assert.deepEqual(fixture(storage).store.load(saved.id), expected);

  setDate('2026-10-01T01:00:00.000Z');
  const renamed = store.rename(saved.id, '새 이름');
  assert.equal(renamed.id, saved.id);
  assert.equal(renamed.createdAt, saved.createdAt);
  assert.equal(renamed.updatedAt, '2026-10-01T01:00:00.000Z');
  const replacement = createMatchSettings();
  replacement.environment = { map: 'swamp', weather: 'random' };
  setDate('2026-10-01T02:00:00.000Z');
  const overwritten = store.overwrite(saved.id, replacement);
  replacement.towers.laneCount = 3;
  assert.equal(overwritten.name, '새 이름');
  assert.equal(overwritten.createdAt, saved.createdAt);
  assert.equal(overwritten.updatedAt, '2026-10-01T02:00:00.000Z');
  assert.deepEqual(store.load(saved.id).environment, { map: 'swamp', weather: 'random' });
  assert.equal(store.load(saved.id).towers.laneCount, 1);
  store.delete(saved.id);
  assert.deepEqual(store.list(), []);
  assert.equal(storage.writes, 4);
});

test('blank, duplicate, and overlong names fail without storage writes', () => {
  const { storage, store } = fixture();
  const saved = store.save('첫 설정', createMatchSettings());
  const second = store.save('두 번째', createMatchSettings());
  const original = storage.value;
  for (const name of ['', ' \n\t ', '첫 설정', ' 첫 설정 ', '가'.repeat(MATCH_PRESET_NAME_MAX_LENGTH + 1)]) {
    assert.throws(() => store.save(name, createMatchSettings()), /이름/);
  }
  assert.throws(() => store.rename(second.id, ' 첫 설정 '), /같은 이름/);
  assert.throws(() => store.rename(second.id, ' '), /이름/);
  assert.equal(storage.value, original);
  assert.equal(storage.writes, 2);
  assert.equal(store.rename(saved.id, ' 첫 설정 ').name, '첫 설정');
});

test('save and overwrite reuse full MatchSettings validation even for disabled values', () => {
  const { storage, store } = fixture();
  const saved = store.save('유효', createMatchSettings());
  const invalid = createMatchSettings();
  invalid.towers = { enabled: false, count: 1, laneCount: 0 };
  const original = storage.value;
  assert.throws(() => store.save('불량', invalid), /포탑 배치 라인/);
  assert.throws(() => store.overwrite(saved.id, invalid), /포탑 배치 라인/);
  assert.equal(storage.value, original);
  assert.equal(storage.writes, 1);
});

test('unknown IDs fail load, overwrite, rename, delete, and selected export without writes', () => {
  const { storage, store } = fixture();
  for (const action of [
    () => store.load('missing'), () => store.overwrite('missing', createMatchSettings()),
    () => store.rename('missing', '새 이름'), () => store.delete('missing'), () => store.exportJson('missing'),
  ]) assert.throws(action, /찾을 수 없습니다/);
  assert.equal(storage.writes, 0);
});

test('malformed JSON, unsupported versions, and invalid entries block all writes and exports', () => {
  const base = sample();
  const invalidSettings = createMatchSettings();
  invalidSettings.environment.map = '__proto__' as never;
  const badDocuments = [
    '{broken', 'null', '[]', '{}',
    JSON.stringify({ version: 2, presets: [] }),
    JSON.stringify({ version: 1, presets: [], extra: true }),
    JSON.stringify({ version: 1, presets: [null] }),
    json([{ ...base, settings: invalidSettings }]),
    json([{ ...base, id: '' }]), json([{ ...base, name: ' ' }]),
    json([{ ...base, createdAt: 'yesterday' }]), json([{ ...base, updatedAt: '2026-09-30' }]),
    json([base, { ...base, name: '다른 이름' }]),
    json([base, { ...base, id: 'different-id' }]),
  ];
  for (const damaged of badDocuments) {
    const { storage, store } = fixture();
    storage.value = damaged;
    for (const action of [
      () => store.list(), () => store.load(base.id), () => store.exportJson(),
      () => store.save('신규', createMatchSettings()), () => store.overwrite(base.id, createMatchSettings()),
      () => store.rename(base.id, '변경'), () => store.delete(base.id), () => store.importJson(json([sample('외부')])),
    ]) assert.throws(action);
    assert.equal(storage.value, damaged);
    assert.equal(storage.writes, 0);
  }
});

test('SecurityError from the storage getter and read failures are caught for every operation', () => {
  const storage = new MemoryStorage();
  const unavailable = createMatchPresetStore({ getStorage: () => { throw new DOMException('denied', 'SecurityError'); } });
  storage.readError = new DOMException('denied', 'SecurityError');
  const unreadable = fixture(storage).store;
  for (const store of [unavailable, unreadable]) {
    for (const action of [
      () => store.list(), () => store.load('id'), () => store.exportJson(),
      () => store.save('신규', createMatchSettings()), () => store.overwrite('id', createMatchSettings()),
      () => store.rename('id', '변경'), () => store.delete('id'), () => store.importJson(json([sample()])),
    ]) assert.throws(action, /저장소를 읽을 수 없습니다/);
  }
  assert.equal(storage.writes, 0);
});

test('quota and permission failures never report mutation success or replace stored data', () => {
  for (const errorName of ['QuotaExceededError', 'SecurityError']) {
    const { storage, store } = fixture();
    const saved = store.save('기존', createMatchSettings());
    const original = storage.value;
    storage.writeError = new DOMException('denied', errorName);
    for (const action of [
      () => store.save('새 설정', createMatchSettings()), () => store.overwrite(saved.id, createMatchSettings()),
      () => store.rename(saved.id, '이름 변경'), () => store.delete(saved.id), () => store.importJson(json([sample()])),
    ]) assert.throws(action, /저장하지 못했습니다/);
    assert.equal(storage.value, original);
    assert.equal(storage.writes, 1);
    assert.equal(store.list()[0].name, '기존');
  }
});

test('every mutation rereads storage so another tab additions and edits are preserved', () => {
  const { storage, store } = fixture();
  const saved = store.save('첫 설정', createMatchSettings());
  store.list();
  const external = sample('다른 탭', 'external');
  external.settings.startingSp.amount = 30;
  storage.value = json([...store.list(), external]);
  store.save('신규', createMatchSettings());
  assert.equal(store.list().length, 3);
  storage.value = json(store.list().map((item) => item.id === external.id ? { ...item, name: '다른 탭 수정' } : item));
  store.rename(saved.id, '첫 설정 수정');
  assert.equal(store.list().find((item) => item.id === external.id)?.name, '다른 탭 수정');
  store.overwrite(saved.id, createMatchSettings());
  assert.equal(store.load(external.id).startingSp.amount, 30);
  store.delete(saved.id);
  assert.equal(store.list().length, 2);
  storage.value = json([...store.list(), sample('마지막 외부', 'last-external')]);
  store.importJson(json([sample('가져오기')]));
  assert.equal(store.list().length, 4);
  storage.value = json(store.list().filter((item) => item.id !== external.id));
  const original = storage.value;
  assert.throws(() => store.overwrite(external.id, createMatchSettings()), /찾을 수 없습니다/);
  assert.equal(storage.value, original);
});

test('selected and all exports use the versioned schema and preserve all settings', () => {
  const { storage, store } = fixture();
  const first = store.save('첫 설정', createMatchSettings());
  const settings = createMatchSettings();
  settings.environment = { map: 'road', weather: 'rain' };
  const second = store.save('두 번째', settings);
  const writes = storage.writes;
  assert.deepEqual(JSON.parse(store.exportJson(first.id)), { version: 1, presets: [first] });
  assert.deepEqual(JSON.parse(store.exportJson()), { version: 1, presets: [first, second] });
  assert.equal(storage.writes, writes);
});

test('imports create new IDs and timestamps, append duplicate names, and save once', () => {
  const { storage, store } = fixture();
  const existing = store.save('테스트', createMatchSettings());
  store.save('테스트 (2)', createMatchSettings());
  const first = sample('테스트', existing.id);
  first.settings.environment = { map: 'random', weather: 'fog' };
  first.settings.summonedReward = { enabled: false, amount: null };
  const writes = storage.writes;
  const imported = store.importJson(json([first, sample('테스트', existing.id)]));
  assert.equal(storage.writes, writes + 1);
  assert.deepEqual(imported.map((item) => item.name), ['테스트 (3)', '테스트 (4)']);
  assert.equal(new Set(store.list().map((item) => item.id)).size, 4);
  for (const item of imported) {
    assert.notEqual(item.id, existing.id);
    assert.equal(item.createdAt, '2026-10-01T00:00:00.000Z');
    assert.equal(item.updatedAt, item.createdAt);
  }
  assert.deepEqual(store.load(imported[0].id), first.settings);
  imported[0].settings.startingSp.amount = 50;
  assert.equal(store.load(imported[0].id).startingSp.amount, 5);
});

test('import suffix truncates long names to the limit without splitting Unicode characters', () => {
  const { store } = fixture();
  const name = 'a' + '😀'.repeat(19) + 'b';
  assert.equal(name.length, MATCH_PRESET_NAME_MAX_LENGTH);
  store.save(name, createMatchSettings());
  const [imported] = store.importJson(json([sample(name)]));
  assert.equal(imported.name, 'a' + '😀'.repeat(17) + ' (2)');
  assert.ok(imported.name.length <= MATCH_PRESET_NAME_MAX_LENGTH);
  assert.equal(imported.name.includes('\uD83D (2)'), false);
});

test('a bad imported entry rejects the entire file and preserves the existing list', () => {
  const { storage, store } = fixture();
  store.save('기존', createMatchSettings());
  const original = storage.value;
  const invalid = sample('불량');
  invalid.settings.neutralWaves.count = 0;
  for (const content of [json([sample('정상'), invalid]), '{broken', JSON.stringify({ version: 9, presets: [sample()] }), json([])]) {
    assert.throws(() => store.importJson(content));
    assert.equal(storage.value, original);
    assert.equal(storage.writes, 1);
  }
});

test('UTF-8 file size and total preset count limits reject without partial writes', () => {
  const { storage, store } = fixture();
  const incoming = Array.from({ length: MATCH_PRESET_MAX_COUNT }, (_, index) => sample(`설정 ${index}`, `source-${index}`));
  assert.equal(store.importJson(json(incoming)).length, MATCH_PRESET_MAX_COUNT);
  const original = storage.value;
  assert.throws(() => store.save('초과', createMatchSettings()), /최대 100개/);
  assert.throws(() => store.importJson(json([sample('초과')])), /최대 100개/);
  assert.throws(() => store.importJson(json([...incoming, sample('초과')])), /최대 100개/);
  const overlong = '가'.repeat(Math.ceil(MATCH_PRESET_IMPORT_MAX_BYTES / 3) + 1);
  assert.ok(overlong.length < MATCH_PRESET_IMPORT_MAX_BYTES);
  assert.throws(() => store.importJson(overlong), /1 MiB/);
  assert.equal(storage.value, original);
  assert.equal(storage.writes, 1);
});

test('duplicate generated IDs fail before writing any new presets', () => {
  const storage = new MemoryStorage();
  const store = createMatchPresetStore({ getStorage: () => storage, createId: () => 'same-id' });
  store.save('기존', createMatchSettings());
  const original = storage.value;
  assert.throws(() => store.save('다른 이름', createMatchSettings()), /ID/);
  assert.throws(() => store.importJson(json([sample()])), /ID/);
  assert.equal(storage.value, original);
  assert.equal(storage.writes, 1);
});

test('default ID generation saves and imports when crypto exists without randomUUID', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const storage = new MemoryStorage();
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} });
    const store = createMatchPresetStore({ getStorage: () => storage });
    const saved = store.save('LAN 저장', createMatchSettings());
    const [imported] = store.importJson(json([sample('LAN 가져오기')]));
    assert.ok(saved.id);
    assert.ok(imported.id);
    assert.notEqual(saved.id, imported.id);
    assert.deepEqual(store.list().map((item) => item.name), ['LAN 저장', 'LAN 가져오기']);
    assert.equal(storage.writes, 2);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
    else Reflect.deleteProperty(globalThis, 'crypto');
  }
});
