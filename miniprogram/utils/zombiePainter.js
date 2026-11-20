// utils/zombiePainter.js - 僵尸离屏插画绘制（v93 经典 PvZ 复刻重绘）
// 参照附图（经典 PvZ 普通僵尸）全面重绘：
//   · 大头骨椭圆头（灰绿皮肤 + 前额皱纹 + 招风耳 + 头顶乱发）
//   · 棕色西装外套 + 白衬衫 V 领 + 红领带 + 深色西裤（经典 PvZ 制式）
//   · 大白眼珠 + 小瞳孔 + 咧嘴喊叫（暗红口腔 + 上排牙）
//   · 阵营统一深橄榄勾边（#39412C），替代旧 Q 版圆头萌系
// 阶段管线沿用 v55：setup → sack → cape → arms → torso → shoulders
//   → legs → head → headgear → face → faceVariants → cage
// 五僵尸识别符号保留：铁桶 / 小鬼兜帽麻袋 / 橄榄球红盔面罩 / 舞王礼帽紫西装 / 僵尸王金冠斗篷
const { ZOMBIE_TYPES } = require('./constants.js');
const { safeRoundRect } = require('./canvasHelpers.js');

/* v95 经典 PvZ 复刻色板（对齐附图）：
   铁桶=银灰铆钉桶+棕西装白衬衫红领带 / 小鬼=黑乱发+深背心浅衬衫 / 橄榄球=红盔红球衣
   舞王=黑礼帽紫西装+手杖 / 僵尸王=金冠金袍紫披风；v95 删除圆框眼镜（附图无眼镜） */
const PZ = {
  OUTLINE:   '#39412C',   // 皮肤/全身深橄榄勾边
  OUT_JK:    '#3D2414',   // 西装深棕勾边（v95 附图棕西装）
  JK:        '#8B5E3C',   // 西装外套棕（v95 回归附图棕西装）
  JK_LIGHT:  '#A9744C',
  JK_DARK:   '#5F3A22',
  SHIRT:     '#EFEAD9',   // 白衬衫
  TIE:       '#C62828',   // 红领带
  TIE_DARK:  '#9E1F1F',
  PANTS:     '#4A4F54',   // 深灰蓝西裤（v95 对齐附图）
  PANTS_OUT: '#272B2F',
  SHOES:     '#3A2E26',   // 皮鞋深棕
  MOUTH:     '#6E2424',   // 口腔暗红
  MOUTH_OUT: '#38140F',
  TEETH:     '#F2EFE0',   // 牙齿米白
  HAIR:      '#3A4230',   // 乱发
  WRINKLE:   'rgba(70,82,52,0.55)',
  // 各类型皮肤明暗（base = ZOMBIE_TYPES[].color）
  SKIN: {
    bucket:   { light: '#B5C98F', dark: '#6E8452' },
    imp:      { light: '#C3D6A0', dark: '#84976A' },
    football: { light: '#9DB77E', dark: '#5E7A48' },
    dancer:   { light: '#B8CF94', dark: '#7C925C' },
    king:     { light: '#A9C487', dark: '#6E8A50' }
  },
  // 各类型体型（×UNIT）
  BODY: {
    bucket:   { bodyW: 0.44, armLen: 0.34, armRot: 0.38, legW: 0.15 },
    imp:      { bodyW: 0.34, armLen: 0.38, armRot: 0.42, legW: 0.12 },
    football: { bodyW: 0.50, armLen: 0.30, armRot: 0.34, legW: 0.20 },
    dancer:   { bodyW: 0.46, armLen: 0.34, armRot: 0.55, legW: 0.16 },
    king:     { bodyW: 0.52, armLen: 0.30, armRot: 0.30, legW: 0.22 }
  }
};

/**
 * 僵尸离屏渲染总入口（orchestrator）
 * @param {string} type - ZOMBIE_TYPES 键
 * @param {Object} R - renderer 实例（T/_strokeW/_setStroke/dpr）
 * @returns {Object|null} 离屏 canvas（基础库不支持时 null）
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

/** 画布建立 + 超采样 + 描边基准 + 地面阴影 */
function _zpSetup(type, R) {
  const Z = { type: type };
  Z.def = ZOMBIE_TYPES[Z.type];
  Z.T = R.T;
  Z.UNIT = 50;
  R._strokeW(1, Z.UNIT);
  Z.P = PZ;                                  // v93 经典色板
  Z.B = PZ.BODY[Z.type] || PZ.BODY.bucket;
  Z.skinDark = (PZ.SKIN[Z.type] || PZ.SKIN.bucket).dark;
  Z.skinLight = (PZ.SKIN[Z.type] || PZ.SKIN.bucket).light;

  const SS = R.dpr * Z.T.OFFSCREEN.SUPERSAMPLE;
  const size = Z.UNIT * 2.8;
  Z.canvas = wx.createOffscreenCanvas ? wx.createOffscreenCanvas({
    type: '2d',
    width: Math.round(size * SS),
    height: Math.round(size * SS)
  }) : null;
  if (!Z.canvas) return null;
  Z.ctx = Z.canvas.getContext('2d');
  Z.ctx.scale(SS, SS);
  Z.ctx.translate(size / 2, size / 2);

  const swMain = R._strokeW(Z.T.STROKE.MAIN);
  R._setStroke(Z.ctx, PZ.OUTLINE, swMain * 0.82);   // v93 深橄榄主勾边（略细于旧 4.0 系）

  // 地面阴影
  Z.ctx.fillStyle = Z.T.COLORS.SHADOW;
  Z.ctx.beginPath();
  Z.ctx.ellipse(0, Z.UNIT * 1.10, Z.UNIT * 0.74, Z.UNIT * 0.20, 0, 0, Math.PI * 2);
  Z.ctx.fill();

  return Z;
}

/** v93 主勾边恢复（各阶段收尾用） */
function _zpMain(Z, R) {
  R._setStroke(Z.ctx, PZ.OUTLINE, R._strokeW(Z.T.STROKE.MAIN) * 0.82);
}

/** v27 小鬼肩挎麻袋（先于手臂/头绘制，造型保留） */
function _zpSack(Z, R) {
  if (Z.type === 'imp') {
    const U = Z.UNIT;
    Z.ctx.save();
    Z.ctx.translate(-U * 0.66, U * 0.02);
    Z.ctx.rotate(-0.40);
    // 袋颈
    Z.ctx.fillStyle = Z.T.COLORS.Z_SACK;
    Z.ctx.beginPath();
    Z.ctx.moveTo(-U * 0.085, -U * 0.38);
    Z.ctx.lineTo(U * 0.085, -U * 0.38);
    Z.ctx.lineTo(U * 0.11, -U * 0.22);
    Z.ctx.lineTo(-U * 0.11, -U * 0.22);
    Z.ctx.closePath();
    Z.ctx.fill(); Z.ctx.stroke();
    // 袋身
    const sGrad = Z.ctx.createLinearGradient(0, -U * 0.22, 0, U * 0.30);
    sGrad.addColorStop(0, Z.T.COLORS.Z_SACK);
    sGrad.addColorStop(0.72, Z.T.COLORS.Z_SACK);
    sGrad.addColorStop(1, Z.T.COLORS.Z_SACK_DARK);
    Z.ctx.fillStyle = sGrad;
    Z.ctx.beginPath();
    Z.ctx.moveTo(-U * 0.11, -U * 0.22);
    Z.ctx.bezierCurveTo(-U * 0.25, -U * 0.10, -U * 0.26, U * 0.14, -U * 0.15, U * 0.27);
    Z.ctx.quadraticCurveTo(0, U * 0.36, U * 0.15, U * 0.25);
    Z.ctx.bezierCurveTo(U * 0.26, U * 0.12, U * 0.25, -U * 0.08, U * 0.11, -U * 0.22);
    Z.ctx.closePath();
    Z.ctx.fill(); Z.ctx.stroke();
    // 束绳 + 绳结 + 缝线 + 补丁
    Z.ctx.fillStyle = Z.T.COLORS.Z_SACK_DARK;
    Z.ctx.fillRect(-U * 0.125, -U * 0.23, U * 0.25, U * 0.04);
    Z.ctx.fillRect(-U * 0.117, -U * 0.165, U * 0.234, U * 0.035);
    Z.ctx.beginPath();
    Z.ctx.arc(-U * 0.125, -U * 0.20, U * 0.055, 0, Math.PI * 2);
    Z.ctx.fill(); Z.ctx.stroke();
    Z.ctx.globalAlpha = 0.45;
    R._setStroke(Z.ctx, Z.T.COLORS.Z_SACK_DARK, R._strokeW(Z.T.STROKE.THIN));
    for (const sx of [-U * 0.08, U * 0.06]) {
      Z.ctx.beginPath();
      Z.ctx.moveTo(sx, -U * 0.10);
      Z.ctx.lineTo(sx, U * 0.20);
      Z.ctx.stroke();
    }
    Z.ctx.globalAlpha = 0.55;
    Z.ctx.fillStyle = Z.T.COLORS.Z_SACK_DARK;
    Z.ctx.beginPath();
    safeRoundRect(Z.ctx, U * 0.01, U * 0.07, U * 0.14, U * 0.12, U * 0.02);
    Z.ctx.fill();
    Z.ctx.globalAlpha = 1;
    _zpMain(Z, R);
    Z.ctx.restore();
  }
}

/** v51 僵尸王皇家深红斗篷（先于身体绘制，造型保留） */
function _zpCape(Z, R) {
  if (Z.type === 'king') {
    const U = Z.UNIT;
    const capeW = U * 0.72;
    const capeTop = U * 0.02;
    const capeBot = U * 0.84;
    const cpGrad = Z.ctx.createLinearGradient(-capeW, 0, capeW, 0);
    cpGrad.addColorStop(0, Z.T.COLORS.Z_KING_CAPE);
    cpGrad.addColorStop(0.55, Z.T.COLORS.Z_KING_CAPE);
    cpGrad.addColorStop(1, Z.T.COLORS.Z_KING_CAPE_DARK);
    Z.ctx.fillStyle = cpGrad;
    Z.ctx.beginPath();
    Z.ctx.moveTo(-capeW * 0.60, capeTop);
    Z.ctx.quadraticCurveTo(-capeW, capeBot * 0.55, -capeW * 0.82, capeBot);
    Z.ctx.lineTo(-capeW * 0.26, capeBot - U * 0.10);
    Z.ctx.lineTo(0, capeBot);
    Z.ctx.lineTo(capeW * 0.26, capeBot - U * 0.10);
    Z.ctx.lineTo(capeW * 0.82, capeBot);
    Z.ctx.quadraticCurveTo(capeW, capeBot * 0.55, capeW * 0.60, capeTop);
    Z.ctx.closePath();
    Z.ctx.fill(); Z.ctx.stroke();
    // 肩扣 ×2
    Z.ctx.fillStyle = Z.T.COLORS.Z_KING_GOLD;
    for (const s of [-1, 1]) {
      Z.ctx.beginPath();
      Z.ctx.arc(s * U * 0.38, U * 0.10, U * 0.07, 0, Math.PI * 2);
      Z.ctx.fill(); Z.ctx.stroke();
    }
  }
}

/** v93 手臂：西装袖 + 僵尸绿手掌（前伸拖步姿态） */
function _zpArms(Z, R) {
  const U = Z.UNIT;
  const bodyW = Z.B.bodyW;
  const armLen = Z.B.armLen;
  const armRot = Z.B.armRot;
  const armX = U * (bodyW * 0.92 + 0.05);
  const armY = U * 0.06;
  // 袖色：铁桶/小鬼=破衫灰蓝，橄榄球=球衣绿短袖，舞王=紫西装，王=暗紫袍
  const sleeve = Z.type === 'bucket' ? PZ.JK :
                 Z.type === 'imp' ? '#4E463E' :
                 Z.type === 'football' ? Z.T.COLORS.Z_FH_JERSEY :
                 Z.type === 'dancer' ? Z.T.COLORS.Z_DN_SUIT :
                 Z.type === 'king' ? Z.T.COLORS.Z_KING_ROBE : PZ.JK;
  const sleeveDark = Z.type === 'bucket' ? PZ.JK_DARK :
                     Z.type === 'imp' ? '#362F29' :
                     Z.type === 'football' ? Z.T.COLORS.Z_FH_JERSEY_DARK :
                     Z.type === 'dancer' ? Z.T.COLORS.Z_DN_SUIT_DARK :
                     Z.type === 'king' ? Z.T.COLORS.Z_KING_ROBE_DARK : PZ.JK_DARK;
  for (const side of [-1, 1]) {
    const rot = side * armRot;
    const ex = side * armX + Math.sin(Math.abs(rot)) * U * armLen * side;
    const ey = armY + Math.cos(armRot) * U * armLen;
    // 袖（胶囊：径向渐变左亮右暗）
    const sg = Z.ctx.createLinearGradient(-U * 0.1, 0, U * 0.1, 0);
    sg.addColorStop(0, sleeve);
    sg.addColorStop(1, sleeveDark);
    Z.ctx.fillStyle = sg;
    Z.ctx.save();
    Z.ctx.translate(side * (armX + U * 0.04), armY);
    Z.ctx.rotate(rot * 0.72);
    Z.ctx.beginPath();
    Z.ctx.ellipse(0, U * armLen * 0.42, U * 0.098, U * armLen * 0.55, 0, 0, Math.PI * 2);
    Z.ctx.fill(); Z.ctx.stroke();
    // 袖口环
    Z.ctx.fillStyle = sleeveDark;
    Z.ctx.beginPath();
    Z.ctx.ellipse(0, U * armLen * 0.88, U * 0.088, U * 0.055, 0, 0, Math.PI * 2);
    Z.ctx.fill(); Z.ctx.stroke();
    Z.ctx.restore();
    // 手掌（僵尸绿 + 三指小圆）
    const hx = side * (armX + U * 0.04 + Math.sin(armRot) * U * armLen * 0.98);
    const hy = armY + Math.cos(armRot) * U * armLen * 0.98;
    Z.ctx.fillStyle = Z.def.color;
    Z.ctx.beginPath();
    Z.ctx.arc(hx, hy, U * 0.095, 0, Math.PI * 2);
    Z.ctx.fill(); Z.ctx.stroke();
    for (const f of [-0.55, 0.1, 0.7]) {
      Z.ctx.beginPath();
      Z.ctx.arc(hx + Math.cos(rot + f) * U * 0.095, hy + Math.sin(rot + f) * U * 0.095 * 0.6 + U * 0.02, U * 0.038, 0, Math.PI * 2);
      Z.ctx.fill();
    }
    Z.ctx.beginPath();
    Z.ctx.arc(hx, hy, U * 0.095, 0, Math.PI * 2);
    Z.ctx.stroke();
  }
}

/** v93 躯干：西装外套 + 白衬衫 V + 红领带 + 驳领 + 下摆撕裂 */
function _zpTorso(Z, R) {
  const U = Z.UNIT;
  const bodyW = Z.B.bodyW;
  // 衣体（小鬼=破衫，橄榄球=球衣，舞王=紫西装，王=暗紫王袍，其余=棕西装）
  const robeFill = Z.type === 'bucket' ? PZ.JK :
                   Z.type === 'imp' ? '#4E463E' :
                   Z.type === 'football' ? Z.T.COLORS.Z_FH_JERSEY :
                   Z.type === 'dancer' ? Z.T.COLORS.Z_DN_SUIT :
                   Z.type === 'king' ? Z.T.COLORS.Z_KING_ROBE : PZ.JK;
  const robeDark = Z.type === 'bucket' ? PZ.JK_DARK :
                   Z.type === 'imp' ? '#362F29' :
                   Z.type === 'football' ? Z.T.COLORS.Z_FH_JERSEY_DARK :
                   Z.type === 'dancer' ? Z.T.COLORS.Z_DN_SUIT_DARK :
                   Z.type === 'king' ? Z.T.COLORS.Z_KING_ROBE_DARK : PZ.JK_DARK;
  const robeOut = Z.type === 'imp' || Z.type === 'football' || Z.type === 'dancer' || Z.type === 'king'
    ? PZ.OUTLINE : PZ.OUT_JK;
  const topY = U * -0.12;
  const botY = Z.type === 'king' ? U * 0.70 : U * 0.66;
  const tg = Z.ctx.createLinearGradient(-U * bodyW, 0, U * bodyW, 0);
  tg.addColorStop(0, Z.type === 'bucket' || Z.type === 'imp' ? (Z.type === 'bucket' ? PZ.JK_LIGHT : '#5C544C') : (Z.type === 'dancer' ? Z.T.COLORS.Z_DN_SUIT_LIGHT : robeFill));
  tg.addColorStop(0.55, robeFill);
  tg.addColorStop(1, robeDark);
  Z.ctx.fillStyle = tg;
  R._setStroke(Z.ctx, robeOut, R._strokeW(Z.T.STROKE.MAIN) * 0.82);
  Z.ctx.beginPath();
  safeRoundRect(Z.ctx, -U * bodyW, topY, U * bodyW * 2, botY - topY, U * 0.22);
  Z.ctx.fill(); Z.ctx.stroke();
  // 右侧衣影
  Z.ctx.save();
  Z.ctx.beginPath();
  safeRoundRect(Z.ctx, -U * bodyW, topY, U * bodyW * 2, botY - topY, U * 0.22);
  Z.ctx.clip();
  Z.ctx.globalAlpha = 0.30;
  Z.ctx.fillStyle = robeDark;
  Z.ctx.fillRect(U * bodyW * 0.30, topY, U * bodyW * 0.85, botY - topY);
  Z.ctx.globalAlpha = 1;
  Z.ctx.restore();

  // 西装三件套（铁桶/舞王：衬衫V + 驳领 + 领带）
  if (Z.type === 'bucket' || Z.type === 'dancer') {
    const shirt = Z.type === 'dancer' ? Z.T.COLORS.Z_DN_SHIRT : '#DCE4EE';
    const tie = Z.type === 'dancer' ? Z.T.COLORS.Z_DN_TIE : PZ.TIE;
    const lapel = Z.type === 'dancer' ? Z.T.COLORS.Z_DN_SUIT_DARK : PZ.JK_DARK;
    // 白衬衫 V 区
    Z.ctx.fillStyle = shirt;
    Z.ctx.beginPath();
    Z.ctx.moveTo(-U * 0.17, topY + U * 0.02);
    Z.ctx.lineTo(U * 0.17, topY + U * 0.02);
    Z.ctx.lineTo(U * 0.05, topY + U * 0.40);
    Z.ctx.lineTo(-U * 0.05, topY + U * 0.40);
    Z.ctx.closePath();
    Z.ctx.fill();
    R._setStroke(Z.ctx, PZ.OUTLINE, R._strokeW(Z.T.STROKE.THIN));
    Z.ctx.stroke();
    // 驳领 ×2
    Z.ctx.fillStyle = lapel;
    for (const s of [-1, 1]) {
      Z.ctx.beginPath();
      Z.ctx.moveTo(s * U * 0.20, topY + U * 0.01);
      Z.ctx.lineTo(s * U * 0.06, topY + U * 0.02);
      Z.ctx.lineTo(s * U * 0.03, topY + U * 0.30);
      Z.ctx.closePath();
      Z.ctx.fill(); Z.ctx.stroke();
    }
    // 领带（小结 + 渐窄带身）
    R._setStroke(Z.ctx, PZ.OUTLINE, R._strokeW(Z.T.STROKE.THIN) * 0.8);
    Z.ctx.fillStyle = tie;
    Z.ctx.beginPath();
    Z.ctx.moveTo(-U * 0.05, topY + U * 0.02);
    Z.ctx.lineTo(U * 0.05, topY + U * 0.02);
    Z.ctx.lineTo(U * 0.085, topY + U * 0.14);
    Z.ctx.lineTo(-U * 0.085, topY + U * 0.14);
    Z.ctx.closePath();
    Z.ctx.fill(); Z.ctx.stroke();
    Z.ctx.beginPath();
    Z.ctx.moveTo(-U * 0.062, topY + U * 0.14);
    Z.ctx.lineTo(U * 0.062, topY + U * 0.14);
    Z.ctx.lineTo(U * 0.045, topY + U * 0.46);
    Z.ctx.lineTo(-U * 0.045, topY + U * 0.46);
    Z.ctx.closePath();
    Z.ctx.fill(); Z.ctx.stroke();
  }
  // 小鬼浅衬衫 V 领（深背心露浅衫，附图特征）
  if (Z.type === 'imp') {
    Z.ctx.fillStyle = '#D8D2C4';
    Z.ctx.beginPath();
    Z.ctx.moveTo(-U * 0.15, topY + U * 0.02);
    Z.ctx.lineTo(U * 0.15, topY + U * 0.02);
    Z.ctx.lineTo(U * 0.045, topY + U * 0.36);
    Z.ctx.lineTo(-U * 0.045, topY + U * 0.36);
    Z.ctx.closePath();
    Z.ctx.fill();
    R._setStroke(Z.ctx, PZ.OUTLINE, R._strokeW(Z.T.STROKE.THIN));
    Z.ctx.stroke();
  }
  // 橄榄球球衣胸前白条纹
  if (Z.type === 'football') {
    R._setStroke(Z.ctx, Z.T.COLORS.Z_FH_STRIPE, R._strokeW(Z.T.STROKE.THIN) * 1.4);
    for (const sx of [-U * 0.10, U * 0.02, U * 0.14]) {
      Z.ctx.beginPath();
      Z.ctx.moveTo(sx, topY + U * 0.06);
      Z.ctx.lineTo(sx, topY + U * 0.30);
      Z.ctx.stroke();
    }
  }
  // 小鬼破衫补丁
  if (Z.type === 'imp') {
    Z.ctx.globalAlpha = 0.8;
    Z.ctx.fillStyle = '#A79C8D';
    Z.ctx.beginPath();
    safeRoundRect(Z.ctx, -U * 0.24, U * 0.24, U * 0.14, U * 0.11, U * 0.02);
    Z.ctx.fill();
    Z.ctx.globalAlpha = 1;
    R._setStroke(Z.ctx, PZ.OUTLINE, R._strokeW(Z.T.STROKE.THIN));
    Z.ctx.stroke();
  }
  // 王袍紫腰带（金袍对比色）+ 红宝石扣
  if (Z.type === 'king') {
    Z.ctx.fillStyle = Z.T.COLORS.Z_KING_CAPE;
    Z.ctx.beginPath();
    safeRoundRect(Z.ctx, -U * 0.38, U * 0.50, U * 0.76, U * 0.10, U * 0.03);
    Z.ctx.fill(); Z.ctx.stroke();
    Z.ctx.fillStyle = Z.T.COLORS.Z_KING_GEM;
    Z.ctx.beginPath();
    Z.ctx.arc(0, U * 0.55, U * 0.05, 0, Math.PI * 2);
    Z.ctx.fill(); Z.ctx.stroke();
  }
  // 下摆撕裂 ×3（破损下摆）
  const hemCol = Z.type === 'bucket' ? PZ.JK_DARK :
                 Z.type === 'imp' ? '#362F29' :
                 Z.type === 'football' ? Z.T.COLORS.Z_FH_JERSEY_DARK :
                 Z.type === 'dancer' ? Z.T.COLORS.Z_DN_SUIT_DARK :
                 Z.type === 'king' ? Z.T.COLORS.Z_KING_ROBE_DARK : PZ.JK_DARK;
  Z.ctx.fillStyle = hemCol;
  const hemY = botY - U * 0.01;
  R._setStroke(Z.ctx, PZ.OUTLINE, R._strokeW(Z.T.STROKE.THIN) * 0.7);
  for (const [tx, tw] of [[-0.55, 0.26], [-0.02, 0.30], [0.52, 0.25]]) {
    Z.ctx.beginPath();
    Z.ctx.moveTo(U * (tx - tw / 2), hemY - U * 0.01);
    Z.ctx.lineTo(U * (tx + tw / 2), hemY - U * 0.01);
    Z.ctx.lineTo(U * tx, hemY + U * 0.07);
    Z.ctx.closePath();
    Z.ctx.fill(); Z.ctx.stroke();
  }
  _zpMain(Z, R);
}

/** v28 橄榄球护肩 ×2（探出头轮廓，造型保留） */
function _zpShoulders(Z, R) {
  if (Z.type === 'football') {
    const U = Z.UNIT;
    for (const s of [-1, 1]) {
      const px = s * U * 0.62;
      const py = U * 0.10;
      const prx = U * 0.24;
      const pry = U * 0.185;
      const pGrad = Z.ctx.createLinearGradient(px - prx, py - pry, px + prx, py + pry);
      pGrad.addColorStop(0, Z.T.COLORS.Z_FH_RED_LIGHT);
      pGrad.addColorStop(0.55, Z.T.COLORS.Z_FH_RED);
      pGrad.addColorStop(1, Z.T.COLORS.Z_FH_RED_DARK);
      Z.ctx.fillStyle = pGrad;
      Z.ctx.beginPath();
      Z.ctx.ellipse(px, py, prx, pry, s * 0.18, 0, Math.PI * 2);
      Z.ctx.fill(); Z.ctx.stroke();
      R._setStroke(Z.ctx, Z.T.COLORS.Z_FH_RED_DARK, R._strokeW(Z.T.STROKE.THIN));
      Z.ctx.beginPath();
      Z.ctx.ellipse(px, py, prx * 0.74, pry * 0.64, s * 0.18, Math.PI * 0.15, Math.PI * 0.85);
      Z.ctx.stroke();
      Z.ctx.fillStyle = 'rgba(255,255,255,0.30)';
      Z.ctx.beginPath();
      Z.ctx.ellipse(px - prx * 0.34, py - pry * 0.42, prx * 0.30, pry * 0.26, s * -0.30, 0, Math.PI * 2);
      Z.ctx.fill();
      _zpMain(Z, R);
    }
  }
}

/** v93 腿：西裤 + 皮鞋（微开步站姿） */
function _zpLegs(Z, R) {
  const U = Z.UNIT;
  const legW = Z.B.legW;
  // 裤色
  const pants = Z.type === 'bucket' ? PZ.PANTS :
                Z.type === 'imp' ? '#3A342E' :
                Z.type === 'football' ? '#39414D' :
                Z.type === 'dancer' ? Z.T.COLORS.Z_DN_SUIT_DARK :
                Z.type === 'king' ? Z.T.COLORS.Z_KING_ROBE_DARK : PZ.PANTS;
  const pantsOut = Z.type === 'bucket' ? PZ.PANTS_OUT : PZ.OUTLINE;
  const shoe = Z.type === 'king' ? Z.T.COLORS.Z_KING_CAPE_DARK :
               Z.type === 'football' ? Z.T.COLORS.Z_FH_CLEAT :
               Z.type === 'dancer' ? Z.T.COLORS.Z_DN_SHOE : PZ.SHOES;
  R._setStroke(Z.ctx, pantsOut, R._strokeW(Z.T.STROKE.MAIN) * 0.82);
  Z.ctx.fillStyle = pants;
  for (const s of [-1, 1]) {
    const lx = s * U * 0.19;
    const lg = Z.ctx.createLinearGradient(lx - U * legW, 0, lx + U * legW, 0);
    lg.addColorStop(0, pants);
    lg.addColorStop(1, pants);
    Z.ctx.fillStyle = lg;
    Z.ctx.beginPath();
    safeRoundRect(Z.ctx, lx - U * legW, U * 0.52, U * legW * 2, U * 0.40, U * legW * 0.8);
    Z.ctx.fill(); Z.ctx.stroke();
  }
  // 鞋（外八微张）
  Z.ctx.fillStyle = shoe;
  for (const s of [-1, 1]) {
    Z.ctx.beginPath();
    Z.ctx.ellipse(s * U * 0.21, U * 0.94, U * 0.13, U * 0.085, s * 0.14, 0, Math.PI * 2);
    Z.ctx.fill(); Z.ctx.stroke();
  }
  // 舞王手杖（金色杖头 + 深色杖杆，附图特征）
  if (Z.type === 'dancer') {
    const cx0 = U * 0.74;
    R._setStroke(Z.ctx, '#2B1D10', R._strokeW(Z.T.STROKE.THIN) * 1.5);
    Z.ctx.strokeStyle = '#4A3423';
    Z.ctx.lineWidth = Math.max(2, U * 0.055);
    Z.ctx.beginPath();
    Z.ctx.moveTo(cx0, U * 0.26);
    Z.ctx.lineTo(cx0 + U * 0.03, U * 1.02);
    Z.ctx.stroke();
    _zpMain(Z, R);
    Z.ctx.fillStyle = Z.T.COLORS.Z_KING_GOLD;
    Z.ctx.beginPath();
    Z.ctx.arc(cx0, U * 0.22, U * 0.078, 0, Math.PI * 2);
    Z.ctx.fill(); Z.ctx.stroke();
  }
  _zpMain(Z, R);
}

/** v93 头：大头骨椭圆（灰绿皮肤 + 分层明暗 + 招风耳 + 皱纹 + 乱发） */
function _zpHead(Z, R) {
  const U = Z.UNIT;
  const imp = Z.type === 'imp';
  Z.headRX = U * (imp ? 0.52 : 0.58);
  Z.headRY = U * (imp ? 0.58 : 0.64);
  Z.headCY = U * (imp ? -0.44 : -0.50);
  const { ctx } = Z;
  const headPath = () => {
    ctx.beginPath();
    ctx.ellipse(0, Z.headCY, Z.headRX, Z.headRY, 0, 0, Math.PI * 2);
  };

  // 招风耳 ×2（先画，压在头下）
  for (const s of [-1, 1]) {
    ctx.fillStyle = Z.skinDark;
    ctx.beginPath();
    ctx.ellipse(s * Z.headRX * 0.99, Z.headCY + U * 0.10, U * 0.105, U * 0.17, s * -0.15, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }

  // 头骨主体（径向渐变：左上亮 → 基色 → 右下暗）
  const hg = ctx.createRadialGradient(-Z.headRX * 0.40, Z.headCY - Z.headRY * 0.45, 0, 0, Z.headCY, Z.headRX * 1.45);
  hg.addColorStop(0, Z.skinLight);
  hg.addColorStop(0.58, Z.def.color);
  hg.addColorStop(1, Z.skinDark);
  ctx.fillStyle = hg;
  headPath();
  ctx.fill(); ctx.stroke();

  // 下颌体积分层（clip 头内）
  ctx.save();
  headPath(); ctx.clip();
  ctx.fillStyle = 'rgba(57,65,44,0.16)';
  ctx.beginPath();
  ctx.ellipse(Z.headRX * 0.30, Z.headCY + Z.headRY * 0.68, Z.headRX * 0.85, Z.headRY * 0.42, 0.15, 0, Math.PI * 2);
  ctx.fill();
  // 颧骨暗影（眼下）
  ctx.fillStyle = 'rgba(57,65,44,0.12)';
  ctx.beginPath();
  ctx.ellipse(-Z.headRX * 0.42, Z.headCY + Z.headRY * 0.18, Z.headRX * 0.20, Z.headRY * 0.10, 0.3, 0, Math.PI * 2);
  ctx.ellipse(Z.headRX * 0.42, Z.headCY + Z.headRY * 0.18, Z.headRX * 0.20, Z.headRY * 0.10, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 左上哑光高光
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.ellipse(-Z.headRX * 0.42, Z.headCY - Z.headRY * 0.52, Z.headRX * 0.30, Z.headRY * 0.16, -0.5, 0, Math.PI * 2);
  ctx.fill();

  // 头顶乱发 ×4（短弧线戳出头顶；小鬼兜帽下不画）
  if (Z.type !== 'imp') {
    R._setStroke(Z.ctx, PZ.HAIR, R._strokeW(Z.T.STROKE.THIN));
    const hairBase = Z.headCY - Z.headRY * 0.94;
    const strands = [[-0.30, -0.07], [-0.08, -0.11], [0.12, -0.10], [0.32, -0.06]];
    for (const [sx, sl] of strands) {
      const bx = sx * Z.headRX;
      ctx.beginPath();
      ctx.moveTo(bx, hairBase + Z.headRY * 0.06);
      ctx.quadraticCurveTo(bx + sx * 0.05 * U, hairBase + sl * Z.headRY * 0.5, bx + sx * 0.11 * U, hairBase + sl * Z.headRY);
      ctx.stroke();
    }
    _zpMain(Z, R);
  }
}

/** 头顶装饰（铁桶/破兜帽/高顶礼帽/头盔/黄金王冠，适配新头骨几何） */
function _zpHeadgear(Z, R) {
  const U = Z.UNIT;
  const { ctx } = Z;
  const hcY = Z.headCY;
  const hRX = Z.headRX, hRY = Z.headRY;

  if (Z.type === 'bucket') {
    // 金属铁桶（上窄下宽圆台，深扣至眉上方，参考图大桶比例）
    const rimY = hcY - hRY * 0.26;              // 桶口下缘（眉上方）
    const topY = rimY - U * 0.72;               // 桶顶
    const halfTop = hRX * 0.78;
    const halfBot = hRX * 1.12;
    const bGrad = ctx.createLinearGradient(-halfBot, 0, halfBot, 0);
    bGrad.addColorStop(0, Z.T.COLORS.Z_BUCKET_LIGHT);
    bGrad.addColorStop(0.45, Z.T.COLORS.Z_BUCKET);
    bGrad.addColorStop(1, Z.T.COLORS.Z_BUCKET_DARK);
    ctx.fillStyle = bGrad;
    ctx.beginPath();
    ctx.moveTo(-halfTop, topY);
    ctx.lineTo(halfTop, topY);
    ctx.lineTo(halfBot, rimY - hRY * 0.06);
    ctx.quadraticCurveTo(0, rimY + hRY * 0.05, -halfBot, rimY - hRY * 0.06);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 竖向金属高光带
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.beginPath();
    ctx.ellipse(-halfBot * 0.44, topY + U * 0.26, hRX * 0.10, U * 0.18, -0.06, 0, Math.PI * 2);
    ctx.fill();
    // 厚底缘环带
    ctx.fillStyle = Z.T.COLORS.Z_BUCKET_DARK;
    ctx.beginPath();
    ctx.moveTo(-halfBot * 1.04, rimY - hRY * 0.10);
    ctx.lineTo(halfBot * 1.04, rimY - hRY * 0.10);
    ctx.quadraticCurveTo(0, rimY + hRY * 0.05, -halfBot * 1.04, rimY - hRY * 0.10);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 两侧 D 形吊耳（缩小，避免误读为耳朵）
    const hy = topY + (rimY - topY) * 0.42;
    const hwHy = halfTop + (halfBot - halfTop) * 0.42;
    for (const s of [-1, 1]) {
      ctx.fillStyle = Z.T.COLORS.Z_BUCKET_DARK;
      ctx.beginPath();
      ctx.ellipse(s * (hwHy + hRX * 0.01), hy, hRX * 0.11, hRX * 0.16, s * 0.22, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = Z.T.COLORS.Z_BUCKET_LIGHT;
      ctx.beginPath();
      ctx.ellipse(s * (hwHy + hRX * 0.01), hy, hRX * 0.048, hRX * 0.09, s * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    // 桶身铆钉 ×5（附图紫色铆钉桶特征）
    const stud = (fy, fx) => {
      const sy = topY + (rimY - topY) * fy;
      const halfW = halfTop + (halfBot - halfTop) * fy;
      const sx = fx * halfW;
      ctx.fillStyle = Z.T.COLORS.Z_BUCKET_DARK;
      ctx.beginPath();
      ctx.arc(sx, sy, hRX * 0.085, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.beginPath();
      ctx.arc(sx - hRX * 0.022, sy - hRX * 0.028, hRX * 0.034, 0, Math.PI * 2);
      ctx.fill();
    };
    stud(0.32, -0.52); stud(0.58, -0.62); stud(0.32, 0.52); stud(0.58, 0.62); stud(0.80, 0);
    _zpMain(Z, R);
  } else if (Z.type === 'imp') {
    // 深棕乱发帽（盖住头顶 + 波浪发际线 + 顶部戳发，附图小鬼黑发特征）
    const hairGrad = ctx.createLinearGradient(-hRX * 0.8, hcY - hRY * 1.2, hRX * 0.9, hcY);
    hairGrad.addColorStop(0, '#4A3F33');
    hairGrad.addColorStop(0.55, '#3A3128');
    hairGrad.addColorStop(1, '#2A231C');
    ctx.fillStyle = hairGrad;
    ctx.beginPath();
    ctx.ellipse(0, hcY - hRY * 0.50, hRX * 1.06, hRY * 0.64, 0, Math.PI * 1.03, Math.PI * 1.97);
    ctx.quadraticCurveTo(hRX * 0.60, hcY - hRY * 0.28, hRX * 0.16, hcY - hRY * 0.40);
    ctx.quadraticCurveTo(-hRX * 0.34, hcY - hRY * 0.54, -hRX * 0.80, hcY - hRY * 0.30);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 顶部戳发 ×3
    const spikes = [[-0.36, -0.30], [-0.05, -0.40], [0.28, -0.28]];
    for (const [hxp, hgt] of spikes) {
      const bx = hxp * hRX;
      const arg = Math.max(0, 1 - (hxp * hxp) * 1.55);
      const by = hcY - hRY * (0.50 + 0.64 * Math.sqrt(arg)) + hRY * 0.03;
      ctx.fillStyle = '#3A3128';
      ctx.beginPath();
      ctx.moveTo(bx - hRX * 0.07, by);
      ctx.quadraticCurveTo(bx + hxp * hRX * 0.20, by - hRY * hgt * 0.8, bx + hxp * hRX * 0.44, by - hRY * hgt);
      ctx.quadraticCurveTo(bx + hRX * 0.06, by - hRY * hgt * 0.4, bx + hRX * 0.07, by);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    _zpMain(Z, R);
    // 额前碎发 ×2 + 右侧一撇
    R._setStroke(Z.ctx, '#2A231C', R._strokeW(Z.T.STROKE.THIN));
    ctx.beginPath();
    ctx.moveTo(-hRX * 0.30, hcY - hRY * 0.30);
    ctx.quadraticCurveTo(-hRX * 0.36, hcY - hRY * 0.22, -hRX * 0.24, hcY - hRY * 0.16);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hRX * 0.22, hcY - hRY * 0.32);
    ctx.quadraticCurveTo(hRX * 0.28, hcY - hRY * 0.24, hRX * 0.19, hcY - hRY * 0.17);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hRX * 0.78, hcY - hRY * 0.36);
    ctx.quadraticCurveTo(hRX * 1.00, hcY - hRY * 0.36, hRX * 1.13, hcY - hRY * 0.22);
    ctx.stroke();
    _zpMain(Z, R);
  } else if (Z.type === 'dancer') {
    // 黑高顶礼帽（歪戴 -0.10 rad）
    ctx.save();
    ctx.translate(0, hcY - hRY * 0.46);
    ctx.rotate(-0.10);
    const brimHalf = hRX * 0.95;
    const brimH = hRY * 0.13;
    const cHalf = hRX * 0.52;
    const cH = hRY * 0.72;
    const cGrad = ctx.createLinearGradient(-cHalf, 0, cHalf, 0);
    cGrad.addColorStop(0, Z.T.COLORS.Z_DN_HAT_LIGHT);
    cGrad.addColorStop(0.38, Z.T.COLORS.Z_DN_HAT);
    cGrad.addColorStop(1, Z.T.COLORS.Z_DN_HAT_DARK);
    ctx.fillStyle = cGrad;
    ctx.beginPath();
    safeRoundRect(ctx, -cHalf, -cH, cHalf * 2, cH + hRY * 0.05, hRX * 0.09);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.beginPath();
    ctx.ellipse(-cHalf * 0.52, -cH * 0.46, hRX * 0.09, cH * 0.28, 0.10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = Z.T.COLORS.Z_DN_HAT_DARK;
    ctx.beginPath();
    ctx.ellipse(0, 0, brimHalf, brimH, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
    _zpMain(Z, R);
  } else if (Z.type === 'football') {
    // 红色圆顶头盔 + 奶油中条纹 + 眉缘缓冲条 + 侧气孔
    const domeRX = hRX * 1.06;
    const domeRY = hRY * 1.00;
    const domeCY = hcY - hRY * 0.10;
    const hGrad = ctx.createLinearGradient(-domeRX, 0, domeRX, 0);
    hGrad.addColorStop(0, Z.T.COLORS.Z_FH_RED_LIGHT);
    hGrad.addColorStop(0.5, Z.T.COLORS.Z_FH_RED);
    hGrad.addColorStop(1, Z.T.COLORS.Z_FH_RED_DARK);
    ctx.fillStyle = hGrad;
    ctx.beginPath();
    ctx.ellipse(0, domeCY, domeRX, domeRY, 0, Math.PI * 1.03, Math.PI * 1.97);
    ctx.lineTo(hRX * 1.0, hcY - hRY * 0.16);
    ctx.quadraticCurveTo(0, hcY - hRY * 0.28, -hRX * 1.0, hcY - hRY * 0.16);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 中条纹
    const sHalf = hRX * 0.21;
    ctx.fillStyle = Z.T.COLORS.Z_FH_STRIPE;
    ctx.beginPath();
    ctx.moveTo(-sHalf * 0.55, domeCY - domeRY * 0.99);
    ctx.quadraticCurveTo(-sHalf, domeCY - domeRY * 0.45, -sHalf, hcY - hRY * 0.18);
    ctx.lineTo(sHalf, hcY - hRY * 0.18);
    ctx.quadraticCurveTo(sHalf, domeCY - domeRY * 0.45, sHalf * 0.55, domeCY - domeRY * 0.99);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 眉缘缓冲条
    ctx.fillStyle = Z.T.COLORS.Z_FH_RED_DARK;
    ctx.beginPath();
    safeRoundRect(ctx, -hRX * 1.02, hcY - hRY * 0.30, hRX * 2.04, hRY * 0.11, hRY * 0.045);
    ctx.fill(); ctx.stroke();
    // 侧气孔
    ctx.fillStyle = Z.T.COLORS.Z_FH_RED_DARK;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * hRX * 0.62, domeCY - hRY * 0.42, hRX * 0.055, 0, Math.PI * 2);
      ctx.fill();
    }
    // 左上高光带
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.beginPath();
    ctx.ellipse(-hRX * 0.40, domeCY - hRY * 0.55, hRX * 0.10, hRY * 0.18, -0.50, 0, Math.PI * 2);
    ctx.fill();
    _zpMain(Z, R);
  } else if (Z.type === 'king') {
    // 黄金王冠（三尖冠 + 金珠 + 红宝石 + 冠底金带）
    ctx.save();
    ctx.translate(0, hcY - hRY * 0.60);
    ctx.rotate(-0.06);
    const crW = hRX * 0.86;
    const crH = hRY * 0.34;
    const tipH = hRY * 0.24;
    const gGrad = ctx.createLinearGradient(-crW, 0, crW, 0);
    gGrad.addColorStop(0, Z.T.COLORS.Z_KING_GOLD);
    gGrad.addColorStop(0.55, Z.T.COLORS.Z_KING_GOLD);
    gGrad.addColorStop(1, Z.T.COLORS.Z_KING_GOLD_DARK);
    ctx.fillStyle = gGrad;
    ctx.beginPath();
    ctx.moveTo(-crW, 0);
    ctx.lineTo(-crW, -crH);
    ctx.lineTo(-crW * 0.62, -crH - tipH * 0.85);
    ctx.lineTo(-crW * 0.34, -crH * 0.72);
    ctx.lineTo(0, -crH - tipH);
    ctx.lineTo(crW * 0.34, -crH * 0.72);
    ctx.lineTo(crW * 0.62, -crH - tipH * 0.85);
    ctx.lineTo(crW, -crH);
    ctx.lineTo(crW, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 尖顶金珠 ×3
    ctx.fillStyle = Z.T.COLORS.Z_KING_GOLD;
    for (const [bx, br] of [[-crW * 0.62, hRX * 0.05], [0, hRX * 0.065], [crW * 0.62, hRX * 0.05]]) {
      ctx.beginPath();
      ctx.arc(bx, -crH - tipH * 0.85 - hRX * 0.02, br, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    // 中央红宝石
    ctx.fillStyle = Z.T.COLORS.Z_KING_GEM;
    ctx.beginPath();
    ctx.arc(0, -crH * 0.42, hRX * 0.09, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 冠底宽金带
    ctx.fillStyle = Z.T.COLORS.Z_KING_GOLD_DARK;
    ctx.beginPath();
    safeRoundRect(ctx, -crW * 1.06, -crH * 0.30, crW * 2.12, crH * 0.34, hRX * 0.05);
    ctx.fill(); ctx.stroke();
    ctx.restore();
    _zpMain(Z, R);
  }
}

/** v93 表情：大白眼珠 + 小瞳孔（僵尸阵营，无腮红） */
function _zpFace(Z, R) {
  const U = Z.UNIT;
  const { ctx } = Z;
  const imp = Z.type === 'imp';
  Z.eyeY = Z.headCY - U * 0.02;
  Z.eyeR = U * (imp ? 0.15 : 0.155);
  Z.eyeDX = Z.headRX * (imp ? 0.50 : 0.42);
  // 眼白（微浊白，椭圆；v95 两眼独立路径 —— 同路径多 ellipse 的隐式连接线会被 stroke 描成桥）
  R._setStroke(Z.ctx, PZ.OUTLINE, R._strokeW(Z.T.STROKE.EYE) * 0.55);
  ctx.fillStyle = imp ? Z.T.COLORS.Z_EYE_YELLOW : '#F4F1E3';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * Z.eyeDX, Z.eyeY, Z.eyeR * 0.94 * (s < 0 ? 0.92 : 1), Z.eyeR, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
  // 瞳孔（小黑圆，内侧偏下 = 涣散盯视）
  const pOff = Z.eyeR * (imp ? 0 : 0.16);
  const pupilR = Z.eyeR * (imp ? 0.30 : 0.40);
  ctx.fillStyle = '#2C2C28';
  ctx.beginPath();
  ctx.arc(-Z.eyeDX + pOff, Z.eyeY + Z.eyeR * 0.12, pupilR, 0, Math.PI * 2);
  ctx.arc(Z.eyeDX - pOff, Z.eyeY + Z.eyeR * 0.12, pupilR, 0, Math.PI * 2);
  ctx.fill();
  // 单高光
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(-Z.eyeDX + pOff - pupilR * 0.30, Z.eyeY + Z.eyeR * 0.12 - pupilR * 0.36, pupilR * 0.34, 0, Math.PI * 2);
  ctx.arc(Z.eyeDX - pOff - pupilR * 0.30, Z.eyeY + Z.eyeR * 0.12 - pupilR * 0.36, pupilR * 0.34, 0, Math.PI * 2);
  ctx.fill();
}

/** 类型差异化表情（皱纹/眉形/嘴部/獠牙/舌头） */
function _zpFaceVariants(Z, R) {
  const U = Z.UNIT;
  const { ctx } = Z;
  const eyeR = Z.eyeR;
  const browY = Z.eyeY - eyeR * 1.45;

  // ---- 前额皱纹 ×1（高置，避免与眉毛打架）----
  R._setStroke(Z.ctx, PZ.WRINKLE, R._strokeW(Z.T.STROKE.THIN) * 0.75);
  ctx.beginPath();
  ctx.moveTo(-Z.headRX * 0.13, Z.eyeY - eyeR * 2.85);
  ctx.quadraticCurveTo(0, Z.eyeY - eyeR * 3.02, Z.headRX * 0.13, Z.eyeY - eyeR * 2.85);
  ctx.stroke();

  // ---- 眉形（按类型）----
  const browW = eyeR * 1.15;
  R._setStroke(Z.ctx, PZ.HAIR, R._strokeW(Z.T.STROKE.INK));
  if (Z.type === 'bucket') {
    // 担忧眉（内高外低）
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * Z.eyeDX - s * browW, browY + eyeR * 0.45);
      ctx.quadraticCurveTo(s * Z.eyeDX, browY - eyeR * 0.30, s * Z.eyeDX + s * browW * 0.4, browY - eyeR * 0.42);
      ctx.stroke();
    }
  } else if (Z.type === 'imp') {
    // 惊恐高挑眉
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * Z.eyeDX - s * browW, browY + eyeR * 0.30);
      ctx.quadraticCurveTo(s * Z.eyeDX, browY - eyeR * 0.60, s * Z.eyeDX + s * browW * 0.4, browY - eyeR * 0.55);
      ctx.stroke();
    }
  } else if (Z.type === 'football' || Z.type === 'king') {
    // 怒眉（粗 V 形内端下压）
    const bold = Z.type === 'king' ? 2.0 : 1.8;
    R._setStroke(Z.ctx, PZ.HAIR, R._strokeW(Z.T.STROKE.INK) * bold);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * Z.eyeDX - s * browW, browY - eyeR * 0.50);
      ctx.quadraticCurveTo(s * Z.eyeDX, browY + eyeR * 0.05, s * Z.eyeDX + s * browW * 0.4, browY + eyeR * 0.42);
      ctx.stroke();
    }
  } else if (Z.type === 'dancer') {
    // 兴奋细眉（内端上扬）
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * Z.eyeDX - s * browW, browY + eyeR * 0.30);
      ctx.quadraticCurveTo(s * Z.eyeDX, browY - eyeR * 0.45, s * Z.eyeDX + s * browW * 0.4, browY - eyeR * 0.40);
      ctx.stroke();
    }
  }

  // ---- 嘴部（按类型）----（v95 删除圆框眼镜：附图僵尸无眼镜）
  Z.mouthY = Z.headCY + Z.headRY * 0.36;
  R._setStroke(Z.ctx, PZ.MOUTH_OUT, R._strokeW(Z.T.STROKE.LIP));
  if (Z.type === 'bucket' || Z.type === 'football' || Z.type === 'king') {
    // 咧嘴喊叫：暗红大口 + 上排参差牙
    const mW = Z.headRX * (Z.type === 'king' ? 0.48 : Z.type === 'football' ? 0.40 : 0.44);
    const mH = Z.headRY * (Z.type === 'king' ? 0.28 : Z.type === 'football' ? 0.23 : 0.25);
    ctx.fillStyle = PZ.MOUTH;
    ctx.beginPath();
    ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2);
    ctx.fill();
    R._setStroke(Z.ctx, PZ.MOUTH_OUT, R._strokeW(Z.T.STROKE.LIP));
    ctx.stroke();
    // 口腔底部舌影
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,120,120,0.30)';
    ctx.beginPath();
    ctx.ellipse(0, Z.mouthY + mH * 0.55, mW * 0.55, mH * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 上排獠牙 ×4（参差）
    ctx.fillStyle = PZ.TEETH;
    const teeth = [[-0.62, 0.30, 0.52], [-0.24, 0.26, 0.72], [0.10, 0.26, 0.58], [0.44, 0.24, 0.42]];
    for (const [tx, tw, th] of teeth) {
      Z.ctx.beginPath();
      safeRoundRect(Z.ctx, mW * tx, Z.mouthY - mH * 0.86, mW * tw, mH * th, mW * 0.08);
      Z.ctx.fill();
    }
    // 下排短牙 ×2
    Z.ctx.beginPath();
    safeRoundRect(Z.ctx, mW * -0.40, Z.mouthY + mH * 0.36, mW * 0.22, mH * 0.26, mW * 0.06);
    Z.ctx.fill();
    Z.ctx.beginPath();
    safeRoundRect(Z.ctx, mW * 0.16, Z.mouthY + mH * 0.34, mW * 0.20, mH * 0.24, mW * 0.06);
    Z.ctx.fill();
  } else if (Z.type === 'imp') {
    // 呆滞 O 型小张嘴
    const mW = Z.headRX * 0.34;
    const mH = Z.headRY * 0.24;
    ctx.fillStyle = PZ.MOUTH;
    ctx.beginPath();
    ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2);
    ctx.fill();
    R._setStroke(Z.ctx, PZ.MOUTH_OUT, R._strokeW(Z.T.STROKE.LIP));
    ctx.stroke();
    ctx.fillStyle = PZ.TEETH;
    Z.ctx.beginPath();
    safeRoundRect(Z.ctx, -mW * 0.52, Z.mouthY - mH * 0.90, mW * 0.32, mH * 0.44, mW * 0.06);
    Z.ctx.fill();
    Z.ctx.beginPath();
    safeRoundRect(Z.ctx, mW * 0.18, Z.mouthY - mH * 0.94, mW * 0.30, mH * 0.50, mW * 0.06);
    Z.ctx.fill();
  } else if (Z.type === 'dancer') {
    // 狂笑大张嘴 + 鲜红舌头
    const mW = Z.headRX * 0.42;
    const mH = Z.headRY * 0.28;
    ctx.fillStyle = PZ.MOUTH;
    ctx.beginPath();
    ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2);
    ctx.fill();
    R._setStroke(Z.ctx, PZ.MOUTH_OUT, R._strokeW(Z.T.STROKE.LIP));
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = Z.T.COLORS.Z_DN_TONGUE;
    ctx.beginPath();
    ctx.ellipse(0, Z.mouthY + mH * 0.55, mW * 0.52, mH * 0.50, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = PZ.TEETH;
    const teeth = [[-0.60, 0.26, 0.46], [-0.24, 0.28, 0.66], [0.08, 0.27, 0.52], [0.42, 0.24, 0.40]];
    for (const [tx, tw, th] of teeth) {
      Z.ctx.beginPath();
      safeRoundRect(Z.ctx, mW * tx, Z.mouthY - mH * 0.86, mW * tw, mH * th, mW * 0.07);
      Z.ctx.fill();
    }
  }

  // ---- 鼻孔 hint（两点，僵尸鼻）----
  ctx.fillStyle = 'rgba(56,20,15,0.55)';
  ctx.beginPath();
  ctx.arc(-U * 0.045, Z.mouthY - Z.headRY * 0.22, U * 0.022, 0, Math.PI * 2);
  ctx.arc(U * 0.045, Z.mouthY - Z.headRY * 0.22, U * 0.022, 0, Math.PI * 2);
  ctx.fill();
}

/** v28 橄榄球面罩格栅（最后绘制罩嘴部之上，坐标适配） */
function _zpCage(Z, R) {
  if (Z.type === 'football') {
    const U = Z.UNIT;
    const { ctx } = Z;
    R._setStroke(Z.ctx, Z.T.COLORS.Z_FH_CAGE, R._strokeW(Z.T.STROKE.THIN) * 1.35);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * Z.headRX * 0.56, Z.mouthY + U * 0.14);
      ctx.quadraticCurveTo(s * Z.headRX * 0.80, Z.mouthY - U * 0.10, s * Z.headRX * 0.90, Z.headCY + U * 0.06);
      ctx.stroke();
    }
    R._setStroke(Z.ctx, Z.T.COLORS.Z_FH_CAGE, R._strokeW(Z.T.STROKE.THIN) * 1.15);
    for (const [y1, y2] of [
      [Z.mouthY - U * 0.06, Z.mouthY + U * 0.01],
      [Z.mouthY + U * 0.12, Z.mouthY + U * 0.19],
    ]) {
      ctx.beginPath();
      ctx.moveTo(-Z.headRX * 0.52, y1);
      ctx.quadraticCurveTo(0, y2, Z.headRX * 0.52, y1);
      ctx.stroke();
    }
    R._setStroke(Z.ctx, Z.T.COLORS.Z_FH_CAGE, R._strokeW(Z.T.STROKE.THIN));
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * Z.headRX * 0.18, Z.mouthY - U * 0.10);
      ctx.lineTo(s * Z.headRX * 0.16, Z.mouthY + U * 0.22);
      ctx.stroke();
    }
    _zpMain(Z, R);
  }
}

module.exports = {
  renderZombieToOffscreen,
  _zpSetup, _zpSack, _zpCape, _zpArms, _zpTorso, _zpShoulders, _zpLegs, _zpHead, _zpHeadgear, _zpFace, _zpFaceVariants, _zpCage,
};
