import type { ModeRules } from './data.ts';

export const spRecovery = (rules: ModeRules): string => rules.sp.passive.enabled && rules.sp.passive.amount > 0
  ? `+${rules.sp.passive.amount} / 초` : '자동 획득 없음';

export function killSpRule(rules: ModeRules): string {
  const rewards = [rules.sp.summoned, rules.sp.neutral];
  if (rules.minions.enabled) rewards.push(rules.sp.minion, rules.sp.elite);
  const enabled = rewards.map((reward) => reward.enabled && reward.multiplier > 0 && reward.amount !== 0);
  return enabled.every(Boolean) ? '처치 SP 획득' : enabled.some(Boolean) ? '처치 SP 종류별 적용' : '처치 SP 없음';
}

export const spRules = (rules: ModeRules): string => `시작 ${Math.min(rules.sp.initial, rules.sp.maximum)} SP · ${spRecovery(rules)} · ${killSpRule(rules)}`;

export function featureRules(rules: ModeRules): string {
  const features: string[] = [];
  if (rules.lanes.count) features.push(`${rules.lanes.count}개 라인`);
  if (!rules.neutralWaves.enabled) features.push('중립 몬스터 없음');
  if (rules.minions.enabled) features.push('성채 미니언');
  if (rules.fortAttacks.catapult.enabled) features.push('투석기');
  if (rules.fortAttacks.oil.enabled) features.push('끓는 기름');
  if (rules.towers.enabled) features.push('전방 포탑');
  if (rules.spBox.enabled) features.push('SP 상자');
  return features.join(' · ');
}

export const summonInstruction = (rules: ModeRules): string => rules.lanes.count
  ? '누르면 아군이 적은 라인 · 드래그하면 가까운 라인으로 진입'
  : '눌러서 소환 · 아래쪽 전장으로 드래그해 위치 지정';
