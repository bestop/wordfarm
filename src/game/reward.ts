// src/game/reward.ts - 亲子过关奖励系统 (v32/v36/v47)
// 完整移植自微信小程序端 utils/rewardManager.js — wx.storage → localStorage
// 负责: 通关积分结算 / 连续打卡 / 月度积分 / 三档奖励兑换 / 兑换记录持久化
// 三档奖励体系（家长与孩子的契约）：
//   🟢 即时小奖励  低积分 · 单次通关解锁（每次通关获得 1 次兑换机会）
//   🟡 周末中等奖励 中积分 · 连续打卡解锁（连续打卡 5 天）
//   🔵 长线大奖    高积分 · 月度目标解锁（本月亲子积分 ≥ 600）

import { REWARD_CONFIG } from './constants'

// ============ 奖励目录（内容按亲子约定，可由家长微调文案） ============
export interface RewardItem {
  id: string
  tier: 'instant' | 'weekend' | 'grand'
  name: string
  emoji: string
}

export const REWARD_CATALOG: RewardItem[] = [
  // 🟢 即时小奖励（低积分 · 单次通关解锁）
  { id: 'read10', tier: 'instant', name: '额外 10 分钟亲子共读', emoji: '📖' },
  { id: 'dinner', tier: 'instant', name: '自选晚餐菜品', emoji: '🍱' },
  { id: 'cartoon', tier: 'instant', name: '15 分钟动画时间', emoji: '📺' },
  { id: 'chore', tier: 'instant', name: '免一次家务小任务', emoji: '✅' },
  { id: 'star', tier: 'instant', name: '单词小达人星星贴纸', emoji: '⭐' },
  // 🟡 周末中等奖励（中积分 · 连续打卡解锁）
  { id: 'movie', tier: 'weekend', name: '亲子看电影（影院/居家）', emoji: '🎬' },
  { id: 'picnic', tier: 'weekend', name: '公园野餐', emoji: '🧺' },
  { id: 'cycling', tier: 'weekend', name: '户外骑行', emoji: '🚲' },
  { id: 'zoo', tier: 'weekend', name: '动物园 / 海洋馆游玩', emoji: '🐯' },
  { id: 'dessert', tier: 'weekend', name: '甜品大餐', emoji: '🍰' },
  // 🔵 长线大奖（高积分 · 月度目标解锁）
  { id: 'park', tier: 'grand', name: '游乐园一日游', emoji: '🎢' },
  { id: 'farm', tier: 'grand', name: '农场采摘研学', emoji: '🌿' },
  { id: 'trip', tier: 'grand', name: '短途一日出游', emoji: '🚗' },
  { id: 'books', tier: 'grand', name: '心仪图书套装', emoji: '📚' },
]

export const TIERS: Record<string, { key: string; name: string; icon: string; color: string; cost: number }> = {
  instant: { key: 'instant', name: '即时小奖励', icon: '🟢', color: '#66BB6A', cost: 30 },
  weekend: { key: 'weekend', name: '周末中等奖励', icon: '🟡', color: '#FFB300', cost: 200 },
  grand: { key: 'grand', name: '长线大奖', icon: '🔵', color: '#42A5F5', cost: 600 },
}

interface RewardState {
  points: number
  totalPoints: number
  streak: number
  lastPlayDay: string
  monthKey: string
  monthPoints: number
  winCredits: number
  redeemedCount: number
  history: Array<{ id: string; name: string; emoji: string; tier: string; cost: number; ts: number }>
  lastSettleKey: string
}

const DEFAULT_STATE: RewardState = {
  points: 0,
  totalPoints: 0,
  streak: 0,
  lastPlayDay: '',
  monthKey: '',
  monthPoints: 0,
  winCredits: 0,
  redeemedCount: 0,
  history: [],
  lastSettleKey: '',
}

// ============ 工具 ============
function _dayKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function _monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function _daysBetween(fromStr: string, toStr: string) {
  if (!fromStr) return Infinity
  const [fy, fm, fd] = fromStr.split('-').map(Number)
  const [ty, tm, td] = toStr.split('-').map(Number)
  const from = Date.UTC(fy, fm - 1, fd)
  const to = Date.UTC(ty, tm - 1, td)
  return Math.round((to - from) / 86400000)
}

function _load(): RewardState {
  try {
    if (typeof window === 'undefined') return { ...DEFAULT_STATE }
    const raw = window.localStorage.getItem(REWARD_CONFIG.STORAGE_KEY)
    if (!raw) return { ...DEFAULT_STATE }
    return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<RewardState>) }
  } catch {
    return { ...DEFAULT_STATE }
  }
}
function _save(state: RewardState) {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(REWARD_CONFIG.STORAGE_KEY, JSON.stringify(state))
  } catch { /* ignore */ }
}
/** 跨月滚动：月份切换时重置月度积分 */
function _rollMonth(state: RewardState, now: Date) {
  const mk = _monthKey(now)
  if (state.monthKey !== mk) {
    state.monthKey = mk
    state.monthPoints = 0
  }
  return state
}

// ============ 结算数据形状（由 engine.getSummary 提供, 结构化兼容） ============
export interface GameSummary {
  result: 'win' | 'lose'
  score: number
  level: number
  correctCount: number
  stars: number
  gameTime: number
}

export interface SettleResult {
  ok: boolean
  duplicate?: boolean
  earned: number
  detailText: string
  points: number
  streak?: number
  winCredits?: number
  monthPoints: number
  monthGoal: number
  base?: number
  star?: number
  checkin?: number
  streakBonus?: number
  score?: number
  scoreText?: string
  scorePts?: number
  scorePtsMax?: number
  correct?: number
}

// ============ 通关积分结算 ============
/**
 * 通关胜利结算亲子积分（内部同局去重，重复调用安全）
 * v36 积分构成：得分积分(保底 5 + 每 2000 分 +1, 封顶 20) + 星级加成 + 当日打卡 + 连续打卡加成
 */
export function settleWin(summary: GameSummary): SettleResult | null {
  if (!summary || summary.result !== 'win') return null
  const settleKey = ['win', summary.gameTime || 0, summary.score || 0, summary.level || 1, summary.correctCount || 0].join('|')
  const state = _rollMonth(_load(), new Date())

  const P = REWARD_CONFIG.POINTS
  const rawScore = Math.max(0, Number(summary.score) || 0)
  const scorePts = Math.min(P.WIN_MIN + Math.floor(rawScore / P.SCORE_PER_POINT), P.WIN_MIN + P.SCORE_BONUS_MAX)
  const scorePtsMax = P.WIN_MIN + P.SCORE_BONUS_MAX
  const scoreText = String(rawScore).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  if (state.lastSettleKey === settleKey) {
    return {
      ok: true, duplicate: true, earned: 0, detailText: '本局已结算', points: state.points,
      streak: state.streak, winCredits: state.winCredits, monthPoints: state.monthPoints,
      monthGoal: REWARD_CONFIG.GATES.MONTH_POINTS, scoreText,
    }
  }

  const now = new Date()
  const today = _dayKey(now)

  const base = scorePts
  const stars = summary.stars || 0
  const star = stars >= 3 ? P.STAR3 : stars >= 2 ? P.STAR2 : 0

  // 连续打卡：当日有通关即打卡；隔日 +1，断签重置为 1，同日不重复计
  const isNewDay = state.lastPlayDay !== today
  if (isNewDay) {
    const gap = _daysBetween(state.lastPlayDay, today)
    state.streak = gap === 1 ? state.streak + 1 : 1
    state.lastPlayDay = today
  }
  const checkin = isNewDay ? P.DAILY_CHECKIN : 0

  // 连续打卡加成：第 2 天起每天 +2，封顶 +10
  const streakBonus = Math.min(Math.max(state.streak - 1, 0), P.STREAK_BONUS_MAX_DAYS) * P.STREAK_BONUS_PER_DAY

  const earned = base + star + checkin + streakBonus
  state.points += earned
  state.totalPoints += earned
  state.monthPoints += earned
  state.winCredits += 1 // 每次通关解锁 1 次即时小奖励兑换
  state.lastSettleKey = settleKey
  _save(state)

  const parts = ['得分+' + base]
  if (star > 0) parts.push('星级+' + star)
  if (checkin > 0) parts.push('打卡+' + checkin)
  if (streakBonus > 0) parts.push('连续' + state.streak + '天+' + streakBonus)

  return {
    ok: true,
    base, star, checkin, streakBonus,
    score: rawScore, scoreText, scorePts, scorePtsMax,
    earned,
    detailText: parts.join(' · '),
    streak: state.streak,
    points: state.points,
    winCredits: state.winCredits,
    monthPoints: state.monthPoints,
    monthGoal: REWARD_CONFIG.GATES.MONTH_POINTS,
  }
}

// ============ 败局努力结算 (v47) ============
/**
 * 败局「努力积分」— 儿童向激励闭环（努力有回报，失败不空手）
 * 契约边界（不可破）: 不计打卡 / 不发 winCredits；防刷: 资格线 + 封顶
 */
export function settleLose(summary: GameSummary): SettleResult | null {
  if (!summary || summary.result !== 'lose') return null
  const correct = Math.max(0, Number(summary.correctCount) || 0)
  const P = REWARD_CONFIG.POINTS
  if (correct < P.LOSE_MIN_CORRECT) return null // 资格线：防秒输刷分

  const settleKey = ['lose', summary.gameTime || 0, summary.score || 0, summary.level || 1, correct].join('|')
  const state = _rollMonth(_load(), new Date())
  if (state.lastSettleKey === settleKey) {
    return {
      ok: true, duplicate: true, earned: 0, correct, detailText: '本局已结算',
      points: state.points, monthPoints: state.monthPoints,
      monthGoal: REWARD_CONFIG.GATES.MONTH_POINTS,
    }
  }

  const earned = Math.min(P.LOSE_BASE + Math.floor(correct / P.LOSE_PER_CORRECT), P.LOSE_MAX)
  state.points += earned
  state.totalPoints += earned
  state.monthPoints += earned
  state.lastSettleKey = settleKey
  _save(state)

  return {
    ok: true,
    earned,
    correct,
    detailText: `答对 ${correct} 题 · 继续加油`,
    points: state.points,
    monthPoints: state.monthPoints,
    monthGoal: REWARD_CONFIG.GATES.MONTH_POINTS,
  }
}

// ============ 钱包概览 ============
export interface Wallet {
  points: number
  totalPoints: number
  streak: number
  monthPoints: number
  monthGoal: number
  gateWeekend: boolean
  gateGrand: boolean
  winCredits: number
  redeemedCount: number
}

export function getWallet(): Wallet {
  const state = _rollMonth(_load(), new Date())
  const g = REWARD_CONFIG.GATES
  return {
    points: state.points,
    totalPoints: state.totalPoints,
    streak: state.streak,
    monthPoints: state.monthPoints,
    monthGoal: g.MONTH_POINTS,
    gateWeekend: state.streak >= g.STREAK_DAYS,
    gateGrand: state.monthPoints >= g.MONTH_POINTS,
    winCredits: state.winCredits,
    redeemedCount: state.redeemedCount,
  }
}

// ============ 兑换资格检查 ============
export function checkRedeem(itemId: string): { ok: boolean; reason: string; need: number; reasonText: string } {
  const item = REWARD_CATALOG.find((r) => r.id === itemId)
  if (!item) return { ok: false, reason: 'locked', need: 0, reasonText: '未知奖励' }
  const tier = TIERS[item.tier]
  const wallet = getWallet()
  if (item.tier === 'instant' && wallet.winCredits < 1) {
    return { ok: false, reason: 'noCredit', need: 0, reasonText: '需通关解锁兑换' }
  }
  if (item.tier === 'weekend' && !wallet.gateWeekend) {
    return { ok: false, reason: 'locked', need: REWARD_CONFIG.GATES.STREAK_DAYS, reasonText: `连续打卡 ${wallet.streak}/${REWARD_CONFIG.GATES.STREAK_DAYS} 天解锁` }
  }
  if (item.tier === 'grand' && !wallet.gateGrand) {
    return { ok: false, reason: 'locked', need: REWARD_CONFIG.GATES.MONTH_POINTS, reasonText: `本月积分 ${wallet.monthPoints}/${REWARD_CONFIG.GATES.MONTH_POINTS} 解锁` }
  }
  if (wallet.points < tier.cost) {
    return { ok: false, reason: 'noPoints', need: tier.cost - wallet.points, reasonText: `还差 ${tier.cost - wallet.points} 积分` }
  }
  return { ok: true, reason: 'ok', need: 0, reasonText: '可兑换' }
}

// ============ 执行兑换 ============
export function redeem(itemId: string): { ok: boolean; reasonText: string; points: number } {
  const check = checkRedeem(itemId)
  if (!check.ok) {
    return { ok: false, reasonText: check.reasonText, points: getWallet().points }
  }
  const item = REWARD_CATALOG.find((r) => r.id === itemId)
  if (!item) return { ok: false, reasonText: '未知奖励', points: getWallet().points }
  const tier = TIERS[item.tier]
  const state = _load()
  if (state.points < tier.cost) {
    return { ok: false, reasonText: '积分不足', points: state.points }
  }
  state.points -= tier.cost
  if (item.tier === 'instant') {
    state.winCredits = Math.max(0, state.winCredits - 1) // 消耗 1 张通关兑换券
  }
  state.redeemedCount += 1
  state.history.unshift({
    id: item.id, name: item.name, emoji: item.emoji,
    tier: item.tier, cost: tier.cost, ts: Date.now(),
  })
  if (state.history.length > REWARD_CONFIG.MAX_HISTORY) {
    state.history.length = REWARD_CONFIG.MAX_HISTORY
  }
  _save(state)
  return { ok: true, reasonText: '兑换成功', points: state.points }
}

// ============ 奖励中心页视图模型 ============
export interface TierView {
  key: string
  name: string
  icon: string
  color: string
  cost: number
  unlocked: boolean
  progressText: string
  items: Array<{ id: string; emoji: string; name: string; cost: number; canRedeem: boolean; statusText: string }>
}

export function getPageData() {
  const wallet = getWallet()
  const g = REWARD_CONFIG.GATES
  const tiers: TierView[] = ['instant', 'weekend', 'grand'].map((key) => {
    const t = TIERS[key]
    let unlocked = false
    let progressText = ''
    if (key === 'instant') {
      unlocked = wallet.winCredits >= 1
      progressText = unlocked ? `可兑换 ${wallet.winCredits} 次` : '通关一次即可解锁'
    } else if (key === 'weekend') {
      unlocked = wallet.gateWeekend
      progressText = `连续打卡 ${wallet.streak}/${g.STREAK_DAYS} 天`
    } else {
      unlocked = wallet.gateGrand
      progressText = `本月积分 ${wallet.monthPoints}/${g.MONTH_POINTS}`
    }
    const items = REWARD_CATALOG.filter((r) => r.tier === key).map((item) => {
      const check = checkRedeem(item.id)
      return {
        id: item.id, emoji: item.emoji, name: item.name,
        cost: t.cost, canRedeem: check.ok,
        statusText: check.ok ? '可兑换' : check.reasonText,
      }
    })
    return {
      key, name: t.name, icon: t.icon, color: t.color,
      cost: t.cost, unlocked, progressText, items,
    }
  })
  return { wallet, tiers, history: _load().history.slice(0, 8) }
}
