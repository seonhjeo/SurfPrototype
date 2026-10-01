import { validateMatchSettings } from './game/match-settings.ts';
import type { MatchSettings } from './game/match-settings.ts';
import { validatePresetSettingsV1 } from './match-presets-schema-v1.ts';

type SettingsPath = readonly string[];
export type PresetSettingsChange =
  | { kind: 'add'; path: SettingsPath; defaultValue: unknown }
  | { kind: 'rename'; from: SettingsPath; to: SettingsPath }
  | { kind: 'remove'; path: SettingsPath };

export interface PreviousPresetSettingsVersion {
  version: number;
  validate: (value: unknown) => unknown;
  /** Explicit changes from this validated version to version + 1. */
  changes: readonly PresetSettingsChange[];
}

export interface PresetSettingsSchema<T> {
  currentVersion: number;
  validateCurrent: (value: unknown) => T;
  read: (value: unknown, version: unknown) => T;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function field(root: unknown, path: SettingsPath): { parent: Record<string, unknown>; key: string } {
  if (path.length === 0 || path.some((key) => !key || ['__proto__', 'prototype', 'constructor'].includes(key))) {
    throw new Error('프리셋 설정 변환 경로가 올바르지 않습니다.');
  }
  let parent = root;
  for (const key of path.slice(0, -1)) {
    if (!record(parent) || !Object.hasOwn(parent, key)) throw new Error('프리셋 설정 변환 경로를 찾을 수 없습니다.');
    parent = parent[key];
  }
  if (!record(parent)) throw new Error('프리셋 설정 변환 경로가 객체가 아닙니다.');
  return { parent, key: path[path.length - 1] };
}

/** Apply only declared changes. No recursive defaults or unknown-field removal. */
export function applyPresetSettingsChanges(value: unknown, changes: readonly PresetSettingsChange[]): unknown {
  const snapshot = structuredClone(value);
  for (const change of changes) {
    if (change.kind === 'rename') {
      const source = field(snapshot, change.from);
      const target = field(snapshot, change.to);
      if (!Object.hasOwn(source.parent, source.key) || Object.hasOwn(target.parent, target.key)
        || change.to.length > change.from.length && change.from.every((key, index) => change.to[index] === key)) {
        throw new Error('프리셋 설정 이름 변환에 누락 또는 충돌이 있습니다.');
      }
      target.parent[target.key] = source.parent[source.key];
      delete source.parent[source.key];
    } else {
      const target = field(snapshot, change.path);
      if (change.kind === 'add') {
        if (Object.hasOwn(target.parent, target.key)) throw new Error('추가할 프리셋 설정이 이미 있습니다.');
        target.parent[target.key] = structuredClone(change.defaultValue);
      } else {
        if (!Object.hasOwn(target.parent, target.key)) throw new Error('삭제할 프리셋 설정을 찾을 수 없습니다.');
        delete target.parent[target.key];
      }
    }
  }
  return snapshot;
}

/** Keep each historical validator; validate before and after every ordered step. */
export function createPresetSettingsSchema<T>(options: {
  currentVersion: number;
  validateCurrent: (value: unknown) => T;
  previousVersions?: readonly PreviousPresetSettingsVersion[];
}): PresetSettingsSchema<T> {
  const { currentVersion } = options;
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 1) throw new Error('프리셋 설정 버전이 올바르지 않습니다.');
  const previous = new Map<number, PreviousPresetSettingsVersion>();
  for (const step of options.previousVersions ?? []) {
    if (!Number.isSafeInteger(step.version) || step.version < 1 || step.version >= currentVersion || previous.has(step.version)) {
      throw new Error('프리셋 설정 변환 버전이 올바르지 않습니다.');
    }
    previous.set(step.version, step);
  }
  const validateCurrent = (value: unknown): T => structuredClone(options.validateCurrent(structuredClone(value)));
  return {
    currentVersion,
    validateCurrent,
    read(value: unknown, version: unknown): T {
      if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1 || version > currentVersion) {
        throw new Error('지원하지 않는 프리셋 경기 설정 버전입니다.');
      }
      let snapshot = structuredClone(value);
      for (let number = version; number < currentVersion; number++) {
        const step = previous.get(number);
        if (!step) throw new Error('지원하지 않는 프리셋 경기 설정 변환 경로입니다.');
        snapshot = applyPresetSettingsChanges(step.validate(snapshot), step.changes);
      }
      return validateCurrent(snapshot);
    },
  };
}

// A live settings change must bump this version, keep schema-v1, and register each
// previous validator + changes. Fixture-only future schemas belong in tests.
export const MATCH_PRESET_SETTINGS_VERSION = 1;
export const MATCH_PRESET_SETTINGS_SCHEMA = createPresetSettingsSchema<MatchSettings>({
  currentVersion: MATCH_PRESET_SETTINGS_VERSION,
  validateCurrent(value) {
    const settings = validateMatchSettings(value);
    validatePresetSettingsV1(value);
    return settings;
  },
});
