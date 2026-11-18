// src/components/game/MenuScreen.tsx - 欢迎页：品牌标题 + 难度选择 + 教材词库三级筛选 + 词库导入 + 奖励中心/玩法弹窗入口
// 视觉: 暖调玻璃拟态（wf-glass 体系）— 天光渐变背景 + 漂浮光斑 + 磨砂卡片/按钮
// v88: 同步小程序 v82~v87 —— 教材词库 34 档（沪教 10 + 人教PEP 12 + 外研 12）三级筛选选择器（版本→年级→上下册）
'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { CORE_DIFFICULTY_KEYS, DIFFICULTY_CONFIG, type CoreDifficultyKey, type DifficultyKey } from '@/game/constants'
import { TEXTBOOK_BANKS, TEXTBOOK_EDITIONS, findTextbookMeta, WORD_BANK_STATS, type TextbookEditionKey, type Word } from '@/game/words'
import { parsePack, savePack, loadPackCached, subscribePack, removePack, validateFile } from '@/game/customPack'
import { saveUserData, type UserData } from '@/game/storage'

interface Props {
  userData: UserData
  onStart: (difficulty: DifficultyKey) => void
  onOpenRewards: () => void
  onToggleSound: () => void
}

const DIFF_ICONS: Record<CoreDifficultyKey, string> = {
  primary: '🌱',
  junior: '🌿',
  senior: '🌳',
  ket: '🎓',
  pet: '🎩',
  custom: '📦',
}

// v89: 难度卡图标果冻底衬色（与选中卡绿色区分，未选中也能快速识别）
const DIFF_ICON_BG: Record<CoreDifficultyKey, string> = {
  primary: '#C8ECB0',
  junior: '#B5E4A5',
  senior: '#CFE8BF',
  ket: '#FDF09E',
  pet: '#FCE1B8',
  custom: '#FBE3E9',
}

// v89: 入场阶梯延迟（区块依次上浮弹入）
const RISE = (i: number) => ({ animationDelay: `${i * 90}ms` })

export default function MenuScreen({ userData, onStart, onOpenRewards, onToggleSound }: Props) {
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const packInfo = useSyncExternalStore(subscribePack, loadPackCached, () => null)
  const fileRef = useRef<HTMLInputElement>(null)
  // 「如何玩」弹窗（点击菜单后显示，避免首页信息过载）
  const [showHelp, setShowHelp] = useState(false)
  const helpCloseRef = useRef<HTMLButtonElement>(null)

  // 弹窗打开时聚焦关闭按钮 + ESC 关闭
  useEffect(() => {
    if (!showHelp) return
    helpCloseRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowHelp(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showHelp])

  // ---- 教材词库三级筛选（v88）: 版本 → 年级 → 上下册，与小程序端「更多词库」弹窗同构 ----
  // 纯派生模式（React「You Might Not Need an Effect」）: chips 交互存 override，
  //   未交互时跟随选中档位反推（SSR→hydration userData 更新后自动恢复，无需 effect setState）
  const [dictOverride, setDictOverride] = useState<{ ed: TextbookEditionKey; grade: number; vol: 'up' | 'down' } | null>(null)

  // 当前选中的难度（对齐小程序 diff-pill 选中态 + 底部「开始」大按钮的两步交互）
  // touchedKey = 用户手动选过的档；未手动选时跟随持久化难度（上次是 custom 但词库已清除则回退初中）
  const [touchedKey, setTouchedKey] = useState<DifficultyKey | null>(null)
  const lastKey = userData.difficulty as DifficultyKey
  const selected: DifficultyKey =
    touchedKey ??
    (lastKey && DIFFICULTY_CONFIG[lastKey] && !(lastKey === 'custom' && !packInfo) ? lastKey : 'junior')

  // 三级筛选当前值: 有交互用 override，否则从选中档位反推（教材档）；非教材档默认外研一上
  const selMeta = findTextbookMeta(selected)
  const dictFilter = dictOverride ?? (selMeta
    ? { ed: selMeta.edition, grade: selMeta.grade, vol: selMeta.vol }
    : { ed: 'wy' as TextbookEditionKey, grade: 1, vol: 'up' as const })

  const handleEditionClick = (edKey: TextbookEditionKey) => {
    const ed = TEXTBOOK_EDITIONS.find((e) => e.key === edKey)
    setDictOverride({ ed: edKey, grade: ed ? Math.min(dictFilter.grade, ed.maxGrade) : dictFilter.grade, vol: dictFilter.vol })
  }

  // 三级筛选派生值（依赖 selected，须在其后计算）
  const dictEd = TEXTBOOK_EDITIONS.find((e) => e.key === dictFilter.ed) || TEXTBOOK_EDITIONS[0]
  const dictBankKey = `${dictFilter.ed}${dictFilter.grade}${dictFilter.vol === 'down' ? 'b' : ''}` as DifficultyKey
  const dictBankWords = (TEXTBOOK_BANKS as Record<string, Word[] | undefined>)[dictBankKey]
  const dictSelected = selected === dictBankKey

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
      setTouchedKey('custom')
      saveUserData({ difficulty: 'custom' })
      setImportMsg({ ok: true, text: `「${parsed.name}」导入成功（${parsed.words?.length ?? 0} 词）` })
    } catch {
      setImportMsg({ ok: false, text: '读取文件失败' })
    }
  }

  // 点难度卡片 = 仅选中（自定义无词库时引导导入）；选中即持久化，与小程序端选档写 storage 一致
  const handleSelect = (key: DifficultyKey) => {
    if (key === 'custom' && !packInfo) {
      fileRef.current?.click()
      return
    }
    setTouchedKey(key)
    saveUserData({ difficulty: key })
  }

  // 点「开始游戏」= 以当前选中难度开局
  const handleStartClick = () => {
    if (selected === 'custom' && !packInfo) {
      fileRef.current?.click()
      return
    }
    onStart(selected)
  }

  const difficulties = CORE_DIFFICULTY_KEYS

  // 教材档选中态（核心卡片区下方提示 + 开始区文案共用）
  const selBankWords = selMeta
    ? (TEXTBOOK_BANKS as Record<string, Word[] | undefined>)[selMeta.key]
    : undefined

  // 三级筛选 chips 公共样式: 选中时用版本主题色填充，未选中玻璃胶囊
  const chipCls = (active: boolean) =>
    `wf-focus px-4 py-1.5 rounded-full text-sm font-bold transition-all duration-150 ${
      active ? 'text-white shadow-sm scale-[1.04]' : 'wf-glass text-[#5D4037] hover:bg-white/85'
    }`

  return (
    <div className="wf-menu-bg relative min-h-screen w-full flex flex-col items-center px-4 py-8 overflow-hidden">
      {/* 装饰光斑（漂浮氛围，不参与交互） */}
      <div aria-hidden className="wf-blob w-[420px] h-[420px] -top-32 -left-24 bg-[#FFE082]/45 animate-[wfFloat_11s_ease-in-out_infinite]" />
      <div aria-hidden className="wf-blob w-[380px] h-[380px] top-24 -right-28 bg-[#F6B8C6]/40 animate-[wfFloatSlow_13s_ease-in-out_infinite]" />
      <div aria-hidden className="wf-blob w-[460px] h-[460px] -bottom-40 left-1/4 bg-[#8FD27A]/35 animate-[wfFloat_15s_ease-in-out_infinite]" />

      <div className="relative z-10 w-full flex flex-col items-center">
        {/* 顶部品牌区 */}
        <header className="wf-rise text-center mb-6 select-none">
          <div
            className="wf-jelly wf-glass wf-focus mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-3 animate-[wfFloat_6s_ease-in-out_infinite] ring-2 ring-white/90"
            style={{ boxShadow: '0 10px 24px rgba(93,64,55,0.14), inset 0 2px 0 rgba(255,255,255,0.95), inset 0 -6px 12px rgba(246,184,198,0.28)' }}
            aria-hidden
          >
            <span className="text-5xl drop-shadow-sm">🌻</span>
          </div>
          <h1 className="wf-plaque-title text-4xl font-black tracking-[0.08em]">单词农场</h1>
          <p className="mt-2.5 text-[#8D6E63] text-sm sm:text-base">
            萌系塔防 × 背单词 · 答题积攒阳光，种植物守住农场篱笆门！
          </p>
        </header>

        {/* 数据概览 */}
        <div className="wf-rise flex flex-wrap items-center justify-center gap-2 mb-6" style={RISE(1)}>
          <span className="wf-glass-chip wf-focus px-3.5 py-1.5 rounded-full text-[#5D4037] text-sm font-semibold">
            🏆 最高分 {userData.highestScore.toLocaleString()}
          </span>
          <span className="wf-glass-chip wf-focus px-3.5 py-1.5 rounded-full text-[#5D4037] text-sm font-semibold">
            🎮 已玩 {userData.totalGames} 局
          </span>
          <span className="wf-glass-chip wf-focus px-3.5 py-1.5 rounded-full text-[#5D4037] text-sm font-semibold">
            📖 词库 {WORD_BANK_STATS.total} 词 · 教材 {WORD_BANK_STATS.textbookBanks} 档
          </span>
          <button
            onClick={onToggleSound}
            className="wf-glass-chip wf-focus px-3.5 py-1.5 rounded-full text-[#5D4037] text-sm font-semibold hover:bg-white/85 transition-colors"
            aria-label={userData.soundEnabled ? '关闭音效' : '开启音效'}
          >
            {userData.soundEnabled ? '🔊 音效开' : '🔇 音效关'}
          </button>
        </div>

        {/* ① 难度选择：点卡片仅选中 */}
        <h2 className="wf-rise text-[#5D4037] font-bold mb-3 tracking-wide" style={RISE(2)}>① 选择难度</h2>
        <div className="wf-rise grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-2xl" style={RISE(3)}>
          {difficulties.map((key) => {
            const cfg = DIFFICULTY_CONFIG[key]
            const locked = key === 'custom' && !packInfo
            const isSelected = selected === key
            return (
              <button
                key={key}
                onClick={() => handleSelect(key)}
                aria-pressed={isSelected}
                className={`wf-focus group relative rounded-2xl p-4 text-left hover:-translate-y-1 transition-all duration-200 ${
                  isSelected
                    ? 'border-2 border-[#3F8F35] bg-gradient-to-br from-[#8FD27A]/95 to-[#57AA4A]/95 -translate-y-1 ring-2 ring-[#8FD27A]/60 ring-offset-1 ring-offset-transparent shadow-[0_14px_30px_rgba(79,155,63,0.3)]'
                    : locked
                      ? 'wf-glass border-dashed border-[#F6B8C6]/80'
                      : 'wf-glass hover:shadow-[0_14px_32px_rgba(93,64,55,0.16)] hover:border-[#F6B8C6]/70'
                }`}
              >
                {/* v89: 选中态右上角糖珠徽章 */}
                {isSelected && (
                  <span
                    aria-hidden
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white flex items-center justify-center text-[11px] text-[#3F8F35] font-black shadow-[0_2px_6px_rgba(79,155,63,0.4)] ring-1 ring-[#8FD27A]"
                  >
                    ✓
                  </span>
                )}
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span
                    aria-hidden
                    className="wf-icon-jelly w-10 h-10 text-xl shrink-0"
                    style={{
                      background: isSelected
                        ? 'linear-gradient(160deg, rgba(255,255,255,0.42), rgba(255,255,255,0.16))'
                        : `linear-gradient(160deg, ${DIFF_ICON_BG[key]}F2, ${DIFF_ICON_BG[key]}C9)`,
                    }}
                  >
                    {DIFF_ICONS[key]}
                  </span>
                  <span className={`font-bold ${isSelected ? 'text-white' : 'text-[#5D4037]'}`}>
                    {cfg.name}
                  </span>
                </div>
                <p className={`text-xs leading-5 ${isSelected ? 'text-white/95' : 'text-[#8D6E63]'}`}>
                  {key === 'custom'
                    ? packInfo
                      ? `📚 ${packInfo.name} · ${packInfo.count} 词`
                      : '点击导入词库文件 (JSON)'
                    : cfg.desc}
                </p>
                <p className={`mt-1.5 text-[11px] ${isSelected ? 'text-white/80' : 'text-[#B08080]'}`}>
                  ⏱ 单题 {cfg.questionTimeLimit / 1000}s · 🧟 间隔 {cfg.spawnInterval / 1000}s
                </p>
              </button>
            )
          })}
        </div>

        {/* ② 教材词库：三级筛选 版本→年级→上下册（v88 同步小程序端「更多词库」34 档独立词池） */}
        <div className="wf-rise w-full max-w-2xl mt-6" style={RISE(4)}>
          <h2 className="text-[#5D4037] font-bold mb-3 tracking-wide">
            ② 教材词库
            <span className="ml-2 text-xs font-medium text-[#8D6E63]">选教材词库替换题库，按年级难度开局</span>
          </h2>
          <div className="wf-glass rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="选择版本">
              {TEXTBOOK_EDITIONS.map((ed) => (
                <button
                  key={ed.key}
                  onClick={() => handleEditionClick(ed.key)}
                  aria-pressed={dictFilter.ed === ed.key}
                  className={`${chipCls(dictFilter.ed === ed.key)} hover:-translate-y-0.5`}
                  style={dictFilter.ed === ed.key ? { background: ed.color } : undefined}
                >
                  {dictFilter.ed === ed.key ? '🍃 ' : ''}{ed.name}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="选择年级">
              {Array.from({ length: dictEd.maxGrade }, (_, i) => i + 1).map((g) => (
                <button
                  key={g}
                  onClick={() => setDictOverride({ ...dictFilter, grade: g })}
                  aria-pressed={dictFilter.grade === g}
                  className={`${chipCls(dictFilter.grade === g)} hover:-translate-y-0.5`}
                  style={dictFilter.grade === g ? { background: dictEd.color } : undefined}
                >
                  {g}年级
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="选择册别">
              {(['up', 'down'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setDictOverride({ ...dictFilter, vol: v })}
                  aria-pressed={dictFilter.vol === v}
                  className={`${chipCls(dictFilter.vol === v)} hover:-translate-y-0.5`}
                  style={dictFilter.vol === v ? { background: dictEd.color } : undefined}
                >
                  {v === 'up' ? '上册' : '下册'}
                </button>
              ))}
            </div>
            {/* 命中结果行: 版本×年级×册别 → 恰一档，展示词数并一键选中（v89: 版本色左竖条 + 果冻「选它」） */}
            <div className="relative flex items-center justify-between gap-3 rounded-xl bg-white/65 px-4 py-3 overflow-hidden">
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-1.5"
                style={{ background: `linear-gradient(180deg, ${dictEd.color}, ${dictEd.color}B3)` }}
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#5D4037] truncate">
                  {dictEd.name} {dictFilter.grade} 年级{dictFilter.vol === 'up' ? '上册' : '下册'}
                </p>
                <p className="text-xs text-[#8D6E63] mt-0.5 truncate">
                  {dictBankWords ? `${dictBankWords.length} 词 · ${dictEd.desc}` : '该版本暂无此册词库'}
                </p>
              </div>
              {dictSelected ? (
                <span
                  className="shrink-0 px-3 py-1 rounded-full bg-[#E8F5E9] text-[#2E7D32] text-sm font-bold ring-1 ring-[#A5D6A7]"
                  aria-live="polite"
                >
                  ✓ 已选中
                </span>
              ) : (
                <button
                  onClick={() => {
                    setTouchedKey(dictBankKey)
                    saveUserData({ difficulty: dictBankKey }) // 选档即持久化（对齐小程序端 v82 选词库写 storage）
                  }}
                  disabled={!dictBankWords}
                  className="wf-focus shrink-0 px-4 py-1.5 rounded-full text-white text-sm font-bold transition-transform active:translate-y-0.5 active:scale-[0.97] disabled:opacity-40"
                  style={{
                    background: `linear-gradient(180deg, ${dictEd.color} 0%, ${dictEd.color}CC 100%)`,
                    boxShadow: `0 3px 0 ${dictEd.color}66, 0 5px 12px rgba(93,64,55,0.2), inset 0 1px 0 rgba(255,255,255,0.5)`,
                  }}
                >
                  选它
                </button>
              )}
            </div>
          </div>
          {selMeta && (
            <p className="mt-2 text-xs text-[#8D6E63] text-center" aria-live="polite">
              已选教材词库：{selMeta.name}（{selBankWords?.length ?? 0} 词）— 点「开始游戏」即用该词库
            </p>
          )}
        </div>

        {/* ③ 开始游戏：显式大按钮（对齐小程序底部绿色渐变 start-main） */}
        <div className="wf-rise w-full max-w-2xl mt-5 flex flex-col items-center gap-1.5" style={RISE(5)}>
          <button
            onClick={handleStartClick}
            className="wf-shine wf-focus w-full py-4 rounded-full text-white text-lg font-black tracking-[0.25em] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:scale-[0.99]"
            style={{
              background: 'linear-gradient(180deg, #9BDF7F 0%, #6FCF5E 50%, #4EA944 100%)',
              boxShadow:
                '0 6px 0 #35742C, 0 16px 32px rgba(79,155,63,0.35), inset 0 2px 0 rgba(255,255,255,0.6), inset 0 -2px 6px rgba(53,116,44,0.25)',
            }}
          >
            开始游戏
          </button>
          <p className="text-xs text-[#8D6E63]" aria-live="polite">
            {selMeta
              ? `当前词库：${selMeta.name} · ⏱ 单题 ${DIFFICULTY_CONFIG[selected].questionTimeLimit / 1000}s · 🧟 间隔 ${DIFFICULTY_CONFIG[selected].spawnInterval / 1000}s`
              : `当前难度：${DIFFICULTY_CONFIG[selected].name} · ⏱ 单题 ${DIFFICULTY_CONFIG[selected].questionTimeLimit / 1000}s · 🧟 间隔 ${DIFFICULTY_CONFIG[selected].spawnInterval / 1000}s`}
          </p>
        </div>

        {/* 导入反馈 + 管理 */}
        {importMsg && (
          <p
            className={`wf-glass-chip mt-3 px-4 py-1.5 rounded-full text-sm font-medium ${importMsg.ok ? 'text-[#2E7D32]' : 'text-[#C62828]'}`}
            role="status"
          >
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
              className="wf-focus underline underline-offset-2 hover:text-[#E57373] transition-colors"
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

        {/* 次级入口：如何玩 + 亲子奖励中心 */}
        <div className="wf-rise mt-7 flex flex-wrap items-center justify-center gap-3" style={RISE(6)}>
          <button
            onClick={() => setShowHelp(true)}
            aria-haspopup="dialog"
            aria-expanded={showHelp}
            className="wf-jelly wf-glass-btn wf-focus px-7 py-3 rounded-full text-[#3E7D33] font-bold text-sm"
          >
            🕹 如何玩
          </button>
          <button
            onClick={onOpenRewards}
            className="wf-jelly wf-glass-btn wf-focus px-7 py-3 rounded-full text-[#D4566F] font-bold text-sm"
          >
            🎁 亲子奖励中心
          </button>
        </div>
      </div>

      {/* 玩法说明弹窗（点击「如何玩」后显示） */}
      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#5D4037]/35 backdrop-blur-sm px-4"
          role="dialog"
          aria-modal="true"
          aria-label="如何玩"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="wf-glass-strong w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl p-6 animate-[popIn_0.3s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black text-[#5D4037]">🕹 如何玩</h2>
              <button
                ref={helpCloseRef}
                onClick={() => setShowHelp(false)}
                className="wf-glass-btn wf-focus w-9 h-9 rounded-full text-[#D4566F] font-bold"
                aria-label="关闭玩法说明"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-sm text-[#5D4037] leading-6">
              <section className="wf-glass rounded-2xl p-3.5">
                <p className="font-bold mb-1">🎯 游戏目标</p>
                <p>守住农场篱笆门，闯过全部 10 关。僵尸共 10 波、越往后越强；第 10 关僵尸王携护卫队压境，清完全场即胜利。防线共 3 道，全破则失败。</p>
              </section>
              <section className="wf-glass rounded-2xl p-3.5">
                <p className="font-bold mb-1">☀️ 答题得阳光</p>
                <p>底部答题面板持续出题（英译中 / 中译英 / 选音标），答对可得 <b>阳光 +30</b> 与分数，连击越高倍率越大（最高 ×3）。</p>
              </section>
              <section className="wf-glass rounded-2xl p-3.5">
                <p className="font-bold mb-1">🌱 种植防御</p>
                <p>用阳光在下方商店点选植物，再点击草地格子种下：向日葵产阳光、豌豆射手打僵尸、坚果挡路、寒冰射手减速、樱桃炸弹范围爆炸、食人花一口吞。</p>
              </section>
              <section className="wf-glass rounded-2xl p-3.5">
                <p className="font-bold mb-1">💝 温和惩罚（儿童向）</p>
                <p className="text-xs text-[#8D6E63]">答错前 1 次只清连击不加速；超时自动换题不扣分。</p>
              </section>
            </div>
            <button
              onClick={() => setShowHelp(false)}
              className="wf-shine wf-focus mt-5 w-full py-3 rounded-full text-white font-black tracking-[0.2em] transition-transform active:scale-[0.98] hover:brightness-105"
              style={{
                background: 'linear-gradient(180deg, #9BDF7F 0%, #6FCF5E 50%, #4EA944 100%)',
                boxShadow: '0 4px 0 #35742C, 0 10px 22px rgba(79,155,63,0.32), inset 0 2px 0 rgba(255,255,255,0.6)',
              }}
            >
              知道啦，开始冒险！
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
