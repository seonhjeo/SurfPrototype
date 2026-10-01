import { MAPS } from './data.ts';
import type { MapId, ModeRules } from './data.ts';

export function spRecovery(rules: ModeRules, currentSp?: number): string {
  if (!rules.sp.passive.enabled || rules.sp.passive.amount <= 0) return '자동 획득 없음';
  return currentSp !== undefined && currentSp >= rules.sp.maximum ? '자동 획득 정지' : `+${rules.sp.passive.amount} / 초`;
}

export function killSpRule(rules: ModeRules): string {
  const rewards = [rules.sp.summoned, rules.sp.neutral];
  if (rules.minions.enabled) rewards.push(rules.sp.minion, rules.sp.elite);
  const enabled = rewards.map((reward) => reward.enabled && reward.multiplier > 0 && reward.amount !== 0);
  return enabled.every(Boolean) ? '처치 SP 획득' : enabled.some(Boolean) ? '처치 SP 종류별 적용' : '처치 SP 없음';
}

export const spRules = (rules: ModeRules): string => `시작 ${rules.sp.initial} SP · ${spRecovery(rules)} · ${killSpRule(rules)}`;

export function featureRules(rules: ModeRules): string {
  const features: string[] = [];
  features.push(rules.lanes.count ? `이동 라인 ${rules.lanes.count}개` : '자유 이동');
  if (!rules.neutralWaves.enabled) features.push('중립 몬스터 없음');
  if (rules.minions.enabled) features.push(`미니언 ${rules.minions.perLane}마리/라인`);
  if (rules.fortAttacks.catapult.enabled) features.push('투석기');
  if (rules.fortAttacks.oil.enabled) features.push('끓는 기름');
  if (rules.towers.enabled) features.push(`포탑 ${rules.towers.laneCount}라인 × ${rules.towers.count}개`);
  if (rules.towers.enabled && rules.sp.towerLoss.enabled) features.push(`내 포탑 파괴 시 +${rules.sp.towerLoss.amount} SP`);
  if (rules.spBox.enabled) features.push(`SP 상자 ${rules.spBox.count}개`);
  return features.join(' · ');
}

export function neutralRule(rules: ModeRules, map: MapId): string {
  if (!rules.neutralWaves.enabled) return '중립 몬스터·보스 없음';
  const count = rules.neutralWaves.count ?? MAPS[map].monstersPerSpawnPoint;
  return `좌·우 출현 지점에서 진영마다 ${count}마리씩${map === 'swamp' ? ' · 중립 이동속도 +30%' : ''}`;
}

export function matchRuleDetails(rules: ModeRules): [string, string][] {
  const reward = (value: ModeRules['sp']['summoned']) => value.enabled ? (value.amount === null ? '개체별 기본 보상' : `${value.amount} SP / 처치`) : 'OFF';
  return [
    ['이동 라인', rules.lanes.count ? `${rules.lanes.count}개` : '0개 · 자유 이동'],
    ['중립 몬스터', rules.neutralWaves.enabled ? (rules.neutralWaves.count === null ? 'ON · 맵 기본 수량' : `${rules.neutralWaves.count}마리 / 지점·진영`) : 'OFF'],
    ['성채 미니언', rules.minions.enabled ? `${rules.minions.perLane}마리 / 진영·이동 라인${rules.lanes.count === 0 ? ' (중앙 1곳)' : ''}` : 'OFF'],
    ['투석기', rules.fortAttacks.catapult.enabled ? 'ON' : 'OFF'], ['끓는 기름', rules.fortAttacks.oil.enabled ? 'ON' : 'OFF'],
    ['포탑 배치 라인', rules.towers.enabled ? `${rules.towers.laneCount}개 · 이동 라인과 별개` : 'OFF'],
    ['라인당 포탑 수', rules.towers.enabled ? `${rules.towers.count}개 · 진영당 총 ${rules.towers.laneCount * rules.towers.count}개` : 'OFF'],
    ['SP 상자', rules.spBox.enabled ? `중앙 ${rules.spBox.count}개` : 'OFF'],
    ['시작 SP', `${rules.sp.initial} SP`], ['자동 획득 한도', `${rules.sp.maximum} SP · 보상은 한도 초과 가능`],
    ['SP 자동 획득', spRecovery(rules)],
    ['소환 유닛 처치 보상', reward(rules.sp.summoned)], ['일반 미니언 처치 보상', reward(rules.sp.minion)],
    ['엘리트 미니언 처치 보상', reward(rules.sp.elite)], ['중립 몬스터 처치 보상', reward(rules.sp.neutral)],
    ['내 포탑 파괴 시 SP', rules.sp.towerLoss.enabled ? `소유 진영에 ${rules.sp.towerLoss.amount} SP / 개` : 'OFF'],
  ];
}

export const summonInstruction = (rules: ModeRules): string => rules.lanes.count
  ? '누르면 아군이 적은 라인 · 드래그하면 가까운 라인으로 진입'
  : '눌러서 소환 · 아래쪽 전장으로 드래그해 위치 지정';
