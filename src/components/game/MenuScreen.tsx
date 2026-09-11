// src/components/game/MenuScreen.tsx - 欢迎页：品牌标题 + 难度选择 + 词库导入 + 奖励中心入口
'use client'

import { useRef, useState, useSyncExternalStore } from 'react'
import { DIFFICULTY_CONFIG, type DifficultyKey } from '@/game/constants'
import { WORD_BANK_STATS } from '@/game/words'
import { parsePack, savePack, loadPackCached, subscribePack, removePack, validateFile } from '@/game/customPack'
import type { UserData } from '@/game/storage'

interface Props {
  userData: UserData
  onStart: (difficulty: DifficultyKey) => void
  onOpenRewards: () => void
  onToggleSound: () => void
}

const DIFF_ICONS: Record<DifficultyKey, string> = {
  primary: '🌱',
  junior: '🌿',
  senior: '🌳',
  ket: '🎓',
  pet: '🎩',
  custom: '📦',
}

export default function MenuScreen({ userData, onStart, onOpenRewards, onToggleSound }: Props) {
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const packInfo = useSyncExternalStore(subscribePack, loadPackCached, () => null)
  const fileRef = useRef<HTMLInputElement>(null)

  // 当前选中的难度（对齐小程序 diff-pill 选中态 + 底部「开始」大按钮的两步交互）
  // 默认选上次玩的难度；上次是自定义但词库已被清除则回退小学
  const [selected, setSelected] = useState<DifficultyKey>(() => {
    const last = userData.difficulty as DifficultyKey
    if (last && DIFFICULTY_CONFIG[last] && !(last === 'custom' && !packInfo)) return last
    return 'junior'
  })

  const handleFile = async (file: File) => {
    const v = validateFile(file)
    if (!v.ok) {
      setImportMsg({ ok: false, text: v.error || '文件校验失败' })
      return
    }
    try {
      const text = await file.text()
      const parsed = parsePack(text)
      if (!parsed.ok) {
        setImportMsg({ ok: false, text: parsed.error || '解析失败' })
        return
      }
      savePack(parsed)
      setSelected('custom')
      setImportMsg({ ok: true, text: `「${parsed.name}」导入成功（${parsed.words?.length ?? 0} 词）` })
    } catch {
      setImportMsg({ ok: false, text: '读取文件失败' })
    }
  }

  // 点难度卡片 = 仅选中（自定义无词库时引导导入）
  const handleSelect = (key: DifficultyKey) => {
    if (key === 'custom' && !packInfo) {
      fileRef.current?.click()
      return
    }
    setSelected(key)
  }

  // 点「开始游戏」= 以当前选中难度开局
  const handleStartClick = () => {
    if (selected === 'custom' && !packInfo) {
      fileRef.current?.click()
      return
    }
    onStart(selected)
  }

  const difficulties = Object.keys(DIFFICULTY_CONFIG) as DifficultyKey[]

  return (
    <div className="min-h-screen w-full bg-[#E8F7FB] flex flex-col items-center px-4 py-8">
      {/* 顶部品牌区 */}
      <header className="text-center mb-6 select-none">
        <div className="text-6xl mb-2 animate-bounce" aria-hidden>🌻</div>
        <h1 className="text-4xl font-black text-[#5D4037] tracking-wide" style={{ textShadow: '2px 2px 0 #F6B8C6' }}>
          单词农场
        </h1>
        <p className="mt-2 text-[#8D6E63] text-sm sm:text-base">
          萌系塔防 × 背单词 · 答题积攒阳光，种植物守住农场小屋！
        </p>
      </header>

      {/* 数据概览 */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
        <span className="px-3 py-1.5 rounded-full bg-white/80 text-[#5D4037] text-sm font-semibold shadow-sm">
          🏆 最高分 {userData.highestScore.toLocaleString()}
        </span>
        <span className="px-3 py-1.5 rounded-full bg-white/80 text-[#5D4037] text-sm font-semibold shadow-sm">
          🎮 已玩 {userData.totalGames} 局
        </span>
        <span className="px-3 py-1.5 rounded-full bg-white/80 text-[#5D4037] text-sm font-semibold shadow-sm">
          📖 词库 {WORD_BANK_STATS.total} 词
        </span>
        <button
          onClick={onToggleSound}
          className="px-3 py-1.5 rounded-full bg-white/80 hover:bg-white text-[#5D4037] text-sm font-semibold shadow-sm transition-colors"
          aria-label={userData.soundEnabled ? '关闭音效' : '开启音效'}
        >
          {userData.soundEnabled ? '🔊 音效开' : '🔇 音效关'}
        </button>
      </div>

      {/* ① 难度选择：点卡片仅选中 */}
      <h2 className="text-[#5D4037] font-bold mb-3">① 选择难度</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-2xl">
        {difficulties.map((key) => {
          const cfg = DIFFICULTY_CONFIG[key]
          const locked = key === 'custom' && !packInfo
          const isSelected = selected === key
          return (
            <button
              key={key}
              onClick={() => handleSelect(key)}
              aria-pressed={isSelected}
              className={`group rounded-2xl p-4 text-left shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all border-2 ${
                isSelected
                  ? 'border-[#3F8F35] bg-gradient-to-br from-[#8FD27A] to-[#57AA4A] ring-2 ring-[#8FD27A] ring-offset-1'
                  : locked
                    ? 'bg-white border-dashed border-[#F6B8C6]'
                    : 'bg-white border-transparent hover:border-[#F6B8C6]'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl" aria-hidden>{DIFF_ICONS[key]}</span>
                <span className={`font-bold ${isSelected ? 'text-white' : 'text-[#5D4037]'}`}>
                  {isSelected && <span aria-hidden>🍃 </span>}{cfg.name}
                </span>
              </div>
              <p className={`text-xs leading-5 ${isSelected ? 'text-white/90' : 'text-[#8D6E63]'}`}>
                {key === 'custom'
                  ? packInfo
                    ? `📚 ${packInfo.name} · ${packInfo.count} 词`
                    : '点击导入词库文件 (JSON)'
                  : cfg.desc}
              </p>
              <p className={`mt-1.5 text-[11px] ${isSelected ? 'text-white/75' : 'text-[#B08080]'}`}>
                ⏱ 单题 {cfg.questionTimeLimit / 1000}s · 🧟 间隔 {cfg.spawnInterval / 1000}s
              </p>
            </button>
          )
        })}
      </div>

      {/* ② 开始游戏：显式大按钮（对齐小程序底部绿色渐变 start-main） */}
      <div className="w-full max-w-2xl mt-5 flex flex-col items-center gap-1.5">
        <button
          onClick={handleStartClick}
          className="w-full py-4 rounded-full text-white text-lg font-black tracking-[0.25em] transition-transform active:scale-[0.98] hover:brightness-105"
          style={{
            background: 'linear-gradient(180deg, #9BDF7F 0%, #6FCF5E 50%, #4EA944 100%)',
            boxShadow: '0 5px 0 #35742C, 0 12px 22px rgba(79,155,63,0.32), inset 0 2px 0 rgba(255,255,255,0.55)',
          }}
        >
          开始游戏
        </button>
        <p className="text-xs text-[#8D6E63]" aria-live="polite">
          当前难度：{DIFFICULTY_CONFIG[selected].name} · ⏱ 单题 {DIFFICULTY_CONFIG[selected].questionTimeLimit / 1000}s · 🧟 间隔 {DIFFICULTY_CONFIG[selected].spawnInterval / 1000}s
        </p>
      </div>

      {/* 导入反馈 + 管理 */}
      {importMsg && (
        <p className={`mt-3 text-sm font-medium ${importMsg.ok ? 'text-[#66BB6A]' : 'text-[#E57373]'}`} role="status">
          {importMsg.ok ? '✅ ' : '⚠️ '}
          {importMsg.text}
        </p>
      )}
      {packInfo && (
        <div className="mt-2 flex items-center gap-2 text-xs text-[#8D6E63]">
          <span>当前词库: {packInfo.name}（{packInfo.count} 词）</span>
          <button
            onClick={() => {
              removePack()
              setImportMsg({ ok: true, text: '已清除自定义词库' })
            }}
            className="underline hover:text-[#E57373]"
          >
            删除
          </button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".json,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
          e.target.value = ''
        }}
        aria-label="导入词库文件"
      />

      {/* 奖励中心 */}
      <button
        onClick={onOpenRewards}
        className="mt-7 px-6 py-3 rounded-full bg-[#F6B8C6] hover:bg-[#F2A6B8] text-white font-bold shadow-md transition-colors text-sm"
      >
        🎁 亲子奖励中心
      </button>

      {/* 玩法说明 */}
      <div className="mt-6 w-full max-w-2xl rounded-2xl bg-white/85 p-4 text-sm text-[#5D4037] leading-6 shadow-sm">
        <p className="font-bold mb-1"> 🕹 怎么玩？</p>
        <p>
          ① 底部答题面板会持续出题（英译中 / 中译英 / 选音标），答对可得 <b>阳光 +30</b> 与分数，连击越高倍率越大（最高 ×3）。
        </p>
        <p>② 用阳光在下方商店点击选择植物，再点击草地格子种下：向日葵产阳光、豌豆射手打僵尸、坚果挡路…</p>
        <p>③ 僵尸共 10 关，越往后越强；第 10 关僵尸王携护卫队压境，清完全场即胜利。防线共 3 道，全破则失败。</p>
        <p className="text-xs text-[#B08080] mt-1">答错前 1 次只清连击不加速（儿童向温和惩罚）；超时自动换题不扣分。</p>
      </div>
    </div>
  )
}
