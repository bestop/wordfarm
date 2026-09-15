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
  // v57: 仅在无题时锁定；新题加载后立即可答（对齐小程序温和化设计），
  //   feedback 残留期间不再锁按钮
  const locked = !q

  return (
    <div
      className={`w-full border-t backdrop-blur-xl shadow-[0_-4px_22px_rgba(93,64,55,0.07)] select-none transition-colors duration-300 ${
        fb?.kind === 'correct'
          ? 'border-[#8BC34A]/70 bg-[#F1F8E9]/85'
          : fb?.kind === 'wrong'
            ? 'border-[#E57373]/70 bg-[#FDEBEA]/85'
            : 'border-white/70 bg-white/70'
      }`}
      role="group"
      aria-label="答题面板"
    >
      {/* 倒计时条 */}
      <div className="h-1 w-full bg-[#F0E6DC]/60">
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
          {/* v57 修复: 选项不再按 correctAnswer 高亮 —— 引擎换题后 feedback 仍残留
              0.7~0.9s，旧逻辑会把「新题」的正确答案染绿直接剧透；与小程序对齐：
              反馈只走面板底色 + 文字横幅，选项保持中性色，新题立即可答 */}
          <div className="grid grid-cols-2 gap-2">
            {q.options.map((opt, i) => {
              return (
                <button
                  key={`${q.id}-${i}`}
                  onClick={() => onAnswer(i)}
                  disabled={locked}
                  className={`wf-glass-tile wf-focus rounded-xl px-2 py-2.5 text-sm sm:text-base font-bold text-[#5D4037] ${
                    locked ? 'cursor-default opacity-80' : ''
                  }`}
                >
                  {opt}
                </button>
              )
            })}
          </div>

          {/* 反馈条 */}
          {/* v57 修复: 不再展示「正确答案: xxx」文字 —— 同理会在新题上剧透答案，
              与小程序一致只提示对/错 + 惩罚预告 */}
          <div className="h-5 mt-1 text-center text-xs font-bold" aria-live="polite">
            {fb?.kind === 'correct' && <span className="text-[#66BB6A]">✅ 答对啦！阳光 +30</span>}
            {fb?.kind === 'wrong' && (
              <span className="text-[#E57373]">
                ❌ 答错啦！
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
