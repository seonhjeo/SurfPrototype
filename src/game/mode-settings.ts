export interface RewardRule { enabled: boolean; amount: number | null; multiplier: number }
export interface AreaWeaponRule { enabled: boolean; damage: number; range: number; radius: number; interval: number }
export interface ModeRules {
  lanes: { count: 0 | 1 | 2 | 3 };
  neutralWaves: { enabled: boolean; count: number | null };
  minions: { enabled: boolean; perLane: number; eliteEvery: number; statMultiplier: number };
  fortAttacks: { catapult: AreaWeaponRule; oil: AreaWeaponRule };
  towers: { enabled: boolean; count: number; laneCount: number; hp: number; damage: number; range: number; interval: number; radius: number; progress: number };
  spBox: { enabled: boolean; count: number; hp: number; radius: number; interactionRadius: number; spPerDamage: number; respawnDelay: number | null };
  sp: {
    initial: number; maximum: number;
    passive: { enabled: boolean; amount: number };
    towerLoss: { enabled: boolean; amount: number };
    summoned: RewardRule; minion: RewardRule; elite: RewardRule; neutral: RewardRule;
  };
}
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type ModeRulesOverride = DeepPartial<ModeRules>;

export function makeModeRules(initial: number, regen: number, killRewards: boolean): ModeRules {
  const reward = (amount: number | null): RewardRule => ({ enabled: killRewards, amount, multiplier: 1 });
  return {
    lanes: { count: 0 },
    neutralWaves: { enabled: true, count: null },
    minions: { enabled: false, perLane: 3, eliteEvery: 5, statMultiplier: 1.5 },
    fortAttacks: {
      catapult: { enabled: false, damage: 18, range: 7, radius: 1.25, interval: 3 },
      oil: { enabled: false, damage: 8, range: 2.4, radius: 2.4, interval: 1.5 },
    },
    towers: { enabled: false, count: 1, laneCount: 1, hp: 250, damage: 12, range: 4, interval: 1.5, radius: 0.45, progress: 0.24 },
    spBox: { enabled: false, count: 1, hp: 200, radius: 0.5, interactionRadius: 3.2, spPerDamage: 0.1, respawnDelay: null },
    sp: { initial, maximum: 50, passive: { enabled: regen > 0, amount: regen }, towerLoss: { enabled: false, amount: 5 }, summoned: reward(null), minion: reward(1), elite: reward(3), neutral: reward(null) },
  };
}

export function mergeModeRules(base: ModeRules, overrides?: ModeRulesOverride): ModeRules {
  const result = structuredClone(base);
  const merge = (target: Record<string, unknown>, source: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(source)) {
      if (!(key in target) || value === undefined) continue;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) merge(target[key] as Record<string, unknown>, value as Record<string, unknown>);
      else target[key] = value;
    }
  };
  if (overrides) merge(result as unknown as Record<string, unknown>, overrides as unknown as Record<string, unknown>);
  if (![0, 1, 2, 3].includes(result.lanes.count)) throw new Error('lane count must be 0, 1, 2 or 3');
  const validate = (value: unknown): void => {
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) throw new Error('mode values must be finite and non-negative');
    if (value && typeof value === 'object') for (const child of Object.values(value)) validate(child);
  };
  validate(result);
  const countWithin = (value: number, maximum: number) => Number.isInteger(value) && value >= 1 && value <= maximum;
  if (result.neutralWaves.count !== null && !countWithin(result.neutralWaves.count, 10)) throw new Error('neutral count must be null or an integer from 1 to 10');
  if (!countWithin(result.towers.count, 3) || !countWithin(result.towers.laneCount, 3) || !countWithin(result.spBox.count, 3)) throw new Error('structure counts must be integers from 1 to 3');
  if (!countWithin(result.minions.perLane, 10)) throw new Error('minion count must be an integer from 1 to 10');
  if (!countWithin(result.sp.towerLoss.amount, 50)) throw new Error('tower loss reward must be an integer from 1 to 50');
  if (result.minions.eliteEvery < 1 || !Number.isInteger(result.minions.eliteEvery) || !Number.isInteger(result.minions.perLane)) throw new Error('minion counts must be integers');
  if (result.sp.maximum <= 0 || result.spBox.interactionRadius < result.spBox.radius || result.towers.progress > 0.5) throw new Error('invalid mode geometry or resource cap');
  for (const weapon of [result.fortAttacks.catapult, result.fortAttacks.oil, result.towers]) if (weapon.interval <= 0) throw new Error('attack interval must be positive');
  return result;
}
