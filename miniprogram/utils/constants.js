// utils/constants.js - 游戏全局常量定义
// 所有可调参数集中管理，便于平衡性调整

// ============ 难度配置 ============
// v50 六档难度：小学 / 初中 / 高中 / KET / PET / 自定义
//   difficultyWeights 与词库 difficulty 字段（1=小学 2=初中 3=高中 4=KET(A2) 5=PET(B1)）对应
//   v50 变更: 大学档退役(原 3=大学词池重划为高中); 中学拆分初中/高中;
//     KET/PET 考试档词汇主体来自基础库池 + data/examWords.js 考试专属词(4/5)
//   levelTime/levelRamp 控制混合模式关卡推进（每 levelTime ms 推进一关，参数递增）
// v44 强度模型统一: 各档已删速度时间窗键(60s 递增已退役, 关卡 ramp 是唯一强度模型, 见 zombieManager.applyLevelRamp)
const DIFFICULTY_CONFIG = {
  primary: {
    name: '小学',
    spawnInterval: 4200,       // 僵尸生成间隔(ms)
    baseSpeed: 28,             // 僵尸基础移动速度(rpx/s → 实际换算)
    maxZombies: 6,             // 同屏僵尸上限
    questionTimeLimit: 20000,  // 单题限时(ms)
    difficultyWeights: { 1: 0.95, 2: 0.05, 3: 0 },  // 几乎纯小学词汇，少量初中启蒙（v50 重划）
    levelTime: 48000,          // v41: 60→48s（词汇易 → 快节奏短局，一局 ≈ 9 分钟）
    // v6 修复 (Task 12): levelRamp 已迁移到 LEVEL.RAMP（统一大写键），
    //   消费者 zombieManager.applyLevelRamp 读 r.SPAWN_INTERVAL_MULT / SPEED_MULT / TOUGH_PROB_BONUS
  },
  junior: {                    // v50: 原 middle(中学) 拆分 — 初中档，参数承袭
    name: '初中',
    spawnInterval: 3200,
    baseSpeed: 38,
    maxZombies: 8,
    questionTimeLimit: 15000,
    difficultyWeights: { 1: 0.20, 2: 0.75, 3: 0.05 },  // 主体初中词池 + 小学复习 + 少量高中拓展
    levelTime: 60000,          // v41: 60s 基准（一局 ≈ 11 分钟）
    // v6 修复 (Task 12): levelRamp 由 LEVEL.RAMP fallback 提供（见 gameManager L173）
  },
  senior: {                    // v50: 大学档退役 — 高中接棒顶格强度，参数承袭 college
    name: '高中',
    spawnInterval: 2400,
    baseSpeed: 50,
    maxZombies: 10,
    questionTimeLimit: 10000,
    difficultyWeights: { 1: 0.05, 2: 0.25, 3: 0.70 },  // 主体高中词池(原大学高阶) + 初中巩固
    levelTime: 72000,          // v41: 60→72s（词汇难 → 留足思考，一局 ≈ 13 分钟）
    // v6 修复 (Task 12): levelRamp 由 LEVEL.RAMP fallback 提供
  },
  ket: {                       // v50: 剑桥 KET (A2 Key) 考试档 — 词汇主体小学+初中池 + 考试专属词
    name: 'KET',
    spawnInterval: 3600,
    baseSpeed: 33,
    maxZombies: 7,
    questionTimeLimit: 16000,
    difficultyWeights: { 1: 0.30, 2: 0.30, 4: 0.40 },  // A2 全谱: 易词复习 + KET 专属词(examWords.js)
    levelTime: 54000,          // v50: 54s（A2 词汇偏易 → 短局快节奏，一局 ≈ 10 分钟）
  },
  pet: {                       // v50: 剑桥 PET (B1 Preliminary) 考试档 — 词汇主体初中+高中池 + 考试专属词
    name: 'PET',
    spawnInterval: 2800,
    baseSpeed: 44,
    maxZombies: 9,
    questionTimeLimit: 12000,
    difficultyWeights: { 2: 0.30, 3: 0.20, 5: 0.50 },  // B1 全谱: 中坚词 + PET 专属词(examWords.js)
    levelTime: 66000,          // v50: 66s（B1 词汇偏难 → 留思考，一局 ≈ 12 分钟）
  },
  // v35: 自定义词库档 — 用户导入词库文件(如「上海五年级英语·新教材」),
  // 游戏仅从导入词库出题。难度参数取 primary 同款温和值(导入场景多为家长
  // 给小学生定制); 权重三档混合 — 若导入词库某档无词, quizManager
  // _filterByDifficulty 自动回退全词库, 任意难度分布的词包都可用
  custom: {
    name: '自定义',
    spawnInterval: 4200,
    baseSpeed: 28,
    maxZombies: 6,
    questionTimeLimit: 20000,
    difficultyWeights: { 1: 0.6, 2: 0.3, 3: 0.1 },
    levelTime: 60000           // v41: 基准；实际按词库平均难度插值 48~72s（见 gameManager._computeLevelTimeMs）
  }
};

// ============ 自定义词库导入 (v35) ============
// 词库 JSON 格式: { "name": "词库名", "words": [{en, zh, phonetic?, difficulty?}] }
// (顶层也允许直接为数组; 详见 utils/customWordPack.js 头注释)
const CUSTOM_WORD_PACK = {
  MIN_WORDS: 8,               // 最少有效词数(4 选项出题需干扰项)
  MAX_WORDS: 600,             // 上限(防超长文件拖慢解析/存储)
  MAX_FILE_SIZE: 512 * 1024,  // 文件大小上限 512KB
  ACCEPT_EXT: ['json', 'txt'] // 可选文件扩展名
};

// ============ 僵尸类型定义 ============
// 五种类型：铁桶 / 小鬼 / 橄榄球 / 舞王 / 僵尸王，差异化属性与外观
// v54: iconPath 字段已全数移除 — /icon 目录从未存在, 11 处幽灵引用致每次启动 11 次必然失败的图片加载
// 全员走矢量插画; renderer 的 PNG 预加载/绘制机制保留为休眠扩展点(未来补真实资产时加回字段即可)
const ZOMBIE_TYPES = {
  bucket: {
    type: 'bucket',
    name: '铁桶僵尸',
    color: '#8FA57D',
    accentColor: '#A5B694',
    baseHealth: 6,              // v31: 2→6（1发秒杀→3发，消灭难度核心）
    speedMultiplier: 1.0,
    radius: 36,
    scoreReward: 100,
    assetKey: 'zombie_bucket'
  },
  imp: {
    type: 'imp',
    name: '小鬼僵尸',
    // v27 皮肤色参照 zombie_extra_1.png：灰绿（原紫 #9E8BB5）
    color: '#A6B492',
    accentColor: '#BCCCA6',
    baseHealth: 3,              // v31: 1→3（快速炮灰仍脆，但不再被一发带走）
    speedMultiplier: 1.7,
    radius: 30,
    scoreReward: 150,
    assetKey: 'zombie_imp'
  },
  football: {
    type: 'football',
    name: '橄榄球僵尸',
    // v28 皮肤色参照 zombie_football.png：灰绿（原棕 #A0826D）；死亡粒子同步变绿
    color: '#7E9272',
    accentColor: '#97AB8B',
    baseHealth: 12,             // v31: 5→12（重坦6发豌豆；食人花一口(8伤)不再秒杀→补刀提示分支激活）
    speedMultiplier: 0.65,
    radius: 44,
    scoreReward: 250,
    assetKey: 'zombie_football'
  },
  dancer: {
    type: 'dancer',
    name: '舞王僵尸',
    // v29 皮肤色参照 zombie_dancer.png：灰绿（原蓝灰 #78909C）；死亡粒子同步变绿
    color: '#9CB383',
    accentColor: '#B5C9A0',
    baseHealth: 14,             // v31: 6→14（最坦7发豌豆；需樱桃炸弹/多射手集火）
    speedMultiplier: 0.8,
    radius: 40,
    scoreReward: 300,
    assetKey: 'zombie_dancer'
  },
  king: {
    type: 'king',
    name: '僵尸王',
    // v51: 终局大波之王 — 皮肤灰绿承袭系列 zombie 色系
    color: '#8A9C7D',
    accentColor: '#A9BC9B',
    baseHealth: 32,             // v51: 固定血量(launchFinalWave 以 hpMult=1 生成, 不随关卡 ramp 漂移)
    speedMultiplier: 0.55,      // v51: 王者缓步(全场最慢, PvZ 巨人系压迫感)
    radius: 48,                 // v51: 最大体型
    scoreReward: 800,           // v51: 击杀高分(终局压轴奖励)
    assetKey: 'zombie_king'
    // 走矢量插画(_buildOffscreenCache 自动遍历 ZOMBIE_TYPES; v54 起全类型皆无 iconPath)
  }
};

// 不同难度下僵尸类型出现概率分布
// v50: 键随 DIFFICULTY_CONFIG 重划 — junior/senior 承袭 middle/college, KET/PET 按难度梯度内插
// v51: 僵尸王(king)不进常规生成权重 — 仅终局大波事件入场(zombieManager.launchFinalWave)
const ZOMBIE_TYPE_WEIGHTS = {
  primary: { bucket: 0.65, imp: 0.20, football: 0.08, dancer: 0.07 },
  junior:  { bucket: 0.50, imp: 0.28, football: 0.12, dancer: 0.10 },
  senior:  { bucket: 0.35, imp: 0.30, football: 0.20, dancer: 0.15 },
  ket:     { bucket: 0.55, imp: 0.25, football: 0.11, dancer: 0.09 },
  pet:     { bucket: 0.42, imp: 0.29, football: 0.15, dancer: 0.14 }
};

// v6 修复 (Task 12): PATHS 数组已删除 — pathManager.getGridBounds() 动态计算车道，
//   全项目零引用（Task 11 已清 pathManager 的 PATHS import）

// ============ 评分模型 ============
const SCORING = {
  BASE_SCORE: 100,             // 答对基础分
  SPEED_BONUS_MAX: 50,         // 速度奖励上限
  SPEED_BONUS_TIME: 5000,      // 在此时长内(ms)答对可获速度奖励
  COMBO_MULTIPLIERS: [1, 1, 1.5, 1.5, 2, 2, 2.5, 2.5, 3, 3], // 连击倍率(连续答对1~10次)
  COMBO_MAX_MULT: 3,
  WRONG_PENALTY: 0,            // 答错不扣分（惩罚仅为二错起的僵尸加速, 见 SUNLIGHT.PENALTY_WRONG_*）
  // v6 修复 (Task 12): 结算星级阈值（基于答题准确率 acc）
  STAR_3_ACC: 0.9,             // 3 星阈值
  STAR_2_ACC: 0.7,             // 2 星阈值
  STAR_1_ACC: 0.5              // 1 星阈值
};

// ============ 生命值 / 防线 ============
// v2 重构：lives 改为 defenseLines（防线数，僵尸突破终点扣减）
const LIVES = {
  INITIAL: 3,                  // 防线数（僵尸突破终点扣减，全部被突破才失败）
  MAX: 3
};

// ============ 关卡推进（混合模式） ============
// 每 levelTime ms 推进一关，参数按 levelRamp 递增；MAX_LEVEL 后不再加速
const LEVEL = {
  TIME_PER_LEVEL: 60000,       // 每关 60 秒（兜底值；实际取难度档 levelTime）
  // v41: 一局时长随单词难易度伸缩 — 易→短局快节奏, 难→长局留思考
  //   插值边界与 DIFFICULTY_CONFIG.primary(48s)/senior(72s) 成对维护（v50: college→senior）
  LEVEL_TIME_EASY: 48000,      // 词库平均难度 1.0 → 每关 48s（全程 ≈ 9 分钟）
  LEVEL_TIME_HARD: 72000,      // 词库平均难度 3.0 → 每关 72s（全程 ≈ 13 分钟）
  MAX_LEVEL: 10,               // v51: 12→10 一局适当缩短（小学≈7.2min/初中9/高中10.8 + 终局大波收尾; v31 曾 20→12）
  // v38: 末关收官 — 第 12 关开局停止生成，清完场上存量即胜利
  FINAL_CLEAR_GRACE_MS: 1500,  // 场清后定格时长(ms)：死亡动画收尾 + 通关仪式感
  // v51: 僵尸王终局大波 — 进入末关时王率先入场, 护卫队按节奏跟上
  KING_WAVE_ESCORTS: 9,        // 护卫僵尸数(3 车道 × 3, 类型按当前难度权重抽取)
  KING_WAVE_STAGGER_MS: 400,   // 护卫入场间隔(ms)（波次感 + 防单帧 10 只同屏的性能尖峰）
  // v60: 中场僵尸波 — 第 3/6 关开局各来一波迷你波（4 只快速入场），给长局
  //   制造节奏起伏; 独立于终局大波队列(zombieManager._midWaveQueue), 不影响
  //   胜利判定(仍然只看终局大波 isFinalWaveDone)
  MID_WAVES: [3, 6],           // 触发关卡
  MID_WAVE_SIZE: 4,            // 每波僵尸数
  MID_WAVE_WARN_MS: 1500,      // 预警时长(ms)：toast 后 ~1.5s 僵尸才入场
  MID_WAVE_STAGGER_MS: 550,    // 波内入场间隔(ms)
  RAMP: {
    SPAWN_INTERVAL_MULT: 0.92, // 生成间隔 ×0.92/关
    SPEED_MULT: 1.05,          // v31: 1.08→1.05（速度墙改血量墙：Lv12 累计×1.71 而非×2.0+，公平可读）
    TOUGH_PROB_BONUS: 0.05,    // football+dancer 概率 +5%/关
    HEALTH_PER_LEVEL: 0.08,    // v31: 僵尸血量 +8%/关（仅新生成僵尸生效，场上存量不变）
  }
};

// ============ 移动轨迹算法 ============
const MOVEMENT = {
  TYPE_LINEAR: 'linear',       // 直线
  TYPE_CURVE: 'curve'          // 曲线(贝塞尔)
  // v6 修复 (Task 12): PATH_PRECISION 已删除 — 路径采样函数 samplePath/cubicBezier 在 Task 11 中清理
};

// ============ 帧率与性能 ============
const PERFORMANCE = {
  TARGET_FPS: 60,
  MIN_FPS: 30,
  MAX_DELTA: 50,               // 单帧最大间隔(ms)，防止跳帧
  POOL_PREALLOC: 12,           // 僵尸对象池预分配数量
  POOL_MAX: 30,                // 对象池上限
  // v6 修复 (Task 12): 运行时性能阈值
  SUN_SYNC_INTERVAL_MS: 80,   // 阳光视图同步间隔(ms)
  SPAWN_LOG_INTERVAL_MS: 30000, // 生成健康日志间隔(ms)
  LOOP_FATAL_THRESHOLD: 3,    // 主循环连续异常终止阈值
  RENDER_FATAL_THRESHOLD: 5    // 渲染连续异常停止阈值
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
    FINAL_WAVE: 'final_wave',  // v51: 终局大波警报（低音战争号角）
    SUN: 'sun',             // 阳光收集音效
    PLACE: 'place'          // 放置植物音效
  }
};

// ============ 本地存储键名 ============
const STORAGE_KEYS = {
  USER_DATA: 'word_farm_user_data',  // 含最高分/游戏次数/设置
  LAST_RESULT: 'word_farm_last_result',
  CUSTOM_WORD_PACK: 'word_farm_custom_word_pack'  // v35: 自定义词库
};

// ============ UI 尺寸 ============
const UI = {
  // v6 修复 (Task 12): QUIZ_PANEL_HEIGHT_RATIO 已删除（v10 起答题面板改为内容自适应高度）
  HUD_HEIGHT: 86,                 // HUD 高度(rpx) — 仅用于 canvas fallback 估算
  SHOP_BAR_HEIGHT: 96,            // 植物商店栏高度(rpx)
  CANVAS_PADDING: 22,             // canvas 边距
  // v6 修复 (Task 12): 阳光 HUD 飘入动画参数（与 plantManager SUN_COLLECT_WINDOW_MS 配对）
  SUN_COLLECT_SHRINK: 0.4,        // 收集动画终点缩放（1 - 此值 × progress）
  SUN_APPEAR_SCALE_START: 0.4,    // 出现动画起点缩放
  SUN_APPEAR_SCALE_RANGE: 0.6,   // 出现动画缩放范围（start + 此值 × progress）
  SUN_TAP_HIT_RADIUS: 40         // v23: 阳光点击兜底命中半径（canvas px = DOM热区半径33px + 手指容错）
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
// v54: iconPath 字段已全数移除 — /icon 目录从未存在, 11 处幽灵引用致每次启动 11 次必然失败的图片加载
// 全员走矢量插画; renderer 的 PNG 预加载/绘制机制保留为休眠扩展点(未来补真实资产时加回字段即可)
const PLANT_TYPES = {
  shooter: {
    type: 'shooter', name: '豌豆射手', emoji: '🌱',
    cost: 50, health: 3, damage: 2,
    attackInterval: 1100, range: Infinity,
    color: '#7CB342',
    projectile: { type: 'normal', speed: 320, color: '#9CCC65', radius: 8 }
  },
  wall: {
    type: 'wall', name: '坚果', emoji: '🥜',
    cost: 50, health: 8, damage: 0,
    attackInterval: 0, range: 0,
    color: '#A1887F'
  },
  freezer: {
    type: 'freezer', name: '寒冰射手', emoji: '❄️',
    cost: 75, health: 3, damage: 2,
    attackInterval: 1300, range: Infinity,
    color: '#6FD9CE',               // v22 薄荷青（参照附件，与头部渐变中调一致）
    projectile: { type: 'ice', speed: 300, color: '#81D4FA', radius: 8,
                  slow: { factor: 0.5, duration: 2000 } }
  },
  cherry: {
    type: 'cherry', name: '樱桃炸弹', emoji: '🍒',
    cost: 100, health: 1, damage: 26,   // v31: 10→26（可达域 Lv1~12 内最高 HP=舞王 26，恒一击清场；MAX_LEVEL≥14 时封顶 2.0 舞王 28，自动降级为软化工具）
    attackInterval: 0, range: 0,
    isExplosive: true,
    fuseTime: 2000,
    blastRadius: 0.15,
    color: '#E53935'
  },
  chomper: {
    type: 'chomper', name: '食人花', emoji: '🪴',
    cost: 125, health: 4, damage: 8,
    attackInterval: 2500, range: 0.08,
    color: '#8E24AA',
    isChomper: true,
    swallowTime: 3000
  },
  sunflower: {
    type: 'sunflower', name: '向日葵', emoji: '🌻',
    cost: 50, health: 2, damage: 0,
    attackInterval: 0, range: 0,
    sunInterval: 8000, sunProduce: 25,
    color: '#FFC107'
  },
  fire: {
    type: 'fire', name: '火焰射手', emoji: '🔥',
    cost: 175, health: 3, damage: 2,    // v31: 1→2（穿透单位伤害对齐豌豆，防HP提升后沦为废卡）
    attackInterval: 1300, range: Infinity,
    color: '#FF6E40',
    // v2 火焰穿透：命中后不消失，最多穿透 pierceMax 个僵尸
    // 激活 plantManager.update 中的 isPierce / hitTargets / pierceCount 死代码路径
    // v48: 三连发 — 本路 + 左右邻路各一发(邻路弹沿邻路列向上飞), 边路
    //      植物自动只覆盖存在的车道; 触发感知同步扩展到覆盖车道
    projectile: { type: 'fire', speed: 320, color: '#FF8A65', radius: 9,
                  pierce: true, pierceMax: 3, multiLane: true,
                  adjacentDamageRatio: 0.5 }   // v49: 邻路弹伤害减半(本路全额, 邻路×0.5)
  }
};
// 商店栏展示顺序
const PLANT_ORDER = ['sunflower', 'shooter', 'wall', 'freezer', 'cherry', 'chomper', 'fire'];

// ============ 阳光经济 ============
const SUNLIGHT = {
  INITIAL: 150,                       // v2 100→150（新植物 cost 更高）
  MAX: 999,                           // 上限
  REWARD_CORRECT: 30,                 // v2 25→30（鼓励答题）
  PENALTY_WRONG_SPEED_MULT: 1.3,      // 连续二错起全场僵尸加速倍率(v45)
  PENALTY_WRONG_SPEED_TIME: 3000,    // 连续二错起加速持续时长(ms)
  PENALTY_WRONG_FREE_STREAK: 1,      // v45: 答错免罚档位 — 连续第1错仅清连击不加速(儿童向温和化), 连续第2错起才触发上面两项惩罚
  // v6 修复 (Task 12): 阳光动画时长 — 跨文件耦合：plantManager 删除 sun 删除时机 +
  //   gameManager._notifySunsView 收集动画 progress 必须用同一时长，否则阳光消失早/晚于动画
  SUN_COLLECT_WINDOW_MS: 320,         // 收集动画时长(ms)（替换 plantManager 旧 SUN_COLLECT_WNDOW typo）
  SUN_APPEAR_MS: 260,                  // 出现动画时长(ms)
  // v60: 击杀掉宝 — 僵尸被击杀时概率掉落一颗可收集阳光（plantManager.spawnLootSun）
  //   期望: 一局 80 杀 ≈ 10 次 × 15 = 150 阳光 ≈ 1 株向日葵的产出, 温和不破坏经济
  LOOT_CHANCE: 0.12,                   // 掉落概率(12%)
  LOOT_VALUE: 15                       // 掉落阳光面值
};

// ============ 僵尸通用参数 ============
// v6 修复 (Task 12): 集中 zombie 状态机/生成器/战斗的魔法数字 — 跨文件耦合必须同步
const ZOMBIE = {
  DYING_DURATION_MS: 400,        // 死亡淡出动画时长(ms) — renderer 端 _drawZombie 必须用同一值
  HIT_FLASH_MS: 200,             // 受击闪烁衰减时长(ms) — renderer 端闪烁正弦除数耦合
  HIT_FLASH_DIV: 30,             // 受击闪烁正弦除数（与 HIT_FLASH_MS 配对调谐闪频）
  SPAWN_INTERVAL_MIN_MS: 1200,   // 生成间隔下限(ms) — 任何递减都不得低于此值
  SPAWN_INTERVAL_DEFAULT_MS: 3200, // 难度未指定时默认间隔(ms)
  BASE_SPEED_DEFAULT: 38,        // 难度未指定时默认基础速度
  MAX_ZOMBIES_DEFAULT: 8,         // 默认同屏僵尸上限
  OVERSHOOT_MULT: 2.5,           // 生成超时强制倍数（spawnTimer ≥ interval×N 即强制生成）
  HEARTBEAT_STALL_MS: 15000,     // 心跳检测：超此时长无生成则强制释放名额
  TOUGH_BONUS_CAP: 0.30,         // football+dancer 概率递增上限
  HEALTH_RAMP_CAP: 2.0,          // v31: 关卡血量递增倍率封顶（baseHealth × 2.0 为上限）
  BUCKET_WEIGHT_FLOOR: 0.10,    // bucket 类型权重下限（避免被掏空）
  WOBBLE_SPEED_WALKING: 6,       // 行走摇摆角速度(rad/s)
  WOBBLE_SPEED_EATING: 8,        // 啃食摇摆角速度(rad/s，更激烈)
  // v49: 舞王僵尸召唤技能 — 邻路各召唤 1 只伴舞小鬼, 再次召唤需冷却
  DANCER_SUMMON_DELAY_MS: 2000,  // 首次召唤延迟(上场 2s 后开跳, 给玩家反应窗口)
  DANCER_SUMMON_COOLDOWN_MS: 8000, // 召唤冷却(每 8s 一轮)
  DANCER_SUMMON_TYPE: 'imp',     // 召唤物 = 小鬼僵尸(3HP 快速炮灰, 模拟伴舞)
  DANCER_SUMMON_BACK: 0.05       // 召唤物出生在舞王身后(进度 -0.05, 下限 0)
};

// ============ 植物通用参数 ============
// v6 修复 (Task 12): plant 状态机/受击/摇摆/食人花参数集中
const PLANT = {
  HIT_FLASH_MS: 180,             // 受击闪烁时长(ms) — 与 renderer _drawPlant 闪烁除数耦合
  HIT_FLASH_DIV: 20,             // 受击闪烁正弦除数（与 HIT_FLASH_MS 配对）
  WOBBLE_SPEED: 3,               // 摇摆角速度(rad/s)
  INITIAL_CD_RATIO: 0.5,         // 初始攻击冷却比例（× attackInterval）
  NO_TARGET_RETRY_MS: 200,       // 无目标时短冷却(ms)
  CHOMPER: {
    SNAP_DURATION_MS: 300,      // 咬合动画时长(ms)
    BITE_DAMAGE_POINT: 0.55,    // 咬合进度达到此值即结算伤害（× SNAP_DURATION）
    NO_BITE_SWALLOW_MS: 500,    // 未咬中目标时的短吞咽期(ms)
    IDLE_RETRY_MS: 150,         // 待机重试冷却(ms)
    KILL_BONUS: 25              // 击杀奖励分数
  }
};

// ============ 粒子系统 ============
// v6 修复 (Task 12): 粒子参数集中 — addBurst 默认值 + _drawParticles 重力 + 各事件爆发数
const PARTICLE = {
  SPEED_MIN: 60,                 // 爆发初速度下限(px/s)
  SPEED_RANGE: 80,               // 速度浮动范围(px/s)
  LIFE_MS: 500,                  // 默认寿命(ms)
  SIZE_MIN: 4,                   // 默认半径下限(px)
  SIZE_RANGE: 4,                 // 半径浮动范围(px)
  DEFAULT_COLOR: '#FFC733',      // 默认颜色（金黄）
  DEFAULT_COUNT: 12,             // 默认爆发粒子数
  GRAVITY: 200,                  // 重力加速度(px/s²)
  DT_FALLBACK_MS: 16,            // dt 缺省值(ms，~60fps)
  // 各事件爆发粒子数
  BURST_KILL: 14,                // 普通投射物击杀
  BURST_CHOMPER_KILL: 18,        // 食人花咬杀
  BURST_CHOMPER_HIT: 8,          // 食人花咬（未杀）
  BURST_EXPLODE_PER_ZOMBIE: 12,  // 樱桃爆炸 — 每僵尸
  BURST_EXPLODE_CENTER: 24,      // 樱桃爆炸 — 中心
  BURST_DANCER_SUMMON: 10        // v49: 舞王召唤 — 每伴舞出生点
};

// ============ 答题 ============
const QUIZ = {
  OPTION_COUNT: 4,               // 选项数
  // v39: 题目限时激活 — difficulty 配置里的 questionTimeLimit(20s/15s/10s) 长期是死配置，本版接通判定与倒计时 UI
  TIMEOUT_FALLBACK_MS: 20000,    // 难度配置缺 questionTimeLimit 时的兜底限时(ms)
  TIMER_TICK_MS: 500,            // 页面倒计时心跳间隔(ms)（条宽动画由 CSS transition 抹平步进）
  TIMER_DANGER_MS: 5000,         // 剩余 ≤ 该值进入紧急样式（红条 + 秒数脉冲）
  // v60: 连击里程碑 — combo 恰达阈值时触发一次性奖励（断连重爬可再触发，
  //   鼓励保持连击; 结算在 gameManager._resolveComboMilestone, 反馈 toast 在页面侧）
  MILESTONES: [
    { combo: 5,  type: 'sun',     value: 50 },   // 连击礼包：阳光直接 +50
    { combo: 10, type: 'sunrain', value: 3 },    // 天降阳光雨：3 颗可收集太阳（plantManager.spawnBonusSuns）
    { combo: 15, type: 'freeze',  value: 2500 }  // 寒冰脉冲：全场重减速 2.5s（zombieManager.applyGlobalSlow）
  ],
  // v60: 单词魔法弹 — 答对且 combo ≥ MIN_COMBO 时，一枚魔法弹自动打击场上
  //   最靠前(威胁最大)的僵尸：伤害 + 缓速（答对 = 直接参战, 学习与战斗强绑定）
  //   平衡: 伤害对齐一发豌豆(DAMAGE=2), 一题 ≥5s 间隔 → 边际 ≈ 0.4 个射手 DPS
  MAGIC: {
    MIN_COMBO: 5,          // 连击 5 起（新手保护期: 前 4 连击无魔弹）
    DAMAGE: 2,             // 伤害（对齐豌豆单发）
    SLOW_FACTOR: 0.6,      // 命中缓速因子
    SLOW_MS: 1500          // 缓速时长(ms)
  },
  FREEZE_FACTOR: 0.25,     // v60: 寒冰脉冲减速因子（比寒冰射手 0.5 更强, 仪式感）
  // v61: 里程碑全屏彩带 — 页面层纯 CSS 动画（与 Canvas 渲染/粒子系统零耦合, 不碰 task56 burst 计数）
  // 三档强度随里程碑档位递增: combo 5 洒彩带 / 10 加星 / 15 金色调+更多星
  CONFETTI: {
    COUNTS: [26, 38, 52],            // 各档彩带片数
    STARS: [0, 2, 4],                // 各档星星 emoji 片数（童话感点缀）
    STAR_EMOJIS: ['⭐', '🌟', '✨', '💛'],
    PALETTE: ['#FF6E40', '#FFD54F', '#66BB6A', '#42A5F5', '#AB47BC', '#FF80AB'],
    PALETTE_GOLD: ['#FFC733', '#FF6E40', '#FFD54F', '#FF8F00', '#66BB6A', '#FF80AB'],   // 顶档金色调
    STRIP_W: 10,                     // 长条片宽(rpx)
    STRIP_H: 26,                     // 长条片高(rpx)
    DOT_SIZE: 14,                    // 圆点片径(rpx)
    DOT_RATIO: 0.35,                 // 圆点占比（其余长条）
    DUR_MIN: 1.7,                    // 单片下落时长下限(s)
    DUR_MAX: 2.4,                    // 单片下落时长上限(s)
    DELAY_MAX: 0.35,                 // 单片起始延迟上限(s)
    CLEAR_MS: 3000                   // 整层清理时刻(ms) ≥ DUR_MAX+DELAY_MAX
  },
  // v61: 连续答错护学 — 惩罚只警示一次, 三错起转入护学（反死亡螺旋, 儿童向）
  // 与 v45 免罚档衔接: 1错免罚 / 2错警示加速一次 / 3错喘息减速+后续题限时放宽
  RECOVERY: {
    MIN_STREAK: 3,                   // 连续答错达该值进入护学
    BREATHE_MS: 2000,                // 恰第 3 错: 全场僵尸喘息减速时长(ms)（复用 FREEZE_FACTOR）
    TIME_BONUS_PCT: 0.5,             // 三错起: 下一题限时延长比例
    TIME_BONUS_MAX_MS: 8000          // 单题限时延长上限(ms)
  }
};

// ============ 亲子奖励系统 (v32) ============
// 过关得亲子积分 → 三档奖励兑换：即时小奖励(单次通关解锁) / 周末中等(连续打卡解锁) / 长线大奖(月度目标解锁)
// 集中管理便于家长按约定微调兑换价目
const REWARD_CONFIG = {
  STORAGE_KEY: 'word_farm_reward_state',   // 奖励状态持久化键
  POINTS: {
    WIN_MIN: 5,                 // v36: 通关保底积分（得分换算底数）
    SCORE_PER_POINT: 2000,      // v36: 每 2000 实际得分 → +1 亲子积分
    SCORE_BONUS_MAX: 15,        // v36: 得分加成封顶（得分积分 ≤ 5+15 = 20）
    STAR3: 5,                   // 3 星加成
    STAR2: 3,                   // 2 星加成
    DAILY_CHECKIN: 5,           // 当日首次通关（打卡）
    STREAK_BONUS_PER_DAY: 2,    // 连续打卡加成/天（第 2 天起计）
    STREAK_BONUS_MAX_DAYS: 5,   // 连续加成封顶天数（2×5=10 分封顶）
    // v47: 败局努力积分（儿童向 — 失败不空手; 防刷: 资格线+封顶, 收益远低于通关）
    LOSE_MIN_CORRECT: 3,        // 资格线：答对 ≥3 题才结算（防秒输摆烂刷分）
    LOSE_BASE: 1,               // 资格达成保底（参与奖）
    LOSE_PER_CORRECT: 4,        // 每答对 4 题 +1 分
    LOSE_MAX: 5                 // 封顶 5（故意输的收益 ≪ 通关 5~20+）
  },
  GATES: {
    STREAK_DAYS: 5,             // 周末中等：连续打卡解锁天数
    MONTH_POINTS: 600           // 长线大奖：本月亲子积分目标
  },
  COSTS: {                      // 兑换价目（即时 30 / 周末 200 / 长线 600）
    instant: 30,
    weekend: 200,
    grand: 600
  },
  MAX_HISTORY: 50               // 兑换记录保留条数
};

// ============ 投射物 ============
const PROJECTILE = {
  POOL_PREALLOC: 8,
  POOL_MAX: 30,
  // v6 修复 (Task 12): HIT_RADIUS 已删除（命中判定改用 僵尸半径+炮弹半径 圆形判定）
  PIERCE_MAX_DEFAULT: 3              // 火焰投射物默认穿透数（与 PLANT_TYPES.fire.projectile.pierceMax 同步）
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
  CUSTOM_WORD_PACK,
  ZOMBIE_TYPES,
  ZOMBIE_TYPE_WEIGHTS,
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
  COMBAT,
  // v6 修复 (Task 12): 新增 4 块集中常量
  ZOMBIE,
  PLANT,
  PARTICLE,
  QUIZ,
  REWARD_CONFIG
};
