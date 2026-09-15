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
        className="wf-glass-strong w-full max-w-xs rounded-3xl p-6 text-center animate-[popIn_0.3s_ease-out]"
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
            className="wf-shine wf-focus w-full py-3 rounded-2xl text-white font-bold transition-transform active:scale-[0.98] hover:brightness-105"
            style={{
              background: 'linear-gradient(180deg, #9BDF7F 0%, #6FCF5E 55%, #4EA944 100%)',
              boxShadow: '0 4px 0 #35742C, 0 10px 22px rgba(79,155,63,0.32), inset 0 2px 0 rgba(255,255,255,0.55)',
            }}
          >
            ▶ 继续游戏
          </button>
          <button
            onClick={onRestart}
            className="wf-glass-btn wf-focus w-full py-3 rounded-2xl text-[#F57F17] font-bold"
          >
            🔄 重新开始
          </button>
          <button
            onClick={onMenu}
            className="wf-glass-btn wf-focus w-full py-3 rounded-2xl text-[#8D6E63] font-bold"
          >
            🏠 回首页
          </button>
        </div>
      </div>
    </div>
  )
}
