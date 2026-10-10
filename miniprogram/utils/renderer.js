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
    BLUSH_PINK:'rgba(255,150,170,0.65)',  // 植物通用粉腮
    BLUSH_RICH:'rgba(244,143,177,0.75)',  // 坚果浓腮红
    BLUSH_COOL:'rgba(120,200,255,0.55)',  // 寒冰腮蓝
    BLUSH_ZOMBIE:'rgba(255,120,150,0.65)',// 僵尸爱心腮红
    // 豌豆 Shooter
    S_LEAF_DARK:  '#AED581',
    S_LEAF_MID:   '#9CCC65',
    S_LEAF_LIGHT: '#C5E1A5',
    S_STEM:       '#7CB342',
    S_PEA_LIGHT:  '#C5E1A5',
    S_MOUTH_OUT:  '#558B2F',
    S_MOUTH_IN:   '#33691E',
    S_PEA_SHINE:  '#F1F8E9',
    // 坚果 Wall
    W_SPROUT_DARK:'#66BB6A',
    W_SPROUT_LIGHT:'#81C784',
    W_RIND:       'rgba(109,76,65,0.35)',  // 坚果壳纹
    // 寒冰 Freezer v22（参照附件 plant_freezer.png：薄荷青冰晶系 + 鲜绿底座叶）
    F_LEAF_DARK:  '#4CAF50',   // 后层大叶 深鲜绿
    F_LEAF_MID:   '#66BB6A',   // 前层小叶 鲜绿
    F_STEM:       '#43A047',   // 茎 深鲜绿
    F_HEAD_LIGHT: '#B2F0EA',   // 头部亮部 薄荷青
    F_HEAD_DARK:  '#2BA8A0',   // 头部暗部 深青
    F_MOUTH_OUT:  '#2A7A76',   // 炮口外环 深青
    F_MOUTH_IN:   '#123B38',   // 炮口内腔 近黑青
    F_CRYSTAL:    '#E0FFFF',   // 冰晶主色 近白冰
    F_CRYSTAL_2:  '#AEEEEE',   // 冰晶切面暗部
    F_LID:        '#5ECFC2',   // 半垂眼睑色（头中调）
    F_LID_LINE:   '#1D6E66',   // 眼睑边缘线 深青
    // 僵尸头饰
    Z_CONE:       '#FFCA28',
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
    // 樱桃炸弹 Cherry
    C_BODY:       '#E53935',
    C_BODY_DARK:  '#C62828',
    C_LEAF:       '#66BB6A',
    C_FUSE:       '#7CB342',
    C_SPARK:      '#FFEB3B',
    C_SHINE:      '#FFCDD2',
    // v24 樱桃新增（参照 plant_cherry.png）
    C_BODY_LIGHT: '#FF7B6B',   // 亮部（渐变起点，高饱和鲜红）
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
    // v25 食人花 Chomper 新增（按系列风格标准重绘）
    CH_HEAD_LIGHT: '#E9C6F0',   // 头部亮部 浅紫粉
    CH_HEAD_DARK:  '#4A148C',   // 头部暗部 深紫
    CH_SPOT:       '#5E1980',   // 表皮斑点 深紫
    CH_LIP:        '#6A1B9A',   // 大嘴厚唇 深紫
    CH_MOUTH:      '#4A0E66',   // 口腔 近黑紫
    CH_FLASH:      '#B71C1C',   // 咬合瞬间闪光 红
    CH_BROW:       '#3B1252',   // 倒八字眉 深紫黑
    CH_BLUSH:      'rgba(206,147,216,0.50)',  // 淡紫腮红
    // v25 火焰射手 Fire 新增（按系列风格标准重绘）
    FR_HEAD_LIGHT: '#FFE0B2',   // 头部亮部 浅杏橙
    FR_HEAD_DARK:  '#D84315',   // 头部暗部 深橙红
    FR_CANNON_RIM: '#BF360C',   // 炮口外环 深红
    FR_CANNON_IN:  '#3E0F0A',   // 炮口内腔 近黑红
    FR_BROW:       '#8D2819',   // 倒八字眉 深红棕
    // v26 铁桶僵尸 Bucket 新增（参照 zombie_imp.png 设定图：金属桶+破衬衫）
    Z_BUCKET_LIGHT: '#DDE3E7',  // 铁桶亮部 银灰高光带
    Z_BUCKET:       '#9BA1A7',  // 铁桶基色 中灰
    Z_BUCKET_DARK:  '#5F676E',  // 铁桶暗部 底缘/侧影
    Z_RUST:         '#8B5A2B',  // 锈斑/锈屑 棕褐
    Z_SHIRT:        '#A7BCCB',  // 破衬衫 灰蓝
    Z_SHIRT_DARK:   '#7E93A4',  // 衣影/口袋/撕裂内衬
    Z_PANTS:        '#4A4F54',  // 破旧长裤 深灰
    Z_BOOT:         '#6B6356',  // 工装靴 暗棕
    Z_MOUTH:        '#7E3538',  // 僵尸口腔 暗红
    // v27 小鬼僵尸 Imp 新增（参照 zombie_extra_1.png 设定图：兜帽破袍+麻袋+棕靴）
    Z_HOOD_LIGHT:  '#8C8279',  // 兜帽亮部 浅灰褐（左上受光）
    Z_HOOD:        '#5C5750',  // 兜帽/破长袍基色 中灰
    Z_HOOD_DARK:   '#3A352F',  // 兜帽暗部/撕裂内衬/短靴 深灰
    Z_SACK:        '#C4A265',  // 麻袋 粗麻黄
    Z_SACK_DARK:   '#8F7040',  // 麻袋束绳/补丁/暗部 深麻褐
    Z_EYE_YELLOW:  '#F5EDB5',  // 小鬼眼白 浑浊淡黄
    // v28 橄榄球僵尸 Football 新增（参照 zombie_football.png 设定图：红盔+面罩+绿球衣）
    Z_FH_RED:        '#D03A29',  // 头盔/护肩基色 足球红
    Z_FH_RED_LIGHT:  '#E4604A',  // 盔体/护肩左上受光
    Z_FH_RED_DARK:   '#A3231B',  // 盔体右下暗部/眉缘缓冲条/甲缝
    Z_FH_STRIPE:     '#F2E6CE',  // 盔顶中条纹/裤侧条纹 奶油白
    Z_FH_CAGE:       '#C9C2B0',  // 面罩格栅 暖银
    Z_FH_JERSEY:     '#3A5C39',  // 球衣/短裤 森林绿
    Z_FH_JERSEY_DARK:'#2C472C',  // 球衣衣影/下摆撕裂内衬
    Z_FH_WRIST:      '#2E4A32',  // 护腕/袖口 深绿
    Z_FH_CLEAT:      '#6B4C3A',  // 橄榄球鞋 棕褐
    // v29 舞王僵尸 Dancer 新增（参照 zombie_dancer.png 设定图：黑礼帽+紫西装+领带+音符）
    Z_DN_HAT:        '#23232B',  // 礼帽帽冠 近黑碳灰
    Z_DN_HAT_DARK:   '#0F0F15',  // 帽檐/冠底接缝暗部
    Z_DN_HAT_LIGHT:  '#3A3A46',  // 帽冠左上受光带（v29.3 减对比柔和）
    Z_DN_SUIT:       '#6B3D74',  // 西装/西裤 品紫（像素取样 #603060 区间）
    Z_DN_SUIT_DARK:  '#4A2550',  // 衣影/驳领/下摆撕裂内衬 深紫
    Z_DN_SUIT_LIGHT: '#8A5590',  // 西装受光浅紫（音符用）
    Z_DN_SHIRT:      '#EDEBD2',  // 衬衫/袖口/领带条纹 米白
    Z_DN_TIE:        '#3D1F44',  // 领带 深紫黑
    Z_DN_SHOE:       '#5C4033',  // 圆头皮鞋 深棕
    Z_DN_TONGUE:     '#D9534F',  // 舌头 鲜红
    // v51 僵尸王 King 新增（金冠 + 深红斗篷 + 暗紫王袍 = 压轴终局大波之王）
    Z_KING_GOLD:       '#F5C542',  // 王冠/腰带/袖口/肩扣 亮金
    Z_KING_GOLD_DARK:  '#B8860B',  // 冠底带/冠尖描影 深金
    Z_KING_GEM:        '#C62828',  // 冠身红宝石/腰带扣 深红
    Z_KING_CAPE:       '#7B1E2B',  // 斗篷 皇家深红
    Z_KING_CAPE_DARK:  '#54121C',  // 斗篷右暗部/战靴 暗红
    Z_KING_ROBE:       '#3E2A5A',  // 王袍/袍袖 暗紫
    Z_KING_ROBE_DARK:  '#2C1E42',  // 王袍衣影/袍摆内衬 深紫
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
  FACE: {
    EYE_DX_RATIO:  0.36,   // 眼距 = 头半径 × 0.36（僵尸原 0.33 → 统一到 0.36）
    EYE_R_RATIO:   0.24,   // 眼半径 × 0.24（僵尸原 0.27 → 统一）
    EYE_Y_OFFSET:  0.08,   // 眼 Y 相对头中心：+ 0.08 × headR
    PUPIL_R_RATIO: 0.56,   // 瞳孔 = 眼半径 × 0.56
    PUPIL_OFF_X:   0.16,   // 瞳孔右下偏位：× eyeR
    PUPIL_OFF_Y:   0.14,
    PUPIL_SHINE1:  0.42,   // 大高光 = 瞳孔 × 0.42
    PUPIL_SHINE2:  0.18,   // 小高光 = 瞳孔 × 0.18
    BLUSH_CX:      0.62,   // 腮红中心 X = × headR
    BLUSH_CY:      0.38,   // 腮红中心 Y 相对 eyeY：+ 0.38 × headR
    BLUSH_SIZE:    0.15,   // 爱心大小 × headR
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
    EYE_R_RATIO:   0.20,   // 眼更小（植物=0.24）
    EYE_Y_OFFSET:  0.10,   // 眼位略低
    PUPIL_R_RATIO: 0.48,   // 瞳孔更小（植物=0.56）
    PUPIL_OFF_X:   0.14,   // 瞳孔偏位
    PUPIL_OFF_Y:   0.12,
    BLUSH_CX:      0.62,   // 腮红中心 X
    BLUSH_CY:      0.42,   // 腮红中心 Y（僵尸腮红略低）
    BLUSH_SIZE:    0.18,   // 腮红大小（僵尸更大=病态红晕）
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

    // 天空渐变
    const skyGrad = ctx.createLinearGradient(0, 0, 0, this.height);
    skyGrad.addColorStop(0, '#FFF0F5');
    skyGrad.addColorStop(0.5, '#FFD6E6');
    skyGrad.addColorStop(1, '#E7DCFF');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // 远山
    ctx.fillStyle = 'rgba(212, 197, 249, 0.55)';
    ctx.beginPath();
    ctx.moveTo(0, this.height * 0.4);
    ctx.quadraticCurveTo(this.width * 0.25, this.height * 0.25, this.width * 0.5, this.height * 0.4);
    ctx.quadraticCurveTo(this.width * 0.75, this.height * 0.55, this.width, this.height * 0.35);
    ctx.lineTo(this.width, this.height);
    ctx.lineTo(0, this.height);
    ctx.closePath();
    ctx.fill();

    // 草地渐变
    const grassGrad = ctx.createLinearGradient(0, this.height * 0.65, 0, this.height);
    grassGrad.addColorStop(0, '#D6F5E4');
    grassGrad.addColorStop(1, '#9FDEBD');
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
          ? 'rgba(255,255,255,0.18)'
          : 'rgba(124,179,66,0.10)';
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
    // 屋顶
    ctx.fillStyle = '#F48FB1';
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
    ctx.fillStyle = '#C7E9FF';
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
    // 天空渐变
    const skyGrad = ctx.createLinearGradient(0, 0, 0, this.height);
    skyGrad.addColorStop(0, '#FFF0F5');
    skyGrad.addColorStop(0.5, '#FFD6E6');
    skyGrad.addColorStop(1, '#E7DCFF');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, this.width, this.height);
    // 草地
    const grassGrad = ctx.createLinearGradient(0, this.height * 0.7, 0, this.height);
    grassGrad.addColorStop(0, '#D6F5E4');
    grassGrad.addColorStop(1, '#9FDEBD');
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

    ctx.save();
    ctx.translate(pos.x, pos.y + wobbleY);
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
    // v6 修复 (Task 12): 受击闪烁 + 死亡渐隐 — 跨文件耦合常量（zombieManager 同步）
    if (zombie.hitFlash > 0) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(zombie.hitFlash / ZOMBIE.HIT_FLASH_DIV);
    }
    // 死亡渐隐（duration 必须与 zombieManager L409 z.stateTimer > N 同步）
    if (zombie.state === 'dying') {
      ctx.globalAlpha = Math.max(0, 1 - zombie.stateTimer / ZOMBIE.DYING_DURATION_MS);
      const dyScale = 1 + zombie.stateTimer / ZOMBIE.DYING_DURATION_MS * 0.5;
      ctx.scale(dyScale, dyScale);
    }

    // 离屏图绘制
    const cacheKey = 'zombie_' + zombie.type;
    const cached = this.offscreenCache[cacheKey];
    if (cached) {
      const drawSize = r * 2.4;
      ctx.drawImage(cached, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    } else {
      // 兜底：实心圆
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
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
    if (zombie.maxHealth > 1 && zombie.state !== 'dying' && zombie.health < zombie.maxHealth) {
      const barW = r * 1.4;
      const barH = 6;
      const barY = -r * 1.4;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-barW / 2, barY, barW, barH);
      ctx.fillStyle = '#66BB6A';
      ctx.fillRect(-barW / 2, barY, barW * (zombie.health / zombie.maxHealth), barH);
    }

    // 减速光环（被寒冰射手命中）
    if (zombie.slowTimer > 0) {
      ctx.strokeStyle = 'rgba(79,195,247,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * 绘制植物（矢量萌系造型 + 血条 + 摇摆 + 受击闪烁）
   * 三种植物：豌豆射手 / 坚果墙 / 寒冰射手，统一萌系白描边风格，无背景圆盘
   */
  _drawPlant(ctx, plant) {
    const def = plant.def;
    if (!def) return;
    const cs = pathManager.getCellSize();
    const size = Math.min(cs.w, cs.h) * 0.78;
    const r = size * 0.42;            // 头部基准半径
    const wobbleX = Math.sin(plant.wobble) * 2;

    // 以 r 为基准设置动态描边
    const T = this.T;
    this._strokeW(1, r);
    const swMain = this._strokeW(T.STROKE.MAIN);

    ctx.save();
    ctx.translate(plant.x + wobbleX, plant.y);
    // v6 修复 (Task 12): 受击闪烁除数 — 跨文件耦合（plantManager L116 hitFlash = PLANT.HIT_FLASH_MS）
    if (plant.hitFlash > 0) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(plant.hitFlash / PLANT.HIT_FLASH_DIV);
    }
    // 地面阴影椭圆（统一 Tokens 比例）
    ctx.fillStyle = T.COLORS.SHADOW;
    ctx.beginPath();
    ctx.ellipse(0, r * T.SHADOW.Y, r * T.SHADOW.RX, r * T.SHADOW.RY, 0, 0, Math.PI * 2);
    ctx.fill();

    // 公共描边（与僵尸统一的萌系白描边，粗细按 r 动态计算）
    this._setStroke(ctx, T.COLORS.STROKE, swMain);

    // 按类型绘制植物造型（优先使用图片资源，降级为矢量绘制）
    // 食人花在咬合/吞咽状态下强制用矢量绘制，保证动画能被看到
    const iconImg = this.imageCache[def.iconPath];
    const forceVectorForChomper = def.isChomper &&
      (plant.chomperState === 'snap' || plant.chomperState === 'swallow' || plant.chomperBiteProgress > 0.05 || plant.chomperSwallowProgress > 0.05);
    if (iconImg && iconImg.width > 0 && !forceVectorForChomper) {
      const imgSize = size * 1.0;
      ctx.drawImage(iconImg, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
    } else {
      switch (def.type) {
        case 'shooter':    this._drawShooter(ctx, r, def, plant.wobble); break;
        case 'wall':       this._drawWall(ctx, r, def, plant.wobble); break;
        case 'freezer':    this._drawFreezer(ctx, r, def, plant.wobble); break;
        case 'cherry':     this._drawCherry(ctx, r, def, plant); break;
        case 'chomper':    this._drawChomper(ctx, r, def, plant); break;
        case 'sunflower':  this._drawSunflower(ctx, r, def, plant.wobble); break;
        case 'fire':       this._drawFire(ctx, r, def, plant.wobble); break;
        default:           this._drawWall(ctx, r, def, plant.wobble); break;
      }
    }

    // 血条（受伤时显示）
    if (plant.maxHealth > 1 && plant.health < plant.maxHealth) {
      const barW = size * 0.9;
      const barH = Math.max(4, 0.095 * r);
      const barY = -size * 0.62;
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-barW / 2, barY, barW, barH);
      ctx.fillStyle = '#66BB6A';
      ctx.fillRect(-barW / 2, barY, barW * (plant.health / plant.maxHealth), barH);
    }
    ctx.restore();
    // v6 修复 (Task 11 F15): 删除后置 globalAlpha=1（restore 已恢复 alpha）
  }

  /**
   * 萌系表情（设计系统 Tokens v2）：眨眼动画、爱心腮红、三种嘴型
   * 所有比例严格从 T.FACE 取，确保僵尸 ↔ 植物 ↔ shop-avatar 三方 1:1 一致
   */
  _drawCuteFace(ctx, r, cy, opts = {}) {
    const T = this.T;
    const F = T.FACE;
    const mouth       = opts.mouth       || 'smile';
    const wobblePhase = opts.wobblePhase || 0;
    const blushColor  = opts.blushColor  || T.COLORS.BLUSH_PINK;
    const inward      = opts.pupilInward === true;   // v24: 向内斜视（怒目）

    // 眼睛参数（1:1 Tokens）
    const eyeDX = r * F.EYE_DX_RATIO;
    const eyeR  = r * F.EYE_R_RATIO;
    const eyeY  = cy;
    // 眨眼：约 2.5s 一次，持续 120ms
    const blinkT = (Math.sin(wobblePhase) + 1) / 2;
    const blink  = blinkT > 0.94 ? (1 - (blinkT - 0.94) / 0.06) : 1;
    const eyeH   = Math.max(0.05, eyeR * blink);

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';

    // 眼白（睁眼椭圆 / 闭眼窄缝）
    ctx.fillStyle = T.COLORS.STROKE;
    ctx.beginPath();
    ctx.ellipse(-eyeDX, eyeY, eyeR * 0.96, eyeH, 0, 0, Math.PI * 2);
    ctx.ellipse( eyeDX, eyeY, eyeR * 0.96, eyeH, 0, 0, Math.PI * 2);
    ctx.fill();
    // 眼白描边
    this._setStroke(ctx, T.COLORS.STROKE, this._strokeW(T.STROKE.EYE));
    ctx.stroke();

    if (blink > 0.4) {
      // 瞳孔（偏右下无辜感，比例 Tokens 严格对齐）
      ctx.fillStyle = T.COLORS.INK;
      const pupilR = eyeR * F.PUPIL_R_RATIO * blink;
      const pOffX  = eyeR * F.PUPIL_OFF_X;
      const pOffY  = eyeR * F.PUPIL_OFF_Y;
      // v24: pupilInward → 左眼瞳孔向右偏 / 右眼瞳孔向左偏（向内怒视）；偏移量放大 1.6 倍增强斜视感
      const pOffX2 = eyeR * F.PUPIL_OFF_X * (inward ? 1.6 : 1);
      const pOffY2 = eyeR * F.PUPIL_OFF_Y * (inward ? 0.5 : 1);
      const pLX = -eyeDX + pOffX2;
      const pRX =  eyeDX + (inward ? -pOffX2 : pOffX2);
      ctx.beginPath();
      ctx.arc(pLX, eyeY + pOffY2, pupilR, 0, Math.PI * 2);
      ctx.arc(pRX, eyeY + pOffY2, pupilR, 0, Math.PI * 2);
      ctx.fill();
      // 双高光（灵动两颗）—— v24 跟随瞳孔中心位移
      ctx.fillStyle = T.COLORS.STROKE;
      ctx.beginPath();
      ctx.arc(pLX + eyeR * 0.05, eyeY - eyeR * 0.08, pupilR * F.PUPIL_SHINE1, 0, Math.PI * 2);
      ctx.arc(pRX + eyeR * 0.05, eyeY - eyeR * 0.08, pupilR * F.PUPIL_SHINE1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pLX + eyeR * 0.38, eyeY + eyeR * 0.26, pupilR * F.PUPIL_SHINE2, 0, Math.PI * 2);
      ctx.arc(pRX + eyeR * 0.38, eyeY + eyeR * 0.26, pupilR * F.PUPIL_SHINE2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 闭眼眯眯笑眼
      this._setStroke(ctx, T.COLORS.INK, this._strokeW(T.STROKE.INK));
      ctx.beginPath();
      ctx.arc(-eyeDX, eyeY + eyeR * 0.2, eyeR * 0.5, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc( eyeDX, eyeY + eyeR * 0.2, eyeR * 0.5, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    }

    // 腮红：v3 统一实心圆（小尺寸/物品栏不糊；之前的心形边缘复杂、识别度低）
    // 位置/大小仍然严格用 T.FACE Tokens
    ctx.fillStyle = blushColor;
    const blushCX = r * F.BLUSH_CX;
    const blushCY = cy + r * F.BLUSH_CY;
    const blushR  = r * F.BLUSH_SIZE * (T.SIMPLIFY.BLUSH_SHAPE === 'circle' ? 1.15 : 1.0);
    if (T.SIMPLIFY.BLUSH_SHAPE === 'circle') {
      // 平涂圆 + 内柔边（通过小半透明实现，无需贝塞尔，性能与清晰度兼顾）
      ctx.beginPath();
      ctx.arc(-blushCX, blushCY, blushR, 0, Math.PI * 2);
      ctx.arc( blushCX, blushCY, blushR, 0, Math.PI * 2);
      ctx.fill();
    } else {
      this._drawHeartShape(ctx, -blushCX, blushCY, r * F.BLUSH_SIZE);
      ctx.fill();
      this._drawHeartShape(ctx,  blushCX, blushCY, r * F.BLUSH_SIZE);
      ctx.fill();
    }

    // 嘴型（Y 位置统一 Tokens：cy + MOUTH_Y_OFFSET × r）
    const mouthY = cy + r * F.MOUTH_Y_OFFSET;
    if (mouth === 'o') {
      ctx.fillStyle = T.COLORS.MOUTH_PINK;
      ctx.beginPath();
      ctx.ellipse(0, mouthY, r * 0.13, r * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      this._setStroke(ctx, T.COLORS.STROKE, this._strokeW(T.STROKE.LIP));
      ctx.stroke();
      ctx.fillStyle = T.COLORS.MOUTH_LIP;
      ctx.beginPath();
      ctx.ellipse(0, mouthY + r * 0.06, r * 0.06, r * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (mouth === 'grin') {
      ctx.fillStyle = T.COLORS.MOUTH_PINK;
      ctx.beginPath();
      ctx.arc(0, mouthY - r * 0.02, r * 0.28, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.lineTo(r * 0.22, mouthY - r * 0.02);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = T.COLORS.STROKE;  // 白牙齿
      safeRoundRect(ctx, -r * 0.15, mouthY - r * 0.02, r * 0.3, r * 0.1, r * 0.03);
      ctx.fill();
      // v6 修复 (Task 11 F16): 删除白色 stroke 白色 fill 的无效描边（stroke 不可见）
    } else if (mouth === 'flat') {
      // 抿嘴直线（坚果墙严肃/坚定感）
      this._setStroke(ctx, T.COLORS.INK, this._strokeW(T.STROKE.INK));
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.18, mouthY - r * 0.05);
      ctx.lineTo( r * 0.18, mouthY - r * 0.05);
      ctx.stroke();
    } else if (mouth === 'pout') {
      // v24 撇嘴倒拱（樱桃愤怒：两端下垂、中间拱起，紧闭不悦）
      this._setStroke(ctx, T.COLORS.INK, this._strokeW(T.STROKE.INK));
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.17, mouthY + r * 0.045);
      ctx.quadraticCurveTo(0, mouthY - r * 0.075, r * 0.17, mouthY + r * 0.045);
      ctx.stroke();
    } else if (mouth === 'none') {
      // v25: 不画嘴（食人花嘴部让给大嘴结构本体绘制）
    } else {
      // 微笑弧线
      this._setStroke(ctx, T.COLORS.INK, this._strokeW(T.STROKE.INK));
      ctx.beginPath();
      ctx.arc(0, mouthY - r * 0.15, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * 豌豆射手（v17 参照附件图重新优化）：
   * - 头顶待发射豌豆 → 水滴形嫩叶（更接近原版PvZ设计）
   * - 嘴部两层椭圆 → 右上斜戴帽式短炮管（v34：-40° 朝右上，缩短，帽檐感）
   * - 新增半球形底座 + 纵向棱线（瓜类纹理，增强体积感）
   * - 头部改用径向渐变（左上亮绿→右下深绿，立体感）
   * - 茎加环形纹理（植物节）；侧叶改尖卵贝塞尔（更生动）
   * - 表情嘴改为 smile 微笑（嘴部位置让给炮管）
   */
  _drawShooter(ctx, r, def, wobblePhase) {
    const T = this.T;
    const C = T.COLORS;
    const H = T.HEAD;
    const headR = r * 1.0;
    const headY = -r * 0.25;

    // ---- 1. 半球形身体底座（带纵向棱线，瓜类纹理）----
    const bodyY = r * 0.62;
    const bodyRX = r * 0.85;
    const bodyRY = r * 0.50;
    const bodyGrad = ctx.createRadialGradient(
      -bodyRX * 0.3, bodyY - bodyRY * 0.5, 0,
      0, bodyY, bodyRX * 1.1
    );
    bodyGrad.addColorStop(0, C.S_LEAF_LIGHT);
    bodyGrad.addColorStop(0.55, C.S_STEM);
    bodyGrad.addColorStop(1, '#558B2F');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, bodyY, bodyRX, bodyRY, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 纵向棱线（裁剪到底座内部）
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, bodyY, bodyRX, bodyRY, 0, 0, Math.PI * 2);
    ctx.clip();
    this._setStroke(ctx, 'rgba(85,107,47,0.55)', this._strokeW(T.STROKE.THIN));
    for (let i = -2; i <= 2; i++) {
      const x = bodyRX * i * 0.32;
      ctx.beginPath();
      ctx.moveTo(x, bodyY - bodyRY * 0.95);
      ctx.quadraticCurveTo(x * 1.15, bodyY, x, bodyY + bodyRY * 0.85);
      ctx.stroke();
    }
    ctx.restore();

    // ---- 2. 两侧大叶子（尖卵形贝塞尔，作为"手臂"装饰）----
    ctx.fillStyle = C.S_LEAF_DARK;
    ctx.beginPath();
    ctx.moveTo(-r * 0.35, bodyY - r * 0.05);
    ctx.bezierCurveTo(-r * 1.15, bodyY - r * 0.18, -r * 1.20, bodyY + r * 0.25, -r * 0.95, bodyY + r * 0.32);
    ctx.bezierCurveTo(-r * 0.65, bodyY + r * 0.36, -r * 0.45, bodyY + r * 0.20, -r * 0.35, bodyY - r * 0.05);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 左叶脉
    this._setStroke(ctx, 'rgba(85,107,47,0.55)', this._strokeW(T.STROKE.THIN));
    ctx.beginPath();
    ctx.moveTo(-r * 0.35, bodyY - r * 0.05);
    ctx.quadraticCurveTo(-r * 0.78, bodyY + r * 0.10, -r * 1.05, bodyY + r * 0.25);
    ctx.stroke();
    this._setStroke(ctx, C.STROKE, this._strokeW(T.STROKE.MAIN));   // v22 修复：恢复主描边（右叶曾被左叶脉细绿描边污染）
    ctx.fillStyle = T.SIMPLIFY.LEAF_TIERS >= 2 ? C.S_LEAF_MID : C.S_LEAF_DARK;
    ctx.beginPath();
    ctx.moveTo( r * 0.35, bodyY - r * 0.05);
    ctx.bezierCurveTo( r * 1.15, bodyY - r * 0.18,  r * 1.20, bodyY + r * 0.25,  r * 0.95, bodyY + r * 0.32);
    ctx.bezierCurveTo( r * 0.65, bodyY + r * 0.36,  r * 0.45, bodyY + r * 0.20,  r * 0.35, bodyY - r * 0.05);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 右叶脉
    this._setStroke(ctx, 'rgba(85,107,47,0.55)', this._strokeW(T.STROKE.THIN));
    ctx.beginPath();
    ctx.moveTo( r * 0.35, bodyY - r * 0.05);
    ctx.quadraticCurveTo( r * 0.78, bodyY + r * 0.10,  r * 1.05, bodyY + r * 0.25);
    ctx.stroke();

    // ---- 3. 短粗圆柱茎 + 环形纹理（植物节）----
    this._setStroke(ctx, C.STROKE, this._strokeW(T.STROKE.MAIN));   // v22 修复：恢复主描边
    ctx.fillStyle = C.S_STEM;
    safeRoundRect(ctx, -r * 0.18, headY + headR * 0.55, r * 0.36, r * 0.40, r * 0.13);
    ctx.fill(); ctx.stroke();
    this._setStroke(ctx, 'rgba(85,107,47,0.55)', this._strokeW(T.STROKE.THIN));
    for (let i = 0; i < 2; i++) {
      const y = headY + headR * 0.65 + i * r * 0.16;
      ctx.beginPath();
      ctx.moveTo(-r * 0.16, y);
      ctx.quadraticCurveTo(0, y - r * 0.04, r * 0.16, y);
      ctx.stroke();
    }

    // ---- 4. 头部（径向渐变，左上亮绿→右下深绿）----
    const headGrad = ctx.createRadialGradient(
      -headR * 0.35, headY - headR * 0.35, 0,
      0, headY, headR * 1.1
    );
    headGrad.addColorStop(0, C.S_LEAF_LIGHT);
    headGrad.addColorStop(0.55, def.color);
    headGrad.addColorStop(1, '#558B2F');
    this._setStroke(ctx, C.STROKE, this._strokeW(T.STROKE.MAIN));   // v22 修复：恢复主描边
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(0, headY, headR * 1.0, headR * 0.95, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // ---- 5. 左上月牙高光 ----
    ctx.fillStyle = 'rgba(255,255,255,' + H.HLIGHT_ALPHA + ')';
    ctx.beginPath();
    ctx.ellipse(headR * H.HLIGHT_X, headY + headR * H.HLIGHT_Y,
                headR * H.HLIGHT_W, headR * H.HLIGHT_H,
                H.HLIGHT_ROT, 0, Math.PI * 2);
    ctx.fill();

    // ---- 6. 右上斜戴帽式炮管（v34：安装点上移至头右上，-40° 朝右上，缩短 36%）----
    const cannonX = headR * 0.55;
    const cannonY = headY - headR * 0.50;
    const cannonLen = headR * 0.50;
    const cannonR = headR * 0.28;
    ctx.save();
    ctx.translate(cannonX, cannonY);
    ctx.rotate(-0.70);                        // v34 斜帽：炮口指向右上（贴合垂直向上弹道）
    // 外管（线性渐变，旋转后左上亮右下暗，圆柱立体感）
    const cannonGrad = ctx.createLinearGradient(0, -cannonR, 0, cannonR);
    cannonGrad.addColorStop(0, C.S_LEAF_LIGHT);
    cannonGrad.addColorStop(0.45, C.S_STEM);
    cannonGrad.addColorStop(1, '#558B2F');
    ctx.fillStyle = cannonGrad;
    safeRoundRect(ctx, 0, -cannonR, cannonLen, cannonR * 2, cannonR * 0.45);
    ctx.fill(); ctx.stroke();
    // 管口外圈（深绿环，强调开口）
    ctx.fillStyle = C.S_MOUTH_OUT;
    ctx.beginPath();
    ctx.ellipse(cannonLen, 0, cannonR * 0.42, cannonR * 0.92, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 管口内黑（深墨绿，发射腔）
    ctx.fillStyle = C.S_MOUTH_IN;
    ctx.beginPath();
    ctx.ellipse(cannonLen, 0, cannonR * 0.28, cannonR * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ---- 7. 头顶水滴形嫩叶（替代原"待发射豌豆"，更接近PvZ原版）----
    ctx.save();
    ctx.translate(0, headY - headR * 0.92);
    ctx.rotate(-0.35);
    this._setStroke(ctx, C.STROKE, this._strokeW(T.STROKE.MAIN));   // v22 修复：恢复主描边
    ctx.fillStyle = C.S_LEAF_DARK;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-headR * 0.18, -headR * 0.18, -headR * 0.08, -headR * 0.48, 0, -headR * 0.60);
    ctx.bezierCurveTo(headR * 0.08, -headR * 0.48, headR * 0.18, -headR * 0.18, 0, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 叶脉
    this._setStroke(ctx, 'rgba(85,107,47,0.55)', this._strokeW(T.STROKE.THIN));
    ctx.beginPath();
    ctx.moveTo(0, -headR * 0.04);
    ctx.lineTo(0, -headR * 0.54);
    ctx.stroke();
    ctx.restore();

    // ---- 8. 表情：smile 微笑（嘴部位置让给炮管，保留眼+腮红+微笑弧）----
    this._drawCuteFace(ctx, headR, headY + headR * H.SHOOTER_EYE_Y, {
      mouth: 'smile', wobblePhase: wobblePhase
    });
  }

  /**
   * 火焰射手（Fire v25 按系列风格标准重绘）：
   * - 焦橙半球底座 + 纵向棱线（豌豆射手 v17 同款结构，焦土色系）
   * - 焦土色尖卵双叶（左深右浅 + 深棕叶脉）+ 焦糖渐变粗茎 + 环形植物节
   * - 橙红径向渐变头部（亮 #FFE0B2 / 基 #FF6E40 / 暗 #D84315）+ 表皮余烬斑点
   * - 右上斜戴帽式炮管（v34：-40° 朝右上 + 安装座环 + 深红管口 + 管口三层火苗）
   * - 头顶两团尖角火苗冠（左小右大反相摆动，"燃烧的头发"）
   * - 凶萌表情：倒八字眉 + 向内斜视怒目 + grin 坏笑 + 暖橙腮红
   */
  _drawFire(ctx, r, def, wobblePhase) {
    const T = this.T;
    const C = T.COLORS;
    const H = T.HEAD;
    const F = T.FACE;
    const headR = r * 1.0;
    const headY = -r * 0.25;
    const sway = Math.sin(wobblePhase * 2.0) * headR * 0.05;

    // ---- 1. 焦橙半球底座（径向渐变 + 纵向棱线）----
    const bodyY = r * 0.62;
    const bodyRX = r * 0.85;
    const bodyRY = r * 0.50;
    const bodyGrad = ctx.createRadialGradient(
      -bodyRX * 0.3, bodyY - bodyRY * 0.5, 0,
      0, bodyY, bodyRX * 1.1
    );
    bodyGrad.addColorStop(0, '#FFCCBC');
    bodyGrad.addColorStop(0.55, '#FF7043');
    bodyGrad.addColorStop(1, C.FR_HEAD_DARK);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, bodyY, bodyRX, bodyRY, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, bodyY, bodyRX, bodyRY, 0, 0, Math.PI * 2);
    ctx.clip();
    this._setStroke(ctx, 'rgba(216,67,21,0.45)', this._strokeW(T.STROKE.THIN));
    for (let i = -2; i <= 2; i++) {
      const x = bodyRX * i * 0.32;
      ctx.beginPath();
      ctx.moveTo(x, bodyY - bodyRY * 0.95);
      ctx.quadraticCurveTo(x * 1.15, bodyY, x, bodyY + bodyRY * 0.85);
      ctx.stroke();
    }
    ctx.restore();

    // ---- 2. 焦土色尖卵双叶（左深右浅 + 深棕叶脉）----
    ctx.fillStyle = C.FIRE_LEAF_DARK;
    ctx.beginPath();
    ctx.moveTo(-r * 0.35, bodyY - r * 0.05);
    ctx.bezierCurveTo(-r * 1.15, bodyY - r * 0.18, -r * 1.20, bodyY + r * 0.25, -r * 0.95, bodyY + r * 0.32);
    ctx.bezierCurveTo(-r * 0.65, bodyY + r * 0.36, -r * 0.45, bodyY + r * 0.20, -r * 0.35, bodyY - r * 0.05);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    this._setStroke(ctx, 'rgba(62,39,23,0.45)', this._strokeW(T.STROKE.THIN));
    ctx.beginPath();
    ctx.moveTo(-r * 0.35, bodyY - r * 0.05);
    ctx.quadraticCurveTo(-r * 0.78, bodyY + r * 0.10, -r * 1.05, bodyY + r * 0.25);
    ctx.stroke();
    this._setStroke(ctx, C.STROKE, this._strokeW(T.STROKE.MAIN));
    ctx.fillStyle = T.SIMPLIFY.LEAF_TIERS >= 2 ? C.FIRE_LEAF_MID : C.FIRE_LEAF_DARK;
    ctx.beginPath();
    ctx.moveTo( r * 0.35, bodyY - r * 0.05);
    ctx.bezierCurveTo( r * 1.15, bodyY - r * 0.18,  r * 1.20, bodyY + r * 0.25,  r * 0.95, bodyY + r * 0.32);
    ctx.bezierCurveTo( r * 0.65, bodyY + r * 0.36,  r * 0.45, bodyY + r * 0.20,  r * 0.35, bodyY - r * 0.05);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    this._setStroke(ctx, 'rgba(62,39,23,0.45)', this._strokeW(T.STROKE.THIN));
    ctx.beginPath();
    ctx.moveTo( r * 0.35, bodyY - r * 0.05);
    ctx.quadraticCurveTo( r * 0.78, bodyY + r * 0.10,  r * 1.05, bodyY + r * 0.25);
    ctx.stroke();

    // ---- 3. 焦糖渐变粗茎 + 环形植物节 ----
    this._setStroke(ctx, C.STROKE, this._strokeW(T.STROKE.MAIN));
    const stemGrad = ctx.createLinearGradient(-r * 0.17, 0, r * 0.17, 0);
    stemGrad.addColorStop(0, '#8D6E63');
    stemGrad.addColorStop(0.5, C.FIRE_STEM);
    stemGrad.addColorStop(1, '#3E2723');
    ctx.fillStyle = stemGrad;
    safeRoundRect(ctx, -r * 0.17, headY + headR * 0.52, r * 0.34, r * 0.42, r * 0.13);
    ctx.fill(); ctx.stroke();
    this._setStroke(ctx, 'rgba(62,39,23,0.45)', this._strokeW(T.STROKE.THIN));
    for (let i = 0; i < 2; i++) {
      const y = headY + headR * 0.62 + i * r * 0.15;
      ctx.beginPath();
      ctx.moveTo(-r * 0.15, y);
      ctx.quadraticCurveTo(0, y - r * 0.04, r * 0.15, y);
      ctx.stroke();
    }

    // ---- 4. 头部：橙红径向渐变球 + 余烬斑点 ----
    this._setStroke(ctx, C.STROKE, this._strokeW(T.STROKE.MAIN));
    const headGrad = ctx.createRadialGradient(
      -headR * 0.35, headY - headR * 0.35, 0,
      0, headY, headR * 1.15
    );
    headGrad.addColorStop(0, C.FR_HEAD_LIGHT);
    headGrad.addColorStop(0.55, def.color);
    headGrad.addColorStop(1, C.FR_HEAD_DARK);
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(0, headY, headR * 1.0, headR * 0.95, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 表皮余烬斑点（深橙，clip 头内、避让脸中带）
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, headY, headR * 1.0, headR * 0.95, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = C.FIRE_BODY_DARK;
    const embers = [
      [-headR * 0.52, headY - headR * 0.40, headR * 0.11],
      [ headR * 0.44, headY - headR * 0.48, headR * 0.09],
      [ headR * 0.62, headY + headR * 0.16, headR * 0.10]
    ];
    embers.forEach(([ex, ey, er]) => {
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // ---- 5. 左上月牙高光（暖光 +10% alpha）----
    ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.55, H.HLIGHT_ALPHA + 0.1) + ')';
    ctx.beginPath();
    ctx.ellipse(headR * H.HLIGHT_X, headY + headR * H.HLIGHT_Y,
                headR * H.HLIGHT_W, headR * H.HLIGHT_H,
                H.HLIGHT_ROT, 0, Math.PI * 2);
    ctx.fill();

    // ---- 6. 右上斜戴帽式炮管 + 管口三层火苗（v34：-40° 朝右上，缩短 33%）----
    const cannonX = headR * 0.52;
    const cannonY = headY - headR * 0.50;
    const cannonLen = headR * 0.48;
    const cannonR = headR * 0.30;
    ctx.save();
    ctx.translate(cannonX, cannonY);
    ctx.rotate(-0.70);                        // v34 斜帽：炮口指向右上
    this._setStroke(ctx, C.STROKE, this._strokeW(T.STROKE.MAIN));
    // 安装座环（炮管与头部圆润衔接）
    ctx.fillStyle = C.FIRE_FLAME;
    ctx.beginPath();
    ctx.ellipse(cannonR * 0.10, 0, cannonR * 0.28, cannonR * 0.98, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 外管（线性渐变，上亮下暗圆柱立体感）
    const cannonGrad = ctx.createLinearGradient(0, -cannonR, 0, cannonR);
    cannonGrad.addColorStop(0, '#FFCC80');
    cannonGrad.addColorStop(0.45, '#FF7043');
    cannonGrad.addColorStop(1, C.FR_HEAD_DARK);
    ctx.fillStyle = cannonGrad;
    safeRoundRect(ctx, 0, -cannonR, cannonLen, cannonR * 2, cannonR * 0.42);
    ctx.fill(); ctx.stroke();
    // 管口外环（深红，强调开口）
    ctx.fillStyle = C.FR_CANNON_RIM;
    ctx.beginPath();
    ctx.ellipse(cannonLen, 0, cannonR * 0.44, cannonR * 0.92, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 管口内腔（近黑红，发射通道）
    ctx.fillStyle = C.FR_CANNON_IN;
    ctx.beginPath();
    ctx.ellipse(cannonLen, 0, cannonR * 0.28, cannonR * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 管口三层火苗（v34 随炮口旋至右上；与 _drawProjectile 火焰弹完全同色系；sway 呼吸摆动）
    const muzzleDist = cannonLen + cannonR * 0.55;
    this._drawFlame(ctx,
      cannonX + Math.cos(-0.70) * muzzleDist,
      cannonY + Math.sin(-0.70) * muzzleDist,
      headR * 0.26, headR * 0.38, sway * 0.8);

    // ---- 7. 头顶两团尖角火苗冠（左小右大，反相位摆动）----
    this._drawFlame(ctx, -headR * 0.28, headY - headR * 0.80, headR * 0.26, headR * 0.46, -sway * 0.6);
    this._drawFlame(ctx,  headR * 0.24, headY - headR * 0.84, headR * 0.34, headR * 0.62,  sway);

    // ---- 8. 凶萌表情：倒八字眉 + 斜视怒目 + grin 坏笑 + 暖橙腮红 ----
    const eyeCY = headY + headR * H.SHOOTER_EYE_Y;
    this._drawCuteFace(ctx, headR, eyeCY, {
      mouth: 'grin', wobblePhase: wobblePhase, pupilInward: true,
      blushColor: 'rgba(255,112,67,0.45)'
    });
    const eyeDXb = headR * F.EYE_DX_RATIO;
    const eyeRb = headR * F.EYE_R_RATIO;
    const browY = eyeCY - eyeRb * 1.42;
    this._setStroke(ctx, C.FR_BROW, this._strokeW(T.STROKE.INK) * 1.9);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-eyeDXb - eyeRb * 0.75, browY + eyeRb * 0.55);
    ctx.quadraticCurveTo(-eyeDXb - eyeRb * 0.10, browY + eyeRb * 0.05, -eyeDXb + eyeRb * 0.75, browY - eyeRb * 0.65);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(eyeDXb - eyeRb * 0.75, browY - eyeRb * 0.65);
    ctx.quadraticCurveTo(eyeDXb + eyeRb * 0.10, browY + eyeRb * 0.05, eyeDXb + eyeRb * 0.75, browY + eyeRb * 0.55);
    ctx.stroke();
  }

  /**
   * 尖角火苗路径（v25）：底宽顶尖 + 右肩内卷，以 (0,0) 为底部中心（只建路径，不 fill/stroke）
   */
  _drawFlameShape(ctx, w, h) {
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, 0);
    ctx.bezierCurveTo(-w * 0.52, -h * 0.32, -w * 0.30, -h * 0.55, -w * 0.14, -h * 0.82);
    ctx.quadraticCurveTo(-w * 0.03, -h * 0.96, 0, -h);
    ctx.quadraticCurveTo(w * 0.08, -h * 0.82, w * 0.20, -h * 0.68);
    ctx.bezierCurveTo(w * 0.44, -h * 0.48, w * 0.52, -h * 0.28, w * 0.5, 0);
    ctx.closePath();
  }

  /**
   * 三层火苗（v25）：外深橙红 / 中橙 / 内亮黄（与 _drawProjectile 火焰弹完全同色）
   * 管口火苗、头顶火苗冠共用；sway 控制摆动方向与幅度
   */
  _drawFlame(ctx, cx, cy, w, h, sway) {
    const C = this.T.COLORS;
    const layers = [
      [C.FIRE_BODY_DARK, w, h, sway],
      [C.FIRE_FLAME,     w * 0.70, h * 0.70, sway * 0.55],
      [C.FIRE_CORE,      w * 0.40, h * 0.42, sway * 0.30]
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
   * 坚果墙（v20 参照附件图重新优化）：
   * - 圆头平涂 → 倒水滴形/心形主体（上宽下窄，顶部稍尖）
   * - 平涂 #A1887F → 暖棕色径向渐变（亮 #E89B4D / 基 #B85A18 / 暗 #6E3510）
   * - 横向壳纹 → 纵向弧线纹理（核桃外壳沟壑，从顶向下延伸）
   * - 绿色椭圆嫩芽 → 深褐三角突起（顶部尖角感）
   * - 新增粗黑倒八字眉（坚果墙核心特征：怒目坚定表情）
   * - 左上高光月牙保留；底部投影由 _drawPlant 统一绘制
   */
  _drawWall(ctx, r, def, wobblePhase) {
    const T = this.T;
    const C = T.COLORS;
    const H = T.HEAD;
    const F = T.FACE;
    const headR = r * 1.02;
    const headY = r * 0.02;

    // ---- 1. 顶部深褐三角突起（替代原绿色椭圆嫩芽，附件图核心特征）----
    ctx.fillStyle = '#5D4037';
    ctx.beginPath();
    ctx.moveTo(0, headY - headR * 1.05);
    ctx.quadraticCurveTo(headR * 0.13, headY - headR * 1.22, 0, headY - headR * 1.42);
    ctx.quadraticCurveTo(-headR * 0.13, headY - headR * 1.22, 0, headY - headR * 1.05);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // ---- 2. 倒水滴形主体（上宽下窄，附件图核心特征）----
    ctx.beginPath();
    // 左肩→顶部弧
    ctx.moveTo(-headR * 1.0, headY - headR * 0.35);
    ctx.bezierCurveTo(
      -headR * 1.10, headY - headR * 0.95,
      -headR * 0.70, headY - headR * 1.22,
      0, headY - headR * 1.22
    );
    // 顶部→右肩弧
    ctx.bezierCurveTo(
      headR * 0.70, headY - headR * 1.22,
      headR * 1.10, headY - headR * 0.95,
      headR * 1.0, headY - headR * 0.35
    );
    // 右肩→底部尖
    ctx.bezierCurveTo(
      headR * 1.05, headY + headR * 0.45,
      headR * 0.72, headY + headR * 1.08,
      0, headY + headR * 1.12
    );
    // 底部尖→左肩
    ctx.bezierCurveTo(
      -headR * 0.72, headY + headR * 1.08,
      -headR * 1.05, headY + headR * 0.45,
      -headR * 1.0, headY - headR * 0.35
    );
    ctx.closePath();

    // 径向渐变填充（左上亮→右下暗，立体感）
    const wallGrad = ctx.createRadialGradient(
      -headR * 0.35, headY - headR * 0.40, 0,
      0, headY, headR * 1.30
    );
    wallGrad.addColorStop(0, '#E89B4D');
    wallGrad.addColorStop(0.55, '#B85A18');
    wallGrad.addColorStop(1, '#6E3510');
    ctx.fillStyle = wallGrad;
    ctx.fill(); ctx.stroke();

    // ---- 3. 纵向弧线纹理（5 条，从顶部向下延伸，模拟核桃外壳沟壑）----
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, headY, headR * 0.98, headR * 1.10, 0, 0, Math.PI * 2);
    ctx.clip();
    this._setStroke(ctx, 'rgba(62,31,10,0.45)', this._strokeW(T.STROKE.THIN));
    ctx.lineCap = 'round';
    for (let i = -2; i <= 2; i++) {
      const x = headR * i * 0.32;
      ctx.beginPath();
      ctx.moveTo(x, headY - headR * 1.10);
      ctx.quadraticCurveTo(x * 1.18, headY, x, headY + headR * 1.10);
      ctx.stroke();
    }
    ctx.restore();

    // ---- 4. 左上高光月牙 ----
    ctx.fillStyle = 'rgba(255,255,255,' + H.HLIGHT_ALPHA + ')';
    ctx.beginPath();
    ctx.ellipse(headR * H.HLIGHT_X, headY + headR * H.HLIGHT_Y,
                headR * (H.HLIGHT_W + 0.04), headR * (H.HLIGHT_H + 0.04),
                H.HLIGHT_ROT, 0, Math.PI * 2);
    ctx.fill();

    // ---- 5. 粗黑倒八字眉（坚果墙核心特征：怒目坚定）----
    // 倒八字方向：左眉内侧（右端）高、外侧（左端）低（/形）；右眉内侧（左端）高、外侧（右端）低（\形）
    const eyeDX = headR * F.EYE_DX_RATIO;
    const eyeY  = headY + headR * H.WALL_EYE_Y;
    const eyeR  = headR * F.EYE_R_RATIO;
    const browY = eyeY - eyeR * 1.40;
    this._setStroke(ctx, '#3E1F0A', this._strokeW(T.STROKE.INK) * 1.9);
    ctx.lineCap = 'round';
    // 左眉（/）：外侧低 → 内侧高
    ctx.beginPath();
    ctx.moveTo(-eyeDX - eyeR * 0.75, browY + eyeR * 0.55);
    ctx.quadraticCurveTo(-eyeDX - eyeR * 0.10, browY + eyeR * 0.05, -eyeDX + eyeR * 0.75, browY - eyeR * 0.65);
    ctx.stroke();
    // 右眉（\）：内侧高 → 外侧低
    ctx.beginPath();
    ctx.moveTo(eyeDX - eyeR * 0.75, browY - eyeR * 0.65);
    ctx.quadraticCurveTo(eyeDX + eyeR * 0.10, browY + eyeR * 0.05, eyeDX + eyeR * 0.75, browY + eyeR * 0.55);
    ctx.stroke();

    // ---- 6. 表情（眼+抿嘴直线；v20 去掉腮红 + mouth='flat' 严肃嘴型，与怒眉协调）----
    this._drawCuteFace(ctx, headR, headY + headR * H.WALL_EYE_Y, {
      mouth: 'flat', wobblePhase: wobblePhase, blushColor: 'rgba(0,0,0,0)'  // 透明腮红
    });
  }

  /**
   * 寒冰射手 v22（参照附件 plant_freezer.png 重新设计）：
   * 薄荷青宝石头（上宽下窄+顶部小尖+冰壳内环+霜点）+ 右上斜戴帽式冰晶炮管
   * （v34：-40° 朝右上+安装座环+深青发射腔+管口冰雾随管朝右上喷）+ 头顶三叉冰晶簇
   * + 四片鲜绿底座叶（后2大+前2小）+ 冷酷表情（半垂眼睑+抿嘴+冰蓝腮红）
   */
  _drawFreezer(ctx, r, def, wobblePhase) {
    const T = this.T;
    const C = T.COLORS;
    const H = T.HEAD;
    const headR = r * 1.0;
    const headY = -r * 0.25;
    const swMain = this._strokeW(T.STROKE.MAIN);

    // ---- 1. 四片鲜绿底座叶（后 2 大侧叶 + 前 2 小内叶，双层结构参照附件）----
    const leafY = r * 0.58;
    ctx.fillStyle = C.F_LEAF_DARK;
    ctx.beginPath();
    ctx.moveTo(-r * 0.30, leafY - r * 0.02);
    ctx.bezierCurveTo(-r * 1.02, leafY - r * 0.14, -r * 1.06, leafY + r * 0.26, -r * 0.84, leafY + r * 0.32);
    ctx.bezierCurveTo(-r * 0.58, leafY + r * 0.36, -r * 0.40, leafY + r * 0.20, -r * 0.30, leafY - r * 0.02);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo( r * 0.30, leafY - r * 0.02);
    ctx.bezierCurveTo( r * 1.02, leafY - r * 0.14,  r * 1.06, leafY + r * 0.26,  r * 0.84, leafY + r * 0.32);
    ctx.bezierCurveTo( r * 0.58, leafY + r * 0.36,  r * 0.40, leafY + r * 0.20,  r * 0.30, leafY - r * 0.02);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 前层 2 小内叶（更浅绿，向前包裹茎部）
    ctx.fillStyle = C.F_LEAF_MID;
    ctx.beginPath();
    ctx.moveTo(-r * 0.12, leafY + r * 0.10);
    ctx.bezierCurveTo(-r * 0.52, leafY + r * 0.06, -r * 0.60, leafY + r * 0.34, -r * 0.40, leafY + r * 0.42);
    ctx.bezierCurveTo(-r * 0.24, leafY + r * 0.44, -r * 0.16, leafY + r * 0.30, -r * 0.12, leafY + r * 0.10);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo( r * 0.12, leafY + r * 0.10);
    ctx.bezierCurveTo( r * 0.52, leafY + r * 0.06,  r * 0.60, leafY + r * 0.34,  r * 0.40, leafY + r * 0.42);
    ctx.bezierCurveTo( r * 0.24, leafY + r * 0.44,  r * 0.16, leafY + r * 0.30,  r * 0.12, leafY + r * 0.10);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // ---- 2. 短粗圆柱茎 + 环形纹理（鲜绿）----
    this._setStroke(ctx, C.STROKE, swMain);
    ctx.fillStyle = C.F_STEM;
    ctx.beginPath();
    safeRoundRect(ctx, -r * 0.17, headY + headR * 0.52, r * 0.34, r * 0.42, r * 0.12);
    ctx.fill(); ctx.stroke();
    this._setStroke(ctx, 'rgba(46,125,50,0.55)', this._strokeW(T.STROKE.THIN));
    for (let i = 0; i < 2; i++) {
      const y = headY + headR * 0.62 + i * r * 0.15;
      ctx.beginPath();
      ctx.moveTo(-r * 0.15, y);
      ctx.quadraticCurveTo(0, y - r * 0.04, r * 0.15, y);
      ctx.stroke();
    }

    // ---- 3. 头部：宝石形（上宽下窄 + 顶部中央小尖，薄荷青径向渐变）----
    const headPath = () => {
      ctx.beginPath();
      ctx.moveTo(0, headY - headR * 1.06);
      ctx.bezierCurveTo(-headR * 0.58, headY - headR * 1.02,
                        -headR * 0.94, headY - headR * 0.66,
                        -headR * 0.92, headY - headR * 0.16);
      ctx.bezierCurveTo(-headR * 0.90, headY + headR * 0.52,
                        -headR * 0.52, headY + headR * 0.92,
                         0,        headY + headR * 0.94);
      ctx.bezierCurveTo( headR * 0.52, headY + headR * 0.92,
                         headR * 0.90, headY + headR * 0.52,
                         headR * 0.92, headY - headR * 0.16);
      ctx.bezierCurveTo( headR * 0.94, headY - headR * 0.66,
                         headR * 0.58, headY - headR * 1.02,
                         0,        headY - headR * 1.06);
      ctx.closePath();
    };
    const headGrad = ctx.createRadialGradient(
      -headR * 0.35, headY - headR * 0.35, 0,
      0, headY, headR * 1.15
    );
    headGrad.addColorStop(0, C.F_HEAD_LIGHT);
    headGrad.addColorStop(0.55, def.color);
    headGrad.addColorStop(1, C.F_HEAD_DARK);
    this._setStroke(ctx, C.STROKE, swMain);
    ctx.fillStyle = headGrad;
    headPath();
    ctx.fill(); ctx.stroke();
    // 冰壳内环（半透明白描边内缩一圈，冰层厚度感）+ 冰霜小白点（clip 在头内）
    ctx.save();
    headPath();
    ctx.clip();
    this._setStroke(ctx, 'rgba(255,255,255,0.38)', this._strokeW(T.STROKE.THIN) * 1.6);
    headPath();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(-headR * 0.46, headY + headR * 0.02, headR * 0.05, 0, Math.PI * 2);
    ctx.arc( headR * 0.30, headY - headR * 0.44, headR * 0.04, 0, Math.PI * 2);
    ctx.arc( headR * 0.12, headY + headR * 0.34, headR * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ---- 4. 左上月牙高光（冰面反光，比植物通用 +10% alpha）----
    ctx.fillStyle = 'rgba(255,255,255,' + Math.min(.55, H.HLIGHT_ALPHA + 0.1) + ')';
    ctx.beginPath();
    ctx.ellipse(headR * H.HLIGHT_X, headY + headR * H.HLIGHT_Y,
                headR * H.HLIGHT_W, headR * H.HLIGHT_H,
                H.HLIGHT_ROT, 0, Math.PI * 2);
    ctx.fill();

    // ---- 5. 右上斜戴帽式炮管（v34：安装座环 + 冰晶材质 + 管口冰雾；-40° 朝右上）----
    const cannonX = headR * 0.50;
    const cannonY = headY - headR * 0.50;
    const cannonLen = headR * 0.48;
    const cannonR = headR * 0.31;
    ctx.save();
    ctx.translate(cannonX, cannonY);
    ctx.rotate(-0.70);                        // v34 斜帽：炮口指向右上，冰雾随之朝右上喷
    this._setStroke(ctx, C.STROKE, swMain);
    // 安装座环（炮管与头部圆润衔接，避免直角贴片感）
    ctx.fillStyle = '#3FBFB2';
    ctx.beginPath();
    ctx.ellipse(cannonR * 0.10, 0, cannonR * 0.26, cannonR * 0.98, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 外管（线性渐变，上亮下暗，圆柱立体感）
    const cannonGrad = ctx.createLinearGradient(0, -cannonR, 0, cannonR);
    cannonGrad.addColorStop(0, C.F_HEAD_LIGHT);
    cannonGrad.addColorStop(0.45, def.color);
    cannonGrad.addColorStop(1, C.F_HEAD_DARK);
    ctx.fillStyle = cannonGrad;
    safeRoundRect(ctx, 0, -cannonR, cannonLen, cannonR * 2, cannonR * 0.42);
    ctx.fill(); ctx.stroke();
    // 管口外环（深青环，强调开口）
    ctx.fillStyle = C.F_MOUTH_OUT;
    ctx.beginPath();
    ctx.ellipse(cannonLen, 0, cannonR * 0.44, cannonR * 0.92, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 管口内腔（近黑青，发射通道）
    ctx.fillStyle = C.F_MOUTH_IN;
    ctx.beginPath();
    ctx.ellipse(cannonLen, 0, cannonR * 0.28, cannonR * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    // 管口冰雾（2 团柔雾随 wobble 轻浮——"呼吸寒气"动态符号）
    const mistSway = Math.sin(wobblePhase * 1.6) * headR * 0.03;
    ctx.fillStyle = 'rgba(214,240,252,0.55)';
    ctx.beginPath();
    ctx.ellipse(cannonLen + cannonR * 0.55 + mistSway, -cannonR * 0.28, cannonR * 0.34, cannonR * 0.24, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cannonLen + cannonR * 0.72 + mistSway * 0.6, cannonR * 0.10, cannonR * 0.26, cannonR * 0.18, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ---- 6. 头顶三叉冰晶簇（中央主晶 + 两侧短晶，微后倾；切面暗部 + 中轴线）----
    ctx.save();
    ctx.translate(0, headY - headR * 0.88);
    ctx.rotate(-0.10);                        // 整簇微微后倾（面朝右 → 向左倾）
    const drawCrystal = (w, h, tilt) => {
      ctx.save();
      ctx.rotate(tilt);
      this._setStroke(ctx, C.STROKE, swMain);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-w * 0.5, -h * 0.32);
      ctx.lineTo(0, -h);
      ctx.lineTo( w * 0.5, -h * 0.32);
      ctx.closePath();
      ctx.fillStyle = C.F_CRYSTAL;
      ctx.fill(); ctx.stroke();
      // 右半切面暗部（折射立体感）
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -h);
      ctx.lineTo(w * 0.5, -h * 0.32);
      ctx.closePath();
      ctx.fillStyle = C.F_CRYSTAL_2;
      ctx.fill();
      ctx.restore();
      // 中轴切面线
      this._setStroke(ctx, 'rgba(120,200,200,0.65)', this._strokeW(T.STROKE.THIN));
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.06);
      ctx.lineTo(0, -h * 0.88);
      ctx.stroke();
      ctx.restore();
    };
    drawCrystal(headR * 0.30, headR * 0.58, -0.42);   // 左短晶
    drawCrystal(headR * 0.34, headR * 0.66,  0.40);   // 右短晶
    drawCrystal(headR * 0.38, headR * 0.86,  0);      // 中央主晶（最后画，居前）
    ctx.restore();

    // ---- 7. 表情：冷酷半垂眼睑 + 抿嘴 + 冰蓝腮红（"拽"感参照附件）----
    this._drawCuteFace(ctx, headR, headY + headR * H.FREEZER_EYE_Y, {
      mouth: 'flat', wobblePhase: wobblePhase, blushColor: C.BLUSH_COOL
    });
    // 半垂眼睑：盖住每只眼上部 ~35%，冷傲眼神
    const eyeY2 = headY + headR * H.FREEZER_EYE_Y;
    const eyeDX = headR * T.FACE.EYE_DX_RATIO;
    const eyeR  = headR * T.FACE.EYE_R_RATIO;
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.ellipse(s * eyeDX, eyeY2 - eyeR * 0.30, eyeR * 1.06, eyeR * 0.78, 0, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = C.F_LID;
      ctx.fill();
      this._setStroke(ctx, C.F_LID_LINE, this._strokeW(T.STROKE.THIN));
      ctx.beginPath();
      ctx.moveTo(s * eyeDX - eyeR * 1.02, eyeY2 - eyeR * 0.30);
      ctx.lineTo(s * eyeDX + eyeR * 1.02, eyeY2 - eyeR * 0.30);
      ctx.stroke();
    }
  }

  /**
   * 樱桃炸弹（v2 新增植物）：双樱桃 + 绿色引线 + 引信火花 + 爆炸前蓄力震动
   * 核心识别符号：两颗红樱桃 + 顶部绿色茎/引线 + 闪烁火星
   * @param {Object} plant - 植物对象（含 fuseTimer 用于蓄力震动）
   */
  _drawCherry(ctx, r, def, plant) {
    const T = this.T;
    const C = T.COLORS;
    const F = T.FACE;
    const H = T.HEAD;
    const wobblePhase = plant.wobble;
    // 引信阶段震动：剩余时间越短震动越剧烈（< 800ms 开始抖）
    const fuseLeft = plant.fuseTimer || 0;
    const shake = fuseLeft > 0 && fuseLeft < 800
      ? (Math.sin(Date.now() / 30) * (1 - fuseLeft / 800) * 4)
      : 0;

    // v24 参照 plant_cherry.png：双樱桃一前一后（左大前=主表情 / 右小后=次表情）
    //   两根 S 形绿茎各带侧叶，左茎顶深红褐蒂头（完好），右茎顶火花（点燃倒计时）
    const headY = -r * 0.05;
    const lx = -r * 0.40, ly = headY + r * 0.08, lr = r * 0.58;   // 左樱桃（前，大）
    const rx =  r * 0.44, ry = headY - r * 0.00, rr = r * 0.44;   // 右樱桃（后，小）

    ctx.save();
    if (shake) ctx.translate(shake, 0);
    ctx.lineJoin = 'round';

    // ---- 1. 双茎（粗圆柱：白边底层 + 绿面层；樱桃本体稍后压住茎根）----
    const stemW = r * 0.13;
    const drawStem = (x0, y0, cx, cy, x1, y1) => {
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      this._setStroke(ctx, T.COLORS.STROKE, stemW + this._strokeW(T.STROKE.THIN) * 1.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      this._setStroke(ctx, C.C_FUSE, stemW);
      ctx.stroke();
    };
    // 左茎：从左樱桃顶向上外弯（S 形）
    const lTipX = lx - r * 0.20, lTipY = ly - lr - r * 0.38;
    drawStem(lx + r * 0.02, ly - lr * 0.86, lx - r * 0.02, ly - lr - r * 0.26, lTipX, lTipY);
    // 右茎：从右樱桃顶向上外弯
    const rTipX = rx + r * 0.20, rTipY = ry - rr - r * 0.34;
    drawStem(rx, ry - rr * 0.86, rx + r * 0.04, ry - rr - r * 0.24, rTipX, rTipY);

    // ---- 2. 茎侧叶片（各 1 片尖卵形，朝外）----
    const drawLeaf = (x, y, len, dir) => {
      ctx.fillStyle = C.C_LEAF;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + dir * len * 0.18, y - len * 0.42, x + dir * len * 0.72, y - len * 0.54, x + dir * len, y - len * 0.22);
      ctx.bezierCurveTo(x + dir * len * 0.96, y + len * 0.10, x + dir * len * 0.46, y + len * 0.30, x, y);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    };
    drawLeaf(lx - r * 0.14, ly - lr - r * 0.20, r * 0.30, -1);   // 左叶（较大）
    drawLeaf(rx + r * 0.12, ry - rr - r * 0.16, r * 0.24, 1);    // 右叶（较小）

    // ---- 3. 左茎顶蒂头（深红褐胶囊，樱桃「完好」状态）----
    ctx.save();
    ctx.translate(lTipX, lTipY);
    ctx.rotate(-0.55);
    ctx.fillStyle = C.C_TIP;
    safeRoundRect(ctx, -r * 0.055, -r * 0.10, r * 0.11, r * 0.20, r * 0.055);
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // ---- 4. 右樱桃（后，略小，暗一档渐变）----
    const rg = ctx.createRadialGradient(rx - rr * 0.30, ry - rr * 0.35, 0, rx, ry, rr * 1.12);
    rg.addColorStop(0, C.C_BODY);
    rg.addColorStop(0.55, C.C_BODY_DARK);
    rg.addColorStop(1, C.C_BODY_EDGE);
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(rx, ry, rr, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 后樱桃小月牙高光 + 右下反光点
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.ellipse(rx - rr * 0.30, ry - rr * 0.34, rr * 0.18, rr * 0.26, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.beginPath();
    ctx.arc(rx + rr * 0.38, ry + rr * 0.32, rr * 0.06, 0, Math.PI * 2);
    ctx.fill();

    // ---- 5. 左樱桃（前，大，亮红渐变）----
    const lg = ctx.createRadialGradient(lx - lr * 0.32, ly - lr * 0.38, 0, lx, ly, lr * 1.15);
    lg.addColorStop(0, C.C_BODY_LIGHT);
    lg.addColorStop(0.45, C.C_BODY);
    lg.addColorStop(0.80, C.C_BODY_DARK);
    lg.addColorStop(1, C.C_BODY_EDGE);
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(lx, ly, lr, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 主高光月牙（左上）+ 次反光点（右下）
    ctx.fillStyle = 'rgba(255,255,255,' + H.HLIGHT_ALPHA + ')';
    ctx.beginPath();
    ctx.ellipse(lx + lr * H.HLIGHT_X, ly + lr * H.HLIGHT_Y,
                lr * H.HLIGHT_W, lr * H.HLIGHT_H, H.HLIGHT_ROT, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.arc(lx + lr * 0.40, ly + lr * 0.36, lr * 0.07, 0, Math.PI * 2);
    ctx.fill();

    // ---- 6. 倒八字粗眉（深红褐，双樱桃共用画法）----
    const drawBrows = (cx, cy, rad) => {
      const eyeDXb = rad * F.EYE_DX_RATIO;
      const eyeRb  = rad * F.EYE_R_RATIO;
      const browY  = cy - eyeRb * 1.40;
      this._setStroke(ctx, C.C_BROW, this._strokeW(T.STROKE.INK) * 1.9);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - eyeDXb - eyeRb * 0.75, browY + eyeRb * 0.55);
      ctx.quadraticCurveTo(cx - eyeDXb - eyeRb * 0.10, browY + eyeRb * 0.05, cx - eyeDXb + eyeRb * 0.75, browY - eyeRb * 0.65);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + eyeDXb - eyeRb * 0.75, browY - eyeRb * 0.65);
      ctx.quadraticCurveTo(cx + eyeDXb + eyeRb * 0.10, browY + eyeRb * 0.05, cx + eyeDXb + eyeRb * 0.75, browY + eyeRb * 0.55);
      ctx.stroke();
    };

    // ---- 7. 双脸：斜视怒目 + 撇嘴 + 浓腮红（后脸先画；两脸眨眼相位错开更生动）----
    const faceCY2 = ry - rr * 0.04;
    drawBrows(rx, faceCY2, rr);
    this._drawCuteFace(ctx, rr, faceCY2, {
      mouth: 'pout', wobblePhase: wobblePhase + 2.1,
      blushColor: C.BLUSH_RICH, pupilInward: true
    });
    const faceCY = ly - lr * 0.04;
    drawBrows(lx, faceCY, lr);
    this._drawCuteFace(ctx, lr, faceCY, {
      mouth: 'pout', wobblePhase: wobblePhase,
      blushColor: C.BLUSH_RICH, pupilInward: true
    });

    // ---- 8. 引信火花（右茎顶：点燃倒计时警示，<1s 高频闪）----
    if (fuseLeft > 0 && fuseLeft < 1000) {
      const sparkAlpha = 0.4 + 0.6 * Math.abs(Math.sin(Date.now() / (fuseLeft < 500 ? 50 : 100)));
      ctx.globalAlpha = sparkAlpha;
      // 外层橙红星（放射感）
      ctx.fillStyle = '#FF9800';
      this._drawStarShape(ctx, rTipX, rTipY, r * 0.20, 5, 0.45);
      ctx.fill();
      // 内层亮黄星
      ctx.fillStyle = C.C_SPARK;
      this._drawStarShape(ctx, rTipX, rTipY, r * 0.12, 4, 0.5);
      ctx.fill();
      // 顶部白烟小团
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(rTipX, rTipY - r * 0.16, r * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /**
   * 食人花（Chomper v25 按系列风格标准重绘）：
   * - 四片深绿叶双层底座（后 2 大侧叶 + 前 2 小内叶，寒冰射手同款结构）
   * - 鲜绿渐变粗茎 + 环形植物节纹理；吞咽期茎部鼓肚（吃下的僵尸轮廓）
   * - 大紫球径向渐变头部（亮 #E9C6F0 / 基 #8E24AA / 暗 #4A148C）+ 深紫斑点表皮
   * - 正面大嘴：近黑紫口腔 + 上下两排白色獠牙 + 深紫厚唇弧（咬合红色闪光保留）
   * - 凶萌表情：高位向内斜视怒目 + 倒八字眉 + 淡紫腮红（嘴部让给大嘴本体）
   * - 状态动画完整保留：snap 前冲张合 / swallow 鼓肚缩放 / idle 呼吸开合
   * @param {Object} plant - 完整植物对象（含 chomperState / biteProgress / swallowProgress）
   */
  _drawChomper(ctx, r, def, plant) {
    const wobblePhase = (typeof plant === 'number') ? plant : (plant.wobble || 0);
    // 状态进度值：兼容传入数字（旧调用）和完整对象
    let biteP = 0, swalP = 0, chompState = 'idle';
    if (typeof plant === 'object' && plant !== null) {
      biteP = plant.chomperBiteProgress || 0;
      swalP = plant.chomperSwallowProgress || 0;
      chompState = plant.chomperState || 'idle';
    }

    const T = this.T;
    const C = T.COLORS;
    const H = T.HEAD;
    const F = T.FACE;
    const headR = r * 1.04;
    const headY = -r * 0.28;

    // 吞咽期整体微微鼓起（向下 + 放大）
    const swallowScale = 1 + swalP * 0.12;
    const swallowOffY = swalP * r * 0.08;
    ctx.save();
    ctx.translate(0, swallowOffY);
    ctx.scale(swallowScale, swallowScale);

    // ---- 1. 四片深绿叶底座（后 2 大侧叶 + 前 2 小内叶）----
    const leafY = r * 0.58;
    ctx.fillStyle = '#2E7D32';
    ctx.beginPath();
    ctx.moveTo(-r * 0.30, leafY - r * 0.02);
    ctx.bezierCurveTo(-r * 1.02, leafY - r * 0.14, -r * 1.06, leafY + r * 0.26, -r * 0.84, leafY + r * 0.32);
    ctx.bezierCurveTo(-r * 0.58, leafY + r * 0.36, -r * 0.40, leafY + r * 0.20, -r * 0.30, leafY - r * 0.02);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo( r * 0.30, leafY - r * 0.02);
    ctx.bezierCurveTo( r * 1.02, leafY - r * 0.14,  r * 1.06, leafY + r * 0.26,  r * 0.84, leafY + r * 0.32);
    ctx.bezierCurveTo( r * 0.58, leafY + r * 0.36,  r * 0.40, leafY + r * 0.20,  r * 0.30, leafY - r * 0.02);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 前层 2 小内叶（浅一档绿，向前包裹茎部）
    ctx.fillStyle = '#43A047';
    ctx.beginPath();
    ctx.moveTo(-r * 0.12, leafY + r * 0.10);
    ctx.bezierCurveTo(-r * 0.52, leafY + r * 0.06, -r * 0.60, leafY + r * 0.34, -r * 0.40, leafY + r * 0.42);
    ctx.bezierCurveTo(-r * 0.24, leafY + r * 0.44, -r * 0.16, leafY + r * 0.30, -r * 0.12, leafY + r * 0.10);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo( r * 0.12, leafY + r * 0.10);
    ctx.bezierCurveTo( r * 0.52, leafY + r * 0.06,  r * 0.60, leafY + r * 0.34,  r * 0.40, leafY + r * 0.42);
    ctx.bezierCurveTo( r * 0.24, leafY + r * 0.44,  r * 0.16, leafY + r * 0.30,  r * 0.12, leafY + r * 0.10);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // ---- 2. 鲜绿渐变粗茎 + 环形植物节（吞咽期茎部鼓肚）----
    if (swalP > 0.05) {
      ctx.fillStyle = '#7CB342';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.30, r * (0.30 + swalP * 0.20), r * (0.24 + swalP * 0.10), 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    const stemGrad = ctx.createLinearGradient(-r * 0.16, 0, r * 0.16, 0);
    stemGrad.addColorStop(0, '#8BC34A');
    stemGrad.addColorStop(0.5, '#689F38');
    stemGrad.addColorStop(1, '#558B2F');
    ctx.fillStyle = stemGrad;
    safeRoundRect(ctx, -r * 0.15, headY + headR * 0.48, r * 0.30, r * 0.46, r * 0.13);
    ctx.fill(); ctx.stroke();
    this._setStroke(ctx, 'rgba(85,107,47,0.55)', this._strokeW(T.STROKE.THIN));
    for (let i = 0; i < 2; i++) {
      const y = headY + headR * 0.60 + i * r * 0.15;
      ctx.beginPath();
      ctx.moveTo(-r * 0.13, y);
      ctx.quadraticCurveTo(0, y - r * 0.04, r * 0.13, y);
      ctx.stroke();
    }
    this._setStroke(ctx, C.STROKE, this._strokeW(T.STROKE.MAIN));

    // ---- 3. 头部：大紫球径向渐变（咬合时前冲）----
    const snapLungeX = Math.sin(biteP * Math.PI) * r * 0.10;
    const snapLungeY = -Math.sin(biteP * Math.PI) * r * 0.08;
    ctx.save();
    ctx.translate(snapLungeX, snapLungeY);
    const headGrad = ctx.createRadialGradient(
      -headR * 0.35, headY - headR * 0.35, 0,
      0, headY, headR * 1.15
    );
    headGrad.addColorStop(0, C.CH_HEAD_LIGHT);
    headGrad.addColorStop(0.55, def.color);
    headGrad.addColorStop(1, C.CH_HEAD_DARK);
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(0, headY, headR, headR * 0.94, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // ---- 4. 深紫斑点表皮（食人花经典特征，clip 头内、避让脸中带）----
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, headY, headR, headR * 0.94, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = C.CH_SPOT;
    const spots = [
      [-headR * 0.62, headY - headR * 0.50, headR * 0.13],
      [ headR * 0.56, headY - headR * 0.42, headR * 0.10],
      [-headR * 0.68, headY + headR * 0.18, headR * 0.10],
      [ headR * 0.64, headY + headR * 0.30, headR * 0.12],
      [ headR * 0.10, headY - headR * 0.76, headR * 0.08]
    ];
    spots.forEach(([sx, sy, sr]) => {
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // ---- 5. 左上月牙高光（上移避让高位眼区）----
    ctx.fillStyle = 'rgba(255,255,255,' + H.HLIGHT_ALPHA + ')';
    ctx.beginPath();
    ctx.ellipse(headR * H.HLIGHT_X, headY + headR * (H.HLIGHT_Y - 0.22),
                headR * H.HLIGHT_W, headR * H.HLIGHT_H, H.HLIGHT_ROT, 0, Math.PI * 2);
    ctx.fill();

    // ---- 6. 正面大嘴：口腔 + 上下獠牙 + 厚唇弧 ----
    // 开口度：idle 呼吸轻微开合 / snap 前半快速张到最大后半闭合 / swallow 紧闭
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

    const mouthCY = headY + headR * 0.24;
    const mouthRX = headR * 0.48;
    const openH = headR * (0.07 + 0.26 * mouthOpen);
    const mouthFlash = (chompState === 'snap' && biteP >= 0.4 && biteP <= 0.65) ? 1 : 0;

    // 口腔（咬合瞬间红色闪光）
    ctx.fillStyle = mouthFlash ? C.CH_FLASH : C.CH_MOUTH;
    ctx.beginPath();
    ctx.ellipse(0, mouthCY, mouthRX, openH, 0, 0, Math.PI * 2);
    ctx.fill();
    if (mouthFlash) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.ellipse(0, mouthCY - openH * 0.30, mouthRX * 0.62, openH * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 上排獠牙 4 颗（从上唇垂下；张口越大外露越长）
    const teethShow = Math.min(1, mouthOpen / 0.7);
    ctx.fillStyle = '#FFFFFF';
    [-0.58, -0.20, 0.20, 0.58].forEach((dx) => {
      const x = dx * mouthRX;
      const topY = mouthCY - openH + 1;
      const tw = headR * 0.115;
      const th = headR * (0.09 + 0.13 * teethShow);
      ctx.beginPath();
      ctx.moveTo(x - tw / 2, topY);
      ctx.lineTo(x, topY + th);
      ctx.lineTo(x + tw / 2, topY);
      ctx.closePath();
      ctx.fill();
    });
    // 下排獠牙 3 颗（从下唇立起，比上牙矮）
    [-0.34, 0, 0.34].forEach((dx) => {
      const x = dx * mouthRX;
      const botY = mouthCY + openH - 1;
      const tw = headR * 0.105;
      const th = headR * (0.07 + 0.10 * teethShow);
      ctx.beginPath();
      ctx.moveTo(x - tw / 2, botY);
      ctx.lineTo(x, botY - th);
      ctx.lineTo(x + tw / 2, botY);
      ctx.closePath();
      ctx.fill();
    });

    // 厚唇弧（深紫，沿口腔上下缘；白描边打底 → 唇色弧覆盖，双层描边）
    const lipW = Math.max(2, headR * 0.10);
    const lipRX = mouthRX + lipW * 0.55;
    const lipRY = openH + lipW * 0.55;
    this._setStroke(ctx, C.STROKE, lipW + this._strokeW(T.STROKE.MAIN) * 1.6);
    ctx.beginPath();
    ctx.ellipse(0, mouthCY, lipRX, lipRY, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, mouthCY, lipRX, lipRY, 0, 0, Math.PI);
    ctx.stroke();
    this._setStroke(ctx, C.CH_LIP, lipW);
    ctx.beginPath();
    ctx.ellipse(0, mouthCY, lipRX, lipRY, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, mouthCY, lipRX, lipRY, 0, 0, Math.PI);
    ctx.stroke();

    // ---- 7. 凶萌表情：高位眼 + 向内斜视 + 倒八字眉 + 淡紫腮红 ----
    const eyeCY = headY - headR * 0.36;
    this._drawCuteFace(ctx, headR, eyeCY, {
      mouth: 'none', wobblePhase: wobblePhase, pupilInward: true,
      blushColor: 'rgba(206,147,216,0.50)'
    });
    const eyeDXb = headR * F.EYE_DX_RATIO;
    const eyeRb = headR * F.EYE_R_RATIO;
    const browY = eyeCY - eyeRb * 1.42;
    this._setStroke(ctx, C.CH_BROW, this._strokeW(T.STROKE.INK) * 1.9);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-eyeDXb - eyeRb * 0.75, browY + eyeRb * 0.55);
    ctx.quadraticCurveTo(-eyeDXb - eyeRb * 0.10, browY + eyeRb * 0.05, -eyeDXb + eyeRb * 0.75, browY - eyeRb * 0.65);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(eyeDXb - eyeRb * 0.75, browY - eyeRb * 0.65);
    ctx.quadraticCurveTo(eyeDXb + eyeRb * 0.10, browY + eyeRb * 0.05, eyeDXb + eyeRb * 0.75, browY + eyeRb * 0.55);
    ctx.stroke();

    ctx.restore();  // snap head offset
    ctx.restore();  // swallow scale
  }

  /**
   * 向日葵（Sunflower）：v17 参照 role_banner.png 重新设计
   * · 12 片外层水滴形花瓣（柠檬黄） + 6 片内层小花瓣（橙黄）
   * · 光滑暖橙黄花盘（无棕色种子纹理） + 左上方月牙形高光
   * · 圆润草绿躯干 + 心形叶 + 珊瑚粉腮红
   */
  _drawSunflower(ctx, r, def, wobblePhase) {
    const T = this.T;
    const C = T.COLORS;
    const H = T.HEAD;
    const headR = r * 0.95;
    const headY = -r * 0.2;
    const wobble = Math.sin(wobblePhase) * 0.05;

    // === 茎 + 两片心形叶（圆润草绿躯干） ===
    // 茎：圆润矩形，渐变绿色
    const stemGrad = ctx.createLinearGradient(0, r * 0.05, 0, r * 0.55);
    stemGrad.addColorStop(0, '#8BC34A');
    stemGrad.addColorStop(1, '#558B2F');
    ctx.fillStyle = stemGrad;
    ctx.beginPath();
    safeRoundRect(ctx, -r * 0.14, r * 0.05, r * 0.28, r * 0.55, r * 0.14);
    ctx.fill(); ctx.stroke();
    // 左心形叶
    ctx.fillStyle = '#7CB342';
    ctx.beginPath();
    ctx.ellipse(-r * 0.55, r * 0.42, r * 0.42, r * 0.22, -0.55, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 右心形叶
    ctx.beginPath();
    ctx.ellipse( r * 0.55, r * 0.42, r * 0.42, r * 0.22,  0.55, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 叶脉（深绿细线）
    ctx.strokeStyle = '#33691E';
    ctx.lineWidth = Math.max(1, r * 0.025);
    ctx.beginPath();
    ctx.moveTo(-r * 0.85, r * 0.48);
    ctx.lineTo(-r * 0.25, r * 0.36);
    ctx.moveTo( r * 0.85, r * 0.48);
    ctx.lineTo( r * 0.25, r * 0.36);
    ctx.stroke();
    // 恢复默认线宽
    ctx.lineWidth = Math.max(1, r * 0.04);

    // === 12 片外层水滴形花瓣（柠檬黄 #FFD54F） ===
    // 外层描边：深橙 #E65100，强化立体感
    ctx.fillStyle = '#FFD54F';
    ctx.strokeStyle = '#E65100';
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + wobble;
      const px = Math.cos(angle) * headR * 0.78;
      const py = headY + Math.sin(angle) * headR * 0.78;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle + Math.PI / 2);
      // 水滴形：尖端朝外、圆头朝内（视觉上花瓣"扎根"于花盘）
      ctx.beginPath();
      ctx.ellipse(0, 0, headR * 0.18, headR * 0.34, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // === 6 片内层小花瓣（橙黄 #FFC107，领口装饰） ===
    ctx.fillStyle = '#FFC107';
    ctx.strokeStyle = '#E65100';
    ctx.lineWidth = Math.max(0.8, r * 0.03);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.PI / 12 + wobble;  // 与外层错位
      const px = Math.cos(angle) * headR * 0.45;
      const py = headY + Math.sin(angle) * headR * 0.45;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle + Math.PI / 2);
      ctx.beginPath();
      ctx.ellipse(0, 0, headR * 0.12, headR * 0.22, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.lineWidth = Math.max(1, r * 0.04);  // 恢复默认线宽

    // === 花盘：光滑暖橙黄 #FFA000（替代原棕色种子纹理） ===
    const discGrad = ctx.createRadialGradient(
      -headR * 0.15, headY - headR * 0.15, headR * 0.05,
      0, headY, headR * 0.5
    );
    discGrad.addColorStop(0, '#FFB300');
    discGrad.addColorStop(0.6, '#FFA000');
    discGrad.addColorStop(1, '#FF8F00');
    ctx.fillStyle = discGrad;
    ctx.beginPath();
    ctx.arc(0, headY, headR * 0.5, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // === 左上方月牙形高光（白色 #FFFDE7，3D 球体光泽感） ===
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, headY, headR * 0.5, 0, Math.PI * 2);
    ctx.clip();  // 限制在花盘内
    ctx.fillStyle = 'rgba(255, 253, 231, 0.85)';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.18, headY - headR * 0.20, headR * 0.22, headR * 0.14, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // 小光斑（高光上方更小的亮点）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.08, headY - headR * 0.28, headR * 0.08, headR * 0.05, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // === 表情：杏眼 + 微笑 + 珊瑚粉腮红 ===
    this._drawCuteFace(ctx, headR, headY + headR * H.WALL_EYE_Y, {
      mouth: 'smile',
      wobblePhase: wobblePhase,
      blushColor: 'rgba(255, 171, 145, 0.7)'  // v17: 珊瑚粉腮红（替代原橙色）
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
