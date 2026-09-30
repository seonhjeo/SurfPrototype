export type UnitId =
  | 'warrior' | 'archer' | 'rogue' | 'shield' | 'mage'
  | 'knight' | 'warlock' | 'hunter' | 'commander' | 'archmage';
export type Side = 'player' | 'enemy';
export type MapId = 'desert' | 'forest' | 'swamp' | 'road';
export type WeatherId = 'sunny' | 'rain' | 'fog';
export type AttackKind = 'melee' | 'projectile' | 'slash' | 'fireball' | 'iceball';

export interface UnitDefinition {
  id: UnitId;
  name: string;
  icon: string;
  cost: number;
  hp: number;
  attack: number;
  detection: number;
  range: number;
  speed: number;
  attackInterval: number;
  reward: number;
  skillCooldown: number;
  role: string;
  skillDescription: string;
  attackKind: AttackKind;
}

export interface MonsterDefinition {
  name: string;
  hp: number;
  attack: number;
  speed: number;
  attackInterval: number;
  detection: number;
  range: number;
  reward: number;
  icon?: string;
}

export interface MapDefinition {
  id: MapId;
  name: string;
  subtitle: string;
  gimmickDescription: string;
  // Ordinary monsters per spawn point and destination side; each wave has four groups.
  monstersPerSpawnPoint: number;
  neutralMoveMultiplier: number;
  color: number;
  groundColor: number;
  monster: MonsterDefinition;
  boss: MonsterDefinition;
}

export interface WeatherDefinition {
  id: WeatherId;
  name: string;
  icon: string;
  description: string;
  moveMultiplier: number;
  detectionMultiplier: number;
}

export interface Environment {
  map: MapId;
  weather: WeatherId;
}

// Distances use U; speeds use U/s; intervals and durations use seconds.
export const SP_START = 5;
export const SP_MAX = 50;
export const SP_REGEN = 1;
export const MATCH_DURATION = 300;
export const DECK_DURATION = 30;
export const DECK_SIZE = 5;
export const FORT_HP = 1000;
export const WAVE_FIRST = 5;
export const WAVE_INTERVAL = 20;
export const WAVE_GROWTH = 1.07;
export const PROJECTILE_SPEED = 8;
export const PLAYER_RADIUS = 0.28;
export const MONSTER_RADIUS = 0.15;
export const BOSS_RADIUS = 0.45;
export const FORT_RADIUS = 0.8;

export interface SkillDefinition {
  damage?: number;
  length?: number;
  width?: number;
  radius?: number;
  duration?: number;
  knockback?: number;
  burnDamage?: number;
  burnDuration?: number;
  chargeSpeed?: number;
  chargeDistance?: number;
}

export const SKILLS: Record<UnitId, SkillDefinition> = {
  warrior: { damage: 25, length: 1.5, width: 1.2 },
  archer: { damage: 45, knockback: 1.5 },
  rogue: { duration: 3 },
  shield: { damage: 10, radius: 1.5, knockback: 1.5 },
  mage: { damage: 20, radius: 1.8, burnDamage: 3, burnDuration: 3 },
  knight: { damage: 25, width: 1, chargeSpeed: 6, chargeDistance: 4 },
  warlock: { damage: 0, duration: 2 },
  hunter: { damage: 15 },
  commander: { duration: 5 },
  archmage: { damage: 4, radius: 2, duration: 5 },
};

export const BASIC_ATTACK_SHAPES = {
  warrior: { length: 1, width: 0.9 },
  commander: { length: 1, width: 1.4 },
  mage: { radius: 0.8 },
  archmage: { radius: 1 },
};

export const STATUS = {
  staggerDuration: 0.15,
  stealthDuration: 3,
  stealthSpeedMultiplier: 1.5,
  attackSpeedMultiplier: 1.5,
  slowMultiplier: 0.7,
};

export const UNIT_IDS: readonly UnitId[] = [
  'warrior', 'archer', 'rogue', 'shield', 'mage',
  'knight', 'warlock', 'hunter', 'commander', 'archmage',
];

export const UNITS: Record<UnitId, UnitDefinition> = {
  warrior: {
    id: 'warrior', name: '전사', icon: '⚔', cost: 5, hp: 100, attack: 10,
    detection: 3, range: 1, speed: 1.1, attackInterval: 1.2, reward: 2,
    skillCooldown: 8, role: '근접 다수 공격', attackKind: 'slash',
    skillDescription: '8초마다 전방 길이 1.5 × 폭 1.2 U에 강한 세로베기, 각 25 피해.',
  },
  archer: {
    id: 'archer', name: '궁수', icon: '↗', cost: 5, hp: 50, attack: 15,
    detection: 7, range: 5, speed: 1, attackInterval: 1.3, reward: 2,
    skillCooldown: 9, role: '원거리 단일 공격·밀어내기', attackKind: 'projectile',
    skillDescription: '9초마다 강화 화살로 단일 대상에게 45 피해와 1.5 U 넉백.',
  },
  rogue: {
    id: 'rogue', name: '도적', icon: '†', cost: 7, hp: 50, attack: 20,
    detection: 3, range: 1, speed: 1.4, attackInterval: 0.9, reward: 3,
    skillCooldown: 9, role: '은신을 이용한 전선 통과', attackKind: 'melee',
    skillDescription: '9초마다 3초간 은신·이동속도 1.5배. 공격 없이 적 성채로 전진하며 광역 피해는 받음.',
  },
  shield: {
    id: 'shield', name: '방패병', icon: '⛨', cost: 7, hp: 200, attack: 5,
    detection: 3, range: 1, speed: 0.8, attackInterval: 1.5, reward: 3,
    skillCooldown: 9, role: '전선 유지·밀어내기', attackKind: 'melee',
    skillDescription: '9초마다 전방 90도·반경 1.5 U의 적에게 각 10 피해와 1.5 U 넉백.',
  },
  mage: {
    id: 'mage', name: '마법사', icon: '✹', cost: 10, hp: 30, attack: 10,
    detection: 7, range: 5, speed: 0.9, attackInterval: 1.6, reward: 4,
    skillCooldown: 10, role: '원거리 광역 공격·지속 피해', attackKind: 'fireball',
    skillDescription: '10초마다 반경 1.8 U에 각 20 피해. 맞은 대상에게 3초간 초당 3 화상 피해.',
  },
  knight: {
    id: 'knight', name: '기사', icon: '♞', cost: 10, hp: 100, attack: 10,
    detection: 3, range: 1, speed: 1.2, attackInterval: 1.1, reward: 4,
    skillCooldown: 10, role: '성채 방향 돌파', attackKind: 'melee',
    skillDescription: '10초마다 적 성채 방향으로 최대 4 U 돌진. 폭 1 U의 경로에 닿은 적마다 25 피해.',
  },
  warlock: {
    id: 'warlock', name: '저주술사', icon: '◉', cost: 10, hp: 30, attack: 10,
    detection: 7, range: 5, speed: 0.9, attackInterval: 1.5, reward: 4,
    skillCooldown: 8, role: '단일 대상 기절', attackKind: 'projectile',
    skillDescription: '8초마다 사거리 안의 가장 가까운 적 한 명을 2초간 기절. 스킬 추가 피해 없음.',
  },
  hunter: {
    id: 'hunter', name: '사냥꾼', icon: '⌖', cost: 3, hp: 80, attack: 5,
    detection: 3, range: 1, speed: 1.2, attackInterval: 1, reward: 1,
    skillCooldown: 6, role: '저비용 중립 몬스터 사냥', attackKind: 'melee',
    skillDescription: '6초마다 단일 대상에게 15 피해. 기본 공격·스킬 모두 중립 몬스터와 보스에 2배 피해.',
  },
  commander: {
    id: 'commander', name: '기사단장', icon: '♜', cost: 30, hp: 300, attack: 30,
    detection: 3, range: 1, speed: 0.85, attackInterval: 1.4, reward: 10,
    skillCooldown: 14, role: '근접 광역 공격·아군 공격속도 강화', attackKind: 'slash',
    skillDescription: '14초마다 자신을 포함한 현재 전장의 아군 모두에게 5초간 공격속도 +50%.',
  },
  archmage: {
    id: 'archmage', name: '대마도사', icon: '❄', cost: 30, hp: 80, attack: 30,
    detection: 7, range: 5, speed: 0.85, attackInterval: 1.8, reward: 10,
    skillCooldown: 14, role: '원거리 광역 공격·지역 둔화', attackKind: 'iceball',
    skillDescription: '14초마다 반경 2 U의 얼음구역을 5초간 생성. 초당 4 피해와 이동속도 -30%.',
  },
};

export const MAPS: Record<MapId, MapDefinition> = {
  desert: {
    id: 'desert', name: '사막', subtitle: '작은 전갈 · 거대 전갈',
    gimmickDescription: '좌·우에서 진영마다 일반 몬스터 2마리씩', monstersPerSpawnPoint: 2, neutralMoveMultiplier: 1,
    color: 0xdcb16a, groundColor: 0x493d2c,
    monster: { name: '작은 전갈', hp: 6, attack: 3, speed: 1, attackInterval: 1.5, detection: 3, range: 1, reward: 1 },
    boss: { name: '거대 전갈', hp: 180, attack: 12, speed: 0.9, attackInterval: 2, detection: 4, range: 1.2, reward: 8, icon: '♏' },
  },
  forest: {
    id: 'forest', name: '숲', subtitle: '어린 늑대 · 우두머리 늑대',
    gimmickDescription: '좌·우에서 진영마다 일반 몬스터 5마리씩', monstersPerSpawnPoint: 5, neutralMoveMultiplier: 1,
    color: 0x8dbb81, groundColor: 0x263c32,
    monster: { name: '어린 늑대', hp: 7, attack: 3, speed: 1.15, attackInterval: 1.3, detection: 3, range: 1, reward: 1 },
    boss: { name: '우두머리 늑대', hp: 160, attack: 14, speed: 1, attackInterval: 1.8, detection: 4, range: 1.2, reward: 8, icon: 'Λ' },
  },
  swamp: {
    id: 'swamp', name: '늪', subtitle: '작은 슬라임 · 거대 슬라임',
    gimmickDescription: '중립 몬스터·보스 이동속도 +30%', monstersPerSpawnPoint: 3, neutralMoveMultiplier: 1.3,
    color: 0xa4b77b, groundColor: 0x333c31,
    monster: { name: '작은 슬라임', hp: 8, attack: 2, speed: 0.85, attackInterval: 1.2, detection: 3, range: 1, reward: 1 },
    boss: { name: '거대 슬라임', hp: 220, attack: 10, speed: 0.8, attackInterval: 2, detection: 4, range: 1.2, reward: 8, icon: '●' },
  },
  road: {
    id: 'road', name: '성 도로', subtitle: '떠돌이 도적 · 도적 두목',
    gimmickDescription: '맵 추가 효과 없음', monstersPerSpawnPoint: 3, neutralMoveMultiplier: 1,
    color: 0xb3a99c, groundColor: 0x3d3a37,
    monster: { name: '떠돌이 도적', hp: 7, attack: 3, speed: 1, attackInterval: 1.5, detection: 3, range: 1, reward: 1 },
    boss: { name: '도적 두목', hp: 200, attack: 12, speed: 0.9, attackInterval: 2, detection: 4, range: 1.2, reward: 8, icon: '†' },
  },
};

export const WEATHER: Record<WeatherId, WeatherDefinition> = {
  sunny: {
    id: 'sunny', name: '화창함', icon: '☀', description: '유닛 능력치 변화 없음',
    moveMultiplier: 1, detectionMultiplier: 1,
  },
  rain: {
    id: 'rain', name: '비', icon: '☂', description: '양 진영 플레이어 유닛 이동속도 20% 감소 · 중립 몬스터 제외',
    moveMultiplier: 0.8, detectionMultiplier: 1,
  },
  fog: {
    id: 'fog', name: '안개', icon: '≋', description: '양 진영 플레이어 유닛 감지 거리 30% 감소 · 중립 몬스터 제외',
    moveMultiplier: 1, detectionMultiplier: 0.7,
  },
};

export function randomEnvironment(random: () => number = Math.random): Environment {
  const maps: MapId[] = ['desert', 'forest', 'swamp', 'road'];
  const weather: WeatherId[] = ['sunny', 'rain', 'fog'];
  return {
    map: maps[Math.floor(random() * maps.length)],
    weather: weather[Math.floor(random() * weather.length)],
  };
}

export function completeDeck(partial: UnitId[], random: () => number = Math.random): UnitId[] {
  const deck = [...new Set(partial)].slice(0, DECK_SIZE);
  const candidates = UNIT_IDS.filter((id) => !deck.includes(id));
  while (deck.length < DECK_SIZE) {
    const index = Math.floor(random() * candidates.length);
    deck.push(candidates.splice(index, 1)[0]);
  }
  return deck;
}
