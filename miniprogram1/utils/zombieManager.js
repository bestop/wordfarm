// utils/zombieManager.js - 僵尸系统管理器
// 包含: 僵尸对象池、生成管理、移动算法、生命值、状态机、减速/加速 buff
// 注: 僵尸不再绑定题目，由植物投射物击杀；答错触发全场加速

const { ZOMBIE_TYPES, ZOMBIE_TYPE_WEIGHTS, PERFORMANCE, COMBAT, LEVEL } = require('./constants.js');
const { pathManager } = require('./pathManager.js');

let __zombieIdSeed = 1;

/**
 * 创建僵尸对象
 * @param {string} type - ZOMBIE_TYPES 键名
 * @param {number} pathIndex - 车道索引(=lane)
 * @param {number} baseSpeed - 基础速度(像素/秒)
 * @returns {Object} 僵尸对象
 */
function createZombie(type, pathIndex, baseSpeed) {
  const def = ZOMBIE_TYPES[type] || ZOMBIE_TYPES.bucket;
  const pathLen = pathManager.getPathLength(pathIndex) || 1;
  return {
    id: __zombieIdSeed++,
    type: def.type,
    name: def.name,
    color: def.color,
    accentColor: def.accentColor,
    radius: def.radius,
    pathIndex: pathIndex,             // 车道
    progress: 0,                      // 路径进度 0~1（0=spawn顶 1=房子底）
    speed: (baseSpeed * def.speedMultiplier) / pathLen,  // 归一化进度速度(1/s)
    health: def.baseHealth,
    maxHealth: def.baseHealth,
    scoreReward: def.scoreReward,
    state: 'walking',                 // walking / eating / dying / dead / reached
    stateTimer: 0,                    // 状态计时(ms)
    hitFlash: 0,                      // 受击闪烁计时
    wobble: Math.random() * Math.PI * 2, // 摇摆相位（动画用）
    spawnTime: Date.now(),
    slowFactor: 1.0,                  // 减速因子(1=正常 0.5=半速)
    slowTimer: 0,                     // 减速剩余(ms)
    boostMult: 1.0,                   // 加速倍率(答错惩罚)
    boostTimer: 0,                    // 加速剩余(ms)
    blockedBy: null,                  // 当前啃食的植物 id
    attackCooldown: 0,                // 啃植物攻击冷却(ms)
    active: true                      // 是否激活（对象池用）
  };
}

/**
 * 僵尸对象池
 * 避免频繁创建/销毁，复用对象结构
 */
class ZombiePool {
  constructor() {
    this.pool = [];      // 待用对象
    this.active = new Set();  // 活跃对象引用集合（仅用于统计）
    this.prealloc(PERFORMANCE.POOL_PREALLOC);
  }

  /**
   * 预分配
   */
  prealloc(n) {
    for (let i = 0; i < n; i++) {
      this.pool.push(this._makeBlank());
    }
  }

  _makeBlank() {
    return {
      id: 0, type: 'bucket', name: '', color: '', accentColor: '',
      radius: 0, pathIndex: 0, progress: 0, speed: 0, health: 0,
      maxHealth: 0, scoreReward: 0, state: 'walking', stateTimer: 0,
      hitFlash: 0, wobble: 0, spawnTime: 0, slowFactor: 1, slowTimer: 0,
      boostMult: 1, boostTimer: 0, blockedBy: null, attackCooldown: 0, active: false
    };
  }

  /**
   * 从池中获取对象（按指定配置初始化）
   * 修复：当池耗尽+达到上限时，主动回收最早僵尸强制释放，保证僵尸生成永远不中断
   */
  acquire(config) {
    let z;
    if (this.pool.length > 0) {
      z = this.pool.pop();
    } else if (this.active.size < PERFORMANCE.POOL_MAX) {
      z = this._makeBlank();
    } else {
      // 兜底：强制释放一个最早加入 active 的僵尸对象，避免生成永久停滞
      const first = this.active.values().next().value;
      if (first) {
        this.release(first);
        z = this.pool.pop() || this._makeBlank();
      } else {
        return null;
      }
    }
    Object.assign(z, config, { active: true });
    z.id = __zombieIdSeed++;
    this.active.add(z);
    return z;
  }

  /**
   * 归还对象到池
   */
  release(z) {
    if (!z || !z.active) return;
    z.active = false;
    z.blockedBy = null;
    z.state = 'dead';
    this.active.delete(z);
    if (this.pool.length < PERFORMANCE.POOL_MAX) {
      this.pool.push(z);
    }
  }

  /**
   * 当前活跃数
   */
  size() {
    return this.active.size;
  }

  /**
   * 清空所有活跃对象（重开游戏用）
   */
  clearAll() {
    for (const z of this.active) {
      z.active = false;
      z.blockedBy = null;
      this.pool.push(z);
    }
    this.active.clear();
  }
}

/**
 * 僵尸生成管理器
 * 控制生成频率、类型分布、路径选择（不再绑定题目）
 * v2: 新增 applyLevelRamp 关卡递增参数刷新
 */
class ZombieSpawner {
  constructor() {
    this.spawnTimer = 0;
    this.spawnInterval = 3200;
    this.baseSpeed = 38;
    this.speedRamp = 0.09;
    this.maxZombies = 8;
    this.typeWeights = ZOMBIE_TYPE_WEIGHTS.middle;
    this.gameStartTime = 0;
    // v2: 保存基础参数（关卡递增的基准）
    this._baseSpawnInterval = 3200;
    this._baseBaseSpeed = 38;
    this._baseTypeWeights = ZOMBIE_TYPE_WEIGHTS.middle;
    this._currentLevel = 1;
    // v4: 僵尸生成健康监测
    this._lastSpawnTime = 0;       // 上次成功生成时间戳(ms)
    this._totalSpawned = 0;        // 累计生成数
    this._spawnFailCount = 0;      // 连续生成失败计数（acquire返回null）
  }

  /**
   * 配置生成器
   * @param {Object} cfg - 来自 DIFFICULTY_CONFIG
   * @param {string} difficulty - primary / middle / college
   */
  configure(cfg, difficulty) {
    this.spawnInterval = cfg.spawnInterval;
    this.baseSpeed = cfg.baseSpeed;
    this.speedRamp = cfg.speedRamp;
    this.maxZombies = cfg.maxZombies;
    this.typeWeights = ZOMBIE_TYPE_WEIGHTS[difficulty] || ZOMBIE_TYPE_WEIGHTS.middle;
    this.gameStartTime = Date.now();
    this.spawnTimer = 0;
    // v2: 保存基础参数
    this._baseSpawnInterval = cfg.spawnInterval;
    this._baseBaseSpeed = cfg.baseSpeed;
    this._baseTypeWeights = { ...this.typeWeights };
    this._currentLevel = 1;
    // v4: 健康监测重置
    this._lastSpawnTime = Date.now();
    this._totalSpawned = 0;
    this._spawnFailCount = 0;
  }

  /**
   * v2 关卡递增：根据 level 动态调整生成间隔、速度、类型权重
   * @param {number} level - 当前关卡（1-based）
   * @param {Object} rampCfg - 来自 DIFFICULTY_CONFIG[diff].levelRamp
   */
  applyLevelRamp(level, rampCfg) {
    const r = rampCfg || LEVEL.RAMP;
    const lv = Math.min(level, LEVEL.MAX_LEVEL);
    this._currentLevel = lv;
    // 生成间隔递减（越来越快）
    const intervalMult = Math.pow(r.SPAWN_INTERVAL_MULT, lv - 1);
    this.spawnInterval = Math.max(1200, this._baseSpawnInterval * intervalMult);
    // 速度递增
    const speedMult = Math.pow(r.SPEED_MULT, lv - 1);
    this.baseSpeed = this._baseBaseSpeed * speedMult;
    // football+dancer 概率递增（从 bucket 中转移）
    const bonus = Math.min(0.30, r.TOUGH_PROB_BONUS * (lv - 1));  // 上限 30%
    this.typeWeights = this._adjustWeights(this._baseTypeWeights, bonus);
  }

  /**
   * 调整类型权重：从 bucket 中转移概率给 football+dancer
   * @param {Object} base - 基础权重
   * @param {number} bonus - 转移量
   * @returns {Object} 调整后的权重
   */
  _adjustWeights(base, bonus) {
    const w = { ...base };
    w.bucket = Math.max(0.10, (w.bucket || 0) - bonus);  // bucket 至少保留 10%
    // football 和 dancer 各分一半 bonus
    w.football = (w.football || 0) + bonus * 0.5;
    w.dancer = (w.dancer || 0) + bonus * 0.5;
    return w;
  }

  /**
   * 抽取僵尸类型（按权重），带权重归一化容错：如果累计概率<1则补bucket兜底
   */
  _rollType() {
    const entries = Object.entries(this.typeWeights);
    const totalW = entries.reduce((s, [, w]) => s + (w || 0), 0);
    if (!totalW) return 'bucket';
    const r = Math.random();
    let acc = 0;
    for (const [type, w] of entries) {
      acc += (w || 0) / totalW;  // 归一化，避免权重>1或<1
      if (r <= acc) return type;
    }
    // 最后兜底：返回权重最高者
    let best = 'bucket';
    let bestW = 0;
    for (const [t, w] of entries) {
      if ((w || 0) > bestW) { bestW = w; best = t; }
    }
    return best;
  }

  /**
   * 每帧更新：决定是否生成新僵尸
   * 加固措施（v4）：
   *   1. 超过 2.5×interval 未生成时强制触发（防暂停后停摆）
   *   2. 超过 15s 无任何僵尸生成 → 强制清除最早僵尸释放名额（防止全部卡 eating）
   *   3. 暂停恢复后 elapsed 时间跳变修正（gameStartTime 平移）
   * @param {number} dt - 帧间隔(ms)
   * @param {number} activeCount - 当前活跃数
   * @returns {Object|null} 新僵尸配置 {type, pathIndex, baseSpeed} or null
   */
  update(dt, activeCount) {
    this.spawnTimer += dt;
    const now = Date.now();
    const elapsed = (now - this.gameStartTime) / 1000;
    const interval = Math.max(1200, this.spawnInterval * (1 - this.speedRamp * Math.min(elapsed / 60, 1)));

    // 常规生成 + 超时强制
    const overshoot = this.spawnTimer >= interval * 2.5;
    const canSpawn = activeCount < this.maxZombies;

    // v4: 心跳检测 — 超过 15s 未生成任何僵尸（含 acquire 失败），强制清理一个最早僵尸释放名额
    const noSpawnDuration = now - this._lastSpawnTime;
    const heartbeatStall = noSpawnDuration > 15000 && activeCount >= this.maxZombies;

    if ((this.spawnTimer >= interval || overshoot) && canSpawn) {
      this.spawnTimer = overshoot ? 0 : (this.spawnTimer - interval);
      const type = this._rollType();
      const pathIndex = Math.floor(Math.random() * pathManager.getPathCount());
      const speedMult = 1 + this.speedRamp * Math.min(elapsed / 60, 1) * 2;
      this._lastSpawnTime = now;
      this._totalSpawned++;
      return { type, pathIndex, baseSpeed: this.baseSpeed * speedMult };
    }

    // v4: 心跳强制释放 — 名额满且长时间未生成，强制回收最早僵尸
    if (heartbeatStall) {
      console.warn('[ZombieSpawner] 心跳检测：15s 无新僵尸生成，强制释放名额. activeCount=' + activeCount +
        ', maxZombies=' + this.maxZombies + ', totalSpawned=' + this._totalSpawned +
        ', failCount=' + this._spawnFailCount);
      this._lastSpawnTime = now;  // 重置心跳，避免重复触发
      return { _forceRelease: true };  // 特殊标记，由 ZombieManager.update 处理
    }

    return null;
  }
}

/**
 * 僵尸管理器主类
 */
class ZombieManager {
  constructor() {
    this.pool = new ZombiePool();
    this.spawner = new ZombieSpawner();
    this.zombies = [];   // 当前活跃僵尸数组（用于渲染/逻辑）
  }

  /**
   * 重置（新游戏）
   */
  reset(cfg, difficulty) {
    this.pool.clearAll();
    this.zombies = [];
    this.spawner.configure(cfg, difficulty);
  }

  /**
   * v2 关卡递增（转发给 spawner）
   */
  applyLevelRamp(level, rampCfg) {
    this.spawner.applyLevelRamp(level, rampCfg);
  }

  /**
   * 每帧更新所有僵尸位置与状态
   * @param {number} dt - 帧间隔(ms)
   * @param {Function} onReachEnd - 僵尸到达终点回调 (zombie) => void
   */
  update(dt, onReachEnd) {
    // 1. 尝试生成
    const spawnCfg = this.spawner.update(dt, this.zombies.length);
    if (spawnCfg) {
      if (spawnCfg._forceRelease) {
        // v4: 心跳强制释放 — 清除最早僵尸释放名额，下一帧自动尝试生成
        if (this.zombies.length > 0) {
          const victim = this.zombies[0];
          console.warn('[ZombieManager] 心跳强制回收僵尸 id=' + victim.id +
            ' type=' + victim.type + ' state=' + victim.state +
            ' progress=' + victim.progress.toFixed(3));
          this.pool.release(victim);
          this.zombies.shift();
        }
      } else {
        const z = this.pool.acquire(createZombie(
          spawnCfg.type, spawnCfg.pathIndex, spawnCfg.baseSpeed
        ));
        if (z) {
          this.zombies.push(z);
          this.spawner._spawnFailCount = 0;  // 成功，重置失败计数
        } else {
          // v4: acquire 返回 null — 记录失败，spawner 心跳机制会兜底
          this.spawner._spawnFailCount++;
          console.error('[ZombieManager] pool.acquire 返回 null！生成失败.' +
            ' failCount=' + this.spawner._spawnFailCount +
            ' poolSize=' + this.pool.pool.length +
            ' activeSize=' + this.pool.active.size);
        }
      }
    }

    // 2. 更新每个僵尸
    const dtSec = dt / 1000;
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (!z.active) {
        this.zombies.splice(i, 1);
        continue;
      }

      // buff 计时衰减
      if (z.slowTimer > 0) {
        z.slowTimer -= dt;
        if (z.slowTimer <= 0) { z.slowFactor = 1.0; z.slowTimer = 0; }
      }
      if (z.boostTimer > 0) {
        z.boostTimer -= dt;
        if (z.boostTimer <= 0) { z.boostMult = 1.0; z.boostTimer = 0; }
      }
      // 啃植物攻击冷却
      if (z.attackCooldown > 0) z.attackCooldown -= dt;

      // 状态机
      if (z.state === 'walking') {
        const effSpeed = z.speed * z.slowFactor * z.boostMult;
        z.progress += effSpeed * dtSec;
        z.wobble += dtSec * 6;
        if (z.progress >= 1) {
          z.progress = 1;
          z.state = 'reached';
          if (onReachEnd) onReachEnd(z);
          z.state = 'dying';
          z.stateTimer = 0;
        }
      } else if (z.state === 'eating') {
        // 啃食中不前进，仅摇摆动画
        z.wobble += dtSec * 8;
        // 由 gameManager._resolveZombiePlantCombat 负责造成伤害与解除阻塞
      } else if (z.state === 'dying') {
        z.stateTimer += dt;
        if (z.stateTimer > 400) {
          z.state = 'dead';
        }
      }
      // 受击闪烁衰减
      if (z.hitFlash > 0) z.hitFlash -= dt;

      // 死亡清理
      if (z.state === 'dead') {
        this.pool.release(z);
        this.zombies.splice(i, 1);
      }
    }
  }

  /**
   * 获取所有活跃僵尸（渲染用）
   */
  getAll() {
    return this.zombies;
  }

  /**
   * 按 id 查找僵尸
   */
  findById(id) {
    return this.zombies.find(z => z.id === id);
  }

  /**
   * 获取指定车道内可被攻击的僵尸（walking/eating 状态）
   * @param {number} lane
   * @returns {Array}
   */
  getZombiesInLane(lane) {
    return this.zombies.filter(z => z.pathIndex === lane &&
      (z.state === 'walking' || z.state === 'eating'));
  }

  /**
   * 僵尸受击
   * @param {Object} zombie
   * @param {number} amount - 伤害值
   * @param {Object} [opts] - { slow: { factor, duration } } 可选减速
   * @returns {boolean} 是否被击杀
   */
  takeDamage(zombie, amount, opts) {
    if (!zombie || zombie.state === 'dying' || zombie.state === 'dead') return false;
    zombie.health -= amount;
    zombie.hitFlash = 200;
    if (opts && opts.slow) {
      // 取更强的减速（factor 更小）
      if (zombie.slowTimer <= 0 || opts.slow.factor < zombie.slowFactor) {
        zombie.slowFactor = opts.slow.factor;
      }
      zombie.slowTimer = Math.max(zombie.slowTimer, opts.slow.duration);
    }
    if (zombie.health <= 0) {
      zombie.state = 'dying';
      zombie.stateTimer = 0;
      zombie.blockedBy = null;
      return true;
    }
    return false;
  }

  /**
   * 全场僵尸临时加速（答错惩罚）
   * @param {number} mult - 加速倍率
   * @param {number} duration - 持续时长(ms)
   */
  applyGlobalSpeedBoost(mult, duration) {
    for (const z of this.zombies) {
      if (z.state === 'walking' || z.state === 'eating') {
        z.boostMult = mult;
        z.boostTimer = Math.max(z.boostTimer, duration);
      }
    }
  }

  /**
   * 击杀僵尸（强制死亡，用于特殊技能/结算）
   * @param {Object} zombie
   * @returns {number} 击杀奖励分
   */
  kill(zombie) {
    if (!zombie) return 0;
    zombie.state = 'dying';
    zombie.stateTimer = 0;
    zombie.blockedBy = null;
    return zombie.scoreReward;
  }

  /**
   * 清理所有
   */
  clear() {
    this.pool.clearAll();
    this.zombies = [];
  }
}

const zombieManager = new ZombieManager();

module.exports = {
  zombieManager,
  createZombie,
  ZombiePool,
  ZombieSpawner,
  ZombieManager
};
