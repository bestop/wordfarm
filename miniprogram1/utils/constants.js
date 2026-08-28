// utils/constants.js - 游戏全局常量定义
// 所有可调参数集中管理，便于平衡性调整

// ============ 难度配置 ============
// 三档难度对应学习阶段：小学 / 中学 / 大学
//   difficultyWeights 与 data/words.js 中 difficulty 字段（1=小学基础 / 2=中学进阶 / 3=大学高阶）对应
//   levelTime/levelRamp 控制混合模式关卡推进（每 levelTime ms 推进一关，参数递增）
const DIFFICULTY_CONFIG = {
  primary: {
    name: '小学',
    spawnInterval: 4200,       // 僵尸生成间隔(ms)
    baseSpeed: 28,             // 僵尸基础移动速度(rpx/s → 实际换算)
    speedRamp: 0.06,           // 速度随时间递增系数
    maxZombies: 6,             // 同屏僵尸上限
    questionTimeLimit: 20000,  // 单题限时(ms)
    difficultyWeights: { 1: 0.95, 2: 0.05, 3: 0 },  // 几乎纯小学词汇，少量中学启蒙
    levelTime: 60000,          // 每 60s 推进一关
    levelRamp: { spawnIntervalMult: 0.92, speedMult: 1.08, toughProbBonus: 0.05 }
  },
  middle: {
    name: '中学',
    spawnInterval: 3200,
    baseSpeed: 38,
    speedRamp: 0.09,
    maxZombies: 8,
    questionTimeLimit: 15000,
    difficultyWeights: { 1: 0.25, 2: 0.65, 3: 0.10 },
    levelTime: 60000,
    levelRamp: { spawnIntervalMult: 0.92, speedMult: 1.08, toughProbBonus: 0.05 }
  },
  college: {
    name: '大学',
    spawnInterval: 2400,
    baseSpeed: 50,
    speedRamp: 0.12,
    maxZombies: 10,
    questionTimeLimit: 10000,
    difficultyWeights: { 1: 0.05, 2: 0.30, 3: 0.65 },
    levelTime: 60000,
    levelRamp: { spawnIntervalMult: 0.92, speedMult: 1.08, toughProbBonus: 0.05 }
  }
};

// ============ 僵尸类型定义 ============
// 四种类型：铁桶 / 小鬼 / 橄榄球 / 舞王，差异化属性与外观
// iconPath: 角色造型资源路径（相对于 miniprogram 根目录）
const ZOMBIE_TYPES = {
  bucket: {
    type: 'bucket',
    name: '铁桶僵尸',
    color: '#7B8A6E',
    accentColor: '#9EA38A',
    baseHealth: 2,
    speedMultiplier: 1.0,
    radius: 36,
    scoreReward: 100,
    assetKey: 'zombie_bucket',
    iconPath: '/icon/zombie_bucket.png'
  },
  imp: {
    type: 'imp',
    name: '小鬼僵尸',
    color: '#9E8BB5',
    accentColor: '#B39DCE',
    baseHealth: 1,
    speedMultiplier: 1.7,
    radius: 30,
    scoreReward: 150,
    assetKey: 'zombie_imp',
    iconPath: '/icon/zombie_imp.png'
  },
  football: {
    type: 'football',
    name: '橄榄球僵尸',
    color: '#A0826D',
    accentColor: '#B89B88',
    baseHealth: 5,
    speedMultiplier: 0.65,
    radius: 44,
    scoreReward: 250,
    assetKey: 'zombie_football',
    iconPath: '/icon/zombie_football.png'
  },
  dancer: {
    type: 'dancer',
    name: '舞王僵尸',
    color: '#78909C',
    accentColor: '#B0BEC5',
    baseHealth: 6,
    speedMultiplier: 0.8,
    radius: 40,
    scoreReward: 300,
    assetKey: 'zombie_dancer',
    iconPath: '/icon/zombie_dancer.png'
  }
};

// 不同难度下僵尸类型出现概率分布
const ZOMBIE_TYPE_WEIGHTS = {
  primary: { bucket: 0.65, imp: 0.20, football: 0.08, dancer: 0.07 },
  middle:  { bucket: 0.50, imp: 0.28, football: 0.12, dancer: 0.10 },
  college: { bucket: 0.35, imp: 0.30, football: 0.20, dancer: 0.15 }
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

// ============ 生命值 / 防线 ============
// v2 重构：lives 改为 defenseLines（3 道基地植物防线）
const LIVES = {
  INITIAL: 3,                  // 防线数（3 道基地植物，全部被摧毁才失败）
  MAX: 3
};

// ============ 关卡推进（混合模式） ============
// 每 levelTime ms 推进一关，参数按 levelRamp 递增；MAX_LEVEL 后不再加速
const LEVEL = {
  TIME_PER_LEVEL: 60000,       // 每关 60 秒
  MAX_LEVEL: 20,               // 软上限
  RAMP: {
    SPAWN_INTERVAL_MULT: 0.92, // 生成间隔 ×0.92/关
    SPEED_MULT: 1.08,          // 速度 ×1.08/关
    TOUGH_PROB_BONUS: 0.05,    // football+dancer 概率 +5%/关
  }
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
    GAME_OVER: 'game_over',
    WIN: 'win',             // 胜利结算
    LEVEL_UP: 'level_up',
    SUN: 'sun',             // 阳光收集音效
    PLACE: 'place'          // 放置植物音效
  }
};

// ============ 本地存储键名 ============
const STORAGE_KEYS = {
  USER_DATA: 'word_farm_user_data',  // 含最高分/游戏次数/设置
  LAST_RESULT: 'word_farm_last_result'
};

// ============ UI 尺寸 ============
const UI = {
  QUIZ_PANEL_HEIGHT_RATIO: 0.15,  // 已废弃：v10 起答题面板改为内容自适应高度，不再使用固定比例
  HUD_HEIGHT: 86,                 // HUD 高度(rpx) — 仅用于 canvas fallback 估算
  SHOP_BAR_HEIGHT: 96,            // 植物商店栏高度(rpx)
  CANVAS_PADDING: 22              // canvas 边距
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
// attackInterval=攻击间隔(ms); range=攻击范围
// iconPath: 角色造型资源路径（相对于 miniprogram 根目录）
const PLANT_TYPES = {
  shooter: {
    type: 'shooter', name: '豌豆射手', emoji: '🌱',
    cost: 50, health: 3, damage: 2,
    attackInterval: 1100, range: Infinity,
    color: '#7CB342',
    iconPath: '/icon/plant_shooter.png',
    projectile: { type: 'normal', speed: 320, color: '#9CCC65', radius: 8 }
  },
  wall: {
    type: 'wall', name: '坚果', emoji: '🥜',
    cost: 50, health: 8, damage: 0,
    attackInterval: 0, range: 0,
    color: '#A1887F',
    iconPath: '/icon/plant_wall.png'
  },
  freezer: {
    type: 'freezer', name: '寒冰射手', emoji: '❄️',
    cost: 75, health: 3, damage: 2,
    attackInterval: 1300, range: Infinity,
    color: '#4FC3F7',
    iconPath: '/icon/plant_freezer.png',
    projectile: { type: 'ice', speed: 300, color: '#81D4FA', radius: 8,
                  slow: { factor: 0.5, duration: 2000 } }
  },
  cherry: {
    type: 'cherry', name: '樱桃炸弹', emoji: '🍒',
    cost: 100, health: 1, damage: 10,
    attackInterval: 0, range: 0,
    isExplosive: true,
    fuseTime: 2000,
    blastRadius: 0.15,
    color: '#E53935',
    iconPath: '/icon/plant_cherry.png'
  },
  chomper: {
    type: 'chomper', name: '食人花', emoji: '🪴',
    cost: 125, health: 4, damage: 8,
    attackInterval: 2500, range: 0.08,
    color: '#8E24AA',
    iconPath: '/icon/plant_chomper.png',
    isChomper: true,
    swallowTime: 3000
  },
  sunflower: {
    type: 'sunflower', name: '向日葵', emoji: '🌻',
    cost: 50, health: 2, damage: 0,
    attackInterval: 0, range: 0,
    sunInterval: 8000, sunProduce: 25,
    color: '#FFC107',
    iconPath: '/icon/plant_sunflower.png'
  }
};
// 商店栏展示顺序
const PLANT_ORDER = ['sunflower', 'shooter', 'wall', 'freezer', 'cherry', 'chomper'];

// ============ 阳光经济 ============
const SUNLIGHT = {
  INITIAL: 150,                       // v2 100→150（新植物 cost 更高）
  MAX: 999,                           // 上限
  REWARD_CORRECT: 30,                 // v2 25→30（鼓励答题）
  PENALTY_WRONG_SPEED_MULT: 1.3,      // 答错全场僵尸加速倍率
  PENALTY_WRONG_SPEED_TIME: 3000      // 答错加速持续时长(ms)
};

// ============ 投射物 ============
const PROJECTILE = {
  POOL_PREALLOC: 8,
  POOL_MAX: 30,
  HIT_RADIUS: 16                      // (已废弃)命中判定改用 僵尸半径+炮弹半径 的圆形判定，见 plantManager
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
  LEVEL,
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
