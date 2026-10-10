// utils/combatResolver.js - 战斗结算器(v56 自 gameManager.js 拆分; v60 增 v60 玩法结算)
// 纯代码搬运: 原 gameManager 6 个战斗私有方法整体迁出, 函数首位收
//   game 实例(读 state / 发 onScoreChange/onDefenseChange UI 回调), 与
//   v55 zombiePainter 收 R 实例同款惯例; 子系统单例(zombie/plant/path/
//   renderer/audio)由本模块自行 require, 不反向依赖 gameManager(无环)
// gameManager 战斗结算职责收敛为同名薄委托(调用面/注释引用/测试面不变)
// 会话轨迹与拆分前逐条一致(scripts/task56 trace 比对验证)
const {
  PARTICLE, PLANT, COMBAT, GRID, ASSET_KEYS, QUIZ, SUNLIGHT
} = require('./constants.js');
const { zombieManager } = require('./zombieManager.js');
const { plantManager } = require('./plantManager.js');
const { pathManager } = require('./pathManager.js');
const { renderer } = require('./renderer.js');
const audioManager = require('./audioManager.js');

/**
 * v60: 击杀掉宝 roll — 命中概率 SUNLIGHT.LOOT_CHANCE 时在阵亡位置掉落
 *   一颗 LOOT_VALUE 面值可收集阳光（plantManager.spawnLootSun）
 * 刻意不加额外粒子：阳光本体即视觉，且 task56 C2-C4 对 burst 数量有
 *   精确断言（1/最后一位/3），任何额外粒子都会破坏既有验证口径
 * @param {{x:number, y:number}} pos - 阵亡位置（canvas 像素）
 */
function _rollLootDrop(pos) {
  if (Math.random() < SUNLIGHT.LOOT_CHANCE) {
    plantManager.spawnLootSun(pos.x, pos.y, SUNLIGHT.LOOT_VALUE);
  }
}

/**
 * 投射物命中僵尸
 * @param {Object} game - gameManager 实例(v56 外迁: 读 state / 发 UI 回调)
 */
function onProjectileHit(game, zombie, proj) {
  const opts = proj.slow ? { slow: proj.slow } : null;
  const killed = zombieManager.takeDamage(zombie, proj.damage, opts);
  if (killed) {
    game.state.killedZombies++;
    game.state.score += zombie.scoreReward;
    audioManager.play(ASSET_KEYS.AUDIO.KILL);
    // 粒子爆炸
    const pos = pathManager.getPosition(zombie.pathIndex, zombie.progress);
    // v6 修复 (Task 12): 击杀粒子数 → PARTICLE.BURST_KILL
    renderer.addBurst(pos.x, pos.y, zombie.color, PARTICLE.BURST_KILL);
    if (game.onScoreChange) game.onScoreChange(game.state.score);
    _rollLootDrop(pos);   // v60: 击杀掉宝 roll
  }
}

/**
 * 食人花咬合僵尸：瞬时高额近战伤害（8点 = 通常可直接秒杀小鬼/铁桶）
 * 对游戏进程影响机制：
 *   1. 命中瞬间造成 damage 点伤害；若直接击杀，奖励等同于击杀分数 + 食人花专属 BONUS
 *   2. 命中后食人花进入 3s 吞咽期（CD = 玩家决策风险：吞咽期被啃无法反击）
 *   3. 击杀触发振动 + 紫色粒子爆（与普通击杀黄色区分）
 * @param {Object} game - gameManager 实例(v56 外迁: 读 state / 发 UI 回调)
 */
function onChomperBite(game, plant, zombie, damage) {
  // v6 修复 (Task 12): CHOMPER_KILL_BONUS 已提升为 PLANT.CHOMPER.KILL_BONUS 集中常量
  const killed = zombieManager.takeDamage(zombie, damage, null);
  // 咬合粒子：紫色飞溅（与食人花紫色花冠呼应）
  const zpos = pathManager.getPosition(zombie.pathIndex, zombie.progress);
  // v6 修复 (Task 12): 爆发粒子数 → PARTICLE.BURST_CHOMPER_KILL / BURST_CHOMPER_HIT
  renderer.addBurst(zpos.x, zpos.y, plant.def.color,
    killed ? PARTICLE.BURST_CHOMPER_KILL : PARTICLE.BURST_CHOMPER_HIT);

  if (killed) {
    game.state.killedZombies++;
    // 食人花一口秒杀奖励：基础分 + 额外奖励（高风险高回报）
    // v6 修复 (Task 12): CHOMPER_KILL_BONUS → PLANT.CHOMPER.KILL_BONUS
    const reward = zombie.scoreReward + PLANT.CHOMPER.KILL_BONUS;
    game.state.score += reward;
    audioManager.play(ASSET_KEYS.AUDIO.KILL);
    if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
    if (game.onScoreChange) game.onScoreChange(game.state.score);
    _rollLootDrop(zpos);   // v60: 击杀掉宝 roll
  } else {
    // 未击杀（例如橄榄球/舞王高血量）：轻微振动反馈，提示玩家补刀
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  }
}

/**
 * 僵尸-植物战斗结算
 * - walking 僵尸到达植物槽位 → 转 eating，停止前进
 * - eating 僵尸按间隔啃咬植物
 * - 植物死亡 → 僵尸恢复 walking
 * v2: takeDamage 返回 {died, lane} 对象供此处分流
 * @param {Object} game - gameManager 实例(v56 外迁: 读 state / 发 UI 回调)
 */
function resolveZombiePlantCombat(game, dt) {
  const plants = plantManager.getPlants();
  if (!plants.length) {
    // 无植物：所有 eating 僵尸恢复 walking
    for (const z of zombieManager.getAll()) {
      if (z.state === 'eating') {
        z.state = 'walking';
        z.blockedBy = null;
      }
    }
    return;
  }
  // 按车道索引植物以加速查找
  const EPS = 0.01;
  for (const z of zombieManager.getAll()) {
    if (z.state !== 'walking' && z.state !== 'eating') continue;
    // 查找阻挡植物：同车道、plantProgress >= z.progress - EPS 中最小者
    let blockPlant = null;
    let blockPP = Infinity;
    for (const p of plants) {
      if (p.state === 'dead' || !p.active) continue;
      if (p.lane !== z.pathIndex) continue;
      // v6 修复 (Task 12): 槽位 → 进度 / GRID.COLS（避免硬编码 5）
      const pp = (p.slot + 0.5) / GRID.COLS;
      if (pp >= z.progress - EPS && pp < blockPP) {
        blockPP = pp;
        blockPlant = p;
      }
    }
    if (blockPlant && z.progress >= blockPP - COMBAT.ZOMBIE_EAT_RANGE) {
      // 到达植物，啃食
      z.state = 'eating';
      z.blockedBy = blockPlant.id;
      if (z.attackCooldown <= 0) {
        const dmgResult = plantManager.takeDamage(blockPlant, COMBAT.ZOMBIE_ATTACK_DAMAGE);
        z.attackCooldown = COMBAT.ZOMBIE_ATTACK_INTERVAL;
        if (dmgResult.died) {
          // 植物被啃掉，僵尸恢复前进
          z.state = 'walking';
          z.blockedBy = null;
        }
      }
    } else if (z.state === 'eating') {
      // 阻挡植物已消失，恢复 walking
      z.state = 'walking';
      z.blockedBy = null;
    }
  }
}

/**
 * v2: 樱桃炸弹爆炸 — 范围伤害
 * @param {Object} game - gameManager 实例(v56 外迁: 读 state / 发 UI 回调)
 */
function onPlantExplode(game, plant) {
  const def = plant.def;
  if (!def || !def.isExplosive) return;
  // v6 修复 (Task 12): blastRadius fallback 保留（防御性）；槽位/车道硬编码 → GRID.COLS / GRID.ROWS
  const blastR = def.blastRadius || 0.15;
  const plantProgress = (plant.slot + 0.5) / GRID.COLS;
  // 爆炸影响范围：同车道 ± blastR progress + 相邻车道
  const lanes = [plant.lane - 1, plant.lane, plant.lane + 1];
  let killCount = 0;
  for (const lane of lanes) {
    if (lane < 0 || lane >= GRID.ROWS) continue;
    const zombies = zombieManager.getZombiesInLane(lane);
    for (const z of zombies) {
      // 同车道按 progress 距离判定；相邻车道全范围生效
      if (lane === plant.lane) {
        if (Math.abs(z.progress - plantProgress) > blastR) continue;
      }
      const killed = zombieManager.takeDamage(z, def.damage);
      if (killed) {
        game.state.killedZombies++;
        game.state.score += z.scoreReward;
        killCount++;
        const pos = pathManager.getPosition(z.pathIndex, z.progress);
        // v6 修复 (Task 12): 每僵尸粒子数 → PARTICLE.BURST_EXPLODE_PER_ZOMBIE
        renderer.addBurst(pos.x, pos.y, z.color, PARTICLE.BURST_EXPLODE_PER_ZOMBIE);
        _rollLootDrop(pos);   // v60: 击杀掉宝 roll
      }
    }
  }
  if (killCount > 0 && game.onScoreChange) game.onScoreChange(game.state.score);
  // 爆炸中心粒子
  const pos = pathManager.getGridCellCenter(plant.lane, plant.slot);
  // v6 修复 (Task 12): 中心粒子数 → PARTICLE.BURST_EXPLODE_CENTER
  renderer.addBurst(pos.x, pos.y, '#FF5722', PARTICLE.BURST_EXPLODE_CENTER);
  audioManager.play(ASSET_KEYS.AUDIO.KILL);
}

/**
 * v2: 僵尸到达终点 — 扣减防线、振动反馈
 * 防线全破判定在 _loop 末尾统一处理
 * @param {Object} game - gameManager 实例(v56 外迁: 读 state / 发 UI 回调)
 */
function onZombieReachEnd(game, zombie) {
  game.state.defenseLines = Math.max(0, game.state.defenseLines - 1);
  if (game.onDefenseChange) game.onDefenseChange(game.state.defenseLines);
  wx.vibrateShort && wx.vibrateShort({ type: 'heavy' });
}

/**
 * v49: 舞王召唤反馈 — 伴舞出生点紫色粒子爆 + 轻振动(警示新威胁入场)
 * 召唤物是常规僵尸: 渲染/碰撞/击杀计分链路自动接管, 此处仅感知反馈
 * @param {Object} game - gameManager 实例(v56 外迁: 读 state / 发 UI 回调)
 */
function onDancerSummon(game, intent, minions) {
  // v6 修复 (Task 12) 惯例: 粒子数 → PARTICLE.BURST_DANCER_SUMMON
  for (const m of minions) {
    const pos = pathManager.getPosition(m.pathIndex, m.progress);
    // 紫色 = 舞王紫西装同源色系(v29), 召唤魔法观感
    renderer.addBurst(pos.x, pos.y, '#AB47BC', PARTICLE.BURST_DANCER_SUMMON);
  }
  wx.vibrateShort && wx.vibrateShort({ type: 'light' });
}

/**
 * v60: 单词魔法弹 — 答对且 combo ≥ QUIZ.MAGIC.MIN_COMBO 时自动打击
 *   场上最靠前(威胁最大)的僵尸：伤害 + 缓速（「答对 = 直接参战」核心爽点,
 *   学习表现与战力强绑定; 由 gameManager.answer 正确分支调用）
 * - 目标缺失时静默（场上无僵尸可打）
 * - 反馈：命中寒冰青魔法粒子 + 击杀时常规击杀结算（计分/音效/粒子/掉宝）
 * - 平衡：伤害对齐一发豌豆, 一题 ≥5s 答题间隔 → 边际 ≈ 0.4 个射手 DPS
 * @param {Object} game - gameManager 实例(v56 外迁: 读 state / 发 UI 回调)
 */
function onQuizMagic(game) {
  let target = null;
  for (const z of zombieManager.getAll()) {
    if (z.state !== 'walking' && z.state !== 'eating') continue;
    if (!target || z.progress > target.progress) target = z;
  }
  if (!target) return;
  const pos = pathManager.getPosition(target.pathIndex, target.progress);
  const killed = zombieManager.takeDamage(target, QUIZ.MAGIC.DAMAGE, {
    slow: { factor: QUIZ.MAGIC.SLOW_FACTOR, duration: QUIZ.MAGIC.SLOW_MS }
  });
  // 魔法命中粒子：寒冰青（与缓速语义呼应, 区别于普通击杀金黄）
  renderer.addBurst(pos.x, pos.y, '#4FC3F7', PARTICLE.BURST_CHOMPER_HIT);
  if (killed) {
    game.state.killedZombies++;
    game.state.score += target.scoreReward;
    audioManager.play(ASSET_KEYS.AUDIO.KILL);
    renderer.addBurst(pos.x, pos.y, target.color, PARTICLE.BURST_KILL);
    if (game.onScoreChange) game.onScoreChange(game.state.score);
    _rollLootDrop(pos);   // v60: 魔弹击杀同样参与掉宝
  }
}

module.exports = {
  onProjectileHit,
  onChomperBite,
  resolveZombiePlantCombat,
  onPlantExplode,
  onZombieReachEnd,
  onDancerSummon,
  onQuizMagic
};
