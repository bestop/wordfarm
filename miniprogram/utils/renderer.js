// utils/renderer.js - Canvas 2D 渲染器
// 负责: 背景绘制、僵尸绘制、植物绘制、HUD、粒子效果
// 采用离屏 Canvas 缓存复杂元素提升性能

const { ZOMBIE_TYPES } = require('./constants.js');
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
class Renderer {
  constructor() {
    this.ctx = null;          // 主 canvas 上下文
    this.dpr = 1;             // 设备像素比
    this.width = 0;           // CSS 像素宽
    this.height = 0;          // CSS 像素高
    this.offscreenCache = {}; // 离屏缓存 {key: canvas}
    this.particles = [];      // 粒子系统
    this.renderErrorCount = 0; // 渲染错误计数（连续错误则降级）
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
    } catch (err) {
      console.error('[Renderer] 离屏缓存构建失败，降级为实时渲染:', err);
      this.offscreenCache = {};
    }
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
   * 离屏渲染：单只僵尸（Q版萌系大头小身）
   * 比例：头部占整体 60%+，圆润线条 + 夸张大眼 + 可爱装饰
   * 离屏图按 120px 高绘制，主循环按 zombie.radius 缩放复用
   */
  _renderZombieToOffscreen(type) {
    const def = ZOMBIE_TYPES[type];
    const UNIT = 50;              // 基准单位：全部比例基于此
    const size = UNIT * 2.6;      // 画布尺寸（留出阴影与头部装饰）
    const canvas = wx.createOffscreenCanvas ? wx.createOffscreenCanvas({
      type: '2d',
      width: size * this.dpr,
      height: size * this.dpr
    }) : null;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    ctx.scale(this.dpr, this.dpr);
    ctx.translate(size / 2, size / 2);

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // 阴影（在底部）
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.beginPath();
    ctx.ellipse(0, UNIT * 1.12, UNIT * 0.72, UNIT * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // 小手臂（两只肉肉的短手，身体两侧）
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.ellipse(-UNIT * 0.62, UNIT * 0.35, UNIT * 0.18, UNIT * 0.25, -0.35, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(UNIT * 0.62, UNIT * 0.35, UNIT * 0.18, UNIT * 0.25, 0.35, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // 身体（极短的圆胖身躯，Q版夸张比例）
    ctx.fillStyle = def.color;
    ctx.beginPath();
    safeRoundRect(ctx, -UNIT * 0.4, UNIT * 0.12, UNIT * 0.8, UNIT * 0.55, UNIT * 0.28);
    ctx.fill(); ctx.stroke();
    // 肚皮高光（浅色调斑点）
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, UNIT * 0.4, UNIT * 0.22, UNIT * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    // 腿（两只短短的圆腿）
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.ellipse(-UNIT * 0.2, UNIT * 0.8, UNIT * 0.16, UNIT * 0.14, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(UNIT * 0.2, UNIT * 0.8, UNIT * 0.16, UNIT * 0.14, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // 大头（Q版核心：占身体 60% 以上，上移以便装饰头顶）
    const headCY = -UNIT * 0.18;
    const headR  =  UNIT * 0.68;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(0, headCY, headR, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // 头顶装饰（按类型差异化：交通锥/蝴蝶结/头盔+角）
    if (type === 'normal') {
      // 交通锥（小黄锥 + 白纹）
      ctx.fillStyle = '#FFCA28';
      ctx.beginPath();
      ctx.moveTo(-headR * 0.55, headCY - headR * 0.2);
      ctx.lineTo(headR * 0.55, headCY - headR * 0.2);
      ctx.lineTo(headR * 0.28, headCY - headR * 1.35);
      ctx.lineTo(-headR * 0.28, headCY - headR * 1.35);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // 白条纹
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      safeRoundRect(ctx, -headR * 0.4, headCY - headR * 0.48, headR * 0.8, headR * 0.12, headR * 0.05);
      ctx.fill(); ctx.stroke();
    } else if (type === 'fast') {
      // 蝴蝶结头带（飘带 + 中央爱心）
      ctx.fillStyle = '#FF6E40';
      ctx.beginPath();
      safeRoundRect(ctx, -headR * 0.95, headCY - headR * 0.55, headR * 1.9, headR * 0.18, headR * 0.08);
      ctx.fill(); ctx.stroke();
      // 蝴蝶结左侧
      ctx.beginPath();
      ctx.moveTo(-headR * 0.3, headCY - headR * 0.46);
      ctx.lineTo(-headR * 0.85, headCY - headR * 0.95);
      ctx.lineTo(-headR * 0.85, headCY - headR * 0.02);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // 蝴蝶结右侧
      ctx.beginPath();
      ctx.moveTo(headR * 0.3, headCY - headR * 0.46);
      ctx.lineTo(headR * 0.85, headCY - headR * 0.95);
      ctx.lineTo(headR * 0.85, headCY - headR * 0.02);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // 中央爱心
      ctx.fillStyle = '#FFFFFF';
      this._drawHeartShape(ctx, 0, headCY - headR * 0.48, headR * 0.16);
      ctx.fill(); ctx.stroke();
    } else {
      // 强壮头盔：银灰色 + 两个小熊耳朵 + 星章
      ctx.fillStyle = '#B0BEC5';
      ctx.beginPath();
      ctx.arc(0, headCY, headR * 0.95, Math.PI * 1.02, Math.PI * 1.98);
      ctx.lineTo(headR * 0.92, headCY);
      ctx.lineTo(-headR * 0.92, headCY);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // 两个耳朵（圆）
      ctx.fillStyle = '#78909C';
      ctx.beginPath();
      ctx.arc(-headR * 0.78, headCY - headR * 0.98, headR * 0.22, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.arc(headR * 0.78, headCY - headR * 0.98, headR * 0.22, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // 中央星章
      ctx.fillStyle = '#FFD54F';
      this._drawStarShape(ctx, 0, headCY - headR * 0.48, headR * 0.16, 5, 0.45);
      ctx.fill(); ctx.stroke();
    }

    // 超大大眼（Q版核心）
    const eyeY  = headCY + headR * 0.02;
    const eyeR  = headR * 0.27;
    const eyeDX = headR * 0.33;
    // 眼白（略带淡粉，萌）
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-eyeDX, eyeY, eyeR, 0, Math.PI * 2);
    ctx.arc( eyeDX, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    // 瞳孔（夸张大，看向右下方显得无辜呆萌）
    ctx.fillStyle = '#4E342E';
    ctx.beginPath();
    ctx.arc(-eyeDX + eyeR * 0.18, eyeY + eyeR * 0.18, eyeR * 0.62, 0, Math.PI * 2);
    ctx.arc( eyeDX + eyeR * 0.18, eyeY + eyeR * 0.18, eyeR * 0.62, 0, Math.PI * 2);
    ctx.fill();
    // 瞳仁高光（两点，灵动）
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-eyeDX + eyeR * 0.08, eyeY + eyeR * 0.02, eyeR * 0.18, 0, Math.PI * 2);
    ctx.arc( eyeDX + eyeR * 0.08, eyeY + eyeR * 0.02, eyeR * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-eyeDX + eyeR * 0.34, eyeY + eyeR * 0.34, eyeR * 0.08, 0, Math.PI * 2);
    ctx.arc( eyeDX + eyeR * 0.34, eyeY + eyeR * 0.34, eyeR * 0.08, 0, Math.PI * 2);
    ctx.fill();
    // 眼角下垂线（丧萌感）
    ctx.strokeStyle = '#4E342E';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-eyeDX - eyeR * 0.95, eyeY + eyeR * 0.2);
    ctx.quadraticCurveTo(-eyeDX - eyeR * 0.5, eyeY + eyeR * 0.55, -eyeDX + eyeR * 0.1, eyeY + eyeR * 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(eyeDX + eyeR * 0.95, eyeY + eyeR * 0.2);
    ctx.quadraticCurveTo(eyeDX + eyeR * 0.5, eyeY + eyeR * 0.55, eyeDX - eyeR * 0.1, eyeY + eyeR * 0.7);
    ctx.stroke();

    // 腮红（爱心形，更萌）
    ctx.fillStyle = 'rgba(255, 120, 150, 0.65)';
    this._drawHeartShape(ctx, -eyeDX * 1.55, eyeY + eyeR * 0.82, eyeR * 0.22);
    ctx.fill();
    this._drawHeartShape(ctx,  eyeDX * 1.55, eyeY + eyeR * 0.82, eyeR * 0.22);
    ctx.fill();

    // 小嘴巴（O型张嘴惊讶笑，更萌）
    ctx.fillStyle = '#E91E63';
    ctx.beginPath();
    ctx.ellipse(0, eyeY + headR * 0.62, headR * 0.12, headR * 0.17, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 小嘴内部高光（下嘴唇）
    ctx.fillStyle = '#F48FB1';
    ctx.beginPath();
    ctx.ellipse(0, eyeY + headR * 0.68, headR * 0.06, headR * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

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

    ctx.save();
    ctx.translate(plant.x + wobbleX, plant.y);
    // 受击闪烁
    if (plant.hitFlash > 0) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(plant.hitFlash / 20);
    }
    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.beginPath();
    ctx.ellipse(0, r * 1.05, r * 0.9, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // 公共描边样式（与僵尸统一的萌系白边）
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';

    // 按类型绘制植物造型（wobble 作为眨眼动画相位传递下去）
    switch (def.type) {
      case 'shooter': this._drawShooter(ctx, r, def, plant.wobble); break;
      case 'wall':    this._drawWall(ctx, r, def, plant.wobble); break;
      case 'freezer': this._drawFreezer(ctx, r, def, plant.wobble); break;
      default:        this._drawWall(ctx, r, def, plant.wobble); break;
    }

    // 血条（受伤时显示）
    if (plant.maxHealth > 1 && plant.health < plant.maxHealth) {
      const barW = size * 0.9;
      const barH = 5;
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
   * 萌系表情（Q版升级）：支持眨眼动画、爱心腮红、多种嘴型
   * @param {number} r     - 头部基准半径
   * @param {number} cy    - 表情中心 y 坐标
   * @param {Object} [opts]
   * @param {'smile'|'o'|'grin'} [opts.mouth='smile'] - 嘴型
   * @param {number} [opts.wobblePhase=0] - 摇摆相位（用于眨眼动画）
   * @param {string} [opts.blushColor='rgba(255,150,170,0.65)'] - 腮红色
   */
  _drawCuteFace(ctx, r, cy, opts = {}) {
    const mouth       = opts.mouth       || 'smile';
    const wobblePhase = opts.wobblePhase || 0;
    const blushColor  = opts.blushColor  || 'rgba(255, 150, 170, 0.65)';
    // 眼睛参数：Q版大比例
    const eyeDX = r * 0.36;
    const eyeR  = r * 0.24;
    const eyeY  = cy;
    // 眨眼：每 2.5s 眨一次（wobblePhase 驱动的 sin 周期），持续约 120ms
    const blinkT = (Math.sin(wobblePhase) + 1) / 2;   // 0~1
    const blink  = blinkT > 0.94 ? (1 - (blinkT - 0.94) / 0.06) : 1;  // 1 睁眼 → 0 闭眼
    const eyeH   = Math.max(0.05, eyeR * blink);

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';

    // 眼白（睁眼时椭圆，闭眼时窄缝）
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(-eyeDX, eyeY, eyeR * 0.96, eyeH, 0, 0, Math.PI * 2);
    ctx.ellipse( eyeDX, eyeY, eyeR * 0.96, eyeH, 0, 0, Math.PI * 2);
    ctx.fill();
    // 眼睛白描边
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    if (blink > 0.4) {
      // 瞳孔（仅睁眼状态）
      ctx.fillStyle = '#4E342E';
      const pupilR = eyeR * 0.56 * blink;
      // 瞳孔偏右下，显得无辜呆萌
      const pOffsetX = eyeR * 0.16;
      const pOffsetY = eyeR * 0.14;
      ctx.beginPath();
      ctx.arc(-eyeDX + pOffsetX, eyeY + pOffsetY, pupilR, 0, Math.PI * 2);
      ctx.arc( eyeDX + pOffsetX, eyeY + pOffsetY, pupilR, 0, Math.PI * 2);
      ctx.fill();
      // 双高光（灵动）
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(-eyeDX + eyeR * 0.05, eyeY - eyeR * 0.08, pupilR * 0.42, 0, Math.PI * 2);
      ctx.arc( eyeDX + eyeR * 0.05, eyeY - eyeR * 0.08, pupilR * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-eyeDX + eyeR * 0.38, eyeY + eyeR * 0.26, pupilR * 0.18, 0, Math.PI * 2);
      ctx.arc( eyeDX + eyeR * 0.38, eyeY + eyeR * 0.26, pupilR * 0.18, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 闭眼：用两条弧线代替（眯眯笑眼）
      ctx.strokeStyle = '#4E342E';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(-eyeDX, eyeY + eyeR * 0.2, eyeR * 0.5, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc( eyeDX, eyeY + eyeR * 0.2, eyeR * 0.5, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    }

    // 腮红（爱心形，视觉更萌）
    ctx.fillStyle = blushColor;
    const blushCX = r * 0.62;
    const blushCY = cy + r * 0.38;
    this._drawHeartShape(ctx, -blushCX, blushCY, r * 0.15);
    ctx.fill();
    this._drawHeartShape(ctx,  blushCX, blushCY, r * 0.15);
    ctx.fill();

    // 嘴型（三种）
    const mouthY = cy + r * 0.5;
    if (mouth === 'o') {
      // O型张嘴惊讶笑
      ctx.fillStyle = '#E91E63';
      ctx.beginPath();
      ctx.ellipse(0, mouthY, r * 0.13, r * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // 下嘴唇内高光
      ctx.fillStyle = '#F48FB1';
      ctx.beginPath();
      ctx.ellipse(0, mouthY + r * 0.06, r * 0.06, r * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (mouth === 'grin') {
      // 露齿笑（宽嘴）
      ctx.fillStyle = '#E91E63';
      ctx.beginPath();
      ctx.arc(0, mouthY - r * 0.02, r * 0.28, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.lineTo(r * 0.22, mouthY - r * 0.02);
      ctx.closePath();
      ctx.fill();
      // 牙齿
      ctx.fillStyle = '#FFFFFF';
      safeRoundRect(ctx, -r * 0.15, mouthY - r * 0.02, r * 0.3, r * 0.1, r * 0.03);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else {
      // 微笑（默认）：上扬弧线
      ctx.strokeStyle = '#4E342E';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, mouthY - r * 0.15, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * 豌豆射手（Q版升级）：大头 + 头顶豌豆 + 圆润茎叶 + 大大发射口
   */
  _drawShooter(ctx, r, def, wobblePhase) {
    const headR = r * 1.0;            // 头部更大
    const headY = -r * 0.25;          // 头部略偏上
    // 底部三片叶子（更饱满扇形）
    ctx.fillStyle = '#AED581';
    ctx.beginPath();
    ctx.ellipse(-r * 0.7, r * 0.55, r * 0.46, r * 0.22, -0.55, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9CCC65';
    ctx.beginPath();
    ctx.ellipse( r * 0.7, r * 0.55, r * 0.46, r * 0.22,  0.55, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#C5E1A5';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.72, r * 0.32, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 茎（粗短，圆润）
    ctx.fillStyle = '#7CB342';
    ctx.beginPath();
    safeRoundRect(ctx, -r * 0.16, r * 0.1, r * 0.32, r * 0.52, r * 0.13);
    ctx.fill(); ctx.stroke();
    // 头部（略椭圆、圆头圆脑）
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.ellipse(0, headY, headR * 1.0, headR * 0.95, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 头顶"待发射"豌豆（小绿珠在口前上方，暗示攻击）
    ctx.fillStyle = '#C5E1A5';
    ctx.beginPath();
    ctx.arc(0, headY - headR * 0.72, headR * 0.22, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#F1F8E9';
    ctx.beginPath();
    ctx.arc(-headR * 0.07, headY - headR * 0.78, headR * 0.07, 0, Math.PI * 2);
    ctx.fill();
    // 发射口（在豌豆下方）
    ctx.fillStyle = '#558B2F';
    ctx.beginPath();
    ctx.ellipse(0, headY - headR * 0.5, headR * 0.38, headR * 0.18, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#33691E';
    ctx.beginPath();
    ctx.ellipse(0, headY - headR * 0.5, headR * 0.22, headR * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    // 头部高光
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.38, headY - headR * 0.3, headR * 0.2, headR * 0.36, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // 表情（露齿笑）
    this._drawCuteFace(ctx, headR, headY + headR * 0.08, { mouth: 'grin', wobblePhase: wobblePhase });
  }

  /**
   * 坚果墙（Q版升级）：大头 + 头顶小芽 + 坚毅纹 + 腮红
   */
  _drawWall(ctx, r, def, wobblePhase) {
    const headR = r * 1.02;
    const headY = r * 0.02;
    // 头顶三片嫩芽（代替小叶，更可爱）
    ctx.fillStyle = '#66BB6A';
    ctx.beginPath();
    ctx.ellipse(-r * 0.28, -r * 0.92, r * 0.18, r * 0.3, -0.35, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#81C784';
    ctx.beginPath();
    ctx.ellipse(0, -r * 1.02, r * 0.15, r * 0.36, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#66BB6A';
    ctx.beginPath();
    ctx.ellipse(r * 0.28, -r * 0.92, r * 0.18, r * 0.3, 0.35, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 身体（圆胖坚果）
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.ellipse(0, headY, headR * 1.0, headR * 1.05, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 坚果树纹（三条弧形横纹，坚果质感）
    ctx.strokeStyle = 'rgba(109, 76, 65, 0.35)';
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.ellipse(0, headY + i * headR * 0.28, headR * 0.78, headR * 0.06, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 高光（大块）
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.4, headY - headR * 0.38, headR * 0.26, headR * 0.44, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // 表情（坚毅微笑 + 深红腮红）
    this._drawCuteFace(ctx, headR, headY + headR * 0.1, {
      mouth: 'smile',
      wobblePhase: wobblePhase,
      blushColor: 'rgba(244, 143, 177, 0.75)'
    });
  }

  /**
   * 寒冰射手（Q版升级）：大头 + 头顶雪花冰晶 + 晶莹冰感 + 雪花散落装饰
   */
  _drawFreezer(ctx, r, def, wobblePhase) {
    const headR = r * 1.0;
    const headY = -r * 0.25;
    // 底部三片冰蓝叶
    ctx.fillStyle = '#B2EBF2';
    ctx.beginPath();
    ctx.ellipse(-r * 0.7, r * 0.55, r * 0.46, r * 0.22, -0.55, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#80DEEA';
    ctx.beginPath();
    ctx.ellipse( r * 0.7, r * 0.55, r * 0.46, r * 0.22,  0.55, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#D1F4F8';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.72, r * 0.32, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 茎
    ctx.fillStyle = '#4DD0E1';
    ctx.beginPath();
    safeRoundRect(ctx, -r * 0.16, r * 0.1, r * 0.32, r * 0.52, r * 0.13);
    ctx.fill(); ctx.stroke();
    // 头部（冰蓝）
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.ellipse(0, headY, headR * 1.0, headR * 0.95, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 头部大块高光（冰感）
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.42, headY - headR * 0.3, headR * 0.22, headR * 0.42, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // 发射口
    ctx.fillStyle = '#0277BD';
    ctx.beginPath();
    ctx.ellipse(0, headY - headR * 0.5, headR * 0.36, headR * 0.18, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#01579B';
    ctx.beginPath();
    ctx.ellipse(0, headY - headR * 0.5, headR * 0.2, headR * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    // 发射口上方大冰晶（菱形雪花）
    ctx.fillStyle = '#E1F5FE';
    ctx.beginPath();
    ctx.moveTo(0, headY - headR * 1.05);
    ctx.lineTo(headR * 0.2, headY - headR * 0.7);
    ctx.lineTo(0, headY - headR * 0.36);
    ctx.lineTo(-headR * 0.2, headY - headR * 0.7);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 冰晶十字纹
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, headY - headR * 1.0); ctx.lineTo(0, headY - headR * 0.42);
    ctx.moveTo(-headR * 0.15, headY - headR * 0.7); ctx.lineTo(headR * 0.15, headY - headR * 0.7);
    ctx.stroke();
    // 头部周围两颗小雪花点缀
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    this._drawStarShape(ctx, headR * 0.55, headY - headR * 0.05, headR * 0.1, 6, 0.5);
    ctx.fill();
    this._drawStarShape(ctx, -headR * 0.6, headY + headR * 0.2, headR * 0.08, 6, 0.5);
    ctx.fill();
    // 表情（O型惊讶 + 冷调腮蓝）
    this._drawCuteFace(ctx, headR, headY + headR * 0.08, {
      mouth: 'o',
      wobblePhase: wobblePhase,
      blushColor: 'rgba(120, 200, 255, 0.55)'
    });
  }

  /**
   * 绘制投射物（实心圆 + 拖尾）
   */
  _drawProjectile(ctx, proj) {
    ctx.save();
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
