// src/game/quizEngine.ts - 答题系统引擎
// 完整移植自微信小程序端 utils/quizManager.js (v52/v53)
// 负责: 题目选取、选项生成、答题判定、计分、连击
// 三种题型: en2zh(英→中) / zh2en(中→英) / word2pho(词→音标)

import {
  SCORING, QUESTION_TYPES, SUNLIGHT, QUIZ,
  type QuestionTypeKey,
} from './constants'
import type { Word } from './words'

export interface QuizQuestion {
  id: number
  type: QuestionTypeKey
  content: string      // 题干
  phonetic: string     // 音标（仅 en2zh 展示）
  prompt: string       // 题型提示文案
  options: string[]
  correctAnswer: number
  answerValue: string  // 正确答案文本
  difficulty: number
}

export interface AnswerResult {
  correct: boolean
  score: number
  combo: number
  comboMult: number
  sunlightReward: number
  wrongStreak: number
}

export interface WrongWordEntry {
  word: string
  meaning: string
  phonetic: string
}

let __questionIdSeed = 1

export class QuizEngine {
  wordBank: Word[] = []
  usedIds = new Set<string>()
  currentQuestion: QuizQuestion | null = null
  questionStartTime = 0
  combo = 0
  maxCombo = 0
  correctCount = 0
  wrongCount = 0
  totalAnswered = 0
  timeoutCount = 0      // v39: 超时未答次数
  wrongStreak = 0       // v45: 连续答错计数（答对清零；超时不计入）
  wrongWords: WrongWordEntry[] = [] // 错词本（结算页回顾）
  optionCount = QUIZ.OPTION_COUNT

  setWordBank(words: Word[]) {
    this.wordBank = words.slice()
  }

  reset() {
    this.usedIds.clear()
    this.currentQuestion = null
    this.combo = 0
    this.maxCombo = 0
    this.correctCount = 0
    this.wrongCount = 0
    this.totalAnswered = 0
    this.timeoutCount = 0
    this.wrongStreak = 0
    this.wrongWords = []
  }

  /** 根据难度权重筛选候选词；空池回退全词库（保证任意分布的自定义词包可用） */
  private _filterByDifficulty(difficultyWeights: Record<number, number>): Word[] {
    if (!this.wordBank.length) return []
    const r = Math.random()
    let acc = 0
    let targetDiff = 1
    for (const [d, w] of Object.entries(difficultyWeights)) {
      acc += w
      if (r <= acc) { targetDiff = parseInt(d); break }
    }
    const candidates = this.wordBank.filter((w) => w.difficulty === targetDiff)
    return candidates.length ? candidates : this.wordBank
  }

  /**
   * 生成干扰选项
   * v52: 语义公平排除 — zh2en 时与正确词同 zh 的兄弟词也是合法答案
   * (如 learn/study 同译「学习」)，混入干扰项会形成「双正确选项被判错」。
   * 兄弟词进 relax 池: 仅当严格池凑不满时兜底，保住「4 选项不变量」优先于极端数据的公平性。
   * 部分选择采样(只洗前 count 位) O(n)→O(count)，逐项文本去重。
   */
  private _generateDistractors(correct: Word, count: number, field: 'zh' | 'en' | 'phonetic'): Word[] {
    const correctVal = correct[field]
    const isZh2En = field === 'en'
    const strict: Word[] = []
    const relax: Word[] = []
    for (const w of this.wordBank) {
      if (!w[field] || w[field] === correctVal) continue
      if (isZh2En && w.zh === correct.zh) { relax.push(w); continue }
      strict.push(w)
    }
    const seen = new Set<string>([correctVal])
    const picked: Word[] = []
    const pickFrom = (pool: Word[]) => {
      for (let k = 0; k < pool.length && picked.length < count; k++) {
        const j = k + Math.floor(Math.random() * (pool.length - k))
        const tmp = pool[k]; pool[k] = pool[j]; pool[j] = tmp
        const val = pool[k][field]
        if (!seen.has(val)) {
          seen.add(val)
          picked.push(pool[k])
        }
      }
    }
    pickFrom(strict)
    if (picked.length < count) pickFrom(relax)
    return picked
  }

  /** 按权重随机选题型 */
  private _rollQuestionType(): QuestionTypeKey {
    const r = Math.random()
    let acc = 0
    for (const v of Object.values(QUESTION_TYPES)) {
      acc += v.weight
      if (r <= acc) return v.key
    }
    return 'en2zh'
  }

  /** 生成一道题目 */
  generateQuestion(difficultyWeights: Record<number, number>): QuizQuestion | null {
    if (!this.wordBank.length) return null
    const candidates = this._filterByDifficulty(difficultyWeights)
    if (!candidates.length) return null

    // 随机选词（尽量避免短期重复）
    let word: Word | null = null
    for (let tries = 0; tries < 8; tries++) {
      const w = candidates[Math.floor(Math.random() * candidates.length)]
      if (!this.usedIds.has(w.en)) { word = w; break }
    }
    if (!word) word = candidates[Math.floor(Math.random() * candidates.length)]
    this.usedIds.add(word.en)
    if (this.usedIds.size > Math.floor(this.wordBank.length * 0.5)) {
      const arr = Array.from(this.usedIds)
      this.usedIds = new Set(arr.slice(Math.floor(arr.length / 2)))
    }

    // 随机选题型
    const qType = this._rollQuestionType()
    let content: string, prompt: string, optionsField: 'zh' | 'en' | 'phonetic', answerValue: string, phonetic = ''

    switch (qType) {
      case 'en2zh':
        content = word.en
        prompt = QUESTION_TYPES.EN_TO_ZH.label
        optionsField = 'zh'
        answerValue = word.zh
        phonetic = word.phonetic || ''
        break
      case 'zh2en':
        content = word.zh
        prompt = QUESTION_TYPES.ZH_TO_EN.label
        optionsField = 'en'
        answerValue = word.en
        break
      case 'word2pho':
        // 无音标的词不适合出 word2pho，降级为 en2zh
        if (!word.phonetic) {
          content = word.en
          prompt = QUESTION_TYPES.EN_TO_ZH.label
          optionsField = 'zh'
          answerValue = word.zh
          phonetic = word.phonetic || ''
        } else {
          content = word.en
          prompt = QUESTION_TYPES.WORD_TO_PHO.label
          optionsField = 'phonetic'
          answerValue = word.phonetic
          phonetic = '' // 不在题干预告答案(音标即选项)
        }
        break
      default:
        content = word.en
        prompt = QUESTION_TYPES.EN_TO_ZH.label
        optionsField = 'zh'
        answerValue = word.zh
        phonetic = word.phonetic || ''
    }

    const distractorCount = this.optionCount - 1
    const distractors = this._generateDistractors(word, distractorCount, optionsField)

    const options = [
      { text: word[optionsField], correct: true },
      ...distractors.map((d) => ({ text: d[optionsField], correct: false })),
    ]
    // Fisher-Yates 打乱
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[options[i], options[j]] = [options[j], options[i]]
    }
    const correctAnswer = options.findIndex((o) => o.correct)

    const question: QuizQuestion = {
      id: __questionIdSeed++,
      type: qType,
      content,
      phonetic,
      prompt,
      options: options.map((o) => o.text),
      correctAnswer,
      answerValue,
      difficulty: word.difficulty,
    }

    this.currentQuestion = question
    this.questionStartTime = Date.now()
    return question
  }

  /** 判定答题（返回形状与成功分支一致 — v6 F12 修复惯例） */
  answer(optionIndex: number): AnswerResult {
    if (!this.currentQuestion) {
      return { correct: false, score: 0, combo: 0, comboMult: 1, sunlightReward: 0, wrongStreak: 0 }
    }
    const correct = optionIndex === this.currentQuestion.correctAnswer
    this.totalAnswered++
    let score = 0
    let comboMult = 1
    let sunlightReward = 0
    if (correct) {
      this.correctCount++
      this.combo++
      this.wrongStreak = 0
      this.maxCombo = Math.max(this.maxCombo, this.combo)
      const idx = Math.min(this.combo - 1, SCORING.COMBO_MULTIPLIERS.length - 1)
      comboMult = SCORING.COMBO_MULTIPLIERS[idx] || SCORING.COMBO_MAX_MULT
      // 速度奖励: 5 秒内答对线性递减
      const elapsed = Date.now() - this.questionStartTime
      let speedBonus = 0
      if (elapsed <= SCORING.SPEED_BONUS_TIME) {
        speedBonus = Math.round(SCORING.SPEED_BONUS_MAX * (1 - elapsed / SCORING.SPEED_BONUS_TIME))
      }
      score = Math.round((SCORING.BASE_SCORE + speedBonus) * comboMult)
      sunlightReward = SUNLIGHT.REWARD_CORRECT
    } else {
      this.wrongCount++
      this.wrongStreak++
      this.combo = 0
      // 错词本（结算页回顾）
      if (this.currentQuestion && this.wrongWords.length < 30) {
        const q = this.currentQuestion
        if (q.type === 'zh2en') {
          this.wrongWords.push({ word: q.answerValue, meaning: q.content, phonetic: '' })
        } else {
          this.wrongWords.push({ word: q.content, meaning: q.answerValue, phonetic: q.phonetic || '' })
        }
      }
    }
    return { correct, score, combo: this.combo, comboMult, sunlightReward, wrongStreak: this.wrongStreak }
  }

  /**
   * v39: 登记一次超时未答（温和处理：换题 + 连击清零，不加速僵尸）
   * 统计口径：计入 totalAnswered（诚实反映漏答），不计入 wrongCount
   */
  registerTimeout(): boolean {
    if (!this.currentQuestion) return false
    this.timeoutCount++
    this.totalAnswered++
    this.combo = 0
    return true
  }

  /** v39: 暂停恢复时平移题目起始时钟（防长暂停后速度奖励虚增） */
  shiftQuestionClock(ms: number) {
    if (this.questionStartTime > 0) this.questionStartTime += ms
  }

  getCurrent() {
    return this.currentQuestion
  }

  getAccuracy(): number {
    if (this.totalAnswered === 0) return 0
    return this.correctCount / this.totalAnswered
  }
}
