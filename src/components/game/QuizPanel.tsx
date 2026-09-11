// src/components/game/QuizPanel.tsx - 答题面板: 三种题型 + 倒计时 + 答题反馈
// 与小程序 quiz-panel 组件同构: 题目区在上, 选项区 2×2 网格
'use client'

import { QUIZ } from '@/game/constants'
import type { ViewSnapshot } from '@/game/engine'

interface Props {
  snap: ViewSnapshot
  onAnswer: (index: number) => void
}

const TYPE_BADGE: Record<string, string> = {
  en2zh: '英 → 中',
  zh2en: '中 → 英',
  word2pho: '选音标',
}

export default function QuizPanel({ snap, onAnswer }: Props) {
  const q = snap.question
  const fb = snap.feedback
  const remain = snap.quizRemainMs
  const ratio = remain !== null && snap.quizTimeLimit ? remain / snap.quizTimeLimit : 1
  const danger = remain !== null && remain <= QUIZ.TIMER_DANGER_MS
  const locked = fb !== null || !q

  return (
    <div
      className={`w-full bg-white/95 border-t-2 select-none transition-colors ${
        fb?.kind === 'correct'
          ? 'border-[#8BC34A] bg-[#F1F8E9]/95'
          : fb?.kind === 'wrong'
            ? 'border-[#E57373] bg-[#FDEBEA]/95'
            : 'border-[#F6B8C6]/60'
      }`}
      role="group"
      aria-label="答题面板"
    >
      {/* 倒计时条 */}
      <div className="h-1 w-full bg-[#F0E6DC]">
        <div
          className={`h-full transition-[width] duration-150 ease-linear ${danger ? 'bg-[#E57373]' : 'bg-[#8BC34A]'}`}
          style={{ width: `${Math.max(0, ratio * 100)}%` }}
        />
      </div>

      {q && (
        <div className="px-3 pt-2 pb-2.5 max-w-2xl mx-auto w-full">
          {/* 题头: 题型 + 剩余秒数 */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-[#B08080]">
              {TYPE_BADGE[q.type] ?? '答题'} · {q.prompt}
            </span>
            {remain !== null && (
              <span
                className={`text-[11px] font-black tabular-nums ${danger ? 'text-[#E57373] animate-pulse' : 'text-[#8D6E63]'}`}
              >
                ⏱ {Math.ceil(remain / 1000)}s
              </span>
            )}
          </div>

          {/* 题干 */}
          <div className="flex items-baseline gap-2 justify-center mb-2 min-h-[40px]">
            <span className="text-2xl sm:text-3xl font-black text-[#5D4037] break-all text-center">
              {q.content}
            </span>
            {q.phonetic && (
              <span className="text-sm text-[#8D6E63]">{q.phonetic}</span>
            )}
          </div>

          {/* 选项 2×2 */}
          <div className="grid grid-cols-2 gap-2">
            {q.options.map((opt, i) => {
              const isCorrect = fb !== null && i === q.correctAnswer
              const isWrongPick = fb?.kind === 'wrong'
              return (
                <button
                  key={`${q.id}-${i}`}
                  onClick={() => onAnswer(i)}
                  disabled={locked}
                  className={`rounded-xl px-2 py-2.5 text-sm sm:text-base font-bold border-2 transition-all ${
                    isCorrect
                      ? 'border-[#8BC34A] bg-[#DCEDC8] text-[#33691E] scale-[1.02]'
                      : isWrongPick && i === q.correctAnswer
                        ? 'border-[#8BC34A] bg-[#DCEDC8] text-[#33691E] animate-pulse'
                        : 'border-[#F0E6DC] bg-[#FFFDF8] text-[#5D4037] hover:border-[#F6B8C6] hover:bg-[#FFF3C4] active:scale-95'
                  } disabled:cursor-default`}
                >
                  {opt}
                </button>
              )
            })}
          </div>

          {/* 反馈条 */}
          <div className="h-5 mt-1 text-center text-xs font-bold" aria-live="polite">
            {fb?.kind === 'correct' && <span className="text-[#66BB6A]">✅ 答对啦！阳光 +30</span>}
            {fb?.kind === 'wrong' && (
              <span className="text-[#E57373]">
                ❌ 正确答案: {q.options[q.correctAnswer]}
                {snap.wrongStreak >= 2 ? ' · 僵尸加速了！' : ' · 再错一次会加速哦'}
              </span>
            )}
            {fb?.kind === 'timeout' && <span className="text-[#FFB300]">⏰ 超时啦，换一道题（不计错）</span>}
          </div>
        </div>
      )}
    </div>
  )
}
