// utils/zombieManager.js - 僵尸系统管理器
// 包含: 僵尸对象池、生成管理、移动算法、生命值、状态机、减速/加速 buff
// 注: 僵尸不再绑定题目，由植物投射物击杀；答错触发全场加速

const { ZOMBIE_TYPES, ZOMBIE_TYPE_WEIGHTS, PERFORMANCE, COMBAT } = require('./constants.js');
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
  const def = ZOMBIE_TYPES[type] || ZOMBIE_TYPES.normal;
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
      id: 0, type: 'normal', name: '', color: '', accentColor: '',
      radius: 0, pathIndex: 0, progress: 0, speed: 0, health: 0,
      maxHealth: 0, scoreReward: 0, state: 'walking', stateTimer: 0,
      hitFlash: 0, wobble: 0, spawnTime: 0, slowFactor: 1, slowTimer: 0,
      boostMult: 1, boostTimer: 0, blockedBy: null, attackCooldown: 0, active: false
    };
  }

  /**
   * 从池中获取对象（按指定配置初始化）
   */
  acquire(config) {
    let z;
    if (this.pool.length > 0) {
      z = this.pool.pop();
    } else if (this.active.size < PERFORMANCE.POOL_MAX) {
      z = this._makeBlank();
    } else {
      return null;  // 池上限，拒绝创建
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
 */
class ZombieSpawner {
  constructor() {
    this.spawnTimer = 0;
    this.spawnInterval = 3200;
    this.baseSpeed = 38;
    this.speedRamp = 0.09;
    this.maxZombies = 8;
    this.typeWeights = ZOMBIE_TYPE_WEIGHTS.medium;
    this.gameStartTime = 0;
  }

  /**
   * 配置生成器
   * @param {Object} cfg - 来自 DIFFICULTY_CONFIG
   * @param {string} difficulty - easy/medium/hard
   */
  configure(cfg, difficulty) {
    this.spawnInterval = cfg.spawnInterval;
    this.baseSpeed = cfg.baseSpeed;
    this.speedRamp = cfg.speedRamp;
    this.maxZombies = cfg.maxZombies;
    this.typeWeights = ZOMBIE_TYPE_WEIGHTS[difficulty] || ZOMBIE_TYPE_WEIGHTS.medium;
    this.gameStartTime = Date.now();
    this.spawnTimer = 0;
  }

  /**
   * 抽取僵尸类型（按权重）
   */
  _rollType() {
    const r = Math.random();
    let acc = 0;
    for (const [type, w] of Object.entries(this.typeWeights)) {
      acc += w;
      if (r <= acc) return type;
    }
    return 'normal';
  }

  /**
   * 每帧更新：决定是否生成新僵尸
   * @param {number} dt - 帧间隔(ms)
   * @param {number} activeCount - 当前活跃数
   * @returns {Object|null} 新僵尸配置 {type, pathIndex, baseSpeed} or null
   */
  update(dt, activeCount) {
    this.spawnTimer += dt;
    // 速度随时间递增（降低生成间隔）
    const elapsed = (Date.now() - this.gameStartTime) / 1000;
    const interval = Math.max(1200, this.spawnInterval * (1 - this.speedRamp * Math.min(elapsed / 60, 1)));
    if (this.spawnTimer >= interval && activeCount < this.maxZombies) {
      this.spawnTimer = 0;
      const type = this._rollType();
      const pathIndex = Math.floor(Math.random() * pathManager.getPathCount());
      // 当前速度（随时间递增）
      const speedMult = 1 + this.speedRamp * Math.min(elapsed / 60, 1) * 2;
      return { type, pathIndex, baseSpeed: this.baseSpeed * speedMult };
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
   * 每帧更新所有僵尸位置与状态
   * @param {number} dt - 帧间隔(ms)
   * @param {Function} onReachEnd - 僵尸到达终点回调 (zombie) => void
   */
  update(dt, onReachEnd) {
    // 1. 尝试生成
    const spawnCfg = this.spawner.update(dt, this.zombies.length);
    if (spawnCfg) {
      const z = this.pool.acquire(createZombie(
        spawnCfg.type, spawnCfg.pathIndex, spawnCfg.baseSpeed
      ));
      if (z) this.zombies.push(z);
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
