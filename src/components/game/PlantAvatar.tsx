// src/components/game/PlantAvatar.tsx - 植物真实形象头像（v90 精准复刻附图）
// 与游戏内 Canvas 角色 1:1 同源：直接调用 painters/plantPainter.drawPlantArt
// （与小程序 avatarPainter.js 同一套设计系统 tokens），圆形本命柔色头像盘
// = 左上柔光 + 白描边环，角色按标准待机姿态定格（wobble=0 / 满血无血条）
'use client'

import { useEffect, useRef } from 'react'
import { PLANT_TYPES, type PlantType } from '@/game/constants'
import { Pen } from '@/game/painters/tokens'
import { drawPlantArt } from '@/game/painters/plantPainter'

// 头像盘底色（与角色图鉴卡 / 小程序 avatarPainter.AVATAR_BG 同源）
const AVATAR_BG: Record<PlantType, string> = {
  sunflower: '#FFF3C4',
  shooter: '#E7F6D2',
  wall: '#F3E4D3',
  freezer: '#DFF6F4',
  cherry: '#FDE2DE',
  chomper: '#F0DFF7',
  fire: '#FFE4D1',
}

interface Props {
  type: PlantType
  /** CSS 像素边长（默认 40） */
  size?: number
  className?: string
}

export default function PlantAvatar({ type, size = 40, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)
    cv.width = Math.round(size * dpr)
    cv.height = Math.round(size * dpr)
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)

    const r = size / 2

    // ===== 1) 头像盘：本命柔色圆底 + 左上柔光，clip 收容角色 =====
    ctx.save()
    ctx.beginPath()
    ctx.arc(r, r, r - 1, 0, Math.PI * 2)
    ctx.fillStyle = AVATAR_BG[type]
    ctx.fill()
    const shine = ctx.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r)
    shine.addColorStop(0, 'rgba(255,255,255,0.55)')
    shine.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = shine
    ctx.fill()
    ctx.clip()

    // ===== 2) 真实角色：drawPlantArt（ctx 原点 = 植物中心）=====
    ctx.save()
    ctx.translate(r, r + 1)
    try {
      drawPlantArt(ctx, new Pen(), {
        type,
        color: PLANT_TYPES[type].color,
        wobble: 0,
        t: 0,
        health: 1,
        maxHealth: 1,
        fuseTimer: 0,
        chomperState: 'idle',
        stateTimer: 0,
      }, size * 0.25)
    } catch {
      /* 头像绘制失败静默降级：仅保留头像盘 */
    }
    ctx.restore()
    ctx.restore()

    // ===== 3) 白描边环（clip 外补画）=====
    ctx.beginPath()
    ctx.arc(r, r, r - 1, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.lineWidth = 2
    ctx.stroke()
  }, [type, size])

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ width: size, height: size }}
      className={className}
    />
  )
}
