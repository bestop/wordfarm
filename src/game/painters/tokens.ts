// src/game/painters/tokens.ts - 角色绘制设计系统中心
// 1:1 移植自小程序 v56 RENDER_TOKENS（renderer.js）+ canvasHelpers.js
//   · 所有色彩 / 描边 / 比例 / 高光 / 阴影参数统一从此取
//   · 阵营区分 v3：植物 = 白描边 + 亮高光；僵尸 = 暗描边(#3E2723) + 哑光微高光

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

// ============ 色板 ============
export const COLORS = {
  INK: '#4E342E', // 瞳孔/嘴线：统一深咖
  STROKE: '#FFFFFF', // 植物萌系白描边
  MOUTH_PINK: '#E91E63',
  MOUTH_LIP: '#F48FB1',
  BLUSH_PINK: 'rgba(255,150,170,0.65)',
  BLUSH_RICH: 'rgba(244,143,177,0.75)',
  BLUSH_COOL: 'rgba(120,200,255,0.55)',
  BLUSH_ZOMBIE: 'rgba(255,120,150,0.65)',
  SHADOW: 'rgba(0,0,0,0.14)',

  // 豌豆 Shooter
  S_LEAF_DARK: '#AED581',
  S_LEAF_MID: '#9CCC65',
  S_LEAF_LIGHT: '#C5E1A5',
  S_STEM: '#7CB342',
  S_MOUTH_OUT: '#558B2F',
  S_MOUTH_IN: '#33691E',
  // 寒冰 Freezer v22
  F_LEAF_DARK: '#4CAF50',
  F_LEAF_MID: '#66BB6A',
  F_STEM: '#43A047',
  F_HEAD_LIGHT: '#B2F0EA',
  F_HEAD_DARK: '#2BA8A0',
  F_MOUTH_OUT: '#2A7A76',
  F_MOUTH_IN: '#123B38',
  F_CRYSTAL: '#E0FFFF',
  F_CRYSTAL_2: '#AEEEEE',
  F_LID: '#5ECFC2',
  F_LID_LINE: '#1D6E66',
  // 樱桃 Cherry v24
  C_BODY: '#E53935',
  C_BODY_DARK: '#C62828',
  C_BODY_LIGHT: '#FF7B6B',
  C_BODY_EDGE: '#A4161A',
  C_LEAF: '#66BB6A',
  C_FUSE: '#7CB342',
  C_SPARK: '#FFEB3B',
  C_TIP: '#7A3B2E',
  C_BROW: '#5B1512',
  // 火焰射手 Fire v25
  FIRE_FLAME: '#FF8A65',
  FIRE_BODY_DARK: '#E64A19',
  FIRE_CORE: '#FFEB3B',
  FIRE_LEAF_DARK: '#A1887F',
  FIRE_LEAF_MID: '#D7CCC8',
  FIRE_STEM: '#5D4037',
  FR_HEAD_LIGHT: '#FFE0B2',
  FR_HEAD_DARK: '#D84315',
  FR_CANNON_RIM: '#BF360C',
  FR_CANNON_IN: '#3E0F0A',
  FR_BROW: '#8D2819',
  // 食人花 Chomper v25
  CH_HEAD_LIGHT: '#E9C6F0',
  CH_HEAD_DARK: '#4A148C',
  CH_SPOT: '#5E1980',
  CH_LIP: '#6A1B9A',
  CH_MOUTH: '#4A0E66',
  CH_FLASH: '#B71C1C',
  CH_BROW: '#3B1252',
  // 铁桶 Bucket v26
  Z_BUCKET_LIGHT: '#DDE3E7',
  Z_BUCKET: '#9BA1A7',
  Z_BUCKET_DARK: '#5F676E',
  Z_RUST: '#8B5A2B',
  Z_SHIRT: '#A7BCCB',
  Z_SHIRT_DARK: '#7E93A4',
  Z_PANTS: '#4A4F54',
  Z_BOOT: '#6B6356',
  Z_MOUTH: '#7E3538',
  // 小鬼 Imp v27
  Z_HOOD_LIGHT: '#8C8279',
  Z_HOOD: '#5C5750',
  Z_HOOD_DARK: '#3A352F',
  Z_SACK: '#C4A265',
  Z_SACK_DARK: '#8F7040',
  Z_EYE_YELLOW: '#F5EDB5',
  // 橄榄球 Football v28
  Z_FH_RED: '#D03A29',
  Z_FH_RED_LIGHT: '#E4604A',
  Z_FH_RED_DARK: '#A3231B',
  Z_FH_STRIPE: '#F2E6CE',
  Z_FH_CAGE: '#C9C2B0',
  Z_FH_JERSEY: '#3A5C39',
  Z_FH_JERSEY_DARK: '#2C472C',
  Z_FH_WRIST: '#2E4A32',
  Z_FH_CLEAT: '#6B4C3A',
  // 舞王 Dancer v29
  Z_DN_HAT: '#23232B',
  Z_DN_HAT_DARK: '#0F0F15',
  Z_DN_HAT_LIGHT: '#3A3A46',
  Z_DN_SUIT: '#6B3D74',
  Z_DN_SUIT_DARK: '#4A2550',
  Z_DN_SUIT_LIGHT: '#8A5590',
  Z_DN_SHIRT: '#EDEBD2',
  Z_DN_TIE: '#3D1F44',
  Z_DN_SHOE: '#5C4033',
  Z_DN_TONGUE: '#D9534F',
  // 僵尸王 King v51
  Z_KING_GOLD: '#F5C542',
  Z_KING_GOLD_DARK: '#B8860B',
  Z_KING_GEM: '#C62828',
  Z_KING_CAPE: '#7B1E2B',
  Z_KING_CAPE_DARK: '#54121C',
  Z_KING_ROBE: '#3E2A5A',
  Z_KING_ROBE_DARK: '#2C1E42',
  // 僵尸阵营专属（暗描边 + 哑光高光）
  Z_STROKE: '#3E2723',
  Z_HIGHLIGHT: 'rgba(255,255,255,0.10)',
} as const

// ============ 描边粗细（基于基准半径动态系数：w = max(1, coeff * base/42)） ============
export const STROKE = {
  MAIN: 4.0,
  THIN: 2.6,
  INK: 2.8,
  EYE: 1.8,
  LIP: 2.2,
} as const

// ============ 植物表情比例 ============
export const FACE = {
  EYE_DX_RATIO: 0.36,
  EYE_R_RATIO: 0.24,
  PUPIL_R_RATIO: 0.56,
  PUPIL_OFF_X: 0.16,
  PUPIL_OFF_Y: 0.14,
  PUPIL_SHINE1: 0.42,
  PUPIL_SHINE2: 0.18,
  BLUSH_CX: 0.62,
  BLUSH_CY: 0.38,
  BLUSH_SIZE: 0.15,
  MOUTH_Y_OFFSET: 0.5,
} as const

// ============ 僵尸表情比例（独立于植物：眼距更宽/眼更小/瞳孔更小） ============
export const Z_FACE = {
  EYE_DX_RATIO: 0.42,
  EYE_R_RATIO: 0.2,
  EYE_Y_OFFSET: 0.1,
  PUPIL_R_RATIO: 0.48,
  BLUSH_CX: 0.62,
  BLUSH_CY: 0.42,
  BLUSH_SIZE: 0.18,
  MOUTH_Y_OFFSET: 0.52,
} as const

// ============ 僵尸体型比例（×UNIT） ============
export const Z_BODY = {
  BUCKET_BODY_W: 0.4,
  IMP_BODY_W: 0.32,
  FOOTBALL_BODY_W: 0.52,
  DANCER_BODY_W: 0.48,
  KING_BODY_W: 0.56,
  BUCKET_ARM_LEN: 0.25,
  IMP_ARM_LEN: 0.32,
  FOOTBALL_ARM_LEN: 0.22,
  DANCER_ARM_LEN: 0.24,
  KING_ARM_LEN: 0.22,
  BUCKET_LEG_W: 0.16,
  IMP_LEG_W: 0.13,
  FOOTBALL_LEG_W: 0.22,
  DANCER_LEG_W: 0.17,
  KING_LEG_W: 0.24,
} as const

// ============ 头部结构比例 ============
export const HEAD = {
  SHOOTER_EYE_Y: 0.08,
  WALL_EYE_Y: 0.1,
  FREEZER_EYE_Y: 0.08,
  ZOMBIE_HEAD_CY: -0.18, // ×UNIT
  ZOMBIE_HEAD_R: 0.68, // ×UNIT
  HLIGHT_X: -0.38,
  HLIGHT_Y: -0.3,
  HLIGHT_W: 0.22,
  HLIGHT_H: 0.4,
  HLIGHT_ROT: -0.5,
  HLIGHT_ALPHA: 0.35,
} as const

// ============ 地面阴影比例（×r） ============
export const SHADOW = { RX: 0.9, RY: 0.22, Y: 1.05 } as const

// ============ 离屏高清化 ============
export const OFFSCREEN = { SUPERSAMPLE: 2 } as const

// ============ 描边笔（基准半径状态 + 统一描边设定） ============
export class Pen {
  private base = 36
  setBase(r: number) {
    if (r > 0) this.base = r
  }
  w(coeff: number, baseR?: number): number {
    if (baseR != null) this.setBase(baseR)
    return Math.max(1, coeff * (this.base / 42))
  }
  set(ctx: Ctx2D, color: string, lineW: number) {
    ctx.strokeStyle = color
    ctx.lineWidth = lineW
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
  }
}

// ============ 形状助手（canvasHelpers.js 移植） ============
export function safeRoundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.lineTo(x + rr, y + h)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.lineTo(x, y + rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/** 爱心形状（已 beginPath，调用后 fill/stroke） */
export function heartShape(ctx: Ctx2D, cx: number, cy: number, s: number) {
  ctx.beginPath()
  ctx.moveTo(cx, cy + s * 0.65)
  ctx.bezierCurveTo(cx - s * 1.4, cy - s * 0.1, cx - s * 0.75, cy - s * 1.05, cx, cy - s * 0.35)
  ctx.bezierCurveTo(cx + s * 0.75, cy - s * 1.05, cx + s * 1.4, cy - s * 0.1, cx, cy + s * 0.65)
  ctx.closePath()
}

/** 五角/四角星（已 beginPath，调用后 fill/stroke） */
export function starShape(ctx: Ctx2D, cx: number, cy: number, outerR: number, points = 5, innerRatio = 0.45) {
  const n = points
  const innerR = outerR * innerRatio
  ctx.beginPath()
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR
    const a = -Math.PI / 2 + (i * Math.PI) / n
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}
