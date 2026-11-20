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
  BLUSH_PINK: 'rgba(255,141,163,0.78)',
  BLUSH_RICH: 'rgba(248,124,160,0.85)',
  BLUSH_COOL: 'rgba(96,198,255,0.62)',
  BLUSH_ZOMBIE: 'rgba(255,110,150,0.72)',
  SHADOW: 'rgba(0,0,0,0.14)',

  // 豌豆 Shooter
  S_LEAF_DARK: '#9CCC65',
  S_LEAF_MID: '#83C641',
  S_LEAF_LIGHT: '#CFE98C',
  S_STEM: '#7DBE33',
  S_MOUTH_OUT: '#558B2F',
  S_MOUTH_IN: '#33691E',
  // 寒冰 Freezer v22
  F_LEAF_DARK: '#46B84E',
  F_LEAF_MID: '#5FC55E',
  F_STEM: '#3FAE4A',
  F_HEAD_LIGHT: '#BFF7F1',
  F_HEAD_DARK: '#21B9AE',
  F_MOUTH_OUT: '#1F8B85',
  F_MOUTH_IN: '#0E403C',
  F_CRYSTAL: '#EAFDFF',
  F_CRYSTAL_2: '#9FE8EC',
  F_LID: '#5ECFC2',
  F_LID_LINE: '#16726B',
  // 樱桃 Cherry v24
  C_BODY: '#F44336',
  C_BODY_DARK: '#D32F2F',
  C_BODY_LIGHT: '#FF8674',
  C_BODY_EDGE: '#A4161A',
  C_LEAF: '#5FC55E',
  C_FUSE: '#7DBE33',
  C_SPARK: '#FFF176',
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
  CH_HEAD_LIGHT: '#F2D3F8',
  CH_HEAD_DARK: '#6A1FB8',
  CH_SPOT: '#6C2493',
  CH_LIP: '#7B27AA',
  CH_MOUTH: '#460C66',
  CH_FLASH: '#D32F2F',
  CH_BROW: '#3B1252',
  // 铁桶 Bucket v26（v94 附图可爱 3D 风：紫色铆钉桶）
  Z_BUCKET_LIGHT: '#CFC0E8',
  Z_BUCKET: '#9C7BC4',
  Z_BUCKET_DARK: '#5E4690',
  Z_RUST: '#A8672F',
  Z_SHIRT: '#9EC6E0',
  Z_SHIRT_DARK: '#74A0BC',
  Z_PANTS: '#4A4F54',
  Z_BOOT: '#6B6356',
  Z_MOUTH: '#8A3A3E',
  // 小鬼 Imp v27
  Z_HOOD_LIGHT: '#948A80',
  Z_HOOD: '#63605A',
  Z_HOOD_DARK: '#403B34',
  Z_SACK: '#D2AF6B',
  Z_SACK_DARK: '#9A7A44',
  Z_EYE_YELLOW: '#FBF3BC',
  // 橄榄球 Football v28（v94 红球衣对齐附图）
  Z_FH_RED: '#E8452F',
  Z_FH_RED_LIGHT: '#F06A4F',
  Z_FH_RED_DARK: '#A3231B',
  Z_FH_STRIPE: '#F7EDD6',
  Z_FH_CAGE: '#D5CEBB',
  Z_FH_JERSEY: '#C13A2A',
  Z_FH_JERSEY_DARK: '#8F2618',
  Z_FH_WRIST: '#7A1F14',
  Z_FH_CLEAT: '#6B4C3A',
  // 舞王 Dancer v29
  Z_DN_HAT: '#23232B',
  Z_DN_HAT_DARK: '#0F0F15',
  Z_DN_HAT_LIGHT: '#3A3A46',
  Z_DN_SUIT: '#7C3FA0',
  Z_DN_SUIT_DARK: '#5A2B78',
  Z_DN_SUIT_LIGHT: '#9C64C4',
  Z_DN_SHIRT: '#F2F0DC',
  Z_DN_TIE: '#4A2460',
  Z_DN_SHOE: '#5C4033',
  Z_DN_TONGUE: '#FF5A5F',
  // 僵尸王 King v51（v94 金袍紫披风对齐附图）
  Z_KING_GOLD: '#FFCB47',
  Z_KING_GOLD_DARK: '#C08A0D',
  Z_KING_GEM: '#E53935',
  Z_KING_CAPE: '#6A3FA0',
  Z_KING_CAPE_DARK: '#4C2B78',
  Z_KING_ROBE: '#D9A43B',
  Z_KING_ROBE_DARK: '#A87718',
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
  EYE_R_RATIO: 0.26,
  PUPIL_R_RATIO: 0.58,
  PUPIL_OFF_X: 0.16,
  PUPIL_OFF_Y: 0.14,
  PUPIL_SHINE1: 0.42,
  PUPIL_SHINE2: 0.18,
  BLUSH_CX: 0.62,
  BLUSH_CY: 0.38,
  BLUSH_SIZE: 0.165,
  MOUTH_Y_OFFSET: 0.5,
} as const

// ============ 僵尸表情比例（独立于植物：眼距更宽/眼更小/瞳孔更小） ============
export const Z_FACE = {
  EYE_DX_RATIO: 0.42,
  EYE_R_RATIO: 0.215,
  EYE_Y_OFFSET: 0.1,
  PUPIL_R_RATIO: 0.5,
  PUPIL_OFF_X: 0.14, // 瞳孔偏位（与小程序 v65 对齐）
  PUPIL_OFF_Y: 0.12,
  BLUSH_CX: 0.62,
  BLUSH_CY: 0.42,
  BLUSH_SIZE: 0.19,
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
