// src/components/game/Hud.tsx - 游戏内顶部 HUD: 阳光/分数/连击/关卡进度/防线/暂停
'use client'

import type { ViewSnapshot } from '@/game/engine'

interface Props {
  snap: ViewSnapshot
  onPause: () => void
}

export default function Hud({ snap, onPause }: Props) {
  const levelProgress = snap.levelTimeMs
    ? Math.min(100, ((snap.levelTimeMs - snap.levelRemainMs) / snap.levelTimeMs) * 100)
    : 0
  const isFinal = snap.level >= snap.maxLevel

  return (
    <div className="w-full flex items-center gap-2 px-2 py-1.5 bg-[#FFF6E9]/95 border-b-2 border-[#F6B8C6]/60 select-none">
      {/* 阳光 */}
      <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FFF3C4] shadow-sm" title="阳光">
        <span className="text-lg" aria-hidden>☀️</span>
        <span className="font-black text-[#F57F17] tabular-nums">{snap.sunlight}</span>
      </div>

      {/* 分数 */}
      <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white shadow-sm" title="得分">
        <span className="text-base" aria-hidden>⭐</span>
        <span className="font-bold text-[#5D4037] tabular-nums">{snap.score.toLocaleString()}</span>
      </div>

      {/* 连击 */}
      {snap.combo >= 2 && (
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FDE0E6] shadow-sm animate-pulse" title="连击">
          <span className="text-base" aria-hidden>🔥</span>
          <span className="font-bold text-[#E91E63] tabular-nums">
            {snap.combo} 连 · ×{snap.comboMult}
          </span>
        </div>
      )}

      <div className="flex-1" />

      {/* 关卡进度 */}
      <div className="hidden sm:flex flex-col items-end mr-1" title={isFinal ? '终局: 清完全场即胜利' : `第 ${snap.level}/${snap.maxLevel} 关`}>
        <span className="text-[11px] font-bold text-[#5D4037] leading-4">
          {isFinal ? '🚨 终局大波' : `第 ${snap.level}/${snap.maxLevel} 关`}
        </span>
        <div className="w-24 h-1.5 rounded-full bg-[#E8D5C4] overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${isFinal ? 'bg-[#E91E63]' : 'bg-[#8BC34A]'}`}
            style={{ width: `${isFinal ? 100 : levelProgress}%` }}
          />
        </div>
      </div>

      {/* 防线 */}
      <div className="flex items-center gap-0.5 px-2 py-1 rounded-full bg-white shadow-sm" title="防线">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`text-sm ${i < snap.defenseLines ? '' : 'grayscale opacity-30'}`} aria-hidden>
            🏠
          </span>
        ))}
      </div>

      {/* 暂停 */}
      <button
        onClick={onPause}
        className="w-9 h-9 rounded-full bg-white shadow-sm hover:bg-[#FFF3C4] flex items-center justify-center text-base transition-colors"
        aria-label="暂停"
      >
        ⏸
      </button>
    </div>
  )
}
