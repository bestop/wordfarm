// src/components/game/RewardCenter.tsx - 亲子奖励中心: 三档兑换 + 长按 2 秒兑换（家长确认）
// 移植自小程序 rewards 页: 🟢 即时小奖励(通关券) / 🟡 周末中等奖励(连续打卡) / 🔵 长线大奖(月度积分)
'use client'

import { useEffect, useRef, useState } from 'react'
import { getPageData, redeem, type TierView } from '@/game/reward'

interface Props {
  onClose: () => void
  onChanged?: () => void
}

export default function RewardCenter({ onClose, onChanged }: Props) {
  const [data, setData] = useState(() => getPageData())
  const [toast, setToast] = useState<string | null>(null)
  const [holding, setHolding] = useState<string | null>(null)
  const [holdProgress, setHoldProgress] = useState(0)
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const holdValue = useRef(0)

  const refresh = () => {
    setData(getPageData())
    onChanged?.()
  }

  useEffect(() => {
    return () => {
      if (holdTimer.current) clearInterval(holdTimer.current)
    }
  }, [])

  const startHold = (itemId: string) => {
    if (holdTimer.current) clearInterval(holdTimer.current)
    setHolding(itemId)
    holdValue.current = 0
    setHoldProgress(0)
    holdTimer.current = setInterval(() => {
      holdValue.current += 0.05
      setHoldProgress(holdValue.current)
      if (holdValue.current >= 1) {
        stopHold()
        doRedeem(itemId)
      }
    }, 100)
  }

  const stopHold = () => {
    if (holdTimer.current) clearInterval(holdTimer.current)
    holdTimer.current = null
    setHolding(null)
  }

  const doRedeem = (itemId: string) => {
    const result = redeem(itemId)
    setToast(result.ok ? `🎉 ${result.reasonText}！请家长履约哦` : result.reasonText)
    refresh()
    setTimeout(() => setToast(null), 2600)
  }

  const wallet = data.wallet

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm p-3" role="dialog" aria-modal="true" aria-label="亲子奖励中心">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl bg-[#FFFDF8] shadow-2xl border-4 border-[#FFE082]">
        {/* 头部 */}
        <div className="sticky top-0 bg-[#FFF8E1] px-5 py-4 border-b-2 border-[#FFE082] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-[#5D4037]">🎁 亲子奖励中心</h2>
            <p className="text-[11px] text-[#8D6E63]">攒积分 · 和爸妈兑换心仪的奖励</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white hover:bg-[#FFE082] font-bold text-[#5D4037] transition-colors"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* 钱包 */}
        <div className="grid grid-cols-3 gap-2 px-5 py-3 text-center">
          <div className="rounded-2xl bg-[#FFF3C4] py-2">
            <p className="text-xl font-black text-[#F57F17] tabular-nums">{wallet.points}</p>
            <p className="text-[11px] text-[#8D6E63]">可用积分</p>
          </div>
          <div className="rounded-2xl bg-[#FDE0E6] py-2">
            <p className="text-xl font-black text-[#E91E63] tabular-nums">{wallet.streak}</p>
            <p className="text-[11px] text-[#8D6E63]">连续打卡(天)</p>
          </div>
          <div className="rounded-2xl bg-[#E1F5FE] py-2">
            <p className="text-xl font-black text-[#0288D1] tabular-nums">
              {wallet.monthPoints}
              <span className="text-xs">/{wallet.monthGoal}</span>
            </p>
            <p className="text-[11px] text-[#8D6E63]">本月进度</p>
          </div>
        </div>

        {/* 三档目录 */}
        <div className="px-4 pb-4 space-y-4">
          {data.tiers.map((tier) => (
            <TierSection
              key={tier.key}
              tier={tier}
              holdingId={holding}
              holdProgress={holdProgress}
              onStartHold={startHold}
              onStopHold={stopHold}
            />
          ))}
        </div>

        {/* 兑换记录 */}
        {data.history.length > 0 && (
          <div className="px-5 pb-5">
            <p className="text-xs font-bold text-[#8D6E63] mb-1.5">📋 最近兑换</p>
            <ul className="space-y-1">
              {data.history.slice(0, 5).map((h, i) => (
                <li key={i} className="flex justify-between text-xs text-[#5D4037] bg-white rounded-xl px-3 py-1.5">
                  <span>{h.emoji} {h.name}</span>
                  <span className="text-[#B08080]">-{h.cost}分</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full bg-[#5D4037] text-white text-sm font-bold shadow-xl animate-[popIn_0.25s_ease-out]" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}

function TierSection({
  tier,
  holdingId,
  holdProgress,
  onStartHold,
  onStopHold,
}: {
  tier: TierView
  holdingId: string | null
  holdProgress: number
  onStartHold: (id: string) => void
  onStopHold: () => void
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-1.5 px-1">
        <h3 className="text-sm font-black" style={{ color: tier.color }}>
          {tier.icon} {tier.name}
          <span className="ml-1.5 text-xs font-bold text-[#8D6E63]">{tier.cost} 积分/次</span>
        </h3>
        <span className={`text-[11px] font-bold ${tier.unlocked ? 'text-[#66BB6A]' : 'text-[#B08080]'}`}>
          {tier.progressText}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {tier.items.map((item) => {
          const isHolding = holdingId === item.id
          const progress = isHolding ? Math.min(100, holdProgress * 100) : 0
          return (
            <button
              key={item.id}
              disabled={!item.canRedeem}
              onMouseDown={() => item.canRedeem && onStartHold(item.id)}
              onMouseUp={onStopHold}
              onMouseLeave={onStopHold}
              onTouchStart={() => item.canRedeem && onStartHold(item.id)}
              onTouchEnd={onStopHold}
              onTouchCancel={onStopHold}
              className={`relative overflow-hidden text-left rounded-2xl px-3 py-2 border-2 transition-all ${
                item.canRedeem
                  ? 'border-transparent bg-white hover:border-[#FFE082] shadow-sm'
                  : 'border-transparent bg-[#F0E6DC] opacity-60 cursor-not-allowed'
              }`}
            >
              {isHolding && (
                <span className="absolute inset-y-0 left-0 bg-[#FFE082]/60 transition-[width] duration-100" style={{ width: `${progress}%` }} />
              )}
              <span className="relative flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-[#5D4037]">
                  {item.emoji} {item.name}
                </span>
                <span className={`text-[11px] font-bold whitespace-nowrap ${item.canRedeem ? 'text-[#66BB6A]' : 'text-[#B08080]'}`}>
                  {isHolding ? '松开取消…' : item.canRedeem ? '长按 2s 兑换' : item.statusText}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
