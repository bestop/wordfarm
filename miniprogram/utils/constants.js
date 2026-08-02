// utils/constants.js - 游戏全局常量定义
// 所有可调参数集中管理，便于平衡性调整

// ============ 难度配置 ============
// 不同难度对应不同的僵尸生成间隔、速度、题库难度分布
const DIFFICULTY_CONFIG = {
  easy: {
    name: '简单',
    spawnInterval: 4200,       // 僵尸生成间隔(ms)
    baseSpeed: 28,             // 僵尸基础移动速度(rpx/s → 实际换算)
    speedRamp: 0.06,           // 速度随时间递增系数
    maxZombies: 6,             // 同屏僵尸上限
    questionTimeLimit: 20000,  // 单题限时(ms)
    difficultyWeights: { 1: 0.7, 2: 0.25, 3: 0.05 } // 题目难度权重
  },
  medium: {
    name: '中等',
    spawnInterval: 3200,
    baseSpeed: 38,
    speedRamp: 0.09,
    maxZombies: 8,
    questionTimeLimit: 15000,
    difficultyWeights: { 1: 0.4, 2: 0.4, 3: 0.2 }
  },
  hard: {
    name: '困难',
    spawnInterval: 2400,
    baseSpeed: 50,
    speedRamp: 0.12,
    maxZombies: 10,
    questionTimeLimit: 10000,
    difficultyWeights: { 1: 0.2, 2: 0.4, 3: 0.4 }
  }
};

// ============ 僵尸类型定义 ============
// 三种类型：普通 / 快速 / 强壮，差异化属性与外观
const ZOMBIE_TYPES = {
  normal: {
    type: 'normal',
    name: '普通僵尸',
    color: '#9CCC65',          // 身体绿
    accentColor: '#C5DD7A',
    baseHealth: 1,
    speedMultiplier: 1.0,
    radius: 36,                // 渲染半径(rpx)
    scoreReward: 100,          // 击杀奖励基础分
    assetKey: 'zombie_normal'
  },
  fast: {
    type: 'fast',
    name: '飞毛腿僵尸',
    color: '#81D4FA',
    accentColor: '#B3E5FC',
    baseHealth: 1,
    speedMultiplier: 1.7,
    radius: 30,
    scoreReward: 150,
    assetKey: 'zombie_fast'
  },
  strong: {
    type: 'strong',
    name: '壮汉僵尸',
    color: '#FF8A65',
    accentColor: '#FFAB91',
    baseHealth: 3,
    speedMultiplier: 0.65,
    radius: 44,
    scoreReward: 250,
    assetKey: 'zombie_strong'
  }
};

// 不同难度下僵尸类型出现概率分布
const ZOMBIE_TYPE_WEIGHTS = {
  easy:   { normal: 0.70, fast: 0.20, strong: 0.10 },
  medium: { normal: 0.55, fast: 0.30, strong: 0.15 },
  hard:   { normal: 0.40, fast: 0.35, strong: 0.25 }
};

// ============ 路径定义 ============
// 三条直线车道（竖向），与 GRID 行对齐
// lane X 由 pathManager.getGridBounds() 动态计算，PATHS 仅保留兼容
const PATHS = [
  [{ x: 0.20, y: 0.00 }, { x: 0.20, y: 1.00 }],
  [{ x: 0.50, y: 0.00 }, { x: 0.50, y: 1.00 }],
  [{ x: 0.80, y: 0.00 }, { x: 0.80, y: 1.00 }]
];

// ============ 评分模型 ============
const SCORING = {
  BASE_SCORE: 100,             // 答对基础分
  SPEED_BONUS_MAX: 50,         // 速度奖励上限
  SPEED_BONUS_TIME: 5000,      // 在此时长内(ms)答对可获速度奖励
  COMBO_MULTIPLIERS: [1, 1, 1.5, 1.5, 2, 2, 2.5, 2.5, 3, 3], // 连击倍率(连续答对1~10次)
  COMBO_MAX_MULT: 3,
  WRONG_PENALTY: 0             // 答错不扣分（仅惩罚僵尸加速）
};

// ============ 生命值 ============
const LIVES = {
  INITIAL: 3,                  // 初始生命值
  MAX: 5                       // 生命上限
};

// ============ 移动轨迹算法 ============
const MOVEMENT = {
  TYPE_LINEAR: 'linear',       // 直线
  TYPE_CURVE: 'curve',         // 曲线(贝塞尔)
  PATH_PRECISION: 100          // 路径采样精度
};

// ============ 帧率与性能 ============
const PERFORMANCE = {
  TARGET_FPS: 60,
  MIN_FPS: 30,
  MAX_DELTA: 50,               // 单帧最大间隔(ms)，防止跳帧
  POOL_PREALLOC: 12,           // 僵尸对象池预分配数量
  POOL_MAX: 30                 // 对象池上限
};

// ============ 资源 ============
const ASSET_KEYS = {
  AUDIO: {
    START: 'start',
    CORRECT: 'correct',
    WRONG: 'wrong',
    KILL: 'kill',
    GAME_OVER: 'game_over'
  }
};

// ============ 本地存储键名 ============
const STORAGE_KEYS = {
  USER_DATA: 'word_farm_user_data',  // 含最高分/游戏次数/设置
  LAST_RESULT: 'word_farm_last_result'
};

// ============ UI 尺寸 ============
const UI = {
  QUIZ_PANEL_HEIGHT_RATIO: 0.30,  // 答题区占屏高30%（给商店栏腾空间）
  HUD_HEIGHT: 100,                // HUD高度(rpx) — 仅用于canvas fallback计算
  SHOP_BAR_HEIGHT: 110,           // 植物商店栏高度(rpx)
  CANVAS_PADDING: 24              // canvas边距
};

// ============ 网格配置 ============
// 3 行(车道) × 5 列(槽位)，用于植物放置与僵尸移动
// lane=0,1,2 对应三条车道；slot=0~4，0=最远(spawn侧) 4=最近(房子侧)
const GRID = {
  ROWS: 3,            // 车道数（lane = 0,1,2）
  COLS: 5,            // 每条车道槽位数（slot = 0~4，0=最远 4=最近）
  TOP_RATIO: 0.08,    // 网格顶部留白（spawn 区）
  BOTTOM_RATIO: 0.05, // 网格底部留白（房子区）
  LEFT_RATIO: 0.08,   // 网格左侧留白
  RIGHT_RATIO: 0.08   // 网格右侧留白
};

// ============ 植物类型 ============
// cost=阳光消耗; health=血量; damage=每次投射物伤害;
// attackInterval=攻击间隔(ms); sunProduce/sunInterval=向日葵产阳光
const PLANT_TYPES = {
  shooter: {
    type: 'shooter', name: '豌豆射手', emoji: '🌱',
    cost: 50, health: 3, damage: 1,
    attackInterval: 1400, range: Infinity,
    color: '#7CB342',
    projectile: { type: 'normal', speed: 320, color: '#9CCC65', radius: 8 }
  },
  sunflower: {
    type: 'sunflower', name: '向日葵', emoji: '🌻',
    cost: 50, health: 2, damage: 0,
    attackInterval: 0, range: 0,
    sunProduce: 25, sunInterval: 8000,
    color: '#FFB300'
  },
  wall: {
    type: 'wall', name: '坚果墙', emoji: '🥜',
    cost: 50, health: 8, damage: 0,
    attackInterval: 0, range: 0,
    color: '#A1887F'
  },
  freezer: {
    type: 'freezer', name: '寒冰射手', emoji: '❄️',
    cost: 75, health: 3, damage: 1,
    attackInterval: 1600, range: Infinity,
    color: '#4FC3F7',
    projectile: { type: 'ice', speed: 300, color: '#81D4FA', radius: 8,
                  slow: { factor: 0.5, duration: 2000 } }
  }
};
// 商店栏展示顺序
const PLANT_ORDER = ['shooter', 'sunflower', 'wall', 'freezer'];

// ============ 阳光经济 ============
const SUNLIGHT = {
  INITIAL: 100,                       // 初始阳光
  MAX: 999,                           // 上限
  REWARD_CORRECT: 25,                 // 答对奖励
  REWARD_SUNFLOWER: 25,               // 向日葵产阳光
  PENALTY_WRONG_SPEED_MULT: 1.3,      // 答错全场僵尸加速倍率
  PENALTY_WRONG_SPEED_TIME: 3000      // 答错加速持续时长(ms)
};

// ============ 投射物 ============
const PROJECTILE = {
  POOL_PREALLOC: 8,
  POOL_MAX: 30,
  HIT_RADIUS: 16                      // 命中判定半径(px)
};

// ============ 题目类型 ============
// 按权重随机抽题，weight 之和应为 1
const QUESTION_TYPES = {
  EN_TO_ZH:    { key: 'en2zh',    label: '选出对应的中文释义',     weight: 0.45 },
  ZH_TO_EN:    { key: 'zh2en',    label: '选出对应的英文单词',     weight: 0.35 },
  WORD_TO_PHO: { key: 'word2pho', label: '选出正确的音标',         weight: 0.20 }
};

// ============ 僵尸-植物交互 ============
const COMBAT = {
  ZOMBIE_ATTACK_INTERVAL: 1000,   // 僵尸啃植物间隔(ms)
  ZOMBIE_ATTACK_DAMAGE: 1,        // 每次啃咬伤害
  ZOMBIE_EAT_RANGE: 0.06          // 僵尸到达植物的进度判定阈值
};

module.exports = {
  DIFFICULTY_CONFIG,
  ZOMBIE_TYPES,
  ZOMBIE_TYPE_WEIGHTS,
  PATHS,
  SCORING,
  LIVES,
  MOVEMENT,
  PERFORMANCE,
  ASSET_KEYS,
  STORAGE_KEYS,
  UI,
  GRID,
  PLANT_TYPES,
  PLANT_ORDER,
  SUNLIGHT,
  PROJECTILE,
  QUESTION_TYPES,
  COMBAT
};
