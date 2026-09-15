// src/game/renderer.ts - Canvas 2D 渲染器（萌系马卡龙风格 · v56 角色美术移植版）
// 移植自微信小程序端 renderer.js + zombiePainter.js 的核心策略:
//   · 背景离屏缓存（尺寸变化才重建）  · 僵尸离屏精灵（每类型一次绘制，超采样高清化）
//   · 植物/僵尸阵营区分：植物白描边亮高光 vs 僵尸暗描边哑光
//   · 类型受击特效（星芒火花/锈屑/尘土/漆屑/音符）· 受击弹跳 / 死亡渐隐 / 摇摆动画
//   · 整帧 try-catch + 逐实体隔离

import { GRID, ZOMBIE_TYPES, PLANT_TYPES, type ZombieType } from './constants'
import type { EnginePlant, EngineZombie, GameEngine, SunOrb } from './engine'
import { Pen, starShape, type Ctx2D } from './painters/tokens'
import { renderZombieToOffscreen, type ZombieSprite } from './painters/zombiePainter'
import { drawPlantArt, drawCuteFace } from './painters/plantPainter'

// ============ 马卡龙色板 ============
const C = {
  skyTop: '#BEE9F5',
  skyBottom: '#E8F7FB',
  hillFar: '#C5E1A5',
  hillNear: '#AED581',
  stripeA: '#BCE08F', // 足球场修剪条纹·亮
  stripeB: '#A5D374', // 足球场修剪条纹·暗
  gridLine: 'rgba(255,255,255,0.42)',
  dirt: '#E3C896',
}

interface BgCache {
  canvas: OffscreenCanvas | HTMLCanvasElement
  key: string
}

let bgCache: BgCache | null = null

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      return new OffscreenCanvas(w, h)
    } catch { /* fallback */ }
  }
  const el = document.createElement('canvas')
  el.width = w
  el.height = h
  return el
}

// ============ 僵尸离屏精灵缓存（每类型 × dpr 一次绘制） ============
const spriteCache = new Map<string, ZombieSprite>()

function getZombieSprite(type: ZombieType, dpr: number): ZombieSprite | null {
  const key = `${type}@${Math.max(1, Math.round(dpr * 2))}`
  const hit = spriteCache.get(key)
  if (hit) return hit
  const spr = renderZombieToOffscreen(type, dpr, ZOMBIE_TYPES[type].color)
  if (!spr) return null
  spriteCache.set(key, spr)
  return spr
}

// ============ 背景离屏缓存 ============
function buildBackground(engine: GameEngine, dpr: number) {
  const W = engine.layout.left + engine.layout.width + 10
  const H = engine.layout.top + engine.layout.height + 10
  const key = `${Math.round(W)}x${Math.round(H)}x${dpr}`
  if (bgCache && bgCache.key === key) return bgCache.canvas
  const cv = makeCanvas(Math.ceil(W * dpr), Math.ceil(H * dpr))
  const ctx = cv.getContext('2d') as Ctx2D | null
  if (!ctx) return null
  ctx.scale(dpr, dpr)
  const { left, top, width, height, cellW, cellH } = engine.layout

  // 天空
  const sky = ctx.createLinearGradient(0, 0, 0, top + height * 0.5)
  sky.addColorStop(0, C.skyTop)
  sky.addColorStop(1, C.skyBottom)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, top + height)

  // 装饰太阳（右上）
  ctx.save()
  ctx.globalAlpha = 0.85
  ctx.fillStyle = '#FFE082'
  ctx.beginPath()
  ctx.arc(W - 56, 30, 22, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#FFD54F'
  ctx.lineWidth = 3
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8
    ctx.beginPath()
    ctx.moveTo(W - 56 + Math.cos(a) * 28, 30 + Math.sin(a) * 28)
    ctx.lineTo(W - 56 + Math.cos(a) * 36, 30 + Math.sin(a) * 36)
    ctx.stroke()
  }
  ctx.restore()

  // 云朵
  const cloud = (cx: number, cy: number, s: number, alpha: number) => {
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.arc(cx, cy, 14 * s, 0, Math.PI * 2)
    ctx.arc(cx + 16 * s, cy - 6 * s, 11 * s, 0, Math.PI * 2)
    ctx.arc(cx + 30 * s, cy, 12 * s, 0, Math.PI * 2)
    ctx.arc(cx + 15 * s, cy + 6 * s, 12 * s, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  cloud(W * 0.3, 34, 1, 0.9)
  cloud(W * 0.62, 22, 0.7, 0.7)

  // 远山
  ctx.fillStyle = C.hillFar
  ctx.beginPath()
  ctx.moveTo(0, top + 8)
  ctx.quadraticCurveTo(W * 0.25, top - 14, W * 0.5, top + 6)
  ctx.quadraticCurveTo(W * 0.75, top - 10, W, top + 8)
  ctx.lineTo(W, top + 30)
  ctx.lineTo(0, top + 30)
  ctx.fill()

  // 草地整体
  ctx.fillStyle = C.hillNear
  ctx.fillRect(0, top + 20, W, height)

  // 足球场式修剪草坪（纵向明暗条纹 + 条纹内割草高光）
  for (let col = 0; col < GRID.COLS; col++) {
    const x0 = left + col * cellW
    ctx.fillStyle = col % 2 === 0 ? C.stripeA : C.stripeB
    ctx.fillRect(x0, top, cellW, height)
    // 每条条纹中央柔和高光，模拟割草后的反光
    const sheen = ctx.createLinearGradient(x0, 0, x0 + cellW, 0)
    sheen.addColorStop(0, 'rgba(255,255,255,0)')
    sheen.addColorStop(0.5, col % 2 === 0 ? 'rgba(255,255,255,0.17)' : 'rgba(255,255,255,0.04)')
    sheen.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = sheen
    ctx.fillRect(x0, top, cellW, height)
  }

  // 球场白色边线（触线）
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 3
  ctx.strokeRect(left + 2, top + 2, width - 4, height - 4)

  // 网格线（战术格子）
  ctx.strokeStyle = C.gridLine
  ctx.lineWidth = 1.5
  for (let lane = 0; lane <= GRID.ROWS; lane++) {
    ctx.beginPath()
    ctx.moveTo(left, top + lane * cellH)
    ctx.lineTo(left + width, top + lane * cellH)
    ctx.stroke()
  }
  for (let col = 0; col <= GRID.COLS; col++) {
    ctx.beginPath()
    ctx.moveTo(left + col * cellW, top)
    ctx.lineTo(left + col * cellW, top + height)
    ctx.stroke()
  }

  // 农场篱笆门（左侧, 跨全部车道）
  drawFenceGate(ctx, left, top, height, cellH)

  // 草地边缘小花（右侧；左侧让位给篱笆门）
  ctx.save()
  const flower = (fx: number, fy: number, petal: string) => {
    ctx.fillStyle = petal
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5
      ctx.beginPath()
      ctx.arc(fx + Math.cos(a) * 4, fy + Math.sin(a) * 4, 2.6, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#FFD54F'
    ctx.beginPath()
    ctx.arc(fx, fy, 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let lane = 0; lane < GRID.ROWS; lane++) {
    flower(W - 12, top + lane * cellH + 10, '#FFE082')
  }
  ctx.restore()

  bgCache = { canvas: cv, key }
  return cv
}

/**
 * 农场篱笆门（替换原小房子）· v3 门叶朝向僵尸来向：
 * 篱笆沿左边缘纵向延伸（走向 = 屏幕竖直），板条竖放、木桩直立圆头柱帽；
 * 中段农场门绕左门轴向草坪（僵尸来向 = 屏幕右侧）微旋：右缘梯形放大（近端）
 * + 左侧门板厚度侧面 + 右缘受光高光（太阳在右上）+ 门闩把手全在右缘
 */
function drawFenceGate(ctx: Ctx2D, x: number, top: number, height: number, cellH: number) {
  const fw = Math.max(30, x - 10) // 篱笆带宽
  const fx = 4
  const fy = top + height * 0.05
  const fh = height * 0.9
  const woodA = '#C79A6B'
  const woodB = '#B98A5C'
  const woodDark = '#8A6244'
  const woodDeep = '#6F4E37'
  ctx.save()

  // 底部草影
  ctx.fillStyle = 'rgba(93,64,55,0.10)'
  roundRect(ctx, fx - 2, fy + fh - 5, fw + 8, 10, 5)
  ctx.fill()

  // 门的中段位置
  const gateH = Math.min(cellH * 1.15, fh * 0.42)
  const gy = top + height / 2 - gateH / 2
  const gEnd = gy + gateH

  // ---- 竖板篱笆（三块长板贯穿上下，长轴沿篱笆走向；中段被门覆盖）----
  const bw = Math.max(9, fw * 0.24)
  const innerGap = Math.max(3, fw * 0.06)
  const side = Math.max(2, (fw - 3 * bw - 2 * innerGap) / 2)
  for (let k = 0; k < 3; k++) {
    const bx = fx + side + k * (bw + innerGap)
    ctx.fillStyle = k % 2 === 0 ? woodA : woodB
    roundRect(ctx, bx, fy, bw, fh, Math.min(6, bw * 0.4))
    ctx.fill()
    ctx.strokeStyle = 'rgba(111,78,55,0.28)'
    ctx.lineWidth = 1
    roundRect(ctx, bx, fy, bw, fh, Math.min(6, bw * 0.4))
    ctx.stroke()
    // 右缘高光（朝阳面，太阳在右上；与门叶受光方向一致）
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(bx + bw - 2, fy + 8)
    ctx.lineTo(bx + bw - 2, fy + fh - 8)
    ctx.stroke()
  }

  // ---- 篱笆门（门叶绕左门轴向僵尸来向 = 屏幕右侧微旋：右缘梯形放大近端）----
  const gxx = fx + 1
  const gww = fw - 2
  const tilt = gateH * 0.1 // 右缘（近僵尸侧）离相机更近 → 上下各外扩 tilt
  const KP = 0.22 // 透视强度：等宽门板近端投影更宽，门叶朝草坪旋出感
  const up = (t: number) => (t + KP * t * t) / (1 + KP)
  const GX = (t: number) => gxx + gww * up(t)
  const gTop = (t: number) => gy - tilt * up(t)
  const gBot = (t: number) => gEnd + tilt * up(t)
  const gH = (u: number) => gBot(u) - gTop(u)
  // 梯形四边形路径（u: 横向 0~1, v: 纵向 0~1）
  const quadUV = (u0: number, v0: number, u1: number, v1: number) => {
    ctx.beginPath()
    ctx.moveTo(GX(u0), gTop(u0) + gH(u0) * v0)
    ctx.lineTo(GX(u1), gTop(u1) + gH(u1) * v0)
    ctx.lineTo(GX(u1), gTop(u1) + gH(u1) * v1)
    ctx.lineTo(GX(u0), gTop(u0) + gH(u0) * v1)
    ctx.closePath()
  }
  // 左侧厚度侧面（门轴侧看到门板厚度，深色 → 门面朝右侧）
  ctx.fillStyle = woodDeep
  ctx.beginPath()
  ctx.moveTo(gxx - 6, gy + 2)
  ctx.lineTo(gxx, gy)
  ctx.lineTo(gxx, gEnd)
  ctx.lineTo(gxx - 6, gEnd - 2)
  ctx.closePath()
  ctx.fill()
  // 门叶（梯形填充，上亮下暗，受光与场景太阳一致）
  const gGrad = ctx.createLinearGradient(0, gy, 0, gEnd + tilt)
  gGrad.addColorStop(0, '#DCB584')
  gGrad.addColorStop(1, woodB)
  ctx.fillStyle = gGrad
  quadUV(0, 0, 1, 1)
  ctx.fill()
  // 门芯凹槽底
  ctx.fillStyle = 'rgba(111,78,55,0.14)'
  quadUV(0.035, 0.035, 0.965, 0.965)
  ctx.fill()
  // 竖板门芯（与篱笆板条同向，经典农场门）
  const pw = Math.max(6, gww * 0.13)
  const pn = Math.max(3, Math.floor((gww - 8 + 2) / (pw + 2)))
  const gu = 2 / gww
  const pu = (1 - (pn - 1) * gu) / pn
  for (let i = 0; i < pn; i++) {
    const u0 = i * (pu + gu)
    ctx.fillStyle = i % 2 === 0 ? '#CB9F72' : woodB
    quadUV(u0, 0.05, u0 + pu, 0.95)
    ctx.fill()
  }
  // X 斜撑（端点按梯形插值）
  ctx.strokeStyle = woodDark
  ctx.lineWidth = Math.max(3.5, gww * 0.085)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(GX(0.2), gTop(0.2) + gH(0.2) * 0.17)
  ctx.lineTo(GX(0.8), gTop(0.8) + gH(0.8) * 0.83)
  ctx.moveTo(GX(0.8), gTop(0.8) + gH(0.8) * 0.17)
  ctx.lineTo(GX(0.2), gTop(0.2) + gH(0.2) * 0.83)
  ctx.stroke()
  ctx.lineCap = 'butt'
  // 门框描边
  ctx.strokeStyle = woodDark
  ctx.lineWidth = 2
  quadUV(0, 0, 1, 1)
  ctx.stroke()
  // 右缘受光高光（太阳在右上，门面朝僵尸来向）
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(GX(1) - 1.5, gTop(1) + 4)
  ctx.lineTo(GX(1) - 1.5, gBot(1) - 4)
  ctx.stroke()
  // 合页扣带（左侧门轴处探出，压在厚度侧面之上）
  ctx.fillStyle = woodDeep
  roundRect(ctx, gxx - 7.5, gy + gateH * 0.16, 9.5, gateH * 0.09, 2.5)
  ctx.fill()
  roundRect(ctx, gxx - 7.5, gy + gateH * 0.75, 9.5, gateH * 0.09, 2.5)
  ctx.fill()
  // 门闩 + 金色把手（全在右缘 = 朝向僵尸来向的操作面）
  ctx.fillStyle = woodDeep
  quadUV(0.9, 0.38, 0.955, 0.64)
  ctx.fill()
  ctx.fillStyle = '#FFD54F'
  ctx.beginPath()
  ctx.arc(GX(0.928), gTop(0.928) + gH(0.928) * 0.51, 3.8, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = woodDeep
  ctx.lineWidth = 1
  ctx.stroke()
  // 门上部小爱心（X 斜撑上三角留白处，白色光晕衬底更醒目）
  const heartX = GX(0.5)
  const heartY = gTop(0.5) + gH(0.5) * 0.27
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  heart(ctx, heartX, heartY + 1, 8)
  ctx.fillStyle = '#F6A5B8'
  heart(ctx, heartX, heartY, 6.5)

  // ---- 直立木桩（圆头柱帽，分布在端头与门的上下，压在板条/门框之上）----
  const postW = Math.max(13, fw * 0.2)
  const postH = postW * 2.2
  const px = fx + fw / 2 - postW / 2
  const post = (py: number) => {
    const g = ctx.createLinearGradient(0, py, 0, py + postH)
    g.addColorStop(0, '#DCB584')
    g.addColorStop(1, woodB)
    ctx.fillStyle = g
    roundRect(ctx, px, py, postW, postH, postW * 0.42)
    ctx.fill()
    ctx.strokeStyle = 'rgba(111,78,55,0.5)'
    ctx.lineWidth = 1.5
    roundRect(ctx, px, py, postW, postH, postW * 0.42)
    ctx.stroke()
    // 柱帽高光
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(px + 3, py + 3.5)
    ctx.lineTo(px + postW - 3, py + 3.5)
    ctx.stroke()
  }
  post(fy - postH * 0.18)          // 顶端
  post(gy - postH * 0.78)          // 门上方（柱底压住门框上沿）
  post(gEnd - postH * 0.22)        // 门下方（柱顶压住门框下沿）
  post(fy + fh - postH * 0.82)     // 底端

  // ---- 脚下草丛 ----
  ctx.strokeStyle = '#7CB342'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  const tuft = (bx: number, by: number) => {
    for (const [dx, dy] of [[-3, -6], [0, -8], [3, -6]]) {
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.quadraticCurveTo(bx + dx * 0.4, by + dy * 0.6, bx + dx, by + dy)
      ctx.stroke()
    }
  }
  tuft(fx + fw * 0.55, fy + fh + 1)
  tuft(fx + fw + 4, fy + fh + 1)
  ctx.lineCap = 'butt'
  ctx.restore()
}

function heart(ctx: Ctx2D, x: number, y: number, s: number) {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x, y + s * 0.6)
  ctx.bezierCurveTo(x - s, y - s * 0.4, x - s * 0.4, y - s, x, y - s * 0.3)
  ctx.bezierCurveTo(x + s * 0.4, y - s, x + s, y - s * 0.4, x, y + s * 0.6)
  ctx.fill()
  ctx.restore()
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

// ============ 植物绘制（plantPainter 精细萌绘 + 摇摆 + 受击闪烁） ============
const plantPen = new Pen()

function drawPlant(ctx: Ctx2D, p: EnginePlant, x: number, y: number, cellR: number, t: number) {
  ctx.save()
  // 摇摆
  const wob = Math.sin(p.wobble + p.wobbleSeed) * 0.05
  ctx.translate(x, y)
  ctx.rotate(wob)
  ctx.translate(-x, -y)
  // 受击闪烁（整体透明度振荡，miniprogram 同款）
  if (p.hitFlash > 0) {
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(p.hitFlash / 20)
  }
  // 以植物中心为原点绘制
  ctx.translate(x, y)
  try {
    drawPlantArt(ctx, plantPen, {
      type: p.type,
      color: PLANT_TYPES[p.type].color,
      wobble: p.wobble,
      t,
      health: p.health,
      maxHealth: p.maxHealth,
      fuseTimer: p.fuseTimer,
      chomperState: p.chomperState,
      stateTimer: p.stateTimer,
    }, cellR)
  } catch { /* 逐实体隔离 */ }
  ctx.restore()
}

// ============ 僵尸绘制（离屏精灵 + 弹跳/闪烁/死亡渐隐 + 类型受击特效） ============
const HIT_FLASH_MS = 200

function drawZombie(ctx: Ctx2D, z: EngineZombie, x: number, y: number, t: number, laneScale: number, dpr: number) {
  const def = ZOMBIE_TYPES[z.type]
  const r = def.radius * laneScale
  ctx.save()

  // 死亡渐隐 + 放大
  if (z.state === 'dying') {
    const ratio = Math.max(0, z.dyingTimer / 400)
    ctx.globalAlpha = ratio
    const grow = 1 + (1 - ratio) * 0.5
    ctx.translate(x, y)
    ctx.scale(grow, grow)
    ctx.translate(-x, -y)
  }

  // 受击弹跳（体轻弹得更高 / 重甲几乎不动，miniprogram 同款体感）
  if (z.hitFlash > 0 && z.state !== 'dying') {
    const hp = Math.max(0, Math.min(1, 1 - z.hitFlash / HIT_FLASH_MS))
    const bounce = z.type === 'imp' ? 0.2
      : z.type === 'football' ? 0.08
      : z.type === 'dancer' ? 0.1
      : z.type === 'king' ? 0.06 : 0.12
    ctx.translate(0, -r * bounce * Math.sin(Math.PI * hp))
  }

  // 受击闪烁
  if (z.hitFlash > 0) {
    ctx.globalAlpha *= 0.5 + 0.5 * Math.sin(z.hitFlash / 20)
  }

  // 行进颠簸 + 摇摆
  const bob = Math.sin(z.wobble * 2 + z.wobbleSeed) * r * 0.04
  const wob = Math.sin(z.wobble + z.wobbleSeed) * (z.state === 'walking' ? 0.06 : 0.1)
  ctx.translate(x, y + bob)
  ctx.rotate(wob)

  // 减速光环（被寒冰射手命中）
  if (z.slowTimer > 0) {
    ctx.strokeStyle = 'rgba(79,195,247,0.7)'
    ctx.lineWidth = Math.max(2, r * 0.08)
    ctx.beginPath()
    ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2)
    ctx.stroke()
  }

  // 离屏精灵贴图
  const spr = getZombieSprite(z.type, dpr)
  if (spr) {
    const drawSize = r * 2.4
    ctx.drawImage(spr.canvas as CanvasImageSource, -drawSize / 2, -drawSize / 2, drawSize, drawSize)
  } else {
    // 兜底：实心圆
    ctx.fillStyle = def.color
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // 舞王巡场音符（常态识别符号：头部两侧八分音符随步伐律动）
  if (z.type === 'dancer' && z.state === 'walking' && r > 24) {
    const bobL = Math.sin(z.wobble * 2) * r * 0.09
    const bobR = Math.sin(z.wobble * 2 + Math.PI) * r * 0.09
    const sway = Math.cos(z.wobble) * r * 0.05
    ctx.save()
    ctx.globalAlpha = 0.85
    const drawNote = (px: number, py: number, ns: number, c: string) => {
      ctx.strokeStyle = c
      ctx.lineWidth = Math.max(1, r * 0.045)
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.ellipse(px, py, ns * 0.42, ns * 0.3, -0.35, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(px + ns * 0.36, py - ns * 0.14)
      ctx.lineTo(px + ns * 0.36, py - ns * 1.05)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(px + ns * 0.36, py - ns * 1.05)
      ctx.quadraticCurveTo(px + ns * 0.74, py - ns * 0.9, px + ns * 0.68, py - ns * 0.6)
      ctx.stroke()
    }
    drawNote(x - r * 0.98 + sway, y - r * 1.02 + bobL, r * 0.18, '#6B3D74')
    drawNote(x + r * 1.0 - sway, y - r * 1.18 + bobR, r * 0.17, '#6B3D74')
    ctx.restore()
  }

  // 类型受击特效（miniprogram 移植：星芒火花/锈屑/尘土/漆屑）
  if (z.hitFlash > 0 && z.state !== 'dying') {
    drawZombieHitEffect(ctx, z, x, y, r)
  }

  // 血条（受伤时显示）
  if (z.health < z.maxHealth && z.state !== 'dying') {
    const barW = r * 1.4
    const barH = 6
    const barX = x - barW / 2
    const barY = y - r * 1.45
    const ratio = Math.max(0, z.health / z.maxHealth)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    roundRect(ctx, barX, barY, barW, barH, 3)
    ctx.fill()
    ctx.fillStyle = ratio > 0.5 ? '#66BB6A' : ratio > 0.25 ? '#FFB74D' : '#E57373'
    if (ratio > 0) {
      roundRect(ctx, barX, barY, barW * ratio, barH, 3)
      ctx.fill()
    }
  }
  void t
}

/** 类型受击特效（参照设定图状态图标：铁桶星芒+锈屑 / 小鬼尘土 / 橄榄球漆屑 / 舞王音符） */
function drawZombieHitEffect(ctx: Ctx2D, z: EngineZombie, x: number, y: number, r: number) {
  const hp = Math.max(0, Math.min(1, 1 - z.hitFlash / HIT_FLASH_MS))
  ctx.save()
  if (z.type === 'bucket' || z.type === 'football') {
    // 星芒火花（头饰左上，随受击进度旋转）
    ctx.save()
    ctx.translate(x - r * 0.52, y - r * 1.12)
    ctx.rotate(hp * 0.8)
    starShape(ctx, 0, 0, r * 0.3, 4, 0.3)
    ctx.fillStyle = '#FFF9C4'
    ctx.fill()
    ctx.strokeStyle = '#FFEB3B'
    ctx.lineWidth = Math.max(1, r * 0.045)
    ctx.stroke()
    ctx.restore()
  }
  if (z.type === 'bucket') {
    // 锈屑 ×3（棕褐小方块，向外上方飞散）
    ctx.fillStyle = '#8B5A2B'
    const debris = [
      { x: -0.6, y: -0.95, dx: -0.55, dy: -0.55, s: 0.15 },
      { x: 0.58, y: -0.9, dx: 0.55, dy: -0.6, s: 0.12 },
      { x: 0.1, y: -1.18, dx: 0.18, dy: -0.7, s: 0.1 },
    ]
    for (const d of debris) {
      const px = (d.x + d.dx * hp) * r
      const py = (d.y + d.dy * hp) * r
      ctx.fillRect(x + px - (d.s * r) / 2, y + py - (d.s * r) / 2, d.s * r, d.s * r)
    }
  }
  if (z.type === 'football') {
    // 红漆屑 ×3（护肩掉漆）
    ctx.fillStyle = '#D03A29'
    const chips = [
      { x: -0.6, y: -0.95, dx: -0.55, dy: -0.55, s: 0.14 },
      { x: 0.58, y: -0.9, dx: 0.55, dy: -0.6, s: 0.11 },
      { x: 0.1, y: -1.18, dx: 0.18, dy: -0.7, s: 0.09 },
    ]
    for (const d of chips) {
      const px = (d.x + d.dx * hp) * r
      const py = (d.y + d.dy * hp) * r
      ctx.fillRect(x + px - (d.s * r) / 2, y + py - (d.s * r) / 2, d.s * r, d.s * r)
    }
  }
  if (z.type === 'imp') {
    // 尘土 ×3（脚下飞扬，渐散）
    const dust = [
      { x: -0.62, y: 0.92, dx: -0.42, dy: -0.18, s: 0.2 },
      { x: 0.62, y: 0.94, dx: 0.42, dy: -0.16, s: 0.17 },
      { x: 0.05, y: 1.02, dx: 0.1, dy: -0.3, s: 0.24 },
    ]
    ctx.fillStyle = '#D8C9A3'
    for (const d of dust) {
      const px = (d.x + d.dx * hp) * r
      const py = (d.y + d.dy * hp) * r
      ctx.globalAlpha = (1 - hp) * 0.85
      ctx.beginPath()
      ctx.arc(x + px, y + py, d.s * r * (0.6 + 0.7 * hp), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  if (z.type === 'dancer') {
    // 音符飞散（被打断演出的滑稽感）
    const notes = [
      { x: -0.85, y: -1.05, dx: -0.5, dy: -0.55, s: 0.2 },
      { x: 0.8, y: -0.95, dx: 0.45, dy: -0.65, s: 0.17 },
      { x: 0.15, y: -1.35, dx: 0.15, dy: -0.6, s: 0.15 },
    ]
    for (const n of notes) {
      const px = x + (n.x + n.dx * hp) * r
      const py = y + (n.y + n.dy * hp) * r
      const ns = n.s * r
      ctx.globalAlpha = (1 - hp) * 0.9
      ctx.strokeStyle = '#6B3D74'
      ctx.lineWidth = Math.max(1, r * 0.05)
      ctx.fillStyle = '#6B3D74'
      ctx.beginPath()
      ctx.ellipse(px, py, ns * 0.42, ns * 0.3, -0.35, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(px + ns * 0.36, py - ns * 0.14)
      ctx.lineTo(px + ns * 0.36, py - ns * 1.05)
      ctx.stroke()
    }
  }
  ctx.restore()
}

// ============ 主渲染 ============
export function render(ctx: CanvasRenderingContext2D, engine: GameEngine, dpr: number) {
  const { width: cw, height: ch } = cssSize(engine)
  ctx.save()
  try {
    // 屏幕震动
    if (engine.shakeUntil > Date.now()) {
      const k = engine.shakeIntensity
      ctx.translate((Math.random() - 0.5) * k * 2, (Math.random() - 0.5) * k * 2)
    }

    // 背景（离屏缓存）
    const bg = buildBackground(engine, dpr)
    if (bg) {
      ctx.drawImage(bg as CanvasImageSource, 0, 0, cw, ch)
    } else {
      ctx.fillStyle = C.stripeA
      ctx.fillRect(0, 0, cw, ch)
    }

    const t = Date.now()
    const cellR = Math.min(engine.layout.cellW, engine.layout.cellH) * 0.3

    // 植物
    for (const p of engine.plants) {
      const pos = plantPos(engine, p)
      if (!pos) continue
      try {
        drawPlant(ctx, p, pos.x, pos.y, cellR, t)
      } catch { /* 逐实体隔离 */ }
    }

    // 投射物
    for (const pr of engine.projectiles) {
      try {
        ctx.save()
        if (pr.kind === 'fire') {
          // 拖尾
          for (let k = 1; k <= 3; k++) {
            ctx.globalAlpha = 0.25 / k
            ctx.fillStyle = '#FF8A65'
            ctx.beginPath()
            ctx.arc(pr.x - k * 9, pr.y, pr.radius - k, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.globalAlpha = 1
        }
        const grad = ctx.createRadialGradient(pr.x - pr.radius * 0.3, pr.y - pr.radius * 0.3, 1, pr.x, pr.y, pr.radius)
        grad.addColorStop(0, '#FFFFFF')
        grad.addColorStop(0.35, pr.color)
        grad.addColorStop(1, pr.kind === 'ice' ? '#4DD0E1' : pr.kind === 'fire' ? '#F4511E' : '#7CB342')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(pr.x, pr.y, pr.radius, 0, Math.PI * 2)
        ctx.fill()
        if (pr.kind === 'ice') {
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'
          ctx.lineWidth = 1.2
          for (let i = 0; i < 3; i++) {
            const a = (Math.PI * 2 * i) / 3 + t * 0.008
            ctx.beginPath()
            ctx.moveTo(pr.x + Math.cos(a) * pr.radius * 0.4, pr.y + Math.sin(a) * pr.radius * 0.4)
            ctx.lineTo(pr.x + Math.cos(a) * pr.radius * 1.5, pr.y + Math.sin(a) * pr.radius * 1.5)
            ctx.stroke()
          }
        }
        ctx.restore()
      } catch { /* ignore */ }
    }

    // 僵尸（按 progress 降序绘制：左侧(大 progress)先画, 右侧覆盖其上, 模拟行进遮挡）
    const sorted = [...engine.zombies].sort((a, b) => b.progress - a.progress)
    for (const z of sorted) {
      const pos = zombiePos(engine, z)
      try {
        drawZombie(ctx, z, pos.x, pos.y, t, pos.scale, dpr)
      } catch { /* 逐实体隔离 */ }
    }

    // 阳光
    for (const s of engine.suns) {
      try {
        drawSun(ctx, s, engine, t)
      } catch { /* ignore */ }
    }

    // 粒子
    for (const p of engine.particles) {
      try {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife)
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      } catch { /* ignore */ }
    }
    ctx.globalAlpha = 1

    // 浮动文字
    for (const f of engine.floats) {
      try {
        ctx.globalAlpha = Math.max(0, f.life / f.maxLife)
        ctx.font = `bold ${f.size}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.lineWidth = 3
        ctx.strokeText(f.text, f.x, f.y)
        ctx.fillStyle = f.color
        ctx.fillText(f.text, f.x, f.y)
      } catch { /* ignore */ }
    }
    ctx.globalAlpha = 1
    ctx.textAlign = 'start'

    // 关卡横幅
    drawBanner(ctx, engine, cw, ch)
  } catch {
    // 整帧失败静默（下一帧重试）
  }
  ctx.restore()
}

function drawBanner(ctx: Ctx2D, engine: GameEngine, cw: number, ch: number) {
  const b = engine.banner
  if (!b || b.until <= Date.now()) return
  const remain = b.until - Date.now()
  const life = 2200
  const elapsed = life - remain
  const scaleIn = Math.min(1, elapsed / 220)
  const fadeOut = remain < 300 ? remain / 300 : 1
  ctx.save()
  ctx.globalAlpha = fadeOut
  ctx.translate(cw / 2, ch * 0.32)
  ctx.scale(scaleIn, scaleIn)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  roundRect(ctx, -cw * 0.3, -34, cw * 0.6, 68, 18)
  ctx.fill()
  ctx.strokeStyle = '#F6B8C6'
  ctx.lineWidth = 3
  roundRect(ctx, -cw * 0.3, -34, cw * 0.6, 68, 18)
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.fillStyle = '#E91E63'
  ctx.font = `bold 26px system-ui, sans-serif`
  ctx.fillText(b.text, 0, -2)
  ctx.fillStyle = '#8D6E63'
  ctx.font = '14px system-ui, sans-serif'
  ctx.fillText(b.sub, 0, 22)
  ctx.restore()
}

function drawSun(ctx: Ctx2D, s: SunOrb, engine: GameEngine, t: number) {
  let x = s.x
  let y = s.y
  let scale = 1
  if (s.state === 'idle') {
    // 出现动画 + 悬浮呼吸
    const appear = Math.min(1, s.age / 260)
    scale = 0.4 + 0.6 * appear + Math.sin(t * 0.004 + s.id) * 0.04
    y += Math.sin(t * 0.003 + s.id) * 2
  } else {
    // 收集动画: 飘向 HUD（左上）
    const progress = Math.min(1, s.collectT / 320)
    const tx = engine.layout.left + 26
    const ty = Math.max(14, engine.layout.top - 10)
    x = s.fromX + (tx - s.fromX) * progress
    y = s.fromY + (ty - s.fromY) * progress
    scale = 1 - progress * 0.6
  }
  const r = 16 * scale
  ctx.save()
  // 光芒
  ctx.fillStyle = '#FFD54F'
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8 + t * 0.001
    ctx.beginPath()
    ctx.ellipse(x + Math.cos(a) * r * 1.25, y + Math.sin(a) * r * 1.25, r * 0.22, r * 0.1, a, 0, Math.PI * 2)
    ctx.fill()
  }
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r)
  grad.addColorStop(0, '#FFF9C4')
  grad.addColorStop(0.6, '#FFE082')
  grad.addColorStop(1, '#FFC107')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  // 萌系表情（与植物统一的眨眼笑脸）
  drawCuteFace(ctx, sunPen, r * 0.92, y, { mouth: 'smile', wobblePhase: t * 0.003 + s.id })
  ctx.restore()
}

const sunPen = new Pen()

// ---- 位置换算（renderer 侧独立实现, 避免访问 engine 私有方法） ----
function cssSize(engine: GameEngine) {
  return {
    width: engine.layout.left + engine.layout.width + 10,
    height: engine.layout.top + engine.layout.height + 10,
  }
}
function plantPos(engine: GameEngine, p: EnginePlant) {
  const { left, top, cellW, cellH } = engine.layout
  return { x: left + p.col * cellW + cellW / 2, y: top + p.lane * cellH + cellH / 2 }
}
function zombiePos(engine: GameEngine, z: EngineZombie) {
  const { left, top, width, cellH } = engine.layout
  const laneDepth = 0.86 + z.lane * 0.14 // 车道伪景深
  return {
    x: left + width * (1 - z.progress),
    y: top + z.lane * cellH + cellH / 2,
    scale: laneDepth,
  }
}

// 导出类型供外部使用
export type { EngineZombie, ZombieType }
