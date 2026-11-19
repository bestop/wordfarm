// scripts/verify-engine-v90.mjs - v90 游戏逻辑引擎级断言（bun 直跑 TS）
// 验证: 连击里程碑(5)、单词魔法弹、护学三档+回归认可、车道软均衡、权重归一、铲子回收、掉宝、中场僵尸波
import { GameEngine } from '../src/game/engine.ts'

let pass = 0, fail = 0
function assert(cond, label) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}
function makeZombie(id, lane = 1) {
  return { id, type: 'bucket', lane, progress: 0.2, speed: 0.001, health: 6, maxHealth: 6, state: 'walking', slowFactor: 1, slowTimer: 0, boostMult: 1, boostTimer: 0, wobble: 0, wobbleSeed: 0, hitFlash: 0, dyingTimer: 0, attackTimer: 0, summonTimer: 0, targetPlantId: null }
}
const eng = new GameEngine()
const LAYOUT = { left: 100, top: 20, width: 600, height: 300, cellW: 120, cellH: 100 }

// ---------- 1. 连击里程碑: 连对 5 题 → 阳光 +50 + banner ----------
console.log('\n[1] 连击里程碑 combo=5')
eng.init('junior'); eng.setLayout(LAYOUT); eng.start()
const sun0 = eng.sunlight
let combo = 0
for (let i = 0; i < 5; i++) {
  const q = eng.quiz.getCurrent()
  combo = eng.answerQuiz(q.correctAnswer).combo
}
assert(combo === 5, `连对 5 题 combo=5 (实际 ${combo})`)
assert(eng.sunlight === Math.min(999, sun0 + 150 + 50), `里程碑阳光 +50 (${sun0} → ${eng.sunlight})`)
assert(eng.banner?.text.includes('连击 x5'), `里程碑 banner: "${eng.banner?.text}"`)

// ---------- 2. 单词魔法弹: combo≥5 答对自动打击最前僵尸 ----------
console.log('\n[2] 单词魔法弹')
eng.zombies = [makeZombie(1, 1), { ...makeZombie(2, 1), progress: 0.6 }]
eng.quiz.currentQuestion && null
// 手动凑一次答对（当前 combo=5 持续 → 魔弹触发）
const zBefore = eng.zombies[1].health
const q2 = eng.quiz.getCurrent()
const r2 = eng.answerQuiz(q2.correctAnswer)
assert(r2.combo === 6, `连击到 6 (实际 ${r2.combo})`)
assert(eng.zombies[1].health === zBefore - 2, `魔弹命中最前僵尸 -2 血 (${zBefore} → ${eng.zombies[1].health})`)
assert(eng.zombies[1].slowFactor === 0.6, `魔弹缓速 0.6 (${eng.zombies[1].slowFactor})`)

// ---------- 3. 护学三档 + 回归认可 ----------
console.log('\n[3] 护学三档')
eng.zombies = [makeZombie(3, 0)]
const q_w1 = eng.quiz.getCurrent()
eng.answerQuiz(q_w1.correctAnswer === 0 ? 1 : 0) // 错 1: 免罚
const boostAfterW1 = eng.zombies[0].boostMult
const q_w2 = eng.quiz.getCurrent()
eng.answerQuiz(q_w2.correctAnswer === 0 ? 1 : 0) // 错 2: 加速一次
assert(eng.zombies[0].boostMult === 1.3, `恰第 2 错加速 ×1.3 (${eng.zombies[0].boostMult})`)
eng.zombies[0].boostTimer = 0 // 人工让加速过期（隔离第 3 错断言）
eng.zombies[0].boostMult = 1
const q_w3 = eng.quiz.getCurrent()
eng.answerQuiz(q_w3.correctAnswer === 0 ? 1 : 0) // 错 3: 喘息减速
assert(eng.quiz.wrongStreak === 3, `连错 3 wrongStreak=3 (实际 ${eng.quiz.wrongStreak})`)
assert(eng.zombies[0].boostMult === 1, `第 3 错不再加速（护学接管, boostMult=${eng.zombies[0].boostMult}）`)
assert(eng.zombies[0].slowFactor === 0.25 && eng.zombies[0].slowTimer > 0, `恰第 3 错喘息减速 0.25`)
assert(eng.questionTimeBonusMs === Math.min(Math.round(15000 * 0.5), 8000), `护学限时放宽 +${eng.questionTimeBonusMs}ms`)
assert(eng.getSnapshot().quizTimeLimit === 15000 + eng.questionTimeBonusMs, `snapshot 有效限时含加成`)
const q3 = eng.quiz.getCurrent()
const r3 = eng.answerQuiz(q3.correctAnswer)
assert(r3.correct && eng.feedback?.note === '👏 状态回来了，继续保持！', `回归认可 note: "${eng.feedback?.note}"`)
// 对齐小程序: pending 只在错分支重算, 答对后下一题仍享受放宽（下一次答错才归零）
const q_next = eng.quiz.getCurrent()
eng.answerQuiz(q_next.correctAnswer === 0 ? 1 : 0) // 再错 1 次（streak=1）
assert(eng.pendingRecoveryBonusMs === 0 && eng.questionTimeBonusMs === 0, `回归后答错重算, 限时归零`)

// ---------- 4. 铲子半价回收 ----------
console.log('\n[4] 铲子半价回收')
eng.init('junior'); eng.setLayout(LAYOUT); eng.start()
eng.sunlight = 500
eng.selectPlant('wall')
assert(eng.tryPlaceAtPixel(400, 170), '种植坚果于 col2/lane1')
const afterPlant = eng.sunlight
assert(afterPlant === 450, `种植扣费 50 (${afterPlant})`)
eng.selectShovel()
assert(eng.shovelSelected === true, '铲子选中')
eng.selectPlant('shooter')
assert(eng.shovelSelected === false, '选植物自动收起铲子(互斥)')
eng.selectShovel()
const rm = eng.tryRemovePlantAtPixel(400, 170)
assert(rm.ok && rm.name === '坚果', `铲除: ${rm.name}`)
assert(eng.sunlight === afterPlant + 25, `半价回收 +25 (${afterPlant} → ${eng.sunlight})`)
assert(eng.plants.length === 0, '植物已移除')
assert(eng.tryRemovePlantAtPixel(400, 170).ok === false, '空格铲除 ok=false')
// 对齐小程序互斥语义: 铲子选中时选植物 → 铲子收起且植物正常选中
eng.selectShovel()
eng.selectPlant('wall')
assert(eng.shovelSelected === false && eng.selectedPlant === 'wall', '选植物自动收铲且保持选中')

// ---------- 5. 车道软负载均衡 ----------
console.log('\n[5] 车道软均衡')
eng.init('junior'); eng.setLayout(LAYOUT); eng.start()
eng.spawnStopped = false
eng.zombies = [makeZombie(10, 0), makeZombie(11, 0), makeZombie(12, 0)] // 3 只压 lane0
const laneCount = [0, 0, 0]
for (let i = 0; i < 300; i++) {
  eng.spawnTimer = eng.spawnInterval * 3 // OVERSHOOT force 区间
  eng._updateSpawner(16)
  if (eng.zombies.length > 3) {
    const z = eng.zombies[eng.zombies.length - 1]
    laneCount[z.lane]++
    eng.zombies.splice(eng.zombies.length - 1, 1)
  }
}
const p0 = laneCount[0] / 300
assert(Math.abs(p0 - 0.2) < 0.1, `lane0 占比 ${(p0 * 100).toFixed(1)}%（软均衡理论 20%, 纯随机 33%）`)

// ---------- 6. 权重归一化 ----------
console.log('\n[6] 权重归一化')
eng.weights = { bucket: 2, imp: 1, football: 0.5, dancer: 0.5 } // 和 = 4 ≠ 1
const t2 = new Set()
for (let i = 0; i < 400; i++) t2.add(eng._rollZombieType())
assert(t2.size === 4, `权重和=4 时 4 类均可抽出 (${[...t2].join(',')})`)

// ---------- 7. 击杀掉宝 ----------
console.log('\n[7] 击杀掉宝 12%')
eng.init('junior'); eng.start()
let looted = 0
for (let i = 0; i < 500; i++) {
  eng.suns = []
  const z = makeZombie(2000 + i)
  eng.zombies = [z]
  const before2 = eng.suns.length
  eng._killZombie(z, 'shot')
  if (eng.suns.length > before2) looted++
}
const lootRate = looted / 500
assert(lootRate > 0.05 && lootRate < 0.2, `掉宝率 ${(lootRate * 100).toFixed(1)}% ≈ 12%`)

// ---------- 8. 中场僵尸波(第 3 关) ----------
console.log('\n[8] 中场僵尸波')
eng.init('junior'); eng.setLayout(LAYOUT); eng.start()
eng.levelTimer = eng.levelTimeMs + 1
eng.update(16)
assert(eng.level === 2, `推进到第 2 关 (实际 ${eng.level})`)
assert(eng.midWaveQueue.length === 0, '第 2 关无中场波')
eng.levelTimer = eng.levelTimeMs + 1
eng.update(16)
assert(eng.level === 3, `推进到第 3 关 (实际 ${eng.level})`)
assert(eng.midWaveQueue.length === 4, `中场波 4 只排队 (实际 ${eng.midWaveQueue.length})`)
assert(eng.banner?.text.includes('一大波僵尸'), `预警 banner: "${eng.banner?.text}"`)
// update 的 dt 被 MAX_DELTA=50ms 钳制 — 用小步推进模拟真实 RAF
eng.update(50) // 累计 200+50=250ms 预警窗口内
assert(eng.zombies.length === 0, `预警窗口内未入场 (${eng.zombies.length})`)
for (let i = 0; i < 30; i++) eng.update(50) // 再走 1500ms → 预警结束首只入场
assert(eng.zombies.length === 1, `预警结束首只入场 (${eng.zombies.length})`)
for (let i = 0; i < 14; i++) eng.update(50) // 再走 700ms ≥ 550ms 节奏
assert(eng.zombies.length >= 2, `波内节奏入场 (${eng.zombies.length} 只)`)
for (let i = 0; i < 20; i++) eng.update(50) // 走满剩余节奏
// 注意: 中场波与常规生成双队列独立 — 期间常规 spawner 可能额外生成（正确行为）
assert(eng.zombies.length >= 4 && eng.midWaveQueue.length === 0,
  `波内 4 只全部入场+常规生成共存 (场上 ${eng.zombies.length}, 队列残 ${eng.midWaveQueue.length})`)

console.log(`\n========== 结果: ${pass} 通过 / ${fail} 失败 ==========`)
process.exit(fail ? 1 : 0)
