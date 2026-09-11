// src/components/game/PauseOverlay.tsx - 暂停弹窗: 继续 / 重新开始 / 回首页
'use client'

interface Props {
  onResume: () => void
  onRestart: () => void
  onMenu: () => void
}

export default function PauseOverlay({ onResume, onRestart, onMenu }: Props) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-xs rounded-3xl bg-[#FFFDF8] shadow-2xl border-4 border-[#BEE9F5] p-6 text-center animate-[popIn_0.3s_ease-out]"
        role="dialog"
        aria-modal="true"
        aria-label="游戏暂停"
      >
        <div className="text-5xl mb-2" aria-hidden>⏸️</div>
        <h2 className="text-xl font-black text-[#5D4037] mb-1">游戏暂停</h2>
        <p className="text-xs text-[#8D6E63] mb-5">僵尸们也停下来打了个盹…</p>
        <div className="space-y-2.5">
          <button
            onClick={onResume}
            className="w-full py-3 rounded-2xl bg-[#8BC34A] hover:bg-[#7CB342] text-white font-bold shadow-md transition-colors"
          >
            ▶ 继续游戏
          </button>
          <button
            onClick={onRestart}
            className="w-full py-3 rounded-2xl bg-[#FFF3C4] hover:bg-[#FFE082] text-[#5D4037] font-bold transition-colors"
          >
            🔄 重新开始
          </button>
          <button
            onClick={onMenu}
            className="w-full py-3 rounded-2xl bg-[#F0E6DC] hover:bg-[#E8D5C4] text-[#5D4037] font-bold transition-colors"
          >
            🏠 回首页
          </button>
        </div>
      </div>
    </div>
  )
}
