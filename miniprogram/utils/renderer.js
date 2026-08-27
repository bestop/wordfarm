// utils/renderer.js - Canvas 2D 渲染器
// 负责: 背景绘制、僵尸绘制、植物绘制、HUD、粒子效果
// 采用离屏 Canvas 缓存复杂元素提升性能

const { ZOMBIE_TYPES, PLANT_TYPES } = require('./constants.js');
const { pathManager } = require('./pathManager.js');

/**
 * roundRect polyfill
 * 部分小程序基础库（< 2.31.0）或低端安卓设备的 Canvas 2D 上下文
 * 不支持 ctx.roundRect()，此处提供兼容实现
 * @param {number} x - 左上角 x
 * @param {number} y - 左上角 y
 * @param {number} w - 宽
 * @param {number} h - 高
 * @param {number|number[]} r - 圆角半径
 */
function roundRectPolyfill(ctx, x, y, w, h, r) {
  if (typeof r === 'number') r = [r, r, r, r];
  else if (Array.isArray(r) && r.length === 1) r = [r[0], r[0], r[0], r[0]];
  // 防止圆角超过宽高一半
  const maxR = Math.min(w, h) / 2;
  r = r.map(v => Math.min(v, maxR));
  ctx.moveTo(x + r[0], y);
  ctx.lineTo(x + w - r[1], y);
  ctx.arcTo(x + w, y, x + w, y + r[1], r[1]);
  ctx.lineTo(x + w, y + h - r[2]);
  ctx.arcTo(x + w, y + h, x + w - r[2], y + h, r[2]);
  ctx.lineTo(x + r[3], y + h);
  ctx.arcTo(x, y + h, x, y + h - r[3], r[3]);
  ctx.lineTo(x, y + r[0]);
  ctx.arcTo(x, y, x + r[0], y, r[0]);
  ctx.closePath();
}

/**
 * 兼容性 roundRect 调用：优先用原生，不存在则用 polyfill
 */
function safeRoundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    roundRectPolyfill(ctx, x, y, w, h, r);
  }
}

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
    // 寒冰 Freezer
    F_LEAF_DARK:  '#B2EBF2',
    F_LEAF_MID:   '#80DEEA',
    F_LEAF_LIGHT: '#D1F4F8',
    F_STEM:       '#4DD0E1',
    F_MOUTH_OUT:  '#0277BD',
    F_MOUTH_IN:   '#01579B',
    F_CRYSTAL:    '#E1F5FE',
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
  // 植物保留：豌豆射手=圆头+发射口+顶豌豆+2侧叶；坚果=圆头+壳横纹+顶嫩芽；寒冰=圆头+发射口+顶菱形冰晶
  // 僵尸保留：bucket=铁桶+白条；imp=蝴蝶结；football=半圆头盔；全部删除次要装饰
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
   */
  attach(ctx, width, height, dpr) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.dpr = dpr || 1;
    pathManager.setCanvasSize(width, height);
    // 离屏缓存构建失败不应阻断游戏启动，try-catch 保护
    try {
      this._buildOffscreenCache();
      this._preloadImages();
    } catch (err) {
      console.error('[Renderer] 离屏缓存构建失败，降级为实时渲染:', err);
      this.offscreenCache = {};
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
    const size = Math.max(this.width, this.height);
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
    // 棋盘格底色（交替深浅）
    for (let lane = 0; lane < 3; lane++) {
      for (let slot = 0; slot < 5; slot++) {
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
    for (let lane = 0; lane <= 3; lane++) {
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
    const def = ZOMBIE_TYPES[type];
    const T   = this.T;
    const UNIT = 50;               // 基准单位（全部比例基于此）
    this._strokeW(1, UNIT);        // 把 UNIT 作为描边基准

    // 超采样高清化
    const SS = this.dpr * T.OFFSCREEN.SUPERSAMPLE;
    const size = UNIT * 2.8;       // 画布尺寸（比旧 2.6 增 8%，保证头饰不裁切）
    const canvas = wx.createOffscreenCanvas ? wx.createOffscreenCanvas({
      type: '2d',
      width:  Math.round(size * SS),
      height: Math.round(size * SS)
    }) : null;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    ctx.scale(SS, SS);
    ctx.translate(size / 2, size / 2);

    // 僵尸暗色描边（v3 阵营区分：植物白描边 vs 僵尸暗描边，一眼区分）
    const swMain = this._strokeW(T.STROKE.MAIN);
    this._setStroke(ctx, T.COLORS.Z_STROKE, swMain);

    // 阴影（底部 · 与植物统一 Tokens 色）
    ctx.fillStyle = T.COLORS.SHADOW;
    ctx.beginPath();
    ctx.ellipse(0, UNIT * 1.12, UNIT * 0.72, UNIT * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // 小手臂（按类型差异化体型，Z_BODY tokens 控制）
    const ZB = T.Z_BODY;
    const bodyW = type === 'bucket' ? ZB.BUCKET_BODY_W :
                  type === 'imp' ? ZB.IMP_BODY_W :
                  type === 'football' ? ZB.FOOTBALL_BODY_W : ZB.DANCER_BODY_W;
    const armLen = type === 'bucket' ? ZB.BUCKET_ARM_LEN :
                   type === 'imp' ? ZB.IMP_ARM_LEN :
                   type === 'football' ? ZB.FOOTBALL_ARM_LEN : ZB.DANCER_ARM_LEN;
    const armX = UNIT * (bodyW + 0.14);
    const armY = UNIT * 0.35;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.ellipse(-armX, armY, UNIT * 0.18, UNIT * armLen, -0.35, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse( armX, armY, UNIT * 0.18, UNIT * armLen,  0.35, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // 身体（按类型差异化：普通/瘦长/宽壮/方正）
    ctx.fillStyle = def.color;
    ctx.beginPath();
    safeRoundRect(ctx, -UNIT * bodyW, UNIT * 0.12, UNIT * bodyW * 2, UNIT * 0.55, UNIT * 0.28);
    ctx.fill(); ctx.stroke();
    // 肚皮高光（僵尸微弱哑光，Z_HIGHLIGHT，植物用亮白 0.35）
    ctx.fillStyle = T.COLORS.Z_HIGHLIGHT;
    ctx.beginPath();
    ctx.ellipse(-UNIT * 0.14, UNIT * 0.28, UNIT * 0.16, UNIT * 0.26, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // 护甲僵尸专属：胸甲 + 肩甲（金属护具，覆盖在身体上但保留萌系脸）
    if (type === 'dancer') {
      // 胸甲（圆角矩形板，覆盖身体正面）
      ctx.fillStyle = T.COLORS.Z_ARMOR_LIGHT;
      ctx.beginPath();
      safeRoundRect(ctx, -UNIT * 0.30, UNIT * 0.18, UNIT * 0.60, UNIT * 0.42, UNIT * 0.10);
      ctx.fill(); ctx.stroke();
      // 胸甲中缝线（金属甲片分界）
      this._setStroke(ctx, T.COLORS.Z_ARMOR_DARK, this._strokeW(T.STROKE.THIN));
      ctx.beginPath();
      ctx.moveTo(0, UNIT * 0.20);
      ctx.lineTo(0, UNIT * 0.58);
      ctx.stroke();
      // 胸甲铆钉（4 颗，四角）
      ctx.fillStyle = T.COLORS.Z_BOLT;
      const boltY = UNIT * 0.26;
      ctx.beginPath();
      ctx.arc(-UNIT * 0.22, boltY, UNIT * 0.045, 0, Math.PI * 2);
      ctx.arc( UNIT * 0.22, boltY, UNIT * 0.045, 0, Math.PI * 2);
      ctx.arc(-UNIT * 0.22, boltY + UNIT * 0.26, UNIT * 0.045, 0, Math.PI * 2);
      ctx.arc( UNIT * 0.22, boltY + UNIT * 0.26, UNIT * 0.045, 0, Math.PI * 2);
      ctx.fill();
      // 肩甲（左右两片圆形护肩，叠在手臂上方）
      ctx.fillStyle = T.COLORS.Z_ARMOR;
      ctx.beginPath();
      ctx.arc(-UNIT * 0.62, UNIT * 0.30, UNIT * 0.16, 0, Math.PI * 2);
      ctx.arc( UNIT * 0.62, UNIT * 0.30, UNIT * 0.16, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // 恢复主描边色（僵尸暗色）
      this._setStroke(ctx, T.COLORS.Z_STROKE, this._strokeW(T.STROKE.MAIN));
    }

    // 腿（按类型差异化粗细）
    const legW = type === 'bucket' ? ZB.BUCKET_LEG_W :
                 type === 'imp' ? ZB.IMP_LEG_W :
                 type === 'football' ? ZB.FOOTBALL_LEG_W : ZB.DANCER_LEG_W;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.ellipse(-UNIT * 0.2, UNIT * 0.8, UNIT * legW, UNIT * 0.14, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse( UNIT * 0.2, UNIT * 0.8, UNIT * legW, UNIT * 0.14, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // 大头（Q版核心：占身体 60% 以上，上移以便装饰头顶）
    const H = T.HEAD;
    const headCY = UNIT * H.ZOMBIE_HEAD_CY;
    const headR  = UNIT * H.ZOMBIE_HEAD_R;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(0, headCY, headR, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // 头顶高光（僵尸微弱哑光，与植物亮白高光明确区分）
    ctx.fillStyle = T.COLORS.Z_HIGHLIGHT;
    ctx.beginPath();
    ctx.ellipse(headR * H.HLIGHT_X, headCY + headR * H.HLIGHT_Y,
                headR * H.HLIGHT_W, headR * H.HLIGHT_H,
                H.HLIGHT_ROT, 0, Math.PI * 2);
    ctx.fill();

    // 头顶装饰（按类型差异化：铁桶/蝴蝶结/头盔+角/全盔）
    if (type === 'bucket') {
      ctx.fillStyle = T.COLORS.Z_CONE;
      ctx.beginPath();
      ctx.moveTo(-headR * 0.55, headCY - headR * 0.2);
      ctx.lineTo( headR * 0.55, headCY - headR * 0.2);
      ctx.lineTo( headR * 0.28, headCY - headR * 1.35);
      ctx.lineTo(-headR * 0.28, headCY - headR * 1.35);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = T.COLORS.STROKE;   // 白条纹
      ctx.beginPath();
      safeRoundRect(ctx, -headR * 0.4, headCY - headR * 0.48, headR * 0.8, headR * 0.12, headR * 0.05);
      ctx.fill(); ctx.stroke();
    } else if (type === 'imp') {
      // 橙红蝴蝶结（小鬼僵尸快速感）
      ctx.fillStyle = T.COLORS.Z_RIBBON;
      ctx.beginPath();
      safeRoundRect(ctx, -headR * 0.95, headCY - headR * 0.55, headR * 1.9, headR * 0.20, headR * 0.08);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-headR * 0.3, headCY - headR * 0.46);
      ctx.lineTo(-headR * 0.85, headCY - headR * 0.95);
      ctx.lineTo(-headR * 0.85, headCY - headR * 0.02);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo( headR * 0.3, headCY - headR * 0.46);
      ctx.lineTo( headR * 0.85, headCY - headR * 0.95);
      ctx.lineTo( headR * 0.85, headCY - headR * 0.02);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (type === 'dancer') {
      // 舞王全盔（金属骑士盔：覆盖头顶+两侧太阳穴，留出脸部露萌系脸）
      // 比强壮的半盔更包：从 0.85π 到 2.15π，两侧延伸到 headR*0.92
      ctx.fillStyle = T.COLORS.Z_ARMOR;
      ctx.beginPath();
      ctx.arc(0, headCY, headR * 1.02, Math.PI * 0.85, Math.PI * 2.15);
      ctx.lineTo( headR * 0.92, headCY + headR * 0.18);
      ctx.lineTo(-headR * 0.92, headCY + headR * 0.18);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // 头盔金属反光高光（左上椭圆，与统一高光位对齐）
      ctx.fillStyle = T.COLORS.Z_ARMOR_LIGHT;
      ctx.beginPath();
      ctx.ellipse(-headR * 0.28, headCY - headR * 0.62, headR * 0.24, headR * 0.13, -0.5, 0, Math.PI * 2);
      ctx.fill();
      // 额缝护面边沿（头盔下沿暗色窄条，强化"盔"感）
      this._setStroke(ctx, T.COLORS.Z_ARMOR_DARK, this._strokeW(T.STROKE.THIN));
      ctx.beginPath();
      ctx.moveTo(-headR * 0.92, headCY + headR * 0.18);
      ctx.lineTo( headR * 0.92, headCY + headR * 0.18);
      ctx.stroke();
      // 铆钉（额头正中 1 颗 + 两侧各 1 颗，金属扣件识别符号）
      ctx.fillStyle = T.COLORS.Z_BOLT;
      ctx.beginPath();
      ctx.arc(0, headCY - headR * 0.40, headR * 0.085, 0, Math.PI * 2);
      ctx.arc(-headR * 0.58, headCY - headR * 0.28, headR * 0.07, 0, Math.PI * 2);
      ctx.arc( headR * 0.58, headCY - headR * 0.28, headR * 0.07, 0, Math.PI * 2);
      ctx.fill();
      // 恢复主描边
      this._setStroke(ctx, T.COLORS.STROKE, this._strokeW(T.STROKE.MAIN));
    } else {
      // 橄榄球头盔（半圆头盔，直接画在头顶）
      ctx.fillStyle = T.COLORS.Z_HELMET;
      ctx.beginPath();
      ctx.arc(0, headCY, headR * 0.95, Math.PI * 1.02, Math.PI * 1.98);
      ctx.lineTo( headR * 0.92, headCY);
      ctx.lineTo(-headR * 0.92, headCY);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      if (T.SIMPLIFY.STRONG_HELMET_EAR) {
        ctx.fillStyle = T.COLORS.Z_HELMET_EAR;   // 耳朵（默认关闭）
        ctx.beginPath();
        ctx.arc(-headR * 0.78, headCY - headR * 0.98, headR * 0.22, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.arc( headR * 0.78, headCY - headR * 0.98, headR * 0.22, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      if (T.SIMPLIFY.STRONG_STAR_BADGE) {
        ctx.fillStyle = T.COLORS.Z_STAR;         // 星章（默认关闭）
        this._drawStarShape(ctx, 0, headCY - headR * 0.48, headR * 0.16, 5, 0.45);
        ctx.fill(); ctx.stroke();
      }
    }

    /* =============================================================
       表情系统 v3 阵营区分：使用 Z_FACE 独立比例 + 类型差异化表情
       - 植物：T.FACE 白描边 · 大圆眼 · 无辜感
       - 僵尸：Z_FACE 暗描边 · 小眼距宽 · 病态/疯狂/愤怒/冷酷
       ============================================================= */
    const ZF = T.Z_FACE;
    const eyeY  = headCY + headR * ZF.EYE_Y_OFFSET;
    const eyeR  = headR * ZF.EYE_R_RATIO;
    const eyeDX = headR * ZF.EYE_DX_RATIO;

    // 眼白（僵尸用暗色眼白描边，与植物白描边对比）
    ctx.fillStyle = T.COLORS.STROKE;
    ctx.beginPath();
    ctx.ellipse(-eyeDX, eyeY, eyeR * 0.96, eyeR, 0, 0, Math.PI * 2);
    ctx.ellipse( eyeDX, eyeY, eyeR * 0.96, eyeR, 0, 0, Math.PI * 2);
    ctx.fill();
    this._setStroke(ctx, T.COLORS.Z_STROKE, this._strokeW(T.STROKE.EYE));
    ctx.stroke();

    // 瞳孔（Z_FACE 比例：更小更偏，无神感）
    ctx.fillStyle = T.COLORS.INK;
    const pupilR = eyeR * ZF.PUPIL_R_RATIO;
    const pOffX  = eyeR * ZF.PUPIL_OFF_X;
    const pOffY  = eyeR * ZF.PUPIL_OFF_Y;
    ctx.beginPath();
    ctx.arc(-eyeDX + pOffX, eyeY + pOffY, pupilR, 0, Math.PI * 2);
    ctx.arc( eyeDX + pOffX, eyeY + pOffY, pupilR, 0, Math.PI * 2);
    ctx.fill();

    // 双高光（僵尸微弱，只有单颗小高光，植物是双大高光）
    ctx.fillStyle = T.COLORS.STROKE;
    ctx.beginPath();
    ctx.arc(-eyeDX + eyeR * 0.05, eyeY - eyeR * 0.08, pupilR * 0.35, 0, Math.PI * 2);
    ctx.arc( eyeDX + eyeR * 0.05, eyeY - eyeR * 0.08, pupilR * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // 类型差异化表情特征
    this._setStroke(ctx, T.COLORS.INK, this._strokeW(T.STROKE.INK));
    if (type === 'bucket') {
      // 铁桶僵尸：眼角下垂线（丧萌/疲惫），保留经典
      ctx.beginPath();
      ctx.moveTo(-eyeDX - eyeR * 0.95, eyeY + eyeR * 0.2);
      ctx.quadraticCurveTo(-eyeDX - eyeR * 0.5, eyeY + eyeR * 0.55, -eyeDX + eyeR * 0.1, eyeY + eyeR * 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo( eyeDX + eyeR * 0.95, eyeY + eyeR * 0.2);
      ctx.quadraticCurveTo( eyeDX + eyeR * 0.5, eyeY + eyeR * 0.55,  eyeDX - eyeR * 0.1, eyeY + eyeR * 0.7);
      ctx.stroke();
    } else if (type === 'imp') {
      // 小鬼僵尸：疯狂怒眉（V 字上扬眉）+ 眼袋
      ctx.beginPath();
      ctx.moveTo(-eyeDX - eyeR * 0.9, eyeY - eyeR * 0.6);
      ctx.lineTo(-eyeDX - eyeR * 0.1, eyeY - eyeR * 1.1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo( eyeDX + eyeR * 0.9, eyeY - eyeR * 0.6);
      ctx.lineTo( eyeDX + eyeR * 0.1, eyeY - eyeR * 1.1);
      ctx.stroke();
      // 眼袋（疯狂熬夜感）
      ctx.beginPath();
      ctx.moveTo(-eyeDX - eyeR * 0.7, eyeY + eyeR * 0.7);
      ctx.quadraticCurveTo(-eyeDX, eyeY + eyeR * 0.9, -eyeDX + eyeR * 0.7, eyeY + eyeR * 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo( eyeDX + eyeR * 0.7, eyeY + eyeR * 0.7);
      ctx.quadraticCurveTo( eyeDX, eyeY + eyeR * 0.9,  eyeDX - eyeR * 0.7, eyeY + eyeR * 0.7);
      ctx.stroke();
    } else if (type === 'football') {
      // 橄榄球僵尸：粗眉压眼（愤怒厚重感）
      this._setStroke(ctx, T.COLORS.INK, this._strokeW(T.STROKE.INK) * 1.4);
      ctx.beginPath();
      ctx.moveTo(-eyeDX - eyeR * 1.0, eyeY - eyeR * 0.35);
      ctx.lineTo(-eyeDX + eyeR * 0.5, eyeY - eyeR * 0.55);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo( eyeDX + eyeR * 1.0, eyeY - eyeR * 0.35);
      ctx.lineTo( eyeDX - eyeR * 0.5, eyeY - eyeR * 0.55);
      ctx.stroke();
      this._setStroke(ctx, T.COLORS.INK, this._strokeW(T.STROKE.INK));
    } else if (type === 'dancer') {
      // 舞王僵尸：冷峻窄眼线（护面缝隙后的冷酷凝视）
      ctx.beginPath();
      ctx.moveTo(-eyeDX - eyeR * 0.6, eyeY - eyeR * 0.15);
      ctx.lineTo(-eyeDX + eyeR * 0.6, eyeY - eyeR * 0.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo( eyeDX - eyeR * 0.6, eyeY - eyeR * 0.15);
      ctx.lineTo( eyeDX + eyeR * 0.6, eyeY - eyeR * 0.15);
      ctx.stroke();
    }

    // 腮红（僵尸更大更暗 = 病态红晕，Z_FACE 比例）
    ctx.fillStyle = T.COLORS.BLUSH_ZOMBIE;
    const blushCX = headR * ZF.BLUSH_CX;
    const blushCY = eyeY + headR * ZF.BLUSH_CY;
    const blushR  = headR * ZF.BLUSH_SIZE;
    ctx.beginPath();
    ctx.arc(-blushCX, blushCY, blushR, 0, Math.PI * 2);
    ctx.arc( blushCX, blushCY, blushR, 0, Math.PI * 2);
    ctx.fill();

    // 嘴型：按类型差异化（v3 阵营区分）
    const mouthY = eyeY + headR * ZF.MOUTH_Y_OFFSET;
    if (type === 'bucket') {
      // 铁桶僵尸：O型张嘴（呆萌/丧）
      ctx.fillStyle = T.COLORS.MOUTH_PINK;
      ctx.beginPath();
      ctx.ellipse(0, mouthY, headR * 0.12, headR * 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
      this._setStroke(ctx, T.COLORS.Z_STROKE, this._strokeW(T.STROKE.LIP));
      ctx.stroke();
      ctx.fillStyle = T.COLORS.MOUTH_LIP;
      ctx.beginPath();
      ctx.ellipse(0, mouthY + headR * 0.06, headR * 0.06, headR * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'imp') {
      // 小鬼僵尸：疯狂露齿笑（宽 grin）
      ctx.fillStyle = T.COLORS.MOUTH_PINK;
      ctx.beginPath();
      ctx.arc(0, mouthY - headR * 0.02, headR * 0.32, 0.08 * Math.PI, 0.92 * Math.PI);
      ctx.lineTo(headR * 0.24, mouthY - headR * 0.02);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = T.COLORS.STROKE;
      safeRoundRect(ctx, -headR * 0.18, mouthY - headR * 0.02, headR * 0.36, headR * 0.12, headR * 0.04);
      ctx.fill();
      this._setStroke(ctx, T.COLORS.Z_STROKE, this._strokeW(T.STROKE.LIP));
      ctx.stroke();
    } else if (type === 'football') {
      // 橄榄球僵尸：咬牙切齿方嘴（愤怒）
      ctx.fillStyle = T.COLORS.MOUTH_PINK;
      ctx.beginPath();
      safeRoundRect(ctx, -headR * 0.18, mouthY - headR * 0.08, headR * 0.36, headR * 0.16, headR * 0.04);
      ctx.fill();
      ctx.fillStyle = T.COLORS.STROKE;
      // 上下两排牙齿
      safeRoundRect(ctx, -headR * 0.14, mouthY - headR * 0.08, headR * 0.28, headR * 0.06, headR * 0.02);
      ctx.fill();
      safeRoundRect(ctx, -headR * 0.14, mouthY + headR * 0.02, headR * 0.28, headR * 0.06, headR * 0.02);
      ctx.fill();
      this._setStroke(ctx, T.COLORS.Z_STROKE, this._strokeW(T.STROKE.LIP));
      ctx.stroke();
    } else if (type === 'dancer') {
      // 舞王僵尸：冷酷直线嘴（grim）
      this._setStroke(ctx, T.COLORS.INK, this._strokeW(T.STROKE.INK));
      ctx.beginPath();
      ctx.moveTo(-headR * 0.18, mouthY);
      ctx.lineTo( headR * 0.18, mouthY);
      ctx.stroke();
    }

    return canvas;
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
   */
  render(gameState, zombies, plants, projectiles) {
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

      // 5. 粒子效果
      this._drawParticles(ctx);

      // 6. 暂停遮罩
      if (gameState && gameState.paused) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('已暂停', this.width / 2, this.height / 2);
      }
      // 渲染成功，重置错误计数
      this.renderErrorCount = 0;
    } catch (err) {
      this.renderErrorCount++;
      console.error('[Renderer] 渲染失败 #' + this.renderErrorCount + ':', err);
      // 连续 5 次渲染失败，停止主循环避免卡死
      if (this.renderErrorCount >= 5 && this.onRenderFatal) {
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
    // 受击闪烁
    if (zombie.hitFlash > 0) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(zombie.hitFlash / 30);
    }
    // 死亡渐隐
    if (zombie.state === 'dying') {
      ctx.globalAlpha = Math.max(0, 1 - zombie.stateTimer / 400);
      const dyScale = 1 + zombie.stateTimer / 400 * 0.5;
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
    // 受击闪烁
    if (plant.hitFlash > 0) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(plant.hitFlash / 20);
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
    ctx.globalAlpha = 1;
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
      ctx.beginPath();
      ctx.arc(-eyeDX + pOffX, eyeY + pOffY, pupilR, 0, Math.PI * 2);
      ctx.arc( eyeDX + pOffX, eyeY + pOffY, pupilR, 0, Math.PI * 2);
      ctx.fill();
      // 双高光（灵动两颗）
      ctx.fillStyle = T.COLORS.STROKE;
      ctx.beginPath();
      ctx.arc(-eyeDX + eyeR * 0.05, eyeY - eyeR * 0.08, pupilR * F.PUPIL_SHINE1, 0, Math.PI * 2);
      ctx.arc( eyeDX + eyeR * 0.05, eyeY - eyeR * 0.08, pupilR * F.PUPIL_SHINE1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-eyeDX + eyeR * 0.38, eyeY + eyeR * 0.26, pupilR * F.PUPIL_SHINE2, 0, Math.PI * 2);
      ctx.arc( eyeDX + eyeR * 0.38, eyeY + eyeR * 0.26, pupilR * F.PUPIL_SHINE2, 0, Math.PI * 2);
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
      this._setStroke(ctx, T.COLORS.STROKE, this._strokeW(T.STROKE.LIP));
      ctx.stroke();
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
   * 豌豆射手（设计系统 Tokens v2）：所有颜色/比例/高光从统一 tokens 取
   */
  _drawShooter(ctx, r, def, wobblePhase) {
    const T = this.T;
    const C = T.COLORS;
    const H = T.HEAD;
    const headR = r * 1.0;
    const headY = -r * 0.25;
    const swThin = this._strokeW(T.STROKE.THIN);

    // 两片叶（v3 简化：删除正下方第三片 DARK_LIGHT；保留左右两侧 LEAF_DARK/LEAF_MID 2 档更干净）
    ctx.fillStyle = C.S_LEAF_DARK;
    ctx.beginPath();
    ctx.ellipse(-r * 0.7, r * 0.55, r * 0.46, r * 0.22, -0.55, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = T.SIMPLIFY.LEAF_TIERS >= 2 ? C.S_LEAF_MID : C.S_LEAF_DARK;
    ctx.beginPath();
    ctx.ellipse( r * 0.7, r * 0.55, r * 0.46, r * 0.22,  0.55, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 茎（颜色加深一档，核心结构视觉更集中）
    ctx.fillStyle = C.S_STEM;
    ctx.beginPath();
    safeRoundRect(ctx, -r * 0.16, r * 0.1, r * 0.32, r * 0.52, r * 0.13);
    ctx.fill(); ctx.stroke();
    // 头
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.ellipse(0, headY, headR * 1.0, headR * 0.95, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 统一高光位：左上 45°
    ctx.fillStyle = 'rgba(255,255,255,' + H.HLIGHT_ALPHA + ')';
    ctx.beginPath();
    ctx.ellipse(headR * H.HLIGHT_X, headY + headR * H.HLIGHT_Y,
                headR * H.HLIGHT_W, headR * H.HLIGHT_H,
                H.HLIGHT_ROT, 0, Math.PI * 2);
    ctx.fill();
    // 发射口（上下两层：外圈+内黑孔，v3 保留并加粗描边——核心识别符号）
    ctx.fillStyle = C.S_MOUTH_OUT;
    ctx.beginPath();
    ctx.ellipse(0, headY - headR * 0.5, headR * 0.38, headR * 0.20, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.S_MOUTH_IN;
    ctx.beginPath();
    ctx.ellipse(0, headY - headR * 0.5, headR * 0.24, headR * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();
    // 头顶待发射豌豆 + 高光（核心识别符号，v3 略微加大 22→24%）
    ctx.fillStyle = C.S_PEA_LIGHT;
    ctx.beginPath();
    ctx.arc(0, headY - headR * 0.72, headR * 0.24, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.S_PEA_SHINE;
    ctx.beginPath();
    ctx.arc(-headR * 0.07, headY - headR * 0.78, headR * 0.08, 0, Math.PI * 2);
    ctx.fill();
    // 表情
    this._drawCuteFace(ctx, headR, headY + headR * H.SHOOTER_EYE_Y, {
      mouth: 'grin', wobblePhase: wobblePhase
    });
    // 消除 lint 提示（swThin 保留给后续细节扩展）
    void swThin;
  }

  /**
   * 坚果墙（Tokens v2）：高光统一位置 + 坚果线宽动态
   */
  _drawWall(ctx, r, def, wobblePhase) {
    const T = this.T;
    const C = T.COLORS;
    const H = T.HEAD;
    const headR = r * 1.02;
    const headY = r * 0.02;

    // 嫩芽：v3 只留中间最高一颗（核心识别符号），两侧删除——小尺寸下 2~3 颗会糊成一团
    if (T.SIMPLIFY.NUT_SPROUT_COUNT >= 1) {
      ctx.fillStyle = C.W_SPROUT_LIGHT;
      ctx.beginPath();
      ctx.ellipse(0, -r * 1.02, r * 0.20, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    if (T.SIMPLIFY.NUT_SPROUT_COUNT >= 3) {
      ctx.fillStyle = C.W_SPROUT_DARK;
      ctx.beginPath();
      ctx.ellipse(-r * 0.28, -r * 0.92, r * 0.18, r * 0.3, -0.35, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.ellipse( r * 0.28, -r * 0.92, r * 0.18, r * 0.3,  0.35, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    // 坚果身体
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.ellipse(0, headY, headR * 1.0, headR * 1.05, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 坚果壳纹：v3 3→2 条粗横纹（NUT_RIND_COUNT Tokens 控制），间距拉宽，一眼识别
    ctx.strokeStyle = C.W_RIND;
    ctx.lineWidth = this._strokeW(T.STROKE.THIN);
    const rindN = T.SIMPLIFY.NUT_RIND_COUNT; // 2 条：-0.22, +0.22（比原 ±0.28 间隔更紧凑但清晰）
    for (let i = 0; i < rindN; i++) {
      const t = rindN === 2 ? (i === 0 ? -0.22 : 0.22) : (i - 1) * 0.28;
      ctx.beginPath();
      ctx.ellipse(0, headY + t * headR, headR * 0.78, headR * 0.065, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 统一高光
    ctx.fillStyle = 'rgba(255,255,255,' + H.HLIGHT_ALPHA + ')';
    ctx.beginPath();
    ctx.ellipse(headR * H.HLIGHT_X, headY + headR * H.HLIGHT_Y,
                headR * (H.HLIGHT_W + 0.04), headR * (H.HLIGHT_H + 0.04),
                H.HLIGHT_ROT, 0, Math.PI * 2);
    ctx.fill();
    // 表情（坚毅微笑 + 浓腮红）
    this._drawCuteFace(ctx, headR, headY + headR * H.WALL_EYE_Y, {
      mouth: 'smile', wobblePhase: wobblePhase, blushColor: C.BLUSH_RICH
    });
  }

  /**
   * 寒冰射手（Tokens v2）：冰晶色板统一 + 雪花装饰
   */
  _drawFreezer(ctx, r, def, wobblePhase) {
    const T = this.T;
    const C = T.COLORS;
    const H = T.HEAD;
    const headR = r * 1.0;
    const headY = -r * 0.25;

    // 两片冰蓝叶（v3 简化：删除正下方第三片 LIGHT；保留左右两片 2 档色差）
    ctx.fillStyle = C.F_LEAF_DARK;
    ctx.beginPath();
    ctx.ellipse(-r * 0.7, r * 0.55, r * 0.46, r * 0.22, -0.55, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = T.SIMPLIFY.LEAF_TIERS >= 2 ? C.F_LEAF_MID : C.F_LEAF_DARK;
    ctx.beginPath();
    ctx.ellipse( r * 0.7, r * 0.55, r * 0.46, r * 0.22,  0.55, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 茎
    ctx.fillStyle = C.F_STEM;
    ctx.beginPath();
    safeRoundRect(ctx, -r * 0.16, r * 0.1, r * 0.32, r * 0.52, r * 0.13);
    ctx.fill(); ctx.stroke();
    // 头（冰晶六边形，与射手圆头明确区分——阵营内差异化）
    ctx.fillStyle = def.color;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
      const hx = Math.cos(angle) * headR * 1.02;
      const hy = headY + Math.sin(angle) * headR * 0.95;
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 冰感高光：比植物通用 +10% 大小 + 10% alpha
    ctx.fillStyle = 'rgba(255,255,255,' + Math.min(.55, H.HLIGHT_ALPHA + 0.1) + ')';
    ctx.beginPath();
    ctx.ellipse(headR * (H.HLIGHT_X - 0.04), headY + headR * H.HLIGHT_Y,
                headR * (H.HLIGHT_W + 0.02), headR * (H.HLIGHT_H + 0.02),
                H.HLIGHT_ROT, 0, Math.PI * 2);
    ctx.fill();
    // 发射口（保留并加粗——寒冰射手核心识别符号，"枪口"感）
    ctx.fillStyle = C.F_MOUTH_OUT;
    ctx.beginPath();
    ctx.ellipse(0, headY - headR * 0.5, headR * 0.38, headR * 0.20, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.F_MOUTH_IN;
    ctx.beginPath();
    ctx.ellipse(0, headY - headR * 0.5, headR * 0.22, headR * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();
    // 头顶大菱形冰晶（寒冰唯一最强识别符号，v3 保留并略微增大 0.22→0.24/高 1.05→1.12）
    ctx.fillStyle = C.F_CRYSTAL;
    ctx.beginPath();
    ctx.moveTo(0, headY - headR * 1.12);
    ctx.lineTo( headR * 0.24, headY - headR * 0.72);
    ctx.lineTo(0, headY - headR * 0.34);
    ctx.lineTo(-headR * 0.24, headY - headR * 0.72);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 冰晶十字纹：加粗（走 THIN v3 2.6），中心"十字"一眼识别，不再靠弱雪花
    this._setStroke(ctx, C.STROKE, this._strokeW(T.STROKE.THIN));
    ctx.beginPath();
    ctx.moveTo(0, headY - headR * 1.05);  ctx.lineTo(0, headY - headR * 0.40);
    ctx.moveTo(-headR * 0.18, headY - headR * 0.72); ctx.lineTo(headR * 0.18, headY - headR * 0.72);
    ctx.stroke();
    // v3 删掉六角雪花两颗（与冰晶信息重复、小尺寸糊成白点）
    // 原: _drawStarShape(ctx headR*0.55/_drawStarShape(ctx -headR*0.60…)
    // 表情：O型惊讶 + 冰蓝腮红
    this._drawCuteFace(ctx, headR, headY + headR * H.FREEZER_EYE_Y, {
      mouth: 'o', wobblePhase: wobblePhase, blushColor: C.BLUSH_COOL
    });
  }

  /**
   * 樱桃炸弹（v2 新增植物）：双樱桃 + 绿色引线 + 引信火花 + 爆炸前蓄力震动
   * 核心识别符号：两颗红樱桃 + 顶部绿色茎/引线 + 闪烁火星
   * @param {Object} plant - 植物对象（含 fuseTimer 用于蓄力震动）
   */
  _drawCherry(ctx, r, def, plant) {
    const T = this.T;
    const C = T.COLORS;
    const H = T.HEAD;
    const wobblePhase = plant.wobble;
    // 引信阶段震动：剩余时间越短震动越剧烈（< 800ms 开始抖）
    const fuseLeft = plant.fuseTimer || 0;
    const shake = fuseLeft > 0 && fuseLeft < 800
      ? (Math.sin(Date.now() / 30) * (1 - fuseLeft / 800) * 4)
      : 0;
    const headR = r * 0.72;
    const headY = -r * 0.05;

    ctx.save();
    if (shake) ctx.translate(shake, 0);

    // 绿色茎/引线（从两颗樱桃之间向上伸出，弯曲）
    ctx.fillStyle = C.C_FUSE;
    ctx.beginPath();
    ctx.moveTo(-r * 0.05, headY);
    ctx.quadraticCurveTo(-r * 0.35, headY - r * 0.7, -r * 0.15, headY - r * 1.05);
    ctx.quadraticCurveTo(r * 0.05, headY - r * 1.15, r * 0.20, headY - r * 0.95);
    ctx.quadraticCurveTo(r * 0.40, headY - r * 0.6, r * 0.05, headY);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 顶部小叶子
    ctx.fillStyle = C.C_LEAF;
    ctx.beginPath();
    ctx.ellipse(r * 0.22, headY - r * 1.0, r * 0.20, r * 0.12, 0.6, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // 左樱桃（略小，靠后）
    const lx = -r * 0.42, ly = headY + r * 0.18;
    ctx.fillStyle = C.C_BODY_DARK;
    ctx.beginPath();
    ctx.arc(lx, ly, headR * 0.88, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,' + H.HLIGHT_ALPHA + ')';
    ctx.beginPath();
    ctx.ellipse(lx - headR * 0.28, ly - headR * 0.28, headR * 0.20, headR * 0.30, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // 右樱桃（略大，靠前，主表情）
    const rx = r * 0.40, ry = headY + r * 0.25;
    ctx.fillStyle = C.C_BODY;
    ctx.beginPath();
    ctx.arc(rx, ry, headR * 1.0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 统一高光
    ctx.fillStyle = 'rgba(255,255,255,' + H.HLIGHT_ALPHA + ')';
    ctx.beginPath();
    ctx.ellipse(rx + headR * H.HLIGHT_X, ry + headR * H.HLIGHT_Y,
                headR * H.HLIGHT_W, headR * H.HLIGHT_H, H.HLIGHT_ROT, 0, Math.PI * 2);
    ctx.fill();

    // 右樱桃表情（愤怒爆发前：grin 露齿 + 浓腮红）
    this._drawCuteFace(ctx, headR, ry + headR * H.SHOOTER_EYE_Y, {
      mouth: 'grin', wobblePhase: wobblePhase, blushColor: C.BLUSH_RICH
    });

    // 左樱桃简易表情（单只小眯眼 + 小腮红，避免两颗脸打架）
    ctx.fillStyle = T.COLORS.STROKE;
    ctx.beginPath();
    ctx.arc(lx - headR * 0.22, ly - headR * 0.05, headR * 0.16, 0, Math.PI * 2);
    ctx.arc(lx + headR * 0.22, ly - headR * 0.05, headR * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = T.COLORS.INK;
    ctx.beginPath();
    ctx.arc(lx - headR * 0.18, ly - headR * 0.02, headR * 0.09, 0, Math.PI * 2);
    ctx.arc(lx + headR * 0.26, ly - headR * 0.02, headR * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.BLUSH_RICH;
    ctx.beginPath();
    ctx.arc(lx - headR * 0.40, ly + headR * 0.18, headR * 0.12, 0, Math.PI * 2);
    ctx.arc(lx + headR * 0.40, ly + headR * 0.18, headR * 0.12, 0, Math.PI * 2);
    ctx.fill();

    // 引信火花（引信末端闪烁星，引信<1s 时高频闪）
    if (fuseLeft > 0 && fuseLeft < 1000) {
      const sparkAlpha = 0.4 + 0.6 * Math.abs(Math.sin(Date.now() / (fuseLeft < 500 ? 50 : 100)));
      ctx.globalAlpha = sparkAlpha;
      ctx.fillStyle = C.C_SPARK;
      this._drawStarShape(ctx, r * 0.22, headY - r * 1.05, r * 0.16, 4, 0.5);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /**
   * 食人花（Chomper）：大口吞噬造型 + 紫色花冠 + 尖牙
   * 支持状态动画：snap（咬合张口→闭）、swallow（吞咽肚子鼓起）
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
    const headR = r * 1.0;
    const headY = -r * 0.25;

    // 吞咽期肚子微微鼓起（整体向下 + 放大）
    const swallowScale = 1 + swalP * 0.12;
    const swallowOffY = swalP * r * 0.08;
    ctx.save();
    ctx.translate(0, swallowOffY);
    ctx.scale(swallowScale, swallowScale);

    // 茎 + 两片叶
    ctx.fillStyle = '#6A1B9A';
    ctx.beginPath();
    ctx.ellipse(-r * 0.65, r * 0.55, r * 0.44, r * 0.20, -0.55, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse( r * 0.65, r * 0.55, r * 0.44, r * 0.20,  0.55, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8E24AA';
    safeRoundRect(ctx, -r * 0.14, r * 0.05, r * 0.28, r * 0.55, r * 0.12);
    ctx.beginPath(); ctx.fill(); ctx.stroke();

    // 头（大嘴）：咬合时有轻微前冲位移
    const snapLungeX = Math.sin(biteP * Math.PI) * r * 0.10;
    const snapLungeY = -Math.sin(biteP * Math.PI) * r * 0.08;
    ctx.save();
    ctx.translate(snapLungeX, snapLungeY);
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(0, headY, headR * 0.88, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // 大嘴开口：
    //   idle 时轻微呼吸张合 (0.5 + 0.3*sin)
    //   snap 时 前半段快速张到最大(progress 0~0.45) → 后半段快速闭合(0.45~1)
    let mouthOpen;
    if (chompState === 'snap') {
      if (biteP < 0.45) {
        // 张口阶段
        mouthOpen = 0.3 + (biteP / 0.45) * 1.0;  // 0.3 → 1.3
      } else {
        // 闭合阶段
        const t = (biteP - 0.45) / 0.55;
        mouthOpen = 1.3 - t * 1.0;  // 1.3 → 0.3
      }
    } else if (chompState === 'swallow') {
      // 吞咽期：嘴巴紧闭（消化中）
      mouthOpen = 0.15;
    } else {
      // idle：呼吸轻微开合
      mouthOpen = 0.5 + 0.3 * Math.sin(wobblePhase);
    }
    mouthOpen = Math.max(0.12, mouthOpen);

    // 口腔内部（咬合瞬间有红色闪光）
    const mouthFlash = (chompState === 'snap' && biteP >= 0.4 && biteP <= 0.65) ? 1 : 0;
    ctx.fillStyle = mouthFlash ? '#B71C1C' : '#311B92';
    ctx.beginPath();
    ctx.ellipse(0, headY + headR * 0.15,
                headR * 0.55, headR * 0.35 * mouthOpen,
                0, 0, Math.PI * 2);
    ctx.fill();

    // 咬合闪光：口腔内白色一闪
    if (mouthFlash) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.ellipse(0, headY + headR * 0.18, headR * 0.3, headR * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 尖牙：张口越大，牙齿越外露
    const teethShow = Math.min(1, mouthOpen / 0.8);
    ctx.fillStyle = '#FFFFFF';
    const teeth = [
      [-0.35, 0.05], [0.35, 0.05],
      [-0.30, 0.25], [0.30, 0.25]
    ];
    teeth.forEach(([dx, dy]) => {
      const depth = teethShow;
      ctx.beginPath();
      ctx.moveTo(headR * dx - headR * 0.08, headY + headR * dy);
      ctx.lineTo(headR * dx, headY + headR * (dy - 0.20 * depth));
      ctx.lineTo(headR * dx + headR * 0.08, headY + headR * dy);
      ctx.closePath();
      ctx.fill();
    });

    // 吞咽时的腹部凸起：头下方多画一个紫色椭圆
    if (swalP > 0.05) {
      ctx.fillStyle = '#6A1B9A';
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.ellipse(0, headY + headR * 0.55 + swalP * r * 0.05,
                  headR * (0.52 + swalP * 0.28),
                  headR * (0.25 + swalP * 0.20),
                  0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 高光
    ctx.fillStyle = 'rgba(255,255,255,' + H.HLIGHT_ALPHA + ')';
    ctx.beginPath();
    ctx.ellipse(headR * H.HLIGHT_X, headY + headR * H.HLIGHT_Y,
                headR * H.HLIGHT_W, headR * H.HLIGHT_H, H.HLIGHT_ROT, 0, Math.PI * 2);
    ctx.fill();

    // 表情：吞咽期眼睛眯成半月（满足）
    const mouthForFace = (chompState === 'swallow') ? 'happy' : 'grin';
    this._drawCuteFace(ctx, headR, headY + headR * H.SHOOTER_EYE_Y, {
      mouth: mouthForFace, wobblePhase: wobblePhase, blushColor: 'rgba(180,130,220,0.5)'
    });
    ctx.restore();  // snap head offset
    ctx.restore();  // swallow scale
  }

  /**
   * 向日葵（Sunflower）：金黄花瓣 + 棕色花心 + 笑脸
   */
  _drawSunflower(ctx, r, def, wobblePhase) {
    const T = this.T;
    const C = T.COLORS;
    const H = T.HEAD;
    const headR = r * 0.95;
    const headY = -r * 0.2;

    // 茎 + 两片叶
    ctx.fillStyle = '#66BB6A';
    ctx.beginPath();
    ctx.ellipse(-r * 0.6, r * 0.5, r * 0.4, r * 0.18, -0.55, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse( r * 0.6, r * 0.5, r * 0.4, r * 0.18,  0.55, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4CAF50';
    ctx.beginPath();
    safeRoundRect(ctx, -r * 0.12, r * 0.05, r * 0.24, r * 0.5, r * 0.1);
    ctx.fill(); ctx.stroke();
    // 花瓣（8片环绕）
    ctx.fillStyle = def.color;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + Math.sin(wobblePhase) * 0.05;
      const px = Math.cos(angle) * headR * 0.62;
      const py = headY + Math.sin(angle) * headR * 0.62;
      ctx.beginPath();
      ctx.ellipse(px, py, headR * 0.36, headR * 0.18, angle, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    // 花心（棕色）
    ctx.fillStyle = '#795548';
    ctx.beginPath();
    ctx.arc(0, headY, headR * 0.5, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 花心纹理
    ctx.fillStyle = '#8D6E63';
    ctx.beginPath();
    ctx.arc(0, headY, headR * 0.3, 0, Math.PI * 2);
    ctx.fill();
    // 花心高光
    ctx.fillStyle = 'rgba(255,255,255,' + H.HLIGHT_ALPHA + ')';
    ctx.beginPath();
    ctx.ellipse(headR * 0.08, headY - headR * 0.12, headR * 0.16, headR * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();
    // 表情
    this._drawCuteFace(ctx, headR, headY + headR * H.WALL_EYE_Y, {
      mouth: 'smile', wobblePhase: wobblePhase, blushColor: 'rgba(255,180,100,0.5)'
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
      // 拖尾火苗（向后偏移，随速度拉长）
      const trailOff = -proj.vy * 0.025;
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = this.T.COLORS.FIRE_FLAME;
      ctx.beginPath();
      ctx.ellipse(x, y + trailOff, R * 1.0, R * 1.4, 0, 0, Math.PI * 2);
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
    // 拖尾
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = proj.color;
    ctx.beginPath();
    ctx.arc(proj.x, proj.y - proj.vy * 0.02, proj.radius * 0.8, 0, Math.PI * 2);
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
  addBurst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const speed = 60 + Math.random() * 80;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 500,
        maxLife: 500,
        color: color || '#FFC733',
        size: 4 + Math.random() * 4
      });
    }
  }

  /**
   * 绘制并更新粒子
   */
  _drawParticles(ctx) {
    const dt = 16;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt / 1000;
      p.y += p.vy * dt / 1000;
      p.vy += 200 * dt / 1000;  // 重力
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
