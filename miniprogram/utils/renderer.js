// utils/renderer.js - Canvas 2D 渲染器
// 负责: 背景绘制、僵尸绘制、植物绘制、HUD、粒子效果
// 采用离屏 Canvas 缓存复杂元素提升性能

const { ZOMBIE_TYPES, PLANT_TYPES, GRID, ZOMBIE, PLANT, PARTICLE, PERFORMANCE } = require('./constants.js');
const { pathManager } = require('./pathManager.js');
// v6 修复 (Task 7-B F3): 引入 fpsMonitor，让 _drawParticles 接入 shouldSkipDetails 动态降级
const { fpsMonitor } = require('./fpsMonitor.js');
// v55 拆分: roundRect 兼容函数移至 canvasHelpers.js, 僵尸离屏插画移至 zombiePainter.js
const { safeRoundRect } = require('./canvasHelpers.js');
const zombiePainter = require('./zombiePainter.js');

/**
 * 渲染器类
 */

/* ========================================================
   RENDER_TOKENS 设计系统中心（系统性视觉优化 v2）
   · 所有色彩 / 描边 / 比例 / 高光 / 阴影参数统一从此取
   · 与 shop-avatar (game.wxss) 的数值保持 1:1 映射，
     保证 Canvas 角色 ↔ CSS 物品栏风格完全一致
   ====================================================== */
const RENDER_TOKENS = {
  // ---------- 色彩 Palette ----------
  COLORS: {
    INK:       '#4E342E',  // 瞳孔/嘴线：统一深咖（替换散落 #4E342E）
    STROKE:    '#FFFFFF',  // 萌系白描边：角色造型/装饰
    MOUTH_PINK:'#E91E63',  // O嘴/露齿嘴 深粉
    MOUTH_LIP: '#F48FB1',  // 下唇高光粉
    BLUSH_PINK:'rgba(255,141,163,0.78)',  // 植物通用粉腮（v65 提饱和）
    BLUSH_RICH:'rgba(248,124,160,0.85)',  // 坚果浓腮红
    BLUSH_COOL:'rgba(96,198,255,0.62)',   // 寒冰腮蓝
    BLUSH_ZOMBIE:'rgba(255,110,150,0.72)',// 僵尸爱心腮红
    // 豌豆 Shooter（v65 鲜嫩豆绿系）
    S_LEAF_DARK:  '#9CCC65',
    S_LEAF_MID:   '#83C641',
    S_LEAF_LIGHT: '#CFE98C',
    S_STEM:       '#7DBE33',
    S_PEA_LIGHT:  '#C5E1A5',
    S_MOUTH_OUT:  '#558B2F',
    S_MOUTH_IN:   '#33691E',
    S_PEA_SHINE:  '#F1F8E9',
    // 坚果 Wall
    W_SPROUT_DARK:'#58C05C',
    W_SPROUT_LIGHT:'#7ED684',
    W_RIND:       'rgba(109,76,65,0.35)',  // 坚果壳纹
    // 寒冰 Freezer v22（参照附件 plant_freezer.png：薄荷青冰晶系 + 鲜绿底座叶；v65 提饱和）
    F_LEAF_DARK:  '#46B84E',   // 后层大叶 深鲜绿
    F_LEAF_MID:   '#5FC55E',   // 前层小叶 鲜绿
    F_STEM:       '#3FAE4A',   // 茎 深鲜绿
    F_HEAD_LIGHT: '#BFF7F1',   // 头部亮部 薄荷青
    F_HEAD_DARK:  '#21B9AE',   // 头部暗部 深青
    F_MOUTH_OUT:  '#1F8B85',   // 炮口外环 深青
    F_MOUTH_IN:   '#0E403C',   // 炮口内腔 近黑青
    F_CRYSTAL:    '#EAFDFF',   // 冰晶主色 近白冰
    F_CRYSTAL_2:  '#9FE8EC',   // 冰晶切面暗部
    F_LID:        '#5ECFC2',   // 半垂眼睑色（头中调）
    F_LID_LINE:   '#16726B',   // 眼睑边缘线 深青
    // 僵尸头饰
    Z_CONE:       '#FFC93C',
    Z_RIBBON:     '#FF6E40',
    Z_HELMET:     '#B0BEC5',
    Z_HELMET_EAR: '#78909C',
    Z_STAR:       '#FFD54F',
    // 护甲僵尸 Armored（金属全盔 + 胸甲 + 铆钉）
    Z_ARMOR:        '#90A4AE',  // 主甲色（与 def.color 一致）
    Z_ARMOR_DARK:   '#546E7A',  // 甲片阴影
    Z_ARMOR_LIGHT:  '#CFD8DC',  // 金属反光高光
    Z_VISOR:        '#263238',  // 护面缝隙暗色
    Z_BOLT:         '#ECEFF1',  // 铆钉
    // 樱桃炸弹 Cherry（v65 提饱和鲜红）
    C_BODY:       '#F44336',
    C_BODY_DARK:  '#D32F2F',
    C_LEAF:       '#5FC55E',
    C_FUSE:       '#7DBE33',
    C_SPARK:      '#FFF176',
    C_SHINE:      '#FFCDD2',
    // v24 樱桃新增（参照 plant_cherry.png）
    C_BODY_LIGHT: '#FF8674',   // 亮部（渐变起点，高饱和鲜红）
    C_BODY_EDGE:  '#A4161A',   // 边缘最深部（后层樱桃渐变终点 #971012 由暗档混出）
    C_TIP:        '#7A3B2E',   // 茎顶蒂头 深红褐
    C_BROW:       '#5B1512',   // 倒八字眉/撇嘴 深红褐
    // 火焰射手 Fire（包含投射物火焰球可复用色彩）
    FIRE_FLAME:     '#FF8A65',  // 火焰中层橙（与 constants.js plant_fire projectile.color 一致）
    FIRE_BODY_DARK: '#E64A19',  // 火焰外层深橙红
    FIRE_CORE:      '#FFEB3B',  // 火焰内核亮黄
    FIRE_LEAF_DARK: '#A1887F',  // 焦土色叶（外层）
    FIRE_LEAF_MID:  '#D7CCC8',  // 焦土色叶（内层）
    FIRE_STEM:      '#5D4037',  // 焦糖色茎
    FIRE_MOUTH_OUT: '#3E2723',  // 火焰口外圈（深棕）
    FIRE_MOUTH_IN:  '#1B0F0A',  // 火焰口内黑
    // v25 食人花 Chomper 新增（按系列风格标准重绘；v65 葡萄紫提鲜）
    CH_HEAD_LIGHT: '#F2D3F8',   // 头部亮部 浅紫粉
    CH_HEAD_DARK:  '#6A1FB8',   // 头部暗部 深紫
    CH_SPOT:       '#6C2493',   // 表皮斑点 深紫
    CH_LIP:        '#7B27AA',   // 大嘴厚唇 深紫
    CH_MOUTH:      '#460C66',   // 口腔 近黑紫
    CH_FLASH:      '#D32F2F',   // 咬合瞬间闪光 红
    CH_BROW:       '#3B1252',   // 倒八字眉 深紫黑
    CH_BLUSH:      'rgba(224,144,246,0.62)',  // 淡紫腮红（v65 提亮）
    // v25 火焰射手 Fire 新增（按系列风格标准重绘）
    FR_HEAD_LIGHT: '#FFE0B2',   // 头部亮部 浅杏橙
    FR_HEAD_DARK:  '#D84315',   // 头部暗部 深橙红
    FR_CANNON_RIM: '#BF360C',   // 炮口外环 深红
    FR_CANNON_IN:  '#3E0F0A',   // 炮口内腔 近黑红
    FR_BROW:       '#8D2819',   // 倒八字眉 深红棕
    // v26 铁桶僵尸 Bucket 新增（v94 附图可爱 3D 风：紫色铆钉桶）
    Z_BUCKET_LIGHT: '#CFC0E8',  // 铁桶亮部 紫罗兰高光带（v96 回归附图紫桶）
    Z_BUCKET:       '#9C7BC4',  // 铁桶基色 中紫
    Z_BUCKET_DARK:  '#5E4690',  // 铁桶暗部 底缘/侧影/铆钉 深紫
    Z_RUST:         '#A8672F',  // （预留）锈斑棕褐
    Z_SHIRT:        '#9EC6E0',  // 破衬衫 亮天蓝（v65 提鲜）
    Z_SHIRT_DARK:   '#74A0BC',  // 衣影/口袋/撕裂内衬
    Z_PANTS:        '#4A4F54',  // 破旧长裤 深灰
    Z_BOOT:         '#6B6356',  // 工装靴 暗棕
    Z_MOUTH:        '#8A3A3E',  // 僵尸口腔 暗红
    // v27 小鬼僵尸 Imp 新增（参照 zombie_extra_1.png 设定图：兜帽破袍+麻袋+棕靴；v65 微提亮）
    Z_HOOD_LIGHT:  '#948A80',  // 兜帽亮部 浅灰褐（左上受光）
    Z_HOOD:        '#63605A',  // 兜帽/破长袍基色 中灰
    Z_HOOD_DARK:   '#403B34',  // 兜帽暗部/撕裂内衬/短靴 深灰
    Z_SACK:        '#D2AF6B',  // 麻袋 粗麻黄（v65 提鲜）
    Z_SACK_DARK:   '#9A7A44',  // 麻袋束绳/补丁/暗部 深麻褐
    Z_EYE_YELLOW:  '#FBF3BC',  // 小鬼眼白 浑浊淡黄
    // v28 橄榄球僵尸 Football 新增（v94 附图风：红盔+面罩+红球衣）
    Z_FH_RED:        '#E8452F',  // 头盔/护肩基色 足球红
    Z_FH_RED_LIGHT:  '#F06A4F',  // 盔体/护肩左上受光
    Z_FH_RED_DARK:   '#A3231B',  // 盔体右下暗部/眉缘缓冲条/甲缝
    Z_FH_STRIPE:     '#F7EDD6',  // 盔顶中条纹/裤侧条纹 奶油白
    Z_FH_CAGE:       '#D5CEBB',  // 面罩格栅 暖银
    Z_FH_JERSEY:     '#C13A2A',  // 球衣/短裤 猩红（v94 绿改红，对齐附图）
    Z_FH_JERSEY_DARK:'#8F2618',  // 球衣衣影/下摆撕裂内衬
    Z_FH_WRIST:      '#7A1F14',  // 护腕/袖口 深红
    Z_FH_CLEAT:      '#6B4C3A',  // 橄榄球鞋 棕褐
    // v29 舞王僵尸 Dancer 新增（参照 zombie_dancer.png 设定图：黑礼帽+紫西装+领带+音符；v65 紫罗兰提鲜）
    Z_DN_HAT:        '#23232B',  // 礼帽帽冠 近黑碳灰
    Z_DN_HAT_DARK:   '#0F0F15',  // 帽檐/冠底接缝暗部
    Z_DN_HAT_LIGHT:  '#3A3A46',  // 帽冠左上受光带（v29.3 减对比柔和）
    Z_DN_SUIT:       '#7C3FA0',  // 西装/西裤 紫罗兰
    Z_DN_SUIT_DARK:  '#5A2B78',  // 衣影/驳领/下摆撕裂内衬 深紫
    Z_DN_SUIT_LIGHT: '#9C64C4',  // 西装受光浅紫（音符用）
    Z_DN_SHIRT:      '#F2F0DC',  // 衬衫/袖口/领带条纹 米白
    Z_DN_TIE:        '#4A2460',  // 领带 深紫黑
    Z_DN_SHOE:       '#5C4033',  // 圆头皮鞋 深棕
    Z_DN_TONGUE:     '#FF5A5F',  // 舌头 鲜红
    // v51 僵尸王 King 新增（v94 附图风：金冠金袍 + 皇家紫披风）
    Z_KING_GOLD:       '#FFCB47',  // 王冠/袖口/肩扣 亮金
    Z_KING_GOLD_DARK:  '#C08A0D',  // 冠底带/冠尖描影 深金
    Z_KING_GEM:        '#E53935',  // 冠身红宝石/腰带扣 深红
    Z_KING_CAPE:       '#6A3FA0',  // 斗篷/腰带 皇家紫（v94 深红改紫，对齐附图）
    Z_KING_CAPE_DARK:  '#4C2B78',  // 斗篷右暗部/战靴 深紫
    Z_KING_ROBE:       '#D9A43B',  // 王袍/袍袖 金黄（v94 暗紫改金，对齐附图）
    Z_KING_ROBE_DARK:  '#A87718',  // 王袍衣影/袍摆内衬 深金
    // 通用
    SHADOW:       'rgba(0,0,0,0.14)',   // 阴影地面椭圆
    HIGHLIGHT_BASE: 'rgba(255,255,255,',  // 高光拼接用：+ "0.35)"
    // 僵尸阵营专属（v3 阵营区分强化：暗描边 + 暗高光，一眼区分植物 vs 僵尸）
    Z_STROKE:     '#3E2723',  // 僵尸暗色描边（替代植物白描边 #FFFFFF）
    Z_HIGHLIGHT:  'rgba(255,255,255,0.10)',  // 僵尸微弱高光（病态哑光感）
  },

  // ---------- 描边粗细（基于基准半径 r 的动态系数）----------
  // 公式：_strokeW(coeff) = max(1, coeff * (r/42))
  // v3 简化版：整体加粗，让小尺寸下轮廓更具辨识度（低对比度细节一律删除）
  STROKE: {
    MAIN:  4.0,   // 主体/装饰描边（3.2 → 4.0 +25%）
    THIN:  2.6,   // 纹线/十字纹（1.8 → 2.6 +44%）—— 坚果壳纹/冰晶十字必须一眼看见
    INK:   2.8,   // 眼线/嘴线（2.3 → 2.8 +22%）
    EYE:   1.8,   // 眼白描边（1.2 → 1.8 +50%）
    LIP:   2.2,   // 唇描边（1.6 → 2.2 +37%）
  },

  // ---------- v3 视觉简化规则（核心特征清单 · 删了就认不出的不能碰；冗余全部砍掉）----------
  // 植物保留：豌豆射手=圆头+右上斜帽式炮管(v34)+顶水滴叶+半球底座+2侧叶；坚果=倒水滴形+纵向弧纹+顶三角突起+倒八字眉；寒冰=宝石头+右上斜帽式冰晶炮管+管口冰雾+顶三叉冰晶簇
  // 僵尸保留：bucket=金属铁桶；imp=兜帽+麻袋；football=红盔+面罩+护肩；dancer=礼帽+紫西装+音符；king=金冠+深红斗篷；全部删除次要装饰
  // 表情统一：大眼睛 + 右下大瞳孔 + 双高光 + 圆形腮红（v3 爱心→实心圆，小尺寸不再糊）
  SIMPLIFY: {
    LEAF_TIERS: 2,           // 叶色3档→2档（省渐变层级，平涂更干净）
    NUT_RIND_COUNT: 2,       // 坚果壳纹3条→2条（粗横纹更易识别）
    NUT_SPROUT_COUNT: 1,     // 坚果嫩芽3个→1个（只留中间最高的）
    FROST_EXTRA_SNOW: false, // 寒冰 2 颗六角雪花：直接删除（与核心冰晶重复信息）
    FAST_BOW_HEART: false,   // imp 僵尸 蝴蝶结中央爱心：删除（小尺寸糊成一团）
    STRONG_HELMET_EAR: false,// football 头盔耳朵：删除
    STRONG_STAR_BADGE: false,// football 星章：删除
    BLUSH_SHAPE: 'circle',   // 腮红形状：heart→circle（小尺寸下爱心边缘糊，平涂圆一眼识别）
  },

  // ---------- 表情比例（与 _drawCuteFace + shop-avatar 严格 1:1） ----------
  // v65 萌化：眼睛/腮红同步微放大，更活泼
  FACE: {
    EYE_DX_RATIO:  0.36,   // 眼距 = 头半径 × 0.36（僵尸原 0.33 → 统一到 0.36）
    EYE_R_RATIO:   0.26,   // 眼半径 × 0.26（v65 0.24→0.26 大眼萌）
    EYE_Y_OFFSET:  0.08,   // 眼 Y 相对头中心：+ 0.08 × headR
    PUPIL_R_RATIO: 0.58,   // 瞳孔 = 眼半径 × 0.58（v65 0.56→0.58）
    PUPIL_OFF_X:   0.16,   // 瞳孔右下偏位：× eyeR
    PUPIL_OFF_Y:   0.14,
    PUPIL_SHINE1:  0.42,   // 大高光 = 瞳孔 × 0.42
    PUPIL_SHINE2:  0.18,   // 小高光 = 瞳孔 × 0.18
    BLUSH_CX:      0.62,   // 腮红中心 X = × headR
    BLUSH_CY:      0.38,   // 腮红中心 Y 相对 eyeY：+ 0.38 × headR
    BLUSH_SIZE:    0.165,  // 爱心大小 × headR（v65 0.15→0.165）
    BLUSH_ZOMBIE:  0.22,   // 僵尸爱心更大 × eyeR
    // 嘴
    MOUTH_Y_OFFSET: 0.50,  // 嘴 Y 相对 eyeY：+ 0.50 × headR
  },

  // ---------- 头部结构比例（植物 vs 僵尸 统一 Q 版头感） ----------
  HEAD: {
    SHOOTER_EYE_Y:  0.08,   // 射手表情中心在 headY + 0.08 headR
    WALL_EYE_Y:     0.10,   // 坚果表情中心 headY + 0.10
    FREEZER_EYE_Y:  0.08,   // 寒冰表情中心 headY + 0.08
    ZOMBIE_HEAD_CY: -0.18,  // 僵尸头中心相对原点：UNIT × -0.18（保持）
    ZOMBIE_HEAD_R:   0.68,  // 僵尸头半径 × UNIT
    // 高光统一位置（左上 45°）
    HLIGHT_X:       -0.38,  // × headR
    HLIGHT_Y:       -0.30,  // × headR
    HLIGHT_W:        0.22,  // × headR
    HLIGHT_H:        0.40,  // × headR
    HLIGHT_ROT:     -0.50,  // 旋转 rad
    HLIGHT_ALPHA:    0.35,  // 高光不透明度
  },

  // ---------- 僵尸阵营专属比例（v3 阵营区分：与植物 FACE/HEAD 完全独立）----------
  Z_FACE: {
    EYE_DX_RATIO:  0.42,   // 眼距更宽（畏缩/无神感，植物=0.36）
    EYE_R_RATIO:   0.215,  // 眼更小（植物=0.26；v65 0.20→0.215 提高可读性）
    EYE_Y_OFFSET:  0.10,   // 眼位略低
    PUPIL_R_RATIO: 0.50,   // 瞳孔更小（植物=0.58；v65 0.48→0.50）
    PUPIL_OFF_X:   0.14,   // 瞳孔偏位
    PUPIL_OFF_Y:   0.12,
    BLUSH_CX:      0.62,   // 腮红中心 X
    BLUSH_CY:      0.42,   // 腮红中心 Y（僵尸腮红略低）
    BLUSH_SIZE:    0.19,   // 腮红大小（僵尸更大=病态红晕；v65 0.18→0.19）
    MOUTH_Y_OFFSET: 0.52,  // 嘴 Y 偏移
  },
  Z_BODY: {
    BUCKET_BODY_W:   0.40,  // 铁桶僵尸身体宽度（×UNIT）
    IMP_BODY_W:      0.32,  // 小鬼僵尸瘦小
    FOOTBALL_BODY_W: 0.52,  // 橄榄球僵尸宽壮
    DANCER_BODY_W:   0.48,  // 舞王僵尸方正
    BUCKET_ARM_LEN:  0.25,  // 手臂长度
    IMP_ARM_LEN:     0.32,  // 长臂（速度感）
    FOOTBALL_ARM_LEN:0.22,  // 短粗臂
    DANCER_ARM_LEN:  0.24,  // 标准臂+护甲
    BUCKET_LEG_W:    0.16,  // 腿粗
    IMP_LEG_W:       0.13,  // 细腿
    FOOTBALL_LEG_W:  0.22,  // 粗腿
    DANCER_LEG_W:    0.17,  // 标准腿
    // v51 僵尸王（最大体型: 宽袍 + 粗腿 = 压迫感）
    KING_BODY_W:     0.56,  // 王袍宽度（最宽）
    KING_ARM_LEN:    0.22,  // 短粗臂（重甲感, 同 football）
    KING_LEG_W:      0.24,  // 粗腿（最粗）
  },

  // ---------- 阴影椭圆 ----------
  SHADOW: {
    RX:  0.90,   // 阴影宽 × r
    RY:  0.22,   // 阴影高 × r
    Y:   1.05,   // 阴影 Y × r
  },

  // ---------- 离屏高清化 ----------
  OFFSCREEN: {
    SUPERSAMPLE: 2,    // 离屏再放大 2 倍超采样，drawImage 缩时锐而不糊
  },
};

class Renderer {
  constructor() {
    this.ctx = null;          // 主 canvas 上下文
    this.canvas = null;      // v6 修复 (Task 7-B F2): 主 canvas 节点引用，供 _preloadImages 调 canvas.createImage()
    this.dpr = 1;             // 设备像素比
    this.width = 0;           // CSS 像素宽
    this.height = 0;          // CSS 像素高
    this.offscreenCache = {}; // 离屏缓存 {key: canvas}
    this.imageCache = {};      // 图片缓存 {iconPath: Image}
    this.particles = [];      // 粒子系统
    this.renderErrorCount = 0; // 渲染错误计数（连续错误则降级）
    // 挂设计 tokens
    this.T = RENDER_TOKENS;
    // 当前绘制基准半径（植物 r / 僵尸 UNIT），_strokeW 依赖
    this._curBaseR = 36;
  }

  /**
   * 绑定 canvas 上下文
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} width - CSS宽
   * @param {number} height - CSS高
   * @param {number} dpr - 设备像素比
   * @param {Object} [canvasNode] - v6 修复 (Task 7-B F2): canvas 节点引用，供 _preloadImages 调 createImage()
   */
  attach(ctx, width, height, dpr, canvasNode) {
    this.ctx = ctx;
    this.canvas = canvasNode || null;
    this.width = width;
    this.height = height;
    this.dpr = dpr || 1;
    pathManager.setCanvasSize(width, height);
    // v6 修复 (Task 7-B F7)：离屏缓存 与 图片预加载 分开独立 try-catch，
    //   避免单个子系统失败时擦掉另一个已成功的缓存
    try {
      this._buildOffscreenCache();
    } catch (err) {
      console.error('[Renderer] 离屏缓存构建失败，降级为实时渲染:', err);
      this.offscreenCache = {};
    }
    try {
      this._preloadImages();
    } catch (err) {
      console.error('[Renderer] 图片预加载失败：', err);
      // imageCache 保持为 {} ，渲染时党底矢量插画
    }
  }

  /**
   * v6 修复 (Task 7-B F8): 画布尺寸变化时重新同步内部尺寸状态
   * 仅更新 this.width/height/dpr + 重建背景离屏缓存（尺寸敏感）。
   * 僵尸离屏缓存按固定 r 半径渲染，与画布尺寸无关，无需重建。
   * 由 game.js onAdaptiveResize -> _resizeCanvas 调用。
   * @param {number} width
   * @param {number} height
   * @param {number} dpr
   */
  onResize(width, height, dpr) {
    if (!width || !height) return;
    this.width = width;
    this.height = height;
    this.dpr = dpr || this.dpr || 1;
    pathManager.setCanvasSize(width, height);
    // 重建背景离屏缓存（尺寸敏感）
    try {
      this.offscreenCache.background = this._renderBackgroundToOffscreen();
    } catch (err) {
      console.warn('[Renderer] 背景离屏缓存重建失败，降级实时渲染:', err);
      this.offscreenCache.background = null;
    }
  }

  /**
   * 动态描边宽度（按当前基准半径缩放）：
   *   - 小植物/小僵尸描边变细但不低于 1px
   *   - 大角色描边等比变粗，保证视觉一致
   * @param {number} coeff   设计 token（STROKE.MAIN / THIN / …）
   * @param {number} [baseR] 当前基准半径（植物 r 或 UNIT），默认取上次设置
   */
  _strokeW(coeff, baseR) {
    if (baseR != null) this._curBaseR = +baseR;
    const b = this._curBaseR > 0 ? this._curBaseR : 36;
    return Math.max(1, coeff * (b / 42));
  }

  /**
   * 统一描边设定：strokeStyle + lineWidth + lineJoin/lineCap
   */
  _setStroke(ctx, color, lineW, opts = {}) {
    ctx.strokeStyle = color;
    ctx.lineWidth   = lineW;
    ctx.lineJoin    = opts.join || 'round';
    ctx.lineCap     = opts.cap  || 'round';
  }

  /**
   * 构建离屏缓存：背景、僵尸各类型
   * 离屏 canvas 仅绘制一次，主循环用 drawImage 复用
   */
  _buildOffscreenCache() {
    // 背景（失败返回 null，主循环会降级为实时绘制）
    this.offscreenCache.background = this._renderBackgroundToOffscreen();
    // 三种僵尸（每种独立 try-catch，互不影响）
    Object.keys(ZOMBIE_TYPES).forEach(type => {
      try {
        this.offscreenCache['zombie_' + type] = this._renderZombieToOffscreen(type);
      } catch (err) {
        console.warn('[Renderer] 僵尸离屏渲染失败:', type, err);
        this.offscreenCache['zombie_' + type] = null;
      }
    });
  }

  /**
   * 预加载角色图片资源
   * 使用 wx.createImage 加载 iconPath 指向的 PNG 资源
   */
  _preloadImages() {
    const allTypes = [
      ...Object.values(PLANT_TYPES),
      ...Object.values(ZOMBIE_TYPES)
    ];
    allTypes.forEach(def => {
      if (!def.iconPath || this.imageCache[def.iconPath]) return;
      try {
        const img = this.canvas ? this.canvas.createImage() : null;
        if (!img) return;
        img.onload = () => {
          this.imageCache[def.iconPath] = img;
        };
        img.onerror = (err) => {
          console.warn('[Renderer] 图片加载失败:', def.iconPath, err);
        };
        img.src = def.iconPath;
      } catch (e) {
        console.warn('[Renderer] 图片预加载异常:', def.iconPath, e);
      }
    });
  }

  /**
   * 离屏渲染：背景（天空+草地+路径）
   */
  _renderBackgroundToOffscreen() {
    // v6 修复 (Task 11 F28): 删除死变量 size（函数体全程用 this.width/this.height）
    const canvas = wx.createOffscreenCanvas ? wx.createOffscreenCanvas({
      type: '2d',
      width: this.width * this.dpr,
      height: this.height * this.dpr
    }) : null;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const W = this.width * this.dpr;
    const H = this.height * this.dpr;
    ctx.scale(this.dpr, this.dpr);

    // 天空渐变（v65 缤纷晴空：鲜亮蓝天 → 云白 → 暖阳地平线）
    const skyGrad = ctx.createLinearGradient(0, 0, 0, this.height);
    skyGrad.addColorStop(0, '#9ED9FF');
    skyGrad.addColorStop(0.5, '#C9EEFF');
    skyGrad.addColorStop(1, '#FFF6CF');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // 远山（v65 青翠丘陵，替换旧薰衣草紫）
    ctx.fillStyle = 'rgba(150, 214, 130, 0.70)';
    ctx.beginPath();
    ctx.moveTo(0, this.height * 0.4);
    ctx.quadraticCurveTo(this.width * 0.25, this.height * 0.25, this.width * 0.5, this.height * 0.4);
    ctx.quadraticCurveTo(this.width * 0.75, this.height * 0.55, this.width, this.height * 0.35);
    ctx.lineTo(this.width, this.height);
    ctx.lineTo(0, this.height);
    ctx.closePath();
    ctx.fill();

    // 草地渐变（v65 鲜嫩草甸，饱和度提升）
    const grassGrad = ctx.createLinearGradient(0, this.height * 0.65, 0, this.height);
    grassGrad.addColorStop(0, '#C9F09A');
    grassGrad.addColorStop(1, '#7FCB54');
    ctx.fillStyle = grassGrad;
    ctx.beginPath();
    ctx.moveTo(0, this.height * 0.7);
    ctx.quadraticCurveTo(this.width * 0.5, this.height * 0.65, this.width, this.height * 0.7);
    ctx.lineTo(this.width, this.height);
    ctx.lineTo(0, this.height);
    ctx.closePath();
    ctx.fill();

    // 网格（3 行 × 5 列，植物放置区）
    this._drawGrid(ctx);

    // 终点房子（底部居中）
    this._drawHouse(ctx, this.width / 2, this.height - 10);

    return canvas;
  }

  /**
   * 绘制网格（3 行车道 × 5 列槽位）
   */
  _drawGrid(ctx) {
    const b = pathManager.getGridBounds();
    const cs = pathManager.getCellSize();
    ctx.save();
    // v6 修复 (Task 12): 网格行列硬编码 → GRID.ROWS / GRID.COLS
    for (let lane = 0; lane < GRID.ROWS; lane++) {
      for (let slot = 0; slot < GRID.COLS; slot++) {
        const x = b.left + lane * cs.w;
        const y = b.top + slot * cs.h;
        ctx.fillStyle = (lane + slot) % 2 === 0
          ? 'rgba(255,255,255,0.22)'
          : 'rgba(88, 152, 38, 0.16)';
        ctx.fillRect(x, y, cs.w, cs.h);
      }
    }
    // 网格线
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    for (let lane = 0; lane <= GRID.ROWS; lane++) {
      ctx.beginPath();
      ctx.moveTo(b.left + lane * cs.w, b.top);
      ctx.lineTo(b.left + lane * cs.w, b.bottom);
      ctx.stroke();
    }
    for (let slot = 0; slot <= 5; slot++) {
      ctx.beginPath();
      ctx.moveTo(b.left, b.top + slot * cs.h);
      ctx.lineTo(b.right, b.top + slot * cs.h);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 绘制小房子（终点）
   */
  _drawHouse(ctx, cx, by) {
    const w = 90, h = 70;
    ctx.save();
    ctx.translate(cx, by);
    // 屋顶（v65 农舍珊瑚红瓦）
    ctx.fillStyle = '#FF6B57';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-w / 2 - 6, -h * 0.4);
    ctx.lineTo(0, -h * 0.9);
    ctx.lineTo(w / 2 + 6, -h * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 屋身
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    safeRoundRect(ctx, -w / 2, -h * 0.4, w, h * 0.4, 6);
    ctx.fill();
    ctx.stroke();
    // 门
    ctx.fillStyle = '#FFDAC1';
    ctx.beginPath();
    ctx.arc(0, -2, 10, Math.PI, 0);
    ctx.rect(-10, -2, 20, 12);
    ctx.fill();
    // 窗
    ctx.fillStyle = '#8EDCFF';
    ctx.beginPath();
    ctx.arc(-25, -10, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(25, -10, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 离屏渲染：单只僵尸（Q版萌系大头小身 / 设计系统 Tokens v2）
   * - 表情严格对齐 _drawCuteFace 比例，确保僵尸与植物表情一致
   * - 高清化：按 dpr × SUPERSAMPLE=2 超采样，drawImage 时自动 downscale，各机型清晰锐利
   */
  _renderZombieToOffscreen(type) {
    // v55 拆分: 僵尸离屏插画(原 1083 行单函数)移至 utils/zombiePainter.js
    // 纯代码搬运 — ctx 调用轨迹与拆分前逐条一致(trace 比对验证)
    return zombiePainter.renderZombieToOffscreen(type, this);
  }

  /**
   * 画一个爱心形状（已 beginPath，调用完再 fill/stroke）
   * @param {number} cx
   * @param {number} cy
   * @param {number} size  - 整体大小（外接圆半径）
   */
  _drawHeartShape(ctx, cx, cy, size) {
    const s = size;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.65);
    ctx.bezierCurveTo(cx - s * 1.4, cy - s * 0.1,   cx - s * 0.75, cy - s * 1.05, cx,           cy - s * 0.35);
    ctx.bezierCurveTo(cx + s * 0.75, cy - s * 1.05,  cx + s * 1.4,  cy - s * 0.1,   cx,           cy + s * 0.65);
    ctx.closePath();
  }

  /**
   * 画一个五角星（已 beginPath）
   * @param {number} cx
   * @param {number} cy
   * @param {number} outerR  - 外接圆半径
   * @param {number} points  - 角数（默认5）
   * @param {number} innerRatio - 内凹半径 / outerR
   */
  _drawStarShape(ctx, cx, cy, outerR, points = 5, innerRatio = 0.45) {
    const n = points;
    const innerR = outerR * innerRatio;
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = (i % 2 === 0) ? outerR : innerR;
      const a = -Math.PI / 2 + (i * Math.PI) / n;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  /**
   * 主渲染：每帧调用
   * @param {Object} gameState - 游戏状态
   * @param {Array} zombies - 僵尸数组
   * @param {Array} [plants] - 植物数组
   * @param {Array} [projectiles] - 投射物数组
   * @param {number} [dt] - v6 修复 (Task 7-B F4): 帧间隔 ms，供 _drawParticles 用动态 dt
   */
  render(gameState, zombies, plants, projectiles, dt) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    // 整帧渲染保护：单帧出错不应崩溃整个游戏
    try {
      ctx.clearRect(0, 0, this.width, this.height);

      // 1. 背景（离屏缓存复用，失败则实时绘制）
      if (this.offscreenCache.background) {
        try {
          ctx.drawImage(this.offscreenCache.background, 0, 0, this.width, this.height);
        } catch (e) {
          // 离屏背景损坏，降级实时绘制
          this._drawBackgroundRealtime(ctx);
        }
      } else {
        this._drawBackgroundRealtime(ctx);
      }

      // 2. 植物（绘制在僵尸下层）
      if (plants) {
        for (const p of plants) {
          try { this._drawPlant(ctx, p); } catch (e) { /* 单株绘制失败跳过 */ }
        }
      }

      // 3. 僵尸（按 progress 排序，进度大的画在前面，模拟近大远小）
      const sorted = zombies.slice().sort((a, b) => a.progress - b.progress);
      for (const z of sorted) {
        try { this._drawZombie(ctx, z); } catch (e) { /* 单只僵尸绘制失败跳过 */ }
      }

      // 4. 投射物（绘制在僵尸上层）
      if (projectiles) {
        for (const pr of projectiles) {
          try { this._drawProjectile(ctx, pr); } catch (e) { /* 单个投射物绘制失败跳过 */ }
        }
      }

      // 5. 粒子效果（v6 修复 Task 7-B F4: 传动态 dt 替代硬编码 16）
      this._drawParticles(ctx, dt);
      // 渲染成功，重置错误计数
      // v6 修复 (Task 7-B F5): 删除暂停遮罩分支 — pause() 后 _cancelRaf 停循环，render 不再被调用，遮罩不可达；暂停 UI 已由 WXML pause-mask 实现
      this.renderErrorCount = 0;
    } catch (err) {
      this.renderErrorCount++;
      console.error('[Renderer] 渲染失败 #' + this.renderErrorCount + ':', err);
      // v6 修复 (Task 12): 渲染失败阈值 → PERFORMANCE.RENDER_FATAL_THRESHOLD
      if (this.renderErrorCount >= PERFORMANCE.RENDER_FATAL_THRESHOLD && this.onRenderFatal) {
        this.onRenderFatal(err);
      }
    }
  }

  /**
   * 实时绘制背景（离屏缓存不可用时的降级方案）
   */
  _drawBackgroundRealtime(ctx) {
    // 天空渐变（v65 与离屏版同步：缤纷晴空）
    const skyGrad = ctx.createLinearGradient(0, 0, 0, this.height);
    skyGrad.addColorStop(0, '#9ED9FF');
    skyGrad.addColorStop(0.5, '#C9EEFF');
    skyGrad.addColorStop(1, '#FFF6CF');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, this.width, this.height);
    // 草地（v65 鲜嫩草甸）
    const grassGrad = ctx.createLinearGradient(0, this.height * 0.7, 0, this.height);
    grassGrad.addColorStop(0, '#C9F09A');
    grassGrad.addColorStop(1, '#7FCB54');
    ctx.fillStyle = grassGrad;
    ctx.fillRect(0, this.height * 0.7, this.width, this.height * 0.3);
    // 网格
    try { this._drawGrid(ctx); } catch (e) { /* 网格绘制失败忽略 */ }
    // 终点房子
    try { this._drawHouse(ctx, this.width / 2, this.height - 10); } catch (e) { /* 忽略 */ }
  }

  /**
   * 绘制单只僵尸（含摇摆动画）
   */
  _drawZombie(ctx, zombie) {
    const pos = pathManager.getPosition(zombie.pathIndex, zombie.progress);
    const def = ZOMBIE_TYPES[zombie.type];
    // 缩放因子（远处小，近处大）
    const scale = 0.6 + zombie.progress * 0.5;
    const r = zombie.radius * scale;
    const wobbleY = Math.sin(zombie.wobble) * 3;
    const isEating = zombie.state === 'eating';

    // ===== v64 动效参数（纯视觉，不改状态机） =====
    // 出场弹入：spawn 后 SPAWN_POP_MS 内 easeOutBack 从 0.3 过冲到 1.0
    let spawnScale = 1, spawnAlpha = 1;
    if (zombie.state === 'walking' && zombie.spawnTime > 0) {
      const zAge = Date.now() - zombie.spawnTime;
      if (zAge >= 0 && zAge < ZOMBIE.SPAWN_POP_MS) {
        const t = zAge / ZOMBIE.SPAWN_POP_MS;
        const c1 = 1.70158, c3 = c1 + 1;               // easeOutBack 常数
        spawnScale = Math.max(0.30, 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2));
        spawnAlpha = Math.min(1, 0.25 + t * 1.5);
      }
    }
    // 行走踏步：脚底锚点小幅左右交替倾斜（脚步落地感）
    // 啃食前扑：朝植物方向（+y，僵尸自上而下走）节奏性点头，与啃食 wobble 同频
    const walkTilt = Math.sin(zombie.wobble) * ZOMBIE.WALK_TILT;
    const eatLunge = isEating ? Math.max(0, Math.sin(zombie.wobble)) * ZOMBIE.EAT_LUNGE_RATIO * r : 0;

    // v79 地面阴影：与植物统一 Tokens 椭圆，贴脚底锚点（不入后续体态变换，
    //   不随走路倾斜/倒地旋转；出场淡入与倒地渐隐时同步衰减）
    {
      const dieT = zombie.state === 'dying' ? Math.min(1, zombie.stateTimer / ZOMBIE.DYING_DURATION_MS) : 0;
      const shA = (1 - dieT) * spawnAlpha;
      if (shA > 0.02) {
        ctx.save();
        ctx.globalAlpha = shA;
        ctx.fillStyle = this.T.COLORS.SHADOW;
        ctx.beginPath();
        ctx.ellipse(pos.x, pos.y + r * 1.06, r * 0.72, r * 0.20, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(pos.x, pos.y + wobbleY);
    // v64 出场透明度（乘入后续受击闪烁，互不覆盖）
    if (spawnAlpha < 1) ctx.globalAlpha *= spawnAlpha;
    // v26 铁桶受击弹跳 / v27 小鬼受击弹跳（体轻弹得更高，参照"被击飞"状态）
    // v28 橄榄球重甲受击微弹跳（tank 体感：0.08 最小）
    // v29 舞王受击弹跳（表演者踮脚一跳 0.10）
    // v51 僵尸王受击微弹（王者之躯：0.06 近乎不动）
    if (zombie.hitFlash > 0 &&
        (zombie.type === 'bucket' || zombie.type === 'imp' ||
         zombie.type === 'football' || zombie.type === 'dancer' || zombie.type === 'king')) {
      const hp = Math.min(1, Math.max(0, 1 - zombie.hitFlash / ZOMBIE.HIT_FLASH_MS));
      const bounce = zombie.type === 'imp' ? 0.20 :
                     zombie.type === 'football' ? 0.08 :
                     zombie.type === 'dancer' ? 0.10 :
                     zombie.type === 'king' ? 0.06 : 0.12;
      ctx.translate(0, -r * bounce * Math.sin(Math.PI * hp));
    }
    // v6 修复 (Task 12): 受击闪烁 — 跨文件耦合常量（zombieManager 同步）
    // v64: 改为乘入当前透明度（不再抹掉出场淡入 alpha）
    if (zombie.hitFlash > 0) {
      ctx.globalAlpha *= 0.5 + 0.5 * Math.sin(zombie.hitFlash / ZOMBIE.HIT_FLASH_DIV);
    }
    // 死亡渐隐（duration 必须与 zombieManager L409 z.stateTimer > N 同步）
    // v64: "膨胀消失" → "侧向倒地"（绕脚底加速倒下 + 轻微缩小下沉 + 渐隐）
    if (zombie.state === 'dying') {
      const dT = Math.min(1, zombie.stateTimer / ZOMBIE.DYING_DURATION_MS);
      ctx.globalAlpha = Math.max(0, 1 - dT);
      const fallDir = (zombie.id % 2 === 0) ? 1 : -1;      // 按实体固定倒向，避免逐帧抖动
      ctx.translate(0, r * 1.05);
      ctx.rotate(fallDir * ZOMBIE.DIE_FALL_RAD * dT * dT); // easeIn：先愣住后加速倒
      ctx.translate(0, -r * 1.05);
      const dyScale = 1 - 0.12 * dT;
      ctx.scale(dyScale, dyScale);
    } else {
      // v64 出场弹入（脚底锚点缩放）
      if (spawnScale !== 1) {
        ctx.translate(0, r * 1.05);
        ctx.scale(spawnScale, spawnScale);
        ctx.translate(0, -r * 1.05);
      }
      // v64 行走倾斜 / 啃食前扑（仅存活状态）
      if (zombie.state === 'walking' || isEating) {
        ctx.translate(0, r * 1.05);
        ctx.rotate(isEating ? Math.sin(zombie.wobble) * 0.03 : walkTilt);
        ctx.translate(0, -r * 1.05);
        if (eatLunge > 0) ctx.translate(0, eatLunge);
      }
    }

    // 离屏图绘制
    const cacheKey = 'zombie_' + zombie.type;
    const cached = this.offscreenCache[cacheKey];
    if (cached) {
      const drawSize = r * 3.09;   // v96: 画布 2.8→3.6 等比放大（2.4×3.6/2.8），僵尸视觉尺寸不变
      ctx.drawImage(cached, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    } else {
      // 兜底：实心圆
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // v79 啃食碎屑：嘴前（+y 朝向植物）溅出 3 枚植物碎屑（交替两档绿），
    //   与喈食 wobble 同频抛物线散开，间歇出现不糊屏
    if (isEating && r > 20) {
      const crumbBase = ctx.globalAlpha;
      for (let i = 0; i < 3; i++) {
        const fly = Math.sin(zombie.wobble * 2 + i * 2.1);
        if (fly < 0.15) continue;                          // 只画飞出段，自然间歇
        const ang = -0.62 + i * 0.62;                      // 三枚不同横向散射角
        ctx.save();
        ctx.globalAlpha = crumbBase * (0.30 + 0.70 * fly);
        ctx.fillStyle = i % 2 === 0 ? '#9CCC65' : '#7CB342';
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * r * (0.20 + 0.30 * fly),
                r * 0.52 + fly * r * 0.14,
                r * (0.050 + 0.018 * fly), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // v29 舞王巡场音符（常态识别符号：设定图脚下音符的游戏化——
    //   头部两侧各一枚八分音符随步伐律动，r>26 才绘制避免远端糊点）
    if (zombie.type === 'dancer' && zombie.state !== 'dying' && r > 26) {
      const T = this.T;
      const bobL = Math.sin(zombie.wobble * 2) * r * 0.09;
      const bobR = Math.sin(zombie.wobble * 2 + Math.PI) * r * 0.09;
      const sway = Math.cos(zombie.wobble) * r * 0.05;
      ctx.save();
      const baseAlpha = ctx.globalAlpha;
      const drawNote = (px, py, ns, c) => {
        this._setStroke(ctx, c, Math.max(1, r * 0.045));
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(px, py, ns * 0.42, ns * 0.30, -0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(px + ns * 0.36, py - ns * 0.14);
        ctx.lineTo(px + ns * 0.36, py - ns * 1.05);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px + ns * 0.36, py - ns * 1.05);
        ctx.quadraticCurveTo(px + ns * 0.74, py - ns * 0.90, px + ns * 0.68, py - ns * 0.60);
        ctx.stroke();
      };
      ctx.globalAlpha = baseAlpha * 0.85;
      // v29.1 双音符紫色系（米白在草地上对比度不足）；v29.3 统一同色+右音符放大
      drawNote(-r * 0.98 + sway, -r * 1.02 + bobL, r * 0.18, T.COLORS.Z_DN_SUIT);
      drawNote( r * 1.00 - sway, -r * 1.18 + bobR, r * 0.17, T.COLORS.Z_DN_SUIT);
      ctx.restore();
    }

    // v26 铁桶受击特效（参照设定图"被击/防御"状态图标：四角星芒火花 + 锈屑飞溅）
    if (zombie.hitFlash > 0 && zombie.type === 'bucket' && zombie.state !== 'dying') {
      const T = this.T;
      const hp = Math.min(1, Math.max(0, 1 - zombie.hitFlash / ZOMBIE.HIT_FLASH_MS));
      // 星芒火花（桶顶左，随受击进度旋转）
      ctx.save();
      ctx.translate(-r * 0.52, -r * 1.12);
      ctx.rotate(hp * 0.8);
      this._drawStarShape(ctx, 0, 0, r * 0.30, 4, 0.30);
      ctx.fillStyle = '#FFF9C4';
      ctx.fill();
      this._setStroke(ctx, T.COLORS.C_SPARK, Math.max(1, r * 0.045));
      ctx.stroke();
      ctx.restore();
      // 锈屑 ×3（棕褐小方块，向外上方飞散）
      ctx.fillStyle = T.COLORS.Z_RUST;
      const debris = [
        { x: -0.60, y: -0.95, dx: -0.55, dy: -0.55, s: 0.15 },
        { x:  0.58, y: -0.90, dx:  0.55, dy: -0.60, s: 0.12 },
        { x:  0.10, y: -1.18, dx:  0.18, dy: -0.70, s: 0.10 },
      ];
      for (const d of debris) {
        const px = (d.x + d.dx * hp) * r;
        const py = (d.y + d.dy * hp) * r;
        ctx.fillRect(px - d.s * r / 2, py - d.s * r / 2, d.s * r, d.s * r);
      }
    }

    // v27 小鬼受击尘土（参照设定图"摔倒/倒地"状态图标：尘土飞扬）
    if (zombie.hitFlash > 0 && zombie.type === 'imp' && zombie.state !== 'dying') {
      const hp = Math.min(1, Math.max(0, 1 - zombie.hitFlash / ZOMBIE.HIT_FLASH_MS));
      ctx.save();
      const flickerAlpha = ctx.globalAlpha;   // 保留受击闪烁透明度，不覆盖
      const dust = [
        { x: -0.62, y: 0.92, dx: -0.42, dy: -0.18, s: 0.20 },
        { x:  0.62, y: 0.94, dx:  0.42, dy: -0.16, s: 0.17 },
        { x:  0.05, y: 1.02, dx:  0.10, dy: -0.30, s: 0.24 },
      ];
      ctx.fillStyle = '#D8C9A3';
      for (const d of dust) {
        const px = (d.x + d.dx * hp) * r;
        const py = (d.y + d.dy * hp) * r;
        ctx.globalAlpha = flickerAlpha * (1 - hp) * 0.85;
        ctx.beginPath();
        ctx.arc(px, py, d.s * r * (0.6 + 0.7 * hp), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // v28 橄榄球受击特效（参照设定图 Pain/被撞状态：盔顶碰撞星芒 + 红漆屑飞溅）
    if (zombie.hitFlash > 0 && zombie.type === 'football' && zombie.state !== 'dying') {
      const T = this.T;
      const hp = Math.min(1, Math.max(0, 1 - zombie.hitFlash / ZOMBIE.HIT_FLASH_MS));
      // 星芒火花（盔顶左，金属碰撞感，随受击进度旋转）
      ctx.save();
      ctx.translate(-r * 0.52, -r * 1.12);
      ctx.rotate(hp * 0.8);
      this._drawStarShape(ctx, 0, 0, r * 0.28, 4, 0.30);
      ctx.fillStyle = '#FFF9C4';
      ctx.fill();
      this._setStroke(ctx, T.COLORS.C_SPARK, Math.max(1, r * 0.045));
      ctx.stroke();
      ctx.restore();
      // 红漆屑 ×3（护肩红小方块，向外上方飞散 = 掉漆磨损）
      ctx.fillStyle = T.COLORS.Z_FH_RED;
      const chips = [
        { x: -0.60, y: -0.95, dx: -0.55, dy: -0.55, s: 0.14 },
        { x:  0.58, y: -0.90, dx:  0.55, dy: -0.60, s: 0.11 },
        { x:  0.10, y: -1.18, dx:  0.18, dy: -0.70, s: 0.09 },
      ];
      for (const d of chips) {
        const px = (d.x + d.dx * hp) * r;
        const py = (d.y + d.dy * hp) * r;
        ctx.fillRect(px - d.s * r / 2, py - d.s * r / 2, d.s * r, d.s * r);
      }
    }

    // v29 舞王受击特效（参照设定图"帽子飞落/剧烈甩头"状态：音符飞散，
    //   被打断演出的滑稽感；紫系音符从头部向上外飘渐隐——v29.1 米白换深紫黑保草地对比度）
    if (zombie.hitFlash > 0 && zombie.type === 'dancer' && zombie.state !== 'dying') {
      const T = this.T;
      const hp = Math.min(1, Math.max(0, 1 - zombie.hitFlash / ZOMBIE.HIT_FLASH_MS));
      ctx.save();
      const flickerAlpha = ctx.globalAlpha;   // 保留受击闪烁透明度
      const notes = [
        { x: -0.85, y: -1.05, dx: -0.50, dy: -0.55, s: 0.20, c: T.COLORS.Z_DN_SUIT },
        { x:  0.80, y: -0.95, dx:  0.45, dy: -0.65, s: 0.17, c: T.COLORS.Z_DN_TIE },
        { x:  0.15, y: -1.35, dx:  0.15, dy: -0.60, s: 0.15, c: T.COLORS.Z_DN_SUIT_LIGHT },
      ];
      for (const n of notes) {
        const px = (n.x + n.dx * hp) * r;
        const py = (n.y + n.dy * hp) * r;
        const ns = n.s * r;
        ctx.globalAlpha = flickerAlpha * (1 - hp);
        this._setStroke(ctx, n.c, Math.max(1, r * 0.05));
        ctx.fillStyle = n.c;
        ctx.beginPath();
        ctx.ellipse(px, py, ns * 0.42, ns * 0.30, -0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(px + ns * 0.36, py - ns * 0.14);
        ctx.lineTo(px + ns * 0.36, py - ns * 1.05);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px + ns * 0.36, py - ns * 1.05);
        ctx.quadraticCurveTo(px + ns * 0.74, py - ns * 0.90, px + ns * 0.68, py - ns * 0.60);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 血条（强壮僵尸多血 / 受伤显示）
    // v64: 圆角胶囊 + 白描边 + 绿→琥珀→红分档（与植物血条同语言）
    if (zombie.maxHealth > 1 && zombie.state !== 'dying' && zombie.health < zombie.maxHealth) {
      const barW = r * 1.4;
      const barH = Math.max(4, r * 0.16);
      const barY = -r * 1.4;
      const pct = Math.max(0, Math.min(1, zombie.health / zombie.maxHealth));
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      safeRoundRect(ctx, -barW / 2 - 1, barY - 1, barW + 2, barH + 2, (barH + 2) / 2);
      ctx.fill();
      ctx.fillStyle = pct > 0.5 ? '#66BB6A' : pct > 0.25 ? '#F5B301' : '#E53935';
      if (pct > 0) {
        ctx.beginPath();
        safeRoundRect(ctx, -barW / 2, barY, Math.max(barH, barW * pct), barH, barH / 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      safeRoundRect(ctx, -barW / 2, barY, barW, barH, barH / 2);
      ctx.stroke();
    }

    // 减速光环（被寒冰射手命中）
    // v64 升级：柔边霜环（径向渐变）+ 保留内缘细环 + 三片雪花椭圆轨道环绕
    if (zombie.slowTimer > 0) {
      const frostGrad = ctx.createRadialGradient(0, 0, r * 0.55, 0, 0, r * 1.18);
      frostGrad.addColorStop(0, 'rgba(79,195,247,0)');
      frostGrad.addColorStop(0.75, 'rgba(79,195,247,0.10)');
      frostGrad.addColorStop(1, 'rgba(79,195,247,0.30)');
      ctx.fillStyle = frostGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(79,195,247,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2);
      ctx.stroke();
      // v64 环绕雪花 ×3（椭圆轨道 = 空间纵深；低端机 shouldSkipDetails 时省略）
      if (!fpsMonitor.shouldSkipDetails() && r > 18) {
        ctx.strokeStyle = 'rgba(224,255,255,0.9)';
        ctx.lineWidth = Math.max(1, r * 0.03);
        for (let i = 0; i < 3; i++) {
          const orbitA = zombie.wobble * 0.9 + i * (Math.PI * 2 / 3);
          const flakeX = Math.cos(orbitA) * r * 1.18;
          const flakeY = Math.sin(orbitA) * r * 0.50 - r * 0.35;
          const flakeR = Math.max(2, r * 0.10);
          for (let k = 0; k < 3; k++) {
            const ang = orbitA * 1.7 + k * Math.PI / 3;
            ctx.beginPath();
            ctx.moveTo(flakeX - Math.cos(ang) * flakeR, flakeY - Math.sin(ang) * flakeR);
            ctx.lineTo(flakeX + Math.cos(ang) * flakeR, flakeY + Math.sin(ang) * flakeR);
            ctx.stroke();
          }
        }
      }
    }

    ctx.restore();
  }

  /**
   * 绘制植物（矢量萌系造型 + 血条 + v64 动效层）
   * 七种植物：豌豆射手 / 坚果墙 / 寒冰射手 / 樱桃炸弹 / 食人花 / 向日葵 / 火焰射手
   * v64 动效层（纯视觉，全部从 plant 对象读状态，不改任何战斗逻辑）：
   *   · 待机呼吸：scaleY/scaleX 反相微缩放（体积守恒 squash & stretch）
   *   · 入场弹跳：age < SPAWN_POP_MS 时 easeOutBack 过冲落地 + 阴影同步长大
   *   · 射击后坐力：shootFx 包络 → 左下踢腿 + 轻微反拧 + 炮口闪光（各炮类自绘）
   *   · 受击顿帧：挤压回弹 punch（叠加原闪烁）
   *   · 低血蔫萎：HP < WILT_HP_RATIO 后低头无力摇摆
   *   · 血条胶囊化：圆角 + 白描边 + 绿→琥珀→红分档
   */
  _drawPlant(ctx, plant) {
    const def = plant.def;
    // v66: dead 植物（被啃死/樱桃爆炸/铲除）跳过绘制 — 旧版依赖下一帧
    //   update splice, 死亡当帧会残留一帧正常体态（樱桃爆炸时尤其穿帮）
    if (!def || plant.state === 'dead') return;
    const cs = pathManager.getCellSize();
    const size = Math.min(cs.w, cs.h) * 0.78;
    const r = size * 0.42;            // 头部基准半径
    const wobbleX = Math.sin(plant.wobble) * 2;

    // 以 r 为基准设置动态描边
    const T = this.T;
    this._strokeW(1, r);
    const swMain = this._strokeW(T.STROKE.MAIN);

    // ===== v64 动效参数（纯视觉） =====
    const hpRatio = plant.maxHealth > 0 ? Math.max(0, plant.health / plant.maxHealth) : 1;
    // 射击后坐力：shootFx 1→0 线性衰减，正弦包络中段最猛
    const recoil = plant.shootFx > 0 ? Math.sin(Math.min(1, plant.shootFx) * Math.PI) : 0;
    // 入场弹跳：age < SPAWN_POP_MS 时 easeOutBack 过冲（t=1 处恰好 =1，无跳变）
    let spawnScale = 1;
    if (plant.age != null && plant.age >= 0 && plant.age < PLANT.SPAWN_POP_MS) {
      const t = plant.age / PLANT.SPAWN_POP_MS;
      const c1 = 1.70158, c3 = c1 + 1;                 // easeOutBack 常数
      spawnScale = Math.max(0.05, 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2));
    }
    // 受击顿帧：hitFlash 剩余 1→0，正弦包络单峰挤压
    const hitPunch = plant.hitFlash > 0
      ? Math.sin((1 - Math.min(1, plant.hitFlash / PLANT.HIT_FLASH_MS)) * Math.PI) : 0;
    // 低血蔫萎：血量越低头垂得越狠 + 无力摇摆
    const wilt = hpRatio < PLANT.WILT_HP_RATIO ? (1 - hpRatio / PLANT.WILT_HP_RATIO) : 0;
    // 待机呼吸（体积守恒：scaleY 涨则 scaleX 缩）
    const breathe = Math.sin(plant.wobble * 2) * PLANT.BREATHE_AMP;
    const sx = spawnScale * (1 - breathe - hitPunch * 0.05);
    const sy = spawnScale * (1 + breathe + hitPunch * 0.06);
    // 后坐力踢腿（炮口朝右上 → 反冲左下）+ 蔫萎低头角度
    const kickX = -recoil * r * 0.07;
    const kickY = recoil * r * 0.05;
    const tilt = wilt * (0.07 + 0.025 * Math.sin(plant.wobble * 0.7)) - recoil * 0.045;

    ctx.save();
    ctx.translate(plant.x + wobbleX, plant.y);
    // v6 修复 (Task 12): 受击闪烁除数 — 跨文件耦合（plantManager L119 hitFlash = PLANT.HIT_FLASH_MS）
    if (plant.hitFlash > 0) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(plant.hitFlash / PLANT.HIT_FLASH_DIV);
    }
    // 地面阴影椭圆（统一 Tokens 比例；入场期随角色一起长大）
    ctx.fillStyle = T.COLORS.SHADOW;
    ctx.beginPath();
    ctx.ellipse(0, r * T.SHADOW.Y, r * T.SHADOW.RX * spawnScale, r * T.SHADOW.RY * spawnScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // v64 动效合成变换（以脚底为锚点：挤压/倾斜不悬空，符合接地视觉）
    ctx.translate(kickX, r * T.SHADOW.Y + kickY);
    ctx.rotate(tilt);
    ctx.scale(sx, sy);
    ctx.translate(0, -r * T.SHADOW.Y);

    // 公共描边（与僵尸统一的萌系白描边，粗细按 r 动态计算）
    this._setStroke(ctx, T.COLORS.STROKE, swMain);

    // 按类型绘制植物造型（v64: 统一传 plant 对象，各类型读取 shootFx/sunCooldown 画专属动效；
    // v54 起 iconPath 已全数移除，删除不可达的图片分支，永远走矢量绘制）
    switch (def.type) {
      case 'shooter':    this._drawShooter(ctx, r, def, plant); break;
      case 'wall':       this._drawWall(ctx, r, def, plant); break;
      case 'freezer':    this._drawFreezer(ctx, r, def, plant); break;
      case 'cherry':     this._drawCherry(ctx, r, def, plant); break;
      case 'chomper':    this._drawChomper(ctx, r, def, plant); break;
      case 'sunflower':  this._drawSunflower(ctx, r, def, plant); break;
      case 'fire':       this._drawFire(ctx, r, def, plant); break;
      default:           this._drawWall(ctx, r, def, plant); break;
    }
    ctx.restore();

    // 血条（受伤时显示；v64 移出角色变换外，不随蔫萎倾斜保持可读；胶囊形+分档色）
    if (plant.maxHealth > 1 && hpRatio > 0 && hpRatio < 1) {
      ctx.save();
      ctx.translate(plant.x + wobbleX, plant.y);
      const barW = size * 0.9;
      const barH = Math.max(4, 0.095 * r);
      const barY = -size * 0.62;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      safeRoundRect(ctx, -barW / 2, barY, barW, barH, barH / 2);
      ctx.fill();
      ctx.fillStyle = hpRatio > 0.5 ? '#7CB342' : hpRatio > 0.25 ? '#F5B301' : '#E53935';
      ctx.beginPath();
      safeRoundRect(ctx, -barW / 2, barY, Math.max(barH, barW * hpRatio), barH, barH / 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      safeRoundRect(ctx, -barW / 2, barY, barW, barH, barH / 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ========================================================
     v93 经典 PvZ 风格重绘（精准复刻附图角色形象）
     · 白描边萌系 → 本命深色勾边 + 径向渐变体积 + 左上柔光
     · 腮红圆脸 → PvZ 经典五官（黑豆眼 / 白眼珠 + 眉形 + 语义嘴型）
     · 动效钩子全部保留：shootFx 后坐力 / hitFlash / fuseTimer 蓄力 /
       chomperState 咬吞 / sunCooldown 产阳光光环 / wobble 眨眼 / wallHp 裂纹
     ====================================================== */

  /** PvZ 勾边线（coeff 沿用 r/42 动态体系） */
  _pvzLine(ctx, color, coeff) {
    this._setStroke(ctx, color, this._strokeW(coeff));
  }

  /**
   * PvZ 经典表情系统 v93（植物七角色共用）：
   * - 黑豆眼（向日葵/射手系）或白眼珠+瞳孔（坚果/樱桃系），自带眨眼
   * - 眉形：worried 内高外低 / angry 倒八字 / cool 平压 / none
   * - 嘴型：smile-open 大开口笑 / grit 咬牙 / frown 撇嘴 / flat 抿嘴 / o / none
   * 全部比例由调用方显式传入（eyeDX/eyeY/eyeR/mouthY/mouthRx/mouthRy）
   */
  _drawPvzFace(ctx, o) {
    const wobblePhase = o.wobblePhase || 0;
    const ink = o.ink || '#3B2B1A';
    const eyeDX = o.eyeDX, eyeY = o.eyeY, eyeR = o.eyeR;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // 眨眼：约 2.5s 一次（沿用旧节律）
    const blinkT = (Math.sin(wobblePhase) + 1) / 2;
    const blink = blinkT > 0.94 ? (1 - (blinkT - 0.94) / 0.06) : 1;

    if (o.white) {
      // ---- 白眼珠 + 黑瞳（坚果/樱桃/写实系）----
      // v95 修复：两眼各自独立路径 —— 同路径多 ellipse 会在两次 ellipse 间
      // 产生隐式直线连接，stroke 把它描成「眼镜鼻梁桥」（参照附图差异主因）
      this._pvzLine(ctx, ink, 0.9);
      ctx.fillStyle = '#FDFBF3';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(s * eyeDX, eyeY, eyeR * 0.82, eyeR * Math.max(0.10, blink), 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      if (blink > 0.4) {
        const pdx = (o.pupilDx || 0) * eyeR;
        const pdy = (o.pupilDy || 0) * eyeR;
        const pr = eyeR * 0.38;
        for (const s of [-1, 1]) {
          ctx.fillStyle = '#262626';
          ctx.beginPath();
          ctx.arc(s * eyeDX + pdx, eyeY + pdy, pr, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.beginPath();
          ctx.arc(s * eyeDX + pdx - pr * 0.30, eyeY + pdy - pr * 0.34, pr * 0.36, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      // ---- 黑豆眼（参考图向日葵/豌豆射手）----
      if (blink > 0.4) {
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.ellipse(-eyeDX, eyeY, eyeR * 0.60, eyeR * 0.72 * blink, 0, 0, Math.PI * 2);
        ctx.ellipse( eyeDX, eyeY, eyeR * 0.60, eyeR * 0.72 * blink, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath();
        ctx.arc(-eyeDX - eyeR * 0.14, eyeY - eyeR * 0.24, eyeR * 0.20, 0, Math.PI * 2);
        ctx.arc( eyeDX - eyeR * 0.14, eyeY - eyeR * 0.24, eyeR * 0.20, 0, Math.PI * 2);
        ctx.fill();
      } else {
        this._pvzLine(ctx, ink, 1.7);
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(s * eyeDX, eyeY - eyeR * 0.10, eyeR * 0.52, Math.PI * 1.12, Math.PI * 1.88);
          ctx.stroke();
        }
      }
    }

    // ---- 眉形 ----
    const brow = o.brow || 'none';
    if (brow !== 'none') {
      const bw = eyeR * 1.28;
      const by = eyeY - eyeR * 1.50;
      this._pvzLine(ctx, o.browColor || ink, o.browBold || 2.2);
      if (brow === 'worried') {
        // 担忧眉：内端高、外端低（八字眉）
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(s * eyeDX - s * bw, by - eyeR * 0.40);
          ctx.quadraticCurveTo(s * eyeDX, by + eyeR * 0.10, s * eyeDX + s * bw * 0.38, by + eyeR * 0.50);
          ctx.stroke();
        }
      } else if (brow === 'angry') {
        // 倒八字怒眉：内端低、外端高
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(s * eyeDX - s * bw, by + eyeR * 0.46);
          ctx.quadraticCurveTo(s * eyeDX, by - eyeR * 0.05, s * eyeDX + s * bw * 0.38, by - eyeR * 0.45);
          ctx.stroke();
        }
      } else if (brow === 'cool') {
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(s * eyeDX - bw, by + eyeR * 0.34);
          ctx.lineTo(s * eyeDX + bw, by + eyeR * 0.06);
          ctx.stroke();
        }
      }
    }

    // ---- 嘴型 ----
    const mY = o.mouthY, mRx = o.mouthRx || 0, mRy = o.mouthRy || 0;
    const mouth = o.mouth || 'none';
    if (mouth === 'smile-open') {
      // 大开口笑（参考图向日葵）：平上缘 + 深弧下缘
      this._pvzLine(ctx, '#5F2B0C', 1.5);
      ctx.fillStyle = '#7E3A12';
      ctx.beginPath();
      ctx.moveTo(-mRx, mY);
      ctx.quadraticCurveTo(-mRx * 0.55, mY - mRy * 0.10, 0, mY - mRy * 0.02);
      ctx.quadraticCurveTo(mRx * 0.55, mY - mRy * 0.10, mRx, mY);
      ctx.quadraticCurveTo(mRx * 0.55, mY + mRy * 1.45, 0, mY + mRy * 1.45);
      ctx.quadraticCurveTo(-mRx * 0.55, mY + mRy * 1.45, -mRx, mY);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // 下唇亮层（口腔底部反光）
      ctx.fillStyle = 'rgba(255,183,110,0.42)';
      ctx.beginPath();
      ctx.ellipse(0, mY + mRy * 1.02, mRx * 0.58, mRy * 0.40, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (mouth === 'smile') {
      // 闭口微笑弧（v96 附图豌豆/樱桃：一道上弯浅弧 + 极淡下唇影）
      this._pvzLine(ctx, ink, 1.7);
      ctx.beginPath();
      ctx.moveTo(-mRx, mY);
      ctx.quadraticCurveTo(0, mY + mRy * 1.30, mRx, mY);
      ctx.stroke();
      ctx.fillStyle = 'rgba(94,42,12,0.16)';
      ctx.beginPath();
      ctx.ellipse(0, mY + mRy * 0.38, mRx * 0.52, mRy * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (mouth === 'grit') {
      // 咬牙（樱桃/火焰怒态）：暗腔 + 上排方牙
      this._pvzLine(ctx, ink, 1.5);
      ctx.fillStyle = '#5F2318';
      ctx.beginPath();
      safeRoundRect(ctx, -mRx, mY, mRx * 2, mRy * 1.4, mRy * 0.5);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#FDFBF3';
      const tw = mRx * 0.42;
      ctx.beginPath();
      safeRoundRect(ctx, -mRx * 0.72, mY + mRy * 0.06, tw, mRy * 0.62, tw * 0.22);
      ctx.fill();
      ctx.beginPath();
      safeRoundRect(ctx, -mRx * 0.12, mY + mRy * 0.06, tw, mRy * 0.62, tw * 0.22);
      ctx.fill();
      ctx.beginPath();
      safeRoundRect(ctx,  mRx * 0.30, mY + mRy * 0.06, tw, mRy * 0.62, tw * 0.22);
      ctx.fill();
    } else if (mouth === 'frown') {
      this._pvzLine(ctx, ink, 2.0);
      ctx.beginPath();
      ctx.moveTo(-mRx, mY + mRy * 0.35);
      ctx.quadraticCurveTo(0, mY - mRy * 0.30, mRx, mY + mRy * 0.35);
      ctx.stroke();
    } else if (mouth === 'flat') {
      this._pvzLine(ctx, ink, 2.0);
      ctx.beginPath();
      ctx.moveTo(-mRx, mY);
      ctx.lineTo(mRx, mY);
      ctx.stroke();
    } else if (mouth === 'o') {
      this._pvzLine(ctx, ink, 1.4);
      ctx.fillStyle = '#5F2318';
      ctx.beginPath();
      ctx.ellipse(0, mY, mRx, mRy, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }

    // ---- 腮红（v94 可选：两颊椭圆晕，参照附图可爱 3D 风格）----
    if (o.blush) {
      ctx.fillStyle = o.blush;
      ctx.beginPath();
      ctx.ellipse(-eyeDX - eyeR * 1.30, eyeY + eyeR * 1.02, eyeR * 0.52, eyeR * 0.34, 0, 0, Math.PI * 2);
      ctx.ellipse( eyeDX + eyeR * 1.30, eyeY + eyeR * 1.02, eyeR * 0.52, eyeR * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** 尖卵叶（根部宽→叶尖，带中脉；dir=±1 朝向）—— PvZ 底座叶通用 */
  _pvzLeaf(ctx, bx, by, len, wid, dir, fill, vein, lineCoeff) {
    ctx.save();
    this._pvzLine(ctx, vein, lineCoeff || 3.0);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.bezierCurveTo(bx + dir * wid * 0.5, by - len * 0.36, bx + dir * len * 0.86, by - len * 0.30, bx + dir * len, by + len * 0.02);
    ctx.bezierCurveTo(bx + dir * len * 0.72, by + len * 0.34, bx + dir * wid * 0.42, by + len * 0.30, bx, by);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 中脉
    ctx.beginPath();
    ctx.moveTo(bx + dir * wid * 0.16, by + len * 0.02);
    ctx.quadraticCurveTo(bx + dir * len * 0.5, by + len * 0.02, bx + dir * len * 0.84, by + len * 0.04);
    ctx.stroke();
    ctx.restore();
  }

  /** 尖角火苗路径（底宽顶尖 + 右肩内卷，以 (0,0) 为底部中心；只建路径） */
  _drawFlameShape(ctx, w, h) {
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, 0);
    ctx.bezierCurveTo(-w * 0.52, -h * 0.32, -w * 0.30, -h * 0.55, -w * 0.14, -h * 0.82);
    ctx.quadraticCurveTo(-w * 0.03, -h * 0.96, 0, -h);
    ctx.quadraticCurveTo(w * 0.08, -h * 0.82, w * 0.20, -h * 0.68);
    ctx.bezierCurveTo(w * 0.44, -h * 0.48, w * 0.52, -h * 0.28, w * 0.5, 0);
    ctx.closePath();
  }

  /** 四层火苗：外深橙红 / 中橙 / 内亮黄 / 白热芯（v98 +白芯，火焰射手炮口 + 头冠共用） */
  _drawFlame(ctx, cx, cy, w, h, sway) {
    const C = this.T.COLORS;
    const layers = [
      [C.FIRE_BODY_DARK, w, h, sway],
      [C.FIRE_FLAME,     w * 0.70, h * 0.70, sway * 0.55],
      [C.FIRE_CORE,      w * 0.40, h * 0.42, sway * 0.30],
      ['#FFFDE7',        w * 0.24, h * 0.26, sway * 0.15]
    ];
    ctx.save();
    ctx.translate(cx, cy);
    layers.forEach(([color, lw, lh, ls]) => {
      ctx.save();
      ctx.translate(ls, 0);
      ctx.rotate(ls * 0.12);
      this._drawFlameShape(ctx, lw, lh);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    });
    ctx.restore();
  }

  /**
   * 豌豆射手（v93 经典 PvZ 复刻，参照附图）：
   * - 鲜绿圆头 + 右上斜炮管（管顶小鼻突）+ 头顶双叶嫩芽
   * - 本命深绿勾边 + 径向渐变体积；底座土丘 + 尖卵双叶
   * - 黑豆眼 + 平压眉（炮管即嘴）；后坐力炮口闪光保留
   */
  _drawShooter(ctx, r, def, plant) {
    const wobblePhase = (typeof plant === 'number') ? plant : (plant.wobble || 0);
    const fx = (typeof plant === 'object' && plant && plant.shootFx > 0)
      ? Math.sin(Math.min(1, plant.shootFx) * Math.PI) : 0;
    const OUT = '#2F5E1E';
    const headR = r * 0.98;
    const headY = -r * 0.22;

    // ---- 1. 底座土丘（半球，深绿）----
    const bodyY = r * 0.60;
    const mound = ctx.createRadialGradient(-r * 0.25, bodyY - r * 0.28, 0, 0, bodyY, r * 0.95);
    mound.addColorStop(0, '#8FC65B');
    mound.addColorStop(0.6, '#6BA83A');
    mound.addColorStop(1, '#4E7F2C');
    this._pvzLine(ctx, OUT, 3.0);
    ctx.fillStyle = mound;
    ctx.beginPath();
    ctx.ellipse(0, bodyY, r * 0.82, r * 0.44, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // ---- 2. 两侧尖卵叶（深绿，叶脉）----
    this._pvzLeaf(ctx, -r * 0.30, bodyY + r * 0.02, r * 0.66, r * 0.30, -1, '#5E9433', OUT, 3.0);
    this._pvzLeaf(ctx,  r * 0.30, bodyY + r * 0.02, r * 0.66, r * 0.30,  1, '#6BA83A', OUT, 3.0);

    // ---- 3. 茎 ----
    this._pvzLine(ctx, OUT, 3.0);
    ctx.fillStyle = '#6BA83A';
    ctx.beginPath();
    safeRoundRect(ctx, -r * 0.15, headY + headR * 0.48, r * 0.30, r * 0.48, r * 0.13);
    ctx.fill(); ctx.stroke();

    // ---- 4. 头（径向渐变 + 右下暗弧）----
    const headGrad = ctx.createRadialGradient(-headR * 0.38, headY - headR * 0.38, 0, 0, headY, headR * 1.12);
    headGrad.addColorStop(0, '#A8D96A');
    headGrad.addColorStop(0.55, '#7FC04E');
    headGrad.addColorStop(1, '#55903A');
    this._pvzLine(ctx, OUT, 3.2);
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(0, headY, headR, headR * 0.94, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 右下体积分层暗弧（clip 头内）
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, headY, headR, headR * 0.94, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(47,94,30,0.18)';
    ctx.beginPath();
    ctx.ellipse(headR * 0.42, headY + headR * 0.52, headR * 0.72, headR * 0.50, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 左上柔光
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.40, headY - headR * 0.42, headR * 0.24, headR * 0.14, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // ---- 5. 右上斜炮管（安装环 + 外管 + 管顶鼻突 + 口环 + 内腔）----
    // v97: 炮管加长 0.60→0.70 + 口环喇叭化（附图长炮管特征）
    const cannonX = headR * 0.52;
    const cannonY = headY - headR * 0.52;
    const cannonLen = headR * 0.70;
    const cannonR = headR * 0.34;
    ctx.save();
    ctx.translate(cannonX, cannonY);
    ctx.rotate(-0.55);
    this._pvzLine(ctx, OUT, 3.0);
    // 安装环（v99: 加大 0.26→0.31 / 0.92→1.00，与头衔接更饱满）
    ctx.fillStyle = '#5E9433';
    ctx.beginPath();
    ctx.ellipse(cannonR * 0.08, 0, cannonR * 0.31, cannonR * 1.00, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 外管（线性渐变）
    const cg = ctx.createLinearGradient(0, -cannonR, 0, cannonR);
    cg.addColorStop(0, '#A8D96A');
    cg.addColorStop(0.5, '#7FC04E');
    cg.addColorStop(1, '#55903A');
    ctx.fillStyle = cg;
    ctx.beginPath();
    safeRoundRect(ctx, 0, -cannonR, cannonLen, cannonR * 2, cannonR * 0.5);
    ctx.fill(); ctx.stroke();
    // v97 管背上缘高光线（立体感）
    this._pvzLine(ctx, 'rgba(255,255,255,0.42)', 1.4);
    ctx.beginPath();
    ctx.moveTo(cannonLen * 0.14, -cannonR * 0.58);
    ctx.quadraticCurveTo(cannonLen * 0.45, -cannonR * 0.80, cannonLen * 0.88, -cannonR * 0.60);
    ctx.stroke();
    this._pvzLine(ctx, OUT, 3.0);
    // 管顶小鼻突（参考图 snout 特征）
    ctx.fillStyle = '#7FC04E';
    ctx.beginPath();
    ctx.ellipse(cannonLen * 0.48, -cannonR * 0.92, cannonR * 0.34, cannonR * 0.24, -0.25, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 口环 + 内腔（v97 喇叭口加大）
    ctx.fillStyle = '#2E5B1E';
    ctx.beginPath();
    ctx.ellipse(cannonLen, 0, cannonR * 0.46, cannonR * 0.96, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1E3D12';
    ctx.beginPath();
    ctx.ellipse(cannonLen, 0, cannonR * 0.30, cannonR * 0.68, 0, 0, Math.PI * 2);
    ctx.fill();
    // v98 口环前沿亮弧（喇叭口金属反光）
    this._pvzLine(ctx, 'rgba(255,255,255,0.42)', 1.3);
    ctx.beginPath();
    ctx.arc(cannonLen, 0, cannonR * 0.74, Math.PI * 1.08, Math.PI * 1.82);
    ctx.stroke();
    this._pvzLine(ctx, OUT, 3.0);
    // v64 炮口闪光（后坐力期）
    if (fx > 0.12) {
      ctx.save();
      ctx.globalAlpha *= fx;
      const tipX = cannonLen + cannonR * 0.45;
      const mFlash = ctx.createRadialGradient(tipX, 0, 0, tipX, 0, cannonR * 1.55);
      mFlash.addColorStop(0, 'rgba(255,255,255,0.95)');
      mFlash.addColorStop(0.45, 'rgba(197,225,165,0.55)');
      mFlash.addColorStop(1, 'rgba(197,225,165,0)');
      ctx.fillStyle = mFlash;
      ctx.beginPath();
      ctx.arc(tipX, 0, cannonR * 1.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      this._drawStarShape(ctx, tipX, 0, cannonR * 0.52, 4, 0.32);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // ---- 6. 头顶卷芽嫩茎（v99: 茎加长立起 + 双叶上扬，附图站立嫩芽特征）----
    const sproutY = headY - headR * 0.88;
    this._pvzLine(ctx, OUT, 2.4);
    ctx.strokeStyle = OUT; ctx.lineWidth = Math.max(1, r * 0.035); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, sproutY);
    ctx.quadraticCurveTo(headR * 0.05, sproutY - headR * 0.20, headR * 0.15, sproutY - headR * 0.26);
    ctx.stroke();
    // v97: 卷芽双叶加长饱满（0.36/0.28→0.44/0.34）；v99 叶位随茎上提，角度上扬
    this._pvzLeaf(ctx, headR * 0.15, sproutY - headR * 0.26, headR * 0.44, headR * 0.17, 1, '#6BA83A', OUT, 2.4);
    this._pvzLeaf(ctx, -headR * 0.02, sproutY - headR * 0.10, headR * 0.34, headR * 0.14, -1, '#5E9433', OUT, 2.4);

    // ---- 7. 表情：大白眼珠 + 闭口甜笑 + 粉腮（附图豌豆射手）----
    this._drawPvzFace(ctx, {
      eyeDX: headR * 0.31, eyeY: headY + headR * 0.08, eyeR: headR * 0.170,
      white: true, pupilDx: 0.06, pupilDy: -0.08,
      brow: 'none',
      mouth: 'smile',
      mouthY: headY + headR * 0.47, mouthRx: headR * 0.15, mouthRy: headR * 0.095,
      blush: 'rgba(255,132,150,0.55)',
      ink: '#23400F', wobblePhase
    });
  }

  /**
   * 火焰射手（v93 经典复刻：焦橙豌豆射手 + 头顶火苗冠）：
   * - 橙红渐变头 + 余烬斑点 + 炮管三层火苗（保留 _drawFlame）
   * - 倒八字怒眉 + 黑豆眼；后坐力火光保留
   */
  _drawFire(ctx, r, def, plant) {
    const wobblePhase = (typeof plant === 'number') ? plant : (plant.wobble || 0);
    const sway = Math.sin(wobblePhase * 2.0) * r * 0.05;
    const fx = (typeof plant === 'object' && plant && plant.shootFx > 0)
      ? Math.sin(Math.min(1, plant.shootFx) * Math.PI) : 0;
    const OUT = '#A03518';
    const headR = r * 0.98;
    const headY = -r * 0.22;

    // ---- 1. 底座土丘（焦橙）----
    const bodyY = r * 0.60;
    const mound = ctx.createRadialGradient(-r * 0.25, bodyY - r * 0.28, 0, 0, bodyY, r * 0.95);
    mound.addColorStop(0, '#EFA058');
    mound.addColorStop(0.6, '#D96B33');
    mound.addColorStop(1, '#A8451F');
    this._pvzLine(ctx, OUT, 3.0);
    ctx.fillStyle = mound;
    ctx.beginPath();
    ctx.ellipse(0, bodyY, r * 0.82, r * 0.44, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // ---- 2. 两侧焦土叶 ----
    this._pvzLeaf(ctx, -r * 0.30, bodyY + r * 0.02, r * 0.66, r * 0.30, -1, '#9C5B36', OUT, 3.0);
    this._pvzLeaf(ctx,  r * 0.30, bodyY + r * 0.02, r * 0.66, r * 0.30,  1, '#B06A3D', OUT, 3.0);

    // ---- 3. 茎（焦糖）----
    this._pvzLine(ctx, OUT, 3.0);
    ctx.fillStyle = '#A8622F';
    ctx.beginPath();
    safeRoundRect(ctx, -r * 0.15, headY + headR * 0.48, r * 0.30, r * 0.48, r * 0.13);
    ctx.fill(); ctx.stroke();

    // ---- 4. 头（橙红渐变 + 余烬斑点）----
    const headGrad = ctx.createRadialGradient(-headR * 0.38, headY - headR * 0.38, 0, 0, headY, headR * 1.12);
    headGrad.addColorStop(0, '#FFC894');
    headGrad.addColorStop(0.55, '#FF8B52');
    headGrad.addColorStop(1, '#E05A2B');
    this._pvzLine(ctx, OUT, 3.2);
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(0, headY, headR, headR * 0.94, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, headY, headR, headR * 0.94, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(160,53,24,0.22)';
    ctx.beginPath();
    ctx.ellipse(headR * 0.42, headY + headR * 0.52, headR * 0.72, headR * 0.50, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // 余烬斑点 ×5（v97 +2）
    ctx.fillStyle = 'rgba(160,53,24,0.55)';
    [[-headR * 0.52, headY - headR * 0.42, headR * 0.10],
     [ headR * 0.46, headY - headR * 0.50, headR * 0.08],
     [ headR * 0.62, headY + headR * 0.14, headR * 0.09],
     [-headR * 0.62, headY + headR * 0.30, headR * 0.055],
     [-headR * 0.12, headY - headR * 0.66, headR * 0.05]].forEach(([ex, ey, er]) => {
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.40, headY - headR * 0.42, headR * 0.24, headR * 0.14, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // ---- 5. 炮管（奶油白管身 + 橙环纹，附图白炮管特征）+ 管口三层火苗 ----
    // v97: 加长 0.58→0.66 与豌豆一致
    const cannonX = headR * 0.52;
    const cannonY = headY - headR * 0.52;
    const cannonLen = headR * 0.66;
    const cannonR = headR * 0.34;
    ctx.save();
    ctx.translate(cannonX, cannonY);
    ctx.rotate(-0.55);
    this._pvzLine(ctx, OUT, 3.0);
    ctx.fillStyle = '#D96B33';
    ctx.beginPath();
    ctx.ellipse(cannonR * 0.08, 0, cannonR * 0.26, cannonR * 0.92, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    const cg = ctx.createLinearGradient(0, -cannonR, 0, cannonR);
    cg.addColorStop(0, '#FFF7EA');
    cg.addColorStop(0.5, '#F7E3C4');
    cg.addColorStop(1, '#E3C39B');
    ctx.fillStyle = cg;
    ctx.beginPath();
    safeRoundRect(ctx, 0, -cannonR, cannonLen, cannonR * 2, cannonR * 0.5);
    ctx.fill(); ctx.stroke();
    // 橙色环纹 ×2（白管橙纹，附图特征）
    ctx.fillStyle = '#F08A3C';
    ctx.beginPath();
    safeRoundRect(ctx, cannonLen * 0.30, -cannonR, cannonR * 0.34, cannonR * 2, cannonR * 0.16);
    ctx.fill();
    ctx.beginPath();
    safeRoundRect(ctx, cannonLen * 0.62, -cannonR, cannonR * 0.34, cannonR * 2, cannonR * 0.16);
    ctx.fill();
    this._pvzLine(ctx, OUT, 3.0);
    ctx.beginPath();
    safeRoundRect(ctx, 0, -cannonR, cannonLen, cannonR * 2, cannonR * 0.5);
    ctx.stroke();
    ctx.fillStyle = '#C77B2E';
    ctx.beginPath();
    ctx.ellipse(cannonLen, 0, cannonR * 0.40, cannonR * 0.88, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5A2410';
    ctx.beginPath();
    ctx.ellipse(cannonLen, 0, cannonR * 0.26, cannonR * 0.60, 0, 0, Math.PI * 2);
    ctx.fill();
    // v97 管口余烬火光
    ctx.fillStyle = 'rgba(255,138,60,0.55)';
    ctx.beginPath();
    ctx.ellipse(cannonLen, 0, cannonR * 0.15, cannonR * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    if (fx > 0.12) {
      ctx.save();
      ctx.globalAlpha *= fx;
      const tipX = cannonLen + cannonR * 0.45;
      const mFlash = ctx.createRadialGradient(tipX, 0, 0, tipX, 0, cannonR * 1.8);
      mFlash.addColorStop(0, 'rgba(255,249,196,0.95)');
      mFlash.addColorStop(0.45, 'rgba(255,138,101,0.60)');
      mFlash.addColorStop(1, 'rgba(255,138,101,0)');
      ctx.fillStyle = mFlash;
      ctx.beginPath();
      ctx.arc(tipX, 0, cannonR * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      this._drawStarShape(ctx, tipX, 0, cannonR * 0.58, 4, 0.32);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    const flameBoost = 1 + fx * 0.6;
    const muzzleDist = cannonLen + cannonR * 0.55;
    this._drawFlame(ctx,
      cannonX + Math.cos(-0.70) * muzzleDist,
      cannonY + Math.sin(-0.70) * muzzleDist,
      headR * 0.26 * flameBoost, headR * 0.38 * flameBoost, sway * 0.8);
    // ---- 6. 头顶火苗冠（v97 三簇：左小 / 右大 / 中簇最后画在顶层）----
    this._drawFlame(ctx, -headR * 0.26, headY - headR * 0.80, headR * 0.26, headR * 0.44, -sway * 0.6);
    this._drawFlame(ctx,  headR * 0.24, headY - headR * 0.84, headR * 0.34, headR * 0.60,  sway);
    this._drawFlame(ctx,  0, headY - headR * 0.96, headR * 0.20, headR * 0.34, sway * 0.4);

    // ---- 7. 表情：大白眼珠 + 倒八字怒眉 + 咬牙（附图火焰射手）----
    const eyeCY = headY + headR * 0.10;
    this._drawPvzFace(ctx, {
      eyeDX: headR * 0.31, eyeY: eyeCY, eyeR: headR * 0.170,
      white: true, pupilDx: 0.02, pupilDy: -0.12,
      brow: 'angry', browColor: '#7E2410', browBold: 2.3,
      mouth: 'grit',
      mouthY: headY + headR * 0.46, mouthRx: headR * 0.20, mouthRy: headR * 0.10,
      blush: 'rgba(255,196,120,0.45)',
      ink: '#5A1408', wobblePhase
    });
  }

  /**
   * 坚果墙（v93 经典复刻，参照附图坚果）：
   * - 高椭圆核桃壳（暖棕径向渐变 + 纵向沟纹 + 雀斑）
   * - 大白眼珠上望 + 担心细眉 + 抿嘴；耐久裂纹三档保留
   */
  _drawWall(ctx, r, def, plant) {
    const wobblePhase = (typeof plant === 'number') ? plant : (plant.wobble || 0);
    const OUT = '#5D3A1A';
    const headR = r * 1.0;
    const headY = r * 0.02;
    const wallHp = (plant && typeof plant === 'object' && plant.maxHealth > 0)
      ? Math.max(0, plant.health / plant.maxHealth) : 1;

    // ---- 1. 主体：高椭圆核桃（v99: 加宽 0.90→0.94 / 略压扁 1.06→1.03 更敦实）----
    const bodyPath = () => {
      ctx.beginPath();
      ctx.ellipse(0, headY, headR * 0.94, headR * 1.03, 0, 0, Math.PI * 2);
    };
    const wg = ctx.createRadialGradient(-headR * 0.34, headY - headR * 0.44, 0, 0, headY, headR * 1.35);
    wg.addColorStop(0, '#E2B173');
    wg.addColorStop(0.5, '#C98C4C');
    wg.addColorStop(1, '#8F5A28');
    this._pvzLine(ctx, OUT, 3.2);
    ctx.fillStyle = wg;
    bodyPath();
    ctx.fill(); ctx.stroke();
    // 底部体积分层暗弧
    ctx.save();
    bodyPath(); ctx.clip();
    ctx.fillStyle = 'rgba(93,58,26,0.20)';
    ctx.beginPath();
    ctx.ellipse(headR * 0.20, headY + headR * 0.72, headR * 0.85, headR * 0.52, 0.1, 0, Math.PI * 2);
    ctx.fill();
    // 纵向沟纹 ×3（从顶向下弧线）+ v98 右缘副亮线（雕刻立体感）
    this._pvzLine(ctx, 'rgba(93,58,26,0.38)', 2.2);
    for (const gx of [-headR * 0.42, 0, headR * 0.42]) {
      ctx.beginPath();
      ctx.moveTo(gx, headY - headR * 1.00);
      ctx.quadraticCurveTo(gx * 1.30, headY, gx, headY + headR * 1.00);
      ctx.stroke();
    }
    this._pvzLine(ctx, 'rgba(255,235,200,0.30)', 1.4);
    for (const gx of [-headR * 0.42, 0, headR * 0.42]) {
      ctx.beginPath();
      ctx.moveTo(gx + headR * 0.085, headY - headR * 0.92);
      ctx.quadraticCurveTo(gx * 1.30 + headR * 0.085, headY, gx + headR * 0.085, headY + headR * 0.92);
      ctx.stroke();
    }
    // 雀斑 ×6（v97 +2 小点）
    ctx.fillStyle = 'rgba(93,58,26,0.30)';
    [[-headR * 0.58, headY - headR * 0.55, headR * 0.045],
     [ headR * 0.55, headY - headR * 0.62, headR * 0.04],
     [-headR * 0.62, headY + headR * 0.30, headR * 0.04],
     [ headR * 0.60, headY + headR * 0.38, headR * 0.05],
     [ headR * 0.05, headY + headR * 0.55, headR * 0.035],
     [-headR * 0.40, headY + headR * 0.62, headR * 0.035]].forEach(([fx2, fy2, fr]) => {
      ctx.beginPath();
      ctx.arc(fx2, fy2, fr, 0, Math.PI * 2);
      ctx.fill();
    });
    // v97 底缘反光弧（果冻感）
    ctx.fillStyle = 'rgba(255,235,200,0.16)';
    ctx.beginPath();
    ctx.ellipse(0, headY + headR * 0.86, headR * 0.62, headR * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
      // 左上柔光（v97 柔化 0.38→0.30 缩小避免硬斑）
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.38, headY - headR * 0.52, headR * 0.21, headR * 0.27, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // 顶部小凸蒂（v99: 加大 0.13→0.17 更醒目，经典坚果茎蒂特征）
    this._pvzLine(ctx, OUT, 2.6);
    ctx.fillStyle = '#7A4A20';
    ctx.beginPath();
    ctx.ellipse(0, headY - headR * 1.05, headR * 0.17, headR * 0.115, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,220,170,0.35)';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.045, headY - headR * 1.075, headR * 0.065, headR * 0.04, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // ---- 2. 耐久裂纹（>2/3 无 → <2/3 两道 → <1/3 重裂+崩口）----
    if (wallHp < 0.66) {
      ctx.save();
      bodyPath(); ctx.clip();
      this._pvzLine(ctx, 'rgba(46,22,4,0.80)', 2.6);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(headR * 0.46, headY - headR * 0.76);
      ctx.quadraticCurveTo(headR * 0.30, headY - headR * 0.58, headR * 0.46, headY - headR * 0.42);
      ctx.quadraticCurveTo(headR * 0.58, headY - headR * 0.28, headR * 0.44, headY - headR * 0.12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-headR * 0.60, headY - headR * 0.06);
      ctx.quadraticCurveTo(-headR * 0.44, headY + headR * 0.10, -headR * 0.58, headY + headR * 0.26);
      ctx.stroke();
      if (wallHp < 0.33) {
        ctx.beginPath();
        ctx.moveTo(-headR * 0.05, headY - headR * 1.02);
        ctx.quadraticCurveTo(headR * 0.08, headY - headR * 0.84, -headR * 0.03, headY - headR * 0.68);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(headR * 0.34, headY + headR * 0.48);
        ctx.quadraticCurveTo(headR * 0.18, headY + headR * 0.62, headR * 0.32, headY + headR * 0.78);
        ctx.stroke();
        ctx.fillStyle = 'rgba(46,22,4,0.50)';
        ctx.beginPath();
        ctx.moveTo(headR * 0.44, headY - headR * 0.30);
        ctx.lineTo(headR * 0.20, headY - headR * 0.26);
        ctx.lineTo(headR * 0.36, headY - headR * 0.12);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-headR * 0.56, headY + headR * 0.44);
        ctx.lineTo(-headR * 0.34, headY + headR * 0.50);
        ctx.lineTo(-headR * 0.50, headY + headR * 0.62);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // ---- 3. 表情：大白眼珠上望 + 担心眉 + 抿嘴（重伤换撇嘴）----
    const eyeY = headY - headR * 0.18;
    this._drawPvzFace(ctx, {
      eyeDX: headR * 0.30, eyeY, eyeR: headR * 0.185,
      white: true, pupilDx: -0.12, pupilDy: -0.30,
      brow: 'worried', browColor: '#4A2C10', browBold: 1.8,
      mouth: wallHp < 0.33 ? 'frown' : 'flat',
      mouthY: headY + headR * 0.34, mouthRx: headR * 0.17, mouthRy: headR * 0.06,
      ink: '#3B2B1A', wobblePhase
    });
  }

  /**
   * 寒冰射手（v93 经典复刻：冰雪豌豆）：
   * - 冰蓝渐变头 + 冰晶炮管（管口寒雾）+ 头顶三叉冰晶
   * - 鲜绿底座叶/茎（经典寒冰射手绿根）；冷酷平眉 + 黑豆眼
   */
  _drawFreezer(ctx, r, def, plant) {
    const wobblePhase = (typeof plant === 'number') ? plant : (plant.wobble || 0);
    const fx = (typeof plant === 'object' && plant && plant.shootFx > 0)
      ? Math.sin(Math.min(1, plant.shootFx) * Math.PI) : 0;
    const OUT = '#3D7E96';
    const headR = r * 0.98;
    const headY = -r * 0.22;

    // ---- 1. 底座鲜绿叶/土丘 ----
    const bodyY = r * 0.60;
    const mound = ctx.createRadialGradient(-r * 0.25, bodyY - r * 0.28, 0, 0, bodyY, r * 0.95);
    mound.addColorStop(0, '#7FBF4E');
    mound.addColorStop(0.6, '#5FA83E');
    mound.addColorStop(1, '#447C2C');
    this._pvzLine(ctx, '#2F5E1E', 3.0);
    ctx.fillStyle = mound;
    ctx.beginPath();
    ctx.ellipse(0, bodyY, r * 0.82, r * 0.44, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    this._pvzLeaf(ctx, -r * 0.30, bodyY + r * 0.02, r * 0.66, r * 0.30, -1, '#4E9133', '#2F5E1E', 3.0);
    this._pvzLeaf(ctx,  r * 0.30, bodyY + r * 0.02, r * 0.66, r * 0.30,  1, '#5FA83E', '#2F5E1E', 3.0);

    // ---- 2. 茎 ----
    this._pvzLine(ctx, '#2F5E1E', 3.0);
    ctx.fillStyle = '#5FA83E';
    ctx.beginPath();
    safeRoundRect(ctx, -r * 0.15, headY + headR * 0.48, r * 0.30, r * 0.48, r * 0.13);
    ctx.fill(); ctx.stroke();

    // ---- 3. 头（冰蓝渐变）----
    const headGrad = ctx.createRadialGradient(-headR * 0.38, headY - headR * 0.38, 0, 0, headY, headR * 1.12);
    headGrad.addColorStop(0, '#D5F4F6');
    headGrad.addColorStop(0.55, '#A5DFE8');
    headGrad.addColorStop(1, '#6FB9CC');
    this._pvzLine(ctx, OUT, 3.2);
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(0, headY, headR, headR * 0.94, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, headY, headR, headR * 0.94, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(61,126,150,0.16)';
    ctx.beginPath();
    ctx.ellipse(headR * 0.42, headY + headR * 0.52, headR * 0.72, headR * 0.50, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // 冰霜小白点 ×4（v97 +2）
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(-headR * 0.50, headY - headR * 0.10, headR * 0.045, 0, Math.PI * 2);
    ctx.arc( headR * 0.34, headY - headR * 0.60, headR * 0.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-headR * 0.30, headY + headR * 0.30, headR * 0.035, 0, Math.PI * 2);
    ctx.arc( headR * 0.58, headY + headR * 0.10, headR * 0.038, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.36)';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.40, headY - headR * 0.42, headR * 0.24, headR * 0.14, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // ---- 4. 冰晶炮管（v97 加长 0.58→0.66 + 喇叭口，与豌豆炮管一致）----
    const cannonX = headR * 0.52;
    const cannonY = headY - headR * 0.52;
    const cannonLen = headR * 0.66;
    const cannonR = headR * 0.34;
    ctx.save();
    ctx.translate(cannonX, cannonY);
    ctx.rotate(-0.55);
    this._pvzLine(ctx, OUT, 3.0);
    ctx.fillStyle = '#8CCFDD';
    ctx.beginPath();
    ctx.ellipse(cannonR * 0.08, 0, cannonR * 0.26, cannonR * 0.92, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    const cg = ctx.createLinearGradient(0, -cannonR, 0, cannonR);
    cg.addColorStop(0, '#D5F4F6');
    cg.addColorStop(0.5, '#A5DFE8');
    cg.addColorStop(1, '#6FB9CC');
    ctx.fillStyle = cg;
    ctx.beginPath();
    safeRoundRect(ctx, 0, -cannonR, cannonLen, cannonR * 2, cannonR * 0.5);
    ctx.fill(); ctx.stroke();
    // v97 管背上缘高光线
    this._pvzLine(ctx, 'rgba(255,255,255,0.45)', 1.4);
    ctx.beginPath();
    ctx.moveTo(cannonLen * 0.14, -cannonR * 0.58);
    ctx.quadraticCurveTo(cannonLen * 0.45, -cannonR * 0.80, cannonLen * 0.88, -cannonR * 0.60);
    ctx.stroke();
    this._pvzLine(ctx, OUT, 3.0);
    ctx.fillStyle = '#2E6B80';
    ctx.beginPath();
    ctx.ellipse(cannonLen, 0, cannonR * 0.44, cannonR * 0.92, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#143B4A';
    ctx.beginPath();
    ctx.ellipse(cannonLen, 0, cannonR * 0.28, cannonR * 0.64, 0, 0, Math.PI * 2);
    ctx.fill();
    // 管口寒雾（呼吸浮动）
    const mistSway = Math.sin(wobblePhase * 1.6) * headR * 0.03;
    ctx.fillStyle = 'rgba(224,248,252,0.55)';
    ctx.beginPath();
    ctx.ellipse(cannonLen + cannonR * 0.55 + mistSway, -cannonR * 0.28, cannonR * 0.34, cannonR * 0.24, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cannonLen + cannonR * 0.72 + mistSway * 0.6, cannonR * 0.10, cannonR * 0.26, cannonR * 0.18, 0.25, 0, Math.PI * 2);
    ctx.fill();
    if (fx > 0.12) {
      ctx.save();
      ctx.globalAlpha *= fx;
      const tipX = cannonLen + cannonR * 0.45;
      const mFlash = ctx.createRadialGradient(tipX, 0, 0, tipX, 0, cannonR * 1.6);
      mFlash.addColorStop(0, 'rgba(255,255,255,0.95)');
      mFlash.addColorStop(0.45, 'rgba(178,240,234,0.55)');
      mFlash.addColorStop(1, 'rgba(178,240,234,0)');
      ctx.fillStyle = mFlash;
      ctx.beginPath();
      ctx.arc(tipX, 0, cannonR * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      this._drawStarShape(ctx, tipX, 0, cannonR * 0.52, 4, 0.32);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // ---- 5. 头顶三叉冰晶簇 ----
    ctx.save();
    ctx.translate(0, headY - headR * 0.86);
    ctx.rotate(-0.10);
    // v99 簇后寒气光晕（冷雾衬底，冰晶更晶莹）
    const frostGlow = ctx.createRadialGradient(0, -headR * 0.42, 0, 0, -headR * 0.30, headR * 0.62);
    frostGlow.addColorStop(0, 'rgba(214,244,250,0.55)');
    frostGlow.addColorStop(1, 'rgba(214,244,250,0)');
    ctx.fillStyle = frostGlow;
    ctx.beginPath();
    ctx.arc(0, -headR * 0.30, headR * 0.62, 0, Math.PI * 2);
    ctx.fill();
    // v97 簇底雪座（白椭圆垫，冰晶与头过渡）
    ctx.fillStyle = 'rgba(255,255,255,0.60)';
    ctx.beginPath();
    ctx.ellipse(0, headR * 0.05, headR * 0.32, headR * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();
    const drawCrystal = (w, h, tilt) => {
      ctx.save();
      ctx.rotate(tilt);
      this._pvzLine(ctx, OUT, 2.6);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-w * 0.5, -h * 0.32);
      ctx.lineTo(0, -h);
      ctx.lineTo(w * 0.5, -h * 0.32);
      ctx.closePath();
      ctx.fillStyle = '#EFFBFD';
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#B8E6EE';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -h);
      ctx.lineTo(w * 0.5, -h * 0.32);
      ctx.closePath();
      ctx.fill();
      // v97 左缘高光棱线（晶莹感）
      this._pvzLine(ctx, 'rgba(255,255,255,0.90)', 1.2);
      ctx.beginPath();
      ctx.moveTo(-w * 0.42, -h * 0.30);
      ctx.lineTo(-w * 0.04, -h * 0.92);
      ctx.stroke();
      ctx.restore();
    };
    // v99 外侧小冰棱 ×2（簇形更丰满）
    drawCrystal(headR * 0.15, headR * 0.28, -0.88);
    drawCrystal(headR * 0.15, headR * 0.28,  0.88);
    drawCrystal(headR * 0.26, headR * 0.44, -0.62);
    drawCrystal(headR * 0.26, headR * 0.44,  0.62);
    drawCrystal(headR * 0.30, headR * 0.58, -0.34);
    drawCrystal(headR * 0.34, headR * 0.66,  0.34);
    drawCrystal(headR * 0.38, headR * 1.02,  0);
    // v98 主冰晶尖四角星光（晶莹闪烁）
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    this._drawStarShape(ctx, 0, -headR * 1.04, headR * 0.12, 4, 0.30);
    ctx.fill();
    ctx.restore();

    // ---- 6. 表情：大白眼珠 + 倒八字怒眉 + 冰蓝腮（参照附图寒冰射手）----
    this._drawPvzFace(ctx, {
      eyeDX: headR * 0.31, eyeY: headY + headR * 0.08, eyeR: headR * 0.170,
      white: true, pupilDx: 0.02, pupilDy: -0.10,
      brow: 'angry', browColor: '#1F5568', browBold: 2.2,
      mouth: fx > 0.35 ? 'o' : 'flat',
      mouthY: headY + headR * 0.46, mouthRx: headR * 0.085, mouthRy: headR * 0.075,
      blush: 'rgba(150,214,255,0.50)',
      ink: '#1F3A45', wobblePhase
    });
  }

  /**
   * 樱桃炸弹（v93 经典复刻）：双樱桃 + 绿茎叶 + 引信火花
   * - 亮红径向渐变 + 大高光；白眼珠怒视 + 倒八字眉 + 撇嘴
   * - 蓄力震动 / 引信红光 / 火花逻辑保留
   */
  _drawCherry(ctx, r, def, plant) {
    const wobblePhase = plant.wobble;
    const fuseLeft = plant.fuseTimer || 0;
    const shake = fuseLeft > 0 && fuseLeft < 800
      ? (Math.sin(Date.now() / 30) * (1 - fuseLeft / 800) * 4)
      : 0;
    const OUT = '#8E1B12';
    const headY = -r * 0.05;
    const lx = -r * 0.42, ly = headY + r * 0.08, lr = r * 0.58;
    // v99: 右果右移 0.44→0.52 减少遮挡，露出完整表情
    const rx =  r * 0.52, ry = headY + r * 0.02, rr = r * 0.42;

    ctx.save();
    if (shake) ctx.translate(shake, 0);
    ctx.lineJoin = 'round';

    // 引信燃烧红光（保留）
    if (fuseLeft > 0 && fuseLeft < 1000) {
      const auraA = 0.22 + 0.18 * Math.abs(Math.sin(Date.now() / 90));
      const aura = ctx.createRadialGradient(lx, ly, lr * 0.3, lx, ly, lr * 1.9);
      aura.addColorStop(0, 'rgba(255,87,34,' + auraA.toFixed(3) + ')');
      aura.addColorStop(1, 'rgba(255,87,34,0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(lx, ly, lr * 1.9, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- 1. 双茎（绿，带描边）----
    const stemW = r * 0.12;
    const drawStem = (x0, y0, cx, cy, x1, y1) => {
      ctx.lineCap = 'round';
      this._pvzLine(ctx, OUT, 3.4);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.strokeStyle = OUT;
      ctx.lineWidth = stemW + this._strokeW(2.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.strokeStyle = '#5FA83E';
      ctx.lineWidth = stemW;
      ctx.stroke();
    };
    const lTipX = lx - r * 0.20, lTipY = ly - lr - r * 0.38;
    drawStem(lx + r * 0.02, ly - lr * 0.86, lx - r * 0.02, ly - lr - r * 0.26, lTipX, lTipY);
    const rTipX = rx + r * 0.20, rTipY = ry - rr - r * 0.34;
    drawStem(rx, ry - rr * 0.86, rx + r * 0.04, ry - rr - r * 0.24, rTipX, rTipY);

    // ---- 2. 茎侧叶（绿萼函数定义，等樱桃主体画完再叠）----
    this._pvzLeaf(ctx, lx - r * 0.14, ly - lr - r * 0.20, r * 0.30, r * 0.12, -1, '#5FA83E', '#2F5E1E', 2.4);
    this._pvzLeaf(ctx, rx + r * 0.12, ry - rr - r * 0.16, r * 0.24, r * 0.10,  1, '#5FA83E', '#2F5E1E', 2.4);
    const calyx = (cx, cy, s, flip) => {
      this._pvzLine(ctx, '#2F5E1E', 2.0);
      const arms = flip
        ? [[-s * 0.34, -s * 0.30], [-s * 0.06, -s * 0.46], [s * 0.26, -s * 0.34]]
        : [[-s * 0.26, -s * 0.34], [s * 0.06, -s * 0.46], [s * 0.34, -s * 0.30]];
      for (const [ax, ay] of arms) {
        ctx.fillStyle = '#4E9133';
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.09, cy);
        ctx.quadraticCurveTo(cx + ax * 0.5, cy + ay * 0.55, cx + ax, cy + ay);
        ctx.quadraticCurveTo(cx + ax * 0.55, cy + ay * 0.45, cx + s * 0.09, cy);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
    };

    // ---- 3. 后樱桃（右小，暗档）----
    const rg = ctx.createRadialGradient(rx - rr * 0.32, ry - rr * 0.36, 0, rx, ry, rr * 1.12);
    rg.addColorStop(0, '#F05046');
    rg.addColorStop(0.55, '#D93528');
    rg.addColorStop(1, '#A81F16');
    this._pvzLine(ctx, OUT, 3.0);
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(rx, ry, rr, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.ellipse(rx - rr * 0.32, ry - rr * 0.36, rr * 0.20, rr * 0.28, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // v97 后樱底缘反光弧
    ctx.fillStyle = 'rgba(255,180,160,0.20)';
    ctx.beginPath();
    ctx.ellipse(rx + rr * 0.10, ry + rr * 0.62, rr * 0.50, rr * 0.13, 0.05, 0, Math.PI * 2);
    ctx.fill();

    // ---- 4. 前樱桃（左大，亮档）----
    const lg = ctx.createRadialGradient(lx - lr * 0.34, ly - lr * 0.40, 0, lx, ly, lr * 1.15);
    lg.addColorStop(0, '#FF7A6E');
    lg.addColorStop(0.45, '#F05046');
    lg.addColorStop(0.8, '#D93528');
    lg.addColorStop(1, '#A81F16');
    this._pvzLine(ctx, OUT, 3.2);
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(lx, ly, lr, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(lx - lr * 0.36, ly - lr * 0.42, lr * 0.22, lr * 0.15, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.arc(lx + lr * 0.42, ly + lr * 0.38, lr * 0.07, 0, Math.PI * 2);
    ctx.fill();
    // v97 前樱底缘反光弧
    ctx.fillStyle = 'rgba(255,190,170,0.25)';
    ctx.beginPath();
    ctx.ellipse(lx + lr * 0.08, ly + lr * 0.60, lr * 0.54, lr * 0.15, 0.05, 0, Math.PI * 2);
    ctx.fill();

    // ---- 4.5 双樱绿萼（星形萼片，参照附图，叠在樱桃顶）----
    calyx(lx, ly - lr + r * 0.02, r * 0.40, false);
    calyx(rx, ry - rr + r * 0.02, r * 0.32, true);

    // ---- 5. 双脸：大白眼珠 + 闭口甜笑（附图双樱可爱脸）----
    const faceOf = (cx, cy, rad, phase) => {
      this._drawPvzFace(ctx, {
        eyeDX: rad * 0.30, eyeY: cy - rad * 0.08, eyeR: rad * 0.23,
        white: true, pupilDx: 0.02, pupilDy: -0.16,
        brow: 'none',
        mouth: 'smile',
        mouthY: cy + rad * 0.36, mouthRx: rad * 0.15, mouthRy: rad * 0.10,
        ink: '#3B1210', wobblePhase: phase
      });
    };
    faceOf(rx, ry, rr, wobblePhase + 2.1);
    faceOf(lx, ly, lr, wobblePhase);

    // ---- 6. 引信火花（保留）----
    if (fuseLeft > 0 && fuseLeft < 1000) {
      const sparkAlpha = 0.4 + 0.6 * Math.abs(Math.sin(Date.now() / (fuseLeft < 500 ? 50 : 100)));
      ctx.globalAlpha = sparkAlpha;
      ctx.fillStyle = '#FF9800';
      this._drawStarShape(ctx, rTipX, rTipY, r * 0.20, 5, 0.45);
      ctx.fill();
      ctx.fillStyle = '#FFF176';
      this._drawStarShape(ctx, rTipX, rTipY, r * 0.12, 4, 0.5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(rTipX, rTipY - r * 0.16, r * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /**
   * 食人花（v93 经典复刻）：
   * - 紫色大头 + 朝右上楔形大口（厚唇 + 上下獠牙 + 近黑口腔）
   * - 深紫斑点；头顶怒目黑豆眼；咬合前冲 / 吞咽鼓肚 / 呼吸开合保留
   */
  _drawChomper(ctx, r, def, plant) {
    const wobblePhase = (typeof plant === 'number') ? plant : (plant.wobble || 0);
    let biteP = 0, swalP = 0, chompState = 'idle';
    if (typeof plant === 'object' && plant !== null) {
      biteP = plant.chomperBiteProgress || 0;
      swalP = plant.chomperSwallowProgress || 0;
      chompState = plant.chomperState || 'idle';
    }
    const OUT = '#4A2370';
    const headR = r * 1.02;
    const headY = -r * 0.30;

    const swallowScale = 1 + swalP * 0.12;
    const swallowOffY = swalP * r * 0.08;
    ctx.save();
    ctx.translate(0, swallowOffY);
    ctx.scale(swallowScale, swallowScale);

    // ---- 1. 底座叶 ×4 + 茎 ----
    const bodyY = r * 0.60;
    const mound = ctx.createRadialGradient(-r * 0.25, bodyY - r * 0.28, 0, 0, bodyY, r * 0.95);
    mound.addColorStop(0, '#7FBF4E');
    mound.addColorStop(0.6, '#5FA83E');
    mound.addColorStop(1, '#447C2C');
    this._pvzLine(ctx, '#2F5E1E', 3.0);
    ctx.fillStyle = mound;
    ctx.beginPath();
    ctx.ellipse(0, bodyY, r * 0.82, r * 0.44, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    this._pvzLeaf(ctx, -r * 0.30, bodyY + r * 0.02, r * 0.66, r * 0.30, -1, '#4E9133', '#2F5E1E', 3.0);
    this._pvzLeaf(ctx,  r * 0.30, bodyY + r * 0.02, r * 0.66, r * 0.30,  1, '#5FA83E', '#2F5E1E', 3.0);
    // 吞咽鼓肚
    if (swalP > 0.05) {
      this._pvzLine(ctx, '#2F5E1E', 3.0);
      ctx.fillStyle = '#5FA83E';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.28, r * (0.28 + swalP * 0.20), r * (0.22 + swalP * 0.10), 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    this._pvzLine(ctx, '#2F5E1E', 3.0);
    const stemGrad = ctx.createLinearGradient(-r * 0.15, 0, r * 0.15, 0);
    stemGrad.addColorStop(0, '#7FBF4E');
    stemGrad.addColorStop(0.5, '#5FA83E');
    stemGrad.addColorStop(1, '#447C2C');
    ctx.fillStyle = stemGrad;
    ctx.beginPath();
    safeRoundRect(ctx, -r * 0.14, headY + headR * 0.55, r * 0.28, r * 0.50, r * 0.12);
    ctx.fill(); ctx.stroke();

    // ---- 2. 头部（咬合前冲保留）----
    const snapLungeX = Math.sin(biteP * Math.PI) * r * 0.10;
    const snapLungeY = -Math.sin(biteP * Math.PI) * r * 0.08;
    ctx.save();
    ctx.translate(snapLungeX, snapLungeY);
    const headGrad = ctx.createRadialGradient(-headR * 0.30, headY - headR * 0.42, 0, 0, headY - headR * 0.10, headR * 1.18);
    headGrad.addColorStop(0, '#C9A2EE');
    headGrad.addColorStop(0.55, '#A55FD4');
    headGrad.addColorStop(1, '#7A3AA5');
    this._pvzLine(ctx, OUT, 3.2);
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(0, headY, headR * 1.02, headR * 0.96, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // ---- 3. 正面大嘴（胶囊口腔 + 厚唇 + 上下双排獠牙，参照附图正面食人花）----
    // 开口度逻辑保留：idle 呼吸 / snap 快开快合 / swallow 紧闭
    let mouthOpen;
    if (chompState === 'snap') {
      mouthOpen = biteP < 0.45
        ? 0.35 + (biteP / 0.45) * 0.95
        : 1.30 - ((biteP - 0.45) / 0.55) * 0.95;
    } else if (chompState === 'swallow') {
      mouthOpen = 0.12;
    } else {
      mouthOpen = 0.45 + 0.25 * Math.sin(wobblePhase);
    }
    mouthOpen = Math.max(0.10, Math.min(1.30, mouthOpen));
    const mouthFlash = (chompState === 'snap' && biteP >= 0.4 && biteP <= 0.65) ? 1 : 0;
    const openN = Math.min(1, mouthOpen / 1.30);            // 归一化 0..1
    // v99: 大嘴占比再升级 —— 口腔加宽 1.14→1.30、开度加高 0.64→0.72（贴近经典食人花血盆大口）
    const mW = headR * 1.30;                                // 口腔胶囊宽
    const mH = headR * (0.16 + 0.72 * openN);               // 口腔高（随开口度呼吸）
    const mCY = headY + headR * 0.34;                       // 口腔中心（头中下）
    // 厚唇（紫红外圈胶囊）
    this._pvzLine(ctx, OUT, 3.0);
    ctx.fillStyle = '#8A46B4';
    ctx.beginPath();
    safeRoundRect(ctx, -mW / 2, mCY - mH / 2, mW, mH, Math.min(mH / 2, headR * 0.26));
    ctx.fill(); ctx.stroke();
    // v97 唇上缘高光弧（厚唇立体感）
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, mCY - mH / 2 + headR * 0.048, mW * 0.38, headR * 0.036, 0, 0, Math.PI * 2);
    ctx.fill();
    // 口腔（近黑紫内腔 + 咬合红闪）
    const inPad = headR * 0.070;
    const cavPath = () => {
      ctx.beginPath();
      safeRoundRect(ctx, -mW / 2 + inPad, mCY - mH / 2 + inPad,
        mW - inPad * 2, Math.max(headR * 0.045, mH - inPad * 2),
        Math.max(headR * 0.03, (mH - inPad * 2) * 0.36));
    };
    ctx.fillStyle = mouthFlash ? '#D32F2F' : '#3A0D52';
    cavPath();
    ctx.fill();
    // 上下双排獠牙（v99: 5→4 颗/排更粗壮，齿高上限 0.20→0.24 更狰狞可爱）
    if (mH > headR * 0.20) {
      ctx.save();
      cavPath(); ctx.clip();
      // v98 口腔顶部暗弧（内腔深度感）
      ctx.fillStyle = 'rgba(18,4,28,0.50)';
      ctx.beginPath();
      ctx.ellipse(0, mCY - mH / 2 + inPad * 0.5, mW * 0.42, mH * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      const toothH = Math.min(mH * 0.42, headR * 0.24);
      const topY = mCY - mH / 2 + inPad;
      const botY = mCY + mH / 2 - inPad;
      const nx = 4, gap = (mW - inPad * 2.2) / nx;   // v99 獠牙 5→4 颗/排更粗
      ctx.fillStyle = '#FFF7EA';
      for (let i = 0; i < nx; i++) {
        const tx = -mW / 2 + inPad * 1.1 + gap * (i + 0.5);
        ctx.beginPath();
        ctx.moveTo(tx - gap * 0.34, topY);
        ctx.lineTo(tx + gap * 0.34, topY);
        ctx.lineTo(tx, topY + toothH * (i % 2 === 0 ? 1 : 0.70));
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(tx - gap * 0.30, botY);
        ctx.lineTo(tx + gap * 0.30, botY);
        ctx.lineTo(tx + gap * 0.03, botY - toothH * (i % 2 === 1 ? 0.95 : 0.62));
        ctx.closePath();
        ctx.fill();
      }
      // 喉底暗红影（先于舌头，垫底）
      ctx.fillStyle = 'rgba(150,40,80,0.45)';
      ctx.beginPath();
      ctx.ellipse(0, botY - mH * 0.08, mW * 0.30, mH * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      // v99 舌头（经典食人花粉舌：底部椭圆 + 中缝深线）
      const tongueH = Math.min(mH * 0.30, headR * 0.14);
      ctx.fillStyle = '#E8576E';
      ctx.beginPath();
      ctx.ellipse(0, botY - tongueH * 0.55, mW * 0.22, tongueH * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(122,20,50,0.55)';
      ctx.lineWidth = Math.max(1, headR * 0.022);
      ctx.beginPath();
      ctx.moveTo(0, botY - tongueH * 0.95);
      ctx.lineTo(0, botY - tongueH * 0.18);
      ctx.stroke();
      ctx.restore();
    }

    // ---- 4. 深紫斑点（避让嘴部区）----
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, headY, headR * 1.02, headR * 0.96, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(94,43,133,0.65)';
    [[-headR * 0.58, headY - headR * 0.42, headR * 0.12],
     [ headR * 0.52, headY - headR * 0.55, headR * 0.09],
     [-headR * 0.30, headY - headR * 0.78, headR * 0.08],
     [-headR * 0.72, headY + headR * 0.14, headR * 0.09],
     [ headR * 0.66, headY + headR * 0.02, headR * 0.08]].forEach(([sx, sy, sr]) => {
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    // 左上柔光
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.44, headY - headR * 0.44, headR * 0.22, headR * 0.14, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // ---- 4.5 v99 头顶小嫩芽（经典食人花头顶卷茎特征）----
    const sproutBaseY = headY - headR * 0.94;
    this._pvzLine(ctx, '#2F5E1E', 2.4);
    ctx.strokeStyle = '#2F5E1E'; ctx.lineWidth = Math.max(1, r * 0.032); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, sproutBaseY + headR * 0.06);
    ctx.quadraticCurveTo(headR * 0.02, sproutBaseY - headR * 0.10, headR * 0.12, sproutBaseY - headR * 0.12);
    ctx.stroke();
    this._pvzLeaf(ctx, headR * 0.12, sproutBaseY - headR * 0.12, headR * 0.34, headR * 0.13, 1, '#5FA83E', '#2F5E1E', 2.4);
    this._pvzLeaf(ctx, -headR * 0.01, sproutBaseY - headR * 0.04, headR * 0.26, headR * 0.11, -1, '#4E9133', '#2F5E1E', 2.4);

    // ---- 5. 表情：大白眼珠 + 倒八字怒眉（大嘴上方高位，附图眼在头顶）----
    this._drawPvzFace(ctx, {
      eyeDX: headR * 0.30, eyeY: headY - headR * 0.46, eyeR: headR * 0.150,
      white: true, pupilDx: 0.02, pupilDy: 0.06,
      brow: 'angry', browColor: '#3B1252', browBold: 2.3,
      mouth: 'none', ink: '#2A0F3E', wobblePhase
    });

    ctx.restore();  // snap head offset
    ctx.restore();  // swallow scale
  }

  /**
   * 向日葵（v93 经典复刻，参照附图）：
   * - 12 外层尖花瓣（柠檬黄深勾边）+ 8 内层短瓣 + 暖橙花盘
   * - 黑豆眼 + 大开口笑（花盘脸）；产阳光金色光环保留
   */
  _drawSunflower(ctx, r, def, plant) {
    const wobblePhase = (typeof plant === 'number') ? plant : (plant.wobble || 0);
    const wobble = Math.sin(wobblePhase) * 0.05;
    const OUT = '#C77700';
    const headR = r * 0.95;
    const headY = -r * 0.18;

    // 产阳光光环（保留）
    if (typeof plant === 'object' && plant && plant.sunCooldown > 0 && plant.sunCooldown < PLANT.SUN_GLOW_MS) {
      const pulse = 0.45 + 0.55 * Math.abs(Math.sin(Date.now() / 130));
      const glow = ctx.createRadialGradient(0, headY, headR * 0.2, 0, headY, headR * 1.55);
      glow.addColorStop(0, 'rgba(255,213,79,' + (0.38 * pulse).toFixed(3) + ')');
      glow.addColorStop(0.65, 'rgba(255,193,7,' + (0.20 * pulse).toFixed(3) + ')');
      glow.addColorStop(1, 'rgba(255,193,7,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, headY, headR * 1.55, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- 1. 茎 + 两片大叶 ----
    this._pvzLine(ctx, '#2F5E1E', 3.0);
    const stemGrad = ctx.createLinearGradient(0, r * 0.02, 0, r * 0.58);
    stemGrad.addColorStop(0, '#7CB342');
    stemGrad.addColorStop(1, '#4E8B32');
    ctx.fillStyle = stemGrad;
    ctx.beginPath();
    safeRoundRect(ctx, -r * 0.13, r * 0.02, r * 0.26, r * 0.58, r * 0.13);
    ctx.fill(); ctx.stroke();
    this._pvzLeaf(ctx, -r * 0.12, r * 0.40, r * 0.62, r * 0.26, -1, '#5E9433', '#2F5E1E', 2.8);
    this._pvzLeaf(ctx,  r * 0.12, r * 0.40, r * 0.62, r * 0.26,  1, '#6BA83A', '#2F5E1E', 2.8);

    // ---- 2. 外层 24 圆瓣（双层：暗层错位打底 + 亮层；v94 圆头宽瓣，参照附图）----
    // v98: 花瓣改用根→尖线性渐变（根部暖橙 → 瓣尖亮黄），立体锥形光感替代单色平涂
    const petal = (rad, len, wid, angle, fill, edge) => {
      const px = Math.cos(angle) * rad;
      const py = headY + Math.sin(angle) * rad;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle + Math.PI / 2);
      this._pvzLine(ctx, edge, 1.9);
      if (Array.isArray(fill)) {
        const pg = ctx.createLinearGradient(0, len * 0.30, 0, -len);
        pg.addColorStop(0, fill[0]);
        pg.addColorStop(0.55, fill[1]);
        pg.addColorStop(1, fill[2]);
        ctx.fillStyle = pg;
      } else {
        ctx.fillStyle = fill;
      }
      ctx.beginPath();
      ctx.moveTo(-wid, 0);
      ctx.bezierCurveTo(-wid * 1.10, -len * 0.52, -wid * 0.62, -len * 1.06, 0, -len);
      ctx.bezierCurveTo(wid * 0.62, -len * 1.06, wid * 1.10, -len * 0.52, wid, 0);
      ctx.quadraticCurveTo(0, len * 0.30, -wid, 0);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    };
    const petalRad = headR * 0.76, petalLen = headR * 0.50, petalWid = headR * 0.19;
    // v97 外层暗瓣（v98 改渐变：根深橙 → 尖中橙）
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + Math.PI / 12 + wobble * 1.2;
      petal(petalRad + headR * 0.01, petalLen * 0.98, petalWid * 0.94, angle,
        ['#D98A0E', '#E8940E', '#F0A81C'], OUT);
    }
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + wobble * 1.4;
      petal(petalRad, petalLen, petalWid, angle,
        ['#FFC53E', '#FFD53E', '#FFE47A'], OUT);
    }

    // ---- 3. 花盘（暖橙径向渐变，占花头主体；v97 再加大 0.66→0.72 脸部更聚焦）----
    const discR = headR * 0.72;
    const discGrad = ctx.createRadialGradient(-discR * 0.3, headY - discR * 0.35, 0, 0, headY, discR * 1.15);
    discGrad.addColorStop(0, '#FFC063');
    discGrad.addColorStop(0.6, '#F7A62B');
    discGrad.addColorStop(1, '#E8890C');
    this._pvzLine(ctx, OUT, 2.8);
    ctx.fillStyle = discGrad;
    ctx.beginPath();
    ctx.arc(0, headY, discR, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // v97 籽盘内环细线（盘面层次）+ v98 环缘籽点 ×5（花盘颗粒质感，避让脸部）
    this._pvzLine(ctx, 'rgba(199,119,0,0.38)', 1.5);
    ctx.beginPath();
    ctx.arc(0, headY, discR * 0.90, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(178,100,0,0.42)';
    [[-0.64, -0.50], [0.62, -0.48], [-0.74, -0.10], [0.74, -0.06], [0, -0.60]].forEach(([sx2, sy2]) => {
      ctx.beginPath();
      ctx.arc(sx2 * discR, headY + sy2 * discR, discR * 0.052, 0, Math.PI * 2);
      ctx.fill();
    });
    // 花盘底部暗弧
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, headY, discR, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(199,119,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(discR * 0.18, headY + discR * 0.62, discR * 0.9, discR * 0.5, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(-discR * 0.38, headY - discR * 0.44, discR * 0.30, discR * 0.16, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // ---- 5. 花盘脸：黑豆大眼 + 大开口笑 + 暖橙腮（v97 眼/嘴再放大）----
    this._drawPvzFace(ctx, {
      eyeDX: headR * 0.28, eyeY: headY - headR * 0.04, eyeR: headR * 0.165,
      white: false, brow: 'none',
      mouth: 'smile-open',
      mouthY: headY + headR * 0.21, mouthRx: headR * 0.29, mouthRy: headR * 0.185,
      blush: 'rgba(255,132,72,0.48)',
      ink: '#4A2C0F', wobblePhase
    });
  }

  /**
   * 绘制投射物（实心圆 + 拖尾）
   * v2: 火焰弹（type='fire'）使用多层火焰拖尾，区分穿透弹视觉
   */
  _drawProjectile(ctx, proj) {
    ctx.save();
    if (proj.type === 'fire') {
      // 火焰弹：3 层渐变火焰球（外橙红 → 中橙 → 内黄白火芯）+ 拖尾火苗
      const x = proj.x, y = proj.y, R = proj.radius;
      // v6 修复 (Task 7-B F6)：植物水平射击，vy=0，应用 vx 计算拖尾偏移
      const trailOff = -proj.vx * 0.025;
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = this.T.COLORS.FIRE_FLAME;
      ctx.beginPath();
      ctx.ellipse(x + trailOff, y, R * 1.4, R * 1.0, 0, 0, Math.PI * 2);
      ctx.fill();
      // 外层火焰球
      ctx.globalAlpha = 1;
      ctx.fillStyle = this.T.COLORS.FIRE_BODY_DARK;
      ctx.beginPath();
      ctx.arc(x, y, R * 1.1, 0, Math.PI * 2);
      ctx.fill();
      // 中层橙
      ctx.fillStyle = this.T.COLORS.FIRE_FLAME;
      ctx.beginPath();
      ctx.arc(x, y, R * 0.85, 0, Math.PI * 2);
      ctx.fill();
      // 内核亮黄
      ctx.fillStyle = this.T.COLORS.FIRE_CORE;
      ctx.beginPath();
      ctx.arc(x, y, R * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    // 普通弹 / 冰弹：实心圆 + 拖尾
    // 拖尾 (v6 修复 Task 7-B F6：用 vx 计算偏移)
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = proj.color;
    ctx.beginPath();
    ctx.arc(proj.x - proj.vx * 0.02, proj.y, proj.radius * 0.8, 0, Math.PI * 2);
    ctx.fill();
    // 主体
    ctx.globalAlpha = 1;
    ctx.fillStyle = proj.color;
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
    ctx.fill();
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(proj.x - proj.radius * 0.3, proj.y - proj.radius * 0.3, proj.radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * 添加粒子（击杀爆炸效果）
   */
  // v6 修复 (Task 12): addBurst 默认值 → PARTICLE.* 集中常量
  addBurst(x, y, color, count = PARTICLE.DEFAULT_COUNT) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const speed = PARTICLE.SPEED_MIN + Math.random() * PARTICLE.SPEED_RANGE;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: PARTICLE.LIFE_MS,
        maxLife: PARTICLE.LIFE_MS,
        color: color || PARTICLE.DEFAULT_COLOR,
        size: PARTICLE.SIZE_MIN + Math.random() * PARTICLE.SIZE_RANGE
      });
    }
  }

  /**
   * 绘制并更新粒子
   * v6 修复 (Task 7-B F4): 接收 dt 替代硬编码 16，高帧率设备粒子动画不再 2x 速
   * v6 修复 (Task 7-B F3): 接入 fpsMonitor.shouldSkipDetails —— 低端机连续低 FPS 时跳过粒子绘制（生命仍更新+splice 防止 addBurst 数组无限增长）
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} [dt] - 帧间隔 ms，未传则兜底 16
   */
  // v6 修复 (Task 12): _drawParticles 默认值 → PARTICLE.* 集中常量
  _drawParticles(ctx, dt) {
    const dtClamped = dt || PARTICLE.DT_FALLBACK_MS;
    const skipDraw = fpsMonitor.shouldSkipDetails();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dtClamped;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dtClamped / 1000;
      p.y += p.vy * dtClamped / 1000;
      p.vy += PARTICLE.GRAVITY * dtClamped / 1000;  // 重力
      if (skipDraw) continue;  // 低端机：仅更新生命+位置，跳过绘制
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * 清理
   */
  clear() {
    this.particles = [];
  }
}

const renderer = new Renderer();

module.exports = {
  renderer,
  Renderer
};
