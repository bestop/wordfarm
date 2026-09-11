// src/game/painters/plantPainter.ts - 植物矢量萌绘（小程序 renderer.js 七植物移植）
//   · 白描边阵营 + 亮高光（与僵尸暗描边阵营对立）
//   · 表情系统 _drawCuteFace：眨眼 / 双高光瞳孔 / 圆腮红 / 6 种嘴型
//   · 朝向适配：网页为横向车道（僵尸右→左），炮管类植物改朝右，
//     其余正面构图（坚果/樱桃/食人花/向日葵）1:1 移植
import type { PlantType } from '../constants'
import { PLANT, PLANT_TYPES } from '../constants'
import { COLORS, STROKE, FACE, HEAD, SHADOW, Pen, safeRoundRect } from './tokens'

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

/** 总入口：ctx 已平移至植物中心（0,0）。含阴影 / 主体 / 血条 */
export function drawPlantArt(ctx: Ctx2D, pen: Pen, p: PlantPaintCtx, r: number) {
  pen.setBase(r)
  // 地面阴影椭圆（统一 Tokens 比例）
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
    const barW = r * 1.8
    const barH = Math.max(4, r * 0.12)
    const barY = -r * 1.55
    ctx.globalAlpha = 1
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    safeRoundRect(ctx, -barW / 2, barY, barW, barH, barH / 2)
    ctx.fill()
    ctx.fillStyle = '#66BB6A'
    const ratio = clamp01(p.health / p.maxHealth)
    if (ratio > 0) {
      safeRoundRect(ctx, -barW / 2, barY, barW * ratio, barH, barH / 2)
      ctx.fill()
    }
  }
}

/** 尖角火苗路径（底部中心 (0,0)，只建路径） */
function flameShape(ctx: Ctx2D, w: number, h: number) {
  ctx.beginPath()
  ctx.moveTo(-w * 0.5, 0)
  ctx.bezierCurveTo(-w * 0.52, -h * 0.32, -w * 0.3, -h * 0.55, -w * 0.14, -h * 0.82)
  ctx.quadraticCurveTo(-w * 0.03, -h * 0.96, 0, -h)
  ctx.quadraticCurveTo(w * 0.08, -h * 0.82, w * 0.2, -h * 0.68)
  ctx.bezierCurveTo(w * 0.44, -h * 0.48, w * 0.52, -h * 0.28, w * 0.5, 0)
  ctx.closePath()
}

/** 三层火苗：外深橙红 / 中橙 / 内亮黄 */
function drawFlame(ctx: Ctx2D, cx: number, cy: number, w: number, h: number, sway: number) {
  const layers: Array<[string, number, number, number]> = [
    [COLORS.FIRE_BODY_DARK, w, h, sway],
    [COLORS.FIRE_FLAME, w * 0.7, h * 0.7, sway * 0.55],
    [COLORS.FIRE_CORE, w * 0.4, h * 0.42, sway * 0.3],
  ]
  ctx.save()
  ctx.translate(cx, cy)
  for (const [color, lw, lh, ls] of layers) {
    ctx.save()
    ctx.translate(ls, 0)
    ctx.rotate(ls * 0.12)
    flameShape(ctx, lw, lh)
    ctx.fillStyle = color
    ctx.fill()
    ctx.restore()
  }
  ctx.restore()
}

/** 倒八字粗眉（怒目通用） */
function angryBrows(ctx: Ctx2D, pen: Pen, cx: number, eyeCY: number, headR: number, color: string, bold = 1.9) {
  const eyeDXb = headR * FACE.EYE_DX_RATIO
  const eyeRb = headR * FACE.EYE_R_RATIO
  const browY = eyeCY - eyeRb * 1.42
  pen.set(ctx, color, pen.w(STROKE.INK) * bold)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - eyeDXb - eyeRb * 0.75, browY + eyeRb * 0.55)
  ctx.quadraticCurveTo(cx - eyeDXb - eyeRb * 0.1, browY + eyeRb * 0.05, cx - eyeDXb + eyeRb * 0.75, browY - eyeRb * 0.65)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx + eyeDXb - eyeRb * 0.75, browY - eyeRb * 0.65)
  ctx.quadraticCurveTo(cx + eyeDXb + eyeRb * 0.1, browY + eyeRb * 0.05, cx + eyeDXb + eyeRb * 0.75, browY + eyeRb * 0.55)
  ctx.stroke()
}

/** 半球底座 + 纵向棱线（豌豆/火焰射手同款结构） */
function domeBase(ctx: Ctx2D, pen: Pen, r: number, cLight: string, cMid: string, cDark: string, veinColor: string) {
  const bodyY = r * 0.62
  const bodyRX = r * 0.85
  const bodyRY = r * 0.5
  const grad = ctx.createRadialGradient(-bodyRX * 0.3, bodyY - bodyRY * 0.5, 0, 0, bodyY, bodyRX * 1.1)
  grad.addColorStop(0, cLight)
  grad.addColorStop(0.55, cMid)
  grad.addColorStop(1, cDark)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.ellipse(0, bodyY, bodyRX, bodyRY, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, bodyY, bodyRX, bodyRY, 0, 0, Math.PI * 2)
  ctx.clip()
  pen.set(ctx, veinColor, pen.w(STROKE.THIN))
  for (let i = -2; i <= 2; i++) {
    const x = bodyRX * i * 0.32
    ctx.beginPath()
    ctx.moveTo(x, bodyY - bodyRY * 0.95)
    ctx.quadraticCurveTo(x * 1.15, bodyY, x, bodyY + bodyRY * 0.85)
    ctx.stroke()
  }
  ctx.restore()
}

/** 尖卵双叶（底座两侧，左深右浅 + 叶脉） */
function sideLeaves(ctx: Ctx2D, pen: Pen, r: number, cDark: string, cMid: string, veinColor: string) {
  const bodyY = r * 0.62
  ctx.fillStyle = cDark
  ctx.beginPath()
  ctx.moveTo(-r * 0.35, bodyY - r * 0.05)
  ctx.bezierCurveTo(-r * 1.15, bodyY - r * 0.18, -r * 1.2, bodyY + r * 0.25, -r * 0.95, bodyY + r * 0.32)
  ctx.bezierCurveTo(-r * 0.65, bodyY + r * 0.36, -r * 0.45, bodyY + r * 0.2, -r * 0.35, bodyY - r * 0.05)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  pen.set(ctx, veinColor, pen.w(STROKE.THIN))
  ctx.beginPath()
  ctx.moveTo(-r * 0.35, bodyY - r * 0.05)
  ctx.quadraticCurveTo(-r * 0.78, bodyY + r * 0.1, -r * 1.05, bodyY + r * 0.25)
  ctx.stroke()
  pen.set(ctx, COLORS.STROKE, pen.w(STROKE.MAIN))
  ctx.fillStyle = cMid
  ctx.beginPath()
  ctx.moveTo(r * 0.35, bodyY - r * 0.05)
  ctx.bezierCurveTo(r * 1.15, bodyY - r * 0.18, r * 1.2, bodyY + r * 0.25, r * 0.95, bodyY + r * 0.32)
  ctx.bezierCurveTo(r * 0.65, bodyY + r * 0.36, r * 0.45, bodyY + r * 0.2, r * 0.35, bodyY - r * 0.05)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  pen.set(ctx, veinColor, pen.w(STROKE.THIN))
  ctx.beginPath()
  ctx.moveTo(r * 0.35, bodyY - r * 0.05)
  ctx.quadraticCurveTo(r * 0.78, bodyY + r * 0.1, r * 1.05, bodyY + r * 0.25)
  ctx.stroke()
  pen.set(ctx, COLORS.STROKE, pen.w(STROKE.MAIN))
}

/** 茎 + 环形植物节 ×2 */
function stemWithRings(ctx: Ctx2D, pen: Pen, r: number, headR: number, headY: number, fill: string | CanvasGradient, veinColor: string) {
  ctx.fillStyle = fill
  safeRoundRect(ctx, -r * 0.17, headY + headR * 0.52, r * 0.34, r * 0.42, r * 0.13)
  ctx.fill(); ctx.stroke()
  pen.set(ctx, veinColor, pen.w(STROKE.THIN))
  for (let i = 0; i < 2; i++) {
    const y = headY + headR * 0.62 + i * r * 0.15
    ctx.beginPath()
    ctx.moveTo(-r * 0.15, y)
    ctx.quadraticCurveTo(0, y - r * 0.04, r * 0.15, y)
    ctx.stroke()
  }
  pen.set(ctx, COLORS.STROKE, pen.w(STROKE.MAIN))
}

// ============ 萌系表情（眨眼/双高光瞳孔/圆腮红/6 嘴型） ============
export function drawCuteFace(ctx: Ctx2D, pen: Pen, r: number, cy: number, opts: FaceOpts = {}) {
  const mouth = opts.mouth ?? 'smile'
  const wobblePhase = opts.wobblePhase ?? 0
  const blushColor = opts.blushColor ?? COLORS.BLUSH_PINK
  const inward = opts.pupilInward === true

  const eyeDX = r * FACE.EYE_DX_RATIO
  const eyeR = r * FACE.EYE_R_RATIO
  const eyeY = cy
  // 眨眼：约 2.5s 一次
  const blinkT = (Math.sin(wobblePhase) + 1) / 2
  const blink = blinkT > 0.94 ? 1 - (blinkT - 0.94) / 0.06 : 1
  const eyeH = Math.max(0.05, eyeR * blink)

  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // 眼白
  ctx.fillStyle = COLORS.STROKE
  ctx.beginPath()
  ctx.ellipse(-eyeDX, eyeY, eyeR * 0.96, eyeH, 0, 0, Math.PI * 2)
  ctx.ellipse(eyeDX, eyeY, eyeR * 0.96, eyeH, 0, 0, Math.PI * 2)
  ctx.fill()
  pen.set(ctx, COLORS.STROKE, pen.w(STROKE.EYE))
  ctx.stroke()

  if (blink > 0.4) {
    // 瞳孔（右下无辜感；inward → 向内斜视怒目）
    ctx.fillStyle = COLORS.INK
    const pupilR = eyeR * FACE.PUPIL_R_RATIO * blink
    const pOffY = eyeR * FACE.PUPIL_OFF_Y
    const pOffX2 = eyeR * FACE.PUPIL_OFF_X * (inward ? 1.6 : 1)
    const pOffY2 = eyeR * FACE.PUPIL_OFF_Y * (inward ? 0.5 : 1)
    const pLX = -eyeDX + pOffX2
    const pRX = eyeDX + (inward ? -pOffX2 : pOffX2)
    ctx.beginPath()
    ctx.arc(pLX, eyeY + pOffY2, pupilR, 0, Math.PI * 2)
    ctx.arc(pRX, eyeY + pOffY2, pupilR, 0, Math.PI * 2)
    ctx.fill()
    // 双高光
    ctx.fillStyle = COLORS.STROKE
    ctx.beginPath()
    ctx.arc(pLX + eyeR * 0.05, eyeY - eyeR * 0.08, pupilR * FACE.PUPIL_SHINE1, 0, Math.PI * 2)
    ctx.arc(pRX + eyeR * 0.05, eyeY - eyeR * 0.08, pupilR * FACE.PUPIL_SHINE1, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(pLX + eyeR * 0.38, eyeY + eyeR * 0.26, pupilR * FACE.PUPIL_SHINE2, 0, Math.PI * 2)
    ctx.arc(pRX + eyeR * 0.38, eyeY + eyeR * 0.26, pupilR * FACE.PUPIL_SHINE2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // 闭眼眯眯笑
    pen.set(ctx, COLORS.INK, pen.w(STROKE.INK))
    ctx.beginPath()
    ctx.arc(-eyeDX, eyeY + eyeR * 0.2, eyeR * 0.5, Math.PI * 1.12, Math.PI * 1.88)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(eyeDX, eyeY + eyeR * 0.2, eyeR * 0.5, Math.PI * 1.12, Math.PI * 1.88)
    ctx.stroke()
  }

  // 圆腮红
  ctx.fillStyle = blushColor
  const blushCX = r * FACE.BLUSH_CX
  const blushCY = cy + r * FACE.BLUSH_CY
  const blushR = r * FACE.BLUSH_SIZE * 1.15
  ctx.beginPath()
  ctx.arc(-blushCX, blushCY, blushR, 0, Math.PI * 2)
  ctx.arc(blushCX, blushCY, blushR, 0, Math.PI * 2)
  ctx.fill()

  // 嘴型
  const mouthY = cy + r * FACE.MOUTH_Y_OFFSET
  if (mouth === 'o') {
    ctx.fillStyle = COLORS.MOUTH_PINK
    ctx.beginPath()
    ctx.ellipse(0, mouthY, r * 0.13, r * 0.18, 0, 0, Math.PI * 2)
    ctx.fill()
    pen.set(ctx, COLORS.STROKE, pen.w(STROKE.LIP))
    ctx.stroke()
    ctx.fillStyle = COLORS.MOUTH_LIP
    ctx.beginPath()
    ctx.ellipse(0, mouthY + r * 0.06, r * 0.06, r * 0.07, 0, 0, Math.PI * 2)
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
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-r * 0.18, mouthY - r * 0.05)
    ctx.lineTo(r * 0.18, mouthY - r * 0.05)
    ctx.stroke()
  } else if (mouth === 'pout') {
    pen.set(ctx, COLORS.INK, pen.w(STROKE.INK))
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-r * 0.17, mouthY + r * 0.045)
    ctx.quadraticCurveTo(0, mouthY - r * 0.075, r * 0.17, mouthY + r * 0.045)
    ctx.stroke()
  } else if (mouth === 'none') {
    // 不画嘴（食人花嘴部让给大嘴结构）
  } else {
    pen.set(ctx, COLORS.INK, pen.w(STROKE.INK))
    ctx.beginPath()
    ctx.arc(0, mouthY - r * 0.15, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()
  }
  ctx.restore()
}

// ============ 豌豆射手（炮管朝右适配） ============
function drawShooter(ctx: Ctx2D, pen: Pen, p: PlantPaintCtx, r: number) {
  const headR = r
  const headY = -r * 0.25

  // 1. 半球底座 + 棱线
  domeBase(ctx, pen, r, COLORS.S_LEAF_LIGHT, COLORS.S_STEM, '#558B2F', 'rgba(85,107,47,0.55)')
  // 2. 两侧大叶
  sideLeaves(ctx, pen, r, COLORS.S_LEAF_DARK, COLORS.S_LEAF_MID, 'rgba(85,107,47,0.55)')
  // 3. 茎 + 环形节
  stemWithRings(ctx, pen, r, headR, headY, COLORS.S_STEM, 'rgba(85,107,47,0.55)')
  // 4. 头部（径向渐变）
  const headGrad = ctx.createRadialGradient(-headR * 0.35, headY - headR * 0.35, 0, 0, headY, headR * 1.1)
  headGrad.addColorStop(0, COLORS.S_LEAF_LIGHT)
  headGrad.addColorStop(0.55, p.color)
  headGrad.addColorStop(1, '#558B2F')
  pen.set(ctx, COLORS.STROKE, pen.w(STROKE.MAIN))
  ctx.fillStyle = headGrad
  ctx.beginPath()
  ctx.ellipse(0, headY, headR, headR * 0.95, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  // 5. 左上月牙高光
  ctx.fillStyle = `rgba(255,255,255,${HEAD.HLIGHT_ALPHA})`
  ctx.beginPath()
  ctx.ellipse(headR * HEAD.HLIGHT_X, headY + headR * HEAD.HLIGHT_Y,
    headR * HEAD.HLIGHT_W, headR * HEAD.HLIGHT_H, HEAD.HLIGHT_ROT, 0, Math.PI * 2)
  ctx.fill()
  // 6. 右向炮管（横向适配：安装于头右侧，微仰 -0.22）
  const cannonX = headR * 0.55
  const cannonY = headY - headR * 0.3
  const cannonLen = headR * 0.62
  const cannonR = headR * 0.28
  ctx.save()
  ctx.translate(cannonX, cannonY)
  ctx.rotate(-0.22)
  const cannonGrad = ctx.createLinearGradient(0, -cannonR, 0, cannonR)
  cannonGrad.addColorStop(0, COLORS.S_LEAF_LIGHT)
  cannonGrad.addColorStop(0.45, COLORS.S_STEM)
  cannonGrad.addColorStop(1, '#558B2F')
  ctx.fillStyle = cannonGrad
  safeRoundRect(ctx, 0, -cannonR, cannonLen, cannonR * 2, cannonR * 0.45)
  ctx.fill(); ctx.stroke()
  // 管口外圈 + 内腔
  ctx.fillStyle = COLORS.S_MOUTH_OUT
  ctx.beginPath()
  ctx.ellipse(cannonLen, 0, cannonR * 0.42, cannonR * 0.92, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = COLORS.S_MOUTH_IN
  ctx.beginPath()
  ctx.ellipse(cannonLen, 0, cannonR * 0.28, cannonR * 0.65, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // 7. 头顶水滴形嫩叶
  ctx.save()
  ctx.translate(0, headY - headR * 0.92)
  ctx.rotate(-0.35)
  pen.set(ctx, COLORS.STROKE, pen.w(STROKE.MAIN))
  ctx.fillStyle = COLORS.S_LEAF_DARK
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(-headR * 0.18, -headR * 0.18, -headR * 0.08, -headR * 0.48, 0, -headR * 0.6)
  ctx.bezierCurveTo(headR * 0.08, -headR * 0.48, headR * 0.18, -headR * 0.18, 0, 0)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  pen.set(ctx, 'rgba(85,107,47,0.55)', pen.w(STROKE.THIN))
  ctx.beginPath()
  ctx.moveTo(0, -headR * 0.04)
  ctx.lineTo(0, -headR * 0.54)
  ctx.stroke()
  ctx.restore()
  // 8. 表情
  drawCuteFace(ctx, pen, headR, headY + headR * HEAD.SHOOTER_EYE_Y, { mouth: 'smile', wobblePhase: p.wobble })
}

// ============ 火焰射手（炮管朝右适配 + 三层火苗） ============
function drawFire(ctx: Ctx2D, pen: Pen, p: PlantPaintCtx, r: number) {
  const headR = r
  const headY = -r * 0.25
  const sway = Math.sin(p.wobble * 2) * headR * 0.05

  // 1. 焦橙半球底座
  domeBase(ctx, pen, r, '#FFCCBC', '#FF7043', COLORS.FR_HEAD_DARK, 'rgba(216,67,21,0.45)')
  // 2. 焦土色尖卵双叶
  sideLeaves(ctx, pen, r, COLORS.FIRE_LEAF_DARK, COLORS.FIRE_LEAF_MID, 'rgba(62,39,23,0.45)')
  // 3. 焦糖渐变茎
  const stemGrad = ctx.createLinearGradient(-r * 0.17, 0, r * 0.17, 0)
  stemGrad.addColorStop(0, '#8D6E63')
  stemGrad.addColorStop(0.5, COLORS.FIRE_STEM)
  stemGrad.addColorStop(1, '#3E2723')
  stemWithRings(ctx, pen, r, headR, headY, stemGrad, 'rgba(62,39,23,0.45)')
  // 4. 头部：橙红径向渐变 + 余烬斑点
  pen.set(ctx, COLORS.STROKE, pen.w(STROKE.MAIN))
  const headGrad = ctx.createRadialGradient(-headR * 0.35, headY - headR * 0.35, 0, 0, headY, headR * 1.15)
  headGrad.addColorStop(0, COLORS.FR_HEAD_LIGHT)
  headGrad.addColorStop(0.55, p.color)
  headGrad.addColorStop(1, COLORS.FR_HEAD_DARK)
  ctx.fillStyle = headGrad
  ctx.beginPath()
  ctx.ellipse(0, headY, headR, headR * 0.95, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, headY, headR, headR * 0.95, 0, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = COLORS.FIRE_BODY_DARK
  const embers: Array<[number, number, number]> = [
    [-headR * 0.52, headY - headR * 0.4, headR * 0.11],
    [headR * 0.44, headY - headR * 0.48, headR * 0.09],
    [headR * 0.62, headY + headR * 0.16, headR * 0.1],
  ]
  for (const [ex, ey, er] of embers) {
    ctx.beginPath()
    ctx.arc(ex, ey, er, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
  // 5. 左上月牙高光
  ctx.fillStyle = `rgba(255,255,255,${Math.min(0.55, HEAD.HLIGHT_ALPHA + 0.1)})`
  ctx.beginPath()
  ctx.ellipse(headR * HEAD.HLIGHT_X, headY + headR * HEAD.HLIGHT_Y,
    headR * HEAD.HLIGHT_W, headR * HEAD.HLIGHT_H, HEAD.HLIGHT_ROT, 0, Math.PI * 2)
  ctx.fill()
  // 6. 右向炮管 + 管口火苗（横向适配）
  const cannonX = headR * 0.52
  const cannonY = headY - headR * 0.32
  const cannonLen = headR * 0.58
  const cannonR = headR * 0.3
  ctx.save()
  ctx.translate(cannonX, cannonY)
  ctx.rotate(-0.2)
  pen.set(ctx, COLORS.STROKE, pen.w(STROKE.MAIN))
  // 安装座环
  ctx.fillStyle = COLORS.FIRE_FLAME
  ctx.beginPath()
  ctx.ellipse(cannonR * 0.1, 0, cannonR * 0.28, cannonR * 0.98, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  const cannonGrad = ctx.createLinearGradient(0, -cannonR, 0, cannonR)
  cannonGrad.addColorStop(0, '#FFCC80')
  cannonGrad.addColorStop(0.45, '#FF7043')
  cannonGrad.addColorStop(1, COLORS.FR_HEAD_DARK)
  ctx.fillStyle = cannonGrad
  safeRoundRect(ctx, 0, -cannonR, cannonLen, cannonR * 2, cannonR * 0.42)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = COLORS.FR_CANNON_RIM
  ctx.beginPath()
  ctx.ellipse(cannonLen, 0, cannonR * 0.44, cannonR * 0.92, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = COLORS.FR_CANNON_IN
  ctx.beginPath()
  ctx.ellipse(cannonLen, 0, cannonR * 0.28, cannonR * 0.62, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  const muzzleDist = cannonLen + cannonR * 0.55
  drawFlame(ctx,
    cannonX + Math.cos(-0.2) * muzzleDist,
    cannonY + Math.sin(-0.2) * muzzleDist,
    headR * 0.26, headR * 0.38, sway * 0.8)
  // 7. 头顶两团尖角火苗冠
  drawFlame(ctx, -headR * 0.28, headY - headR * 0.8, headR * 0.26, headR * 0.46, -sway * 0.6)
  drawFlame(ctx, headR * 0.24, headY - headR * 0.84, headR * 0.34, headR * 0.62, sway)
  // 8. 凶萌表情：倒八字眉 + 斜视怒目 + grin 坏笑
  const eyeCY = headY + headR * HEAD.SHOOTER_EYE_Y
  drawCuteFace(ctx, pen, headR, eyeCY, {
    mouth: 'grin', wobblePhase: p.wobble, pupilInward: true,
    blushColor: 'rgba(255,112,67,0.45)',
  })
  angryBrows(ctx, pen, 0, eyeCY, headR, COLORS.FR_BROW)
}

// ============ 坚果墙（倒水滴形 + 纵向壳纹 + 怒眉） ============
function drawWall(ctx: Ctx2D, pen: Pen, p: PlantPaintCtx, r: number) {
  const headR = r * 1.02
  const headY = r * 0.02

  // 1. 顶部深褐三角突起
  ctx.fillStyle = '#5D4037'
  ctx.beginPath()
  ctx.moveTo(0, headY - headR * 1.05)
  ctx.quadraticCurveTo(headR * 0.13, headY - headR * 1.22, 0, headY - headR * 1.42)
  ctx.quadraticCurveTo(-headR * 0.13, headY - headR * 1.22, 0, headY - headR * 1.05)
  ctx.closePath()
  ctx.fill(); ctx.stroke()

  // 2. 倒水滴形主体（上宽下窄）
  ctx.beginPath()
  ctx.moveTo(-headR, headY - headR * 0.35)
  ctx.bezierCurveTo(-headR * 1.1, headY - headR * 0.95, -headR * 0.7, headY - headR * 1.22, 0, headY - headR * 1.22)
  ctx.bezierCurveTo(headR * 0.7, headY - headR * 1.22, headR * 1.1, headY - headR * 0.95, headR, headY - headR * 0.35)
  ctx.bezierCurveTo(headR * 1.05, headY + headR * 0.45, headR * 0.72, headY + headR * 1.08, 0, headY + headR * 1.12)
  ctx.bezierCurveTo(-headR * 0.72, headY + headR * 1.08, -headR * 1.05, headY + headR * 0.45, -headR, headY - headR * 0.35)
  ctx.closePath()
  const wallGrad = ctx.createRadialGradient(-headR * 0.35, headY - headR * 0.4, 0, 0, headY, headR * 1.3)
  wallGrad.addColorStop(0, '#E89B4D')
  wallGrad.addColorStop(0.55, '#B85A18')
  wallGrad.addColorStop(1, '#6E3510')
  ctx.fillStyle = wallGrad
  ctx.fill(); ctx.stroke()

  // 3. 纵向弧线壳纹 ×5
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, headY, headR * 0.98, headR * 1.1, 0, 0, Math.PI * 2)
  ctx.clip()
  pen.set(ctx, 'rgba(62,31,10,0.45)', pen.w(STROKE.THIN))
  ctx.lineCap = 'round'
  for (let i = -2; i <= 2; i++) {
    const x = headR * i * 0.32
    ctx.beginPath()
    ctx.moveTo(x, headY - headR * 1.1)
    ctx.quadraticCurveTo(x * 1.18, headY, x, headY + headR * 1.1)
    ctx.stroke()
  }
  ctx.restore()

  // 4. 左上高光月牙
  ctx.fillStyle = `rgba(255,255,255,${HEAD.HLIGHT_ALPHA})`
  ctx.beginPath()
  ctx.ellipse(headR * HEAD.HLIGHT_X, headY + headR * HEAD.HLIGHT_Y,
    headR * (HEAD.HLIGHT_W + 0.04), headR * (HEAD.HLIGHT_H + 0.04), HEAD.HLIGHT_ROT, 0, Math.PI * 2)
  ctx.fill()

  // 5. 粗黑倒八字眉
  const eyeDX = headR * FACE.EYE_DX_RATIO
  const eyeY = headY + headR * HEAD.WALL_EYE_Y
  const eyeR = headR * FACE.EYE_R_RATIO
  const browY = eyeY - eyeR * 1.4
  pen.set(ctx, '#3E1F0A', pen.w(STROKE.INK) * 1.9)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-eyeDX - eyeR * 0.75, browY + eyeR * 0.55)
  ctx.quadraticCurveTo(-eyeDX - eyeR * 0.1, browY + eyeR * 0.05, -eyeDX + eyeR * 0.75, browY - eyeR * 0.65)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(eyeDX - eyeR * 0.75, browY - eyeR * 0.65)
  ctx.quadraticCurveTo(eyeDX + eyeR * 0.1, browY + eyeR * 0.05, eyeDX + eyeR * 0.75, browY + eyeR * 0.55)
  ctx.stroke()

  // 6. 表情（抿嘴直线，无腮红）
  drawCuteFace(ctx, pen, headR, eyeY, { mouth: 'flat', wobblePhase: p.wobble, blushColor: 'rgba(0,0,0,0)' })
}

// ============ 寒冰射手（宝石头 + 冰晶炮管朝右 + 三叉冰晶簇） ============
function drawFreezer(ctx: Ctx2D, pen: Pen, p: PlantPaintCtx, r: number) {
  const headR = r
  const headY = -r * 0.25
  const swMain = pen.w(STROKE.MAIN)

  // 1. 四片鲜绿底座叶（后 2 大 + 前 2 小）
  const leafY = r * 0.58
  ctx.fillStyle = COLORS.F_LEAF_DARK
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * r * 0.3, leafY - r * 0.02)
    ctx.bezierCurveTo(s * r * 1.02, leafY - r * 0.14, s * r * 1.06, leafY + r * 0.26, s * r * 0.84, leafY + r * 0.32)
    ctx.bezierCurveTo(s * r * 0.58, leafY + r * 0.36, s * r * 0.4, leafY + r * 0.2, s * r * 0.3, leafY - r * 0.02)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
  }
  ctx.fillStyle = COLORS.F_LEAF_MID
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * r * 0.12, leafY + r * 0.1)
    ctx.bezierCurveTo(s * r * 0.52, leafY + r * 0.06, s * r * 0.6, leafY + r * 0.34, s * r * 0.4, leafY + r * 0.42)
    ctx.bezierCurveTo(s * r * 0.24, leafY + r * 0.44, s * r * 0.16, leafY + r * 0.3, s * r * 0.12, leafY + r * 0.1)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
  }
  // 2. 茎 + 环形节
  stemWithRings(ctx, pen, r, headR, headY, COLORS.F_STEM, 'rgba(46,125,50,0.55)')
  // 3. 头部：宝石形（上宽下窄 + 顶小尖）
  const headPath = () => {
    ctx.beginPath()
    ctx.moveTo(0, headY - headR * 1.06)
    ctx.bezierCurveTo(-headR * 0.58, headY - headR * 1.02, -headR * 0.94, headY - headR * 0.66, -headR * 0.92, headY - headR * 0.16)
    ctx.bezierCurveTo(-headR * 0.9, headY + headR * 0.52, -headR * 0.52, headY + headR * 0.92, 0, headY + headR * 0.94)
    ctx.bezierCurveTo(headR * 0.52, headY + headR * 0.92, headR * 0.9, headY + headR * 0.52, headR * 0.92, headY - headR * 0.16)
    ctx.bezierCurveTo(headR * 0.94, headY - headR * 0.66, headR * 0.58, headY - headR * 1.02, 0, headY - headR * 1.06)
    ctx.closePath()
  }
  const headGrad = ctx.createRadialGradient(-headR * 0.35, headY - headR * 0.35, 0, 0, headY, headR * 1.15)
  headGrad.addColorStop(0, COLORS.F_HEAD_LIGHT)
  headGrad.addColorStop(0.55, p.color)
  headGrad.addColorStop(1, COLORS.F_HEAD_DARK)
  pen.set(ctx, COLORS.STROKE, swMain)
  ctx.fillStyle = headGrad
  headPath()
  ctx.fill(); ctx.stroke()
  // 冰壳内环 + 霜点
  ctx.save()
  headPath()
  ctx.clip()
  pen.set(ctx, 'rgba(255,255,255,0.38)', pen.w(STROKE.THIN) * 1.6)
  headPath()
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.beginPath()
  ctx.arc(-headR * 0.46, headY + headR * 0.02, headR * 0.05, 0, Math.PI * 2)
  ctx.arc(headR * 0.3, headY - headR * 0.44, headR * 0.04, 0, Math.PI * 2)
  ctx.arc(headR * 0.12, headY + headR * 0.34, headR * 0.035, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // 4. 左上高光
  ctx.fillStyle = `rgba(255,255,255,${Math.min(0.55, HEAD.HLIGHT_ALPHA + 0.1)})`
  ctx.beginPath()
  ctx.ellipse(headR * HEAD.HLIGHT_X, headY + headR * HEAD.HLIGHT_Y,
    headR * HEAD.HLIGHT_W, headR * HEAD.HLIGHT_H, HEAD.HLIGHT_ROT, 0, Math.PI * 2)
  ctx.fill()
  // 5. 右向冰晶炮管 + 管口冰雾（横向适配）
  const cannonX = headR * 0.5
  const cannonY = headY - headR * 0.3
  const cannonLen = headR * 0.58
  const cannonR = headR * 0.31
  ctx.save()
  ctx.translate(cannonX, cannonY)
  ctx.rotate(-0.2)
  pen.set(ctx, COLORS.STROKE, swMain)
  // 安装座环
  ctx.fillStyle = '#3FBFB2'
  ctx.beginPath()
  ctx.ellipse(cannonR * 0.1, 0, cannonR * 0.26, cannonR * 0.98, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  const cannonGrad = ctx.createLinearGradient(0, -cannonR, 0, cannonR)
  cannonGrad.addColorStop(0, COLORS.F_HEAD_LIGHT)
  cannonGrad.addColorStop(0.45, p.color)
  cannonGrad.addColorStop(1, COLORS.F_HEAD_DARK)
  ctx.fillStyle = cannonGrad
  safeRoundRect(ctx, 0, -cannonR, cannonLen, cannonR * 2, cannonR * 0.42)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = COLORS.F_MOUTH_OUT
  ctx.beginPath()
  ctx.ellipse(cannonLen, 0, cannonR * 0.44, cannonR * 0.92, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = COLORS.F_MOUTH_IN
  ctx.beginPath()
  ctx.ellipse(cannonLen, 0, cannonR * 0.28, cannonR * 0.62, 0, 0, Math.PI * 2)
  ctx.fill()
  // 管口冰雾（呼吸寒气）
  const mistSway = Math.sin(p.wobble * 1.6) * headR * 0.03
  ctx.fillStyle = 'rgba(214,240,252,0.55)'
  ctx.beginPath()
  ctx.ellipse(cannonLen + cannonR * 0.55 + mistSway, -cannonR * 0.28, cannonR * 0.34, cannonR * 0.24, -0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(cannonLen + cannonR * 0.72 + mistSway * 0.6, cannonR * 0.1, cannonR * 0.26, cannonR * 0.18, 0.25, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // 6. 头顶三叉冰晶簇
  ctx.save()
  ctx.translate(0, headY - headR * 0.88)
  ctx.rotate(-0.1)
  const drawCrystal = (w: number, h: number, tilt: number) => {
    ctx.save()
    ctx.rotate(tilt)
    pen.set(ctx, COLORS.STROKE, swMain)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(-w * 0.5, -h * 0.32)
    ctx.lineTo(0, -h)
    ctx.lineTo(w * 0.5, -h * 0.32)
    ctx.closePath()
    ctx.fillStyle = COLORS.F_CRYSTAL
    ctx.fill(); ctx.stroke()
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, -h)
    ctx.lineTo(w * 0.5, -h * 0.32)
    ctx.closePath()
    ctx.fillStyle = COLORS.F_CRYSTAL_2
    ctx.fill()
    ctx.restore()
    pen.set(ctx, 'rgba(120,200,200,0.65)', pen.w(STROKE.THIN))
    ctx.beginPath()
    ctx.moveTo(0, -h * 0.06)
    ctx.lineTo(0, -h * 0.88)
    ctx.stroke()
    ctx.restore()
  }
  drawCrystal(headR * 0.3, headR * 0.58, -0.42)
  drawCrystal(headR * 0.34, headR * 0.66, 0.4)
  drawCrystal(headR * 0.38, headR * 0.86, 0)
  ctx.restore()
  // 7. 表情：半垂眼睑 + 抿嘴 + 冰蓝腮红
  const eyeY2 = headY + headR * HEAD.FREEZER_EYE_Y
  drawCuteFace(ctx, pen, headR, eyeY2, { mouth: 'flat', wobblePhase: p.wobble, blushColor: COLORS.BLUSH_COOL })
  const eyeDX = headR * FACE.EYE_DX_RATIO
  const eyeR = headR * FACE.EYE_R_RATIO
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(s * eyeDX, eyeY2 - eyeR * 0.3, eyeR * 1.06, eyeR * 0.78, 0, Math.PI, Math.PI * 2)
    ctx.closePath()
    ctx.fillStyle = COLORS.F_LID
    ctx.fill()
    pen.set(ctx, COLORS.F_LID_LINE, pen.w(STROKE.THIN))
    ctx.beginPath()
    ctx.moveTo(s * eyeDX - eyeR * 1.02, eyeY2 - eyeR * 0.3)
    ctx.lineTo(s * eyeDX + eyeR * 1.02, eyeY2 - eyeR * 0.3)
    ctx.stroke()
  }
}

// ============ 樱桃炸弹（双樱桃 + 引信火花 + 蓄力震动） ============
function drawCherry(ctx: Ctx2D, pen: Pen, p: PlantPaintCtx, r: number) {
  // 网页端引擎引信向上累计 0→fuseTime；换算为剩余量（小程序语义）
  const fuseTotal = PLANT_TYPES.cherry.fuseTime || 2000
  const fuseLeft = Math.max(0, fuseTotal - (p.fuseTimer || 0))
  const shake = fuseLeft > 0 && fuseLeft < 800
    ? Math.sin(p.t / 30) * (1 - fuseLeft / 800) * 4
    : 0
  const headY = -r * 0.05
  const lx = -r * 0.4, ly = headY + r * 0.08, lr = r * 0.58 // 左樱桃（前，大）
  const rx = r * 0.44, ry = headY, rr = r * 0.44 // 右樱桃（后，小）

  ctx.save()
  if (shake) ctx.translate(shake, 0)
  ctx.lineJoin = 'round'

  // 1. 双 S 形茎（白边底层 + 绿面层）
  const stemW = r * 0.13
  const drawStem = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number) => {
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.quadraticCurveTo(cx, cy, x1, y1)
    pen.set(ctx, COLORS.STROKE, stemW + pen.w(STROKE.THIN) * 1.3)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.quadraticCurveTo(cx, cy, x1, y1)
    pen.set(ctx, COLORS.C_FUSE, stemW)
    ctx.stroke()
  }
  const lTipX = lx - r * 0.2, lTipY = ly - lr - r * 0.38
  drawStem(lx + r * 0.02, ly - lr * 0.86, lx - r * 0.02, ly - lr - r * 0.26, lTipX, lTipY)
  const rTipX = rx + r * 0.2, rTipY = ry - rr - r * 0.34
  drawStem(rx, ry - rr * 0.86, rx + r * 0.04, ry - rr - r * 0.24, rTipX, rTipY)

  // 2. 茎侧叶片
  const drawLeaf = (x: number, y: number, len: number, dir: number) => {
    ctx.fillStyle = COLORS.C_LEAF
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.bezierCurveTo(x + dir * len * 0.18, y - len * 0.42, x + dir * len * 0.72, y - len * 0.54, x + dir * len, y - len * 0.22)
    ctx.bezierCurveTo(x + dir * len * 0.96, y + len * 0.1, x + dir * len * 0.46, y + len * 0.3, x, y)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
  }
  drawLeaf(lx - r * 0.14, ly - lr - r * 0.2, r * 0.3, -1)
  drawLeaf(rx + r * 0.12, ry - rr - r * 0.16, r * 0.24, 1)

  // 3. 左茎顶蒂头
  ctx.save()
  ctx.translate(lTipX, lTipY)
  ctx.rotate(-0.55)
  ctx.fillStyle = COLORS.C_TIP
  safeRoundRect(ctx, -r * 0.055, -r * 0.1, r * 0.11, r * 0.2, r * 0.055)
  ctx.fill(); ctx.stroke()
  ctx.restore()

  // 4. 右樱桃（后，暗一档）
  const rg = ctx.createRadialGradient(rx - rr * 0.3, ry - rr * 0.35, 0, rx, ry, rr * 1.12)
  rg.addColorStop(0, COLORS.C_BODY)
  rg.addColorStop(0.55, COLORS.C_BODY_DARK)
  rg.addColorStop(1, COLORS.C_BODY_EDGE)
  ctx.fillStyle = rg
  ctx.beginPath()
  ctx.arc(rx, ry, rr, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.beginPath()
  ctx.ellipse(rx - rr * 0.3, ry - rr * 0.34, rr * 0.18, rr * 0.26, -0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.beginPath()
  ctx.arc(rx + rr * 0.38, ry + rr * 0.32, rr * 0.06, 0, Math.PI * 2)
  ctx.fill()

  // 5. 左樱桃（前，亮红渐变）
  const lg = ctx.createRadialGradient(lx - lr * 0.32, ly - lr * 0.38, 0, lx, ly, lr * 1.15)
  lg.addColorStop(0, COLORS.C_BODY_LIGHT)
  lg.addColorStop(0.45, COLORS.C_BODY)
  lg.addColorStop(0.8, COLORS.C_BODY_DARK)
  lg.addColorStop(1, COLORS.C_BODY_EDGE)
  ctx.fillStyle = lg
  ctx.beginPath()
  ctx.arc(lx, ly, lr, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = `rgba(255,255,255,${HEAD.HLIGHT_ALPHA})`
  ctx.beginPath()
  ctx.ellipse(lx + lr * HEAD.HLIGHT_X, ly + lr * HEAD.HLIGHT_Y,
    lr * HEAD.HLIGHT_W, lr * HEAD.HLIGHT_H, HEAD.HLIGHT_ROT, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.beginPath()
  ctx.arc(lx + lr * 0.4, ly + lr * 0.36, lr * 0.07, 0, Math.PI * 2)
  ctx.fill()

  // 6. 双脸：斜视怒目 + 撇嘴 + 浓腮红（眨眼相位错开）
  const drawCherryFace = (cx: number, cy: number, rad: number, phase: number) => {
    angryBrows(ctx, pen, cx, cy, rad, COLORS.C_BROW)
    drawCuteFace(ctx, pen, rad, cy, {
      mouth: 'pout', wobblePhase: phase, blushColor: COLORS.BLUSH_RICH, pupilInward: true,
    })
  }
  drawCherryFace(rx, ry - rr * 0.04, rr, p.wobble + 2.1)
  drawCherryFace(lx, ly - lr * 0.04, lr, p.wobble)

  // 7. 引信火花（<1s 高频闪）
  if (fuseLeft > 0 && fuseLeft < 1000) {
    const sparkAlpha = 0.4 + 0.6 * Math.abs(Math.sin(p.t / (fuseLeft < 500 ? 50 : 100)))
    ctx.globalAlpha = sparkAlpha
    ctx.fillStyle = '#FF9800'
    ctx.beginPath()
    // 五角星
    const spikes = 5
    for (let i = 0; i < spikes * 2; i++) {
      const rad = (i % 2 === 0 ? r * 0.2 : r * 0.09)
      const a = -Math.PI / 2 + (i * Math.PI) / spikes
      const px = rTipX + Math.cos(a) * rad
      const py = rTipY + Math.sin(a) * rad
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = COLORS.C_SPARK
    ctx.beginPath()
    ctx.arc(rTipX, rTipY, r * 0.07, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.beginPath()
    ctx.arc(rTipX, rTipY - r * 0.16, r * 0.07, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
  ctx.restore()
}

// ============ 食人花（正面大嘴 + 状态动画） ============
function drawChomper(ctx: Ctx2D, pen: Pen, p: PlantPaintCtx, r: number) {
  const wobblePhase = p.wobble
  const CH = PLANT.CHOMPER
  const biteP = p.chomperState === 'snap' ? clamp01(p.stateTimer / CH.SNAP_DURATION_MS) : 0
  // 吞咽进度（与 engine 相同的 -1 标记语义；swallowTime 与 PLANT_TYPES.chomper.swallowTime 一致）
  let swalP = 0
  if (p.chomperState === 'swallow') {
    const swallowTime = 3000
    const need = p.stateTimer === -1 ? CH.NO_BITE_SWALLOW_MS : swallowTime
    const elapsed = p.stateTimer === -1 ? p.stateTimer + 1 + need : p.stateTimer
    swalP = clamp01(elapsed / need)
  }

  const headR = r * 1.04
  const headY = -r * 0.28

  // 吞咽期整体微微鼓起
  const swallowScale = 1 + swalP * 0.12
  const swallowOffY = swalP * r * 0.08
  ctx.save()
  ctx.translate(0, swallowOffY)
  ctx.scale(swallowScale, swallowScale)

  // 1. 四片深绿叶底座
  const leafY = r * 0.58
  ctx.fillStyle = '#2E7D32'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * r * 0.3, leafY - r * 0.02)
    ctx.bezierCurveTo(s * r * 1.02, leafY - r * 0.14, s * r * 1.06, leafY + r * 0.26, s * r * 0.84, leafY + r * 0.32)
    ctx.bezierCurveTo(s * r * 0.58, leafY + r * 0.36, s * r * 0.4, leafY + r * 0.2, s * r * 0.3, leafY - r * 0.02)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
  }
  ctx.fillStyle = '#43A047'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * r * 0.12, leafY + r * 0.1)
    ctx.bezierCurveTo(s * r * 0.52, leafY + r * 0.06, s * r * 0.6, leafY + r * 0.34, s * r * 0.4, leafY + r * 0.42)
    ctx.bezierCurveTo(s * r * 0.24, leafY + r * 0.44, s * r * 0.16, leafY + r * 0.3, s * r * 0.12, leafY + r * 0.1)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
  }

  // 2. 茎 + 吞咽鼓肚
  if (swalP > 0.05) {
    ctx.fillStyle = '#7CB342'
    ctx.beginPath()
    ctx.ellipse(0, r * 0.3, r * (0.3 + swalP * 0.2), r * (0.24 + swalP * 0.1), 0, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
  }
  const stemGrad = ctx.createLinearGradient(-r * 0.16, 0, r * 0.16, 0)
  stemGrad.addColorStop(0, '#8BC34A')
  stemGrad.addColorStop(0.5, '#689F38')
  stemGrad.addColorStop(1, '#558B2F')
  ctx.fillStyle = stemGrad
  safeRoundRect(ctx, -r * 0.15, headY + headR * 0.48, r * 0.3, r * 0.46, r * 0.13)
  ctx.fill(); ctx.stroke()
  pen.set(ctx, 'rgba(85,107,47,0.55)', pen.w(STROKE.THIN))
  for (let i = 0; i < 2; i++) {
    const y = headY + headR * 0.6 + i * r * 0.15
    ctx.beginPath()
    ctx.moveTo(-r * 0.13, y)
    ctx.quadraticCurveTo(0, y - r * 0.04, r * 0.13, y)
    ctx.stroke()
  }
  pen.set(ctx, COLORS.STROKE, pen.w(STROKE.MAIN))

  // 3. 头部：大紫球（咬合前冲）
  const snapLungeX = Math.sin(biteP * Math.PI) * r * 0.1
  const snapLungeY = -Math.sin(biteP * Math.PI) * r * 0.08
  ctx.save()
  ctx.translate(snapLungeX, snapLungeY)
  const headGrad = ctx.createRadialGradient(-headR * 0.35, headY - headR * 0.35, 0, 0, headY, headR * 1.15)
  headGrad.addColorStop(0, COLORS.CH_HEAD_LIGHT)
  headGrad.addColorStop(0.55, p.color)
  headGrad.addColorStop(1, COLORS.CH_HEAD_DARK)
  ctx.fillStyle = headGrad
  ctx.beginPath()
  ctx.ellipse(0, headY, headR, headR * 0.94, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()

  // 4. 深紫斑点表皮
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, headY, headR, headR * 0.94, 0, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = COLORS.CH_SPOT
  const spots: Array<[number, number, number]> = [
    [-headR * 0.62, headY - headR * 0.5, headR * 0.13],
    [headR * 0.56, headY - headR * 0.42, headR * 0.1],
    [-headR * 0.68, headY + headR * 0.18, headR * 0.1],
    [headR * 0.64, headY + headR * 0.3, headR * 0.12],
    [headR * 0.1, headY - headR * 0.76, headR * 0.08],
  ]
  for (const [sx, sy, sr] of spots) {
    ctx.beginPath()
    ctx.arc(sx, sy, sr, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // 5. 左上高光（上移避让眼区）
  ctx.fillStyle = `rgba(255,255,255,${HEAD.HLIGHT_ALPHA})`
  ctx.beginPath()
  ctx.ellipse(headR * HEAD.HLIGHT_X, headY + headR * (HEAD.HLIGHT_Y - 0.22),
    headR * HEAD.HLIGHT_W, headR * HEAD.HLIGHT_H, HEAD.HLIGHT_ROT, 0, Math.PI * 2)
  ctx.fill()

  // 6. 正面大嘴：口腔 + 獠牙 + 厚唇
  let mouthOpen: number
  if (p.chomperState === 'snap') {
    mouthOpen = biteP < 0.45
      ? 0.35 + (biteP / 0.45) * 0.95
      : 1.3 - ((biteP - 0.45) / 0.55) * 0.95
  } else if (p.chomperState === 'swallow') {
    mouthOpen = 0.12
  } else {
    mouthOpen = 0.45 + 0.25 * Math.sin(wobblePhase)
  }
  mouthOpen = Math.max(0.1, Math.min(1.3, mouthOpen))
  const mouthCY = headY + headR * 0.24
  const mouthRX = headR * 0.48
  const openH = headR * (0.07 + 0.26 * mouthOpen)
  const mouthFlash = p.chomperState === 'snap' && biteP >= 0.4 && biteP <= 0.65 ? 1 : 0
  ctx.fillStyle = mouthFlash ? COLORS.CH_FLASH : COLORS.CH_MOUTH
  ctx.beginPath()
  ctx.ellipse(0, mouthCY, mouthRX, openH, 0, 0, Math.PI * 2)
  ctx.fill()
  if (mouthFlash) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.beginPath()
    ctx.ellipse(0, mouthCY - openH * 0.3, mouthRX * 0.62, openH * 0.45, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // 上排獠牙 ×4
  const teethShow = Math.min(1, mouthOpen / 0.7)
  ctx.fillStyle = '#FFFFFF'
  for (const dx of [-0.58, -0.2, 0.2, 0.58]) {
    const x = dx * mouthRX
    const topY = mouthCY - openH + 1
    const tw = headR * 0.115
    const th = headR * (0.09 + 0.13 * teethShow)
    ctx.beginPath()
    ctx.moveTo(x - tw / 2, topY)
    ctx.lineTo(x, topY + th)
    ctx.lineTo(x + tw / 2, topY)
    ctx.closePath()
    ctx.fill()
  }
  // 下排獠牙 ×3
  for (const dx of [-0.34, 0, 0.34]) {
    const x = dx * mouthRX
    const botY = mouthCY + openH - 1
    const tw = headR * 0.105
    const th = headR * (0.07 + 0.1 * teethShow)
    ctx.beginPath()
    ctx.moveTo(x - tw / 2, botY)
    ctx.lineTo(x, botY - th)
    ctx.lineTo(x + tw / 2, botY)
    ctx.closePath()
    ctx.fill()
  }
  // 厚唇弧（白描边打底 → 唇色弧覆盖）
  const lipW = Math.max(2, headR * 0.1)
  const lipRX = mouthRX + lipW * 0.55
  const lipRY = openH + lipW * 0.55
  pen.set(ctx, COLORS.STROKE, lipW + pen.w(STROKE.MAIN) * 1.6)
  ctx.beginPath()
  ctx.ellipse(0, mouthCY, lipRX, lipRY, 0, Math.PI, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(0, mouthCY, lipRX, lipRY, 0, 0, Math.PI)
  ctx.stroke()
  pen.set(ctx, COLORS.CH_LIP, lipW)
  ctx.beginPath()
  ctx.ellipse(0, mouthCY, lipRX, lipRY, 0, Math.PI, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(0, mouthCY, lipRX, lipRY, 0, 0, Math.PI)
  ctx.stroke()

  // 7. 凶萌表情：高位眼 + 倒八字眉 + 淡紫腮红
  const eyeCY = headY - headR * 0.36
  drawCuteFace(ctx, pen, headR, eyeCY, {
    mouth: 'none', wobblePhase, pupilInward: true,
    blushColor: 'rgba(206,147,216,0.5)',
  })
  angryBrows(ctx, pen, 0, eyeCY, headR, COLORS.CH_BROW)
  ctx.restore() // snap head offset
  ctx.restore() // swallow scale
}

// ============ 向日葵（12 外瓣 + 6 内瓣 + 暖橙花盘） ============
function drawSunflower(ctx: Ctx2D, pen: Pen, p: PlantPaintCtx, r: number) {
  const headR = r * 0.95
  const headY = -r * 0.2
  const wobble = Math.sin(p.wobble) * 0.05

  // 茎 + 两片心形叶
  const stemGrad = ctx.createLinearGradient(0, r * 0.05, 0, r * 0.55)
  stemGrad.addColorStop(0, '#8BC34A')
  stemGrad.addColorStop(1, '#558B2F')
  ctx.fillStyle = stemGrad
  ctx.beginPath()
  safeRoundRect(ctx, -r * 0.14, r * 0.05, r * 0.28, r * 0.55, r * 0.14)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#7CB342'
  ctx.beginPath()
  ctx.ellipse(-r * 0.55, r * 0.42, r * 0.42, r * 0.22, -0.55, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(r * 0.55, r * 0.42, r * 0.42, r * 0.22, 0.55, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.strokeStyle = '#33691E'
  ctx.lineWidth = Math.max(1, r * 0.025)
  ctx.beginPath()
  ctx.moveTo(-r * 0.85, r * 0.48)
  ctx.lineTo(-r * 0.25, r * 0.36)
  ctx.moveTo(r * 0.85, r * 0.48)
  ctx.lineTo(r * 0.25, r * 0.36)
  ctx.stroke()
  pen.set(ctx, COLORS.STROKE, pen.w(STROKE.MAIN))

  // 12 片外层水滴形花瓣
  ctx.fillStyle = '#FFD54F'
  ctx.strokeStyle = '#E65100'
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + wobble
    const px = Math.cos(angle) * headR * 0.78
    const py = headY + Math.sin(angle) * headR * 0.78
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(angle + Math.PI / 2)
    ctx.beginPath()
    ctx.ellipse(0, 0, headR * 0.18, headR * 0.34, 0, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
    ctx.restore()
  }
  // 6 片内层小花瓣
  ctx.fillStyle = '#FFC107'
  ctx.strokeStyle = '#E65100'
  ctx.lineWidth = Math.max(0.8, r * 0.03)
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + Math.PI / 12 + wobble
    const px = Math.cos(angle) * headR * 0.45
    const py = headY + Math.sin(angle) * headR * 0.45
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(angle + Math.PI / 2)
    ctx.beginPath()
    ctx.ellipse(0, 0, headR * 0.12, headR * 0.22, 0, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
    ctx.restore()
  }
  pen.set(ctx, COLORS.STROKE, pen.w(STROKE.MAIN))

  // 花盘：暖橙黄渐变
  const discGrad = ctx.createRadialGradient(-headR * 0.15, headY - headR * 0.15, headR * 0.05, 0, headY, headR * 0.5)
  discGrad.addColorStop(0, '#FFB300')
  discGrad.addColorStop(0.6, '#FFA000')
  discGrad.addColorStop(1, '#FF8F00')
  ctx.fillStyle = discGrad
  ctx.beginPath()
  ctx.arc(0, headY, headR * 0.5, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()

  // 左上月牙高光（限制在花盘内）
  ctx.save()
  ctx.beginPath()
  ctx.arc(0, headY, headR * 0.5, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = 'rgba(255,253,231,0.85)'
  ctx.beginPath()
  ctx.ellipse(-headR * 0.18, headY - headR * 0.2, headR * 0.22, headR * 0.14, -0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.beginPath()
  ctx.ellipse(-headR * 0.08, headY - headR * 0.28, headR * 0.08, headR * 0.05, -0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // 表情：杏眼 + 微笑 + 珊瑚粉腮红
  drawCuteFace(ctx, pen, headR, headY + headR * HEAD.WALL_EYE_Y, {
    mouth: 'smile', wobblePhase: p.wobble, blushColor: 'rgba(255,171,145,0.7)',
  })
}
