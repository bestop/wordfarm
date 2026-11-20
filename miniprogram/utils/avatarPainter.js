// utils/avatarPainter.js - 角色真实形象头像生成（v90 精准复刻版）
// 目标：商店栏头像与游戏内 Canvas 角色 / 角色图鉴 1:1 同源 ——
//   不再用 CSS 简化图形近似，而是直接复用 renderer 的植物矢量绘制管线
//   （与附图角色形象同一份源码），离屏渲染后输出 dataURL 供 <image> 使用。
// 设计规格（与角色图鉴卡一致）：
//   · 96×96 逻辑像素（@2x 超采样输出 192×192 PNG）
//   · 圆形头像盘 = 本命柔色底 + 左上柔光 + 白描边环
//   · 角色按游戏内标准待机姿态绘制（wobble=0 / 满血无血条 / 无后坐力）
// 兜底：任一环节失败返回 ''，商店栏回退旧 CSS 头像（game.wxml wx:else）
const { PLANT_TYPES } = require('./constants.js');
const { pathManager } = require('./pathManager.js');
const { renderer } = require('./renderer.js');

// 头像盘底色（与角色图鉴卡 cardbg 同源，本命色系柔化）
const AVATAR_BG = {
  sunflower: '#FFF3C4',
  shooter: '#E7F6D2',
  wall: '#F3E4D3',
  freezer: '#DFF6F4',
  cherry: '#FDE2DE',
  chomper: '#F0DFF7',
  fire: '#FFE4D1'
};

const SIZE = 96;      // 头像逻辑边长
const CHAR_R = 22;    // 角色头部基准半径（r = size*0.78*0.42 换算反向取值）

/**
 * 生成单个植物头像 dataURL
 * @param {string} type - PLANT_TYPES 键
 * @returns {string} dataURL（失败返回 ''）
 */
function buildPlantAvatar(type) {
  try {
    const def = PLANT_TYPES[type];
    if (!def || !wx.createOffscreenCanvas) return '';
    const SS = 2;
    const canvas = wx.createOffscreenCanvas({ type: '2d', width: SIZE * SS, height: SIZE * SS });
    if (!canvas || !canvas.getContext || typeof canvas.toDataURL !== 'function') return '';
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.scale(SS, SS);

    const r = SIZE / 2;

    // ===== 1) 头像盘：本命柔色圆底 + 左上柔光（clip 保证角色收容在盘内）=====
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r - 1, 0, Math.PI * 2);
    ctx.fillStyle = AVATAR_BG[type] || '#E8F5E9';
    ctx.fill();
    const shine = ctx.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
    shine.addColorStop(0, 'rgba(255,255,255,0.55)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.fill();
    ctx.clip();

    // ===== 2) 真实角色：临时放大 pathManager 格子 → renderer._drawPlant 原样绘制 =====
    //   _drawPlant 尺寸来自 getCellSize()（cell*0.78*0.42 = r），
    //   快照/恢复三件套避免污染游戏画布几何缓存（v66 pathManager 单例）
    const saved = {
      canvasSize: pathManager.canvasSize,
      bounds: pathManager._bounds,
      cell: pathManager._cell
    };
    // 反解 GRID 比例：cellW = 0.28W · cellH = 0.174H → min(cell) = CHAR_R/0.3276
    const cell = CHAR_R / 0.3276;
    pathManager.setCanvasSize(cell / 0.28, cell / 0.174);

    ctx.save();
    ctx.translate(r, r + 1);   // 锚点 = 游戏内植物锚点（脚底上方），阴影落盘内
    try {
      renderer._drawPlant(ctx, {
        def: def,
        type: type,
        x: 0,
        y: 0,
        wobble: 0,             // 标准待机姿态（眨眼睁眼 / 无摇摆）
        state: 'idle',
        health: def.health,
        maxHealth: def.health, // 满血 → 无血条
        shootFx: 0,            // 无后坐力
        hitFlash: 0,
        age: 999999,           // 跳过出场弹入
        fuseTimer: 0,          // 樱桃无蓄力震动
        chomperState: 'idle',
        chomperBiteProgress: 0,
        chomperSwallowProgress: 0,
        sunCooldown: 0         // 无产阳光光环
      });
    } catch (e) {
      // 单头像绘制失败：走兜底（清空画布，返回 ''）
      console.warn('[avatarPainter] 植物头像绘制失败:', type, e);
    }
    ctx.restore();
    pathManager.canvasSize = saved.canvasSize;
    pathManager._bounds = saved.bounds;
    pathManager._cell = saved.cell;
    ctx.restore();             // 收起 clip

    // ===== 3) 白描边环（clip 外补画，盘缘干净利落）=====
    ctx.beginPath();
    ctx.arc(r, r, r - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();

    return canvas.toDataURL('image/png', 1.0);
  } catch (e) {
    console.warn('[avatarPainter] 头像生成失败:', type, e);
    return '';
  }
}

/**
 * 批量生成植物头像（商店栏一次全部缓存）
 * @param {string[]} order - PLANT_ORDER
 * @returns {Object} { [type]: dataURL | '' }
 */
function buildPlantAvatars(order) {
  const out = {};
  (order || []).forEach(t => { out[t] = buildPlantAvatar(t); });
  return out;
}

module.exports = { buildPlantAvatar, buildPlantAvatars, AVATAR_BG };
