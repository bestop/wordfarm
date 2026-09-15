// src/components/game/PlantShop.tsx - 植物商店栏: 选中植物 → 点击草地种植
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
    <div className="w-full flex items-stretch gap-1.5 px-2 py-1.5 bg-white/55 backdrop-blur-xl border-t border-white/70 shadow-[0_-2px_18px_rgba(93,64,55,0.06)] overflow-x-auto select-none">
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
            className={`flex flex-col items-center justify-center min-w-[64px] flex-1 rounded-xl px-1.5 py-1.5 transition-all ${
              selected
                ? 'wf-glass-tile border-2 border-[#E91E63] bg-[#FDE0E6]/85 scale-[1.04] shadow-md'
                : affordable
                  ? 'wf-glass-tile'
                  : 'border border-transparent bg-[#EFE8E0]/70 opacity-55 cursor-not-allowed'
            }`}
          >
            <span className="text-xl leading-6" aria-hidden>{def.emoji}</span>
            <span className="text-[10px] font-bold text-[#5D4037] leading-3 mt-0.5">{def.name}</span>
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
  )
}
