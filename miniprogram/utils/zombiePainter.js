// utils/zombiePainter.js - 僵尸离屏插画绘制(v55 自 renderer.js 拆分)
// 纯代码搬运: 原 renderer._renderZombieToOffscreen 单函数 1083 行
//   按绘制阶段拆分; 阶段函数共享 Z 状态对象(ctx/canvas/type/def/T
//   tokens/跨阶段局部量), R 为 renderer 实例(提供 T/_strokeW/_setStroke
//   /dpr — _strokeW 的 _curBaseR 有状态, 经 R 转发保持状态流)
// 渲染行为与拆分前逐 ctx 调用一致(scripts/task55 轨迹比对验证)
const { ZOMBIE_TYPES } = require('./constants.js');
const { safeRoundRect } = require('./canvasHelpers.js');

/**
 * 僵尸离屏渲染总入口(orchestrator)
 * @param {string} type - ZOMBIE_TYPES 键
 * @param {Object} R - renderer 实例(T/_strokeW/_setStroke/dpr)
 * @returns {Object|null} 离屏 canvas(基础库不支持时 null)
 */
function renderZombieToOffscreen(type, R) {
  const Z = _zpSetup(type, R);
  if (!Z) return null;
  _zpSack(Z, R);
  _zpCape(Z, R);
  _zpArms(Z, R);
  _zpTorso(Z, R);
  _zpShoulders(Z, R);
  _zpLegs(Z, R);
  _zpHead(Z, R);
  _zpHeadgear(Z, R);
  _zpFace(Z, R);
  _zpFaceVariants(Z, R);
  _zpCage(Z, R);
  return Z.canvas;
}

/** 画布建立 + 超采样 + 描边基准 + 地面阴影(返回 Z 状态对象) */
function _zpSetup(type, R) {
  const Z = { type: type };   // v55: 阶段共享状态对象
  Z.def = ZOMBIE_TYPES[Z.type];
  Z.T   = R.T;
  Z.UNIT = 50;               // 基准单位（全部比例基于此）
  R._strokeW(1, Z.UNIT);        // 把 Z.UNIT 作为描边基准

  // 超采样高清化
  const SS = R.dpr * Z.T.OFFSCREEN.SUPERSAMPLE;
  const size = Z.UNIT * 2.8;       // 画布尺寸（比旧 2.6 增 8%，保证头饰不裁切）
  Z.canvas = wx.createOffscreenCanvas ? wx.createOffscreenCanvas({
type: '2d',
    width:  Math.round(size * SS),
    height: Math.round(size * SS)
  }) : null;
  if (!Z.canvas) return null;
  Z.ctx = Z.canvas.getContext('2d');
  Z.ctx.scale(SS, SS);
  Z.ctx.translate(size / 2, size / 2);

  // 僵尸暗色描边（v3 阵营区分：植物白描边 vs 僵尸暗描边，一眼区分）
  const swMain = R._strokeW(Z.T.STROKE.MAIN);
  R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, swMain);

  // 阴影（底部 · 与植物统一 Tokens 色）
  Z.ctx.fillStyle = Z.T.COLORS.SHADOW;
  Z.ctx.beginPath();
  Z.ctx.ellipse(0, Z.UNIT * 1.12, Z.UNIT * 0.72, Z.UNIT * 0.22, 0, 0, Math.PI * 2);
  Z.ctx.fill();

  return Z;
}

/** v27 小鬼肩挎麻袋(先于手臂/头绘制) */
function _zpSack(Z, R) {
  // v27 小鬼僵尸：肩挎麻袋（参照设定图侧姿：粗麻束口袋 + 双道束绳 + 绳结 +
  //   竖缝线 + 补丁；左肩外侧挂、袋颈朝外上倾斜、袋身探出头部轮廓左侧。
  //   先于手臂/头绘制：袖子横穿袋右下角=手扶读感，头遮袋内侧=肩背读感）
  if (Z.type === 'imp') {
    Z.ctx.save();
    Z.ctx.translate(-Z.UNIT * 0.70, Z.UNIT * 0.05);
    Z.ctx.rotate(-0.40);
    // 袋颈（束口窄梯形，浅麻色）
    Z.ctx.fillStyle = Z.T.COLORS.Z_SACK;
    Z.ctx.beginPath();
    Z.ctx.moveTo(-Z.UNIT * 0.085, -Z.UNIT * 0.38);
    Z.ctx.lineTo( Z.UNIT * 0.085, -Z.UNIT * 0.38);
    Z.ctx.lineTo( Z.UNIT * 0.11, -Z.UNIT * 0.22);
    Z.ctx.lineTo(-Z.UNIT * 0.11, -Z.UNIT * 0.22);
    Z.ctx.closePath();
    Z.ctx.fill(); Z.ctx.stroke();
    // 袋身（圆润鼓肚：上收口、下鼓胀，粗麻渐变收暗）
    const sGrad = Z.ctx.createLinearGradient(0, -Z.UNIT * 0.22, 0, Z.UNIT * 0.30);
    sGrad.addColorStop(0, Z.T.COLORS.Z_SACK);
    sGrad.addColorStop(0.72, Z.T.COLORS.Z_SACK);
    sGrad.addColorStop(1, Z.T.COLORS.Z_SACK_DARK);
    Z.ctx.fillStyle = sGrad;
    Z.ctx.beginPath();
    Z.ctx.moveTo(-Z.UNIT * 0.11, -Z.UNIT * 0.22);
    Z.ctx.bezierCurveTo(-Z.UNIT * 0.25, -Z.UNIT * 0.10, -Z.UNIT * 0.26, Z.UNIT * 0.14, -Z.UNIT * 0.15, Z.UNIT * 0.27);
    Z.ctx.quadraticCurveTo(0, Z.UNIT * 0.36, Z.UNIT * 0.15, Z.UNIT * 0.25);
    Z.ctx.bezierCurveTo(Z.UNIT * 0.26, Z.UNIT * 0.12, Z.UNIT * 0.25, -Z.UNIT * 0.08, Z.UNIT * 0.11, -Z.UNIT * 0.22);
    Z.ctx.closePath();
    Z.ctx.fill(); Z.ctx.stroke();
    // 束绳 2 道 + 左侧绳结（深麻褐）
    Z.ctx.fillStyle = Z.T.COLORS.Z_SACK_DARK;
    Z.ctx.fillRect(-Z.UNIT * 0.125, -Z.UNIT * 0.23, Z.UNIT * 0.25, Z.UNIT * 0.04);
    Z.ctx.fillRect(-Z.UNIT * 0.117, -Z.UNIT * 0.165, Z.UNIT * 0.234, Z.UNIT * 0.035);
    Z.ctx.beginPath();
    Z.ctx.arc(-Z.UNIT * 0.125, -Z.UNIT * 0.20, Z.UNIT * 0.055, 0, Math.PI * 2);
    Z.ctx.fill(); Z.ctx.stroke();
    // 竖向缝线 ×2（半透明暗线）+ 右下补丁
    Z.ctx.globalAlpha = 0.45;
    R._setStroke(Z.ctx, Z.T.COLORS.Z_SACK_DARK, R._strokeW(Z.T.STROKE.THIN));
    for (const sx of [-Z.UNIT * 0.08, Z.UNIT * 0.06]) {
      Z.ctx.beginPath();
      Z.ctx.moveTo(sx, -Z.UNIT * 0.10);
      Z.ctx.lineTo(sx, Z.UNIT * 0.20);
      Z.ctx.stroke();
    }
    Z.ctx.globalAlpha = 0.55;
    Z.ctx.fillStyle = Z.T.COLORS.Z_SACK_DARK;
    safeRoundRect(Z.ctx, Z.UNIT * 0.01, Z.UNIT * 0.07, Z.UNIT * 0.14, Z.UNIT * 0.12, Z.UNIT * 0.02);
    Z.ctx.fill();
    Z.ctx.globalAlpha = 1;
    R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.MAIN));
    Z.ctx.restore();
  }

}

/** v51 僵尸王皇家深红斗篷(先于身体绘制) */
function _zpCape(Z, R) {
  // v51 僵尸王：皇家深红斗篷（背后大氅 — 先画被身体/手臂覆盖中段，
  //   左右+下方探出轮廓 = 王者体量感；下摆锯齿撕裂 = 破落军团之王）
  if (Z.type === 'king') {
    const capeW = Z.UNIT * 0.72;
    const capeTop = Z.UNIT * 0.06;
    const capeBot = Z.UNIT * 0.86;
    const cpGrad = Z.ctx.createLinearGradient(-capeW, 0, capeW, 0);
    cpGrad.addColorStop(0, Z.T.COLORS.Z_KING_CAPE);
    cpGrad.addColorStop(0.55, Z.T.COLORS.Z_KING_CAPE);
    cpGrad.addColorStop(1, Z.T.COLORS.Z_KING_CAPE_DARK);
    Z.ctx.fillStyle = cpGrad;
    Z.ctx.beginPath();
    Z.ctx.moveTo(-capeW * 0.60, capeTop);
    Z.ctx.quadraticCurveTo(-capeW, capeBot * 0.55, -capeW * 0.82, capeBot);
    Z.ctx.lineTo(-capeW * 0.26, capeBot - Z.UNIT * 0.10);
    Z.ctx.lineTo(0, capeBot);
    Z.ctx.lineTo(capeW * 0.26, capeBot - Z.UNIT * 0.10);
    Z.ctx.lineTo(capeW * 0.82, capeBot);
    Z.ctx.quadraticCurveTo(capeW, capeBot * 0.55, capeW * 0.60, capeTop);
    Z.ctx.closePath();
    Z.ctx.fill(); Z.ctx.stroke();
    // 肩扣 ×2（金圆点 — 锁住斗篷的佩戴锚点）
    Z.ctx.fillStyle = Z.T.COLORS.Z_KING_GOLD;
    for (const s of [-1, 1]) {
      Z.ctx.beginPath();
      Z.ctx.arc(s * Z.UNIT * 0.40, Z.UNIT * 0.16, Z.UNIT * 0.08, 0, Math.PI * 2);
      Z.ctx.fill(); Z.ctx.stroke();
    }
  }

}

/** 小手臂 + 袖口 + 手掌(Z_BODY 体型 tokens) */
function _zpArms(Z, R) {
  // 小手臂（按类型差异化体型，Z_BODY tokens 控制）
  // v26 铁桶僵尸：衬衫袖 + 袖口 + 僵尸绿手掌（参照设定图长袖破衫）
  Z.ZB = Z.T.Z_BODY;
  Z.bodyW = Z.type === 'bucket' ? Z.ZB.BUCKET_BODY_W :
                Z.type === 'imp' ? Z.ZB.IMP_BODY_W :
                Z.type === 'football' ? Z.ZB.FOOTBALL_BODY_W :
                Z.type === 'king' ? Z.ZB.KING_BODY_W : Z.ZB.DANCER_BODY_W;
  const armLen = Z.type === 'bucket' ? Z.ZB.BUCKET_ARM_LEN :
                 Z.type === 'imp' ? Z.ZB.IMP_ARM_LEN :
                 Z.type === 'football' ? Z.ZB.FOOTBALL_ARM_LEN :
                 Z.type === 'king' ? Z.ZB.KING_ARM_LEN : Z.ZB.DANCER_ARM_LEN;
  const armX = Z.UNIT * (Z.bodyW + 0.14);
  // v27 小鬼僵尸：手臂微外张下探（碎步疾走感），袖色 = 破袍灰
  const armY = Z.type === 'imp' ? Z.UNIT * 0.32 : Z.UNIT * 0.35;
  // v29 舞王：双臂外张 0.50 rad = 迪斯科展示舞姿（参照设定图双臂展开）
  const armRot = Z.type === 'imp' ? 0.18 :
                 Z.type === 'dancer' ? 0.50 :
                 Z.type === 'king' ? 0.30 : 0.35;   // v51 王: 微张沉稳
  // v28 橄榄球僵尸：球衣绿短袖（参照设定图 forest green jersey）
  // v29 舞王僵尸：紫西装长袖（参照设定图紫色套装）
  Z.ctx.fillStyle = Z.type === 'bucket' ? Z.T.COLORS.Z_SHIRT :
                  Z.type === 'imp'   ? Z.T.COLORS.Z_HOOD :
                  Z.type === 'football' ? Z.T.COLORS.Z_FH_JERSEY :
                  Z.type === 'dancer' ? Z.T.COLORS.Z_DN_SUIT :
                  Z.type === 'king' ? Z.T.COLORS.Z_KING_ROBE : Z.def.color;   // v51 暗紫王袍袖
  Z.ctx.beginPath();
  Z.ctx.ellipse(-armX, armY, Z.UNIT * 0.18, Z.UNIT * armLen, -armRot, 0, Math.PI * 2);
  Z.ctx.fill(); Z.ctx.stroke();
  Z.ctx.beginPath();
  Z.ctx.ellipse( armX, armY, Z.UNIT * 0.18, Z.UNIT * armLen,  armRot, 0, Math.PI * 2);
  Z.ctx.fill(); Z.ctx.stroke();
  if (Z.type === 'bucket' || Z.type === 'imp' || Z.type === 'football' || Z.type === 'dancer' || Z.type === 'king') {
    // 袖口（深一档环）+ 手掌（僵尸绿），沿袖长轴末端双臂对称
    // v27 imp：复用同结构（袖口=兜帽深灰，手臂微外张末端）
    // v28 football：袖口=深绿厚护腕（参照设定图 wristbands），手掌=僵尸绿皮肤
    // v29 dancer：袖口=米白衬衫袖口（参照设定图衬衫袖从西装袖口露出一截）
    const cuffFill = Z.type === 'bucket' ? Z.T.COLORS.Z_SHIRT_DARK :
                     Z.type === 'imp'   ? Z.T.COLORS.Z_HOOD_DARK :
                     Z.type === 'dancer' ? Z.T.COLORS.Z_DN_SHIRT :
                     Z.type === 'king' ? Z.T.COLORS.Z_KING_GOLD : Z.T.COLORS.Z_FH_WRIST;   // v51 金袖口
    for (const side of [-1, 1]) {
      const rot = side < 0 ? -armRot : armRot;
      const ex = side * armX + Math.sin(rot) * Z.UNIT * armLen;
      const ey = armY + Math.cos(rot) * Z.UNIT * armLen;
      Z.ctx.fillStyle = cuffFill;
      Z.ctx.beginPath();
      Z.ctx.ellipse(ex - Math.sin(rot) * Z.UNIT * 0.07, ey - Math.cos(rot) * Z.UNIT * 0.07,
                  Z.UNIT * 0.115, Z.UNIT * 0.075, rot, 0, Math.PI * 2);
      Z.ctx.fill(); Z.ctx.stroke();
      Z.ctx.fillStyle = Z.def.color;
      Z.ctx.beginPath();
      Z.ctx.arc(ex + Math.sin(rot) * Z.UNIT * 0.015, ey + Math.cos(rot) * Z.UNIT * 0.015, Z.UNIT * 0.10, 0, Math.PI * 2);
      Z.ctx.fill(); Z.ctx.stroke();
    }
  }

}

/** 身体主体(按类型差异化: 衬衫/长袍/球衣/王袍/西装) */
function _zpTorso(Z, R) {
  // 身体（按类型差异化：普通/瘦长/宽壮/方正）
  // v26 铁桶僵尸：灰蓝破衬衫（右衣影 + 下摆撕裂 + 胸口袋，参照设定图）
  // v27 小鬼僵尸：中灰破长袍（加宽飘感 + 加长遮腿，下摆撕裂见 imp 分支）
  const robeW = Z.type === 'imp' ? 0.36 : Z.bodyW;
  // v29.1 舞王：西装加长至 0.62（Q 版巨头遮挡胸口，加长+下移领口三件套
  //   才能从下巴下方露出——v27 麻袋遮挡教训复现）
  const robeH = Z.type === 'imp' ? 0.64 : Z.type === 'dancer' ? 0.62 :
                Z.type === 'king' ? 0.64 : 0.55;   // v51 王袍及踝最长
  // v29 舞王：紫西装外套（参照设定图亮紫西装）
  Z.ctx.fillStyle = Z.type === 'bucket' ? Z.T.COLORS.Z_SHIRT :
                  Z.type === 'imp'   ? Z.T.COLORS.Z_HOOD :
                  Z.type === 'football' ? Z.T.COLORS.Z_FH_JERSEY :
                  Z.type === 'dancer' ? Z.T.COLORS.Z_DN_SUIT :
                  Z.type === 'king' ? Z.T.COLORS.Z_KING_ROBE : Z.def.color;   // v51 暗紫王袍
  Z.ctx.beginPath();
  safeRoundRect(Z.ctx, -Z.UNIT * robeW, Z.UNIT * 0.12, Z.UNIT * robeW * 2, Z.UNIT * robeH, Z.UNIT * 0.28);
  Z.ctx.fill(); Z.ctx.stroke();
  if (Z.type === 'bucket') {
    // 右侧衣影（赛璐璐单侧阴影，clip 在身体内）
    Z.ctx.save();
    Z.ctx.beginPath();
    safeRoundRect(Z.ctx, -Z.UNIT * Z.bodyW, Z.UNIT * 0.12, Z.UNIT * Z.bodyW * 2, Z.UNIT * 0.55, Z.UNIT * 0.28);
    Z.ctx.clip();
    Z.ctx.globalAlpha = 0.5;
    Z.ctx.fillStyle = Z.T.COLORS.Z_SHIRT_DARK;
    Z.ctx.fillRect(Z.UNIT * Z.bodyW * 0.30, Z.UNIT * 0.10, Z.UNIT * Z.bodyW * 0.80, Z.UNIT * 0.60);
    Z.ctx.globalAlpha = 1;
    Z.ctx.restore();
    // 下摆撕裂三角 ×3（深色内衬外露）
    Z.ctx.fillStyle = Z.T.COLORS.Z_SHIRT_DARK;
    const hemY = Z.UNIT * 0.67;
    const tears = [[-0.26, 0.15], [-0.03, 0.18], [0.20, 0.13]];
    for (const [tx, tw] of tears) {
      Z.ctx.beginPath();
      Z.ctx.moveTo(Z.UNIT * (tx - tw / 2), hemY - Z.UNIT * 0.02);
      Z.ctx.lineTo(Z.UNIT * (tx + tw / 2), hemY - Z.UNIT * 0.02);
      Z.ctx.lineTo(Z.UNIT * tx, hemY + Z.UNIT * 0.10);
      Z.ctx.closePath();
      Z.ctx.fill();
    }
    // 胸口袋（左胸小方袋）
    Z.ctx.globalAlpha = 0.8;
    Z.ctx.beginPath();
    safeRoundRect(Z.ctx, -Z.UNIT * 0.26, Z.UNIT * 0.22, Z.UNIT * 0.17, Z.UNIT * 0.13, Z.UNIT * 0.025);
    Z.ctx.fill();
    Z.ctx.globalAlpha = 1;
    R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.THIN));
    Z.ctx.stroke();
    // 恢复主描边（后续腿/头仍用 MAIN）
    R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.MAIN));
  }
  if (Z.type === 'imp') {
    // v27 破袍细节（参照设定图：右袍影 + 竖褶线 + 左下补丁 + 下摆撕裂 + 短靴）
    Z.ctx.save();
    Z.ctx.beginPath();
    safeRoundRect(Z.ctx, -Z.UNIT * robeW, Z.UNIT * 0.12, Z.UNIT * robeW * 2, Z.UNIT * robeH, Z.UNIT * 0.28);
    Z.ctx.clip();
    Z.ctx.globalAlpha = 0.45;
    Z.ctx.fillStyle = Z.T.COLORS.Z_HOOD_DARK;
    Z.ctx.fillRect(Z.UNIT * robeW * 0.35, Z.UNIT * 0.10, Z.UNIT * robeW * 0.80, Z.UNIT * 0.70);
    Z.ctx.globalAlpha = 1;
    Z.ctx.restore();
    // 竖向褶线 ×2（中灰压深一档细线）
    R._setStroke(Z.ctx, Z.T.COLORS.Z_HOOD_DARK, R._strokeW(Z.T.STROKE.THIN));
    for (const fx of [-Z.UNIT * 0.10, Z.UNIT * 0.05]) {
      Z.ctx.beginPath();
      Z.ctx.moveTo(fx, Z.UNIT * 0.32);
      Z.ctx.quadraticCurveTo(fx + Z.UNIT * 0.02, Z.UNIT * 0.52, fx - Z.UNIT * 0.02, Z.UNIT * 0.70);
      Z.ctx.stroke();
    }
    // 左下小补丁（浅灰褐 + 细描边）
    Z.ctx.globalAlpha = 0.8;
    Z.ctx.fillStyle = Z.T.COLORS.Z_HOOD_LIGHT;
    safeRoundRect(Z.ctx, -Z.UNIT * 0.30, Z.UNIT * 0.36, Z.UNIT * 0.13, Z.UNIT * 0.10, Z.UNIT * 0.02);
    Z.ctx.fill();
    Z.ctx.globalAlpha = 1;
    Z.ctx.stroke();
    R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.MAIN));
    // 下摆撕裂三角 ×3（深灰内衬外露，参差下垂）
    Z.ctx.fillStyle = Z.T.COLORS.Z_HOOD_DARK;
    const hemY = Z.UNIT * 0.76;
    for (const [tx, tw] of [[-0.22, 0.14], [-0.02, 0.17], [0.18, 0.12]]) {
      Z.ctx.beginPath();
      Z.ctx.moveTo(Z.UNIT * (tx - tw / 2), hemY - Z.UNIT * 0.02);
      Z.ctx.lineTo(Z.UNIT * (tx + tw / 2), hemY - Z.UNIT * 0.02);
      Z.ctx.lineTo(Z.UNIT * tx, hemY + Z.UNIT * 0.11);
      Z.ctx.closePath();
      Z.ctx.fill();
    }
    // 短靴 ×2（深灰圆头，袍长及踝不露腿，靴从袍摆下探出）
    Z.ctx.fillStyle = Z.T.COLORS.Z_HOOD_DARK;
    for (const s of [-1, 1]) {
      Z.ctx.beginPath();
      Z.ctx.ellipse(s * Z.UNIT * 0.15, Z.UNIT * 0.84, Z.UNIT * 0.095, Z.UNIT * 0.08, 0, 0, Math.PI * 2);
      Z.ctx.fill(); Z.ctx.stroke();
    }
  }
  if (Z.type === 'football') {
    // v28 球衣细节（参照设定图：右衣影 + 竖褶线 + 下摆撕裂 ×3）
    Z.ctx.save();
    Z.ctx.beginPath();
    safeRoundRect(Z.ctx, -Z.UNIT * Z.bodyW, Z.UNIT * 0.12, Z.UNIT * Z.bodyW * 2, Z.UNIT * 0.55, Z.UNIT * 0.28);
    Z.ctx.clip();
    Z.ctx.globalAlpha = 0.5;
    Z.ctx.fillStyle = Z.T.COLORS.Z_FH_JERSEY_DARK;
    Z.ctx.fillRect(Z.UNIT * Z.bodyW * 0.30, Z.UNIT * 0.10, Z.UNIT * Z.bodyW * 0.80, Z.UNIT * 0.60);
    Z.ctx.globalAlpha = 1;
    Z.ctx.restore();
    // 竖向褶线 ×2（深绿细线，胸前运动感）
    R._setStroke(Z.ctx, Z.T.COLORS.Z_FH_JERSEY_DARK, R._strokeW(Z.T.STROKE.THIN));
    for (const fx of [-Z.UNIT * 0.12, Z.UNIT * 0.07]) {
      Z.ctx.beginPath();
      Z.ctx.moveTo(fx, Z.UNIT * 0.50);
      Z.ctx.quadraticCurveTo(fx + Z.UNIT * 0.02, Z.UNIT * 0.60, fx - Z.UNIT * 0.02, Z.UNIT * 0.70);
      Z.ctx.stroke();
    }
    R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.MAIN));
    // 下摆撕裂三角 ×3（深绿内衬外露，球衣破损）
    Z.ctx.fillStyle = Z.T.COLORS.Z_FH_JERSEY_DARK;
    const hemY = Z.UNIT * 0.67;
    for (const [tx, tw] of [[-0.28, 0.16], [-0.05, 0.18], [0.20, 0.15]]) {
      Z.ctx.beginPath();
      Z.ctx.moveTo(Z.UNIT * (tx - tw / 2), hemY - Z.UNIT * 0.02);
      Z.ctx.lineTo(Z.UNIT * (tx + tw / 2), hemY - Z.UNIT * 0.02);
      Z.ctx.lineTo(Z.UNIT * tx, hemY + Z.UNIT * 0.10);
      Z.ctx.closePath();
      Z.ctx.fill();
    }
  }
  if (Z.type === 'king') {
    // v51 王袍细节（右衣影 + 金腰带 + 中央红宝石扣 + 下摆撕裂 ×3）
    Z.ctx.save();
    Z.ctx.beginPath();
    safeRoundRect(Z.ctx, -Z.UNIT * robeW, Z.UNIT * 0.12, Z.UNIT * robeW * 2, Z.UNIT * robeH, Z.UNIT * 0.28);
    Z.ctx.clip();
    Z.ctx.globalAlpha = 0.5;
    Z.ctx.fillStyle = Z.T.COLORS.Z_KING_ROBE_DARK;
    Z.ctx.fillRect(Z.UNIT * robeW * 0.30, Z.UNIT * 0.10, Z.UNIT * robeW * 0.80, Z.UNIT * 0.70);
    Z.ctx.globalAlpha = 1;
    Z.ctx.restore();
    // 金腰带（横带 + 中央红宝石扣）
    Z.ctx.fillStyle = Z.T.COLORS.Z_KING_GOLD;
    safeRoundRect(Z.ctx, -Z.UNIT * 0.40, Z.UNIT * 0.55, Z.UNIT * 0.80, Z.UNIT * 0.10, Z.UNIT * 0.03);
    Z.ctx.fill(); Z.ctx.stroke();
    Z.ctx.fillStyle = Z.T.COLORS.Z_KING_GEM;
    Z.ctx.beginPath();
    Z.ctx.arc(0, Z.UNIT * 0.60, Z.UNIT * 0.055, 0, Math.PI * 2);
    Z.ctx.fill(); Z.ctx.stroke();
    // 下摆撕裂三角 ×3（深紫内衬外露）
    Z.ctx.fillStyle = Z.T.COLORS.Z_KING_ROBE_DARK;
    const hemK = Z.UNIT * 0.75;
    for (const [tx, tw] of [[-0.28, 0.16], [-0.04, 0.18], [0.22, 0.14]]) {
      Z.ctx.beginPath();
      Z.ctx.moveTo(Z.UNIT * (tx - tw / 2), hemK - Z.UNIT * 0.02);
      Z.ctx.lineTo(Z.UNIT * (tx + tw / 2), hemK - Z.UNIT * 0.02);
      Z.ctx.lineTo(Z.UNIT * tx, hemK + Z.UNIT * 0.10);
      Z.ctx.closePath();
      Z.ctx.fill();
    }
  }
  // 肚皮高光（僵尸微弱哑光，Z_HIGHLIGHT，植物用亮白 0.35）
  Z.ctx.fillStyle = Z.T.COLORS.Z_HIGHLIGHT;
  Z.ctx.beginPath();
  Z.ctx.ellipse(-Z.UNIT * 0.14, Z.UNIT * 0.28, Z.UNIT * 0.16, Z.UNIT * 0.26, -0.5, 0, Math.PI * 2);
  Z.ctx.fill();

  // v29 舞王僵尸：破紫西装（参照设定图：右衣影 + 驳领V + 衬衫V + 领带 +
  //   单纽扣 + 下摆锯齿撕裂 ×3，替换金属胸甲肩甲）
  // v29.1 领口三件套下移：Q 版大头(下巴=0.50 Z.UNIT)遮挡胸口，细节压进 0.46~0.70 可见带
  if (Z.type === 'dancer') {
    // 右侧衣影（赛璐璐单侧阴影，clip 在身体内，与 bucket/football 同构）
    Z.ctx.save();
    Z.ctx.beginPath();
    safeRoundRect(Z.ctx, -Z.UNIT * Z.bodyW, Z.UNIT * 0.12, Z.UNIT * Z.bodyW * 2, Z.UNIT * robeH, Z.UNIT * 0.28);
    Z.ctx.clip();
    Z.ctx.globalAlpha = 0.5;
    Z.ctx.fillStyle = Z.T.COLORS.Z_DN_SUIT_DARK;
    Z.ctx.fillRect(Z.UNIT * Z.bodyW * 0.30, Z.UNIT * 0.10, Z.UNIT * Z.bodyW * 0.80, Z.UNIT * 0.70);
    Z.ctx.globalAlpha = 1;
    Z.ctx.restore();
    // 衬衫 V 区（米白，顶部从下巴后探出，向下收窄到胸下）
    Z.ctx.fillStyle = Z.T.COLORS.Z_DN_SHIRT;
    Z.ctx.beginPath();
    Z.ctx.moveTo(-Z.UNIT * 0.19, Z.UNIT * 0.46);
    Z.ctx.lineTo( Z.UNIT * 0.19, Z.UNIT * 0.46);
    Z.ctx.lineTo( Z.UNIT * 0.06, Z.UNIT * 0.60);
    Z.ctx.lineTo(-Z.UNIT * 0.06, Z.UNIT * 0.60);
    Z.ctx.closePath();
    Z.ctx.fill();
    R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.THIN));
    Z.ctx.stroke();
    // 驳领 ×2（深紫三角 = 西装翻领；顶端入下巴后 = 颈后自然感）
    // v29.2 细节级描边：MAIN/THIN 描边会吞掉 <10px 填充（自吞效应）
    R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.THIN) * 0.8);
    Z.ctx.fillStyle = Z.T.COLORS.Z_DN_SUIT_DARK;
    Z.ctx.beginPath();
    Z.ctx.moveTo(-Z.UNIT * 0.24, Z.UNIT * 0.45);
    Z.ctx.lineTo(-Z.UNIT * 0.085, Z.UNIT * 0.45);
    Z.ctx.lineTo(-Z.UNIT * 0.02, Z.UNIT * 0.57);
    Z.ctx.closePath();
    Z.ctx.fill(); Z.ctx.stroke();
    Z.ctx.beginPath();
    Z.ctx.moveTo( Z.UNIT * 0.24, Z.UNIT * 0.45);
    Z.ctx.lineTo( Z.UNIT * 0.085, Z.UNIT * 0.45);
    Z.ctx.lineTo( Z.UNIT * 0.02, Z.UNIT * 0.57);
    Z.ctx.closePath();
    Z.ctx.fill(); Z.ctx.stroke();
    // 领带（深紫黑：小结 + 渐窄带身，垂至裤腰）
    Z.ctx.fillStyle = Z.T.COLORS.Z_DN_TIE;
    Z.ctx.beginPath();
    Z.ctx.moveTo(-Z.UNIT * 0.082, Z.UNIT * 0.525);
    Z.ctx.lineTo( Z.UNIT * 0.082, Z.UNIT * 0.525);
    Z.ctx.lineTo( Z.UNIT * 0.072, Z.UNIT * 0.67);
    Z.ctx.lineTo(-Z.UNIT * 0.072, Z.UNIT * 0.67);
    Z.ctx.closePath();
    Z.ctx.fill(); Z.ctx.stroke();
    // 领带小结（深紫黑小梯形，从下巴正下方探出）
    Z.ctx.beginPath();
    Z.ctx.moveTo(-Z.UNIT * 0.085, Z.UNIT * 0.475);
    Z.ctx.lineTo( Z.UNIT * 0.085, Z.UNIT * 0.475);
    Z.ctx.lineTo( Z.UNIT * 0.105, Z.UNIT * 0.53);
    Z.ctx.lineTo(-Z.UNIT * 0.105, Z.UNIT * 0.53);
    Z.ctx.closePath();
    Z.ctx.fill(); Z.ctx.stroke();
    // 领带米白斜纹 ×2（细斜线，参照设定图斜条纹领带）
    R._setStroke(Z.ctx, Z.T.COLORS.Z_DN_SHIRT, R._strokeW(Z.T.STROKE.THIN) * 0.8);
    for (const ty of [Z.UNIT * 0.555, Z.UNIT * 0.615]) {
      Z.ctx.beginPath();
      Z.ctx.moveTo(-Z.UNIT * 0.062, ty + Z.UNIT * 0.028);
      Z.ctx.lineTo( Z.UNIT * 0.062, ty - Z.UNIT * 0.028);
      Z.ctx.stroke();
    }
    R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.MAIN));
    // 单纽扣（腹中偏下，深紫圆点，参照设定图未扣的单排扣）
    Z.ctx.fillStyle = Z.T.COLORS.Z_DN_SUIT_DARK;
    Z.ctx.beginPath();
    Z.ctx.arc(0, Z.UNIT * 0.705, Z.UNIT * 0.033, 0, Math.PI * 2);
    Z.ctx.fill();
    // 下摆撕裂三角 ×3（深紫内衬外露，锯齿破损下摆）
    Z.ctx.fillStyle = Z.T.COLORS.Z_DN_SUIT_DARK;
    const hemY = Z.UNIT * 0.74;
    for (const [tx, tw] of [[-0.26, 0.15], [-0.03, 0.18], [0.21, 0.13]]) {
      Z.ctx.beginPath();
      Z.ctx.moveTo(Z.UNIT * (tx - tw / 2), hemY - Z.UNIT * 0.02);
      Z.ctx.lineTo(Z.UNIT * (tx + tw / 2), hemY - Z.UNIT * 0.02);
      Z.ctx.lineTo(Z.UNIT * tx, hemY + Z.UNIT * 0.10);
      Z.ctx.closePath();
      Z.ctx.fill();
    }
  }
}

/** v28 橄榄球护肩 ×2(探出头部轮廓) */
function _zpShoulders(Z, R) {
  if (Z.type === 'football') {
    // v28 护肩 ×2（参照设定图：球状红色护肩覆在短袖上、外探出头部轮廓两侧；
    //   v27 教训：Q 版巨头遮挡，肩部配件必须探出头部轮廓才有辨识度）
    for (const s of [-1, 1]) {
      const px = s * Z.UNIT * 0.64;
      const py = Z.UNIT * 0.20;
      const prx = Z.UNIT * 0.24;
      const pry = Z.UNIT * 0.185;
      const pGrad = Z.ctx.createLinearGradient(px - prx, py - pry, px + prx, py + pry);
      pGrad.addColorStop(0, Z.T.COLORS.Z_FH_RED_LIGHT);
      pGrad.addColorStop(0.55, Z.T.COLORS.Z_FH_RED);
      pGrad.addColorStop(1, Z.T.COLORS.Z_FH_RED_DARK);
      Z.ctx.fillStyle = pGrad;
      Z.ctx.beginPath();
      Z.ctx.ellipse(px, py, prx, pry, s * 0.18, 0, Math.PI * 2);
      Z.ctx.fill(); Z.ctx.stroke();
      // 甲片缝线弧（下半圈深红细线 = 分瓣感）
      R._setStroke(Z.ctx, Z.T.COLORS.Z_FH_RED_DARK, R._strokeW(Z.T.STROKE.THIN));
      Z.ctx.beginPath();
      Z.ctx.ellipse(px, py, prx * 0.74, pry * 0.64, s * 0.18, Math.PI * 0.15, Math.PI * 0.85);
      Z.ctx.stroke();
      // 顶部受光高光（左上小椭圆，赛璐璐）
      Z.ctx.fillStyle = 'rgba(255,255,255,0.30)';
      Z.ctx.beginPath();
      Z.ctx.ellipse(px - prx * 0.34, py - pry * 0.42, prx * 0.30, pry * 0.26, s * -0.30, 0, Math.PI * 2);
      Z.ctx.fill();
      R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.MAIN));
    }
  }

}

/** 腿 + 靴(按类型差异化粗细/配色) */
function _zpLegs(Z, R) {
  // 腿（按类型差异化粗细）
  // v26 铁桶僵尸：深灰破裤 + 暗棕工装靴（裤靴双色）
  const legW = Z.type === 'bucket' ? Z.ZB.BUCKET_LEG_W :
               Z.type === 'imp' ? Z.ZB.IMP_LEG_W :
               Z.type === 'football' ? Z.ZB.FOOTBALL_LEG_W :
               Z.type === 'king' ? Z.ZB.KING_LEG_W : Z.ZB.DANCER_LEG_W;
  // v27 小鬼僵尸：袍长及踝不露腿，靴子改画在袍摆下（见身体段 imp 分支）
  if (Z.type !== 'imp') {
    // v29 舞王：紫西裤（套装同色）
    Z.ctx.fillStyle = Z.type === 'bucket' ? Z.T.COLORS.Z_PANTS :
                    Z.type === 'football' ? Z.T.COLORS.Z_FH_JERSEY :
                    Z.type === 'dancer' ? Z.T.COLORS.Z_DN_SUIT :
                    Z.type === 'king' ? Z.T.COLORS.Z_KING_ROBE_DARK : Z.def.color;   // v51 深紫袍裤
    Z.ctx.beginPath();
    Z.ctx.ellipse(-Z.UNIT * 0.2, Z.UNIT * 0.8, Z.UNIT * legW, Z.UNIT * 0.14, 0, 0, Math.PI * 2);
    Z.ctx.fill(); Z.ctx.stroke();
    Z.ctx.beginPath();
    Z.ctx.ellipse( Z.UNIT * 0.2, Z.UNIT * 0.8, Z.UNIT * legW, Z.UNIT * 0.14, 0, 0, Math.PI * 2);
    Z.ctx.fill(); Z.ctx.stroke();
  }
  if (Z.type === 'bucket') {
    // 工装靴（外侧偏移椭圆 = 靴头）
    Z.ctx.fillStyle = Z.T.COLORS.Z_BOOT;
    Z.ctx.beginPath();
    Z.ctx.ellipse(-Z.UNIT * 0.27, Z.UNIT * 0.84, Z.UNIT * 0.105, Z.UNIT * 0.095, 0, 0, Math.PI * 2);
    Z.ctx.fill(); Z.ctx.stroke();
    Z.ctx.beginPath();
    Z.ctx.ellipse( Z.UNIT * 0.27, Z.UNIT * 0.84, Z.UNIT * 0.105, Z.UNIT * 0.095, 0, 0, Math.PI * 2);
    Z.ctx.fill(); Z.ctx.stroke();
  }
  if (Z.type === 'football') {
    // v28 短裤侧条纹（外侧奶油白短弧 ×2）+ 棕色橄榄球鞋（参照设定图）
    R._setStroke(Z.ctx, Z.T.COLORS.Z_FH_STRIPE, R._strokeW(Z.T.STROKE.THIN));
    for (const s of [-1, 1]) {
      Z.ctx.beginPath();
      Z.ctx.moveTo(s * Z.UNIT * 0.36, Z.UNIT * 0.72);
      Z.ctx.quadraticCurveTo(s * Z.UNIT * 0.41, Z.UNIT * 0.80, s * Z.UNIT * 0.35, Z.UNIT * 0.88);
      Z.ctx.stroke();
    }
    R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.MAIN));
    Z.ctx.fillStyle = Z.T.COLORS.Z_FH_CLEAT;
    for (const s of [-1, 1]) {
      Z.ctx.beginPath();
      Z.ctx.ellipse(s * Z.UNIT * 0.27, Z.UNIT * 0.85, Z.UNIT * 0.11, Z.UNIT * 0.095, 0, 0, Math.PI * 2);
      Z.ctx.fill(); Z.ctx.stroke();
    }
  }
  if (Z.type === 'dancer') {
    // v29 圆头皮鞋 ×2（深棕牛津鞋，外八字微张 = 舞步站姿；v29.1 工艺复查修正僵硬平行）
    Z.ctx.fillStyle = Z.T.COLORS.Z_DN_SHOE;
    for (const s of [-1, 1]) {
      Z.ctx.beginPath();
      Z.ctx.ellipse(s * Z.UNIT * 0.25, Z.UNIT * 0.85, Z.UNIT * 0.115, Z.UNIT * 0.09, s * 0.12, 0, Math.PI * 2);
      Z.ctx.fill(); Z.ctx.stroke();
    }
  }
  if (Z.type === 'king') {
    // v51 暗红战靴 ×2（金环靴口 = 王室规格）
    Z.ctx.fillStyle = Z.T.COLORS.Z_KING_CAPE_DARK;
    for (const s of [-1, 1]) {
      Z.ctx.beginPath();
      Z.ctx.ellipse(s * Z.UNIT * 0.26, Z.UNIT * 0.85, Z.UNIT * 0.12, Z.UNIT * 0.10, 0, 0, Math.PI * 2);
      Z.ctx.fill(); Z.ctx.stroke();
    }
    Z.ctx.fillStyle = Z.T.COLORS.Z_KING_GOLD;
    for (const s of [-1, 1]) {
      Z.ctx.beginPath();
      Z.ctx.ellipse(s * Z.UNIT * 0.26, Z.UNIT * 0.78, Z.UNIT * 0.085, Z.UNIT * 0.035, 0, 0, Math.PI * 2);
      Z.ctx.fill(); Z.ctx.stroke();
    }
  }

}

/** Q 版大头 + 头顶哑光高光 */
function _zpHead(Z, R) {
  // 大头（Q版核心：占身体 60% 以上，上移以便装饰头顶）
  const H = Z.T.HEAD;
  Z.headCY = Z.UNIT * H.ZOMBIE_HEAD_CY;
  Z.headR  = Z.UNIT * H.ZOMBIE_HEAD_R;
  Z.ctx.fillStyle = Z.def.color;
  Z.ctx.beginPath();
  Z.ctx.arc(0, Z.headCY, Z.headR, 0, Math.PI * 2);
  Z.ctx.fill(); Z.ctx.stroke();

  // 头顶高光（僵尸微弱哑光，与植物亮白高光明确区分）
  Z.ctx.fillStyle = Z.T.COLORS.Z_HIGHLIGHT;
  Z.ctx.beginPath();
  Z.ctx.ellipse(Z.headR * H.HLIGHT_X, Z.headCY + Z.headR * H.HLIGHT_Y,
              Z.headR * H.HLIGHT_W, Z.headR * H.HLIGHT_H,
              H.HLIGHT_ROT, 0, Math.PI * 2);
  Z.ctx.fill();

}

/** 头顶装饰(铁桶/破兜帽/高顶礼帽/头盔/黄金王冠) */
function _zpHeadgear(Z, R) {
  // 头顶装饰（按类型差异化：铁桶/蝴蝶结/头盔+角/全盔）
  if (Z.type === 'bucket') {
    // v26 金属铁桶（参照设定图：上窄下宽圆台 ≈1:1.65 锥度夸张、桶口朝下扣头、
    //   左→右银灰→中灰→暗灰渐变、厚底缘环、两侧 D 形吊耳(突出桶壁)、顶 V 形锈
    //   缺口、锈斑 ×3；桶口下缘上移留出眉区空间）
    const bTop = Z.headCY - Z.headR * 1.69;            // 桶顶
    const bBot = Z.headCY - Z.headR * 0.52;            // 桶口下缘（眉线上方，脸全露）
    const bHalfTop = Z.headR * 0.62;                 // 顶半宽（上窄，锥度夸张）
    const bHalfBot = Z.headR * 1.02;                 // 底半宽（下宽，盖过头侧）
    // 桶身：梯形 + 底边微弧
    const bGrad = Z.ctx.createLinearGradient(-bHalfBot, 0, bHalfBot, 0);
    bGrad.addColorStop(0, Z.T.COLORS.Z_BUCKET_LIGHT);
    bGrad.addColorStop(0.45, Z.T.COLORS.Z_BUCKET);
    bGrad.addColorStop(1, Z.T.COLORS.Z_BUCKET_DARK);
    Z.ctx.fillStyle = bGrad;
    Z.ctx.beginPath();
    Z.ctx.moveTo(-bHalfTop, bTop);
    Z.ctx.lineTo( bHalfTop, bTop);
    Z.ctx.lineTo( bHalfBot, bBot - Z.headR * 0.06);
    Z.ctx.quadraticCurveTo(0, bBot + Z.headR * 0.07, -bHalfBot, bBot - Z.headR * 0.06);
    Z.ctx.closePath();
    Z.ctx.fill(); Z.ctx.stroke();
    // 左侧竖向金属高光带（赛璐璐反光，与全队高光位一致）
    Z.ctx.fillStyle = 'rgba(255,255,255,0.30)';
    Z.ctx.beginPath();
    Z.ctx.ellipse(-bHalfBot * 0.44, bTop + Z.headR * 0.60, Z.headR * 0.10, Z.headR * 0.34, -0.06, 0, Math.PI * 2);
    Z.ctx.fill();
    // 厚底缘环带（3D 桶口，比桶身略宽）
    Z.ctx.fillStyle = Z.T.COLORS.Z_BUCKET_DARK;
    Z.ctx.beginPath();
    Z.ctx.moveTo(-bHalfBot * 1.04, bBot - Z.headR * 0.10);
    Z.ctx.lineTo( bHalfBot * 1.04, bBot - Z.headR * 0.10);
    Z.ctx.quadraticCurveTo(0, bBot + Z.headR * 0.07, -bHalfBot * 1.04, bBot - Z.headR * 0.10);
    Z.ctx.closePath();
    Z.ctx.fill(); Z.ctx.stroke();
    // 两侧 D 形吊耳（桶壁中上段、突出桶壁轮廓外，暗色耳 + 亮色耳孔）
    const hy = bTop + (bBot - bTop) * 0.40;
    const hwHy = bHalfTop + (bHalfBot - bHalfTop) * 0.40;   // 吊耳高度处桶壁半宽
    for (const s of [-1, 1]) {
      Z.ctx.fillStyle = Z.T.COLORS.Z_BUCKET_DARK;
      Z.ctx.beginPath();
      Z.ctx.ellipse(s * (hwHy + Z.headR * 0.02), hy, Z.headR * 0.16, Z.headR * 0.24, s * 0.22, 0, Math.PI * 2);
      Z.ctx.fill(); Z.ctx.stroke();
      Z.ctx.fillStyle = Z.T.COLORS.Z_BUCKET_LIGHT;
      Z.ctx.beginPath();
      Z.ctx.ellipse(s * (hwHy + Z.headR * 0.02), hy, Z.headR * 0.07, Z.headR * 0.13, s * 0.22, 0, Math.PI * 2);
      Z.ctx.fill();
    }
    // 顶部 V 形锈缺口（破损记号）
    Z.ctx.fillStyle = Z.T.COLORS.Z_RUST;
    Z.ctx.beginPath();
    Z.ctx.moveTo(-Z.headR * 0.16, bTop - Z.headR * 0.02);
    Z.ctx.lineTo( Z.headR * 0.16, bTop - Z.headR * 0.02);
    Z.ctx.lineTo(0, bTop + Z.headR * 0.17);
    Z.ctx.closePath();
    Z.ctx.fill(); Z.ctx.stroke();
    // 锈斑 ×3（顶右缘 / 右壁中下 / 左壁近缘）
    for (const [rx, ry, rw, rh, rr] of [
      [ bHalfTop * 0.50, bTop + Z.headR * 0.12, 0.17, 0.10, 0.45],
      [ bHalfBot * 0.55, bBot - Z.headR * 0.32, 0.14, 0.09, -0.30],
      [-bHalfBot * 0.60, bBot - Z.headR * 0.18, 0.11, 0.075, 0.20],
    ]) {
      Z.ctx.beginPath();
      Z.ctx.ellipse(rx, ry, Z.headR * rw, Z.headR * rh, rr, 0, Math.PI * 2);
      Z.ctx.fill();
    }
  } else if (Z.type === 'imp') {
    // v27 破兜帽（参照设定图：罩头顶+两侧包边、波浪内缘在眉线上方、
    //   左上受光→右下深影渐变、竖褶线 ×2、左缘 V 形撕裂口、黑色乱发钻出）
    const hcY = Z.headCY + Z.headR * 0.02;
    const hR1 = Z.headR * 1.10;
    const wy = Z.headCY - Z.headR * 0.52;
    const hGrad = Z.ctx.createLinearGradient(-Z.headR * 0.9, wy - Z.headR * 0.55, Z.headR * 0.95, Z.headCY + Z.headR * 0.1);
    hGrad.addColorStop(0, Z.T.COLORS.Z_HOOD_LIGHT);
    hGrad.addColorStop(0.55, Z.T.COLORS.Z_HOOD);
    hGrad.addColorStop(1, Z.T.COLORS.Z_HOOD_DARK);
    Z.ctx.fillStyle = hGrad;
    Z.ctx.beginPath();
    Z.ctx.arc(0, hcY, hR1, Math.PI * 1.07, Math.PI * 1.93);
    Z.ctx.lineTo(Z.headR * 0.84, wy - Z.headR * 0.03);
    Z.ctx.quadraticCurveTo(Z.headR * 0.45, wy + Z.headR * 0.09, Z.headR * 0.12, wy - Z.headR * 0.01);
    Z.ctx.quadraticCurveTo(-Z.headR * 0.20, wy + Z.headR * 0.10, -Z.headR * 0.55, wy);
    Z.ctx.quadraticCurveTo(-Z.headR * 0.80, wy - Z.headR * 0.06, -Z.headR * 0.84, wy - Z.headR * 0.03);
    Z.ctx.closePath();
    Z.ctx.fill(); Z.ctx.stroke();
    // 兜帽竖褶线 ×2（顶部向两侧压弯的细弧）
    R._setStroke(Z.ctx, Z.T.COLORS.Z_HOOD_DARK, R._strokeW(Z.T.STROKE.THIN));
    Z.ctx.beginPath();
    Z.ctx.moveTo(-Z.headR * 0.28, Z.headCY - Z.headR * 0.86);
    Z.ctx.quadraticCurveTo(-Z.headR * 0.55, Z.headCY - Z.headR * 0.70, -Z.headR * 0.66, Z.headCY - Z.headR * 0.44);
    Z.ctx.stroke();
    Z.ctx.beginPath();
    Z.ctx.moveTo(Z.headR * 0.30, Z.headCY - Z.headR * 0.84);
    Z.ctx.quadraticCurveTo(Z.headR * 0.58, Z.headCY - Z.headR * 0.64, Z.headR * 0.64, Z.headCY - Z.headR * 0.42);
    Z.ctx.stroke();
    R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.MAIN));
    // 左缘 V 形撕裂口（兜帽破损记号）
    Z.ctx.fillStyle = Z.T.COLORS.Z_HOOD_DARK;
    Z.ctx.beginPath();
    Z.ctx.moveTo(-hR1 * 0.965, Z.headCY - Z.headR * 0.40);
    Z.ctx.lineTo(-hR1 * 0.82, Z.headCY - Z.headR * 0.26);
    Z.ctx.lineTo(-hR1 * 0.965, Z.headCY - Z.headR * 0.14);
    Z.ctx.closePath();
    Z.ctx.fill();
    // 黑色乱发：额前 2 缕 + 右侧 1 撇（INK 细曲线，兜帽内缘下钻出）
    R._setStroke(Z.ctx, Z.T.COLORS.INK, R._strokeW(Z.T.STROKE.THIN));
    Z.ctx.beginPath();
    Z.ctx.moveTo(-Z.headR * 0.30, wy + Z.headR * 0.02);
    Z.ctx.quadraticCurveTo(-Z.headR * 0.36, wy + Z.headR * 0.08, -Z.headR * 0.24, wy + Z.headR * 0.13);
    Z.ctx.stroke();
    Z.ctx.beginPath();
    Z.ctx.moveTo(Z.headR * 0.22, wy + Z.headR * 0.02);
    Z.ctx.quadraticCurveTo(Z.headR * 0.28, wy + Z.headR * 0.08, Z.headR * 0.19, wy + Z.headR * 0.12);
    Z.ctx.stroke();
    Z.ctx.beginPath();
    Z.ctx.moveTo(Z.headR * 0.78, Z.headCY - Z.headR * 0.36);
    Z.ctx.quadraticCurveTo(Z.headR * 1.00, Z.headCY - Z.headR * 0.36, Z.headR * 1.13, Z.headCY - Z.headR * 0.22);
    Z.ctx.stroke();
    R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.MAIN));
  } else if (Z.type === 'dancer') {
    // v29 黑高顶礼帽（参照设定图：直筒帽冠 + 宽平帽檐、帽檐压眉线上方、
    //   轻微歪戴 ~-0.10 rad = 随性舞者感；耳朵全被帽檐遮（设定图确认）、
    //   无缎带。v29.1 工艺复查修正：帽檐后画盖住冠底缘=接缝干净无断线；
    //   帽冠改对称圆角直筒（消除顶部圆角不对称+左缘渐变锯齿）
    Z.ctx.save();
    Z.ctx.translate(0, Z.headCY - Z.headR * 0.46);
    Z.ctx.rotate(-0.10);
    const brimHalf = Z.headR * 0.95;   // 帽檐半宽（比该高度头轮廓更宽）
    const brimH    = Z.headR * 0.13;   // 帽檐半厚
    const cHalf    = Z.headR * 0.52;   // 帽冠半宽（对称直筒）
    const cH       = Z.headR * 0.82;   // 帽冠高（高顶识别符号）
    // 帽冠（对称圆角直筒，左受光→右暗渐变）
    const cGrad = Z.ctx.createLinearGradient(-cHalf, 0, cHalf, 0);
    cGrad.addColorStop(0, Z.T.COLORS.Z_DN_HAT_LIGHT);
    cGrad.addColorStop(0.38, Z.T.COLORS.Z_DN_HAT);
    cGrad.addColorStop(1, Z.T.COLORS.Z_DN_HAT_DARK);
    Z.ctx.fillStyle = cGrad;
    Z.ctx.beginPath();
    safeRoundRect(Z.ctx, -cHalf, -cH, cHalf * 2, cH + Z.headR * 0.05, Z.headR * 0.09);
    Z.ctx.fill(); Z.ctx.stroke();
    // 帽冠左上受光竖带（赛璐璐反光，与全队高光位一致）
    Z.ctx.fillStyle = 'rgba(255,255,255,0.20)';
    Z.ctx.beginPath();
    Z.ctx.ellipse(-cHalf * 0.52, -cH * 0.46, Z.headR * 0.09, cH * 0.28, 0.10, 0, Math.PI * 2);
    Z.ctx.fill();
    // 帽檐（后画=盖在帽冠底缘之上，近黑扁平椭圆带，接缝干净）
    Z.ctx.fillStyle = Z.T.COLORS.Z_DN_HAT_DARK;
    Z.ctx.beginPath();
    Z.ctx.ellipse(0, 0, brimHalf, brimH, 0, 0, Math.PI * 2);
    Z.ctx.fill(); Z.ctx.stroke();
    Z.ctx.restore();
    // 恢复主描边（僵尸暗色）
    R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.MAIN));
  } else if (Z.type === 'football') {
    // v28 橄榄球头盔（参照设定图：红色圆顶穹壳 + 奶油中条纹 + 侧气孔 +
    //   眉缘缓冲条；盔口下缘压在眼上方 = 眼从盔缘下露出。锈斑删除：
    //   v28.2 VLM 复查锈斑与左上高光带拥挤被误读为杂点，磨损感由球衣下摆
    //   撕裂/短裤破口承担（SIMPLIFY）
    const domeR = Z.headR * 0.95;
    const hGrad = Z.ctx.createLinearGradient(-domeR, 0, domeR, 0);
    hGrad.addColorStop(0, Z.T.COLORS.Z_FH_RED_LIGHT);
    hGrad.addColorStop(0.5, Z.T.COLORS.Z_FH_RED);
    hGrad.addColorStop(1, Z.T.COLORS.Z_FH_RED_DARK);
    Z.ctx.fillStyle = hGrad;
    Z.ctx.beginPath();
    Z.ctx.arc(0, Z.headCY, domeR, Math.PI * 1.02, Math.PI * 1.98);
    Z.ctx.lineTo( Z.headR * 0.92, Z.headCY);
    Z.ctx.lineTo(-Z.headR * 0.92, Z.headCY);
    Z.ctx.closePath();
    Z.ctx.fill(); Z.ctx.stroke();
    // 中条纹（奶油白，盔顶中线，上窄下宽垂至眉缘条）
    const sHalf = Z.headR * 0.21;
    Z.ctx.fillStyle = Z.T.COLORS.Z_FH_STRIPE;
    Z.ctx.beginPath();
    Z.ctx.moveTo(-sHalf * 0.55, Z.headCY - domeR * 0.985);
    Z.ctx.quadraticCurveTo(-sHalf, Z.headCY - domeR * 0.45, -sHalf, Z.headCY - Z.headR * 0.04);
    Z.ctx.lineTo( sHalf, Z.headCY - Z.headR * 0.04);
    Z.ctx.quadraticCurveTo( sHalf, Z.headCY - domeR * 0.45, sHalf * 0.55, Z.headCY - domeR * 0.985);
    Z.ctx.closePath();
    Z.ctx.fill(); Z.ctx.stroke();
    // 眉缘缓冲条（深红横带 = 参照图 brow bumper，比盔口略宽）
    Z.ctx.fillStyle = Z.T.COLORS.Z_FH_RED_DARK;
    safeRoundRect(Z.ctx, -Z.headR * 0.95, Z.headCY - Z.headR * 0.14, Z.headR * 1.90, Z.headR * 0.11, Z.headR * 0.045);
    Z.ctx.fill(); Z.ctx.stroke();
    // 侧气孔 ×1 每侧（暗红小圆点，条纹两侧对称，避开左上高光带）
    Z.ctx.fillStyle = Z.T.COLORS.Z_FH_RED_DARK;
    for (const s of [-1, 1]) {
      Z.ctx.beginPath();
      Z.ctx.arc(s * Z.headR * 0.60, Z.headCY - Z.headR * 0.45, Z.headR * 0.055, 0, Math.PI * 2);
      Z.ctx.fill();
    }
    // 盔体左上高光带（赛璐璐反光，与全队高光位一致，收窄避免与气孔拥挤）
    Z.ctx.fillStyle = 'rgba(255,255,255,0.30)';
    Z.ctx.beginPath();
    Z.ctx.ellipse(-Z.headR * 0.40, Z.headCY - Z.headR * 0.60, Z.headR * 0.10, Z.headR * 0.20, -0.50, 0, Math.PI * 2);
    Z.ctx.fill();
  } else if (Z.type === 'king') {
    // v51 黄金王冠（三尖冠 + 尖顶金珠 + 中央红宝石 + 冠底宽金带；
    //   轻微后仰 -0.06 rad = 王者从容；底带后画盖住冠底缘 = 接缝干净(同 v29.1 礼帽工艺)）
    Z.ctx.save();
    Z.ctx.translate(0, Z.headCY - Z.headR * 0.55);
    Z.ctx.rotate(-0.06);
    const crW = Z.headR * 0.88;            // 冠身半宽
    const crH = Z.headR * 0.42;            // 冠身高度
    const tipH = Z.headR * 0.30;           // 尖齿高（中央尖更高）
    const gGrad = Z.ctx.createLinearGradient(-crW, 0, crW, 0);
    gGrad.addColorStop(0, Z.T.COLORS.Z_KING_GOLD);
    gGrad.addColorStop(0.55, Z.T.COLORS.Z_KING_GOLD);
    gGrad.addColorStop(1, Z.T.COLORS.Z_KING_GOLD_DARK);
    Z.ctx.fillStyle = gGrad;
    Z.ctx.beginPath();
    Z.ctx.moveTo(-crW, 0);
    Z.ctx.lineTo(-crW, -crH);
    Z.ctx.lineTo(-crW * 0.62, -crH - tipH * 0.85);
    Z.ctx.lineTo(-crW * 0.34, -crH * 0.72);
    Z.ctx.lineTo(0, -crH - tipH);
    Z.ctx.lineTo(crW * 0.34, -crH * 0.72);
    Z.ctx.lineTo(crW * 0.62, -crH - tipH * 0.85);
    Z.ctx.lineTo(crW, -crH);
    Z.ctx.lineTo(crW, 0);
    Z.ctx.closePath();
    Z.ctx.fill(); Z.ctx.stroke();
    // 尖顶金珠 ×3（左/中/右尖上, 中尖珠略大）
    Z.ctx.fillStyle = Z.T.COLORS.Z_KING_GOLD;
    for (const [bx, br] of [[-crW * 0.62, Z.headR * 0.055], [0, Z.headR * 0.07], [crW * 0.62, Z.headR * 0.055]]) {
      Z.ctx.beginPath();
      Z.ctx.arc(bx, -crH - tipH * 0.85 - Z.headR * 0.02, br, 0, Math.PI * 2);
      Z.ctx.fill(); Z.ctx.stroke();
    }
    // 中央红宝石（冠身正中, 深红圆）
    Z.ctx.fillStyle = Z.T.COLORS.Z_KING_GEM;
    Z.ctx.beginPath();
    Z.ctx.arc(0, -crH * 0.42, Z.headR * 0.10, 0, Math.PI * 2);
    Z.ctx.fill(); Z.ctx.stroke();
    // 冠底宽金带（后画 = 佩戴接缝干净）
    Z.ctx.fillStyle = Z.T.COLORS.Z_KING_GOLD_DARK;
    safeRoundRect(Z.ctx, -crW * 1.06, -crH * 0.30, crW * 2.12, crH * 0.32, Z.headR * 0.05);
    Z.ctx.fill(); Z.ctx.stroke();
    Z.ctx.restore();
    // 恢复主描边（僵尸暗色）
    R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.MAIN));
  }

}

/** 表情系统(Z_FACE 独立比例: 眼白/瞳孔/高光) */
function _zpFace(Z, R) {
  /* =============================================================
     表情系统 v3 阵营区分：使用 Z_FACE 独立比例 + 类型差异化表情
     - 植物：Z.T.FACE 白描边 · 大圆眼 · 无辜感
     - 僵尸：Z_FACE 暗描边 · 小眼距宽 · 病态/疯狂/愤怒/冷酷
     ============================================================= */
  Z.ZF = Z.T.Z_FACE;
  Z.eyeY  = Z.headCY + Z.headR * Z.ZF.EYE_Y_OFFSET;
  // v27 小鬼僵尸：超大圆眼（0.20 → 0.27 Z.headR），眼白换浑浊淡黄
  // v28 橄榄球僵尸：凸眼（0.20 → 0.23 Z.headR），狂乱瞪视感
  // v29 舞王：凸出圆眼 0.24（参照设定图极度兴奋癫狂）
  Z.eyeR  = Z.headR * (Z.type === 'imp' ? 0.27 :
                        Z.type === 'football' ? 0.23 :
                        Z.type === 'dancer' ? 0.24 : Z.ZF.EYE_R_RATIO);
  Z.eyeDX = Z.headR * Z.ZF.EYE_DX_RATIO;

  // 眼白（僵尸用暗色眼白描边，与植物白描边对比；v27 imp 浑浊淡黄；
  //   v28 football 同浑浊淡黄 = 病态运动员）
  Z.ctx.fillStyle = Z.type === 'imp' || Z.type === 'football' || Z.type === 'dancer' ?
                  Z.T.COLORS.Z_EYE_YELLOW : Z.T.COLORS.STROKE;
  Z.ctx.beginPath();
  Z.ctx.ellipse(-Z.eyeDX, Z.eyeY, Z.eyeR * 0.96, Z.eyeR, 0, 0, Math.PI * 2);
  Z.ctx.ellipse( Z.eyeDX, Z.eyeY, Z.eyeR * 0.96, Z.eyeR, 0, 0, Math.PI * 2);
  Z.ctx.fill();
  R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.EYE));
  Z.ctx.stroke();

  // 瞳孔（Z_FACE 比例：更小更偏，无神感；v27 imp 极小居中偏下=呆滞惊恐；
  //   v28 football 极小近居中 = 狂乱瞪视）
  Z.ctx.fillStyle = Z.T.COLORS.INK;
  // v29 舞王：瞳孔极小 0.36、居中偏上 = 沉浸音乐的癫狂上翻凝视
  const pupilR = Z.eyeR * (Z.type === 'imp' ? 0.30 :
                         Z.type === 'football' ? 0.42 :
                         Z.type === 'dancer' ? 0.36 : Z.ZF.PUPIL_R_RATIO);
  const pOffX  = Z.type === 'imp' ? 0 :
                 Z.type === 'football' ? Z.eyeR * 0.05 :
                 Z.type === 'dancer' ? 0 : Z.eyeR * Z.ZF.PUPIL_OFF_X;
  const pOffY  = Z.type === 'imp' ? Z.eyeR * 0.10 :
                 Z.type === 'football' ? Z.eyeR * 0.06 :
                 Z.type === 'dancer' ? -Z.eyeR * 0.07 : Z.eyeR * Z.ZF.PUPIL_OFF_Y;
  Z.ctx.beginPath();
  Z.ctx.arc(-Z.eyeDX + pOffX, Z.eyeY + pOffY, pupilR, 0, Math.PI * 2);
  Z.ctx.arc( Z.eyeDX + pOffX, Z.eyeY + pOffY, pupilR, 0, Math.PI * 2);
  Z.ctx.fill();

  // 双高光（僵尸微弱，只有单颗小高光，植物是双大高光）
  // v27 imp：高光贴瞳孔左上、稍大（衬托极小瞳孔的空洞感）
  Z.ctx.fillStyle = Z.T.COLORS.STROKE;
  const hOffX = Z.type === 'imp' ? -pupilR * 0.45 : Z.eyeR * 0.05;
  const hOffY = Z.type === 'imp' ? Z.eyeR * 0.16 : Z.eyeR * 0.08;
  const hR    = pupilR * (Z.type === 'imp' ? 0.50 : 0.35);
  Z.ctx.beginPath();
  Z.ctx.arc(-Z.eyeDX + hOffX, Z.eyeY - hOffY, hR, 0, Math.PI * 2);
  Z.ctx.arc( Z.eyeDX + hOffX, Z.eyeY - hOffY, hR, 0, Math.PI * 2);
  Z.ctx.fill();

}

/** 类型差异化表情(眉形/嘴部/獠牙/舌头) */
function _zpFaceVariants(Z, R) {
  // 类型差异化表情特征
  R._setStroke(Z.ctx, Z.T.COLORS.INK, R._strokeW(Z.T.STROKE.INK));
  if (Z.type === 'bucket') {
    // v26 担忧眉（内低外高短弧 + 加粗 1.5×，参照设定图呆滞/惊恐表情）
    R._setStroke(Z.ctx, Z.T.COLORS.INK, R._strokeW(Z.T.STROKE.INK) * 1.5);
    Z.ctx.beginPath();
    Z.ctx.moveTo(-Z.eyeDX - Z.eyeR * 1.00, Z.eyeY - Z.eyeR * 2.05);
    Z.ctx.quadraticCurveTo(-Z.eyeDX - Z.eyeR * 0.10, Z.eyeY - Z.eyeR * 1.45, -Z.eyeDX + Z.eyeR * 0.60, Z.eyeY - Z.eyeR * 1.15);
    Z.ctx.stroke();
    Z.ctx.beginPath();
    Z.ctx.moveTo( Z.eyeDX + Z.eyeR * 1.00, Z.eyeY - Z.eyeR * 2.05);
    Z.ctx.quadraticCurveTo( Z.eyeDX + Z.eyeR * 0.10, Z.eyeY - Z.eyeR * 1.45,  Z.eyeDX - Z.eyeR * 0.60, Z.eyeY - Z.eyeR * 1.15);
    Z.ctx.stroke();
    R._setStroke(Z.ctx, Z.T.COLORS.INK, R._strokeW(Z.T.STROKE.INK));
    // 眼角下垂线（丧萌/疲惫，经典保留）
    Z.ctx.beginPath();
    Z.ctx.moveTo(-Z.eyeDX - Z.eyeR * 0.95, Z.eyeY + Z.eyeR * 0.2);
    Z.ctx.quadraticCurveTo(-Z.eyeDX - Z.eyeR * 0.5, Z.eyeY + Z.eyeR * 0.55, -Z.eyeDX + Z.eyeR * 0.1, Z.eyeY + Z.eyeR * 0.7);
    Z.ctx.stroke();
    Z.ctx.beginPath();
    Z.ctx.moveTo( Z.eyeDX + Z.eyeR * 0.95, Z.eyeY + Z.eyeR * 0.2);
    Z.ctx.quadraticCurveTo( Z.eyeDX + Z.eyeR * 0.5, Z.eyeY + Z.eyeR * 0.55,  Z.eyeDX - Z.eyeR * 0.1, Z.eyeY + Z.eyeR * 0.7);
    Z.ctx.stroke();
  } else if (Z.type === 'imp') {
    // v27 紧张细眉（短弧、内端上抬，参照设定图惊恐/无神表情）
    Z.ctx.beginPath();
    Z.ctx.moveTo(-Z.eyeDX - Z.eyeR * 0.78, Z.eyeY - Z.eyeR * 1.38);
    Z.ctx.quadraticCurveTo(-Z.eyeDX - Z.eyeR * 0.10, Z.eyeY - Z.eyeR * 1.66, -Z.eyeDX + Z.eyeR * 0.58, Z.eyeY - Z.eyeR * 1.55);
    Z.ctx.stroke();
    Z.ctx.beginPath();
    Z.ctx.moveTo( Z.eyeDX + Z.eyeR * 0.78, Z.eyeY - Z.eyeR * 1.38);
    Z.ctx.quadraticCurveTo( Z.eyeDX + Z.eyeR * 0.10, Z.eyeY - Z.eyeR * 1.66,  Z.eyeDX - Z.eyeR * 0.58, Z.eyeY - Z.eyeR * 1.55);
    Z.ctx.stroke();
  } else if (Z.type === 'football') {
    // v28 怒眉（参照设定图：粗重 V 形压眉，1.8× 加粗 + 内端下压盖向眼）
    R._setStroke(Z.ctx, Z.T.COLORS.INK, R._strokeW(Z.T.STROKE.INK) * 1.8);
    Z.ctx.beginPath();
    Z.ctx.moveTo(-Z.eyeDX - Z.eyeR * 1.05, Z.eyeY - Z.eyeR * 1.30);
    Z.ctx.quadraticCurveTo(-Z.eyeDX - Z.eyeR * 0.20, Z.eyeY - Z.eyeR * 1.02, -Z.eyeDX + Z.eyeR * 0.55, Z.eyeY - Z.eyeR * 0.78);
    Z.ctx.stroke();
    Z.ctx.beginPath();
    Z.ctx.moveTo( Z.eyeDX + Z.eyeR * 1.05, Z.eyeY - Z.eyeR * 1.30);
    Z.ctx.quadraticCurveTo( Z.eyeDX + Z.eyeR * 0.20, Z.eyeY - Z.eyeR * 1.02,  Z.eyeDX - Z.eyeR * 0.55, Z.eyeY - Z.eyeR * 0.78);
    Z.ctx.stroke();
    R._setStroke(Z.ctx, Z.T.COLORS.INK, R._strokeW(Z.T.STROKE.INK));
  } else if (Z.type === 'king') {
    // v51 王者怒眉（2.0× 加粗 + 内端重压 = 怒视战场, 比 football 更沉）
    R._setStroke(Z.ctx, Z.T.COLORS.INK, R._strokeW(Z.T.STROKE.INK) * 2.0);
    Z.ctx.beginPath();
    Z.ctx.moveTo(-Z.eyeDX - Z.eyeR * 1.05, Z.eyeY - Z.eyeR * 1.34);
    Z.ctx.quadraticCurveTo(-Z.eyeDX - Z.eyeR * 0.20, Z.eyeY - Z.eyeR * 1.00, -Z.eyeDX + Z.eyeR * 0.55, Z.eyeY - Z.eyeR * 0.74);
    Z.ctx.stroke();
    Z.ctx.beginPath();
    Z.ctx.moveTo( Z.eyeDX + Z.eyeR * 1.05, Z.eyeY - Z.eyeR * 1.34);
    Z.ctx.quadraticCurveTo( Z.eyeDX + Z.eyeR * 0.20, Z.eyeY - Z.eyeR * 1.00,  Z.eyeDX - Z.eyeR * 0.55, Z.eyeY - Z.eyeR * 0.74);
    Z.ctx.stroke();
    R._setStroke(Z.ctx, Z.T.COLORS.INK, R._strokeW(Z.T.STROKE.INK));
  } else if (Z.type === 'dancer') {
    // v29 兴奋高挑细眉（内端上扬弧 = 倒八字滑稽狂热，参照设定图细长眉）
    Z.ctx.beginPath();
    Z.ctx.moveTo(-Z.eyeDX - Z.eyeR * 0.78, Z.eyeY - Z.eyeR * 1.18);
    Z.ctx.quadraticCurveTo(-Z.eyeDX - Z.eyeR * 0.05, Z.eyeY - Z.eyeR * 1.48, -Z.eyeDX + Z.eyeR * 0.60, Z.eyeY - Z.eyeR * 1.26);
    Z.ctx.stroke();
    Z.ctx.beginPath();
    Z.ctx.moveTo( Z.eyeDX + Z.eyeR * 0.78, Z.eyeY - Z.eyeR * 1.18);
    Z.ctx.quadraticCurveTo( Z.eyeDX + Z.eyeR * 0.05, Z.eyeY - Z.eyeR * 1.48,  Z.eyeDX - Z.eyeR * 0.60, Z.eyeY - Z.eyeR * 1.26);
    Z.ctx.stroke();
  }

  // 腮红（僵尸更大更暗 = 病态红晕，Z_FACE 比例）
  Z.ctx.fillStyle = Z.T.COLORS.BLUSH_ZOMBIE;
  const blushCX = Z.headR * Z.ZF.BLUSH_CX;
  const blushCY = Z.eyeY + Z.headR * Z.ZF.BLUSH_CY;
  const blushR  = Z.headR * Z.ZF.BLUSH_SIZE;
  Z.ctx.beginPath();
  Z.ctx.arc(-blushCX, blushCY, blushR, 0, Math.PI * 2);
  Z.ctx.arc( blushCX, blushCY, blushR, 0, Math.PI * 2);
  Z.ctx.fill();

  // 嘴型：按类型差异化（v3 阵营区分）
  Z.mouthY = Z.eyeY + Z.headR * Z.ZF.MOUTH_Y_OFFSET;
  if (Z.type === 'bucket') {
    // v26 呆滞张大嘴（参照设定图：暗红口腔 + 参差獠牙）
    const mW = Z.headR * 0.34;
    const mH = Z.headR * 0.26;
    Z.ctx.fillStyle = Z.T.COLORS.Z_MOUTH;
    Z.ctx.beginPath();
    Z.ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2);
    Z.ctx.fill();
    R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.LIP));
    Z.ctx.stroke();
    // 上排獠牙 ×4（长短不齐，从上唇垂下）
    Z.ctx.fillStyle = Z.T.COLORS.STROKE;
    const teethTop = [
      [-0.66, 0.28, 0.42], [-0.30, 0.30, 0.55],
      [ 0.04, 0.28, 0.48], [ 0.38, 0.26, 0.38],
    ];
    for (const [tx, tw, th] of teethTop) {
      safeRoundRect(Z.ctx, mW * tx, Z.mouthY - mH * 0.82, mW * tw, mH * th, mW * 0.09);
      Z.ctx.fill();
    }
    // 下排牙 ×2（短小，贴下唇）
    safeRoundRect(Z.ctx, mW * -0.42, Z.mouthY + mH * 0.34, mW * 0.24, mH * 0.30, mW * 0.08);
    Z.ctx.fill();
    safeRoundRect(Z.ctx, mW * 0.18, Z.mouthY + mH * 0.30, mW * 0.22, mH * 0.26, mW * 0.08);
    Z.ctx.fill();
  } else if (Z.type === 'imp') {
    // v27 呆滞 O 型张嘴（参照设定图：近黑口腔 + 上 2 方牙/下 2 小牙）
    const mW = Z.headR * 0.30;
    const mH = Z.headR * 0.22;
    Z.ctx.fillStyle = Z.T.COLORS.INK;
    Z.ctx.beginPath();
    Z.ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2);
    Z.ctx.fill();
    R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.LIP));
    Z.ctx.stroke();
    // 上排方牙 ×2（不齐，从上唇垂下）
    Z.ctx.fillStyle = Z.T.COLORS.STROKE;
    safeRoundRect(Z.ctx, -mW * 0.52, Z.mouthY - mH * 0.90, mW * 0.34, mH * 0.42, mW * 0.06);
    Z.ctx.fill();
    safeRoundRect(Z.ctx, mW * 0.16, Z.mouthY - mH * 0.94, mW * 0.32, mH * 0.48, mW * 0.06);
    Z.ctx.fill();
    // 下排小牙 ×2（贴下唇）
    safeRoundRect(Z.ctx, -mW * 0.36, Z.mouthY + mH * 0.48, mW * 0.26, mH * 0.32, mW * 0.05);
    Z.ctx.fill();
    safeRoundRect(Z.ctx, mW * 0.10, Z.mouthY + mH * 0.52, mW * 0.22, mH * 0.28, mW * 0.05);
    Z.ctx.fill();
  } else if (Z.type === 'football') {
    // v28 咆哮张嘴（参照设定图：暗红口腔 + 参差不齐獠牙，面罩格栅后嘶吼）
    const mW = Z.headR * 0.32;
    const mH = Z.headR * 0.24;
    Z.ctx.fillStyle = Z.T.COLORS.Z_MOUTH;
    Z.ctx.beginPath();
    Z.ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2);
    Z.ctx.fill();
    R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.LIP));
    Z.ctx.stroke();
    // 上排獠牙 ×4（长短不齐，从上唇垂下）
    Z.ctx.fillStyle = Z.T.COLORS.STROKE;
    const teethTop = [
      [-0.64, 0.26, 0.40], [-0.28, 0.28, 0.55],
      [ 0.06, 0.26, 0.46], [ 0.40, 0.24, 0.36],
    ];
    for (const [tx, tw, th] of teethTop) {
      safeRoundRect(Z.ctx, mW * tx, Z.mouthY - mH * 0.82, mW * tw, mH * th, mW * 0.08);
      Z.ctx.fill();
    }
    // 下排牙 ×2（短小，贴下唇）
    safeRoundRect(Z.ctx, mW * -0.40, Z.mouthY + mH * 0.36, mW * 0.24, mH * 0.28, mW * 0.07);
    Z.ctx.fill();
    safeRoundRect(Z.ctx, mW * 0.16, Z.mouthY + mH * 0.32, mW * 0.22, mH * 0.24, mW * 0.07);
    Z.ctx.fill();
  } else if (Z.type === 'king') {
    // v51 王者咆哮（暗红大口腔 + 双长獠牙 = 军团冲锋号令）
    const mW = Z.headR * 0.34;
    const mH = Z.headR * 0.24;
    Z.ctx.fillStyle = Z.T.COLORS.Z_MOUTH;
    Z.ctx.beginPath();
    Z.ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2);
    Z.ctx.fill();
    R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.LIP));
    Z.ctx.stroke();
    // 双长獠牙（比 football 更长 = 压迫感）
    Z.ctx.fillStyle = Z.T.COLORS.STROKE;
    safeRoundRect(Z.ctx, mW * -0.52, Z.mouthY - mH * 0.88, mW * 0.26, mH * 0.62, mW * 0.08);
    Z.ctx.fill();
    safeRoundRect(Z.ctx, mW * 0.26, Z.mouthY - mH * 0.88, mW * 0.26, mH * 0.62, mW * 0.08);
    Z.ctx.fill();
    // 下排短牙 ×2
    safeRoundRect(Z.ctx, mW * -0.34, Z.mouthY + mH * 0.40, mW * 0.24, mH * 0.26, mW * 0.07);
    Z.ctx.fill();
    safeRoundRect(Z.ctx, mW * 0.10, Z.mouthY + mH * 0.40, mW * 0.22, mH * 0.24, mW * 0.07);
    Z.ctx.fill();
  } else if (Z.type === 'dancer') {
    // v29 狂笑大张嘴（参照设定图：暗红口腔 + 鲜红舌头 + 参差獠牙 =
    //   沉浸音乐癫狂高歌）
    const mW = Z.headR * 0.30;
    const mH = Z.headR * 0.25;
    Z.ctx.fillStyle = Z.T.COLORS.Z_MOUTH;
    Z.ctx.beginPath();
    Z.ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2);
    Z.ctx.fill();
    R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.LIP));
    Z.ctx.stroke();
    // 舌头（鲜红，口腔底部，clip 在嘴内；v29.1 收窄避开下排牙）
    Z.ctx.save();
    Z.ctx.beginPath();
    Z.ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2);
    Z.ctx.clip();
    Z.ctx.fillStyle = Z.T.COLORS.Z_DN_TONGUE;
    Z.ctx.beginPath();
    Z.ctx.ellipse(0, Z.mouthY + mH * 0.55, mW * 0.55, mH * 0.50, 0, 0, Math.PI * 2);
    Z.ctx.fill();
    Z.ctx.restore();
    // 上排獠牙 ×4（长短不齐，从上唇垂下）
    Z.ctx.fillStyle = Z.T.COLORS.STROKE;
    const teethTop = [
      [-0.58, 0.24, 0.40], [-0.24, 0.27, 0.55],
      [ 0.08, 0.25, 0.46], [ 0.40, 0.22, 0.36],
    ];
    for (const [tx, tw, th] of teethTop) {
      safeRoundRect(Z.ctx, mW * tx, Z.mouthY - mH * 0.82, mW * tw, mH * th, mW * 0.08);
      Z.ctx.fill();
    }
    // 下排牙 ×2（短小，贴下唇两角；v29.1 外移+参差化）
    safeRoundRect(Z.ctx, mW * -0.74, Z.mouthY + mH * 0.28, mW * 0.22, mH * 0.24, mW * 0.07);
    Z.ctx.fill();
    safeRoundRect(Z.ctx, mW * 0.50, Z.mouthY + mH * 0.30, mW * 0.26, mH * 0.30, mW * 0.07);
    Z.ctx.fill();
  }

}

/** v28 橄榄球面罩格栅(最后绘制罩嘴部之上) */
function _zpCage(Z, R) {
  // v28 橄榄球僵尸面罩格栅（最后绘制，罩在嘴部之上；参照设定图：
  //   仅罩口鼻/下颌区，2 横杆 + 2 竖杆 + 两侧上扬侧臂接盔侧，眼全露）
  if (Z.type === 'football') {
    // 侧臂 ×2（暖银粗杆，从口区两侧上扬接盔侧）
    R._setStroke(Z.ctx, Z.T.COLORS.Z_FH_CAGE, R._strokeW(Z.T.STROKE.THIN) * 1.35);
    for (const s of [-1, 1]) {
      Z.ctx.beginPath();
      Z.ctx.moveTo(s * Z.headR * 0.56, Z.mouthY + Z.headR * 0.14);
      Z.ctx.quadraticCurveTo(s * Z.headR * 0.78, Z.mouthY - Z.headR * 0.12, s * Z.headR * 0.88, Z.headCY + Z.headR * 0.06);
      Z.ctx.stroke();
    }
    // 横杆 ×2（口区微弧）
    R._setStroke(Z.ctx, Z.T.COLORS.Z_FH_CAGE, R._strokeW(Z.T.STROKE.THIN) * 1.15);
    for (const [y1, y2] of [
      [Z.mouthY - Z.headR * 0.06, Z.mouthY + Z.headR * 0.01],
      [Z.mouthY + Z.headR * 0.12, Z.mouthY + Z.headR * 0.19],
    ]) {
      Z.ctx.beginPath();
      Z.ctx.moveTo(-Z.headR * 0.52, y1);
      Z.ctx.quadraticCurveTo(0, y2, Z.headR * 0.52, y1);
      Z.ctx.stroke();
    }
    // 竖杆 ×2（口区中央两侧，短直杆）
    R._setStroke(Z.ctx, Z.T.COLORS.Z_FH_CAGE, R._strokeW(Z.T.STROKE.THIN));
    for (const s of [-1, 1]) {
      Z.ctx.beginPath();
      Z.ctx.moveTo(s * Z.headR * 0.18, Z.mouthY - Z.headR * 0.10);
      Z.ctx.lineTo(s * Z.headR * 0.16, Z.mouthY + Z.headR * 0.22);
      Z.ctx.stroke();
    }
    // 恢复主描边（僵尸暗色）
    R._setStroke(Z.ctx, Z.T.COLORS.Z_STROKE, R._strokeW(Z.T.STROKE.MAIN));
  }
}

module.exports = {
  renderZombieToOffscreen,
  _zpSetup, _zpSack, _zpCape, _zpArms, _zpTorso, _zpShoulders, _zpLegs, _zpHead, _zpHeadgear, _zpFace, _zpFaceVariants, _zpCage,
};
