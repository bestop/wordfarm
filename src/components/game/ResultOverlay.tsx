// src/components/game/ResultOverlay.tsx - 结算弹窗: 星级 + 统计 + 错词回顾 + 亲子积分
'use client'

import type { GameSummary } from '@/game/engine'
import type { SettleResult } from '@/game/reward'
import { DIFFICULTY_CONFIG } from '@/game/constants'

interface Props {
  summary: GameSummary
  settle: SettleResult | null
  highestScore: number
  isRecord: boolean
  onRestart: () => void
  onMenu: () => void
}

function fmtTime(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}分${String(s % 60).padStart(2, '0')}秒`
}

export default function ResultOverlay({ summary, settle, highestScore, isRecord, onRestart, onMenu }: Props) {
  const win = summary.result === 'win'
  const cfg = DIFFICULTY_CONFIG[summary.difficulty]

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div
        className={`w-full max-w-md rounded-3xl bg-[#FFFDF8] shadow-2xl border-4 overflow-hidden animate-[popIn_0.35s_ease-out] ${
          win ? 'border-[#FFE082]' : 'border-[#F6B8C6]'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={win ? '胜利结算' : '失败结算'}
      >
        {/* 头部 */}
        <div className={`px-6 pt-6 pb-4 text-center ${win ? 'bg-[#FFF8E1]' : 'bg-[#FDEBEA]'}`}>
          <div className="text-5xl mb-1" aria-hidden>{win ? '🎉' : '🛡️'}</div>
          <h2 className={`text-2xl font-black ${win ? 'text-[#F57F17]' : 'text-[#E57373]'}`}>
            {win ? '农场守住了！' : '防线失守…'}
          </h2>
          <div className="mt-2 text-3xl tracking-widest" aria-label={`${summary.stars} 星`}>
            {[1, 2, 3].map((i) => (
              <span
                key={i}
                className={`inline-block ${i <= summary.stars ? 'animate-[popIn_0.5s_ease-out_both]' : 'grayscale opacity-25'}`}
                style={{ animationDelay: `${i * 0.18}s` }}
                aria-hidden
              >
                ⭐
              </span>
            ))}
          </div>
          {isRecord && (
            <p className="mt-1 text-xs font-bold text-[#E91E63]">🏆 新纪录！超过历史最高 {highestScore.toLocaleString()}</p>
          )}
        </div>

        {/* 统计 */}
        <div className="grid grid-cols-3 gap-2 px-5 py-3 text-center">
          <div>
            <p className="text-xl font-black text-[#5D4037] tabular-nums">{summary.score.toLocaleString()}</p>
            <p className="text-[11px] text-[#8D6E63]">得分</p>
          </div>
          <div>
            <p className="text-xl font-black text-[#E91E63] tabular-nums">
              {summary.maxCombo}
              <span className="text-xs">连</span>
            </p>
            <p className="text-[11px] text-[#8D6E63]">最高连击</p>
          </div>
          <div>
            <p className="text-xl font-black text-[#66BB6A] tabular-nums">{summary.killedZombies}</p>
            <p className="text-[11px] text-[#8D6E63]">消灭僵尸</p>
          </div>
          <div>
            <p className="text-base font-bold text-[#5D4037] tabular-nums">
              {summary.correctCount}/{summary.totalAnswered}
            </p>
            <p className="text-[11px] text-[#8D6E63]">答对/总题</p>
          </div>
          <div>
            <p className="text-base font-bold text-[#5D4037] tabular-nums">{Math.round(summary.accuracy * 100)}%</p>
            <p className="text-[11px] text-[#8D6E63]">准确率</p>
          </div>
          <div>
            <p className="text-base font-bold text-[#5D4037] tabular-nums">{fmtTime(summary.gameTime)}</p>
            <p className="text-[11px] text-[#8D6E63]">坚持时长</p>
          </div>
        </div>

        {/* 亲子积分 */}
        {settle && (
          <div className="mx-5 mb-3 rounded-2xl bg-[#FFF3C4] px-4 py-2.5 text-center">
            <p className="text-sm font-bold text-[#F57F17]">
              🎁 亲子积分 <span className="text-xl font-black">+{settle.earned}</span>
              <span className="text-xs text-[#B08080] font-normal">（钱包 {settle.points}）</span>
            </p>
            <p className="text-[11px] text-[#8D6E63] mt-0.5">{settle.detailText}</p>
          </div>
        )}
        {!settle && !win && (
          <p className="mx-5 mb-3 text-center text-[11px] text-[#B08080]">
            答对 3 题以上的败局也能获得努力积分哦（本局 {summary.correctCount} 题）
          </p>
        )}

        {/* 错词回顾 */}
        {summary.wrongWords.length > 0 && (
          <div className="mx-5 mb-4 max-h-32 overflow-y-auto rounded-2xl bg-[#F1F8E9] px-4 py-2.5">
            <p className="text-xs font-bold text-[#558B2F] mb-1">📖 错词回顾（下次记得它们！）</p>
            <ul className="space-y-0.5">
              {summary.wrongWords.map((w, i) => (
                <li key={i} className="text-xs text-[#5D4037] flex justify-between gap-2">
                  <span className="font-bold">
                    {w.word}
                    {w.phonetic && <span className="text-[#8D6E63] font-normal"> {w.phonetic}</span>}
                  </span>
                  <span className="text-right">{w.meaning}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 按钮 */}
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={onMenu}
            className="flex-1 py-3 rounded-2xl bg-[#F0E6DC] hover:bg-[#E8D5C4] text-[#5D4037] font-bold transition-colors"
          >
            回首页
          </button>
          <button
            onClick={onRestart}
            className="flex-1 py-3 rounded-2xl bg-[#F6B8C6] hover:bg-[#F2A6B8] text-white font-bold shadow-md transition-colors"
          >
            再玩一次
          </button>
        </div>
        <p className="pb-3 text-center text-[11px] text-[#B08080]">
          {cfg.name}难度 · 第 {summary.level} 关 · 超时 {summary.timeoutCount} 次
        </p>
      </div>
    </div>
  )
}
