// src/game/engine.ts - 游戏主引擎
// 移植自微信小程序端 gameManager.js + zombieManager.js + plantManager.js (v53)
// 架构: 单引擎类 + 版本号视图同步（80ms 节流, 与小程序 SUN_SYNC_INTERVAL_MS 一致）
// 逻辑层不依赖 React — 由组件驱动 RAF 循环并调用 update(dt)

import {
  COMBAT, DIFFICULTY_CONFIG, GRID, LIVES, LEVEL, PARTICLE, PLANT, PLANT_TYPES,
  PERFORMANCE, QUIZ, SCORING, SUNLIGHT, ZOMBIE, ZOMBIE_TYPES, ZOMBIE_TYPE_WEIGHTS,
  type DifficultyKey, type PlantType, type ZombieType,
} from './constants'
import { FULL_WORD_BANK, WORD_BANK, type Word } from './words'
import { QuizEngine, type QuizQuestion, type WrongWordEntry } from './quizEngine'
import { audioManager } from './audio'

// ============ 类型 ============
export type Phase = 'ready' | 'playing' | 'paused' | 'over' | 'victory'
type ZombieState = 'walking' | 'eating' | 'dying'

export interface EngineZombie {
  id: number
  type: ZombieType
  lane: number
  progress: number
  speed: number // progress/s（已归一化）
  health: number
  maxHealth: number
  state: ZombieState
  slowFactor: number
  slowTimer: number
  boostMult: number
  boostTimer: number
  wobble: number
  wobbleSeed: number
  hitFlash: number
  dyingTimer: number
  attackTimer: number
  summonTimer: number
  targetPlantId: number | null
}

export interface EnginePlant {
  id: number
  type: PlantType
  lane: number
  col: number
  health: number
  maxHealth: number
  attackTimer: number
  wobble: number
  wobbleSeed: number
  hitFlash: number
  fuseTimer: number // 樱桃引信
  chomperState: 'idle' | 'snap' | 'swallow'
  stateTimer: number
  biteSettled: boolean
  biteTargetId: number | null
  sunTimer: number
}

export interface EngineProjectile {
  id: number
  lane: number
  x: number
  y: number
  vx: number
  damage: number
  kind: 'normal' | 'ice' | 'fire'
  radius: number
  color: string
  pierce: boolean
  pierceMax: number
  hitTargets: number[]
}

export interface SunOrb {
  id: number
  x: number
  y: number
  value: number
  age: number
  state: 'idle' | 'collecting'
  collectT: number
  fromX: number
  fromY: number
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

export interface FloatText {
  x: number
  y: number
  text: string
  color: string
  life: number
  maxLife: number
  size: number
}

interface WaveQueueItem {
  type: ZombieType
  lane: number
}

export interface Layout {
  left: number
  top: number
  width: number
  height: number
  cellW: number
  cellH: number
}

export interface GameSummary {
  result: 'win' | 'lose'
  score: number
  level: number
  maxCombo: number
  killedZombies: number
  plantsPlaced: number
  correctCount: number
  wrongCount: number
  totalAnswered: number
  timeoutCount: number
  accuracy: number
  stars: number
  gameTime: number
  difficulty: DifficultyKey
  wrongWords: WrongWordEntry[]
}

export interface ViewSnapshot {
  phase: Phase
  score: number
  sunlight: number
  defenseLines: number
  level: number
  maxLevel: number
  levelRemainMs: number
  levelTimeMs: number
  combo: number
  comboMult: number
  killedZombies: number
  gameTime: number
  selectedPlant: PlantType | null
  question: QuizQuestion | null
  quizRemainMs: number | null
  quizTimeLimit: number
  feedback: { kind: 'correct' | 'wrong' | 'timeout'; until: number } | null
  banner: { text: string; sub: string; until: number } | null
  wrongStreak: number
  version: number
}

const emptyLayout = (): Layout => ({ left: 0, top: 0, width: 600, height: 320, cellW: 120, cellH: 106 })

export class GameEngine {
  phase: Phase = 'ready'
  score = 0
  sunlight = SUNLIGHT.INITIAL
  defenseLines = LIVES.INITIAL
  level = 1
  levelTimer = 0
  gameTime = 0
  combo = 0
  maxCombo = 0
  killedZombies = 0
  plantsPlaced = 0
  difficulty: DifficultyKey = 'junior'
  wrongStreak = 0

  zombies: EngineZombie[] = []
  plants: EnginePlant[] = []
  projectiles: EngineProjectile[] = []
  suns: SunOrb[] = []
  particles: Particle[] = []
  floats: FloatText[] = []

  quiz = new QuizEngine()
  cfg = DIFFICULTY_CONFIG.junior
  wordBank: Word[] = WORD_BANK

  layout: Layout = emptyLayout()

  selectedPlant: PlantType | null = null
  feedback: { kind: 'correct' | 'wrong' | 'timeout'; until: number } | null = null
  banner: { text: string; sub: string; until: number } | null = null
  shakeUntil = 0
  shakeIntensity = 0

  private spawnInterval = ZOMBIE.SPAWN_INTERVAL_DEFAULT_MS
  private spawnTimer = 0
  private hpMult = 1
  private speedMult = 1
  private weights: Record<string, number> = { ...ZOMBIE_TYPE_WEIGHTS.junior }
  private spawnStopped = false
  private levelTimeMs = LEVEL.TIME_PER_LEVEL
  private waveQueue: WaveQueueItem[] = []
  private waveTimer = 0
  private finalWaveLaunched = false
  private finalWaveAt = -1
  private questionDeadline = 0
  private questionTimeLimit = QUIZ.TIMEOUT_FALLBACK_MS
  private sunVersion = 0
  private idSeq = 1
  private version = 0
  private listeners = new Set<() => void>()
  private gameOverHandlers = new Set<(s: GameSummary) => void>()
  private lastEmitAt = 0
  private comboMult = 1

  /** 注册结算监听（胜利/失败统一触发），返回解绑函数 */
  bindGameOver(fn: (summary: GameSummary) => void) {
    this.gameOverHandlers.add(fn)
    return () => {
      this.gameOverHandlers.delete(fn)
    }
  }

  // ============ 初始化 ============
  init(difficulty: DifficultyKey, customWords?: Word[]) {
    const cfg = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.junior
    this.cfg = cfg
    this.difficulty = difficulty
    this.wordBank =
      difficulty === 'custom' && customWords && customWords.length >= 8
        ? customWords
        : difficulty === 'ket' || difficulty === 'pet'
          ? FULL_WORD_BANK
          : WORD_BANK

    this.phase = 'ready'
    this.score = 0
    this.sunlight = SUNLIGHT.INITIAL
    this.defenseLines = LIVES.INITIAL
    this.level = 1
    this.levelTimer = 0
    this.gameTime = 0
    this.combo = 0
    this.maxCombo = 0
    this.killedZombies = 0
    this.plantsPlaced = 0
    this.wrongStreak = 0
    this.comboMult = 1

    this.zombies = []
    this.plants = []
    this.projectiles = []
    this.suns = []
    this.particles = []
    this.floats = []
    this.selectedPlant = null
    this.feedback = null
    this.banner = null

    this.spawnInterval = cfg.spawnInterval
    this.spawnTimer = 0
    this.hpMult = 1
    this.speedMult = 1
    this.weights = { ...(ZOMBIE_TYPE_WEIGHTS[difficulty] || ZOMBIE_TYPE_WEIGHTS.junior) }
    this.spawnStopped = false
    this.waveQueue = []
    this.waveTimer = 0
    this.finalWaveLaunched = false
    this.finalWaveAt = -1
    this.questionTimeLimit = cfg.questionTimeLimit || QUIZ.TIMEOUT_FALLBACK_MS
    this.questionDeadline = 0
    this.levelTimeMs = this._computeLevelTimeMs()

    this.quiz.setWordBank(this.wordBank)
    this.quiz.reset()
    this.emitView(true)
  }

  /** v41: 一局节奏 — 自定义档按词库平均难度 1.0~3.0 线性插值 48~72s */
  private _computeLevelTimeMs() {
    if (this.difficulty !== 'custom') return this.cfg.levelTime
    const words = this.wordBank
    if (!words.length) return LEVEL.TIME_PER_LEVEL
    let sum = 0
    let n = 0
    for (const w of words) {
      if (w.difficulty >= 1 && w.difficulty <= 3) {
        sum += w.difficulty
        n++
      }
    }
    if (!n) return LEVEL.TIME_PER_LEVEL
    const avg = sum / n
    const t = Math.max(0, Math.min(1, (avg - 1) / 2))
    return Math.round((LEVEL.LEVEL_TIME_EASY + t * (LEVEL.LEVEL_TIME_HARD - LEVEL.LEVEL_TIME_EASY)) / 1000) * 1000
  }

  setLayout(l: Layout) {
    this.layout = l
  }

  // ============ 订阅（80ms 节流视图同步） ============
  subscribe(cb: () => void) {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  emitView(force = false) {
    const now = Date.now()
    if (!force && now - this.lastEmitAt < PERFORMANCE.VIEW_SYNC_INTERVAL_MS) return
    this.lastEmitAt = now
    this.version++
    for (const cb of this.listeners) cb()
  }

  getSnapshot(): ViewSnapshot {
    return {
      phase: this.phase,
      score: this.score,
      sunlight: this.sunlight,
      defenseLines: this.defenseLines,
      level: this.level,
      maxLevel: LEVEL.MAX_LEVEL,
      levelRemainMs: Math.max(0, this.levelTimeMs - this.levelTimer),
      levelTimeMs: this.levelTimeMs,
      combo: this.combo,
      comboMult: this.comboMult,
      killedZombies: this.killedZombies,
      gameTime: this.gameTime,
      selectedPlant: this.selectedPlant,
      question: this.quiz.getCurrent(),
      quizRemainMs: this.questionDeadline ? Math.max(0, this.questionDeadline - Date.now()) : null,
      quizTimeLimit: this.questionTimeLimit,
      feedback: this.feedback && this.feedback.until > Date.now() ? this.feedback : null,
      banner: this.banner && this.banner.until > Date.now() ? this.banner : null,
      wrongStreak: this.wrongStreak,
      version: this.version,
    }
  }

  // ============ 生命周期 ============
  start() {
    if (this.phase !== 'ready') return
    this.phase = 'playing'
    this.gameTime = 0
    audioManager.unlock()
    audioManager.play('start')
    this._nextQuestion()
    this.emitView(true)
  }

  pause() {
    if (this.phase !== 'playing') return
    this.phase = 'paused'
    audioManager.pause()
    this.emitView(true)
  }

  resume() {
    if (this.phase !== 'paused') return
    // 暂停时长平移题目时钟（v39: 防长暂停后瞬间误判超时 / 速度奖励虚增）
    const pauseDuration = this.questionDeadline ? 0 : 0 // 实际平移在组件层记录的暂停起点完成
    void pauseDuration
    this.phase = 'playing'
    audioManager.resume()
    this.emitView(true)
  }

  /** 记录暂停起点，resume 时平移所有实时时钟 */
  private _pauseStartedAt = 0
  pauseAt(time: number) {
    this._pauseStartedAt = time
    this.pause()
  }
  resumeAt(time: number) {
    const pauseDuration = time - this._pauseStartedAt
    if (pauseDuration > 0 && this.questionDeadline > 0) {
      this.questionDeadline += pauseDuration
    }
    this.quiz.shiftQuestionClock(pauseDuration)
    this.resume()
  }

  destroy() {
    this.listeners.clear()
  }

  // ============ 答题 ============
  private _nextQuestion() {
    const q = this.quiz.generateQuestion(this.cfg.difficultyWeights)
    this.questionDeadline = q ? Date.now() + this.questionTimeLimit : 0
  }

  answerQuiz(optionIndex: number) {
    if (this.phase !== 'playing' || !this.quiz.getCurrent()) {
      return { correct: false, score: 0, combo: 0, sunlightReward: 0, comboMult: 1 }
    }
    const result = this.quiz.answer(optionIndex)
    if (result.correct) {
      this._addSunlight(result.sunlightReward)
      this.score += result.score
      this.combo = result.combo
      this.comboMult = result.comboMult
      this.maxCombo = Math.max(this.maxCombo, result.combo)
      audioManager.play('correct')
      this.feedback = { kind: 'correct', until: Date.now() + 700 }
    } else {
      // v45 温和化: 连续首错免罚（仅清连击），二错起全场僵尸加速
      audioManager.play('wrong')
      if ((result.wrongStreak || 0) > SUNLIGHT.PENALTY_WRONG_FREE_STREAK) {
        this._applyGlobalSpeedBoost(SUNLIGHT.PENALTY_WRONG_SPEED_MULT, SUNLIGHT.PENALTY_WRONG_SPEED_TIME)
      }
      this.combo = 0
      this.wrongStreak = result.wrongStreak
      this.feedback = { kind: 'wrong', until: Date.now() + 900 }
    }
    this._nextQuestion()
    this.emitView(true)
    return result
  }

  /** v39: 题目超时（温和分支：换题 + 清连击，不加速僵尸） */
  private _handleQuestionTimeout() {
    this.questionDeadline = 0 // 先解除武装，防同帧重入
    this.quiz.registerTimeout()
    audioManager.play('wrong')
    this.combo = 0
    this.feedback = { kind: 'timeout', until: Date.now() + 900 }
    this._nextQuestion()
    this.emitView(true)
  }

  getQuizRemainMs() {
    if (!this.questionDeadline) return null
    return Math.max(0, this.questionDeadline - Date.now())
  }

  private _applyGlobalSpeedBoost(mult: number, durationMs: number) {
    for (const z of this.zombies) {
      if (z.state === 'dying') continue
      z.boostMult = mult
      z.boostTimer = durationMs
    }
  }

  private _addSunlight(v: number) {
    this.sunlight = Math.min(SUNLIGHT.MAX, this.sunlight + v)
  }

  // ============ 植物放置 ============
  selectPlant(type: PlantType | null) {
    if (type && this.sunlight < PLANT_TYPES[type].cost) {
      // 阳光不足自动取消选中（与小程序一致）
      this.selectedPlant = null
      this.emitView(true)
      return
    }
    this.selectedPlant = type
    this.emitView(true)
  }

  tryPlaceAtPixel(x: number, y: number): boolean {
    if (!this.selectedPlant || this.phase !== 'playing') return false
    const { left, top, width, height, cellW, cellH } = this.layout
    const col = Math.floor(((x - left) / width) * GRID.COLS)
    const lane = Math.floor(((y - top) / height) * GRID.ROWS)
    if (col < 0 || col >= GRID.COLS || lane < 0 || lane >= GRID.ROWS) return false
    return this._placePlant(this.selectedPlant, lane, col)
  }

  private _placePlant(type: PlantType, lane: number, col: number): boolean {
    const def = PLANT_TYPES[type]
    if (this.sunlight < def.cost) {
      this.selectedPlant = null
      this.emitView(true)
      return false
    }
    if (this.plants.some((p) => p.lane === lane && p.col === col)) return false
    this.sunlight -= def.cost
    const plant: EnginePlant = {
      id: this.idSeq++,
      type,
      lane,
      col,
      health: def.health,
      maxHealth: def.health,
      attackTimer: def.attackInterval * PLANT.INITIAL_CD_RATIO,
      wobble: 0,
      wobbleSeed: Math.random() * Math.PI * 2,
      hitFlash: 0,
      fuseTimer: 0,
      chomperState: 'idle',
      stateTimer: 0,
      biteSettled: false,
      biteTargetId: null,
      sunTimer: type === 'sunflower' ? (def.sunInterval || 8000) * 0.6 : 0,
    }
    this.plants.push(plant)
    this.plantsPlaced++
    audioManager.play('place')
    if (this.sunlight < def.cost) this.selectedPlant = null // 阳光耗尽自动取消
    this.emitView(true)
    return true
  }

  // ============ 阳光 ============
  private _spawnSun(x: number, y: number, value: number) {
    if (this.suns.length >= SUNLIGHT.FIELD_MAX) {
      this._addSunlight(value) // 超出同屏上限自动入账防堆积
      return
    }
    this.suns.push({
      id: this.idSeq++,
      x, y, value,
      age: 0,
      state: 'idle',
      collectT: 0,
      fromX: x, fromY: y,
    })
    this.sunVersion++
  }

  /** 点击处理：先判阳光收集，再判植物放置 */
  tapAtPixel(x: number, y: number): 'sun' | 'place' | 'none' {
    // 阳光命中（兜底半径 SUNLIGHT.TAP_HIT_RADIUS）
    for (let i = this.suns.length - 1; i >= 0; i--) {
      const s = this.suns[i]
      if (s.state !== 'idle') continue
      const d = Math.hypot(s.x - x, s.y - y)
      if (d <= SUNLIGHT.TAP_HIT_RADIUS + 8) {
        this._collectSun(s)
        return 'sun'
      }
    }
    if (this.selectedPlant && this.tryPlaceAtPixel(x, y)) return 'place'
    return 'none'
  }

  private _collectSun(s: SunOrb) {
    s.state = 'collecting'
    s.collectT = 0
    s.fromX = s.x
    s.fromY = s.y
    this._addSunlight(s.value)
    this.floats.push({
      x: s.x, y: s.y - 10, text: `+${s.value}`,
      color: '#F9A825', life: 800, maxLife: 800, size: 15,
    })
    audioManager.play('sun')
    this.sunVersion++
    this.emitView(true)
  }

  // ============ 主更新（每帧, dt 钳制 50ms） ============
  update(dt: number) {
    if (this.phase !== 'playing') return
    dt = Math.min(dt, PERFORMANCE.MAX_DELTA)
    const dtSec = dt / 1000
    this.gameTime += dt

    // 1. 关卡推进
    this.levelTimer += dt
    if (this.levelTimer >= this.levelTimeMs && this.level < LEVEL.MAX_LEVEL) {
      this.level++
      this.levelTimer = 0
      this._applyLevelRamp()
      audioManager.play('level_up')
      this.banner = {
        text: `第 ${this.level} 关`,
        sub: this.level === LEVEL.MAX_LEVEL ? '僵尸王携护卫队压境！' : '僵尸更强了，加油！',
        until: Date.now() + 2200,
      }
      if (this.level === LEVEL.MAX_LEVEL) this._launchFinalWave()
      this.emitView(true)
    }

    // 2. 题目限时判定
    if (this.questionDeadline > 0 && Date.now() >= this.questionDeadline) {
      this._handleQuestionTimeout()
    }

    // 3. 生成僵尸
    this._updateSpawner(dt)

    // 4. 终局大波入场（400ms 节奏, 不受 maxZombies 限制）
    this._updateWaveQueue(dt)

    // 5. 植物更新
    this._updatePlants(dt, dtSec)

    // 6. 投射物更新与命中
    this._updateProjectiles(dtSec)

    // 7. 僵尸-植物战斗（啃食）
    this._resolveCombat(dt)

    // 8. 僵尸状态机推进
    this._updateZombies(dt, dtSec)

    // 9. 阳光更新
    this._updateSuns(dt)

    // 10. 粒子与浮字
    this._updateFx(dt)

    // 11. 输赢判定（防线优先）
    if (this.defenseLines <= 0) {
      this._gameOver('lose')
      return
    }
    if (
      this.finalWaveLaunched &&
      this.waveQueue.length === 0 &&
      this.zombies.length === 0 &&
      this.gameTime - this.finalWaveAt >= LEVEL.FINAL_CLEAR_GRACE_MS
    ) {
      this._gameOver('win')
      return
    }

    this.emitView()
  }

  // ============ 生成器 ============
  private _rollZombieType(): ZombieType {
    const r = Math.random()
    let acc = 0
    for (const [t, w] of Object.entries(this.weights)) {
      acc += w
      if (r <= acc) return t as ZombieType
    }
    return 'bucket'
  }

  private _spawnZombie(type: ZombieType, lane: number, progress = 0, hpMult = this.hpMult) {
    if (this.zombies.length >= PERFORMANCE.POOL_MAX) return null
    const def = ZOMBIE_TYPES[type]
    const baseSpeed = this.cfg.baseSpeed || ZOMBIE.BASE_SPEED_DEFAULT
    const z: EngineZombie = {
      id: this.idSeq++,
      type,
      lane,
      progress,
      speed: ((baseSpeed * def.speedMultiplier) / ZOMBIE.SPEED_PATH_REF) * this.speedMult,
      health: Math.round(def.baseHealth * hpMult),
      maxHealth: Math.round(def.baseHealth * hpMult),
      state: 'walking',
      slowFactor: 1,
      slowTimer: 0,
      boostMult: 1,
      boostTimer: 0,
      wobble: 0,
      wobbleSeed: Math.random() * Math.PI * 2,
      hitFlash: 0,
      dyingTimer: 0,
      attackTimer: 0,
      summonTimer: type === 'dancer' ? ZOMBIE.DANCER_SUMMON_DELAY_MS : 0,
      targetPlantId: null,
    }
    this.zombies.push(z)
    return z
  }

  private _updateSpawner(dt: number) {
    if (this.spawnStopped) return
    this.spawnTimer += dt
    if (this.spawnTimer < this.spawnInterval) return
    // OVERSHOOT: 超时 2.5 倍强制生成（忽略同屏上限, 保底压力）
    const force = this.spawnTimer >= this.spawnInterval * ZOMBIE.OVERSHOOT_MULT
    const atCap = this.zombies.length >= this.cfg.maxZombies
    if (atCap && !force) {
      this.spawnTimer = this.spawnInterval // 名额满, 保持就绪态（下次循环仍会检查 force）
      return
    }
    this.spawnTimer = 0
    const lane = Math.floor(Math.random() * GRID.ROWS)
    this._spawnZombie(this._rollZombieType(), lane)
  }

  /** v44: 关卡坡道 — 生成间隔 ×0.92 / 速度 ×1.05 / 血量 +8%(封顶×2.0) / 强力权重 +5%/关 */
  private _applyLevelRamp() {
    const R = LEVEL.RAMP
    this.spawnInterval = Math.max(ZOMBIE.SPAWN_INTERVAL_MIN_MS, this.spawnInterval * R.SPAWN_INTERVAL_MULT)
    this.speedMult *= R.SPEED_MULT
    this.hpMult = Math.min(ZOMBIE.HEALTH_RAMP_CAP, this.hpMult * (1 + R.HEALTH_PER_LEVEL))
    // 强力僵尸(football+dancer)权重从 bucket 转移
    const bonus = Math.min(R.TOUGH_PROB_BONUS * (this.level - 1), ZOMBIE.TOUGH_BONUS_CAP)
    const bucketFloor = ZOMBIE.BUCKET_WEIGHT_FLOOR
    const base = ZOMBIE_TYPE_WEIGHTS[this.difficulty] || ZOMBIE_TYPE_WEIGHTS.junior
    const take = Math.max(0, Math.min(bonus, Math.max(0, base.bucket - bucketFloor)))
    this.weights = {
      ...base,
      bucket: Math.max(bucketFloor, base.bucket - take),
      football: base.football + take / 2,
      dancer: base.dancer + take / 2,
    }
  }

  // ============ 终局大波 (v51) ============
  private _launchFinalWave() {
    this.spawnStopped = true
    audioManager.play('final_wave')
    const kingLane = Math.floor(Math.random() * GRID.ROWS)
    this.waveQueue = [{ type: 'king', lane: kingLane }]
    // 9 护卫: 车道轮转 3×3 均衡, 类型按当前权重抽取
    for (let i = 0; i < LEVEL.KING_WAVE_ESCORTS; i++) {
      this.waveQueue.push({ type: this._rollZombieType(), lane: i % GRID.ROWS })
    }
    this.waveTimer = 0
    this.finalWaveLaunched = true
    this.finalWaveAt = this.gameTime
  }

  private _updateWaveQueue(dt: number) {
    if (!this.waveQueue.length) return
    this.waveTimer += dt
    while (this.waveQueue.length && this.waveTimer >= LEVEL.KING_WAVE_STAGGER_MS) {
      this.waveTimer -= LEVEL.KING_WAVE_STAGGER_MS
      const item = this.waveQueue.shift()
      if (item) this._spawnZombie(item.type, item.lane, 0, 1) // 僵尸王血量恒定不随坡道
    }
  }

  // ============ 植物更新 ============
  private _plantCenterProgress(p: EnginePlant) {
    // 坐标系换算：网页端为横向车道，col 0 = 房子侧（最左），僵尸 progress 0=右（出生）→ 1=左（房子）。
    // 因此 col 越大（越靠右/出生侧）路径进度越小，与小程序纵向 slot（0=出生侧）的
    // (slot+0.5)/COLS 方向相反，必须翻转；否则左侧植物逻辑上“永远被越过”不射击，
    // 且僵尸会在屏幕右侧被远隔多格的植物“隔空啿食”（v2 修复）。
    return (GRID.COLS - p.col - 0.5) / GRID.COLS
  }

  private _plantPixel(p: EnginePlant) {
    const { left, top, width, height, cellW, cellH } = this.layout
    return {
      x: left + p.col * cellW + cellW / 2,
      y: top + p.lane * cellH + cellH / 2,
      w: cellW, h: cellH,
      fx: width / GRID.COLS, fy: height / GRID.ROWS,
    }
  }

  private _zombiePixel(z: EngineZombie) {
    const { left, top, width, height, cellH } = this.layout
    return {
      x: left + width * (1 - z.progress),
      y: top + z.lane * cellH + cellH / 2,
    }
  }

  private _updatePlants(dt: number, dtSec: number) {
    const cellW = this.layout.cellW
    for (const p of this.plants) {
      p.wobble += dtSec * (p.chomperState === 'snap' ? 8 : 3)
      if (p.hitFlash > 0) p.hitFlash -= dt
      const def = PLANT_TYPES[p.type]

      // 向日葵产阳光
      if (p.type === 'sunflower' && def.sunInterval) {
        p.sunTimer += dt
        if (p.sunTimer >= def.sunInterval) {
          p.sunTimer -= def.sunInterval
          const pos = this._plantPixel(p)
          this._spawnSun(pos.x + (Math.random() - 0.5) * 20, pos.y - 8, def.sunProduce || 25)
        }
      }

      // 樱桃引信
      if (p.type === 'cherry') {
        p.fuseTimer += dt
        if (p.fuseTimer >= (def.fuseTime || 2000)) {
          this._explodeCherry(p)
          continue
        }
      }

      // 食人花状态机
      if (p.type === 'chomper') {
        this._updateChomper(p, dt)
        continue
      }

      // 射手类（shooter / freezer / fire）
      if (def.projectile) {
        p.attackTimer += dt
        const target = this._findTarget(p)
        if (!target) {
          if (p.attackTimer > PLANT.NO_TARGET_RETRY_MS) p.attackTimer = PLANT.NO_TARGET_RETRY_MS
          continue
        }
        if (p.attackTimer >= def.attackInterval) {
          p.attackTimer = 0
          this._shoot(p)
        }
      }
    }
    // 清理死亡植物（被啃食完）
    this.plants = this.plants.filter((p) => p.health > 0)
    void cellW
  }

  /** 找本植物覆盖车道上最接近的僵尸（progress 最大且未抵达植物，对齐小程序 _findTarget） */
  private _findTarget(p: EnginePlant): EngineZombie | null {
    const def = PLANT_TYPES[p.type]
    const myProgress = this._plantCenterProgress(p)
    let lanes = [p.lane]
    if (def.projectile?.multiLane) {
      lanes = [p.lane - 1, p.lane, p.lane + 1].filter((l) => l >= 0 && l < GRID.ROWS)
    }
    let best: EngineZombie | null = null
    for (const z of this.zombies) {
      if (z.state === 'dying') continue
      if (!lanes.includes(z.lane)) continue
      if (z.progress >= myProgress - 0.01) continue // 已抵达/越过植物的不打（同小程序 -0.01 阈值）
      if (!best || z.progress > best.progress) best = z // 取最接近植物的（进度最大）
    }
    return best
  }

  private _shoot(p: EnginePlant) {
    const def = PLANT_TYPES[p.type]
    const pr = def.projectile
    if (!pr) return
    const pos = this._plantPixel(p)
    const lanes = pr.multiLane
      ? [p.lane - 1, p.lane, p.lane + 1].filter((l) => l >= 0 && l < GRID.ROWS)
      : [p.lane]
    for (const lane of lanes) {
      const ratio = pr.multiLane && lane !== p.lane ? (pr.adjacentDamageRatio || 0.5) : 1
      const y = this.layout.top + lane * this.layout.cellH + this.layout.cellH / 2
      this.projectiles.push({
        id: this.idSeq++,
        lane,
        x: pos.x + 14,
        y,
        vx: pr.speed,
        damage: def.damage * ratio,
        kind: pr.kind,
        radius: pr.radius,
        color: pr.kind === 'ice' ? '#81D4FA' : pr.kind === 'fire' ? '#FF8A65' : '#9CCC65',
        pierce: !!pr.pierce,
        pierceMax: pr.pierceMax || 3,
        hitTargets: [],
      })
    }
  }

  private _updateChomper(p: EnginePlant, dt: number) {
    const CH = PLANT.CHOMPER
    p.stateTimer += dt
    if (p.chomperState === 'idle') {
      if (p.stateTimer < CH.IDLE_RETRY_MS) return
      const myProgress = this._plantCenterProgress(p)
      let target: EngineZombie | null = null
      for (const z of this.zombies) {
        if (z.state === 'dying' || z.lane !== p.lane) continue
        const d = myProgress - z.progress
        const chomperRange = 0.08 // 射程（路径进度单位，与小程序 PLANT_TYPES.chomper.range 一致）
        if (d > 0 && d <= chomperRange) {
          if (!target || z.progress > target.progress) target = z // 咬最靠近的
        }
      }
      if (target) {
        p.chomperState = 'snap'
        p.stateTimer = 0
        p.biteSettled = false
        p.biteTargetId = target.id
      } else {
        p.stateTimer = 0
      }
    } else if (p.chomperState === 'snap') {
      if (!p.biteSettled && p.stateTimer >= CH.SNAP_DURATION_MS * CH.BITE_DAMAGE_POINT) {
        p.biteSettled = true
        const z = this.zombies.find((zz) => zz.id === p.biteTargetId && zz.state !== 'dying')
        if (z) {
          z.health -= PLANT_TYPES.chomper.damage
          z.hitFlash = 200
          const pos = this._zombiePixel(z)
          if (z.health <= 0) {
            this._killZombie(z, 'chomper')
          } else {
            this._addBurst(pos.x, pos.y, '#AB47BC', PARTICLE.BURST_CHOMPER_HIT)
          }
        }
      }
      if (p.stateTimer >= CH.SNAP_DURATION_MS) {
        p.chomperState = 'swallow'
        p.stateTimer = 0
        const bitten = this.zombies.find((zz) => zz.id === p.biteTargetId)
        p.stateTimer = bitten ? 0 : -1 // -1 标记未咬中 → 短吞咽
      }
    } else {
      const need = p.stateTimer === -1 ? CH.NO_BITE_SWALLOW_MS : PLANT_TYPES.chomper.swallowTime || 3000
      const elapsed = p.stateTimer === -1 ? p.stateTimer + 1 + need : p.stateTimer
      if (elapsed >= need) {
        p.chomperState = 'idle'
        p.stateTimer = 0
        p.biteTargetId = null
      }
    }
  }

  private _explodeCherry(p: EnginePlant) {
    const def = PLANT_TYPES.cherry
    const pos = this._plantPixel(p)
    const myProgress = this._plantCenterProgress(p)
    const radiusProgress = def.blastRadius || 0.15
    const centerBurst = PARTICLE.BURST_EXPLODE_CENTER
    this._addBurst(pos.x, pos.y, '#FF7043', centerBurst)
    this._addBurst(pos.x, pos.y, '#FFE082', 14)
    this.shakeUntil = Date.now() + 320
    this.shakeIntensity = 5
    // 对齐小程序 combatResolver.onPlantExplode：同车道 ± blastR，相邻车道全范围生效
    for (let lane = p.lane - 1; lane <= p.lane + 1; lane++) {
      if (lane < 0 || lane >= GRID.ROWS) continue
      for (const z of this.zombies) {
        if (z.state === 'dying') continue
        if (z.lane !== lane) continue
        if (lane === p.lane && Math.abs(z.progress - myProgress) > radiusProgress) continue
        z.health -= def.damage
        z.hitFlash = 200
        const zpos = this._zombiePixel(z)
        this._addBurst(zpos.x, zpos.y, '#FF8A65', PARTICLE.BURST_EXPLODE_PER_ZOMBIE)
        if (z.health <= 0) this._killZombie(z, 'explode')
      }
    }
    p.health = 0 // 自爆移除
    audioManager.play('kill')
  }

  // ============ 投射物 ============
  private _updateProjectiles(dtSec: number) {
    const { left, width } = this.layout
    const alive: EngineProjectile[] = []
    for (const pr of this.projectiles) {
      pr.x += pr.vx * dtSec
      if (pr.x > left + width + 24) continue // 飞出右侧
      let consumed = false
      for (const z of this.zombies) {
        if (z.state === 'dying') continue
        if (z.lane !== pr.lane) continue
        if (pr.hitTargets.includes(z.id)) continue
        const zp = this._zombiePixel(z)
        const dist = Math.hypot(pr.x - zp.x, pr.y - zp.y)
        if (dist < ZOMBIE_TYPES[z.type].radius + pr.radius) {
          this._hitZombie(z, pr)
          if (pr.hitTargets.includes(z.id)) {
            if (!pr.pierce || pr.hitTargets.length >= pr.pierceMax) {
              consumed = true
              break
            }
          } else {
            consumed = true
            break
          }
        }
      }
      if (!consumed) alive.push(pr)
    }
    this.projectiles = alive
  }

  private _hitZombie(z: EngineZombie, pr: EngineProjectile) {
    z.health -= pr.damage
    z.hitFlash = 200
    if (!pr.hitTargets.includes(z.id)) pr.hitTargets.push(z.id)
    if (pr.kind === 'ice') {
      z.slowFactor = 0.5
      z.slowTimer = 2000
    }
    const zp = this._zombiePixel(z)
    if (z.health <= 0) {
      this._killZombie(z, pr.kind === 'fire' ? 'fire' : 'shot')
    } else {
      this._addBurst(zp.x, zp.y, pr.color, 5)
    }
  }

  private _killZombie(z: EngineZombie, _cause: 'shot' | 'chomper' | 'fire' | 'explode') {
    z.state = 'dying'
    z.dyingTimer = ZOMBIE.DYING_DURATION_MS
    this.killedZombies++
    this.score += ZOMBIE_TYPES[z.type].scoreReward
    const pos = this._zombiePixel(z)
    this._addBurst(pos.x, pos.y, ZOMBIE_TYPES[z.type].color, PARTICLE.BURST_KILL)
    this.floats.push({
      x: pos.x, y: pos.y - 18, text: `+${ZOMBIE_TYPES[z.type].scoreReward}`,
      color: '#66BB6A', life: 800, maxLife: 800, size: 14,
    })
    audioManager.play('kill')
    this.emitView(true)
  }

  // ============ 僵尸-植物战斗 ============
  private _resolveCombat(dt: number) {
    for (const z of this.zombies) {
      if (z.state === 'dying') continue
      const myProgress = z.progress
      // 找同车道阻挡植物：僵尸 progress 达到植物中心 - 判定阈值
      let blocker: EnginePlant | null = null
      for (const p of this.plants) {
        if (p.lane !== z.lane || p.health <= 0) continue
        const center = this._plantCenterProgress(p)
        if (myProgress >= center - COMBAT.ZOMBIE_EAT_RANGE && myProgress <= center + 0.04) {
          if (!blocker || center > this._plantCenterProgress(blocker)) blocker = p
        }
      }
      if (blocker) {
        if (z.state !== 'eating') {
          z.state = 'eating'
          z.attackTimer = 0
          z.targetPlantId = blocker.id
        }
        z.attackTimer += dt
        if (z.attackTimer >= COMBAT.ZOMBIE_ATTACK_INTERVAL) {
          z.attackTimer -= COMBAT.ZOMBIE_ATTACK_INTERVAL
          blocker.health -= COMBAT.ZOMBIE_ATTACK_DAMAGE
          blocker.hitFlash = 180
          if (blocker.health <= 0) {
            const pos = this._plantPixel(blocker)
            this._addBurst(pos.x, pos.y, '#81C784', 8)
            z.state = 'walking'
            z.targetPlantId = null
          }
        }
      } else if (z.state === 'eating') {
        z.state = 'walking'
        z.targetPlantId = null
      }
    }
  }

  // ============ 僵尸状态机 ============
  private _updateZombies(dt: number, dtSec: number) {
    const finished: EngineZombie[] = []
    for (const z of this.zombies) {
      if (z.hitFlash > 0) z.hitFlash -= dt
      if (z.slowTimer > 0) {
        z.slowTimer -= dt
        if (z.slowTimer <= 0) z.slowFactor = 1
      }
      if (z.boostTimer > 0) {
        z.boostTimer -= dt
        if (z.boostTimer <= 0) z.boostMult = 1
      }
      if (z.state === 'dying') {
        z.dyingTimer -= dt
        if (z.dyingTimer <= 0) finished.push(z)
        continue
      }
      // 舞王召唤 (v49)
      if (z.type === 'dancer' && z.state === 'walking') {
        z.summonTimer -= dt
        if (z.summonTimer <= 0) {
          z.summonTimer = ZOMBIE.DANCER_SUMMON_COOLDOWN_MS
          this._dancerSummon(z)
        }
      }
      if (z.state === 'walking') {
        z.progress += z.speed * z.slowFactor * z.boostMult * dtSec
        z.wobble += dtSec * 6
        if (z.progress >= 1) {
          // 突破防线
          this.defenseLines = Math.max(0, this.defenseLines - 1)
          z.state = 'dying'
          z.dyingTimer = ZOMBIE.DYING_DURATION_MS
          this.shakeUntil = Date.now() + 260
          this.shakeIntensity = 4
          this.emitView(true)
        }
      } else {
        z.wobble += dtSec * 8 // 啃食摇摆更激烈
      }
    }
    if (finished.length) {
      this.zombies = this.zombies.filter((z) => !finished.includes(z))
    }
  }

  private _dancerSummon(dancer: EngineZombie) {
    const spawnProgress = Math.max(0, dancer.progress - ZOMBIE.DANCER_SUMMON_BACK)
    const lanes = [dancer.lane - 1, dancer.lane + 1].filter((l) => l >= 0 && l < GRID.ROWS)
    for (const lane of lanes) {
      const z = this._spawnZombie(ZOMBIE.DANCER_SUMMON_TYPE, lane, spawnProgress)
      if (z) {
        const pos = this._zombiePixel(z)
        this._addBurst(pos.x, pos.y, '#AB47BC', PARTICLE.BURST_DANCER_SUMMON)
      }
    }
  }

  // ============ 阳光 ============
  private _updateSuns(dt: number) {
    let changed = false
    for (const s of this.suns) {
      if (s.state === 'idle') {
        s.age += dt
        if (s.age >= SUNLIGHT.LIFETIME_MS) {
          // 超时自动入账（防挫败）
          this._addSunlight(s.value)
          s.state = 'collecting'
          s.collectT = SUNLIGHT.SUN_COLLECT_WINDOW_MS // 直接进入收尾
          changed = true
        }
      } else {
        s.collectT += dt
        if (s.collectT >= SUNLIGHT.SUN_COLLECT_WINDOW_MS) {
          s.collectT = SUNLIGHT.SUN_COLLECT_WINDOW_MS
        }
      }
    }
    const before = this.suns.length
    this.suns = this.suns.filter((s) => !(s.state === 'collecting' && s.collectT >= SUNLIGHT.SUN_COLLECT_WINDOW_MS))
    if (changed || this.suns.length !== before) {
      this.sunVersion++
      changed = true
    }
    void changed
  }

  // ============ 特效 ============
  private _updateFx(dt: number) {
    for (const p of this.particles) {
      p.life -= dt
      p.vy += PARTICLE.GRAVITY * (dt / 1000)
      p.x += p.vx * (dt / 1000)
      p.y += p.vy * (dt / 1000)
    }
    this.particles = this.particles.filter((p) => p.life > 0)
    for (const f of this.floats) {
      f.life -= dt
      f.y -= dt * 0.03
    }
    this.floats = this.floats.filter((f) => f.life > 0)
  }

  _addBurst(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5
      const speed = PARTICLE.SPEED_MIN + Math.random() * PARTICLE.SPEED_RANGE
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life: PARTICLE.LIFE_MS,
        maxLife: PARTICLE.LIFE_MS,
        size: PARTICLE.SIZE_MIN + Math.random() * PARTICLE.SIZE_RANGE,
        color,
      })
    }
  }

  // ============ 结算 ============
  private _gameOver(result: 'win' | 'lose') {
    this.phase = result === 'win' ? 'victory' : 'over'
    audioManager.play(result === 'win' ? 'win' : 'game_over')
    const summary = this.getSummary(result)
    this.emitView(true)
    for (const fn of this.gameOverHandlers) fn(summary)
  }

  getSummary(result?: 'win' | 'lose'): GameSummary {
    const acc = this.quiz.getAccuracy()
    const stars =
      acc >= SCORING.STAR_3_ACC ? 3 : acc >= SCORING.STAR_2_ACC ? 2 : acc >= SCORING.STAR_1_ACC ? 1 : 0
    const r = result || (this.phase === 'victory' ? 'win' : 'lose')
    return {
      result: r,
      score: this.score,
      level: this.level,
      maxCombo: this.maxCombo,
      killedZombies: this.killedZombies,
      plantsPlaced: this.plantsPlaced,
      correctCount: this.quiz.correctCount,
      wrongCount: this.quiz.wrongCount,
      totalAnswered: this.quiz.totalAnswered,
      timeoutCount: this.quiz.timeoutCount,
      accuracy: acc,
      stars,
      gameTime: this.gameTime,
      difficulty: this.difficulty,
      wrongWords: this.quiz.wrongWords.slice(0, 12),
    }
  }
}
