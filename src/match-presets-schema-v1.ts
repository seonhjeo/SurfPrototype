/** Historical settings schema. Keep this snapshot when adding later settings versions. */
const QUANTITIES_V1 = {
  startingSp: { field: 'amount', min: 1, max: 50, step: 1 },
  passiveSp: { field: 'amount', min: 0.1, max: 50, step: 0.1 },
  summonedReward: { field: 'amount', min: 1, max: 50, step: 1, nullable: true },
  minionReward: { field: 'amount', min: 1, max: 50, step: 1 },
  eliteReward: { field: 'amount', min: 1, max: 50, step: 1 },
  neutralReward: { field: 'amount', min: 1, max: 50, step: 1, nullable: true },
  towerLossReward: { field: 'amount', min: 1, max: 50, step: 1 },
  lanes: { field: 'count', min: 0, max: 3, step: 1 },
  neutralWaves: { field: 'count', min: 1, max: 10, step: 1, nullable: true },
  minions: { field: 'count', min: 1, max: 10, step: 1 },
  towers: { field: 'count', min: 1, max: 3, step: 1 },
  spBox: { field: 'count', min: 1, max: 3, step: 1 },
} as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!record(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error('이전 프리셋의 경기 설정 형식이 올바르지 않습니다.');
  }
}

/** Independent of live definitions/defaults: missing old fields remain errors. */
export function validatePresetSettingsV1(value: unknown): Record<string, unknown> {
  exactKeys(value, ['environment', ...Object.keys(QUANTITIES_V1), 'catapult', 'oil']);
  exactKeys(value.environment, ['map', 'weather']);
  if (!['random', 'desert', 'forest', 'swamp', 'road'].includes(value.environment.map as string)
    || !['random', 'sunny', 'rain', 'fog'].includes(value.environment.weather as string)) {
    throw new Error('이전 프리셋의 맵과 날씨 설정이 올바르지 않습니다.');
  }
  for (const [key, quantity] of Object.entries(QUANTITIES_V1)) {
    const option = value[key];
    exactKeys(option, key === 'towers' ? ['enabled', quantity.field, 'laneCount'] : ['enabled', quantity.field]);
    if (typeof option.enabled !== 'boolean') throw new Error('이전 프리셋의 ON/OFF 설정이 올바르지 않습니다.');
    const amount = option[quantity.field];
    if (!(amount === null && 'nullable' in quantity && quantity.nullable)
      && (typeof amount !== 'number' || !Number.isFinite(amount) || amount < quantity.min || amount > quantity.max
        || Math.abs(amount / quantity.step - Math.round(amount / quantity.step)) > 1e-7)) {
      throw new Error('이전 프리셋의 수량 설정이 올바르지 않습니다.');
    }
    if (key === 'towers' && (typeof option.laneCount !== 'number' || !Number.isInteger(option.laneCount)
      || option.laneCount < 1 || option.laneCount > 3)) {
      throw new Error('이전 프리셋의 포탑 배치 라인이 올바르지 않습니다.');
    }
  }
  for (const key of ['catapult', 'oil']) {
    const option = value[key];
    exactKeys(option, ['enabled']);
    if (typeof option.enabled !== 'boolean') throw new Error('이전 프리셋의 ON/OFF 설정이 올바르지 않습니다.');
  }
  return structuredClone(value);
}
