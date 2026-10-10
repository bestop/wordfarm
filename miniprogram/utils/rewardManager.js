// utils/rewardManager.js - 亲子过关奖励系统管理器 (v32)
// v36: 通关积分与实际过关得分挂钩 — 保底 5 + 每 2000 分 +1, 封顶 20
// v47: 败局努力积分 — 答对≥3题起结算, 保底1+每答对4题+1, 封顶5(失败不空手)
// 负责: 通关积分结算 / 连续打卡 / 月度积分 / 三档奖励兑换 / 兑换记录持久化
// 三档奖励体系（家长与孩子的契约）：
//   🟢 即时小奖励  低积分 · 单次通关解锁（每次通关获得 1 次兑换机会）
//   🟡 周末中等奖励 中积分 · 连续打卡解锁（连续打卡 N 天）
//   🔵 长线大奖    高积分 · 月度目标解锁（本月亲子积分 ≥ 目标）

const { REWARD_CONFIG } = require('./constants.js');

// ============ 奖励目录（内容按亲子约定，可由家长微调文案） ============
const REWARD_CATALOG = [
  // 🟢 即时小奖励（低积分 · 单次通关解锁）
  { id: 'read10',   tier: 'instant', name: '额外 10 分钟亲子共读', emoji: '📖' },
  { id: 'dinner',   tier: 'instant', name: '自选晚餐菜品',         emoji: '🍱' },
  { id: 'cartoon',  tier: 'instant', name: '15 分钟动画时间',      emoji: '📺' },
  { id: 'chore',    tier: 'instant', name: '免一次家务小任务',     emoji: '✅' },
  { id: 'star',     tier: 'instant', name: '单词小达人星星贴纸',   emoji: '⭐' },
  // 🟡 周末中等奖励（中积分 · 连续打卡解锁）
  { id: 'movie',    tier: 'weekend', name: '亲子看电影（影院/居家）', emoji: '🎬' },
  { id: 'picnic',   tier: 'weekend', name: '公园野餐',             emoji: '🧺' },
  { id: 'cycling',  tier: 'weekend', name: '户外骑行',             emoji: '🚲' },
  { id: 'zoo',      tier: 'weekend', name: '动物园 / 海洋馆游玩',  emoji: '🐯' },
  { id: 'dessert',  tier: 'weekend', name: '甜品大餐',             emoji: '🍰' },
  // 🔵 长线大奖（高积分 · 月度目标解锁）
  { id: 'park',     tier: 'grand',   name: '游乐园一日游',         emoji: '🎢' },
  { id: 'farm',     tier: 'grand',   name: '农场采摘研学',         emoji: '🌿' },
  { id: 'trip',     tier: 'grand',   name: '短途一日出游',         emoji: '🚗' },
  { id: 'books',    tier: 'grand',   name: '心仪图书套装',         emoji: '📚' }
];

// ============ 档位元数据 ============
const TIERS = {
  instant: { key: 'instant', name: '即时小奖励',   icon: '🟢', color: '#66BB6A', cost: 30 },
  weekend: { key: 'weekend', name: '周末中等奖励', icon: '🟡', color: '#FFB300', cost: 200 },
  grand:   { key: 'grand',   name: '长线大奖',     icon: '🔵', color: '#42A5F5', cost: 600 }
};

// ============ 默认状态 ============
const DEFAULT_STATE = {
  points: 0,        // 当前可用亲子积分（钱包）
  totalPoints: 0,   // 历史累计获得
  streak: 0,        // 连续打卡天数（当日有通关即打卡）
  lastPlayDay: '',  // 最近打卡日 'YYYY-MM-DD'
  monthKey: '',     // 当前积分所属月 'YYYY-MM'
  monthPoints: 0,   // 本月获得积分（月度目标进度）
  winCredits: 0,    // 即时小奖励兑换券（每次通关 +1）
  redeemedCount: 0, // 累计兑换次数
  history: [],      // 兑换记录 [{id, name, emoji, tier, cost, ts}]
  lastSettleKey: '' // 结算去重键（防同局重复结算）
};

// ============ 工具 ============
function _dayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}
function _monthKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function _daysBetween(fromStr, toStr) {
  if (!fromStr) return Infinity;
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86400000);
}
// 可注入时钟（测试穿越日期用；生产环境恒返回系统时间）
let _clockOverride = null;
function _now() {
  return _clockOverride ? _clockOverride() : new Date();
}

// ============ 存取 ============
function _load() {
  try {
    const raw = wx.getStorageSync(REWARD_CONFIG.STORAGE_KEY);
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATE };
    return { ...DEFAULT_STATE, ...raw };
  } catch (err) {
    console.error('[Reward] 读取奖励状态失败:', err);
    return { ...DEFAULT_STATE };
  }
}
function _save(state) {
  try {
    wx.setStorageSync(REWARD_CONFIG.STORAGE_KEY, state);
  } catch (err) {
    console.error('[Reward] 保存奖励状态失败:', err);
  }
}
// 跨月滚动：月份切换时重置月度积分
function _rollMonth(state, now) {
  const mk = _monthKey(now);
  if (state.monthKey !== mk) {
    state.monthKey = mk;
    state.monthPoints = 0;
  }
  return state;
}

// ============ 通关积分结算 ============
/**
 * 通关胜利结算亲子积分（内部同局去重，重复调用安全）
 * v36 积分构成：得分积分(保底 5 + 每 2000 分 +1, 封顶 20) + 星级加成
 *              + 当日打卡(首胜) + 连续打卡加成
 * @param {Object} summary - 游戏结算数据（getSummary() 返回值）
 * @returns {Object|null} {ok, base, star, checkin, streakBonus, score, scoreText,
 *                         scorePts, scorePtsMax, scoreProgress, earned, detailText,
 *                         streak, points, winCredits, monthPoints, monthGoal}
 */
function settleWin(summary) {
  if (!summary || summary.result !== 'win') return null;
  // 去重键：同局唯一（gameTime 毫秒级 + 分数 + 关卡联合，天然唯一）
  const settleKey = ['win', summary.gameTime || 0, summary.score || 0,
    summary.level || 1, summary.correctCount || 0].join('|');
  const state = _rollMonth(_load(), _now());

  // v36: 得分积分换算 — 与实际过关得分挂钩（去重分支同样返回换算字段）
  //   得分积分 = 保底 WIN_MIN + 每 SCORE_PER_POINT 分 +1, 封顶 WIN_MIN + SCORE_BONUS_MAX
  const P = REWARD_CONFIG.POINTS;
  const rawScore = Math.max(0, Number(summary.score) || 0);
  const scorePts = Math.min(P.WIN_MIN + Math.floor(rawScore / P.SCORE_PER_POINT),
    P.WIN_MIN + P.SCORE_BONUS_MAX);
  const scorePtsMax = P.WIN_MIN + P.SCORE_BONUS_MAX;
  // 千分位格式化（结算卡展示用）
  const scoreText = String(rawScore).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // 换算进度：满格 = 封顶得分（SCORE_PER_POINT × SCORE_BONUS_MAX）
  const scoreProgress = Math.round(Math.min(rawScore /
    (P.SCORE_PER_POINT * P.SCORE_BONUS_MAX), 1) * 1000) / 10;

  if (state.lastSettleKey === settleKey) {
    // 同局重复结算：返回上次结果快照（不重复加账）
    return { ok: true, duplicate: true, earned: 0, detailText: '本局已结算', points: state.points,
      streak: state.streak, winCredits: state.winCredits, monthPoints: state.monthPoints,
      score: rawScore, scoreText: scoreText, scorePts: 0, scorePtsMax: scorePtsMax,
      scoreProgress: scoreProgress };
  }

  const now = _now();
  const today = _dayKey(now);

  // 1. v36 得分积分（挂钩实际得分）+ 星级加成
  const base = scorePts;
  const stars = summary.stars || 0;
  const star = stars >= 3 ? P.STAR3 : (stars >= 2 ? P.STAR2 : 0);

  // 2. 连续打卡：当日有通关即打卡；隔日 +1，断签重置为 1，同日不重复计
  const isNewDay = state.lastPlayDay !== today;
  if (isNewDay) {
    const gap = _daysBetween(state.lastPlayDay, today);
    state.streak = (gap === 1) ? state.streak + 1 : 1;
    state.lastPlayDay = today;
  }
  const checkin = isNewDay ? P.DAILY_CHECKIN : 0;

  // 3. 连续打卡加成：第 2 天起每天 +2，封顶 +10（持续玩有回报）
  const streakBonus = Math.min(Math.max(state.streak - 1, 0), P.STREAK_BONUS_MAX_DAYS) * P.STREAK_BONUS_PER_DAY;

  const earned = base + star + checkin + streakBonus;
  state.points += earned;
  state.totalPoints += earned;
  state.monthPoints += earned;
  state.winCredits += 1;   // 每次通关解锁 1 次即时小奖励兑换
  state.lastSettleKey = settleKey;
  _save(state);

  const parts = ['得分+' + base];
  if (star > 0) parts.push('星级+' + star);
  if (checkin > 0) parts.push('打卡+' + checkin);
  if (streakBonus > 0) parts.push('连续' + state.streak + '天+' + streakBonus);

  return {
    ok: true,
    base: base, star: star, checkin: checkin, streakBonus: streakBonus,
    score: rawScore, scoreText: scoreText, scorePts: scorePts,
    scorePtsMax: scorePtsMax, scoreProgress: scoreProgress,
    earned: earned,
    detailText: parts.join(' · '),
    streak: state.streak,
    points: state.points,
    winCredits: state.winCredits,
    monthPoints: state.monthPoints,
    monthGoal: REWARD_CONFIG.GATES.MONTH_POINTS
  };
}

// ============ 败局努力结算 (v47) ============
/**
 * v47: 败局「努力积分」— 儿童向激励闭环（努力有回报，失败不空手）
 * 与 settleWin 的边界（刻意保持的契约语义，不可破）:
 *   · 不计打卡 / 不加连续天数（「当日通关即打卡」是亲子契约）
 *   · 不发 winCredits（即时小奖励兑换券仍只能通关解锁）
 *   · 积分计入钱包与月度进度（努力也向长线目标累积）
 * 防刷设计:
 *   · 资格线 LOSE_MIN_CORRECT：答对不足 3 题的秒输局不结算（防摆烂速刷）
 *   · 封顶 LOSE_MAX：故意输的收益远低于正常通关（5~20+ 分/局）
 * @param {Object} summary - getSummary() 返回值
 * @returns {Object|null} {ok, earned, correct, detailText, points,
 *                         monthPoints, monthGoal} 或 null（非败局/无资格）
 */
function settleLose(summary) {
  if (!summary || summary.result !== 'lose') return null;
  const correct = Math.max(0, Number(summary.correctCount) || 0);
  const P = REWARD_CONFIG.POINTS;
  if (correct < P.LOSE_MIN_CORRECT) return null;   // 资格线：防秒输刷分

  // 去重键：同局唯一（与 settleWin 同模式; 'lose' 前缀天然隔离）
  const settleKey = ['lose', summary.gameTime || 0, summary.score || 0,
    summary.level || 1, correct].join('|');
  const state = _rollMonth(_load(), _now());
  if (state.lastSettleKey === settleKey) {
    return { ok: true, duplicate: true, earned: 0, correct: correct,
      detailText: '本局已结算', points: state.points,
      monthPoints: state.monthPoints };
  }

  // 努力积分 = 参与保底 + 每答对 LOSE_PER_CORRECT 题 +1, 封顶 LOSE_MAX
  const earned = Math.min(P.LOSE_BASE + Math.floor(correct / P.LOSE_PER_CORRECT), P.LOSE_MAX);
  state.points += earned;
  state.totalPoints += earned;
  state.monthPoints += earned;
  state.lastSettleKey = settleKey;
  _save(state);

  return {
    ok: true,
    earned: earned,
    correct: correct,
    detailText: '答对 ' + correct + ' 题 · 继续加油',
    points: state.points,
    monthPoints: state.monthPoints,
    monthGoal: REWARD_CONFIG.GATES.MONTH_POINTS
  };
}

// ============ 钱包概览（首页/奖励页头部） ============
function getWallet() {
  const state = _rollMonth(_load(), _now());
  const g = REWARD_CONFIG.GATES;
  return {
    points: state.points,
    totalPoints: state.totalPoints,
    streak: state.streak,
    monthPoints: state.monthPoints,
    monthGoal: g.MONTH_POINTS,
    gateWeekend: state.streak >= g.STREAK_DAYS,
    gateGrand: state.monthPoints >= g.MONTH_POINTS,
    winCredits: state.winCredits,
    redeemedCount: state.redeemedCount
  };
}

// ============ 兑换资格检查 ============
/**
 * @param {string} itemId
 * @returns {Object} {ok, reason: 'ok'|'locked'|'noCredit'|'noPoints', need, reasonText}
 */
function checkRedeem(itemId) {
  const item = REWARD_CATALOG.find(r => r.id === itemId);
  if (!item) return { ok: false, reason: 'locked', need: 0, reasonText: '未知奖励' };
  const tier = TIERS[item.tier];
  const wallet = getWallet();
  if (item.tier === 'instant' && wallet.winCredits < 1) {
    return { ok: false, reason: 'noCredit', need: 0, reasonText: '需通关解锁兑换' };
  }
  if (item.tier === 'weekend' && !wallet.gateWeekend) {
    return { ok: false, reason: 'locked', need: REWARD_CONFIG.GATES.STREAK_DAYS,
      reasonText: '连续打卡 ' + wallet.streak + '/' + REWARD_CONFIG.GATES.STREAK_DAYS + ' 天解锁' };
  }
  if (item.tier === 'grand' && !wallet.gateGrand) {
    return { ok: false, reason: 'locked', need: REWARD_CONFIG.GATES.MONTH_POINTS,
      reasonText: '本月积分 ' + wallet.monthPoints + '/' + REWARD_CONFIG.GATES.MONTH_POINTS + ' 解锁' };
  }
  if (wallet.points < tier.cost) {
    return { ok: false, reason: 'noPoints', need: tier.cost - wallet.points,
      reasonText: '还差 ' + (tier.cost - wallet.points) + ' 积分' };
  }
  return { ok: true, reason: 'ok', need: 0, reasonText: '可兑换' };
}

// ============ 执行兑换 ============
/**
 * @param {string} itemId
 * @returns {Object} {ok, reasonText, points}
 */
function redeem(itemId) {
  const check = checkRedeem(itemId);
  if (!check.ok) {
    return { ok: false, reasonText: check.reasonText, points: getWallet().points };
  }
  const item = REWARD_CATALOG.find(r => r.id === itemId);
  const tier = TIERS[item.tier];
  const state = _load();
  if (state.points < tier.cost) {   // 二次防御
    return { ok: false, reasonText: '积分不足', points: state.points };
  }
  state.points -= tier.cost;
  if (item.tier === 'instant') {
    state.winCredits = Math.max(0, state.winCredits - 1);   // 消耗 1 张通关兑换券
  }
  state.redeemedCount += 1;
  state.history.unshift({
    id: item.id, name: item.name, emoji: item.emoji,
    tier: item.tier, cost: tier.cost, ts: Date.now()
  });
  if (state.history.length > REWARD_CONFIG.MAX_HISTORY) {
    state.history.length = REWARD_CONFIG.MAX_HISTORY;
  }
  _save(state);
  return { ok: true, reasonText: '兑换成功', points: state.points };
}

// ============ 页面渲染视图模型（奖励中心页） ============
/**
 * @returns {Object} {wallet, tiers:[{key,name,icon,color,cost,unlocked,progressText,items:[...]}], history}
 */
function getPageData() {
  const wallet = getWallet();
  const g = REWARD_CONFIG.GATES;
  const tiers = ['instant', 'weekend', 'grand'].map(key => {
    const t = TIERS[key];
    let unlocked = false;
    let progressText = '';
    if (key === 'instant') {
      unlocked = wallet.winCredits >= 1;
      progressText = unlocked ? ('可兑换 ' + wallet.winCredits + ' 次') : '通关一次即可解锁';
    } else if (key === 'weekend') {
      unlocked = wallet.gateWeekend;
      progressText = '连续打卡 ' + wallet.streak + '/' + g.STREAK_DAYS + ' 天';
    } else {
      unlocked = wallet.gateGrand;
      progressText = '本月积分 ' + wallet.monthPoints + '/' + g.MONTH_POINTS;
    }
    const items = REWARD_CATALOG.filter(r => r.tier === key).map(item => {
      const check = checkRedeem(item.id);
      return {
        id: item.id, emoji: item.emoji, name: item.name,
        cost: t.cost, canRedeem: check.ok,
        statusText: check.ok ? '可兑换' : check.reasonText
      };
    });
    return {
      key: key, name: t.name, icon: t.icon, color: t.color,
      cost: t.cost, unlocked: unlocked,
      progressText: progressText, items: items
    };
  });
  return { wallet: wallet, tiers: tiers, history: _load().history.slice(0, 8) };
}

module.exports = {
  rewardManager: {
    settleWin: settleWin,
    settleLose: settleLose,
    getWallet: getWallet,
    checkRedeem: checkRedeem,
    redeem: redeem,
    getPageData: getPageData,
    // 测试/调试用
    _resetForTest: function () {
      try { wx.removeStorageSync(REWARD_CONFIG.STORAGE_KEY); } catch (e) {}
    },
    _setClockForTest: function (fn) {
      _clockOverride = (typeof fn === 'function') ? fn : null;
    }
  },
  REWARD_CATALOG,
  TIERS,
  REWARD_CONFIG
};
