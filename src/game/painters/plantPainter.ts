// src/game/painters/plantPainter.ts - 植物 PvZ 经典复刻绘制（v93 与小程序 renderer.js 同源移植）
//   · 本命深色勾边 + 径向渐变体积（替代旧白描边萌系），精准复刻附图角色形象
//   · PvZ 表情系统 drawPvzFace：黑豆眼 / 白眼珠 + 眉形（worried/angry/cool）+ 语义嘴型
//   · 朝向适配：网页为横向车道（僵尸右→左），炮管类植物朝右微仰 -0.30，
//     正面构图（坚果/樱桃/食人花/向日葵）与小程序 1:1
//   · 动效钩子保留：fuseTimer 蓄力震动 / chomperState 咬吞 / wobble 眨眼 / wallHp 裂纹
import type { PlantType } from '../constants'
import { PLANT, PLANT_TYPES } from '../constants'
import { COLORS, STROKE, FACE, HEAD, SHADOW, Pen, safeRoundRect, starShape } from './tokens'

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface PlantPaintCtx {
  type: PlantType
  color: string
  wobble: number
  t: number
  health: number
  maxHealth: number
  fuseTimer: number
  chomperState: 'idle' | 'snap' | 'swallow'
  stateTimer: number
}

export interface FaceOpts {
  mouth?: 'smile' | 'o' | 'grin' | 'flat' | 'pout' | 'none'
  wobblePhase?: number
  blushColor?: string
  pupilInward?: boolean
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/* ============ v93 经典 PvZ 色板（与小程序 PZ 同源） ============ */
const PZ = {
  OUT_GREEN: '#2F5E1E',
  OUT_ICE: '#3D7E96',
  OUT_NUT: '#5D3A1A',
  OUT_RED: '#8E1B12',
  OUT_PURPLE: '#4A2370',
  OUT_FIRE: '#A03518',
  OUT_SUN: '#C77700',
  INK: '#3B2B1A',
}

/** PvZ 勾边线 */
function pvzLine(ctx: Ctx2D, pen: Pen, color: string, coeff: number) {
  pen.set(ctx, color, pen.w(coeff))
}

/** 尖卵叶（根部宽→叶尖，带中脉；dir=±1 朝向） */
function pvzLeaf(ctx: Ctx2D, pen: Pen, bx: number, by: number, len: number, wid: number,
                 dir: number, fill: string, vein: string, lineCoeff = 3.0) {
  ctx.save()
  pvzLine(ctx, pen, vein, lineCoeff)
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.moveTo(bx, by)
  ctx.bezierCurveTo(bx + dir * wid * 0.5, by - len * 0.36, bx + dir * len * 0.86, by - len * 0.30, bx + dir * len, by + len * 0.02)
  ctx.bezierCurveTo(bx + dir * len * 0.72, by + len * 0.34, bx + dir * wid * 0.42, by + len * 0.30, bx, by)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(bx + dir * wid * 0.16, by + len * 0.02)
  ctx.quadraticCurveTo(bx + dir * len * 0.5, by + len * 0.02, bx + dir * len * 0.84, by + len * 0.04)
  ctx.stroke()
  ctx.restore()
}

/** 尖角火苗路径（底宽顶尖 + 右肩内卷，以 (0,0) 为底部中心；只建路径） */
function flameShape(ctx: Ctx2D, w: number, h: number) {
  ctx.beginPath()
  ctx.moveTo(-w * 0.5, 0)
  ctx.bezierCurveTo(-w * 0.52, -h * 0.32, -w * 0.30, -h * 0.55, -w * 0.14, -h * 0.82)
  ctx.quadraticCurveTo(-w * 0.03, -h * 0.96, 0, -h)
  ctx.quadraticCurveTo(w * 0.08, -h * 0.82, w * 0.20, -h * 0.68)
  ctx.bezierCurveTo(w * 0.44, -h * 0.48, w * 0.52, -h * 0.28, w * 0.5, 0)
  ctx.closePath()
}

/** 三层火苗：外深橙红 / 中橙 / 内亮黄 */
function drawFlame(ctx: Ctx2D, cx: number, cy: number, w: number, h: number, sway: number) {
  const layers: Array<[string, number, number, number]> = [
    [COLORS.FIRE_BODY_DARK, w, h, sway],
    [COLORS.FIRE_FLAME, w * 0.70, h * 0.70, sway * 0.55],
    [COLORS.FIRE_CORE, w * 0.40, h * 0.42, sway * 0.30],
  ]
  ctx.save()
  ctx.translate(cx, cy)
  layers.forEach(([color, lw, lh, ls]) => {
    ctx.save()
    ctx.translate(ls, 0)
    ctx.rotate(ls * 0.12)
    flameShape(ctx, lw, lh)
    ctx.fillStyle = color
    ctx.fill()
    ctx.restore()
  })
  ctx.restore()
}

/* =============================================================
   PvZ 经典表情系统 v93（与小程序 _drawPvzFace 同源）
   =========================================================== */
export interface PvzFaceOpts {
  eyeDX: number
  eyeY: number
  eyeR: number
  white?: boolean
  pupilDx?: number
  pupilDy?: number
  brow?: 'worried' | 'angry' | 'cool' | 'none'
  browColor?: string
  browBold?: number
  mouth?: 'smile-open' | 'grit' | 'frown' | 'flat' | 'o' | 'none'
  mouthY?: number
  mouthRx?: number
  mouthRy?: number
  ink?: string
  wobblePhase?: number
  blush?: string
}

export function drawPvzFace(ctx: Ctx2D, pen: Pen, o: PvzFaceOpts) {
  const wobblePhase = o.wobblePhase ?? 0
  const ink = o.ink ?? '#3B2B1A'
  const eyeDX = o.eyeDX, eyeY = o.eyeY, eyeR = o.eyeR
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const blinkT = (Math.sin(wobblePhase) + 1) / 2
  const blink = blinkT > 0.94 ? 1 - (blinkT - 0.94) / 0.06 : 1

  if (o.white) {
    // 白眼珠 + 黑瞳
    pvzLine(ctx, pen, ink, 1.5)
    ctx.fillStyle = '#FDFBF3'
    ctx.beginPath()
    ctx.ellipse(-eyeDX, eyeY, eyeR * 0.80, eyeR * Math.max(0.10, blink), 0, 0, Math.PI * 2)
    ctx.ellipse(eyeDX, eyeY, eyeR * 0.80, eyeR * Math.max(0.10, blink), 0, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
    if (blink > 0.4) {
      const pdx = (o.pupilDx ?? 0) * eyeR
      const pdy = (o.pupilDy ?? 0) * eyeR
      const pr = eyeR * 0.38
      ctx.fillStyle = '#262626'
      ctx.beginPath()
      ctx.arc(-eyeDX + pdx, eyeY + pdy, pr, 0, Math.PI * 2)
      ctx.arc(eyeDX + pdx, eyeY + pdy, pr, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.beginPath()
      ctx.arc(-eyeDX + pdx - pr * 0.30, eyeY + pdy - pr * 0.34, pr * 0.36, 0, Math.PI * 2)
      ctx.arc(eyeDX + pdx - pr * 0.30, eyeY + pdy - pr * 0.34, pr * 0.36, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    // 黑豆眼
    if (blink > 0.4) {
      ctx.fillStyle = ink
      ctx.beginPath()
      ctx.ellipse(-eyeDX, eyeY, eyeR * 0.60, eyeR * 0.72 * blink, 0, 0, Math.PI * 2)
      ctx.ellipse(eyeDX, eyeY, eyeR * 0.60, eyeR * 0.72 * blink, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.beginPath()
      ctx.arc(-eyeDX - eyeR * 0.14, eyeY - eyeR * 0.24, eyeR * 0.20, 0, Math.PI * 2)
      ctx.arc(eyeDX - eyeR * 0.14, eyeY - eyeR * 0.24, eyeR * 0.20, 0, Math.PI * 2)
      ctx.fill()
    } else {
      pvzLine(ctx, pen, ink, 1.7)
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(s * eyeDX, eyeY - eyeR * 0.10, eyeR * 0.52, Math.PI * 1.12, Math.PI * 1.88)
        ctx.stroke()
      }
    }
  }

  // 眉形
  const brow = o.brow ?? 'none'
  if (brow !== 'none') {
    const bw = eyeR * 1.28
    const by = eyeY - eyeR * 1.50
    pvzLine(ctx, pen, o.browColor ?? ink, o.browBold ?? 2.2)
    if (brow === 'worried') {
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(s * eyeDX - s * bw, by - eyeR * 0.40)
        ctx.quadraticCurveTo(s * eyeDX, by + eyeR * 0.10, s * eyeDX + s * bw * 0.38, by + eyeR * 0.50)
        ctx.stroke()
      }
    } else if (brow === 'angry') {
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(s * eyeDX - s * bw, by + eyeR * 0.46)
        ctx.quadraticCurveTo(s * eyeDX, by - eyeR * 0.05, s * eyeDX + s * bw * 0.38, by - eyeR * 0.45)
        ctx.stroke()
      }
    } else if (brow === 'cool') {
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(s * eyeDX - bw, by + eyeR * 0.34)
        ctx.lineTo(s * eyeDX + bw, by + eyeR * 0.06)
        ctx.stroke()
      }
    }
  }

  // 嘴型
  const mY = o.mouthY ?? 0, mRx = o.mouthRx ?? 0, mRy = o.mouthRy ?? 0
  const mouth = o.mouth ?? 'none'
  if (mouth === 'smile-open') {
    pvzLine(ctx, pen, '#5F2B0C', 1.5)
    ctx.fillStyle = '#7E3A12'
    ctx.beginPath()
    ctx.moveTo(-mRx, mY)
    ctx.quadraticCurveTo(-mRx * 0.55, mY - mRy * 0.10, 0, mY - mRy * 0.02)
    ctx.quadraticCurveTo(mRx * 0.55, mY - mRy * 0.10, mRx, mY)
    ctx.quadraticCurveTo(mRx * 0.55, mY + mRy * 1.45, 0, mY + mRy * 1.45)
    ctx.quadraticCurveTo(-mRx * 0.55, mY + mRy * 1.45, -mRx, mY)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = 'rgba(255,183,110,0.42)'
    ctx.beginPath()
    ctx.ellipse(0, mY + mRy * 1.02, mRx * 0.58, mRy * 0.40, 0, 0, Math.PI * 2)
    ctx.fill()
  } else if (mouth === 'grit') {
    pvzLine(ctx, pen, ink, 1.5)
    ctx.fillStyle = '#5F2318'
    ctx.beginPath()
    safeRoundRect(ctx, -mRx, mY, mRx * 2, mRy * 1.4, mRy * 0.5)
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#FDFBF3'
    const tw = mRx * 0.42
    ctx.beginPath()
    safeRoundRect(ctx, -mRx * 0.72, mY + mRy * 0.06, tw, mRy * 0.62, tw * 0.22)
    ctx.fill()
    ctx.beginPath()
    safeRoundRect(ctx, -mRx * 0.12, mY + mRy * 0.06, tw, mRy * 0.62, tw * 0.22)
    ctx.fill()
    ctx.beginPath()
    safeRoundRect(ctx, mRx * 0.30, mY + mRy * 0.06, tw, mRy * 0.62, tw * 0.22)
    ctx.fill()
  } else if (mouth === 'frown') {
    pvzLine(ctx, pen, ink, 2.0)
    ctx.beginPath()
    ctx.moveTo(-mRx, mY + mRy * 0.35)
    ctx.quadraticCurveTo(0, mY - mRy * 0.30, mRx, mY + mRy * 0.35)
    ctx.stroke()
  } else if (mouth === 'flat') {
    pvzLine(ctx, pen, ink, 2.0)
    ctx.beginPath()
    ctx.moveTo(-mRx, mY)
    ctx.lineTo(mRx, mY)
    ctx.stroke()
  } else if (mouth === 'o') {
    pvzLine(ctx, pen, ink, 1.4)
    ctx.fillStyle = '#5F2318'
    ctx.beginPath()
    ctx.ellipse(0, mY, mRx, mRy, 0, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
  }

  // 腮红（v94 可选：两颊椭圆晕，参照附图可爱 3D 风格）
  if (o.blush) {
    ctx.fillStyle = o.blush
    ctx.beginPath()
    ctx.ellipse(-eyeDX - eyeR * 1.30, eyeY + eyeR * 1.02, eyeR * 0.52, eyeR * 0.34, 0, 0, Math.PI * 2)
    ctx.ellipse(eyeDX + eyeR * 1.30, eyeY + eyeR * 1.02, eyeR * 0.52, eyeR * 0.34, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** 总入口：ctx 已平移至植物中心（0,0）。含阴影 / 主体 / 血条 */
export function drawPlantArt(ctx: Ctx2D, pen: Pen, p: PlantPaintCtx, r: number) {
  pen.setBase(r)
  ctx.fillStyle = COLORS.SHADOW
  ctx.beginPath()
  ctx.ellipse(0, r * SHADOW.Y, r * SHADOW.RX, r * SHADOW.RY, 0, 0, Math.PI * 2)
  ctx.fill()
  pen.set(ctx, COLORS.STROKE, pen.w(STROKE.MAIN))

  switch (p.type) {
    case 'shooter': drawShooter(ctx, pen, p, r); break
    case 'wall': drawWall(ctx, pen, p, r); break
    case 'freezer': drawFreezer(ctx, pen, p, r); break
    case 'cherry': drawCherry(ctx, pen, p, r); break
    case 'chomper': drawChomper(ctx, pen, p, r); break
    case 'sunflower': drawSunflower(ctx, pen, p, r); break
    case 'fire': drawFire(ctx, pen, p, r); break
    default: drawWall(ctx, pen, p, r); break
  }

  // 血条（受伤时显示）
  if (p.maxHealth > 1 && p.health < p.maxHealth) {
    const hpRatio = clamp01(p.health / p.maxHealth)
    const barW = r * 1.8
    const barH = Math.max(4, r * 0.12)
    const barY = -r * 1.55
    ctx.globalAlpha = 1
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    safeRoundRect(ctx, -barW / 2, barY, barW, barH, barH / 2)
    ctx.fill()
    ctx.fillStyle = hpRatio > 0.5 ? '#7CB342' : hpRatio > 0.25 ? '#F5B301' : '#E53935'
    ctx.beginPath()
    safeRoundRect(ctx, -barW / 2, barY, Math.max(barH, barW * hpRatio), barH, barH / 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'
    ctx.lineWidth = 1
    ctx.beginPath()
    safeRoundRect(ctx, -barW / 2, barY, barW, barH, barH / 2)
    ctx.stroke()
  }
}

/* ============ 萌系表情（保留：阳光球笑脸专用） ============ */
export function drawCuteFace(ctx: Ctx2D, pen: Pen, r: number, cy: number, opts: FaceOpts = {}) {
  const mouth = opts.mouth ?? 'smile'
  const wobblePhase = opts.wobblePhase ?? 0
  const blushColor = opts.blushColor ?? COLORS.BLUSH_PINK

  const eyeDX = r * FACE.EYE_DX_RATIO
  const eyeR = r * FACE.EYE_R_RATIO
  const eyeY = cy
  const blinkT = (Math.sin(wobblePhase) + 1) / 2
  const blink = blinkT > 0.94 ? 1 - (blinkT - 0.94) / 0.06 : 1
  const eyeH = Math.max(0.05, eyeR * blink)

  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  ctx.fillStyle = COLORS.INK
  ctx.beginPath()
  ctx.ellipse(-eyeDX, eyeY, eyeR * 0.62, eyeR * 0.72 * blink, 0, 0, Math.PI * 2)
  ctx.ellipse(eyeDX, eyeY, eyeR * 0.62, eyeR * 0.72 * blink, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.beginPath()
  ctx.arc(-eyeDX - eyeR * 0.14, eyeY - eyeR * 0.24, eyeR * 0.20, 0, Math.PI * 2)
  ctx.arc(eyeDX - eyeR * 0.14, eyeY - eyeR * 0.24, eyeR * 0.20, 0, Math.PI * 2)
  ctx.fill()

  const blushCX = r * FACE.BLUSH_CX
  const blushCY = eyeY + r * FACE.BLUSH_CY
  ctx.fillStyle = blushColor
  ctx.beginPath()
  ctx.arc(-blushCX, blushCY, r * FACE.BLUSH_SIZE * 1.15, 0, Math.PI * 2)
  ctx.arc(blushCX, blushCY, r * FACE.BLUSH_SIZE * 1.15, 0, Math.PI * 2)
  ctx.fill()

  const mouthY = eyeY + r * FACE.MOUTH_Y_OFFSET
  if (mouth === 'o') {
    ctx.fillStyle = COLORS.MOUTH_PINK
    ctx.beginPath()
    ctx.ellipse(0, mouthY, r * 0.13, r * 0.18, 0, 0, Math.PI * 2)
    ctx.fill()
  } else if (mouth === 'grin') {
    ctx.fillStyle = COLORS.MOUTH_PINK
    ctx.beginPath()
    ctx.arc(0, mouthY - r * 0.02, r * 0.28, 0.1 * Math.PI, 0.9 * Math.PI)
    ctx.lineTo(r * 0.22, mouthY - r * 0.02)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = COLORS.STROKE
    safeRoundRect(ctx, -r * 0.15, mouthY - r * 0.02, r * 0.3, r * 0.1, r * 0.03)
    ctx.fill()
  } else if (mouth === 'flat') {
    pen.set(ctx, COLORS.INK, pen.w(STROKE.INK))
    ctx.beginPath()
    ctx.moveTo(-r * 0.18, mouthY - r * 0.05)
    ctx.lineTo(r * 0.18, mouthY - r * 0.05)
    ctx.stroke()
  } else {
    pen.set(ctx, COLORS.INK, pen.w(STROKE.INK))
    ctx.beginPath()
    ctx.arc(0, mouthY - r * 0.15, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()
  }
  ctx.restore()
}

/* ============ 豌豆射手（PvZ 经典复刻，朝右炮管） ============ */
function drawShooter(ctx: Ctx2D, pen: Pen, p: PlantPaintCtx, r: number) {
  const OUT = PZ.OUT_GREEN
  const headR = r * 0.98
  const headY = -r * 0.22

  // 1. 底座土丘
  const bodyY = r * 0.60
  const mound = ctx.createRadialGradient(-r * 0.25, bodyY - r * 0.28, 0, 0, bodyY, r * 0.95)
  mound.addColorStop(0, '#8FC65B')
  mound.addColorStop(0.6, '#6BA83A')
  mound.addColorStop(1, '#4E7F2C')
  pvzLine(ctx, pen, OUT, 3.0)
  ctx.fillStyle = mound
  ctx.beginPath()
  ctx.ellipse(0, bodyY, r * 0.82, r * 0.44, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()

  // 2. 两侧尖卵叶
  pvzLeaf(ctx, pen, -r * 0.30, bodyY + r * 0.02, r * 0.66, r * 0.30, -1, '#5E9433', OUT, 3.0)
  pvzLeaf(ctx, pen, r * 0.30, bodyY + r * 0.02, r * 0.66, r * 0.30, 1, '#6BA83A', OUT, 3.0)

  // 3. 茎
  pvzLine(ctx, pen, OUT, 3.0)
  ctx.fillStyle = '#6BA83A'
  ctx.beginPath()
  safeRoundRect(ctx, -r * 0.15, headY + headR * 0.48, r * 0.30, r * 0.48, r * 0.13)
  ctx.fill(); ctx.stroke()

  // 4. 头
  const headGrad = ctx.createRadialGradient(-headR * 0.38, headY - headR * 0.38, 0, 0, headY, headR * 1.12)
  headGrad.addColorStop(0, '#A8D96A')
  headGrad.addColorStop(0.55, '#7FC04E')
  headGrad.addColorStop(1, '#55903A')
  pvzLine(ctx, pen, OUT, 3.2)
  ctx.fillStyle = headGrad
  ctx.beginPath()
  ctx.ellipse(0, headY, headR, headR * 0.94, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, headY, headR, headR * 0.94, 0, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = 'rgba(47,94,30,0.18)'
  ctx.beginPath()
  ctx.ellipse(headR * 0.42, headY + headR * 0.52, headR * 0.72, headR * 0.50, 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = 'rgba(255,255,255,0.30)'
  ctx.beginPath()
  ctx.ellipse(-headR * 0.40, headY - headR * 0.42, headR * 0.24, headR * 0.14, -0.5, 0, Math.PI * 2)
  ctx.fill()

  // 5. 右向炮管（网页横向车道：微仰 -0.30 朝右）
  const cannonX = headR * 0.58
  const cannonY = headY - headR * 0.42
  const cannonLen = headR * 0.62
  const cannonR = headR * 0.32
  ctx.save()
  ctx.translate(cannonX, cannonY)
  ctx.rotate(-0.30)
  pvzLine(ctx, pen, OUT, 3.0)
  ctx.fillStyle = '#5E9433'
  ctx.beginPath()
  ctx.ellipse(cannonR * 0.08, 0, cannonR * 0.26, cannonR * 0.92, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  const cg = ctx.createLinearGradient(0, -cannonR, 0, cannonR)
  cg.addColorStop(0, '#A8D96A')
  cg.addColorStop(0.5, '#7FC04E')
  cg.addColorStop(1, '#55903A')
  ctx.fillStyle = cg
  ctx.beginPath()
  safeRoundRect(ctx, 0, -cannonR, cannonLen, cannonR * 2, cannonR * 0.5)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#7FC04E'
  ctx.beginPath()
  ctx.ellipse(cannonLen * 0.48, -cannonR * 0.92, cannonR * 0.32, cannonR * 0.22, -0.25, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#2E5B1E'
  ctx.beginPath()
  ctx.ellipse(cannonLen, 0, cannonR * 0.40, cannonR * 0.88, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#1E3D12'
  ctx.beginPath()
  ctx.ellipse(cannonLen, 0, cannonR * 0.26, cannonR * 0.60, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // 6. 头顶卷芽嫩茎（卷曲小茎 + 双叶，参照附图卷芽特征）
  const sproutY = headY - headR * 0.88
  pen.set(ctx, OUT, pen.w(2.4))
  ctx.strokeStyle = OUT; ctx.lineWidth = Math.max(1, r * 0.035); ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, sproutY)
  ctx.quadraticCurveTo(headR * 0.04, sproutY - headR * 0.14, headR * 0.14, sproutY - headR * 0.16)
  ctx.stroke()
  pvzLeaf(ctx, pen, headR * 0.14, sproutY - headR * 0.16, headR * 0.36, headR * 0.15, 1, '#6BA83A', OUT, 2.4)
  pvzLeaf(ctx, pen, -headR * 0.01, sproutY - headR * 0.06, headR * 0.28, headR * 0.12, -1, '#5E9433', OUT, 2.4)

  // 7. 表情：大白眼珠 + 开心笑 + 粉腮（参照附图豌豆射手）
  drawPvzFace(ctx, pen, {
    eyeDX: headR * 0.30, eyeY: headY + headR * 0.10, eyeR: headR * 0.155,
    white: true, pupilDx: 0.06, pupilDy: -0.08,
    brow: 'none',
    mouth: 'smile-open',
    mouthY: headY + headR * 0.46, mouthRx: headR * 0.16, mouthRy: headR * 0.11,
    blush: 'rgba(255,132,150,0.55)',
    ink: '#23400F', wobblePhase: p.wobble,
  })
}

/* ============ 火焰射手 ============ */
function drawFire(ctx: Ctx2D, pen: Pen, p: PlantPaintCtx, r: number) {
  const OUT = PZ.OUT_FIRE
  const headR = r * 0.98
  const headY = -r * 0.22
  const sway = Math.sin(p.wobble * 2.0) * r * 0.05

  const bodyY = r * 0.60
  const mound = ctx.createRadialGradient(-r * 0.25, bodyY - r * 0.28, 0, 0, bodyY, r * 0.95)
  mound.addColorStop(0, '#EFA058')
  mound.addColorStop(0.6, '#D96B33')
  mound.addColorStop(1, '#A8451F')
  pvzLine(ctx, pen, OUT, 3.0)
  ctx.fillStyle = mound
  ctx.beginPath()
  ctx.ellipse(0, bodyY, r * 0.82, r * 0.44, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()

  pvzLeaf(ctx, pen, -r * 0.30, bodyY + r * 0.02, r * 0.66, r * 0.30, -1, '#9C5B36', OUT, 3.0)
  pvzLeaf(ctx, pen, r * 0.30, bodyY + r * 0.02, r * 0.66, r * 0.30, 1, '#B06A3D', OUT, 3.0)

  pvzLine(ctx, pen, OUT, 3.0)
  ctx.fillStyle = '#A8622F'
  ctx.beginPath()
  safeRoundRect(ctx, -r * 0.15, headY + headR * 0.48, r * 0.30, r * 0.48, r * 0.13)
  ctx.fill(); ctx.stroke()

  const headGrad = ctx.createRadialGradient(-headR * 0.38, headY - headR * 0.38, 0, 0, headY, headR * 1.12)
  headGrad.addColorStop(0, '#FFC894')
  headGrad.addColorStop(0.55, '#FF8B52')
  headGrad.addColorStop(1, '#E05A2B')
  pvzLine(ctx, pen, OUT, 3.2)
  ctx.fillStyle = headGrad
  ctx.beginPath()
  ctx.ellipse(0, headY, headR, headR * 0.94, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, headY, headR, headR * 0.94, 0, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = 'rgba(160,53,24,0.22)'
  ctx.beginPath()
  ctx.ellipse(headR * 0.42, headY + headR * 0.52, headR * 0.72, headR * 0.50, 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(160,53,24,0.55)'
  ;[[-headR * 0.52, headY - headR * 0.42, headR * 0.10],
    [headR * 0.46, headY - headR * 0.50, headR * 0.08],
    [headR * 0.62, headY + headR * 0.14, headR * 0.09]].forEach(([ex, ey, er]) => {
    ctx.beginPath()
    ctx.arc(ex, ey, er, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.restore()
  ctx.fillStyle = 'rgba(255,255,255,0.32)'
  ctx.beginPath()
  ctx.ellipse(-headR * 0.40, headY - headR * 0.42, headR * 0.24, headR * 0.14, -0.5, 0, Math.PI * 2)
  ctx.fill()

  // 右向炮管
  const cannonX = headR * 0.58
  const cannonY = headY - headR * 0.42
  const cannonLen = headR * 0.58
  const cannonR = headR * 0.32
  ctx.save()
  ctx.translate(cannonX, cannonY)
  ctx.rotate(-0.30)
  pvzLine(ctx, pen, OUT, 3.0)
  ctx.fillStyle = '#D96B33'
  ctx.beginPath()
  ctx.ellipse(cannonR * 0.08, 0, cannonR * 0.26, cannonR * 0.92, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  const cg = ctx.createLinearGradient(0, -cannonR, 0, cannonR)
  cg.addColorStop(0, '#FFC894')
  cg.addColorStop(0.5, '#FF8B52')
  cg.addColorStop(1, '#E05A2B')
  ctx.fillStyle = cg
  ctx.beginPath()
  safeRoundRect(ctx, 0, -cannonR, cannonLen, cannonR * 2, cannonR * 0.5)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#B23A14'
  ctx.beginPath()
  ctx.ellipse(cannonLen, 0, cannonR * 0.40, cannonR * 0.88, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#3E0F0A'
  ctx.beginPath()
  ctx.ellipse(cannonLen, 0, cannonR * 0.26, cannonR * 0.60, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // 管口火苗
  const muzzleDist = cannonLen + cannonR * 0.55
  drawFlame(ctx,
    cannonX + Math.cos(-0.30) * muzzleDist,
    cannonY + Math.sin(-0.30) * muzzleDist,
    headR * 0.26, headR * 0.38, sway * 0.8)
  // 头顶火苗冠
  drawFlame(ctx, -headR * 0.26, headY - headR * 0.80, headR * 0.26, headR * 0.44, -sway * 0.6)
  drawFlame(ctx, headR * 0.24, headY - headR * 0.84, headR * 0.34, headR * 0.60, sway)

  drawPvzFace(ctx, pen, {
    eyeDX: headR * 0.30, eyeY: headY + headR * 0.10, eyeR: headR * 0.155,
    white: true, pupilDx: 0.02, pupilDy: -0.12,
    brow: 'angry', browColor: '#7E2410', browBold: 2.3,
    mouth: 'grit',
    mouthY: headY + headR * 0.46, mouthRx: headR * 0.20, mouthRy: headR * 0.10,
    blush: 'rgba(255,196,120,0.45)',
    ink: '#5A1408', wobblePhase: p.wobble,
  })
}

/* ============ 坚果墙 ============ */
function drawWall(ctx: Ctx2D, pen: Pen, p: PlantPaintCtx, r: number) {
  const OUT = PZ.OUT_NUT
  const headR = r * 1.0
  const headY = r * 0.02
  const wallHp = p.maxHealth > 0 ? Math.max(0, p.health / p.maxHealth) : 1

  const bodyPath = () => {
    ctx.beginPath()
    ctx.ellipse(0, headY, headR * 0.90, headR * 1.06, 0, 0, Math.PI * 2)
  }
  const wg = ctx.createRadialGradient(-headR * 0.34, headY - headR * 0.44, 0, 0, headY, headR * 1.35)
  wg.addColorStop(0, '#E2B173')
  wg.addColorStop(0.5, '#C98C4C')
  wg.addColorStop(1, '#8F5A28')
  pvzLine(ctx, pen, OUT, 3.2)
  ctx.fillStyle = wg
  bodyPath()
  ctx.fill(); ctx.stroke()
  ctx.save()
  bodyPath(); ctx.clip()
  ctx.fillStyle = 'rgba(93,58,26,0.20)'
  ctx.beginPath()
  ctx.ellipse(headR * 0.20, headY + headR * 0.72, headR * 0.85, headR * 0.52, 0.1, 0, Math.PI * 2)
  ctx.fill()
  pvzLine(ctx, pen, 'rgba(93,58,26,0.38)', 2.2)
  for (const gx of [-headR * 0.42, 0, headR * 0.42]) {
    ctx.beginPath()
    ctx.moveTo(gx, headY - headR * 1.00)
    ctx.quadraticCurveTo(gx * 1.30, headY, gx, headY + headR * 1.00)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(93,58,26,0.30)'
  ;[[-headR * 0.58, headY - headR * 0.55, headR * 0.045],
    [headR * 0.55, headY - headR * 0.62, headR * 0.04],
    [-headR * 0.62, headY + headR * 0.30, headR * 0.04],
    [headR * 0.60, headY + headR * 0.38, headR * 0.05]].forEach(([fx2, fy2, fr]) => {
    ctx.beginPath()
    ctx.arc(fx2, fy2, fr, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.restore()
  ctx.fillStyle = 'rgba(255,255,255,0.30)'
  ctx.beginPath()
  ctx.ellipse(-headR * 0.38, headY - headR * 0.52, headR * 0.22, headR * 0.30, -0.5, 0, Math.PI * 2)
  ctx.fill()
  pvzLine(ctx, pen, OUT, 2.6)
  ctx.fillStyle = '#7A4A20'
  ctx.beginPath()
  ctx.ellipse(0, headY - headR * 1.06, headR * 0.13, headR * 0.09, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()

  // 耐久裂纹
  if (wallHp < 0.66) {
    ctx.save()
    bodyPath(); ctx.clip()
    pvzLine(ctx, pen, 'rgba(46,22,4,0.80)', 2.6)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(headR * 0.46, headY - headR * 0.76)
    ctx.quadraticCurveTo(headR * 0.30, headY - headR * 0.58, headR * 0.46, headY - headR * 0.42)
    ctx.quadraticCurveTo(headR * 0.58, headY - headR * 0.28, headR * 0.44, headY - headR * 0.12)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-headR * 0.60, headY - headR * 0.06)
    ctx.quadraticCurveTo(-headR * 0.44, headY + headR * 0.10, -headR * 0.58, headY + headR * 0.26)
    ctx.stroke()
    if (wallHp < 0.33) {
      ctx.beginPath()
      ctx.moveTo(-headR * 0.05, headY - headR * 1.02)
      ctx.quadraticCurveTo(headR * 0.08, headY - headR * 0.84, -headR * 0.03, headY - headR * 0.68)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(headR * 0.34, headY + headR * 0.48)
      ctx.quadraticCurveTo(headR * 0.18, headY + headR * 0.62, headR * 0.32, headY + headR * 0.78)
      ctx.stroke()
      ctx.fillStyle = 'rgba(46,22,4,0.50)'
      ctx.beginPath()
      ctx.moveTo(headR * 0.44, headY - headR * 0.30)
      ctx.lineTo(headR * 0.20, headY - headR * 0.26)
      ctx.lineTo(headR * 0.36, headY - headR * 0.12)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(-headR * 0.56, headY + headR * 0.44)
      ctx.lineTo(-headR * 0.34, headY + headR * 0.50)
      ctx.lineTo(-headR * 0.50, headY + headR * 0.62)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }

  drawPvzFace(ctx, pen, {
    eyeDX: headR * 0.30, eyeY: headY - headR * 0.18, eyeR: headR * 0.185,
    white: true, pupilDx: -0.12, pupilDy: -0.30,
    brow: 'worried', browColor: '#4A2C10', browBold: 1.8,
    mouth: wallHp < 0.33 ? 'frown' : 'flat',
    mouthY: headY + headR * 0.34, mouthRx: headR * 0.12, mouthRy: headR * 0.06,
    ink: '#3B2B1A', wobblePhase: p.wobble,
  })
}

/* ============ 寒冰射手 ============ */
function drawFreezer(ctx: Ctx2D, pen: Pen, p: PlantPaintCtx, r: number) {
  const OUT = PZ.OUT_ICE
  const headR = r * 0.98
  const headY = -r * 0.22

  const bodyY = r * 0.60
  const mound = ctx.createRadialGradient(-r * 0.25, bodyY - r * 0.28, 0, 0, bodyY, r * 0.95)
  mound.addColorStop(0, '#7FBF4E')
  mound.addColorStop(0.6, '#5FA83E')
  mound.addColorStop(1, '#447C2C')
  pvzLine(ctx, pen, '#2F5E1E', 3.0)
  ctx.fillStyle = mound
  ctx.beginPath()
  ctx.ellipse(0, bodyY, r * 0.82, r * 0.44, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  pvzLeaf(ctx, pen, -r * 0.30, bodyY + r * 0.02, r * 0.66, r * 0.30, -1, '#4E9133', '#2F5E1E', 3.0)
  pvzLeaf(ctx, pen, r * 0.30, bodyY + r * 0.02, r * 0.66, r * 0.30, 1, '#5FA83E', '#2F5E1E', 3.0)

  pvzLine(ctx, pen, '#2F5E1E', 3.0)
  ctx.fillStyle = '#5FA83E'
  ctx.beginPath()
  safeRoundRect(ctx, -r * 0.15, headY + headR * 0.48, r * 0.30, r * 0.48, r * 0.13)
  ctx.fill(); ctx.stroke()

  const headGrad = ctx.createRadialGradient(-headR * 0.38, headY - headR * 0.38, 0, 0, headY, headR * 1.12)
  headGrad.addColorStop(0, '#D5F4F6')
  headGrad.addColorStop(0.55, '#A5DFE8')
  headGrad.addColorStop(1, '#6FB9CC')
  pvzLine(ctx, pen, OUT, 3.2)
  ctx.fillStyle = headGrad
  ctx.beginPath()
  ctx.ellipse(0, headY, headR, headR * 0.94, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, headY, headR, headR * 0.94, 0, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = 'rgba(61,126,150,0.16)'
  ctx.beginPath()
  ctx.ellipse(headR * 0.42, headY + headR * 0.52, headR * 0.72, headR * 0.50, 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.beginPath()
  ctx.arc(-headR * 0.50, headY - headR * 0.10, headR * 0.045, 0, Math.PI * 2)
  ctx.arc(headR * 0.34, headY - headR * 0.60, headR * 0.04, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = 'rgba(255,255,255,0.36)'
  ctx.beginPath()
  ctx.ellipse(-headR * 0.40, headY - headR * 0.42, headR * 0.24, headR * 0.14, -0.5, 0, Math.PI * 2)
  ctx.fill()

  const cannonX = headR * 0.58
  const cannonY = headY - headR * 0.42
  const cannonLen = headR * 0.58
  const cannonR = headR * 0.32
  ctx.save()
  ctx.translate(cannonX, cannonY)
  ctx.rotate(-0.30)
  pvzLine(ctx, pen, OUT, 3.0)
  ctx.fillStyle = '#8CCFDD'
  ctx.beginPath()
  ctx.ellipse(cannonR * 0.08, 0, cannonR * 0.26, cannonR * 0.92, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  const cg = ctx.createLinearGradient(0, -cannonR, 0, cannonR)
  cg.addColorStop(0, '#D5F4F6')
  cg.addColorStop(0.5, '#A5DFE8')
  cg.addColorStop(1, '#6FB9CC')
  ctx.fillStyle = cg
  ctx.beginPath()
  safeRoundRect(ctx, 0, -cannonR, cannonLen, cannonR * 2, cannonR * 0.5)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#2E6B80'
  ctx.beginPath()
  ctx.ellipse(cannonLen, 0, cannonR * 0.40, cannonR * 0.88, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#143B4A'
  ctx.beginPath()
  ctx.ellipse(cannonLen, 0, cannonR * 0.26, cannonR * 0.60, 0, 0, Math.PI * 2)
  ctx.fill()
  // 管口寒雾
  const mistSway = Math.sin(p.wobble * 1.6) * headR * 0.03
  ctx.fillStyle = 'rgba(224,248,252,0.55)'
  ctx.beginPath()
  ctx.ellipse(cannonLen + cannonR * 0.55 + mistSway, -cannonR * 0.28, cannonR * 0.34, cannonR * 0.24, -0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(cannonLen + cannonR * 0.72 + mistSway * 0.6, cannonR * 0.10, cannonR * 0.26, cannonR * 0.18, 0.25, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // 头顶三叉冰晶
  ctx.save()
  ctx.translate(0, headY - headR * 0.86)
  ctx.rotate(-0.10)
  const drawCrystal = (w: number, h: number, tilt: number) => {
    ctx.save()
    ctx.rotate(tilt)
    pvzLine(ctx, pen, OUT, 2.6)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(-w * 0.5, -h * 0.32)
    ctx.lineTo(0, -h)
    ctx.lineTo(w * 0.5, -h * 0.32)
    ctx.closePath()
    ctx.fillStyle = '#EFFBFD'
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#B8E6EE'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, -h)
    ctx.lineTo(w * 0.5, -h * 0.32)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  drawCrystal(headR * 0.26, headR * 0.44, -0.62)
  drawCrystal(headR * 0.26, headR * 0.44, 0.62)
  drawCrystal(headR * 0.30, headR * 0.58, -0.34)
  drawCrystal(headR * 0.34, headR * 0.66, 0.34)
  drawCrystal(headR * 0.38, headR * 0.92, 0)
  ctx.restore()

  drawPvzFace(ctx, pen, {
    eyeDX: headR * 0.30, eyeY: headY + headR * 0.10, eyeR: headR * 0.155,
    white: true, pupilDx: 0.02, pupilDy: -0.10,
    brow: 'angry', browColor: '#1F5568', browBold: 2.2,
    mouth: 'flat',
    mouthY: headY + headR * 0.46, mouthRx: headR * 0.085, mouthRy: headR * 0.075,
    blush: 'rgba(150,214,255,0.50)',
    ink: '#1F3A45', wobblePhase: p.wobble,
  })
}

/* ============ 樱桃炸弹 ============ */
function drawCherry(ctx: Ctx2D, pen: Pen, p: PlantPaintCtx, r: number) {
  const OUT = PZ.OUT_RED
  const headY = -r * 0.05
  const lx = -r * 0.40, ly = headY + r * 0.08, lr = r * 0.58
  const rx = r * 0.44, ry = headY - r * 0.00, rr = r * 0.44
  const fuseLeft = p.fuseTimer || 0
  const shake = fuseLeft > 0 && fuseLeft < 800
    ? (Math.sin(p.t / 30) * (1 - fuseLeft / 800) * 4)
    : 0

  ctx.save()
  if (shake) ctx.translate(shake, 0)
  ctx.lineJoin = 'round'

  if (fuseLeft > 0 && fuseLeft < 1000) {
    const auraA = 0.22 + 0.18 * Math.abs(Math.sin(p.t / 90))
    const aura = ctx.createRadialGradient(lx, ly, lr * 0.3, lx, ly, lr * 1.9)
    aura.addColorStop(0, `rgba(255,87,34,${auraA.toFixed(3)})`)
    aura.addColorStop(1, 'rgba(255,87,34,0)')
    ctx.fillStyle = aura
    ctx.beginPath()
    ctx.arc(lx, ly, lr * 1.9, 0, Math.PI * 2)
    ctx.fill()
  }

  // 双茎
  const stemW = r * 0.12
  const drawStem = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number) => {
    ctx.lineCap = 'round'
    pvzLine(ctx, pen, OUT, 3.4)
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.quadraticCurveTo(cx, cy, x1, y1)
    ctx.strokeStyle = OUT
    ctx.lineWidth = stemW + pen.w(2.6)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.quadraticCurveTo(cx, cy, x1, y1)
    ctx.strokeStyle = '#5FA83E'
    ctx.lineWidth = stemW
    ctx.stroke()
  }
  const lTipX = lx - r * 0.20, lTipY = ly - lr - r * 0.38
  drawStem(lx + r * 0.02, ly - lr * 0.86, lx - r * 0.02, ly - lr - r * 0.26, lTipX, lTipY)
  const rTipX = rx + r * 0.20, rTipY = ry - rr - r * 0.34
  drawStem(rx, ry - rr * 0.86, rx + r * 0.04, ry - rr - r * 0.24, rTipX, rTipY)

  pvzLeaf(ctx, pen, lx - r * 0.14, ly - lr - r * 0.20, r * 0.30, r * 0.12, -1, '#5FA83E', '#2F5E1E', 2.4)
  pvzLeaf(ctx, pen, rx + r * 0.12, ry - rr - r * 0.16, r * 0.24, r * 0.10, 1, '#5FA83E', '#2F5E1E', 2.4)
  const calyx = (cx: number, cy: number, s: number, flip: boolean) => {
    pvzLine(ctx, pen, '#2F5E1E', 2.0)
    const arms = flip
      ? [[-s * 0.34, -s * 0.30], [-s * 0.06, -s * 0.46], [s * 0.26, -s * 0.34]]
      : [[-s * 0.26, -s * 0.34], [s * 0.06, -s * 0.46], [s * 0.34, -s * 0.30]]
    for (const [ax, ay] of arms) {
      ctx.fillStyle = '#4E9133'
      ctx.beginPath()
      ctx.moveTo(cx - s * 0.09, cy)
      ctx.quadraticCurveTo(cx + ax * 0.5, cy + ay * 0.55, cx + ax, cy + ay)
      ctx.quadraticCurveTo(cx + ax * 0.55, cy + ay * 0.45, cx + s * 0.09, cy)
      ctx.closePath()
      ctx.fill(); ctx.stroke()
    }
  }

  // 后樱桃
  const rg = ctx.createRadialGradient(rx - rr * 0.32, ry - rr * 0.36, 0, rx, ry, rr * 1.12)
  rg.addColorStop(0, '#F05046')
  rg.addColorStop(0.55, '#D93528')
  rg.addColorStop(1, '#A81F16')
  pvzLine(ctx, pen, OUT, 3.0)
  ctx.fillStyle = rg
  ctx.beginPath()
  ctx.arc(rx, ry, rr, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.beginPath()
  ctx.ellipse(rx - rr * 0.32, ry - rr * 0.36, rr * 0.20, rr * 0.28, -0.5, 0, Math.PI * 2)
  ctx.fill()

  // 前樱桃
  const lg = ctx.createRadialGradient(lx - lr * 0.34, ly - lr * 0.40, 0, lx, ly, lr * 1.15)
  lg.addColorStop(0, '#FF7A6E')
  lg.addColorStop(0.45, '#F05046')
  lg.addColorStop(0.8, '#D93528')
  lg.addColorStop(1, '#A81F16')
  pvzLine(ctx, pen, OUT, 3.2)
  ctx.fillStyle = lg
  ctx.beginPath()
  ctx.arc(lx, ly, lr, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.ellipse(lx - lr * 0.36, ly - lr * 0.42, lr * 0.22, lr * 0.15, -0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.beginPath()
  ctx.arc(lx + lr * 0.42, ly + lr * 0.38, lr * 0.07, 0, Math.PI * 2)
  ctx.fill()

  // 双樱绿萼（星形萼片，参照附图，叠在樱桃顶）
  calyx(lx, ly - lr + r * 0.02, r * 0.40, false)
  calyx(rx, ry - rr + r * 0.02, r * 0.32, true)

  const faceOf = (cx: number, cy: number, rad: number, phase: number) => {
    drawPvzFace(ctx, pen, {
      eyeDX: rad * 0.30, eyeY: cy - rad * 0.06, eyeR: rad * 0.20,
      white: true, pupilDx: 0.02, pupilDy: -0.18,
      brow: 'angry', browColor: '#5B1512', browBold: 2.0,
      mouth: 'frown',
      mouthY: cy + rad * 0.34, mouthRx: rad * 0.14, mouthRy: rad * 0.07,
      ink: '#3B1210', wobblePhase: phase,
    })
  }
  faceOf(rx, ry, rr, p.wobble + 2.1)
  faceOf(lx, ly, lr, p.wobble)

  if (fuseLeft > 0 && fuseLeft < 1000) {
    const sparkAlpha = 0.4 + 0.6 * Math.abs(Math.sin(p.t / (fuseLeft < 500 ? 50 : 100)))
    ctx.globalAlpha = sparkAlpha
    ctx.fillStyle = '#FF9800'
    starShape(ctx, rTipX, rTipY, r * 0.20, 5, 0.45)
    ctx.fill()
    ctx.fillStyle = '#FFF176'
    starShape(ctx, rTipX, rTipY, r * 0.12, 4, 0.5)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.beginPath()
    ctx.arc(rTipX, rTipY - r * 0.16, r * 0.07, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
  ctx.restore()
}

/* ============ 食人花 ============ */
function drawChomper(ctx: Ctx2D, pen: Pen, p: PlantPaintCtx, r: number) {
  const OUT = PZ.OUT_PURPLE
  const headR = r * 1.02
  const headY = -r * 0.30
  const CH = PLANT.CHOMPER
  const biteP = p.chomperState === 'snap' ? clamp01(p.stateTimer / CH.SNAP_DURATION_MS) : 0
  let swalP = 0
  if (p.chomperState === 'swallow') {
    const swallowTime = p.stateTimer === -1 ? CH.NO_BITE_SWALLOW_MS : (PLANT_TYPES.chomper.swallowTime || 3000)
    const elapsed = p.stateTimer === -1 ? p.stateTimer + 1 + swallowTime : p.stateTimer
    swalP = clamp01(elapsed / swallowTime)
  }
  const wobblePhase = p.wobble

  const swallowScale = 1 + swalP * 0.12
  const swallowOffY = swalP * r * 0.08
  ctx.save()
  ctx.translate(0, swallowOffY)
  ctx.scale(swallowScale, swallowScale)

  const bodyY = r * 0.60
  const mound = ctx.createRadialGradient(-r * 0.25, bodyY - r * 0.28, 0, 0, bodyY, r * 0.95)
  mound.addColorStop(0, '#7FBF4E')
  mound.addColorStop(0.6, '#5FA83E')
  mound.addColorStop(1, '#447C2C')
  pvzLine(ctx, pen, '#2F5E1E', 3.0)
  ctx.fillStyle = mound
  ctx.beginPath()
  ctx.ellipse(0, bodyY, r * 0.82, r * 0.44, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  pvzLeaf(ctx, pen, -r * 0.30, bodyY + r * 0.02, r * 0.66, r * 0.30, -1, '#4E9133', '#2F5E1E', 3.0)
  pvzLeaf(ctx, pen, r * 0.30, bodyY + r * 0.02, r * 0.66, r * 0.30, 1, '#5FA83E', '#2F5E1E', 3.0)
  if (swalP > 0.05) {
    pvzLine(ctx, pen, '#2F5E1E', 3.0)
    ctx.fillStyle = '#5FA83E'
    ctx.beginPath()
    ctx.ellipse(0, r * 0.28, r * (0.28 + swalP * 0.20), r * (0.22 + swalP * 0.10), 0, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
  }
  pvzLine(ctx, pen, '#2F5E1E', 3.0)
  const stemGrad = ctx.createLinearGradient(-r * 0.15, 0, r * 0.15, 0)
  stemGrad.addColorStop(0, '#7FBF4E')
  stemGrad.addColorStop(0.5, '#5FA83E')
  stemGrad.addColorStop(1, '#447C2C')
  ctx.fillStyle = stemGrad
  ctx.beginPath()
  safeRoundRect(ctx, -r * 0.14, headY + headR * 0.55, r * 0.28, r * 0.50, r * 0.12)
  ctx.fill(); ctx.stroke()

  ctx.save()
  const snapLungeX = Math.sin(biteP * Math.PI) * r * 0.10
  const snapLungeY = -Math.sin(biteP * Math.PI) * r * 0.08
  ctx.translate(snapLungeX, snapLungeY)
  const headGrad = ctx.createRadialGradient(-headR * 0.30, headY - headR * 0.42, 0, 0, headY - headR * 0.10, headR * 1.18)
  headGrad.addColorStop(0, '#C9A2EE')
  headGrad.addColorStop(0.55, '#A55FD4')
  headGrad.addColorStop(1, '#7A3AA5')
  pvzLine(ctx, pen, OUT, 3.2)
  ctx.fillStyle = headGrad
  ctx.beginPath()
  ctx.ellipse(0, headY, headR * 1.02, headR * 0.96, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()

  // 正面大嘴（胶囊口腔 + 厚唇 + 上下双排獠牙，v94 参照附图正面食人花）
  let mouthOpen: number
  if (p.chomperState === 'snap') {
    mouthOpen = biteP < 0.45
      ? 0.35 + (biteP / 0.45) * 0.95
      : 1.30 - ((biteP - 0.45) / 0.55) * 0.95
  } else if (p.chomperState === 'swallow') {
    mouthOpen = 0.12
  } else {
    mouthOpen = 0.45 + 0.25 * Math.sin(wobblePhase)
  }
  mouthOpen = Math.max(0.10, Math.min(1.30, mouthOpen))
  const mouthFlash = p.chomperState === 'snap' && biteP >= 0.4 && biteP <= 0.65
  const openN = Math.min(1, mouthOpen / 1.30)
  const mW = headR * 1.08
  const mH = headR * (0.14 + 0.64 * openN)
  const mCY = headY + headR * 0.36
  // 厚唇（紫红外圈胶囊）
  pvzLine(ctx, pen, OUT, 3.0)
  ctx.fillStyle = '#8A46B4'
  ctx.beginPath()
  safeRoundRect(ctx, -mW / 2, mCY - mH / 2, mW, mH, Math.min(mH / 2, headR * 0.26))
  ctx.fill(); ctx.stroke()
  // 口腔（近黑紫内腔 + 咬合红闪）
  const inPad = headR * 0.070
  const cavPath = () => {
    ctx.beginPath()
    safeRoundRect(ctx, -mW / 2 + inPad, mCY - mH / 2 + inPad,
      mW - inPad * 2, Math.max(headR * 0.045, mH - inPad * 2),
      Math.max(headR * 0.03, (mH - inPad * 2) * 0.36))
  }
  ctx.fillStyle = mouthFlash ? '#D32F2F' : '#3A0D52'
  cavPath()
  ctx.fill()
  // 上下双排獠牙
  if (mH > headR * 0.20) {
    ctx.save()
    cavPath(); ctx.clip()
    const toothH = Math.min(mH * 0.40, headR * 0.20)
    const topY = mCY - mH / 2 + inPad
    const botY = mCY + mH / 2 - inPad
    const nx = 4, gap = (mW - inPad * 2.2) / nx
    ctx.fillStyle = '#FFF7EA'
    for (let i = 0; i < nx; i++) {
      const tx = -mW / 2 + inPad * 1.1 + gap * (i + 0.5)
      ctx.beginPath()
      ctx.moveTo(tx - gap * 0.30, topY)
      ctx.lineTo(tx + gap * 0.30, topY)
      ctx.lineTo(tx, topY + toothH * (i % 2 === 0 ? 1 : 0.70))
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(tx - gap * 0.26, botY)
      ctx.lineTo(tx + gap * 0.26, botY)
      ctx.lineTo(tx + gap * 0.03, botY - toothH * (i % 2 === 1 ? 0.95 : 0.62))
      ctx.closePath()
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(150,40,80,0.45)'
    ctx.beginPath()
    ctx.ellipse(0, botY - mH * 0.08, mW * 0.30, mH * 0.15, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // 斑点
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, headY, headR * 1.02, headR * 0.96, 0, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = 'rgba(94,43,133,0.65)'
  ;[[-headR * 0.58, headY - headR * 0.42, headR * 0.12],
    [headR * 0.52, headY - headR * 0.55, headR * 0.09],
    [-headR * 0.30, headY - headR * 0.78, headR * 0.08],
    [-headR * 0.72, headY + headR * 0.14, headR * 0.09],
    [headR * 0.66, headY + headR * 0.02, headR * 0.08]].forEach(([sx, sy, sr]) => {
    ctx.beginPath()
    ctx.arc(sx, sy, sr, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.restore()
  ctx.fillStyle = 'rgba(255,255,255,0.30)'
  ctx.beginPath()
  ctx.ellipse(-headR * 0.44, headY - headR * 0.44, headR * 0.22, headR * 0.14, -0.5, 0, Math.PI * 2)
  ctx.fill()

  drawPvzFace(ctx, pen, {
    eyeDX: headR * 0.30, eyeY: headY - headR * 0.40, eyeR: headR * 0.135,
    white: true, pupilDx: 0.02, pupilDy: 0.06,
    brow: 'angry', browColor: '#3B1252', browBold: 2.3,
    mouth: 'none', ink: '#2A0F3E', wobblePhase,
  })

  ctx.restore()
  ctx.restore()
}

/* ============ 向日葵 ============ */
function drawSunflower(ctx: Ctx2D, pen: Pen, p: PlantPaintCtx, r: number) {
  const OUT = PZ.OUT_SUN
  const headR = r * 0.95
  const headY = -r * 0.18
  const wobble = Math.sin(p.wobble) * 0.05

  // 茎 + 两片大叶
  pvzLine(ctx, pen, '#2F5E1E', 3.0)
  const stemGrad = ctx.createLinearGradient(0, r * 0.02, 0, r * 0.58)
  stemGrad.addColorStop(0, '#7CB342')
  stemGrad.addColorStop(1, '#4E8B32')
  ctx.fillStyle = stemGrad
  ctx.beginPath()
  safeRoundRect(ctx, -r * 0.13, r * 0.02, r * 0.26, r * 0.58, r * 0.13)
  ctx.fill(); ctx.stroke()
  pvzLeaf(ctx, pen, -r * 0.12, r * 0.40, r * 0.62, r * 0.26, -1, '#5E9433', '#2F5E1E', 2.8)
  pvzLeaf(ctx, pen, r * 0.12, r * 0.40, r * 0.62, r * 0.26, 1, '#6BA83A', '#2F5E1E', 2.8)

  // 双层 24 圆瓣（v94 圆头宽瓣，参照附图）
  const petal = (rad: number, len: number, wid: number, angle: number, fill: string, edge: string) => {
    const px = Math.cos(angle) * rad
    const py = headY + Math.sin(angle) * rad
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(angle + Math.PI / 2)
    pvzLine(ctx, pen, edge, 1.9)
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.moveTo(-wid, 0)
    ctx.bezierCurveTo(-wid * 1.10, -len * 0.52, -wid * 0.62, -len * 1.06, 0, -len)
    ctx.bezierCurveTo(wid * 0.62, -len * 1.06, wid * 1.10, -len * 0.52, wid, 0)
    ctx.quadraticCurveTo(0, len * 0.30, -wid, 0)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    ctx.restore()
  }
  const petalRad = headR * 0.74, petalLen = headR * 0.50, petalWid = headR * 0.155
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + Math.PI / 12 + wobble * 1.2
    petal(petalRad - headR * 0.02, petalLen * 0.92, petalWid * 0.92, angle, '#F0A81C', OUT)
  }
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + wobble * 1.4
    petal(petalRad, petalLen, petalWid, angle, i % 2 === 0 ? '#FFD53E' : '#FFC53E', OUT)
  }

  // 花盘
  const discR = headR * 0.60
  const discGrad = ctx.createRadialGradient(-discR * 0.3, headY - discR * 0.35, 0, 0, headY, discR * 1.15)
  discGrad.addColorStop(0, '#FFC063')
  discGrad.addColorStop(0.6, '#F7A62B')
  discGrad.addColorStop(1, '#E8890C')
  pvzLine(ctx, pen, OUT, 2.8)
  ctx.fillStyle = discGrad
  ctx.beginPath()
  ctx.arc(0, headY, discR, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.save()
  ctx.beginPath()
  ctx.arc(0, headY, discR, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = 'rgba(199,119,0,0.22)'
  ctx.beginPath()
  ctx.ellipse(discR * 0.18, headY + discR * 0.62, discR * 0.9, discR * 0.5, 0.1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.ellipse(-discR * 0.38, headY - discR * 0.44, discR * 0.30, discR * 0.16, -0.5, 0, Math.PI * 2)
  ctx.fill()

  drawPvzFace(ctx, pen, {
    eyeDX: headR * 0.23, eyeY: headY - headR * 0.04, eyeR: headR * 0.115,
    white: false, brow: 'none',
    mouth: 'smile-open',
    mouthY: headY + headR * 0.16, mouthRx: headR * 0.22, mouthRy: headR * 0.15,
    blush: 'rgba(255,132,72,0.48)',
    ink: '#4A2C0F', wobblePhase: p.wobble,
  })
}
