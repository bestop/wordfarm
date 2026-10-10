// utils/canvasHelpers.js - Canvas 2D 兼容函数(v55 自 renderer.js 拆分)
// roundRectPolyfill: 基础库 < 2.31.0 / 低端安卓无 ctx.roundRect 的兼容实现
// safeRoundRect: 优先原生, 不存在则 polyfill(renderer 与 zombiePainter 共用)
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

module.exports = {
  roundRectPolyfill,
  safeRoundRect
};
