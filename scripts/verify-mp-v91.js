#!/usr/bin/env node
// scripts/verify-mp-v91.js - v91 小程序端游戏逻辑仿真断言（node 直跑, 无 wx 依赖模块）
// 验证: quizManager 权重归一化采样 / 同题防重复作答 / 超时登记防旧题重答
//       / plantManager 食人花未咬中吞咽动画不突跳 / zombieManager 心跳钟平移
const path = require('path')
const root = path.join(__dirname, '..', 'miniprogram')

let pass = 0, fail = 0
function assert(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}

// ---------- 1. quizManager 权重归一化 ----------
console.log('\n[1] 权重归一化采样')
const { quizManager } = require(path.join(root, 'utils/quizManager.js'))
// 双难度词库: 验证 {1:0.2, 2:0.8} 归一化后占比≈80%（旧版落空概率会滑落到难度1）
const bank = []
for (let i = 0; i < 30; i++) bank.push({ en: 'w1_' + i, zh: '释' + i, phonetic: '', difficulty: 1 })
for (let i = 0; i < 30; i++) bank.push({ en: 'w2_' + i, zh: '义' + i, phonetic: '', difficulty: 2 })
quizManager.setWordBank(bank)
quizManager.reset(4)
let d2 = 0
for (let i = 0; i < 4000; i++) {
  const cands = quizManager._filterByDifficulty({ 1: 0.2, 2: 0.8 })
  if (cands[0].difficulty === 2) d2++
}
const ratio = d2 / 4000
assert(Math.abs(ratio - 0.8) < 0.06, '权重 {1:0.2, 2:0.8} → 难度2占比 ' + (ratio * 100).toFixed(1) + '%')
let d1z = 0
for (let i = 0; i < 4000; i++) {
  const cands = quizManager._filterByDifficulty({ 1: 0, 2: 0 })
  if (cands[0].difficulty === 1) d1z++
}
assert(d1z === 0, '全零权重兜底最后键（难度2, 旧版滑落难度1）')
// 题型 roll 不再固定兜底 en2zh（浮点尾差场景）
let phoSeen = false
for (let i = 0; i < 3000; i++) if (quizManager._rollQuestionType() === 'word2pho') { phoSeen = true; break }
assert(phoSeen, '题型采样归一化后 word2pho 可正常命中')

// ---------- 2. 同题防重复作答 ----------
console.log('\n[2] 同题防重复作答')
quizManager.reset(4)
const q1 = quizManager.generateQuestion({ 1: 1 })
const r1 = quizManager.answer(q1.correctAnswer)
assert(r1.correct === true && quizManager.correctCount === 1, '首次作答结算 (combo=' + r1.combo + ')')
const rDup = quizManager.answer(q1.correctAnswer) // 同题重复点击
assert(rDup.duplicate === true, '重复作答 duplicate=true')
assert(quizManager.correctCount === 1 && quizManager.totalAnswered === 1 && quizManager.combo === 1,
  '统计/连击零变化 (correct=' + quizManager.correctCount + ', total=' + quizManager.totalAnswered + ')')
// 错分支 duplicate 透传不触发连错累积
const q2 = quizManager.generateQuestion({ 1: 1 })
quizManager.answer(q2.correctAnswer === 0 ? 1 : 0) // 正常答错 → streak=1
const q3 = quizManager.generateQuestion({ 1: 1 })
const wrongIdx = (q3.correctAnswer + 1) % q3.options.length // 确定错误的选项
const rDupWrong = quizManager.answer(wrongIdx); quizManager.answer(wrongIdx) // 第二次是重复点击
assert(rDupWrong.correct === false && quizManager.wrongStreak === 2,
  '重复点击不再累积 wrongStreak (streak=' + quizManager.wrongStreak + ')')

// ---------- 3. 超时登记防旧题重答 ----------
console.log('\n[3] 超时登记')
const { quizManager: qm2 } = require(path.join(root, 'utils/quizManager.js'))
qm2.reset(4)
const qt = qm2.generateQuestion({ 1: 1 })
assert(qm2.registerTimeout() === true, 'registerTimeout 登记成功')
const rAfterTO = qm2.answer(qt.correctAnswer)
assert(rAfterTO.duplicate === true, '超时后旧题不可再答 (duplicate)')
assert(qm2.totalAnswered === 1 && qm2.timeoutCount === 1, '统计只计超时一次 (total=' + qm2.totalAnswered + ')')

// ---------- 4. 食人花未咬中吞咽动画不突跳 ----------
console.log('\n[4] 食人花吞咽动画')
const { plantManager } = require(path.join(root, 'utils/plantManager.js'))
const { pathManager } = require(path.join(root, 'utils/pathManager.js'))
pathManager.setCanvasSize(375, 300)
pathManager.init()
plantManager.reset()
const placed = plantManager.placePlant('chomper', 1, 2)
assert(placed.ok, '放置食人花')
const ch = placed.plant
// idle → snap（有目标）; 初始 attackCooldown=1250ms 先耗尽
const zNear = { id: 1, state: 'walking', progress: (2 + 0.5) / 5 - 0.04 }
const ctxOn = { getZombiesInLane: () => [zNear], onChomperBite: () => {} }
plantManager.update(1300, ctxOn)
assert(ch.chomperState === 'snap', '初始冷却耗尽后进入咬合态')
// snap 期间目标消失（ctxEmpty）→ 未咬中 → 短吞咽
const ctxEmpty = { getZombiesInLane: () => [], onChomperBite: () => {} }
plantManager.update(350, ctxEmpty) // SNAP_DURATION_MS=300 + 余量
assert(ch.chomperState === 'swallow', '未咬中 → 短吞咽期')
assert(ch._swallowTotal === 500, '_swallowTotal 同步为实际吞咽时长 500 (实际 ' + ch._swallowTotal + ')')
plantManager.update(30, ctxEmpty)
assert(ch.chomperSwallowProgress < 0.3,
  '吞咽进度从头开始无突跳 (' + ch.chomperSwallowProgress.toFixed(3) + ', 旧版会从 ~0.51 跳)')

// ---------- 5. 心跳钟平移 ----------
console.log('\n[5] 暂停心跳钟平移')
const { zombieManager } = require(path.join(root, 'utils/zombieManager.js'))
zombieManager.reset({ spawnInterval: 3200, baseSpeed: 38, maxZombies: 8 }, 'junior')
const beforeShift = zombieManager.spawner._lastSpawnTime
zombieManager.shiftHeartbeatClock(30000)
assert(zombieManager.spawner._lastSpawnTime === beforeShift + 30000,
  'resume 平移 30s 心跳钟 (' + beforeShift + ' → ' + zombieManager.spawner._lastSpawnTime + ')')
zombieManager.shiftHeartbeatClock(0)
assert(zombieManager.spawner._lastSpawnTime === beforeShift + 30000, 'ms<=0 不平移')

console.log('\n===== v91 小程序端仿真: ' + pass + ' pass / ' + fail + ' fail =====')
process.exit(fail ? 1 : 0)
