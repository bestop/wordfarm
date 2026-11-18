// src/components/game/PlantShop.tsx - 植物商店栏: 选中植物 → 点击草地种植
// v89 打磨: 窄屏压缩卡片宽度解决 6 株溢出裁切、右缘渐隐提示可横向滚动、scroll-snap 对齐
'use client'

import { PLANT_ORDER, PLANT_TYPES } from '@/game/constants'
import type { PlantType } from '@/game/constants'
import type { ViewSnapshot } from '@/game/engine'

interface Props {
  snap: ViewSnapshot
  onSelect: (type: PlantType | null) => void
}

export default function PlantShop({ snap, onSelect }: Props) {
  return (
    <div className="relative w-full select-none">
      {/* 右缘渐隐: 提示移动端可横向滚动看全部植物 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-1 right-0 w-8 z-10 sm:hidden"
        style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.9) 78%)' }}
      />
      <div className="wf-shop-scroll w-full flex items-stretch gap-1.5 px-2 py-1.5 bg-white/55 backdrop-blur-xl border-t border-white/70 shadow-[0_-2px_18px_rgba(93,64,55,0.06)] overflow-x-auto">
        {PLANT_ORDER.map((key) => {
          const def = PLANT_TYPES[key]
          const affordable = snap.sunlight >= def.cost
          const selected = snap.selectedPlant === key
          return (
            <button
              key={key}
              onClick={() => onSelect(selected ? null : key)}
              disabled={!affordable}
              aria-pressed={selected}
              aria-label={`${def.name}, 阳光 ${def.cost}`}
              className={`wf-focus flex flex-col items-center justify-center min-w-[60px] sm:min-w-[64px] flex-1 rounded-xl px-1 py-1.5 snap-start transition-all ${
                selected
                  ? 'wf-glass-tile border-2 border-[#E91E63] bg-[#FDE0E6]/85 scale-[1.05] shadow-[0_6px_16px_rgba(233,30,99,0.25)]'
                  : affordable
                    ? 'wf-glass-tile'
                    : 'border border-transparent bg-[#EFE8E0]/70 opacity-55 cursor-not-allowed'
              }`}
            >
              <span className="text-xl leading-6" aria-hidden>{def.emoji}</span>
              <span className="text-[10px] font-bold text-[#5D4037] leading-3 mt-0.5 whitespace-nowrap">{def.name}</span>
              <span className={`text-[11px] font-black leading-4 ${affordable ? 'text-[#F57F17]' : 'text-[#B08080]'}`}>
                ☀️{def.cost}
              </span>
            </button>
          )
        })}
        <div className="hidden md:flex flex-col justify-center pl-2 pr-1 text-[11px] text-[#8D6E63] leading-4 min-w-[110px]">
          <span>选中后点击草地格子</span>
          <span>种植 · 点击阳光收集</span>
        </div>
      </div>
    </div>
  )
}
