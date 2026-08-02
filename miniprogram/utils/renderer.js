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
   * 离屏渲染：单只僵尸（萌系绘制）
   * 离屏图尺寸按最大半径2倍，缩放复用
   */
  _renderZombieToOffscreen(type) {
    const def = ZOMBIE_TYPES[type];
    const r = 50;
    const size = r * 2 + 20;
    const canvas = wx.createOffscreenCanvas ? wx.createOffscreenCanvas({
      type: '2d',
      width: size * this.dpr,
      height: size * this.dpr
    }) : null;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    ctx.scale(this.dpr, this.dpr);
    ctx.translate(size / 2, size / 2);

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(0, r - 4, r * 0.7, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // 身体
    ctx.fillStyle = def.color;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.beginPath();
    safeRoundRect(ctx, -r * 0.5, -r * 0.1, r, r * 0.7, r * 0.3);
    ctx.fill();
    ctx.stroke();

    // 头
    ctx.beginPath();
    ctx.arc(0, -r * 0.3, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 路障帽（普通）/ 头带（快速）/ 头盔（强壮）
    if (type === 'normal') {
      ctx.fillStyle = '#FFC733';
      ctx.beginPath();
      ctx.moveTo(-r * 0.45, -r * 0.55);
      ctx.lineTo(r * 0.45, -r * 0.55);
      ctx.lineTo(r * 0.32, -r * 0.95);
      ctx.lineTo(-r * 0.32, -r * 0.95);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (type === 'fast') {
      ctx.fillStyle = '#FF8A65';
      ctx.beginPath();
      safeRoundRect(ctx, -r * 0.5, -r * 0.75, r, r * 0.18, 4);
      ctx.fill();
      ctx.stroke();
    } else {
      // 强壮: 头盔半圆
      ctx.fillStyle = '#90A4AE';
      ctx.beginPath();
      ctx.arc(0, -r * 0.3, r * 0.55, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
    }

    // 眼睛
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-r * 0.18, -r * 0.32, r * 0.12, 0, Math.PI * 2);
    ctx.arc(r * 0.18, -r * 0.32, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3E2723';
    ctx.beginPath();
    ctx.arc(-r * 0.15, -r * 0.30, r * 0.06, 0, Math.PI * 2);
    ctx.arc(r * 0.21, -r * 0.30, r * 0.06, 0, Math.PI * 2);
    ctx.fill();
    // 腮红
    ctx.fillStyle = 'rgba(255, 182, 193, 0.7)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.32, -r * 0.18, r * 0.08, r * 0.05, 0, 0, Math.PI * 2);
    ctx.ellipse(r * 0.32, -r * 0.18, r * 0.08, r * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    // 嘴
    ctx.strokeStyle = '#3E2723';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -r * 0.15, r * 0.1, 0, Math.PI);
    ctx.stroke();

    return canvas;
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
   * 绘制植物（emoji + 血条 + 摇摆 + 受击闪烁）
   */
  _drawPlant(ctx, plant) {
    const def = plant.def;
    if (!def) return;
    const cs = pathManager.getCellSize();
    const size = Math.min(cs.w, cs.h) * 0.78;
    const wobbleX = Math.sin(plant.wobble) * 2;

    ctx.save();
    ctx.translate(plant.x + wobbleX, plant.y);
    // 受击闪烁
    if (plant.hitFlash > 0) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(plant.hitFlash / 20);
    }
    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(0, size * 0.45, size * 0.4, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    // emoji 绘制
    ctx.font = size + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.emoji || '🌿', 0, 0);
    // 血条（受伤时显示）
    if (plant.maxHealth > 1 && plant.health < plant.maxHealth) {
      const barW = size * 0.9;
      const barH = 5;
      const barY = -size * 0.55;
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-barW / 2, barY, barW, barH);
      ctx.fillStyle = '#66BB6A';
      ctx.fillRect(-barW / 2, barY, barW * (plant.health / plant.maxHealth), barH);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
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
