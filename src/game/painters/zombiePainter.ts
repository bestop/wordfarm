// src/game/painters/zombiePainter.ts - 僵尸离屏插画（v93 经典 PvZ 复刻，与小程序 zombiePainter.js 同源）
// 参照附图（经典 PvZ 普通僵尸）全面重绘：
//   · 大头骨椭圆头（灰绿皮肤 + 前额皱纹 + 招风耳 + 头顶乱发）
//   · 棕色西装外套 + 白衬衫 V 领 + 红领带 + 深色西裤（经典 PvZ 制式）
//   · 大白眼珠 + 小瞳孔 + 咧嘴喊叫（暗红口腔 + 上排牙）
//   · 阵营统一深橄榄勾边（#39412C）
// 阶段管线沿用：setup → sack → cape → arms → torso → shoulders
//   → legs → head → headgear → face → faceVariants → cage
import type { ZombieType } from '../constants'
import {
  COLORS, STROKE, OFFSCREEN, Pen,
  safeRoundRect, type Ctx2D,
} from './tokens'

export interface ZombieSprite {
  canvas: OffscreenCanvas | HTMLCanvasElement
  size: number // 逻辑尺寸（css px，僵尸居中）
}

const UNIT = 50 // 基准单位（全部比例基于此）

/* v96 附图可爱 3D 风色板（与小程序 PZ 同源，回归用户上传附图基准） */
const PZ = {
  OUTLINE: '#39412C',
  OUT_JK: '#22304A',
  JK: '#4E6FA8',
  JK_LIGHT: '#6284B8',
  JK_DARK: '#38517A',
  SHIRT: '#EFEAD9',
  TIE: '#C62828',
  TIE_DARK: '#9E1F1F',
  PANTS: '#4E4257',
  PANTS_OUT: '#2B2431',
  SHOES: '#3A2E26',
  MOUTH: '#6E2424',
  MOUTH_OUT: '#38140F',
  TEETH: '#F2EFE0',
  HAIR: '#3A4230',
  WRINKLE: 'rgba(70,82,52,0.55)',
  SKIN: {
    bucket: { light: '#B5C98F', dark: '#6E8452' },
    imp: { light: '#C3D6A0', dark: '#84976A' },
    football: { light: '#9DB77E', dark: '#5E7A48' },
    dancer: { light: '#B8CF94', dark: '#7C925C' },
    king: { light: '#A9C487', dark: '#6E8A50' },
  } as Record<ZombieType, { light: string; dark: string }>,
  BODY: {
    bucket: { bodyW: 0.44, armLen: 0.34, armRot: 0.38, legW: 0.15 },
    imp: { bodyW: 0.34, armLen: 0.38, armRot: 0.42, legW: 0.12 },
    football: { bodyW: 0.50, armLen: 0.30, armRot: 0.34, legW: 0.20 },
    dancer: { bodyW: 0.46, armLen: 0.34, armRot: 0.55, legW: 0.16 },
    king: { bodyW: 0.52, armLen: 0.30, armRot: 0.30, legW: 0.22 },
  } as Record<ZombieType, { bodyW: number; armLen: number; armRot: number; legW: number }>,
}

interface ZState {
  type: ZombieType
  ctx: Ctx2D
  canvas: OffscreenCanvas | HTMLCanvasElement
  U: number
  skin: string
  skinLight: string
  skinDark: string
  B: { bodyW: number; armLen: number; armRot: number; legW: number }
  headRX: number
  headRY: number
  headCY: number
  eyeY: number
  eyeDX: number
  eyeR: number
  mouthY: number
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement | null {
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      return new OffscreenCanvas(w, h)
    } catch { /* fallback */ }
  }
  if (typeof document === 'undefined') return null
  const el = document.createElement('canvas')
  el.width = w
  el.height = h
  return el
}

/** v93 主勾边恢复 */
function mainStroke(ctx: Ctx2D, pen: Pen) {
  pen.set(ctx, PZ.OUTLINE, pen.w(STROKE.MAIN) * 0.82)
}

/** 离屏渲染总入口（orchestrator） */
export function renderZombieToOffscreen(
  type: ZombieType, dpr: number, skin: string,
): ZombieSprite | null {
  const pen = new Pen()
  const Z = setup(type, dpr, skin, pen)
  if (!Z) return null
  sack(Z, pen)
  cape(Z, pen)
  arms(Z, pen)
  torso(Z, pen)
  shoulders(Z, pen)
  legs(Z, pen)
  head(Z, pen)
  headgear(Z, pen)
  face(Z, pen)
  faceVariants(Z, pen)
  cage(Z, pen)
  return { canvas: Z.canvas, size: UNIT * 3.6 }
}

// ============ 画布建立 + 超采样 + 描边基准 + 地面阴影 ============
function setup(type: ZombieType, dpr: number, skin: string, pen: Pen): ZState | null {
  const ss = Math.max(0.5, dpr) * OFFSCREEN.SUPERSAMPLE
  const size = UNIT * 3.6 // v96: 2.8→3.6 容纳橄榄球旗杆（消费端 drawSize 等比 ×3.6/2.8）
  const canvas = makeCanvas(Math.round(size * ss), Math.round(size * ss))
  if (!canvas) return null
  const ctx = canvas.getContext('2d') as Ctx2D | null
  if (!ctx) return null
  ctx.scale(ss, ss)
  ctx.translate(size / 2, size / 2)

  pen.setBase(UNIT)
  pen.set(ctx, PZ.OUTLINE, pen.w(STROKE.MAIN) * 0.82)

  ctx.fillStyle = COLORS.SHADOW
  ctx.beginPath()
  ctx.ellipse(0, UNIT * 1.10, UNIT * 0.74, UNIT * 0.20, 0, 0, Math.PI * 2)
  ctx.fill()

  const tone = PZ.SKIN[type] ?? PZ.SKIN.bucket
  return {
    type, ctx, canvas, U: UNIT, skin,
    skinLight: tone.light, skinDark: tone.dark,
    B: PZ.BODY[type] ?? PZ.BODY.bucket,
    headRX: 0, headRY: 0, headCY: 0, eyeY: 0, eyeDX: 0, eyeR: 0, mouthY: 0,
  }
}

// ============ 小鬼肩挎麻袋（先于手臂/头绘制） ============
function sack(Z: ZState, pen: Pen) {
  if (Z.type !== 'imp') return
  const { ctx, U } = Z
  ctx.save()
  ctx.translate(-U * 0.66, U * 0.02)
  ctx.rotate(-0.4)
  ctx.fillStyle = COLORS.Z_SACK
  ctx.beginPath()
  ctx.moveTo(-U * 0.085, -U * 0.38)
  ctx.lineTo(U * 0.085, -U * 0.38)
  ctx.lineTo(U * 0.11, -U * 0.22)
  ctx.lineTo(-U * 0.11, -U * 0.22)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  const sGrad = ctx.createLinearGradient(0, -U * 0.22, 0, U * 0.30)
  sGrad.addColorStop(0, COLORS.Z_SACK)
  sGrad.addColorStop(0.72, COLORS.Z_SACK)
  sGrad.addColorStop(1, COLORS.Z_SACK_DARK)
  ctx.fillStyle = sGrad
  ctx.beginPath()
  ctx.moveTo(-U * 0.11, -U * 0.22)
  ctx.bezierCurveTo(-U * 0.25, -U * 0.10, -U * 0.26, U * 0.14, -U * 0.15, U * 0.27)
  ctx.quadraticCurveTo(0, U * 0.36, U * 0.15, U * 0.25)
  ctx.bezierCurveTo(U * 0.26, U * 0.12, U * 0.25, -U * 0.08, U * 0.11, -U * 0.22)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = COLORS.Z_SACK_DARK
  ctx.fillRect(-U * 0.125, -U * 0.23, U * 0.25, U * 0.04)
  ctx.fillRect(-U * 0.117, -U * 0.165, U * 0.234, U * 0.035)
  ctx.beginPath()
  ctx.arc(-U * 0.125, -U * 0.20, U * 0.055, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.globalAlpha = 0.45
  pen.set(ctx, COLORS.Z_SACK_DARK, pen.w(STROKE.THIN))
  for (const sx of [-U * 0.08, U * 0.06]) {
    ctx.beginPath()
    ctx.moveTo(sx, -U * 0.10)
    ctx.lineTo(sx, U * 0.20)
    ctx.stroke()
  }
  ctx.globalAlpha = 0.55
  ctx.fillStyle = COLORS.Z_SACK_DARK
  ctx.beginPath()
  safeRoundRect(ctx, U * 0.01, U * 0.07, U * 0.14, U * 0.12, U * 0.02)
  ctx.fill()
  ctx.globalAlpha = 1
  mainStroke(ctx, pen)
  ctx.restore()
}

// ============ 僵尸王皇家深红斗篷 ============
function cape(Z: ZState, pen: Pen) {
  if (Z.type !== 'king') return
  const { ctx, U } = Z
  const capeW = U * 0.72
  const capeTop = U * 0.02
  const capeBot = U * 0.84
  const cpGrad = ctx.createLinearGradient(-capeW, 0, capeW, 0)
  cpGrad.addColorStop(0, COLORS.Z_KING_CAPE)
  cpGrad.addColorStop(0.55, COLORS.Z_KING_CAPE)
  cpGrad.addColorStop(1, COLORS.Z_KING_CAPE_DARK)
  ctx.fillStyle = cpGrad
  ctx.beginPath()
  ctx.moveTo(-capeW * 0.60, capeTop)
  ctx.quadraticCurveTo(-capeW, capeBot * 0.55, -capeW * 0.82, capeBot)
  ctx.lineTo(-capeW * 0.26, capeBot - U * 0.10)
  ctx.lineTo(0, capeBot)
  ctx.lineTo(capeW * 0.26, capeBot - U * 0.10)
  ctx.lineTo(capeW * 0.82, capeBot)
  ctx.quadraticCurveTo(capeW, capeBot * 0.55, capeW * 0.60, capeTop)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = COLORS.Z_KING_GOLD
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(s * U * 0.38, U * 0.10, U * 0.07, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
  }
}

// ============ 手臂：西装袖 + 僵尸绿手掌 ============
function arms(Z: ZState, pen: Pen) {
  const { ctx, U } = Z
  const armX = U * (Z.B.bodyW * 0.92 + 0.05)
  const armY = U * 0.06
  const armRot = Z.B.armRot
  const sleeve = Z.type === 'bucket' ? PZ.JK :
    Z.type === 'imp' ? '#4E463E' :
    Z.type === 'football' ? COLORS.Z_FH_JERSEY :
    Z.type === 'dancer' ? COLORS.Z_DN_SUIT :
    Z.type === 'king' ? COLORS.Z_KING_ROBE : PZ.JK
  const sleeveDark = Z.type === 'bucket' ? PZ.JK_DARK :
    Z.type === 'imp' ? '#362F29' :
    Z.type === 'football' ? COLORS.Z_FH_JERSEY_DARK :
    Z.type === 'dancer' ? COLORS.Z_DN_SUIT_DARK :
    Z.type === 'king' ? COLORS.Z_KING_ROBE_DARK : PZ.JK_DARK
  for (const side of [-1, 1]) {
    const rot = side * armRot
    const sg = ctx.createLinearGradient(-U * 0.1, 0, U * 0.1, 0)
    sg.addColorStop(0, sleeve)
    sg.addColorStop(1, sleeveDark)
    ctx.fillStyle = sg
    ctx.save()
    ctx.translate(side * (armX + U * 0.04), armY)
    ctx.rotate(rot * 0.72)
    ctx.beginPath()
    ctx.ellipse(0, U * Z.B.armLen * 0.42, U * 0.098, U * Z.B.armLen * 0.55, 0, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = sleeveDark
    ctx.beginPath()
    ctx.ellipse(0, U * Z.B.armLen * 0.88, U * 0.088, U * 0.055, 0, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
    ctx.restore()
    const hx = side * (armX + U * 0.04 + Math.sin(armRot) * U * Z.B.armLen * 0.98)
    const hy = armY + Math.cos(armRot) * U * Z.B.armLen * 0.98
    ctx.fillStyle = Z.skin
    ctx.beginPath()
    ctx.arc(hx, hy, U * 0.095, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
    for (const f of [-0.55, 0.1, 0.7]) {
      ctx.beginPath()
      ctx.arc(hx + Math.cos(rot + f) * U * 0.095, hy + Math.sin(rot + f) * U * 0.095 * 0.6 + U * 0.02, U * 0.038, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(hx, hy, U * 0.095, 0, Math.PI * 2)
    ctx.stroke()
  }
}

// ============ 躯干：西装外套 + 白衬衫 V + 红领带 + 驳领 + 下摆撕裂 ============
function torso(Z: ZState, pen: Pen) {
  const { ctx, U } = Z
  const bodyW = Z.B.bodyW
  const robeFill = Z.type === 'bucket' ? PZ.JK :
    Z.type === 'imp' ? '#4E463E' :
    Z.type === 'football' ? COLORS.Z_FH_JERSEY :
    Z.type === 'dancer' ? COLORS.Z_DN_SUIT :
    Z.type === 'king' ? COLORS.Z_KING_ROBE : PZ.JK
  const robeDark = Z.type === 'bucket' ? PZ.JK_DARK :
    Z.type === 'imp' ? '#362F29' :
    Z.type === 'football' ? COLORS.Z_FH_JERSEY_DARK :
    Z.type === 'dancer' ? COLORS.Z_DN_SUIT_DARK :
    Z.type === 'king' ? COLORS.Z_KING_ROBE_DARK : PZ.JK_DARK
  const robeOut = Z.type === 'imp' || Z.type === 'football' || Z.type === 'dancer' || Z.type === 'king'
    ? PZ.OUTLINE : PZ.OUT_JK
  const topY = U * -0.12
  const botY = Z.type === 'king' ? U * 0.70 : U * 0.66
  const tg = ctx.createLinearGradient(-U * bodyW, 0, U * bodyW, 0)
  tg.addColorStop(0, Z.type === 'bucket' ? PZ.JK_LIGHT :
    Z.type === 'imp' ? '#5C544C' :
    Z.type === 'dancer' ? COLORS.Z_DN_SUIT_LIGHT : robeFill)
  tg.addColorStop(0.55, robeFill)
  tg.addColorStop(1, robeDark)
  ctx.fillStyle = tg
  pen.set(ctx, robeOut, pen.w(STROKE.MAIN) * 0.82)
  ctx.beginPath()
  safeRoundRect(ctx, -U * bodyW, topY, U * bodyW * 2, botY - topY, U * 0.22)
  ctx.fill(); ctx.stroke()
  ctx.save()
  ctx.beginPath()
  safeRoundRect(ctx, -U * bodyW, topY, U * bodyW * 2, botY - topY, U * 0.22)
  ctx.clip()
  ctx.globalAlpha = 0.30
  ctx.fillStyle = robeDark
  ctx.fillRect(U * bodyW * 0.30, topY, U * bodyW * 0.85, botY - topY)
  ctx.globalAlpha = 1
  ctx.restore()

  if (Z.type === 'bucket' || Z.type === 'dancer') {
    const shirt = Z.type === 'dancer' ? COLORS.Z_DN_SHIRT : '#DCE4EE'
    const tie = Z.type === 'dancer' ? COLORS.Z_DN_TIE : PZ.TIE
    const lapel = Z.type === 'dancer' ? COLORS.Z_DN_SUIT_DARK : PZ.JK_DARK
    ctx.fillStyle = shirt
    ctx.beginPath()
    ctx.moveTo(-U * 0.17, topY + U * 0.02)
    ctx.lineTo(U * 0.17, topY + U * 0.02)
    ctx.lineTo(U * 0.05, topY + U * 0.40)
    ctx.lineTo(-U * 0.05, topY + U * 0.40)
    ctx.closePath()
    ctx.fill()
    pen.set(ctx, PZ.OUTLINE, pen.w(STROKE.THIN))
    ctx.stroke()
    ctx.fillStyle = lapel
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(s * U * 0.20, topY + U * 0.01)
      ctx.lineTo(s * U * 0.06, topY + U * 0.02)
      ctx.lineTo(s * U * 0.03, topY + U * 0.30)
      ctx.closePath()
      ctx.fill(); ctx.stroke()
    }
    pen.set(ctx, PZ.OUTLINE, pen.w(STROKE.THIN) * 0.8)
    ctx.fillStyle = tie
    ctx.beginPath()
    ctx.moveTo(-U * 0.05, topY + U * 0.02)
    ctx.lineTo(U * 0.05, topY + U * 0.02)
    ctx.lineTo(U * 0.085, topY + U * 0.14)
    ctx.lineTo(-U * 0.085, topY + U * 0.14)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-U * 0.062, topY + U * 0.14)
    ctx.lineTo(U * 0.062, topY + U * 0.14)
    ctx.lineTo(U * 0.045, topY + U * 0.46)
    ctx.lineTo(-U * 0.045, topY + U * 0.46)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
  }
  // 小鬼浅衬衫 V 领（深背心露浅衫，附图特征）
  if (Z.type === 'imp') {
    ctx.fillStyle = '#D8D2C4'
    ctx.beginPath()
    ctx.moveTo(-U * 0.15, topY + U * 0.02)
    ctx.lineTo(U * 0.15, topY + U * 0.02)
    ctx.lineTo(U * 0.045, topY + U * 0.36)
    ctx.lineTo(-U * 0.045, topY + U * 0.36)
    ctx.closePath()
    ctx.fill()
    pen.set(ctx, PZ.OUTLINE, pen.w(STROKE.THIN))
    ctx.stroke()
  }
  if (Z.type === 'football') {
    pen.set(ctx, COLORS.Z_FH_STRIPE, pen.w(STROKE.THIN) * 1.4)
    for (const sx of [-U * 0.10, U * 0.02, U * 0.14]) {
      ctx.beginPath()
      ctx.moveTo(sx, topY + U * 0.06)
      ctx.lineTo(sx, topY + U * 0.30)
      ctx.stroke()
    }
  }
  if (Z.type === 'imp') {
    ctx.globalAlpha = 0.8
    ctx.fillStyle = '#A79C8D'
    ctx.beginPath()
    safeRoundRect(ctx, -U * 0.24, U * 0.24, U * 0.14, U * 0.11, U * 0.02)
    ctx.fill()
    ctx.globalAlpha = 1
    pen.set(ctx, PZ.OUTLINE, pen.w(STROKE.THIN))
    ctx.stroke()
  }
  if (Z.type === 'king') {
    ctx.fillStyle = COLORS.Z_KING_CAPE
    ctx.beginPath()
    safeRoundRect(ctx, -U * 0.38, U * 0.50, U * 0.76, U * 0.10, U * 0.03)
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = COLORS.Z_KING_GEM
    ctx.beginPath()
    ctx.arc(0, U * 0.55, U * 0.05, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
  }
  const hemCol = Z.type === 'bucket' ? PZ.JK_DARK :
    Z.type === 'imp' ? '#362F29' :
    Z.type === 'football' ? COLORS.Z_FH_JERSEY_DARK :
    Z.type === 'dancer' ? COLORS.Z_DN_SUIT_DARK :
    Z.type === 'king' ? COLORS.Z_KING_ROBE_DARK : PZ.JK_DARK
  ctx.fillStyle = hemCol
  const hemY = botY - U * 0.01
  pen.set(ctx, PZ.OUTLINE, pen.w(STROKE.THIN) * 0.7)
  for (const [tx, tw] of [[-0.55, 0.26], [-0.02, 0.30], [0.52, 0.25]]) {
    ctx.beginPath()
    ctx.moveTo(U * (tx - tw / 2), hemY - U * 0.01)
    ctx.lineTo(U * (tx + tw / 2), hemY - U * 0.01)
    ctx.lineTo(U * tx, hemY + U * 0.07)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  mainStroke(ctx, pen)
}

// ============ 橄榄球护肩 ×2 ============
function shoulders(Z: ZState, pen: Pen) {
  if (Z.type !== 'football') return
  const { ctx, U } = Z
  for (const s of [-1, 1]) {
    const px = s * U * 0.62
    const py = U * 0.10
    const prx = U * 0.24
    const pry = U * 0.185
    const pGrad = ctx.createLinearGradient(px - prx, py - pry, px + prx, py + pry)
    pGrad.addColorStop(0, COLORS.Z_FH_RED_LIGHT)
    pGrad.addColorStop(0.55, COLORS.Z_FH_RED)
    pGrad.addColorStop(1, COLORS.Z_FH_RED_DARK)
    ctx.fillStyle = pGrad
    ctx.beginPath()
    ctx.ellipse(px, py, prx, pry, s * 0.18, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
    pen.set(ctx, COLORS.Z_FH_RED_DARK, pen.w(STROKE.THIN))
    ctx.beginPath()
    ctx.ellipse(px, py, prx * 0.74, pry * 0.64, s * 0.18, Math.PI * 0.15, Math.PI * 0.85)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.30)'
    ctx.beginPath()
    ctx.ellipse(px - prx * 0.34, py - pry * 0.42, prx * 0.30, pry * 0.26, s * -0.30, 0, Math.PI * 2)
    ctx.fill()
    mainStroke(ctx, pen)
  }
}

// ============ 腿：西裤 + 皮鞋 ============
function legs(Z: ZState, pen: Pen) {
  const { ctx, U } = Z
  const pants = Z.type === 'bucket' ? PZ.PANTS :
    Z.type === 'imp' ? '#3A342E' :
    Z.type === 'football' ? '#39414D' :
    Z.type === 'dancer' ? COLORS.Z_DN_SUIT_DARK :
    Z.type === 'king' ? COLORS.Z_KING_ROBE_DARK : PZ.PANTS
  const pantsOut = Z.type === 'bucket' ? PZ.PANTS_OUT : PZ.OUTLINE
  const shoe = Z.type === 'king' ? COLORS.Z_KING_CAPE_DARK :
    Z.type === 'football' ? COLORS.Z_FH_CLEAT :
    Z.type === 'dancer' ? COLORS.Z_DN_SHOE : PZ.SHOES
  pen.set(ctx, pantsOut, pen.w(STROKE.MAIN) * 0.82)
  for (const s of [-1, 1]) {
    const lx = s * U * 0.19
    ctx.fillStyle = pants
    ctx.beginPath()
    safeRoundRect(ctx, lx - U * Z.B.legW, U * 0.52, U * Z.B.legW * 2, U * 0.40, U * Z.B.legW * 0.8)
    ctx.fill(); ctx.stroke()
  }
  ctx.fillStyle = shoe
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(s * U * 0.21, U * 0.94, U * 0.13, U * 0.085, s * 0.14, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
  }
  // 舞王手杖（金色杖头 + 深色杖杆，附图特征）
  if (Z.type === 'dancer') {
    const cx0 = U * 0.74
    pen.set(ctx, '#2B1D10', pen.w(STROKE.THIN) * 1.5)
    ctx.strokeStyle = '#4A3423'
    ctx.lineWidth = Math.max(2, U * 0.055)
    ctx.beginPath()
    ctx.moveTo(cx0, U * 0.26)
    ctx.lineTo(cx0 + U * 0.03, U * 1.02)
    ctx.stroke()
    mainStroke(ctx, pen)
    ctx.fillStyle = COLORS.Z_KING_GOLD
    ctx.beginPath()
    ctx.arc(cx0, U * 0.22, U * 0.078, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
  }
  mainStroke(ctx, pen)
}

// ============ 头：大头骨椭圆 ============
function head(Z: ZState, pen: Pen) {
  const { ctx, U } = Z
  const imp = Z.type === 'imp'
  Z.headRX = U * (imp ? 0.52 : 0.58)
  Z.headRY = U * (imp ? 0.58 : 0.64)
  Z.headCY = U * (imp ? -0.44 : -0.50)
  const headPath = () => {
    ctx.beginPath()
    ctx.ellipse(0, Z.headCY, Z.headRX, Z.headRY, 0, 0, Math.PI * 2)
  }

  for (const s of [-1, 1]) {
    ctx.fillStyle = Z.skinDark
    ctx.beginPath()
    ctx.ellipse(s * Z.headRX * 0.99, Z.headCY + U * 0.10, U * 0.105, U * 0.17, s * -0.15, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
  }

  const hg = ctx.createRadialGradient(-Z.headRX * 0.40, Z.headCY - Z.headRY * 0.45, 0, 0, Z.headCY, Z.headRX * 1.45)
  hg.addColorStop(0, Z.skinLight)
  hg.addColorStop(0.58, Z.skin)
  hg.addColorStop(1, Z.skinDark)
  ctx.fillStyle = hg
  headPath()
  ctx.fill(); ctx.stroke()

  ctx.save()
  headPath(); ctx.clip()
  ctx.fillStyle = 'rgba(57,65,44,0.16)'
  ctx.beginPath()
  ctx.ellipse(Z.headRX * 0.30, Z.headCY + Z.headRY * 0.68, Z.headRX * 0.85, Z.headRY * 0.42, 0.15, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(57,65,44,0.12)'
  ctx.beginPath()
  ctx.ellipse(-Z.headRX * 0.42, Z.headCY + Z.headRY * 0.18, Z.headRX * 0.20, Z.headRY * 0.10, 0.3, 0, Math.PI * 2)
  ctx.ellipse(Z.headRX * 0.42, Z.headCY + Z.headRY * 0.18, Z.headRX * 0.20, Z.headRY * 0.10, -0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  ctx.beginPath()
  ctx.ellipse(-Z.headRX * 0.42, Z.headCY - Z.headRY * 0.52, Z.headRX * 0.30, Z.headRY * 0.16, -0.5, 0, Math.PI * 2)
  ctx.fill()

  if (Z.type !== 'imp') {
    pen.set(ctx, PZ.HAIR, pen.w(STROKE.THIN))
    const hairBase = Z.headCY - Z.headRY * 0.94
    const strands: Array<[number, number]> = [[-0.30, -0.07], [-0.08, -0.11], [0.12, -0.10], [0.32, -0.06]]
    for (const [sx, sl] of strands) {
      const bx = sx * Z.headRX
      ctx.beginPath()
      ctx.moveTo(bx, hairBase + Z.headRY * 0.06)
      ctx.quadraticCurveTo(bx + sx * 0.05 * U, hairBase + sl * Z.headRY * 0.5, bx + sx * 0.11 * U, hairBase + sl * Z.headRY)
      ctx.stroke()
    }
    mainStroke(ctx, pen)
  }
}

// ============ 头顶装饰（铁桶/破兜帽/高顶礼帽/头盔/黄金王冠） ============
function headgear(Z: ZState, pen: Pen) {
  const { ctx, U } = Z
  const hcY = Z.headCY
  const hRX = Z.headRX, hRY = Z.headRY

  if (Z.type === 'bucket') {
    const rimY = hcY - hRY * 0.26
    const topY = rimY - U * 0.72
    const halfTop = hRX * 0.78
    const halfBot = hRX * 1.12
    const bGrad = ctx.createLinearGradient(-halfBot, 0, halfBot, 0)
    bGrad.addColorStop(0, COLORS.Z_BUCKET_LIGHT)
    bGrad.addColorStop(0.45, COLORS.Z_BUCKET)
    bGrad.addColorStop(1, COLORS.Z_BUCKET_DARK)
    ctx.fillStyle = bGrad
    ctx.beginPath()
    ctx.moveTo(-halfTop, topY)
    ctx.lineTo(halfTop, topY)
    ctx.lineTo(halfBot, rimY - hRY * 0.06)
    ctx.quadraticCurveTo(0, rimY + hRY * 0.05, -halfBot, rimY - hRY * 0.06)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.30)'
    ctx.beginPath()
    ctx.ellipse(-halfBot * 0.44, topY + U * 0.28, hRX * 0.10, U * 0.20, -0.06, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = COLORS.Z_BUCKET_DARK
    ctx.beginPath()
    ctx.moveTo(-halfBot * 1.04, rimY - hRY * 0.10)
    ctx.lineTo(halfBot * 1.04, rimY - hRY * 0.10)
    ctx.quadraticCurveTo(0, rimY + hRY * 0.05, -halfBot * 1.04, rimY - hRY * 0.10)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    const hy = topY + (rimY - topY) * 0.42
    const hwHy = halfTop + (halfBot - halfTop) * 0.42
    for (const s of [-1, 1]) {
      ctx.fillStyle = COLORS.Z_BUCKET_DARK
      ctx.beginPath()
      ctx.ellipse(s * (hwHy + hRX * 0.01), hy, hRX * 0.11, hRX * 0.16, s * 0.22, 0, Math.PI * 2)
      ctx.fill(); ctx.stroke()
      ctx.fillStyle = COLORS.Z_BUCKET_LIGHT
      ctx.beginPath()
      ctx.ellipse(s * (hwHy + hRX * 0.01), hy, hRX * 0.048, hRX * 0.09, s * 0.22, 0, Math.PI * 2)
      ctx.fill()
    }
    // 桶身铆钉 ×5（v94 附图紫色铆钉桶特征，替代旧锈斑）
    const stud = (fy: number, fx: number) => {
      const sy = topY + (rimY - topY) * fy
      const halfW = halfTop + (halfBot - halfTop) * fy
      const sx = fx * halfW
      ctx.fillStyle = COLORS.Z_BUCKET_DARK
      ctx.beginPath()
      ctx.arc(sx, sy, hRX * 0.085, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.32)'
      ctx.beginPath()
      ctx.arc(sx - hRX * 0.022, sy - hRX * 0.028, hRX * 0.034, 0, Math.PI * 2)
      ctx.fill()
    }
    stud(0.32, -0.52); stud(0.58, -0.62); stud(0.32, 0.52); stud(0.58, 0.62); stud(0.80, 0)
    mainStroke(ctx, pen)
  } else if (Z.type === 'imp') {
    // 深棕乱发帽（v94 附图小鬼黑发特征，替代旧破兜帽）
    const hairGrad = ctx.createLinearGradient(-hRX * 0.8, hcY - hRY * 1.2, hRX * 0.9, hcY)
    hairGrad.addColorStop(0, '#4A3F33')
    hairGrad.addColorStop(0.55, '#3A3128')
    hairGrad.addColorStop(1, '#2A231C')
    ctx.fillStyle = hairGrad
    ctx.beginPath()
    ctx.ellipse(0, hcY - hRY * 0.50, hRX * 1.06, hRY * 0.64, 0, Math.PI * 1.03, Math.PI * 1.97)
    ctx.quadraticCurveTo(hRX * 0.60, hcY - hRY * 0.28, hRX * 0.16, hcY - hRY * 0.40)
    ctx.quadraticCurveTo(-hRX * 0.34, hcY - hRY * 0.54, -hRX * 0.80, hcY - hRY * 0.30)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    // 顶部戳发 ×3
    const spikes: Array<[number, number]> = [[-0.36, -0.30], [-0.05, -0.40], [0.28, -0.28]]
    for (const [hxp, hgt] of spikes) {
      const bx = hxp * hRX
      const arg = Math.max(0, 1 - (hxp * hxp) * 1.55)
      const by = hcY - hRY * (0.50 + 0.64 * Math.sqrt(arg)) + hRY * 0.03
      ctx.fillStyle = '#3A3128'
      ctx.beginPath()
      ctx.moveTo(bx - hRX * 0.07, by)
      ctx.quadraticCurveTo(bx + hxp * hRX * 0.20, by - hRY * hgt * 0.8, bx + hxp * hRX * 0.44, by - hRY * hgt)
      ctx.quadraticCurveTo(bx + hRX * 0.06, by - hRY * hgt * 0.4, bx + hRX * 0.07, by)
      ctx.closePath()
      ctx.fill(); ctx.stroke()
    }
    mainStroke(ctx, pen)
    // 额前碎发 ×2 + 右侧一撇
    pen.set(ctx, '#2A231C', pen.w(STROKE.THIN))
    ctx.beginPath()
    ctx.moveTo(-hRX * 0.30, hcY - hRY * 0.30)
    ctx.quadraticCurveTo(-hRX * 0.36, hcY - hRY * 0.22, -hRX * 0.24, hcY - hRY * 0.16)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(hRX * 0.22, hcY - hRY * 0.32)
    ctx.quadraticCurveTo(hRX * 0.28, hcY - hRY * 0.24, hRX * 0.19, hcY - hRY * 0.17)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(hRX * 0.78, hcY - hRY * 0.36)
    ctx.quadraticCurveTo(hRX * 1.00, hcY - hRY * 0.36, hRX * 1.13, hcY - hRY * 0.22)
    ctx.stroke()
    mainStroke(ctx, pen)
  } else if (Z.type === 'dancer') {
    ctx.save()
    ctx.translate(0, hcY - hRY * 0.46)
    ctx.rotate(-0.10)
    const brimHalf = hRX * 0.95
    const brimH = hRY * 0.13
    const cHalf = hRX * 0.52
    const cH = hRY * 0.72
    const cGrad = ctx.createLinearGradient(-cHalf, 0, cHalf, 0)
    cGrad.addColorStop(0, COLORS.Z_DN_HAT_LIGHT)
    cGrad.addColorStop(0.38, COLORS.Z_DN_HAT)
    cGrad.addColorStop(1, COLORS.Z_DN_HAT_DARK)
    ctx.fillStyle = cGrad
    ctx.beginPath()
    safeRoundRect(ctx, -cHalf, -cH, cHalf * 2, cH + hRY * 0.05, hRX * 0.09)
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.20)'
    ctx.beginPath()
    ctx.ellipse(-cHalf * 0.52, -cH * 0.46, hRX * 0.09, cH * 0.28, 0.10, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = COLORS.Z_DN_HAT_DARK
    ctx.beginPath()
    ctx.ellipse(0, 0, brimHalf, brimH, 0, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
    ctx.restore()
    mainStroke(ctx, pen)
  } else if (Z.type === 'football') {
    const domeRX = hRX * 1.06
    const domeRY = hRY * 1.00
    const domeCY = hcY - hRY * 0.10
    const hGrad = ctx.createLinearGradient(-domeRX, 0, domeRX, 0)
    hGrad.addColorStop(0, COLORS.Z_FH_RED_LIGHT)
    hGrad.addColorStop(0.5, COLORS.Z_FH_RED)
    hGrad.addColorStop(1, COLORS.Z_FH_RED_DARK)
    ctx.fillStyle = hGrad
    ctx.beginPath()
    ctx.ellipse(0, domeCY, domeRX, domeRY, 0, Math.PI * 1.03, Math.PI * 1.97)
    ctx.lineTo(hRX * 1.0, hcY - hRY * 0.16)
    ctx.quadraticCurveTo(0, hcY - hRY * 0.28, -hRX * 1.0, hcY - hRY * 0.16)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    const sHalf = hRX * 0.21
    ctx.fillStyle = COLORS.Z_FH_STRIPE
    ctx.beginPath()
    ctx.moveTo(-sHalf * 0.55, domeCY - domeRY * 0.99)
    ctx.quadraticCurveTo(-sHalf, domeCY - domeRY * 0.45, -sHalf, hcY - hRY * 0.18)
    ctx.lineTo(sHalf, hcY - hRY * 0.18)
    ctx.quadraticCurveTo(sHalf, domeCY - domeRY * 0.45, sHalf * 0.55, domeCY - domeRY * 0.99)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = COLORS.Z_FH_RED_DARK
    ctx.beginPath()
    safeRoundRect(ctx, -hRX * 1.02, hcY - hRY * 0.30, hRX * 2.04, hRY * 0.11, hRY * 0.045)
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = COLORS.Z_FH_RED_DARK
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(s * hRX * 0.62, domeCY - hRY * 0.42, hRX * 0.055, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(255,255,255,0.30)'
    ctx.beginPath()
    ctx.ellipse(-hRX * 0.40, domeCY - hRY * 0.55, hRX * 0.10, hRY * 0.18, -0.50, 0, Math.PI * 2)
    ctx.fill()
    // 盔顶红旗（附图特征：旗杆 + 右飘红旗，v96 加大醒目）
    const poleX = hRX * 0.38
    const poleTopY = domeCY - domeRY * 1.76
    const poleBaseY = domeCY - domeRY * 0.88
    pen.set(ctx, '#6E5A3E', pen.w(STROKE.THIN) * 1.2)
    ctx.beginPath()
    ctx.moveTo(poleX, poleBaseY)
    ctx.lineTo(poleX + hRX * 0.10, poleTopY)
    ctx.stroke()
    ctx.fillStyle = COLORS.Z_FH_RED
    ctx.beginPath()
    ctx.moveTo(poleX + hRX * 0.10, poleTopY)
    ctx.quadraticCurveTo(poleX + hRX * 0.46, poleTopY - hRY * 0.16, poleX + hRX * 0.74, poleTopY + hRY * 0.04)
    ctx.quadraticCurveTo(poleX + hRX * 0.40, poleTopY + hRY * 0.16, poleX + hRX * 0.14, poleTopY + hRY * 0.34)
    ctx.closePath()
    ctx.fill()
    pen.set(ctx, COLORS.Z_FH_RED_DARK, pen.w(STROKE.THIN) * 0.8)
    ctx.stroke()
    mainStroke(ctx, pen)
  } else if (Z.type === 'king') {
    ctx.save()
    ctx.translate(0, hcY - hRY * 0.60)
    ctx.rotate(-0.06)
    const crW = hRX * 0.86
    const crH = hRY * 0.34
    const tipH = hRY * 0.24
    const gGrad = ctx.createLinearGradient(-crW, 0, crW, 0)
    gGrad.addColorStop(0, COLORS.Z_KING_GOLD)
    gGrad.addColorStop(0.55, COLORS.Z_KING_GOLD)
    gGrad.addColorStop(1, COLORS.Z_KING_GOLD_DARK)
    ctx.fillStyle = gGrad
    ctx.beginPath()
    ctx.moveTo(-crW, 0)
    ctx.lineTo(-crW, -crH)
    ctx.lineTo(-crW * 0.62, -crH - tipH * 0.85)
    ctx.lineTo(-crW * 0.34, -crH * 0.72)
    ctx.lineTo(0, -crH - tipH)
    ctx.lineTo(crW * 0.34, -crH * 0.72)
    ctx.lineTo(crW * 0.62, -crH - tipH * 0.85)
    ctx.lineTo(crW, -crH)
    ctx.lineTo(crW, 0)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = COLORS.Z_KING_GOLD
    for (const [bx, br] of [[-crW * 0.62, hRX * 0.05], [0, hRX * 0.065], [crW * 0.62, hRX * 0.05]] as Array<[number, number]>) {
      ctx.beginPath()
      ctx.arc(bx, -crH - tipH * 0.85 - hRX * 0.02, br, 0, Math.PI * 2)
      ctx.fill(); ctx.stroke()
    }
    ctx.fillStyle = COLORS.Z_KING_GEM
    ctx.beginPath()
    ctx.arc(0, -crH * 0.42, hRX * 0.09, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = COLORS.Z_KING_GOLD_DARK
    ctx.beginPath()
    safeRoundRect(ctx, -crW * 1.06, -crH * 0.30, crW * 2.12, crH * 0.34, hRX * 0.05)
    ctx.fill(); ctx.stroke()
    ctx.restore()
    mainStroke(ctx, pen)
  }
}

// ============ 表情：大白眼珠 + 小瞳孔 ============
function face(Z: ZState, pen: Pen) {
  const { ctx, U } = Z
  const imp = Z.type === 'imp'
  Z.eyeY = Z.headCY - U * 0.02
  Z.eyeR = U * (imp ? 0.15 : 0.155)
  Z.eyeDX = Z.headRX * (imp ? 0.50 : 0.42)
  // 眼白（微浊白，椭圆；v95 两眼独立路径修眼镜桥线）
  pen.set(ctx, PZ.OUTLINE, pen.w(STROKE.EYE) * 0.55)
  ctx.fillStyle = imp ? COLORS.Z_EYE_YELLOW : '#F4F1E3'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(s * Z.eyeDX, Z.eyeY, Z.eyeR * 0.94 * (s < 0 ? 0.92 : 1), Z.eyeR, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  const pOff = Z.eyeR * (imp ? 0 : 0.16)
  const pupilR = Z.eyeR * (imp ? 0.30 : 0.40)
  ctx.fillStyle = '#2C2C28'
  ctx.beginPath()
  ctx.arc(-Z.eyeDX + pOff, Z.eyeY + Z.eyeR * 0.12, pupilR, 0, Math.PI * 2)
  ctx.arc(Z.eyeDX - pOff, Z.eyeY + Z.eyeR * 0.12, pupilR, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.beginPath()
  ctx.arc(-Z.eyeDX + pOff - pupilR * 0.30, Z.eyeY + Z.eyeR * 0.12 - pupilR * 0.36, pupilR * 0.34, 0, Math.PI * 2)
  ctx.arc(Z.eyeDX - pOff - pupilR * 0.30, Z.eyeY + Z.eyeR * 0.12 - pupilR * 0.36, pupilR * 0.34, 0, Math.PI * 2)
  ctx.fill()
}

// ============ 类型差异化表情（皱纹/眉形/嘴部/獠牙/舌头） ============
function faceVariants(Z: ZState, pen: Pen) {
  const { ctx, U } = Z
  const eyeR = Z.eyeR
  const browY = Z.eyeY - eyeR * 1.45

  pen.set(ctx, PZ.WRINKLE, pen.w(STROKE.THIN) * 0.75)
  ctx.beginPath()
  ctx.moveTo(-Z.headRX * 0.13, Z.eyeY - eyeR * 2.85)
  ctx.quadraticCurveTo(0, Z.eyeY - eyeR * 3.02, Z.headRX * 0.13, Z.eyeY - eyeR * 2.85)
  ctx.stroke()

  const browW = eyeR * 1.15
  pen.set(ctx, PZ.HAIR, pen.w(STROKE.INK))
  if (Z.type === 'bucket') {
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(s * Z.eyeDX - s * browW, browY + eyeR * 0.45)
      ctx.quadraticCurveTo(s * Z.eyeDX, browY - eyeR * 0.30, s * Z.eyeDX + s * browW * 0.4, browY - eyeR * 0.42)
      ctx.stroke()
    }
  } else if (Z.type === 'imp') {
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(s * Z.eyeDX - s * browW, browY + eyeR * 0.30)
      ctx.quadraticCurveTo(s * Z.eyeDX, browY - eyeR * 0.60, s * Z.eyeDX + s * browW * 0.4, browY - eyeR * 0.55)
      ctx.stroke()
    }
  } else if (Z.type === 'football' || Z.type === 'king') {
    const bold = Z.type === 'king' ? 2.0 : 1.8
    pen.set(ctx, PZ.HAIR, pen.w(STROKE.INK) * bold)
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(s * Z.eyeDX - s * browW, browY - eyeR * 0.50)
      ctx.quadraticCurveTo(s * Z.eyeDX, browY + eyeR * 0.05, s * Z.eyeDX + s * browW * 0.4, browY + eyeR * 0.42)
      ctx.stroke()
    }
  } else if (Z.type === 'dancer') {
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(s * Z.eyeDX - s * browW, browY + eyeR * 0.30)
      ctx.quadraticCurveTo(s * Z.eyeDX, browY - eyeR * 0.45, s * Z.eyeDX + s * browW * 0.4, browY - eyeR * 0.40)
      ctx.stroke()
    }
  }

  // 圆框眼镜（bucket/imp/dancer，附图特征；逐镜独立路径 —— 防隐式桥线）
  if (Z.type === 'bucket' || Z.type === 'imp' || Z.type === 'dancer') {
    const lr = eyeR * 1.30
    ctx.fillStyle = 'rgba(252,251,244,0.16)'
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(s * Z.eyeDX, Z.eyeY, lr, 0, Math.PI * 2)
      ctx.fill()
    }
    pen.set(ctx, '#2B2A32', pen.w(STROKE.EYE))
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(s * Z.eyeDX, Z.eyeY, lr, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(-Z.eyeDX + lr * 0.94, Z.eyeY - eyeR * 0.22)
    ctx.quadraticCurveTo(0, Z.eyeY - eyeR * 0.62, Z.eyeDX - lr * 0.94, Z.eyeY - eyeR * 0.22)
    ctx.stroke()
    pen.set(ctx, '#2B2A32', pen.w(STROKE.EYE) * 0.8)
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(s * (Z.eyeDX + lr * 0.98), Z.eyeY - eyeR * 0.06)
      ctx.quadraticCurveTo(s * Z.headRX * 0.96, Z.eyeY + eyeR * 0.18, s * Z.headRX * 1.0, Z.eyeY + eyeR * 0.50)
      ctx.stroke()
    }
  }

  // 嘴部（按类型）（v96 圆框眼镜回归附图：独立路径无桥线）
  Z.mouthY = Z.headCY + Z.headRY * 0.36
  pen.set(ctx, PZ.MOUTH_OUT, pen.w(STROKE.LIP))
  if (Z.type === 'bucket' || Z.type === 'football' || Z.type === 'king') {
    const mW = Z.headRX * (Z.type === 'king' ? 0.48 : Z.type === 'football' ? 0.40 : 0.44)
    const mH = Z.headRY * (Z.type === 'king' ? 0.28 : Z.type === 'football' ? 0.23 : 0.25)
    ctx.fillStyle = PZ.MOUTH
    ctx.beginPath()
    ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2)
    ctx.fill()
    pen.set(ctx, PZ.MOUTH_OUT, pen.w(STROKE.LIP))
    ctx.stroke()
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = 'rgba(255,120,120,0.30)'
    ctx.beginPath()
    ctx.ellipse(0, Z.mouthY + mH * 0.55, mW * 0.55, mH * 0.42, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = PZ.TEETH
    const teeth: Array<[number, number, number]> = [[-0.62, 0.30, 0.52], [-0.24, 0.26, 0.72], [0.10, 0.26, 0.58], [0.44, 0.24, 0.42]]
    for (const [tx, tw, th] of teeth) {
      ctx.beginPath()
      safeRoundRect(ctx, mW * tx, Z.mouthY - mH * 0.86, mW * tw, mH * th, mW * 0.08)
      ctx.fill()
    }
    ctx.beginPath()
    safeRoundRect(ctx, mW * -0.40, Z.mouthY + mH * 0.36, mW * 0.22, mH * 0.26, mW * 0.06)
    ctx.fill()
    ctx.beginPath()
    safeRoundRect(ctx, mW * 0.16, Z.mouthY + mH * 0.34, mW * 0.20, mH * 0.24, mW * 0.06)
    ctx.fill()
  } else if (Z.type === 'imp') {
    const mW = Z.headRX * 0.34
    const mH = Z.headRY * 0.24
    ctx.fillStyle = PZ.MOUTH
    ctx.beginPath()
    ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2)
    ctx.fill()
    pen.set(ctx, PZ.MOUTH_OUT, pen.w(STROKE.LIP))
    ctx.stroke()
    ctx.fillStyle = PZ.TEETH
    ctx.beginPath()
    safeRoundRect(ctx, -mW * 0.52, Z.mouthY - mH * 0.90, mW * 0.32, mH * 0.44, mW * 0.06)
    ctx.fill()
    ctx.beginPath()
    safeRoundRect(ctx, mW * 0.18, Z.mouthY - mH * 0.94, mW * 0.30, mH * 0.50, mW * 0.06)
    ctx.fill()
  } else if (Z.type === 'dancer') {
    const mW = Z.headRX * 0.42
    const mH = Z.headRY * 0.28
    ctx.fillStyle = PZ.MOUTH
    ctx.beginPath()
    ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2)
    ctx.fill()
    pen.set(ctx, PZ.MOUTH_OUT, pen.w(STROKE.LIP))
    ctx.stroke()
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = COLORS.Z_DN_TONGUE
    ctx.beginPath()
    ctx.ellipse(0, Z.mouthY + mH * 0.55, mW * 0.52, mH * 0.50, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = PZ.TEETH
    const teeth: Array<[number, number, number]> = [[-0.60, 0.26, 0.46], [-0.24, 0.28, 0.66], [0.08, 0.27, 0.52], [0.42, 0.24, 0.40]]
    for (const [tx, tw, th] of teeth) {
      ctx.beginPath()
      safeRoundRect(ctx, mW * tx, Z.mouthY - mH * 0.86, mW * tw, mH * th, mW * 0.07)
      ctx.fill()
    }
  }

  ctx.fillStyle = 'rgba(56,20,15,0.55)'
  ctx.beginPath()
  ctx.arc(-U * 0.045, Z.mouthY - Z.headRY * 0.22, U * 0.022, 0, Math.PI * 2)
  ctx.arc(U * 0.045, Z.mouthY - Z.headRY * 0.22, U * 0.022, 0, Math.PI * 2)
  ctx.fill()
}

// ============ 橄榄球面罩格栅（最后绘制罩嘴部之上） ============
function cage(Z: ZState, pen: Pen) {
  if (Z.type !== 'football') return
  const { ctx, U } = Z
  pen.set(ctx, COLORS.Z_FH_CAGE, pen.w(STROKE.THIN) * 1.35)
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * Z.headRX * 0.56, Z.mouthY + U * 0.14)
    ctx.quadraticCurveTo(s * Z.headRX * 0.80, Z.mouthY - U * 0.10, s * Z.headRX * 0.90, Z.headCY + U * 0.06)
    ctx.stroke()
  }
  pen.set(ctx, COLORS.Z_FH_CAGE, pen.w(STROKE.THIN) * 1.15)
  for (const [y1, y2] of [
    [Z.mouthY - U * 0.06, Z.mouthY + U * 0.01],
    [Z.mouthY + U * 0.12, Z.mouthY + U * 0.19],
  ] as Array<[number, number]>) {
    ctx.beginPath()
    ctx.moveTo(-Z.headRX * 0.52, y1)
    ctx.quadraticCurveTo(0, y2, Z.headRX * 0.52, y1)
    ctx.stroke()
  }
  pen.set(ctx, COLORS.Z_FH_CAGE, pen.w(STROKE.THIN))
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * Z.headRX * 0.18, Z.mouthY - U * 0.10)
    ctx.lineTo(s * Z.headRX * 0.16, Z.mouthY + U * 0.22)
    ctx.stroke()
  }
  mainStroke(ctx, pen)
}
