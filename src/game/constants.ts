// src/game/constants.ts - 游戏全局常量
// 完整移植自微信小程序端 utils/constants.js (v53) — 参数值保持一致，便于双端平衡性同步
// 跨文件耦合点均有注释标注（与小程序端同款工程自觉）

// ============ 难度配置（v50 六档） ============
// difficultyWeights 与词库 difficulty 字段（1=小学 2=初中 3=高中 4=KET(A2) 5=PET(B1)）对应
// levelTime: 每 levelTime ms 推进一关（关卡 ramp 是唯一强度模型, v44）
export interface DifficultyConfig {
  key: DifficultyKey
  name: string
  desc: string
  spawnInterval: number
  baseSpeed: number
  maxZombies: number
  questionTimeLimit: number
  difficultyWeights: Record<number, number>
  levelTime: number
}

export type DifficultyKey = 'primary' | 'junior' | 'senior' | 'ket' | 'pet' | 'custom'

export const DIFFICULTY_CONFIG: Record<DifficultyKey, DifficultyConfig> = {
  primary: {
    key: 'primary', name: '小学', desc: '词汇简单 · 节奏轻快',
    spawnInterval: 4200, baseSpeed: 28, maxZombies: 6, questionTimeLimit: 20000,
    difficultyWeights: { 1: 0.95, 2: 0.05, 3: 0 },
    levelTime: 48000,
  },
  junior: {
    key: 'junior', name: '初中', desc: '词汇进阶 · 强度适中',
    spawnInterval: 3200, baseSpeed: 38, maxZombies: 8, questionTimeLimit: 15000,
    difficultyWeights: { 1: 0.2, 2: 0.75, 3: 0.05 },
    levelTime: 60000,
  },
  senior: {
    key: 'senior', name: '高中', desc: '词汇高阶 · 挑战满级',
    spawnInterval: 2400, baseSpeed: 50, maxZombies: 10, questionTimeLimit: 10000,
    difficultyWeights: { 1: 0.05, 2: 0.25, 3: 0.7 },
    levelTime: 72000,
  },
  ket: {
    key: 'ket', name: 'KET', desc: '剑桥 A2 Key · 考试专属词',
    spawnInterval: 3600, baseSpeed: 33, maxZombies: 7, questionTimeLimit: 16000,
    difficultyWeights: { 1: 0.3, 2: 0.3, 4: 0.4 },
    levelTime: 54000,
  },
  pet: {
    key: 'pet', name: 'PET', desc: '剑桥 B1 Preliminary · 考试专属词',
    spawnInterval: 2800, baseSpeed: 44, maxZombies: 9, questionTimeLimit: 12000,
    difficultyWeights: { 2: 0.3, 3: 0.2, 5: 0.5 },
    levelTime: 66000,
  },
  custom: {
    key: 'custom', name: '自定义', desc: '导入词库 · 专属题库',
    spawnInterval: 4200, baseSpeed: 28, maxZombies: 6, questionTimeLimit: 20000,
    difficultyWeights: { 1: 0.6, 2: 0.3, 3: 0.1 },
    levelTime: 60000, // 实际按词库平均难度插值 48~72s（engine 内计算）
  },
}

// ============ 自定义词库导入 (v35) ============
export const CUSTOM_WORD_PACK = {
  MIN_WORDS: 8,
  MAX_WORDS: 600,
  MAX_FILE_SIZE: 512 * 1024,
  ACCEPT_EXT: ['json', 'txt'],
}

// ============ 僵尸类型（v51 五种） ============
export interface ZombieTypeDef {
  type: ZombieType
  name: string
  color: string
  accentColor: string
  baseHealth: number
  speedMultiplier: number
  radius: number
  scoreReward: number
}

export type ZombieType = 'bucket' | 'imp' | 'football' | 'dancer' | 'king'

export const ZOMBIE_TYPES: Record<ZombieType, ZombieTypeDef> = {
  bucket: {
    type: 'bucket', name: '铁桶僵尸', color: '#8FA57D', accentColor: '#A5B694',
    baseHealth: 6, speedMultiplier: 1.0, radius: 26, scoreReward: 100,
  },
  imp: {
    type: 'imp', name: '小鬼僵尸', color: '#A6B492', accentColor: '#BCCCA6',
    baseHealth: 3, speedMultiplier: 1.7, radius: 22, scoreReward: 150,
  },
  football: {
    type: 'football', name: '橄榄球僵尸', color: '#7E9272', accentColor: '#97AB8B',
    baseHealth: 12, speedMultiplier: 0.65, radius: 31, scoreReward: 250,
  },
  dancer: {
    type: 'dancer', name: '舞王僵尸', color: '#9CB383', accentColor: '#B5C9A0',
    baseHealth: 14, speedMultiplier: 0.8, radius: 28, scoreReward: 300,
  },
  king: {
    type: 'king', name: '僵尸王', color: '#8A9C7D', accentColor: '#A9BC9B',
    baseHealth: 32, speedMultiplier: 0.55, radius: 36, scoreReward: 800,
  },
}

// 各难度僵尸类型权重（king 不进常规生成 — 仅终局大波入场, v51）
export const ZOMBIE_TYPE_WEIGHTS: Record<string, Record<Exclude<ZombieType, 'king'>, number>> = {
  primary: { bucket: 0.65, imp: 0.2, football: 0.08, dancer: 0.07 },
  junior: { bucket: 0.5, imp: 0.28, football: 0.12, dancer: 0.1 },
  senior: { bucket: 0.35, imp: 0.3, football: 0.2, dancer: 0.15 },
  ket: { bucket: 0.55, imp: 0.25, football: 0.11, dancer: 0.09 },
  pet: { bucket: 0.42, imp: 0.29, football: 0.15, dancer: 0.14 },
  custom: { bucket: 0.65, imp: 0.2, football: 0.08, dancer: 0.07 },
}

// ============ 评分模型 ============
export const SCORING = {
  BASE_SCORE: 100,
  SPEED_BONUS_MAX: 50,
  SPEED_BONUS_TIME: 5000,
  COMBO_MULTIPLIERS: [1, 1, 1.5, 1.5, 2, 2, 2.5, 2.5, 3, 3],
  COMBO_MAX_MULT: 3,
  WRONG_PENALTY: 0,
  STAR_3_ACC: 0.9,
  STAR_2_ACC: 0.7,
  STAR_1_ACC: 0.5,
}

// ============ 生命值 / 防线（v2: 3 道防线） ============
export const LIVES = {
  INITIAL: 3,
  MAX: 3,
}

// ============ 关卡推进（混合模式, v51） ============
export const LEVEL = {
  TIME_PER_LEVEL: 60000,
  LEVEL_TIME_EASY: 48000,
  LEVEL_TIME_HARD: 72000,
  MAX_LEVEL: 10,
  FINAL_CLEAR_GRACE_MS: 1500,
  KING_WAVE_ESCORTS: 9,
  KING_WAVE_STAGGER_MS: 400,
  RAMP: {
    SPAWN_INTERVAL_MULT: 0.92,
    SPEED_MULT: 1.05,
    TOUGH_PROB_BONUS: 0.05,
    HEALTH_PER_LEVEL: 0.08,
  },
}

// ============ 性能 ============
export const PERFORMANCE = {
  TARGET_FPS: 60,
  MIN_FPS: 30,
  MAX_DELTA: 50,
  POOL_MAX: 30,
  SUN_SYNC_INTERVAL_MS: 80,
  VIEW_SYNC_INTERVAL_MS: 80,
}

// ============ 音效键 ============
export const AUDIO_KEYS = {
  START: 'start',
  CORRECT: 'correct',
  WRONG: 'wrong',
  KILL: 'kill',
  GAME_OVER: 'game_over',
  WIN: 'win',
  LEVEL_UP: 'level_up',
  FINAL_WAVE: 'final_wave',
  SUN: 'sun',
  PLACE: 'place',
} as const
export type AudioKey = (typeof AUDIO_KEYS)[keyof typeof AUDIO_KEYS]

// ============ 本地存储键名（与小程序端同名，双端语义一致） ============
export const STORAGE_KEYS = {
  USER_DATA: 'word_farm_user_data',
  LAST_RESULT: 'word_farm_last_result',
  CUSTOM_WORD_PACK: 'word_farm_custom_word_pack',
}

// ============ 网格配置（与小程序一致: 3 车道 × 5 槽位） ============
export const GRID = {
  ROWS: 3,
  COLS: 5,
}

// ============ 植物类型（v48/v49 参数） ============
export type PlantType = 'sunflower' | 'shooter' | 'wall' | 'freezer' | 'cherry' | 'chomper' | 'fire'

export interface PlantTypeDef {
  type: PlantType
  name: string
  emoji: string
  cost: number
  health: number
  damage: number
  attackInterval: number
  color: string
  accentColor?: string
  sunInterval?: number
  sunProduce?: number
  isExplosive?: boolean
  fuseTime?: number
  blastRadius?: number
  isChomper?: boolean
  swallowTime?: number
  projectile?: {
    kind: 'normal' | 'ice' | 'fire'
    speed: number
    radius: number
    slow?: { factor: number; duration: number }
    pierce?: boolean
    pierceMax?: number
    multiLane?: boolean
    adjacentDamageRatio?: number
  }
}

export const PLANT_TYPES: Record<PlantType, PlantTypeDef> = {
  sunflower: {
    type: 'sunflower', name: '向日葵', emoji: '🌻',
    cost: 50, health: 2, damage: 0, attackInterval: 0,
    sunInterval: 8000, sunProduce: 25,
    color: '#FFC107', accentColor: '#FFE082',
  },
  shooter: {
    type: 'shooter', name: '豌豆射手', emoji: '🌱',
    cost: 50, health: 3, damage: 2, attackInterval: 1100,
    color: '#7CB342', accentColor: '#9CCC65',
    projectile: { kind: 'normal', speed: 320, radius: 8 },
  },
  wall: {
    type: 'wall', name: '坚果', emoji: '🥜',
    cost: 50, health: 8, damage: 0, attackInterval: 0,
    color: '#A1887F', accentColor: '#BCAAA4',
  },
  freezer: {
    type: 'freezer', name: '寒冰射手', emoji: '❄️',
    cost: 75, health: 3, damage: 2, attackInterval: 1300,
    color: '#6FD9CE', accentColor: '#81D4FA',
    projectile: { kind: 'ice', speed: 300, radius: 8, slow: { factor: 0.5, duration: 2000 } },
  },
  cherry: {
    type: 'cherry', name: '樱桃炸弹', emoji: '🍒',
    cost: 100, health: 1, damage: 26, attackInterval: 0,
    isExplosive: true, fuseTime: 2000, blastRadius: 0.15,
    color: '#E53935', accentColor: '#EF9A9A',
  },
  chomper: {
    type: 'chomper', name: '食人花', emoji: '🪴',
    cost: 125, health: 4, damage: 8, attackInterval: 2500,
    isChomper: true, swallowTime: 3000,
    color: '#8E24AA', accentColor: '#CE93D8',
  },
  fire: {
    type: 'fire', name: '火焰射手', emoji: '🔥',
    cost: 175, health: 3, damage: 2, attackInterval: 1300,
    color: '#FF6E40', accentColor: '#FFAB91',
    projectile: {
      kind: 'fire', speed: 320, radius: 9,
      pierce: true, pierceMax: 3, multiLane: true, adjacentDamageRatio: 0.5,
    },
  },
}

export const PLANT_ORDER: PlantType[] = ['sunflower', 'shooter', 'wall', 'freezer', 'cherry', 'chomper', 'fire']

// ============ 阳光经济 ============
export const SUNLIGHT = {
  INITIAL: 150,
  MAX: 999,
  REWARD_CORRECT: 30,
  PENALTY_WRONG_SPEED_MULT: 1.3,
  PENALTY_WRONG_SPEED_TIME: 3000,
  PENALTY_WRONG_FREE_STREAK: 1, // v45: 连续第 1 错免罚（仅清连击），第 2 错起加速
  SUN_COLLECT_WINDOW_MS: 320,
  SUN_APPEAR_MS: 260,
  FIELD_MAX: 10,        // 同屏阳光上限（超出自动入账）
  LIFETIME_MS: 10000,   // 阳光寿命（超时自动入账，防挫败）
  TAP_HIT_RADIUS: 34,   // 点击命中半径(px)
}

// ============ 僵尸通用参数 ============
export const ZOMBIE = {
  DYING_DURATION_MS: 400,
  SPAWN_INTERVAL_MIN_MS: 1200,
  SPAWN_INTERVAL_DEFAULT_MS: 3200,
  BASE_SPEED_DEFAULT: 38,
  MAX_ZOMBIES_DEFAULT: 8,
  OVERSHOOT_MULT: 2.5,
  TOUGH_BONUS_CAP: 0.3,
  HEALTH_RAMP_CAP: 2.0,
  BUCKET_WEIGHT_FLOOR: 0.1,
  // v49: 舞王召唤
  DANCER_SUMMON_DELAY_MS: 2000,
  DANCER_SUMMON_COOLDOWN_MS: 8000,
  DANCER_SUMMON_TYPE: 'imp' as ZombieType,
  DANCER_SUMMON_BACK: 0.05,
  // 速度归一化参考路径长(px)：progress/s = baseSpeed / SPEED_PATH_REF
  // 小程序竖屏路径约 800px，baseSpeed 38 → 21s 走完全程；网页横屏等比换算
  SPEED_PATH_REF: 800,
}

// ============ 植物通用参数 ============
export const PLANT = {
  INITIAL_CD_RATIO: 0.5,
  NO_TARGET_RETRY_MS: 200,
  CHOMPER: {
    SNAP_DURATION_MS: 300,
    BITE_DAMAGE_POINT: 0.55,
    NO_BITE_SWALLOW_MS: 500,
    IDLE_RETRY_MS: 150,
    KILL_BONUS: 25,
  },
}

// ============ 粒子 ============
export const PARTICLE = {
  SPEED_MIN: 60,
  SPEED_RANGE: 80,
  LIFE_MS: 500,
  SIZE_MIN: 3,
  SIZE_RANGE: 4,
  DEFAULT_COLOR: '#FFC733',
  DEFAULT_COUNT: 12,
  GRAVITY: 200,
  BURST_KILL: 14,
  BURST_CHOMPER_KILL: 18,
  BURST_CHOMPER_HIT: 8,
  BURST_EXPLODE_PER_ZOMBIE: 12,
  BURST_EXPLODE_CENTER: 24,
  BURST_DANCER_SUMMON: 10,
}

// ============ 答题 ============
export const QUIZ = {
  OPTION_COUNT: 4,
  TIMEOUT_FALLBACK_MS: 20000,
  TIMER_TICK_MS: 500,
  TIMER_DANGER_MS: 5000,
}

// ============ 题目类型（按权重抽题） ============
export const QUESTION_TYPES = {
  EN_TO_ZH: { key: 'en2zh' as const, label: '选出对应的中文释义', weight: 0.45 },
  ZH_TO_EN: { key: 'zh2en' as const, label: '选出对应的英文单词', weight: 0.35 },
  WORD_TO_PHO: { key: 'word2pho' as const, label: '选出正确的音标', weight: 0.2 },
}
export type QuestionTypeKey = 'en2zh' | 'zh2en' | 'word2pho'

// ============ 僵尸-植物交互 ============
export const COMBAT = {
  ZOMBIE_ATTACK_INTERVAL: 1000,
  ZOMBIE_ATTACK_DAMAGE: 1,
  ZOMBIE_EAT_RANGE: 0.06,
}

// ============ 亲子奖励系统 (v32/v36/v47) ============
export const REWARD_CONFIG = {
  STORAGE_KEY: 'word_farm_reward_state',
  POINTS: {
    WIN_MIN: 5,
    SCORE_PER_POINT: 2000,
    SCORE_BONUS_MAX: 15,
    STAR3: 5,
    STAR2: 3,
    DAILY_CHECKIN: 5,
    STREAK_BONUS_PER_DAY: 2,
    STREAK_BONUS_MAX_DAYS: 5,
    LOSE_MIN_CORRECT: 3,
    LOSE_BASE: 1,
    LOSE_PER_CORRECT: 4,
    LOSE_MAX: 5,
  },
  GATES: {
    STREAK_DAYS: 5,
    MONTH_POINTS: 600,
  },
  COSTS: {
    instant: 30,
    weekend: 200,
    grand: 600,
  } as Record<string, number>,
  MAX_HISTORY: 50,
}
