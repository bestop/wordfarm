// src/components/game/PvZGame.tsx - 主组件: 菜单 ⇄ 游戏, 引擎驱动 + Canvas 渲染
// 架构对应小程序端 game.js 页面壳: 逻辑在 engine(逻辑层), UI 在 React(视图层),
// 通过 engine.subscribe(80ms 节流) 同步视图, 主循环由本组件 requestAnimationFrame 驱动
'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { GRID, type DifficultyKey, type PlantType } from '@/game/constants'
import { GameEngine, type GameSummary, type ViewSnapshot } from '@/game/engine'
import { render } from '@/game/renderer'
import { audioManager } from '@/game/audio'
import { loadPack, loadPackCached, subscribePack, type SavedPack } from '@/game/customPack'
import {
  DEFAULT_USER_DATA, loadUserData, loadUserDataCached, saveUserData,
  subscribeUserData,
} from '@/game/storage'
import { settleWin, settleLose, type SettleResult } from '@/game/reward'

import MenuScreen from './MenuScreen'
import Hud from './Hud'
import PlantShop from './PlantShop'
import QuizPanel from './QuizPanel'
import ResultOverlay from './ResultOverlay'
import PauseOverlay from './PauseOverlay'
import RewardCenter from './RewardCenter'

export default function PvZGame() {
  const [screen, setScreen] = useState<'menu' | 'game'>('menu')
  const [result, setResult] = useState<{ summary: GameSummary; settle: SettleResult | null; isRecord: boolean } | null>(null)
  const [showRewards, setShowRewards] = useState(false)
  const [difficulty, setDifficulty] = useState<DifficultyKey>('junior')

  // 引擎实例（惰性初始化: GameEngine 构造函数纯内存操作, SSR 安全）
  const [engine] = useState(() => new GameEngine())

  // 游戏视图快照（引擎 80ms 节流推送）
  const [snap, setSnap] = useState<ViewSnapshot>(() => engine.getSnapshot())

  // localStorage 数据（useSyncExternalStore: SSR 安全 + 写入即通知）
  const userData = useSyncExternalStore(subscribeUserData, loadUserDataCached, () => DEFAULT_USER_DATA)
  const pack = useSyncExternalStore(subscribePack, loadPackCached, () => null as SavedPack | null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)

  // ---- 引擎订阅 / 音效初始化 / 结算回调 ----
  useEffect(() => {
    audioManager.init(loadUserData().soundEnabled)
    const unsub = engine.subscribe(() => setSnap(engine.getSnapshot()))
    // 调试探针（生产无副作用）
    ;(window as unknown as { __wf?: GameEngine }).__wf = engine
    return () => {
      unsub()
    }
  }, [engine])

  // ---- 结算回调: 存储最高分/局数 + 亲子积分结算 ----
  useEffect(() => {
    const unbind = engine.bindGameOver((summary) => {
      const data = loadUserData()
      const isRecord = summary.score > data.highestScore
      saveUserData({
        highestScore: Math.max(data.highestScore, summary.score),
        totalGames: data.totalGames + 1,
        difficulty: summary.difficulty,
      })
      const settle = summary.result === 'win' ? settleWin(summary) : settleLose(summary)
      setResult({ summary, settle, isRecord })
    })
    return unbind
  }, [engine])

  // ---- 布局: house 条 + 草地网格(3 行 × 5 列) ----
  const computeLayout = useCallback(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return
    const W = stage.clientWidth
    const H = stage.clientHeight
    if (W < 10 || H < 10) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    const houseW = Math.max(64, Math.min(122, W * 0.14))
    const top = Math.max(8, H * 0.045)
    const fieldW = W - houseW - 8
    const fieldH = H - top - 6
    engine.setLayout({
      left: houseW,
      top,
      width: fieldW,
      height: fieldH,
      cellW: fieldW / GRID.COLS,
      cellH: fieldH / GRID.ROWS,
    })
  }, [engine])

  // ---- 主循环: phase === playing 时 RAF 驱动 ----
  const phase = snap.phase
  useEffect(() => {
    if (screen !== 'game' || phase !== 'playing') return
    let raf = 0
    let last = performance.now()
    const loop = (t: number) => {
      const dt = Math.min(50, t - last)
      last = t
      engine.update(dt)
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        render(ctx, engine, dpr)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [screen, phase, engine])

  // 非playing 状态也渲染一帧（暂停/结算画面静帧）
  useEffect(() => {
    if (screen !== 'game' || phase === 'playing') return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      render(ctx, engine, dpr)
    }
  }, [screen, phase, snap.version, engine])

  // ---- ResizeObserver 自适应 ----
  useEffect(() => {
    if (screen !== 'game') return
    computeLayout()
    const stage = stageRef.current
    if (!stage) return
    const ro = new ResizeObserver(() => computeLayout())
    ro.observe(stage)
    return () => ro.disconnect()
  }, [screen, computeLayout])

  // ---- 切后台自动暂停 ----
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && engine.phase === 'playing') {
        engine.pauseAt(Date.now())
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [engine])

  // ---- Esc 暂停/继续 ----
  useEffect(() => {
    if (screen !== 'game') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (engine.phase === 'playing') engine.pauseAt(Date.now())
      else if (engine.phase === 'paused') engine.resumeAt(Date.now())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen, engine])

  // ---- 交互 handlers ----
  const handleStart = useCallback(
    (diff: DifficultyKey) => {
      const packWords = diff === 'custom' ? loadPack()?.words : undefined
      if (diff === 'custom' && (!packWords || packWords.length < 8)) return
      setDifficulty(diff)
      saveUserData({ difficulty: diff })
      audioManager.unlock()
      engine.init(diff, packWords)
      setResult(null)
      setScreen('game')
      // 等布局就绪后启动
      requestAnimationFrame(() => {
        computeLayout()
        engine.start()
      })
    },
    [engine, computeLayout]
  )

  const handleRestart = useCallback(() => {
    handleStart(difficulty)
  }, [handleStart, difficulty])

  const handleMenu = useCallback(() => {
    setResult(null)
    setScreen('menu')
  }, [])

  const handleAnswer = useCallback((index: number) => engine.answerQuiz(index), [engine])

  const handleSelectPlant = useCallback(
    (type: PlantType | null) => {
      engine.selectPlant(type)
    },
    [engine]
  )

  const handlePause = useCallback(() => engine.pauseAt(Date.now()), [engine])
  const handleResume = useCallback(() => engine.resumeAt(Date.now()), [engine])

  const handleCanvasTap = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      engine.tapAtPixel(x, y)
    },
    [engine]
  )

  const handleToggleSound = useCallback(() => {
    const next = !loadUserData().soundEnabled
    saveUserData({ soundEnabled: next })
    audioManager.setEnabled(next)
  }, [])

  // ---- 渲染 ----
  if (screen === 'menu') {
    return (
      <>
        <MenuScreen
          userData={userData}
          onStart={handleStart}
          onOpenRewards={() => setShowRewards(true)}
          onToggleSound={handleToggleSound}
        />
        {showRewards && <RewardCenter onClose={() => setShowRewards(false)} />}
      </>
    )
  }

  return (
    <div className="h-screen w-full flex flex-col bg-[#E8F7FB] overflow-hidden select-none">
      <Hud snap={snap} onPause={handlePause} />

      {/* 画布舞台 */}
      <div ref={stageRef} className="relative flex-1 min-h-0 w-full">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasTap}
          className="absolute inset-0 block cursor-pointer"
          aria-label="游戏画布: 点击种植植物或收集阳光"
        />
        {snap?.banner && (
          <div className="absolute inset-x-0 top-[28%] flex justify-center pointer-events-none" aria-live="polite">
            <div className="wf-glass-strong px-6 py-3 rounded-2xl text-center animate-[popIn_0.25s_ease-out]">
              <p className="text-xl font-black text-[#E91E63]">{snap.banner.text}</p>
              <p className="text-xs text-[#8D6E63] mt-0.5">{snap.banner.sub}</p>
            </div>
          </div>
        )}
      </div>

      {snap && <PlantShop snap={snap} onSelect={handleSelectPlant} />}
      {snap && <QuizPanel snap={snap} onAnswer={handleAnswer} />}

      {snap.phase === 'paused' && (
        <PauseOverlay onResume={handleResume} onRestart={handleRestart} onMenu={handleMenu} />
      )}
      {result && (
        <ResultOverlay
          summary={result.summary}
          settle={result.settle}
          highestScore={userData.highestScore}
          isRecord={result.isRecord}
          onRestart={handleRestart}
          onMenu={handleMenu}
        />
      )}
      {showRewards && <RewardCenter onClose={() => setShowRewards(false)} />}
    </div>
  )
}
