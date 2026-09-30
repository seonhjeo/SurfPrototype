import { resolveModeRules } from './data.ts';
import type { ModeRules } from './data.ts';

type AmountSetting = { enabled: boolean; amount: number };
type RewardSetting = { enabled: boolean; amount: number | null };
type CountSetting = { enabled: boolean; count: number };

export interface MatchSettings {
  startingSp: AmountSetting;
  passiveSp: AmountSetting;
  summonedReward: RewardSetting;
  minionReward: AmountSetting;
  eliteReward: AmountSetting;
  neutralReward: RewardSetting;
  lanes: CountSetting;
  neutralWaves: { enabled: boolean; count: number | null };
  minions: CountSetting;
  catapult: { enabled: boolean };
  oil: { enabled: boolean };
  towers: CountSetting & { laneCount: number };
  spBox: CountSetting;
}

export interface MatchSettingDefinition {
  key: keyof MatchSettings;
  section: string;
  label: string;
  help: string;
  field?: 'count' | 'amount';
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  defaultLabel?: string;
  fallback?: number;
  extra?: { field: 'laneCount'; label: string; min: number; max: number; step: number; unit: string };
}

// The form and server share the same allowed quantities. Combat stats stay in mode-settings.ts.
export const MATCH_SETTING_DEFINITIONS: readonly MatchSettingDefinition[] = [
  { key: 'startingSp', section: 'SP 획득', label: '시작 SP', help: '양 진영이 처음 보유하는 SP · 최대 보유량 50', field: 'amount', unit: 'SP', min: 1, max: 50, step: 1 },
  { key: 'passiveSp', section: 'SP 획득', label: 'SP 자동 획득', help: '매초 획득하는 SP', field: 'amount', unit: 'SP / 초', min: 0.1, max: 50, step: 0.1 },
  { key: 'summonedReward', section: 'SP 획득', label: '소환 유닛 처치 보상', help: '상대가 소환한 유닛 한 명당 SP', field: 'amount', unit: 'SP', min: 1, max: 50, step: 1, defaultLabel: '유닛별 기본 보상', fallback: 2 },
  { key: 'minionReward', section: 'SP 획득', label: '일반 미니언 처치 보상', help: '상대 성채의 일반 미니언 한 마리당 SP', field: 'amount', unit: 'SP', min: 1, max: 50, step: 1 },
  { key: 'eliteReward', section: 'SP 획득', label: '엘리트 미니언 처치 보상', help: '상대 성채의 엘리트 미니언 한 마리당 SP', field: 'amount', unit: 'SP', min: 1, max: 50, step: 1 },
  { key: 'neutralReward', section: 'SP 획득', label: '중립 몬스터 처치 보상', help: '중립 몬스터·보스 한 마리당 SP', field: 'amount', unit: 'SP', min: 1, max: 50, step: 1, defaultLabel: '몬스터별 기본 보상', fallback: 1 },
  { key: 'lanes', section: '전장과 병력', label: '이동 라인', help: '0개이면 자유 이동 · 포탑 배치 라인과 별개', field: 'count', unit: '개', min: 0, max: 3, step: 1 },
  { key: 'neutralWaves', section: '전장과 병력', label: '중립 몬스터', help: '출현 지점·진영당 일반 몬스터 수 · 보스 출현은 기존 유지', field: 'count', unit: '마리', min: 1, max: 10, step: 1, defaultLabel: '맵 기본 수량 (2~5마리)', fallback: 3 },
  { key: 'minions', section: '전장과 병력', label: '성채 미니언', help: '진영·라인당 일반 미니언 수 · 5웨이브마다 엘리트 1마리 추가', field: 'count', unit: '마리', min: 1, max: 10, step: 1 },
  { key: 'catapult', section: '성채와 구조물', label: '투석기', help: '성채의 원거리 범위 공격' },
  { key: 'oil', section: '성채와 구조물', label: '끓는 기름', help: '성채 주변의 적에게 범위 피해' },
  { key: 'towers', section: '성채와 구조물', label: '전방 포탑', help: '진영·배치 라인당 포탑 수 · 이동 라인 0개여도 설치 가능', field: 'count', unit: '개 / 라인', min: 1, max: 3, step: 1, extra: { field: 'laneCount', label: '포탑 배치 라인', min: 1, max: 3, step: 1, unit: '개' } },
  { key: 'spBox', section: '성채와 구조물', label: 'SP 상자', help: '전장 중앙에 균등 배치 · 실제 피해 10당 1 SP', field: 'count', unit: '개', min: 1, max: 3, step: 1 },
];

export function createMatchSettings(): MatchSettings {
  return {
    startingSp: { enabled: true, amount: 5 }, passiveSp: { enabled: true, amount: 1 },
    summonedReward: { enabled: true, amount: null }, minionReward: { enabled: true, amount: 1 },
    eliteReward: { enabled: true, amount: 3 }, neutralReward: { enabled: true, amount: null },
    lanes: { enabled: false, count: 0 }, neutralWaves: { enabled: true, count: null },
    minions: { enabled: false, count: 3 }, catapult: { enabled: false }, oil: { enabled: false },
    towers: { enabled: false, count: 1, laneCount: 1 }, spBox: { enabled: false, count: 1 },
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

/** Only explicit player-facing quantities may cross the room creation boundary. */
export function validateMatchSettings(value: unknown): MatchSettings {
  if (!record(value) || Object.keys(value).length !== MATCH_SETTING_DEFINITIONS.length) throw new Error('경기 설정 형식이 올바르지 않습니다.');
  for (const definition of MATCH_SETTING_DEFINITIONS) {
    const option = value[definition.key];
    const keys = definition.field ? ['enabled', definition.field] : ['enabled'];
    if (definition.extra) keys.push(definition.extra.field);
    if (!Object.hasOwn(value, definition.key) || !record(option) || Object.keys(option).length !== keys.length
      || keys.some((key) => !Object.hasOwn(option, key)) || typeof option.enabled !== 'boolean') {
      throw new Error(`${definition.label} 설정 형식이 올바르지 않습니다.`);
    }
    if (!definition.field) continue;
    if (definition.extra) {
      const extra = option[definition.extra.field];
      if (typeof extra !== 'number' || !Number.isInteger(extra) || extra < definition.extra.min || extra > definition.extra.max) {
        throw new Error(`${definition.extra.label}: ${definition.extra.min}~${definition.extra.max} 사이의 수량을 입력하세요.`);
      }
    }
    const amount = option[definition.field];
    if (amount === null && definition.defaultLabel) continue;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < definition.min! || amount > definition.max!
      || Math.abs(amount / definition.step! - Math.round(amount / definition.step!)) > 1e-7) {
      throw new Error(`${definition.label}: ${definition.min}~${definition.max} 사이의 수량을 입력하세요.`);
    }
  }
  return structuredClone(value) as unknown as MatchSettings;
}

export function resolveMatchSettings(settings: MatchSettings): ModeRules {
  const s = validateMatchSettings(settings);
  return resolveModeRules('standard', {
    lanes: { count: s.lanes.enabled ? s.lanes.count as 0 | 1 | 2 | 3 : 0 },
    neutralWaves: { enabled: s.neutralWaves.enabled, count: s.neutralWaves.count },
    minions: { enabled: s.minions.enabled, perLane: s.minions.count },
    fortAttacks: { catapult: s.catapult, oil: s.oil },
    towers: s.towers, spBox: s.spBox,
    sp: {
      initial: s.startingSp.enabled ? s.startingSp.amount : 0, maximum: 50,
      passive: s.passiveSp,
      summoned: s.summonedReward, minion: s.minionReward, elite: s.eliteReward, neutral: s.neutralReward,
    },
  });
}
