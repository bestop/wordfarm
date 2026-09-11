// src/game/painters/zombiePainter.ts - 僵尸离屏插画绘制（v56 zombiePainter.js 移植）
// 每种僵尸只绘制一次到离屏画布（dpr × 2 超采样），主循环 drawImage 复用
//   · 阵营区分：暗色描边 Z_STROKE + 哑光微高光（与植物白描边阵营对立）
//   · 分阶段：setup → sack → cape → arms → torso → shoulders → legs → head
//             → headgear → face → faceVariants → cage
import type { ZombieType } from '../constants'
import {
  COLORS, STROKE, Z_FACE, Z_BODY, HEAD, OFFSCREEN, Pen,
  safeRoundRect, type Ctx2D,
} from './tokens'

export interface ZombieSprite {
  canvas: OffscreenCanvas | HTMLCanvasElement
  size: number // 逻辑尺寸（css px，僵尸居中）
}

const UNIT = 50 // 基准单位（全部比例基于此）

interface ZState {
  type: ZombieType
  ctx: Ctx2D
  canvas: OffscreenCanvas | HTMLCanvasElement
  U: number
  skin: string
  headCY: number
  headR: number
  bodyW: number
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
  return { canvas: Z.canvas, size: UNIT * 2.8 }
}

// ============ 画布建立 + 超采样 + 描边基准 + 地面阴影 ============
function setup(type: ZombieType, dpr: number, skin: string, pen: Pen): ZState | null {
  const ss = Math.max(0.5, dpr) * OFFSCREEN.SUPERSAMPLE
  const size = UNIT * 2.8
  const canvas = makeCanvas(Math.round(size * ss), Math.round(size * ss))
  if (!canvas) return null
  const ctx = canvas.getContext('2d') as Ctx2D | null
  if (!ctx) return null
  ctx.scale(ss, ss)
  ctx.translate(size / 2, size / 2)

  pen.setBase(UNIT)
  pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.MAIN))

  // 地面阴影（与植物统一 Tokens 色）
  ctx.fillStyle = COLORS.SHADOW
  ctx.beginPath()
  ctx.ellipse(0, UNIT * 1.12, UNIT * 0.72, UNIT * 0.22, 0, 0, Math.PI * 2)
  ctx.fill()

  return { type, ctx, canvas, U: UNIT, skin, headCY: 0, headR: 0, bodyW: 0, eyeY: 0, eyeDX: 0, eyeR: 0, mouthY: 0 }
}

// ============ 小鬼肩挎麻袋（先于手臂/头绘制） ============
function sack(Z: ZState, pen: Pen) {
  if (Z.type !== 'imp') return
  const { ctx, U } = Z
  ctx.save()
  ctx.translate(-U * 0.7, U * 0.05)
  ctx.rotate(-0.4)
  // 袋颈（束口窄梯形）
  ctx.fillStyle = COLORS.Z_SACK
  ctx.beginPath()
  ctx.moveTo(-U * 0.085, -U * 0.38)
  ctx.lineTo(U * 0.085, -U * 0.38)
  ctx.lineTo(U * 0.11, -U * 0.22)
  ctx.lineTo(-U * 0.11, -U * 0.22)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  // 袋身（圆润鼓肚，粗麻渐变收暗）
  const sGrad = ctx.createLinearGradient(0, -U * 0.22, 0, U * 0.3)
  sGrad.addColorStop(0, COLORS.Z_SACK)
  sGrad.addColorStop(0.72, COLORS.Z_SACK)
  sGrad.addColorStop(1, COLORS.Z_SACK_DARK)
  ctx.fillStyle = sGrad
  ctx.beginPath()
  ctx.moveTo(-U * 0.11, -U * 0.22)
  ctx.bezierCurveTo(-U * 0.25, -U * 0.1, -U * 0.26, U * 0.14, -U * 0.15, U * 0.27)
  ctx.quadraticCurveTo(0, U * 0.36, U * 0.15, U * 0.25)
  ctx.bezierCurveTo(U * 0.26, U * 0.12, U * 0.25, -U * 0.08, U * 0.11, -U * 0.22)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  // 束绳 2 道 + 左侧绳结
  ctx.fillStyle = COLORS.Z_SACK_DARK
  ctx.fillRect(-U * 0.125, -U * 0.23, U * 0.25, U * 0.04)
  ctx.fillRect(-U * 0.117, -U * 0.165, U * 0.234, U * 0.035)
  ctx.beginPath()
  ctx.arc(-U * 0.125, -U * 0.2, U * 0.055, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  // 竖向缝线 ×2 + 右下补丁
  ctx.globalAlpha = 0.45
  pen.set(ctx, COLORS.Z_SACK_DARK, pen.w(STROKE.THIN))
  for (const sx of [-U * 0.08, U * 0.06]) {
    ctx.beginPath()
    ctx.moveTo(sx, -U * 0.1)
    ctx.lineTo(sx, U * 0.2)
    ctx.stroke()
  }
  ctx.globalAlpha = 0.55
  ctx.fillStyle = COLORS.Z_SACK_DARK
  safeRoundRect(ctx, U * 0.01, U * 0.07, U * 0.14, U * 0.12, U * 0.02)
  ctx.fill()
  ctx.globalAlpha = 1
  pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.MAIN))
  ctx.restore()
}

// ============ 僵尸王皇家深红斗篷（先于身体绘制） ============
function cape(Z: ZState, pen: Pen) {
  if (Z.type !== 'king') return
  const { ctx, U } = Z
  const capeW = U * 0.72
  const capeTop = U * 0.06
  const capeBot = U * 0.86
  const cpGrad = ctx.createLinearGradient(-capeW, 0, capeW, 0)
  cpGrad.addColorStop(0, COLORS.Z_KING_CAPE)
  cpGrad.addColorStop(0.55, COLORS.Z_KING_CAPE)
  cpGrad.addColorStop(1, COLORS.Z_KING_CAPE_DARK)
  ctx.fillStyle = cpGrad
  ctx.beginPath()
  ctx.moveTo(-capeW * 0.6, capeTop)
  ctx.quadraticCurveTo(-capeW, capeBot * 0.55, -capeW * 0.82, capeBot)
  ctx.lineTo(-capeW * 0.26, capeBot - U * 0.1)
  ctx.lineTo(0, capeBot)
  ctx.lineTo(capeW * 0.26, capeBot - U * 0.1)
  ctx.lineTo(capeW * 0.82, capeBot)
  ctx.quadraticCurveTo(capeW, capeBot * 0.55, capeW * 0.6, capeTop)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  // 肩扣 ×2（金圆点）
  ctx.fillStyle = COLORS.Z_KING_GOLD
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(s * U * 0.4, U * 0.16, U * 0.08, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
  }
}

// ============ 小手臂 + 袖口 + 手掌 ============
function arms(Z: ZState, pen: Pen) {
  const { ctx, U } = Z
  const bodyW = Z.type === 'bucket' ? Z_BODY.BUCKET_BODY_W
    : Z.type === 'imp' ? Z_BODY.IMP_BODY_W
    : Z.type === 'football' ? Z_BODY.FOOTBALL_BODY_W
    : Z.type === 'king' ? Z_BODY.KING_BODY_W : Z_BODY.DANCER_BODY_W
  const armLen = Z.type === 'bucket' ? Z_BODY.BUCKET_ARM_LEN
    : Z.type === 'imp' ? Z_BODY.IMP_ARM_LEN
    : Z.type === 'football' ? Z_BODY.FOOTBALL_ARM_LEN
    : Z.type === 'king' ? Z_BODY.KING_ARM_LEN : Z_BODY.DANCER_ARM_LEN
  Z.bodyW = bodyW
  const armX = U * (bodyW + 0.14)
  const armY = Z.type === 'imp' ? U * 0.32 : U * 0.35
  const armRot = Z.type === 'imp' ? 0.18 : Z.type === 'dancer' ? 0.5 : Z.type === 'king' ? 0.3 : 0.35
  ctx.fillStyle = Z.type === 'bucket' ? COLORS.Z_SHIRT
    : Z.type === 'imp' ? COLORS.Z_HOOD
    : Z.type === 'football' ? COLORS.Z_FH_JERSEY
    : Z.type === 'dancer' ? COLORS.Z_DN_SUIT
    : COLORS.Z_KING_ROBE
  ctx.beginPath()
  ctx.ellipse(-armX, armY, U * 0.18, U * armLen, -armRot, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(armX, armY, U * 0.18, U * armLen, armRot, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  // 袖口（深一档环）+ 手掌（僵尸绿）
  const cuffFill = Z.type === 'bucket' ? COLORS.Z_SHIRT_DARK
    : Z.type === 'imp' ? COLORS.Z_HOOD_DARK
    : Z.type === 'dancer' ? COLORS.Z_DN_SHIRT
    : Z.type === 'king' ? COLORS.Z_KING_GOLD : COLORS.Z_FH_WRIST
  for (const side of [-1, 1]) {
    const rot = side < 0 ? -armRot : armRot
    const ex = side * armX + Math.sin(rot) * U * armLen
    const ey = armY + Math.cos(rot) * U * armLen
    ctx.fillStyle = cuffFill
    ctx.beginPath()
    ctx.ellipse(ex - Math.sin(rot) * U * 0.07, ey - Math.cos(rot) * U * 0.07,
      U * 0.115, U * 0.075, rot, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = Z.skin
    ctx.beginPath()
    ctx.arc(ex + Math.sin(rot) * U * 0.015, ey + Math.cos(rot) * U * 0.015, U * 0.1, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
  }
}

// ============ 身体主体（按类型差异化：衬衫/长袍/球衣/王袍/西装） ============
function torso(Z: ZState, pen: Pen) {
  const { ctx, U } = Z
  const robeW = Z.type === 'imp' ? 0.36 : Z.bodyW
  const robeH = Z.type === 'imp' ? 0.64 : Z.type === 'dancer' ? 0.62
    : Z.type === 'king' ? 0.64 : 0.55
  const torsoFill = Z.type === 'bucket' ? COLORS.Z_SHIRT
    : Z.type === 'imp' ? COLORS.Z_HOOD
    : Z.type === 'football' ? COLORS.Z_FH_JERSEY
    : Z.type === 'dancer' ? COLORS.Z_DN_SUIT
    : COLORS.Z_KING_ROBE
  ctx.fillStyle = torsoFill
  ctx.beginPath()
  safeRoundRect(ctx, -U * robeW, U * 0.12, U * robeW * 2, U * robeH, U * 0.28)
  ctx.fill(); ctx.stroke()

  if (Z.type === 'bucket') {
    // 右侧衣影 + 下摆撕裂 ×3 + 胸口袋
    ctx.save()
    ctx.beginPath()
    safeRoundRect(ctx, -U * Z.bodyW, U * 0.12, U * Z.bodyW * 2, U * 0.55, U * 0.28)
    ctx.clip()
    ctx.globalAlpha = 0.5
    ctx.fillStyle = COLORS.Z_SHIRT_DARK
    ctx.fillRect(U * Z.bodyW * 0.3, U * 0.1, U * Z.bodyW * 0.8, U * 0.6)
    ctx.globalAlpha = 1
    ctx.restore()
    ctx.fillStyle = COLORS.Z_SHIRT_DARK
    const hemY = U * 0.67
    for (const [tx, tw] of [[-0.26, 0.15], [-0.03, 0.18], [0.2, 0.13]] as const) {
      ctx.beginPath()
      ctx.moveTo(U * (tx - tw / 2), hemY - U * 0.02)
      ctx.lineTo(U * (tx + tw / 2), hemY - U * 0.02)
      ctx.lineTo(U * tx, hemY + U * 0.1)
      ctx.closePath()
      ctx.fill()
    }
    ctx.globalAlpha = 0.8
    ctx.beginPath()
    safeRoundRect(ctx, -U * 0.26, U * 0.22, U * 0.17, U * 0.13, U * 0.025)
    ctx.fill()
    ctx.globalAlpha = 1
    pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.THIN))
    ctx.stroke()
    pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.MAIN))
  }
  if (Z.type === 'imp') {
    // 破袍：右袍影 + 竖褶线 ×2 + 左下补丁 + 下摆撕裂 + 短靴
    ctx.save()
    ctx.beginPath()
    safeRoundRect(ctx, -U * robeW, U * 0.12, U * robeW * 2, U * robeH, U * 0.28)
    ctx.clip()
    ctx.globalAlpha = 0.45
    ctx.fillStyle = COLORS.Z_HOOD_DARK
    ctx.fillRect(U * robeW * 0.35, U * 0.1, U * robeW * 0.8, U * 0.7)
    ctx.globalAlpha = 1
    ctx.restore()
    pen.set(ctx, COLORS.Z_HOOD_DARK, pen.w(STROKE.THIN))
    for (const fx of [-U * 0.1, U * 0.05]) {
      ctx.beginPath()
      ctx.moveTo(fx, U * 0.32)
      ctx.quadraticCurveTo(fx + U * 0.02, U * 0.52, fx - U * 0.02, U * 0.7)
      ctx.stroke()
    }
    ctx.globalAlpha = 0.8
    ctx.fillStyle = COLORS.Z_HOOD_LIGHT
    safeRoundRect(ctx, -U * 0.3, U * 0.36, U * 0.13, U * 0.1, U * 0.02)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.stroke()
    pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.MAIN))
    ctx.fillStyle = COLORS.Z_HOOD_DARK
    const hemY = U * 0.76
    for (const [tx, tw] of [[-0.22, 0.14], [-0.02, 0.17], [0.18, 0.12]] as const) {
      ctx.beginPath()
      ctx.moveTo(U * (tx - tw / 2), hemY - U * 0.02)
      ctx.lineTo(U * (tx + tw / 2), hemY - U * 0.02)
      ctx.lineTo(U * tx, hemY + U * 0.11)
      ctx.closePath()
      ctx.fill()
    }
    // 短靴 ×2（袍长及踝，靴从袍摆下探出）
    ctx.fillStyle = COLORS.Z_HOOD_DARK
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(s * U * 0.15, U * 0.84, U * 0.095, U * 0.08, 0, 0, Math.PI * 2)
      ctx.fill(); ctx.stroke()
    }
  }
  if (Z.type === 'football') {
    // 球衣：右衣影 + 竖褶线 ×2 + 下摆撕裂 ×3
    ctx.save()
    ctx.beginPath()
    safeRoundRect(ctx, -U * Z.bodyW, U * 0.12, U * Z.bodyW * 2, U * 0.55, U * 0.28)
    ctx.clip()
    ctx.globalAlpha = 0.5
    ctx.fillStyle = COLORS.Z_FH_JERSEY_DARK
    ctx.fillRect(U * Z.bodyW * 0.3, U * 0.1, U * Z.bodyW * 0.8, U * 0.6)
    ctx.globalAlpha = 1
    ctx.restore()
    pen.set(ctx, COLORS.Z_FH_JERSEY_DARK, pen.w(STROKE.THIN))
    for (const fx of [-U * 0.12, U * 0.07]) {
      ctx.beginPath()
      ctx.moveTo(fx, U * 0.5)
      ctx.quadraticCurveTo(fx + U * 0.02, U * 0.6, fx - U * 0.02, U * 0.7)
      ctx.stroke()
    }
    pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.MAIN))
    ctx.fillStyle = COLORS.Z_FH_JERSEY_DARK
    const hemY = U * 0.67
    for (const [tx, tw] of [[-0.28, 0.16], [-0.05, 0.18], [0.2, 0.15]] as const) {
      ctx.beginPath()
      ctx.moveTo(U * (tx - tw / 2), hemY - U * 0.02)
      ctx.lineTo(U * (tx + tw / 2), hemY - U * 0.02)
      ctx.lineTo(U * tx, hemY + U * 0.1)
      ctx.closePath()
      ctx.fill()
    }
  }
  if (Z.type === 'king') {
    // 王袍：右衣影 + 金腰带 + 红宝石扣 + 下摆撕裂 ×3
    ctx.save()
    ctx.beginPath()
    safeRoundRect(ctx, -U * robeW, U * 0.12, U * robeW * 2, U * robeH, U * 0.28)
    ctx.clip()
    ctx.globalAlpha = 0.5
    ctx.fillStyle = COLORS.Z_KING_ROBE_DARK
    ctx.fillRect(U * robeW * 0.3, U * 0.1, U * robeW * 0.8, U * 0.7)
    ctx.globalAlpha = 1
    ctx.restore()
    ctx.fillStyle = COLORS.Z_KING_GOLD
    safeRoundRect(ctx, -U * 0.4, U * 0.55, U * 0.8, U * 0.1, U * 0.03)
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = COLORS.Z_KING_GEM
    ctx.beginPath()
    ctx.arc(0, U * 0.6, U * 0.055, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = COLORS.Z_KING_ROBE_DARK
    const hemK = U * 0.75
    for (const [tx, tw] of [[-0.28, 0.16], [-0.04, 0.18], [0.22, 0.14]] as const) {
      ctx.beginPath()
      ctx.moveTo(U * (tx - tw / 2), hemK - U * 0.02)
      ctx.lineTo(U * (tx + tw / 2), hemK - U * 0.02)
      ctx.lineTo(U * tx, hemK + U * 0.1)
      ctx.closePath()
      ctx.fill()
    }
  }
  // 肚皮高光（僵尸哑光）
  ctx.fillStyle = COLORS.Z_HIGHLIGHT
  ctx.beginPath()
  ctx.ellipse(-U * 0.14, U * 0.28, U * 0.16, U * 0.26, -0.5, 0, Math.PI * 2)
  ctx.fill()

  if (Z.type === 'dancer') {
    // 破紫西装：右衣影 + 衬衫V + 驳领×2 + 领带 + 斜纹×2 + 单纽扣 + 下摆撕裂×3
    ctx.save()
    ctx.beginPath()
    safeRoundRect(ctx, -U * Z.bodyW, U * 0.12, U * Z.bodyW * 2, U * robeH, U * 0.28)
    ctx.clip()
    ctx.globalAlpha = 0.5
    ctx.fillStyle = COLORS.Z_DN_SUIT_DARK
    ctx.fillRect(U * Z.bodyW * 0.3, U * 0.1, U * Z.bodyW * 0.8, U * 0.7)
    ctx.globalAlpha = 1
    ctx.restore()
    // 衬衫 V 区
    ctx.fillStyle = COLORS.Z_DN_SHIRT
    ctx.beginPath()
    ctx.moveTo(-U * 0.19, U * 0.46)
    ctx.lineTo(U * 0.19, U * 0.46)
    ctx.lineTo(U * 0.06, U * 0.6)
    ctx.lineTo(-U * 0.06, U * 0.6)
    ctx.closePath()
    ctx.fill()
    pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.THIN))
    ctx.stroke()
    // 驳领 ×2（细描边防吞小填充）
    pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.THIN) * 0.8)
    ctx.fillStyle = COLORS.Z_DN_SUIT_DARK
    ctx.beginPath()
    ctx.moveTo(-U * 0.24, U * 0.45)
    ctx.lineTo(-U * 0.085, U * 0.45)
    ctx.lineTo(-U * 0.02, U * 0.57)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(U * 0.24, U * 0.45)
    ctx.lineTo(U * 0.085, U * 0.45)
    ctx.lineTo(U * 0.02, U * 0.57)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    // 领带 + 小结
    ctx.fillStyle = COLORS.Z_DN_TIE
    ctx.beginPath()
    ctx.moveTo(-U * 0.082, U * 0.525)
    ctx.lineTo(U * 0.082, U * 0.525)
    ctx.lineTo(U * 0.072, U * 0.67)
    ctx.lineTo(-U * 0.072, U * 0.67)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-U * 0.085, U * 0.475)
    ctx.lineTo(U * 0.085, U * 0.475)
    ctx.lineTo(U * 0.105, U * 0.53)
    ctx.lineTo(-U * 0.105, U * 0.53)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    // 领带米白斜纹 ×2
    pen.set(ctx, COLORS.Z_DN_SHIRT, pen.w(STROKE.THIN) * 0.8)
    for (const ty of [U * 0.555, U * 0.615]) {
      ctx.beginPath()
      ctx.moveTo(-U * 0.062, ty + U * 0.028)
      ctx.lineTo(U * 0.062, ty - U * 0.028)
      ctx.stroke()
    }
    pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.MAIN))
    // 单纽扣
    ctx.fillStyle = COLORS.Z_DN_SUIT_DARK
    ctx.beginPath()
    ctx.arc(0, U * 0.705, U * 0.033, 0, Math.PI * 2)
    ctx.fill()
    // 下摆撕裂 ×3
    ctx.fillStyle = COLORS.Z_DN_SUIT_DARK
    const hemY = U * 0.74
    for (const [tx, tw] of [[-0.26, 0.15], [-0.03, 0.18], [0.21, 0.13]] as const) {
      ctx.beginPath()
      ctx.moveTo(U * (tx - tw / 2), hemY - U * 0.02)
      ctx.lineTo(U * (tx + tw / 2), hemY - U * 0.02)
      ctx.lineTo(U * tx, hemY + U * 0.1)
      ctx.closePath()
      ctx.fill()
    }
  }
}

// ============ 橄榄球护肩 ×2 ============
function shoulders(Z: ZState, pen: Pen) {
  if (Z.type !== 'football') return
  const { ctx, U } = Z
  for (const s of [-1, 1]) {
    const px = s * U * 0.64
    const py = U * 0.2
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
    // 甲片缝线弧
    pen.set(ctx, COLORS.Z_FH_RED_DARK, pen.w(STROKE.THIN))
    ctx.beginPath()
    ctx.ellipse(px, py, prx * 0.74, pry * 0.64, s * 0.18, Math.PI * 0.15, Math.PI * 0.85)
    ctx.stroke()
    // 顶部受光高光
    ctx.fillStyle = 'rgba(255,255,255,0.30)'
    ctx.beginPath()
    ctx.ellipse(px - prx * 0.34, py - pry * 0.42, prx * 0.3, pry * 0.26, s * -0.3, 0, Math.PI * 2)
    ctx.fill()
    pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.MAIN))
  }
}

// ============ 腿 + 靴 ============
function legs(Z: ZState, pen: Pen) {
  const { ctx, U } = Z
  const legW = Z.type === 'bucket' ? Z_BODY.BUCKET_LEG_W
    : Z.type === 'imp' ? Z_BODY.IMP_LEG_W
    : Z.type === 'football' ? Z_BODY.FOOTBALL_LEG_W
    : Z.type === 'king' ? Z_BODY.KING_LEG_W : Z_BODY.DANCER_LEG_W
  if (Z.type !== 'imp') {
    ctx.fillStyle = Z.type === 'bucket' ? COLORS.Z_PANTS
      : Z.type === 'football' ? COLORS.Z_FH_JERSEY
      : Z.type === 'dancer' ? COLORS.Z_DN_SUIT
      : Z.type === 'king' ? COLORS.Z_KING_ROBE_DARK : Z.skin
    ctx.beginPath()
    ctx.ellipse(-U * 0.2, U * 0.8, U * legW, U * 0.14, 0, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(U * 0.2, U * 0.8, U * legW, U * 0.14, 0, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
  }
  if (Z.type === 'bucket') {
    ctx.fillStyle = COLORS.Z_BOOT
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(s * U * 0.27, U * 0.84, U * 0.105, U * 0.095, 0, 0, Math.PI * 2)
      ctx.fill(); ctx.stroke()
    }
  }
  if (Z.type === 'football') {
    // 短裤侧条纹 + 橄榄球鞋
    pen.set(ctx, COLORS.Z_FH_STRIPE, pen.w(STROKE.THIN))
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(s * U * 0.36, U * 0.72)
      ctx.quadraticCurveTo(s * U * 0.41, U * 0.8, s * U * 0.35, U * 0.88)
      ctx.stroke()
    }
    pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.MAIN))
    ctx.fillStyle = COLORS.Z_FH_CLEAT
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(s * U * 0.27, U * 0.85, U * 0.11, U * 0.095, 0, 0, Math.PI * 2)
      ctx.fill(); ctx.stroke()
    }
  }
  if (Z.type === 'dancer') {
    ctx.fillStyle = COLORS.Z_DN_SHOE
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(s * U * 0.25, U * 0.85, U * 0.115, U * 0.09, s * 0.12, 0, Math.PI * 2)
      ctx.fill(); ctx.stroke()
    }
  }
  if (Z.type === 'king') {
    // 暗红战靴 ×2（金环靴口）
    ctx.fillStyle = COLORS.Z_KING_CAPE_DARK
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(s * U * 0.26, U * 0.85, U * 0.12, U * 0.1, 0, 0, Math.PI * 2)
      ctx.fill(); ctx.stroke()
    }
    ctx.fillStyle = COLORS.Z_KING_GOLD
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(s * U * 0.26, U * 0.78, U * 0.085, U * 0.035, 0, 0, Math.PI * 2)
      ctx.fill(); ctx.stroke()
    }
  }
}

// ============ Q 版大头 + 头顶哑光高光 ============
function head(Z: ZState, pen: Pen) {
  const { ctx, U } = Z
  Z.headCY = U * HEAD.ZOMBIE_HEAD_CY
  Z.headR = U * HEAD.ZOMBIE_HEAD_R
  ctx.fillStyle = Z.skin
  ctx.beginPath()
  ctx.arc(0, Z.headCY, Z.headR, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = COLORS.Z_HIGHLIGHT
  ctx.beginPath()
  ctx.ellipse(Z.headR * HEAD.HLIGHT_X, Z.headCY + Z.headR * HEAD.HLIGHT_Y,
    Z.headR * HEAD.HLIGHT_W, Z.headR * HEAD.HLIGHT_H, HEAD.HLIGHT_ROT, 0, Math.PI * 2)
  ctx.fill()
}

// ============ 头顶装饰（铁桶/破兜帽/高顶礼帽/头盔/黄金王冠） ============
function headgear(Z: ZState, pen: Pen) {
  const { ctx, U } = Z
  if (Z.type === 'bucket') {
    // 金属铁桶：上窄下宽圆台 + 高光带 + 厚底缘环 + D 形吊耳 + V 形锈缺口 + 锈斑 ×3
    const bTop = Z.headCY - Z.headR * 1.69
    const bBot = Z.headCY - Z.headR * 0.52
    const bHalfTop = Z.headR * 0.62
    const bHalfBot = Z.headR * 1.02
    const bGrad = ctx.createLinearGradient(-bHalfBot, 0, bHalfBot, 0)
    bGrad.addColorStop(0, COLORS.Z_BUCKET_LIGHT)
    bGrad.addColorStop(0.45, COLORS.Z_BUCKET)
    bGrad.addColorStop(1, COLORS.Z_BUCKET_DARK)
    ctx.fillStyle = bGrad
    ctx.beginPath()
    ctx.moveTo(-bHalfTop, bTop)
    ctx.lineTo(bHalfTop, bTop)
    ctx.lineTo(bHalfBot, bBot - Z.headR * 0.06)
    ctx.quadraticCurveTo(0, bBot + Z.headR * 0.07, -bHalfBot, bBot - Z.headR * 0.06)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    // 左侧竖向金属高光带
    ctx.fillStyle = 'rgba(255,255,255,0.30)'
    ctx.beginPath()
    ctx.ellipse(-bHalfBot * 0.44, bTop + Z.headR * 0.6, Z.headR * 0.1, Z.headR * 0.34, -0.06, 0, Math.PI * 2)
    ctx.fill()
    // 厚底缘环带
    ctx.fillStyle = COLORS.Z_BUCKET_DARK
    ctx.beginPath()
    ctx.moveTo(-bHalfBot * 1.04, bBot - Z.headR * 0.1)
    ctx.lineTo(bHalfBot * 1.04, bBot - Z.headR * 0.1)
    ctx.quadraticCurveTo(0, bBot + Z.headR * 0.07, -bHalfBot * 1.04, bBot - Z.headR * 0.1)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    // 两侧 D 形吊耳
    const hy = bTop + (bBot - bTop) * 0.4
    const hwHy = bHalfTop + (bHalfBot - bHalfTop) * 0.4
    for (const s of [-1, 1]) {
      ctx.fillStyle = COLORS.Z_BUCKET_DARK
      ctx.beginPath()
      ctx.ellipse(s * (hwHy + Z.headR * 0.02), hy, Z.headR * 0.16, Z.headR * 0.24, s * 0.22, 0, Math.PI * 2)
      ctx.fill(); ctx.stroke()
      ctx.fillStyle = COLORS.Z_BUCKET_LIGHT
      ctx.beginPath()
      ctx.ellipse(s * (hwHy + Z.headR * 0.02), hy, Z.headR * 0.07, Z.headR * 0.13, s * 0.22, 0, Math.PI * 2)
      ctx.fill()
    }
    // 顶部 V 形锈缺口 + 锈斑 ×3
    ctx.fillStyle = COLORS.Z_RUST
    ctx.beginPath()
    ctx.moveTo(-Z.headR * 0.16, bTop - Z.headR * 0.02)
    ctx.lineTo(Z.headR * 0.16, bTop - Z.headR * 0.02)
    ctx.lineTo(0, bTop + Z.headR * 0.17)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    for (const [rx, ry, rw, rh, rr] of [
      [bHalfTop * 0.5, bTop + Z.headR * 0.12, 0.17, 0.1, 0.45],
      [bHalfBot * 0.55, bBot - Z.headR * 0.32, 0.14, 0.09, -0.3],
      [-bHalfBot * 0.6, bBot - Z.headR * 0.18, 0.11, 0.075, 0.2],
    ] as const) {
      ctx.beginPath()
      ctx.ellipse(rx, ry, Z.headR * rw, Z.headR * rh, rr, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (Z.type === 'imp') {
    // 破兜帽：罩头顶 + 波浪内缘 + 渐变 + 竖褶线 ×2 + V 撕裂口 + 乱发
    const hcY = Z.headCY + Z.headR * 0.02
    const hR1 = Z.headR * 1.1
    const wy = Z.headCY - Z.headR * 0.52
    const hGrad = ctx.createLinearGradient(-Z.headR * 0.9, wy - Z.headR * 0.55, Z.headR * 0.95, Z.headCY + Z.headR * 0.1)
    hGrad.addColorStop(0, COLORS.Z_HOOD_LIGHT)
    hGrad.addColorStop(0.55, COLORS.Z_HOOD)
    hGrad.addColorStop(1, COLORS.Z_HOOD_DARK)
    ctx.fillStyle = hGrad
    ctx.beginPath()
    ctx.arc(0, hcY, hR1, Math.PI * 1.07, Math.PI * 1.93)
    ctx.lineTo(Z.headR * 0.84, wy - Z.headR * 0.03)
    ctx.quadraticCurveTo(Z.headR * 0.45, wy + Z.headR * 0.09, Z.headR * 0.12, wy - Z.headR * 0.01)
    ctx.quadraticCurveTo(-Z.headR * 0.2, wy + Z.headR * 0.1, -Z.headR * 0.55, wy)
    ctx.quadraticCurveTo(-Z.headR * 0.8, wy - Z.headR * 0.06, -Z.headR * 0.84, wy - Z.headR * 0.03)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    // 兜帽竖褶线 ×2
    pen.set(ctx, COLORS.Z_HOOD_DARK, pen.w(STROKE.THIN))
    ctx.beginPath()
    ctx.moveTo(-Z.headR * 0.28, Z.headCY - Z.headR * 0.86)
    ctx.quadraticCurveTo(-Z.headR * 0.55, Z.headCY - Z.headR * 0.7, -Z.headR * 0.66, Z.headCY - Z.headR * 0.44)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(Z.headR * 0.3, Z.headCY - Z.headR * 0.84)
    ctx.quadraticCurveTo(Z.headR * 0.58, Z.headCY - Z.headR * 0.64, Z.headR * 0.64, Z.headCY - Z.headR * 0.42)
    ctx.stroke()
    pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.MAIN))
    // 左缘 V 形撕裂口
    ctx.fillStyle = COLORS.Z_HOOD_DARK
    ctx.beginPath()
    ctx.moveTo(-hR1 * 0.965, Z.headCY - Z.headR * 0.4)
    ctx.lineTo(-hR1 * 0.82, Z.headCY - Z.headR * 0.26)
    ctx.lineTo(-hR1 * 0.965, Z.headCY - Z.headR * 0.14)
    ctx.closePath()
    ctx.fill()
    // 黑色乱发：额前 2 缕 + 右侧 1 撇
    pen.set(ctx, COLORS.INK, pen.w(STROKE.THIN))
    ctx.beginPath()
    ctx.moveTo(-Z.headR * 0.3, wy + Z.headR * 0.02)
    ctx.quadraticCurveTo(-Z.headR * 0.36, wy + Z.headR * 0.08, -Z.headR * 0.24, wy + Z.headR * 0.13)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(Z.headR * 0.22, wy + Z.headR * 0.02)
    ctx.quadraticCurveTo(Z.headR * 0.28, wy + Z.headR * 0.08, Z.headR * 0.19, wy + Z.headR * 0.12)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(Z.headR * 0.78, Z.headCY - Z.headR * 0.36)
    ctx.quadraticCurveTo(Z.headR, Z.headCY - Z.headR * 0.36, Z.headR * 1.13, Z.headCY - Z.headR * 0.22)
    ctx.stroke()
    pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.MAIN))
  } else if (Z.type === 'dancer') {
    // 黑高顶礼帽：直筒帽冠 + 宽平帽檐，歪戴 -0.10 rad
    ctx.save()
    ctx.translate(0, Z.headCY - Z.headR * 0.46)
    ctx.rotate(-0.1)
    const brimHalf = Z.headR * 0.95
    const brimH = Z.headR * 0.13
    const cHalf = Z.headR * 0.52
    const cH = Z.headR * 0.82
    const cGrad = ctx.createLinearGradient(-cHalf, 0, cHalf, 0)
    cGrad.addColorStop(0, COLORS.Z_DN_HAT_LIGHT)
    cGrad.addColorStop(0.38, COLORS.Z_DN_HAT)
    cGrad.addColorStop(1, COLORS.Z_DN_HAT_DARK)
    ctx.fillStyle = cGrad
    ctx.beginPath()
    safeRoundRect(ctx, -cHalf, -cH, cHalf * 2, cH + Z.headR * 0.05, Z.headR * 0.09)
    ctx.fill(); ctx.stroke()
    // 帽冠左上受光竖带
    ctx.fillStyle = 'rgba(255,255,255,0.20)'
    ctx.beginPath()
    ctx.ellipse(-cHalf * 0.52, -cH * 0.46, Z.headR * 0.09, cH * 0.28, 0.1, 0, Math.PI * 2)
    ctx.fill()
    // 帽檐（后画盖住冠底缘）
    ctx.fillStyle = COLORS.Z_DN_HAT_DARK
    ctx.beginPath()
    ctx.ellipse(0, 0, brimHalf, brimH, 0, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
    ctx.restore()
    pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.MAIN))
  } else if (Z.type === 'football') {
    // 橄榄球头盔：红色圆顶穹壳 + 奶油中条纹 + 眉缘缓冲条 + 侧气孔 + 高光带
    const domeR = Z.headR * 0.95
    const hGrad = ctx.createLinearGradient(-domeR, 0, domeR, 0)
    hGrad.addColorStop(0, COLORS.Z_FH_RED_LIGHT)
    hGrad.addColorStop(0.5, COLORS.Z_FH_RED)
    hGrad.addColorStop(1, COLORS.Z_FH_RED_DARK)
    ctx.fillStyle = hGrad
    ctx.beginPath()
    ctx.arc(0, Z.headCY, domeR, Math.PI * 1.02, Math.PI * 1.98)
    ctx.lineTo(Z.headR * 0.92, Z.headCY)
    ctx.lineTo(-Z.headR * 0.92, Z.headCY)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    // 中条纹
    const sHalf = Z.headR * 0.21
    ctx.fillStyle = COLORS.Z_FH_STRIPE
    ctx.beginPath()
    ctx.moveTo(-sHalf * 0.55, Z.headCY - domeR * 0.985)
    ctx.quadraticCurveTo(-sHalf, Z.headCY - domeR * 0.45, -sHalf, Z.headCY - Z.headR * 0.04)
    ctx.lineTo(sHalf, Z.headCY - Z.headR * 0.04)
    ctx.quadraticCurveTo(sHalf, Z.headCY - domeR * 0.45, sHalf * 0.55, Z.headCY - domeR * 0.985)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    // 眉缘缓冲条
    ctx.fillStyle = COLORS.Z_FH_RED_DARK
    safeRoundRect(ctx, -Z.headR * 0.95, Z.headCY - Z.headR * 0.14, Z.headR * 1.9, Z.headR * 0.11, Z.headR * 0.045)
    ctx.fill(); ctx.stroke()
    // 侧气孔 ×1 每侧
    ctx.fillStyle = COLORS.Z_FH_RED_DARK
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(s * Z.headR * 0.6, Z.headCY - Z.headR * 0.45, Z.headR * 0.055, 0, Math.PI * 2)
      ctx.fill()
    }
    // 盔体左上高光带
    ctx.fillStyle = 'rgba(255,255,255,0.30)'
    ctx.beginPath()
    ctx.ellipse(-Z.headR * 0.4, Z.headCY - Z.headR * 0.6, Z.headR * 0.1, Z.headR * 0.2, -0.5, 0, Math.PI * 2)
    ctx.fill()
  } else if (Z.type === 'king') {
    // 黄金王冠：三尖冠 + 尖顶金珠 + 红宝石 + 冠底宽金带，后仰 -0.06 rad
    ctx.save()
    ctx.translate(0, Z.headCY - Z.headR * 0.55)
    ctx.rotate(-0.06)
    const crW = Z.headR * 0.88
    const crH = Z.headR * 0.42
    const tipH = Z.headR * 0.3
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
    // 尖顶金珠 ×3（中珠略大）
    ctx.fillStyle = COLORS.Z_KING_GOLD
    for (const [bx, br] of [[-crW * 0.62, Z.headR * 0.055], [0, Z.headR * 0.07], [crW * 0.62, Z.headR * 0.055]] as const) {
      ctx.beginPath()
      ctx.arc(bx, -crH - tipH * 0.85 - Z.headR * 0.02, br, 0, Math.PI * 2)
      ctx.fill(); ctx.stroke()
    }
    // 中央红宝石
    ctx.fillStyle = COLORS.Z_KING_GEM
    ctx.beginPath()
    ctx.arc(0, -crH * 0.42, Z.headR * 0.1, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
    // 冠底宽金带（后画 = 接缝干净）
    ctx.fillStyle = COLORS.Z_KING_GOLD_DARK
    safeRoundRect(ctx, -crW * 1.06, -crH * 0.3, crW * 2.12, crH * 0.32, Z.headR * 0.05)
    ctx.fill(); ctx.stroke()
    ctx.restore()
    pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.MAIN))
  }
}

// ============ 表情系统（Z_FACE 独立比例） ============
function face(Z: ZState, pen: Pen) {
  const { ctx } = Z
  Z.eyeY = Z.headCY + Z.headR * Z_FACE.EYE_Y_OFFSET
  Z.eyeR = Z.headR * (Z.type === 'imp' ? 0.27
    : Z.type === 'football' ? 0.23
    : Z.type === 'dancer' ? 0.24 : Z_FACE.EYE_R_RATIO)
  Z.eyeDX = Z.headR * Z_FACE.EYE_DX_RATIO
  // 眼白（imp/football/dancer 浑浊淡黄，bucket/king 白）
  ctx.fillStyle = Z.type === 'imp' || Z.type === 'football' || Z.type === 'dancer'
    ? COLORS.Z_EYE_YELLOW : COLORS.STROKE
  ctx.beginPath()
  ctx.ellipse(-Z.eyeDX, Z.eyeY, Z.eyeR * 0.96, Z.eyeR, 0, 0, Math.PI * 2)
  ctx.ellipse(Z.eyeDX, Z.eyeY, Z.eyeR * 0.96, Z.eyeR, 0, 0, Math.PI * 2)
  ctx.fill()
  pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.EYE))
  ctx.stroke()
  // 瞳孔（更小更偏，无神感）
  ctx.fillStyle = COLORS.INK
  const pupilR = Z.eyeR * (Z.type === 'imp' ? 0.3
    : Z.type === 'football' ? 0.42
    : Z.type === 'dancer' ? 0.36 : Z_FACE.PUPIL_R_RATIO)
  const pOffX = Z.type === 'imp' ? 0
    : Z.type === 'football' ? Z.eyeR * 0.05
    : Z.type === 'dancer' ? 0 : Z.eyeR * 0.14
  const pOffY = Z.type === 'imp' ? Z.eyeR * 0.1
    : Z.type === 'football' ? Z.eyeR * 0.06
    : Z.type === 'dancer' ? -Z.eyeR * 0.07 : Z.eyeR * 0.12
  ctx.beginPath()
  ctx.arc(-Z.eyeDX + pOffX, Z.eyeY + pOffY, pupilR, 0, Math.PI * 2)
  ctx.arc(Z.eyeDX + pOffX, Z.eyeY + pOffY, pupilR, 0, Math.PI * 2)
  ctx.fill()
  // 双高光（僵尸微弱单颗小高光）
  ctx.fillStyle = COLORS.STROKE
  const hOffX = Z.type === 'imp' ? -pupilR * 0.45 : Z.eyeR * 0.05
  const hOffY = Z.type === 'imp' ? Z.eyeR * 0.16 : Z.eyeR * 0.08
  const hR = pupilR * (Z.type === 'imp' ? 0.5 : 0.35)
  ctx.beginPath()
  ctx.arc(-Z.eyeDX + hOffX, Z.eyeY - hOffY, hR, 0, Math.PI * 2)
  ctx.arc(Z.eyeDX + hOffX, Z.eyeY - hOffY, hR, 0, Math.PI * 2)
  ctx.fill()
}

// ============ 类型差异化表情（眉形/嘴部/獠牙/舌头） ============
function faceVariants(Z: ZState, pen: Pen) {
  const { ctx } = Z
  pen.set(ctx, COLORS.INK, pen.w(STROKE.INK))
  if (Z.type === 'bucket') {
    // 担忧眉（加粗 1.5×）+ 眼角下垂线
    pen.set(ctx, COLORS.INK, pen.w(STROKE.INK) * 1.5)
    ctx.beginPath()
    ctx.moveTo(-Z.eyeDX - Z.eyeR, Z.eyeY - Z.eyeR * 2.05)
    ctx.quadraticCurveTo(-Z.eyeDX - Z.eyeR * 0.1, Z.eyeY - Z.eyeR * 1.45, -Z.eyeDX + Z.eyeR * 0.6, Z.eyeY - Z.eyeR * 1.15)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(Z.eyeDX + Z.eyeR, Z.eyeY - Z.eyeR * 2.05)
    ctx.quadraticCurveTo(Z.eyeDX + Z.eyeR * 0.1, Z.eyeY - Z.eyeR * 1.45, Z.eyeDX - Z.eyeR * 0.6, Z.eyeY - Z.eyeR * 1.15)
    ctx.stroke()
    pen.set(ctx, COLORS.INK, pen.w(STROKE.INK))
    ctx.beginPath()
    ctx.moveTo(-Z.eyeDX - Z.eyeR * 0.95, Z.eyeY + Z.eyeR * 0.2)
    ctx.quadraticCurveTo(-Z.eyeDX - Z.eyeR * 0.5, Z.eyeY + Z.eyeR * 0.55, -Z.eyeDX + Z.eyeR * 0.1, Z.eyeY + Z.eyeR * 0.7)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(Z.eyeDX + Z.eyeR * 0.95, Z.eyeY + Z.eyeR * 0.2)
    ctx.quadraticCurveTo(Z.eyeDX + Z.eyeR * 0.5, Z.eyeY + Z.eyeR * 0.55, Z.eyeDX - Z.eyeR * 0.1, Z.eyeY + Z.eyeR * 0.7)
    ctx.stroke()
  } else if (Z.type === 'imp') {
    // 紧张细眉
    ctx.beginPath()
    ctx.moveTo(-Z.eyeDX - Z.eyeR * 0.78, Z.eyeY - Z.eyeR * 1.38)
    ctx.quadraticCurveTo(-Z.eyeDX - Z.eyeR * 0.1, Z.eyeY - Z.eyeR * 1.66, -Z.eyeDX + Z.eyeR * 0.58, Z.eyeY - Z.eyeR * 1.55)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(Z.eyeDX + Z.eyeR * 0.78, Z.eyeY - Z.eyeR * 1.38)
    ctx.quadraticCurveTo(Z.eyeDX + Z.eyeR * 0.1, Z.eyeY - Z.eyeR * 1.66, Z.eyeDX - Z.eyeR * 0.58, Z.eyeY - Z.eyeR * 1.55)
    ctx.stroke()
  } else if (Z.type === 'football') {
    // 怒眉（1.8× 加粗，内端下压）
    pen.set(ctx, COLORS.INK, pen.w(STROKE.INK) * 1.8)
    ctx.beginPath()
    ctx.moveTo(-Z.eyeDX - Z.eyeR * 1.05, Z.eyeY - Z.eyeR * 1.3)
    ctx.quadraticCurveTo(-Z.eyeDX - Z.eyeR * 0.2, Z.eyeY - Z.eyeR * 1.02, -Z.eyeDX + Z.eyeR * 0.55, Z.eyeY - Z.eyeR * 0.78)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(Z.eyeDX + Z.eyeR * 1.05, Z.eyeY - Z.eyeR * 1.3)
    ctx.quadraticCurveTo(Z.eyeDX + Z.eyeR * 0.2, Z.eyeY - Z.eyeR * 1.02, Z.eyeDX - Z.eyeR * 0.55, Z.eyeY - Z.eyeR * 0.78)
    ctx.stroke()
    pen.set(ctx, COLORS.INK, pen.w(STROKE.INK))
  } else if (Z.type === 'king') {
    // 王者怒眉（2.0× 加粗）
    pen.set(ctx, COLORS.INK, pen.w(STROKE.INK) * 2.0)
    ctx.beginPath()
    ctx.moveTo(-Z.eyeDX - Z.eyeR * 1.05, Z.eyeY - Z.eyeR * 1.34)
    ctx.quadraticCurveTo(-Z.eyeDX - Z.eyeR * 0.2, Z.eyeY - Z.eyeR, -Z.eyeDX + Z.eyeR * 0.55, Z.eyeY - Z.eyeR * 0.74)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(Z.eyeDX + Z.eyeR * 1.05, Z.eyeY - Z.eyeR * 1.34)
    ctx.quadraticCurveTo(Z.eyeDX + Z.eyeR * 0.2, Z.eyeY - Z.eyeR, Z.eyeDX - Z.eyeR * 0.55, Z.eyeY - Z.eyeR * 0.74)
    ctx.stroke()
    pen.set(ctx, COLORS.INK, pen.w(STROKE.INK))
  } else if (Z.type === 'dancer') {
    // 兴奋高挑细眉（内端上扬）
    ctx.beginPath()
    ctx.moveTo(-Z.eyeDX - Z.eyeR * 0.78, Z.eyeY - Z.eyeR * 1.18)
    ctx.quadraticCurveTo(-Z.eyeDX - Z.eyeR * 0.05, Z.eyeY - Z.eyeR * 1.48, -Z.eyeDX + Z.eyeR * 0.6, Z.eyeY - Z.eyeR * 1.26)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(Z.eyeDX + Z.eyeR * 0.78, Z.eyeY - Z.eyeR * 1.18)
    ctx.quadraticCurveTo(Z.eyeDX + Z.eyeR * 0.05, Z.eyeY - Z.eyeR * 1.48, Z.eyeDX - Z.eyeR * 0.6, Z.eyeY - Z.eyeR * 1.26)
    ctx.stroke()
  }

  // 腮红（僵尸更大更暗 = 病态红晕）
  ctx.fillStyle = COLORS.BLUSH_ZOMBIE
  const blushCX = Z.headR * Z_FACE.BLUSH_CX
  const blushCY = Z.eyeY + Z.headR * Z_FACE.BLUSH_CY
  const blushR = Z.headR * Z_FACE.BLUSH_SIZE
  ctx.beginPath()
  ctx.arc(-blushCX, blushCY, blushR, 0, Math.PI * 2)
  ctx.arc(blushCX, blushCY, blushR, 0, Math.PI * 2)
  ctx.fill()

  // 嘴型（按类型差异化）
  Z.mouthY = Z.eyeY + Z.headR * Z_FACE.MOUTH_Y_OFFSET
  if (Z.type === 'bucket') {
    // 呆滞张大嘴 + 参差獠牙
    const mW = Z.headR * 0.34
    const mH = Z.headR * 0.26
    ctx.fillStyle = COLORS.Z_MOUTH
    ctx.beginPath()
    ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2)
    ctx.fill()
    pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.LIP))
    ctx.stroke()
    ctx.fillStyle = COLORS.STROKE
    const teethTop: Array<[number, number, number]> = [
      [-0.66, 0.28, 0.42], [-0.3, 0.3, 0.55], [0.04, 0.28, 0.48], [0.38, 0.26, 0.38],
    ]
    for (const [tx, tw, th] of teethTop) {
      safeRoundRect(ctx, mW * tx, Z.mouthY - mH * 0.82, mW * tw, mH * th, mW * 0.09)
      ctx.fill()
    }
    safeRoundRect(ctx, mW * -0.42, Z.mouthY + mH * 0.34, mW * 0.24, mH * 0.3, mW * 0.08)
    ctx.fill()
    safeRoundRect(ctx, mW * 0.18, Z.mouthY + mH * 0.3, mW * 0.22, mH * 0.26, mW * 0.08)
    ctx.fill()
  } else if (Z.type === 'imp') {
    // 呆滞 O 型张嘴（近黑口腔 + 上 2 方牙/下 2 小牙）
    const mW = Z.headR * 0.3
    const mH = Z.headR * 0.22
    ctx.fillStyle = COLORS.INK
    ctx.beginPath()
    ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2)
    ctx.fill()
    pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.LIP))
    ctx.stroke()
    ctx.fillStyle = COLORS.STROKE
    safeRoundRect(ctx, -mW * 0.52, Z.mouthY - mH * 0.9, mW * 0.34, mH * 0.42, mW * 0.06)
    ctx.fill()
    safeRoundRect(ctx, mW * 0.16, Z.mouthY - mH * 0.94, mW * 0.32, mH * 0.48, mW * 0.06)
    ctx.fill()
    safeRoundRect(ctx, -mW * 0.36, Z.mouthY + mH * 0.48, mW * 0.26, mH * 0.32, mW * 0.05)
    ctx.fill()
    safeRoundRect(ctx, mW * 0.1, Z.mouthY + mH * 0.52, mW * 0.22, mH * 0.28, mW * 0.05)
    ctx.fill()
  } else if (Z.type === 'football') {
    // 咆哮张嘴 + 参差獠牙
    const mW = Z.headR * 0.32
    const mH = Z.headR * 0.24
    ctx.fillStyle = COLORS.Z_MOUTH
    ctx.beginPath()
    ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2)
    ctx.fill()
    pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.LIP))
    ctx.stroke()
    ctx.fillStyle = COLORS.STROKE
    const teethTop: Array<[number, number, number]> = [
      [-0.64, 0.26, 0.4], [-0.28, 0.28, 0.55], [0.06, 0.26, 0.46], [0.4, 0.24, 0.36],
    ]
    for (const [tx, tw, th] of teethTop) {
      safeRoundRect(ctx, mW * tx, Z.mouthY - mH * 0.82, mW * tw, mH * th, mW * 0.08)
      ctx.fill()
    }
    safeRoundRect(ctx, mW * -0.4, Z.mouthY + mH * 0.36, mW * 0.24, mH * 0.28, mW * 0.07)
    ctx.fill()
    safeRoundRect(ctx, mW * 0.16, Z.mouthY + mH * 0.32, mW * 0.22, mH * 0.24, mW * 0.07)
    ctx.fill()
  } else if (Z.type === 'king') {
    // 王者咆哮（暗红大口腔 + 双长獠牙）
    const mW = Z.headR * 0.34
    const mH = Z.headR * 0.24
    ctx.fillStyle = COLORS.Z_MOUTH
    ctx.beginPath()
    ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2)
    ctx.fill()
    pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.LIP))
    ctx.stroke()
    ctx.fillStyle = COLORS.STROKE
    safeRoundRect(ctx, mW * -0.52, Z.mouthY - mH * 0.88, mW * 0.26, mH * 0.62, mW * 0.08)
    ctx.fill()
    safeRoundRect(ctx, mW * 0.26, Z.mouthY - mH * 0.88, mW * 0.26, mH * 0.62, mW * 0.08)
    ctx.fill()
    safeRoundRect(ctx, mW * -0.34, Z.mouthY + mH * 0.4, mW * 0.24, mH * 0.26, mW * 0.07)
    ctx.fill()
    safeRoundRect(ctx, mW * 0.1, Z.mouthY + mH * 0.4, mW * 0.22, mH * 0.24, mW * 0.07)
    ctx.fill()
  } else if (Z.type === 'dancer') {
    // 狂笑大张嘴（暗红口腔 + 鲜红舌头 + 参差獠牙）
    const mW = Z.headR * 0.3
    const mH = Z.headR * 0.25
    ctx.fillStyle = COLORS.Z_MOUTH
    ctx.beginPath()
    ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2)
    ctx.fill()
    pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.LIP))
    ctx.stroke()
    // 舌头（clip 在嘴内）
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(0, Z.mouthY, mW, mH, 0, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = COLORS.Z_DN_TONGUE
    ctx.beginPath()
    ctx.ellipse(0, Z.mouthY + mH * 0.55, mW * 0.55, mH * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = COLORS.STROKE
    const teethTop: Array<[number, number, number]> = [
      [-0.58, 0.24, 0.4], [-0.24, 0.27, 0.55], [0.08, 0.25, 0.46], [0.4, 0.22, 0.36],
    ]
    for (const [tx, tw, th] of teethTop) {
      safeRoundRect(ctx, mW * tx, Z.mouthY - mH * 0.82, mW * tw, mH * th, mW * 0.08)
      ctx.fill()
    }
    safeRoundRect(ctx, mW * -0.74, Z.mouthY + mH * 0.28, mW * 0.22, mH * 0.24, mW * 0.07)
    ctx.fill()
    safeRoundRect(ctx, mW * 0.5, Z.mouthY + mH * 0.3, mW * 0.26, mH * 0.3, mW * 0.07)
    ctx.fill()
  }
}

// ============ 橄榄球面罩格栅（最后绘制，罩嘴部之上） ============
function cage(Z: ZState, pen: Pen) {
  if (Z.type !== 'football') return
  const { ctx } = Z
  // 侧臂 ×2（从口区两侧上扬接盔侧）
  pen.set(ctx, COLORS.Z_FH_CAGE, pen.w(STROKE.THIN) * 1.35)
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * Z.headR * 0.56, Z.mouthY + Z.headR * 0.14)
    ctx.quadraticCurveTo(s * Z.headR * 0.78, Z.mouthY - Z.headR * 0.12, s * Z.headR * 0.88, Z.headCY + Z.headR * 0.06)
    ctx.stroke()
  }
  // 横杆 ×2
  pen.set(ctx, COLORS.Z_FH_CAGE, pen.w(STROKE.THIN) * 1.15)
  for (const [y1, y2] of [
    [Z.mouthY - Z.headR * 0.06, Z.mouthY + Z.headR * 0.01],
    [Z.mouthY + Z.headR * 0.12, Z.mouthY + Z.headR * 0.19],
  ] as const) {
    ctx.beginPath()
    ctx.moveTo(-Z.headR * 0.52, y1)
    ctx.quadraticCurveTo(0, y2, Z.headR * 0.52, y1)
    ctx.stroke()
  }
  // 竖杆 ×2
  pen.set(ctx, COLORS.Z_FH_CAGE, pen.w(STROKE.THIN))
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * Z.headR * 0.18, Z.mouthY - Z.headR * 0.1)
    ctx.lineTo(s * Z.headR * 0.16, Z.mouthY + Z.headR * 0.22)
    ctx.stroke()
  }
  pen.set(ctx, COLORS.Z_STROKE, pen.w(STROKE.MAIN))
}
