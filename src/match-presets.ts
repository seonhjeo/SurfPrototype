import type { MatchSettings } from './game/match-settings.ts';
import { MATCH_PRESET_SETTINGS_SCHEMA } from './match-presets-migrations.ts';
import type { PresetSettingsSchema } from './match-presets-migrations.ts';

export const MATCH_PRESETS_STORAGE_KEY = 'surf.match-presets';
export const MATCH_PRESET_NAME_MAX_LENGTH = 40;
export const MATCH_PRESET_MAX_COUNT = 100;
export const MATCH_PRESET_IMPORT_MAX_BYTES = 1024 * 1024;
export const MATCH_PRESET_DOCUMENT_VERSION = 2;

export interface MatchPreset {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: MatchSettings;
}

interface StoredMatchPreset extends MatchPreset {
  settingsVersion: number;
  rawSettings: unknown;
}

export interface MatchPresetStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MatchPresetStoreOptions {
  getStorage?: () => MatchPresetStorage;
  now?: () => Date;
  createId?: () => string;
  settingsSchema?: PresetSettingsSchema<MatchSettings>;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function normalizeName(name: string): string {
  if (typeof name !== 'string' || !name.trim()) throw new Error('프리셋 이름을 입력하세요.');
  const trimmed = name.trim();
  if (trimmed.length > MATCH_PRESET_NAME_MAX_LENGTH) {
    throw new Error(`프리셋 이름은 ${MATCH_PRESET_NAME_MAX_LENGTH}자 이내로 입력하세요.`);
  }
  return trimmed;
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

/** Every entry must be valid. Invalid data is never silently dropped or overwritten. */
function parseDocument(json: string, schema: PresetSettingsSchema<MatchSettings>, importing = false): StoredMatchPreset[] {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (cause) {
    throw new Error('프리셋 JSON을 읽을 수 없습니다. 데이터가 손상되었는지 확인하세요.', { cause });
  }
  if (!record(value) || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'version') || !Object.hasOwn(value, 'presets')) {
    throw new Error('프리셋 데이터 형식이 올바르지 않습니다.');
  }
  if (value.version !== 1 && value.version !== MATCH_PRESET_DOCUMENT_VERSION) throw new Error('지원하지 않는 프리셋 데이터 버전입니다.');
  if (!Array.isArray(value.presets) || value.presets.length > MATCH_PRESET_MAX_COUNT) {
    throw new Error(`프리셋 목록이 올바르지 않습니다. 최대 ${MATCH_PRESET_MAX_COUNT}개까지 사용할 수 있습니다.`);
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  return value.presets.map((item: unknown): StoredMatchPreset => {
    const keys = ['id', 'name', 'createdAt', 'updatedAt', 'settings'];
    if (value.version === MATCH_PRESET_DOCUMENT_VERSION) keys.push('settingsVersion');
    if (!record(item) || Object.keys(item).length !== keys.length || keys.some((key) => !Object.hasOwn(item, key))
      || typeof item.id !== 'string' || !item.id.trim() || item.id !== item.id.trim()
      || typeof item.name !== 'string' || !validTimestamp(item.createdAt) || !validTimestamp(item.updatedAt)) {
      throw new Error('프리셋 항목의 형식이 올바르지 않습니다.');
    }
    const name = normalizeName(item.name);
    if (name !== item.name || (!importing && (ids.has(item.id) || names.has(name)))) {
      throw new Error('프리셋에 올바르지 않거나 중복된 ID 또는 이름이 있습니다.');
    }
    ids.add(item.id); names.add(name);
    const settingsVersion = value.version === 1 ? 1 : item.settingsVersion;
    let settings: MatchSettings;
    try {
      settings = schema.read(item.settings, settingsVersion);
    } catch (cause) {
      throw new Error('프리셋의 경기 설정이 올바르지 않습니다.', { cause });
    }
    return {
      id: item.id, name, createdAt: item.createdAt, updatedAt: item.updatedAt, settings,
      settingsVersion: settingsVersion as number, rawSettings: structuredClone(item.settings),
    };
  });
}

function documentJson(presets: StoredMatchPreset[], pretty = false): string {
  const entries = presets.map(({ id, name, createdAt, updatedAt, settingsVersion, rawSettings }) => ({
    id, name, createdAt, updatedAt, settingsVersion, settings: rawSettings,
  }));
  return JSON.stringify({ version: MATCH_PRESET_DOCUMENT_VERSION, presets: entries }, null, pretty ? 2 : undefined);
}

function publicPreset({ id, name, createdAt, updatedAt, settings }: StoredMatchPreset): MatchPreset {
  return { id, name, createdAt, updatedAt, settings: structuredClone(settings) };
}

function findPreset(presets: StoredMatchPreset[], id: string): StoredMatchPreset {
  const preset = presets.find((item) => item.id === id);
  if (!preset) throw new Error('선택한 프리셋을 찾을 수 없습니다. 목록을 다시 확인하세요.');
  return preset;
}

function ensureUniqueName(presets: MatchPreset[], name: string, exceptId?: string): void {
  if (presets.some((item) => item.name === name && item.id !== exceptId)) {
    throw new Error('같은 이름의 프리셋이 있습니다. 다른 이름을 입력하세요.');
  }
}

function ensureCapacity(count: number): void {
  if (count > MATCH_PRESET_MAX_COUNT) throw new Error(`프리셋은 최대 ${MATCH_PRESET_MAX_COUNT}개까지 저장할 수 있습니다.`);
}

function availableImportName(name: string, names: Set<string>): string {
  if (!names.has(name)) return name;
  for (let number = 2; ; number++) {
    const suffix = ` (${number})`;
    let base = '';
    for (const character of name) {
      if (base.length + character.length > MATCH_PRESET_NAME_MAX_LENGTH - suffix.length) break;
      base += character;
    }
    const candidate = `${base.trimEnd()}${suffix}`;
    if (!names.has(candidate)) return candidate;
  }
}

/** Synchronous operations read fresh storage immediately before each mutation. */
export function createMatchPresetStore(options: MatchPresetStoreOptions = {}) {
  const getStorage = options.getStorage ?? (() => globalThis.localStorage);
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const schema = options.settingsSchema ?? MATCH_PRESET_SETTINGS_SCHEMA;

  function read(): { storage: MatchPresetStorage; presets: StoredMatchPreset[] } {
    let storage: MatchPresetStorage;
    let json: string | null;
    try {
      storage = getStorage();
      json = storage.getItem(MATCH_PRESETS_STORAGE_KEY);
    } catch (cause) {
      throw new Error('프리셋 저장소를 읽을 수 없습니다. 브라우저의 저장 권한을 확인하세요.', { cause });
    }
    return { storage, presets: json === null ? [] : parseDocument(json, schema) };
  }

  function write(storage: MatchPresetStorage, presets: StoredMatchPreset[]): void {
    try {
      storage.setItem(MATCH_PRESETS_STORAGE_KEY, documentJson(presets));
    } catch (cause) {
      throw new Error('프리셋을 저장하지 못했습니다. 브라우저의 저장 권한이나 저장 공간을 확인하세요.', { cause });
    }
  }

  function freshPreset(name: string, settings: MatchSettings, ids: Set<string>, source?: StoredMatchPreset): StoredMatchPreset {
    const id = createId();
    if (typeof id !== 'string' || !id.trim() || id !== id.trim() || ids.has(id)) {
      throw new Error('프리셋 ID를 만들지 못했습니다. 다시 시도하세요.');
    }
    const timestamp = now().toISOString();
    ids.add(id);
    return {
      id, name, createdAt: timestamp, updatedAt: timestamp, settings,
      settingsVersion: source?.settingsVersion ?? schema.currentVersion,
      rawSettings: structuredClone(source ? source.rawSettings : settings),
    };
  }

  return {
    list(): MatchPreset[] {
      return read().presets.map(publicPreset);
    },
    load(id: string): MatchSettings {
      return findPreset(read().presets, id).settings;
    },
    save(name: string, settings: unknown): MatchPreset {
      const normalized = normalizeName(name);
      const snapshot = schema.validateCurrent(settings);
      const { storage, presets } = read();
      ensureUniqueName(presets, normalized);
      ensureCapacity(presets.length + 1);
      const preset = freshPreset(normalized, snapshot, new Set(presets.map((item) => item.id)));
      write(storage, [...presets, preset]);
      return publicPreset(preset);
    },
    overwrite(id: string, settings: unknown): MatchPreset {
      const snapshot = schema.validateCurrent(settings);
      const { storage, presets } = read();
      const preset = findPreset(presets, id);
      preset.settings = snapshot; preset.updatedAt = now().toISOString();
      preset.settingsVersion = schema.currentVersion; preset.rawSettings = structuredClone(snapshot);
      write(storage, presets);
      return publicPreset(preset);
    },
    rename(id: string, name: string): MatchPreset {
      const normalized = normalizeName(name);
      const { storage, presets } = read();
      const preset = findPreset(presets, id);
      ensureUniqueName(presets, normalized, id);
      preset.name = normalized; preset.updatedAt = now().toISOString();
      write(storage, presets);
      return publicPreset(preset);
    },
    delete(id: string): void {
      const { storage, presets } = read();
      findPreset(presets, id);
      write(storage, presets.filter((item) => item.id !== id));
    },
    exportJson(id?: string): string {
      const presets = read().presets;
      return documentJson(id === undefined ? presets : [findPreset(presets, id)], true);
    },
    importJson(json: string): MatchPreset[] {
      if (new TextEncoder().encode(json).byteLength > MATCH_PRESET_IMPORT_MAX_BYTES) {
        throw new Error('가져올 프리셋 JSON은 1 MiB 이하여야 합니다.');
      }
      const incoming = parseDocument(json, schema, true);
      if (incoming.length === 0) throw new Error('가져올 프리셋이 없습니다.');
      const { storage, presets } = read();
      ensureCapacity(presets.length + incoming.length);
      const ids = new Set(presets.map((item) => item.id));
      const names = new Set(presets.map((item) => item.name));
      const added = incoming.map((item) => {
        const name = availableImportName(item.name, names);
        names.add(name);
        return freshPreset(name, item.settings, ids, item);
      });
      write(storage, [...presets, ...added]);
      return added.map(publicPreset);
    },
  };
}
