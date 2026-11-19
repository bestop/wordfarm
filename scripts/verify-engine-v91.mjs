// scripts/verify-engine-v91.mjs - v91 游戏逻辑引擎级断言（bun 直跑 TS）
// 验证: 同题防重复作答(duplicate 透传) / 快照题 id 错位防护 / 护学加成消费后清零(对齐小程序)
//       / ice 弹缓速不覆盖更强因子 / 刷怪不超同屏上限(overshoot 不强塞) / 心跳堵转回收
//       / 终局大波首帧放王 + 护卫随机偏移 / 难度权重归一化
import { GameEngine } from '../src/game/engine.ts'

let pass = 0, fail = 0
function assert(cond, label) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}
function makeZombie(id, lane = 1, progress = 0.2) {
  return { id, type: 'bucket', lane, progress, speed: 0.001, health: 6, maxHealth: 6, state: 'walking', slowFactor: 1, slowTimer: 0, boostMult: 1, boostTimer: 0, wobble: 0, wobbleSeed: 0, hitFlash: 0, dyingTimer: 0, attackTimer: 0, summonTimer: 0, targetPlantId: null }
}
const eng = new GameEngine()
const LAYOUT = { left: 100, top: 20, width: 600, height: 300, cellW: 120, cellH: 100 }

// ---------- 1. 同题防重复作答: quizEngine 层二次结算被拦截 ----------
console.log('\n[1] 同题防重复作答')
eng.init('junior'); eng.setLayout(LAYOUT); eng.start()
// 1a. quizEngine 层: 同题二次 answer → duplicate, 统计/连击零变化
const q1 = eng.quiz.getCurrent()
const r1 = eng.quiz.answer(q1.correctAnswer)
assert(r1.correct === true, `首次作答结算 (combo=${r1.combo})`)
const cnt0 = eng.quiz.correctCount, tot0 = eng.quiz.totalAnswered, cb0 = eng.quiz.combo
const rDup = eng.quiz.answer(q1.correctAnswer) // 同题重复点击
assert(rDup.duplicate === true, `重复作答被守卫拦截 duplicate=true`)
assert(eng.quiz.correctCount === cnt0 && eng.quiz.totalAnswered === tot0 && eng.quiz.combo === cb0,
  `统计/连击零变化 (correct=${eng.quiz.correctCount}/${eng.quiz.totalAnswered}, combo=${eng.quiz.combo})`)
// 1b. UI 层重放: 同题连点第二击携带旧题 id → answerQuiz 忽略（同步换题下同题窗口由 id 校验覆盖）
const staleId = q1.id
const qNow = eng.quiz.getCurrent()
const sNow = eng.score, sunNow = eng.sunlight, cbNow = eng.combo
const rStaleTap = eng.answerQuiz(q1.correctAnswer, staleId) // 旧题 id ≠ 当前新题 id
assert(rStaleTap.correct === false && eng.score === sNow && eng.sunlight === sunNow && eng.quiz.getCurrent().id === qNow.id,
  `同题连点第二击被 stale id 忽略（不计分/不惩罚/不跳题）`)
void cbNow

// ---------- 2. 快照题 id 错位防护 ----------
console.log('\n[2] 快照错位防护')
eng.init('junior'); eng.setLayout(LAYOUT); eng.start() // 重置（隔离 [1] 的 quiz 层作答残留）
const curQ = eng.quiz.getCurrent()
const rStale = eng.answerQuiz(0, 999999) // 携带陈旧题 id → 应被忽略
assert(rStale.correct === false && eng.quiz.getCurrent().id === curQ.id,
  `expectedQuestionId 不匹配 → 忽略本次点击`)
const rOk = eng.answerQuiz(0, eng.quiz.getCurrent().id) // id 匹配 → 正常结算
assert(typeof rOk.correct === 'boolean' && eng.quiz.getCurrent().id !== curQ.id,
  `id 匹配 → 正常结算并换题`)

// ---------- 3. 护学加成消费后清零（对齐小程序 v61 原语义） ----------
console.log('\n[3] 护学加成单次消费')
eng.init('junior'); eng.setLayout(LAYOUT); eng.start()
eng.zombies = [makeZombie(3, 0)]
const qA = eng.quiz.getCurrent(); eng.answerQuiz(qA.correctAnswer === 0 ? 1 : 0) // 错1 免罚
const qB = eng.quiz.getCurrent(); eng.answerQuiz(qB.correctAnswer === 0 ? 1 : 0) // 错2 加速
const qC = eng.quiz.getCurrent(); eng.answerQuiz(qC.correctAnswer === 0 ? 1 : 0) // 错3 喘息+放宽
assert(eng.questionTimeBonusMs === 7500, `错3后下一题限时放宽 +7500ms (实际 ${eng.questionTimeBonusMs})`)
const qD = eng.quiz.getCurrent()
const rD = eng.answerQuiz(qD.correctAnswer) // 放宽题答对 → 消费
assert(eng.pendingRecoveryBonusMs === 0, `消费后 pending 清零 (${eng.pendingRecoveryBonusMs})`)
assert(eng.questionTimeBonusMs === 0, `再下一题回归基础限时 (${eng.questionTimeBonusMs})`)
assert(eng.getSnapshot().quizTimeLimit === 15000, `snapshot 限时=15000 (${eng.getSnapshot().quizTimeLimit})`)

// ---------- 4. ice 弹缓速不覆盖更强因子 ----------
console.log('\n[4] ice 弹缓速叠加规则')
eng.zombies = [makeZombie(9, 1)]
const zIced = eng.zombies[0]
zIced.slowFactor = 0.25; zIced.slowTimer = 2500 // 已被寒冰脉冲减速
eng._hitZombie(zIced, { id: 99, lane: 1, x: 0, y: 0, vx: 0, damage: 0, kind: 'ice', radius: 0, color: '', pierce: false, pierceMax: 0, hitTargets: [9] })
assert(zIced.slowFactor === 0.25, `ice 弹不覆盖 0.25 强缓速 (实际 ${zIced.slowFactor})`)
assert(zIced.slowTimer === Math.max(2500, 2000), `缓速时长取 max (${zIced.slowTimer})`)
zIced.slowFactor = 1; zIced.slowTimer = 0 // 无缓速 → 正常上冰
eng._hitZombie(zIced, { id: 99, lane: 1, x: 0, y: 0, vx: 0, damage: 0, kind: 'ice', radius: 0, color: '', pierce: false, pierceMax: 0, hitTargets: [9] })
assert(zIced.slowFactor === 0.5, `无缓速时 ice 弹正常减速 0.5 (${zIced.slowFactor})`)

// ---------- 5. 刷怪不超同屏上限（overshoot 不强塞）+ 心跳堵转回收 ----------
console.log('\n[5] 刷怪上限与心跳回收')
eng.init('primary'); eng.setLayout(LAYOUT); eng.start() // primary maxZombies=6
eng.zombies = []
for (let i = 0; i < 6; i++) eng._spawnZombie('bucket', i % 3) // 塞满 6
let overflowed = false
for (let f = 0; f < 600; f++) { // 600 帧 × 50ms = 30s（远超 overshoot 2.5×4.2s）
  eng.spawnTimer = 99999 // 强制每帧进入尝试
  eng._updateSpawner(50)
  if (eng.zombies.length > 6) { overflowed = true; break }
}
assert(!overflowed && eng.zombies.length === 6, `满员 30s 不强塞 (zombies=${eng.zombies.length})`)
const firstId = eng.zombies[0].id
for (let f = 0; f < 320; f++) eng._updateSpawner(50) // 累计 stall ≥ 15000ms
assert(eng.zombies.length === 6, `回收名额后下一帧立即补位 (${eng.zombies.length})`)
assert(!eng.zombies.some(z => z.id === firstId), `被回收的是现存最早 (id=${firstId})`)
assert(eng.zombies.some(z => z.id > firstId), `补位新僵尸已入场`)

// ---------- 6. 终局大波: 王首帧入场 + 护卫随机偏移 ----------
console.log('\n[6] 终局大波入场节奏')
eng.init('junior'); eng.setLayout(LAYOUT); eng.start()
eng.zombies = []
eng._launchFinalWave()
assert(eng.waveQueue.length === 1 + 9, `队列 = 1王+9护卫 (${eng.waveQueue.length})`)
eng._updateWaveQueue(16) // 一帧
assert(eng.waveQueue.length === 9, `首帧立即放王 (${eng.waveQueue.length})`)
assert(eng.zombies.length === 1 && eng.zombies[0].type === 'king', `王已入场 (${eng.zombies[0]?.type})`)
// 护卫车道均衡: 每道恰 3 只（(i+offset)%3 轮转）
const laneCnt = [0, 0, 0]
for (const it of eng.waveQueue) laneCnt[it.lane]++
assert(laneCnt.every(c => c === 3), `护卫 3×3 车道均衡 [${laneCnt.join(',')}]`)

// ---------- 7. 难度权重归一化（quizEngine 侧） ----------
console.log('\n[7] 难度权重归一化')
eng.quiz.setWordBank([
  { en: 'a1', zh: '一1', phonetic: '', difficulty: 1 },
  { en: 'a2', zh: '一2', phonetic: '', difficulty: 2 },
])
// 权重和故意 <1（模拟浮点尾差/配置误差）: {1:0.2, 2:0.8} 归一化后难度2应约 80%
let d2 = 0
for (let i = 0; i < 2000; i++) {
  const cands = eng.quiz._filterByDifficulty({ 1: 0.2, 2: 0.8 })
  if (cands[0].difficulty === 2) d2++
}
assert(Math.abs(d2 / 2000 - 0.8) < 0.06, `权重 {1:0.2, 2:0.8} 和<1 归一化 → 难度2占比 ${(d2 / 2000 * 100).toFixed(1)}%`)
let d1 = 0
for (let i = 0; i < 2000; i++) {
  const cands = eng.quiz._filterByDifficulty({ 1: 0, 2: 0 }) // 全零兜底
  if (cands[0].difficulty === 1) d1++
}
assert(d1 === 0, `全零权重兜底最后键（难度2）(难度1 占比 ${(d1 / 20).toFixed(1)}%)`)

console.log(`\n===== v91 web 引擎断言: ${pass} pass / ${fail} fail =====`)
process.exit(fail ? 1 : 0)
