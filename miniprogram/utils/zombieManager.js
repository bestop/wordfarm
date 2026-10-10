// utils/zombieManager.js - 僵尸系统管理器
// 包含: 僵尸对象池、生成管理、移动算法、生命值、状态机、减速/加速 buff、v49 舞王召唤、v51 僵尸王终局大波
// 注: 僵尸不再绑定题目，由植物投射物击杀；答错触发全场加速

const { ZOMBIE_TYPES, ZOMBIE_TYPE_WEIGHTS, PERFORMANCE, COMBAT, LEVEL, ZOMBIE } = require('./constants.js');
const { pathManager } = require('./pathManager.js');

let __zombieIdSeed = 1;

/**
 * 创建僵尸对象
 * @param {string} type - ZOMBIE_TYPES 键名
 * @param {number} pathIndex - 车道索引(=lane)
 * @param {number} baseSpeed - 基础速度(像素/秒)
 * @param {number} [hpMult] - v31: 关卡血量倍率（ZombieSpawner.applyLevelRamp 计算，缺省 1）
 * @returns {Object} 僵尸对象
 */
function createZombie(type, pathIndex, baseSpeed, hpMult) {
  const def = ZOMBIE_TYPES[type] || ZOMBIE_TYPES.bucket;
  const pathLen = pathManager.getPathLength(pathIndex) || 1;
  // v31: 血量 = baseHealth × 关卡倍率（Math.max 兜底：低关四舍五入不低于基础值）
  const hp = Math.max(def.baseHealth, Math.round(def.baseHealth * (hpMult || 1)));
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
    health: hp,
    maxHealth: hp,
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
    summonTimer: def.type === 'dancer' ? ZOMBIE.DANCER_SUMMON_DELAY_MS : 0,  // v49: 舞王召唤倒计时(首次=上场延迟, 之后=冷却)
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
    // v6 修复 (Task 9 F2): 强制释放前回调，让持有者同步从 zombies 数组移除，
    //  避免同一对象在数组中两个索引位置（每帧被处理 2 次）
    this.onForceRelease = null;
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
      boostMult: 1, boostTimer: 0, blockedBy: null, attackCooldown: 0, summonTimer: 0, active: false
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
      // v6 修复 (Task 9 F2): 强制释放前先通知持有者从外部数组移除，
      //  否则 release 把对象重新塞回 pool 后再 acquire，会在 zombies 数组中产生两个索引
      const first = this.active.values().next().value;
      if (first) {
        if (this.onForceRelease) this.onForceRelease(first);
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
   * v6 修复 (Task 9 F4): 与 release 一致，加 POOL_MAX 上限检查，
   *  防止重开游戏时 pool 临时超过 30（重复重开后无限增长）
   */
  clearAll() {
    for (const z of this.active) {
      z.active = false;
      z.blockedBy = null;
      if (this.pool.length < PERFORMANCE.POOL_MAX) {
        this.pool.push(z);
      }
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
    // v6 修复 (Task 12): 默认值 → ZOMBIE.* 集中常量
    this.spawnInterval = ZOMBIE.SPAWN_INTERVAL_DEFAULT_MS;
    this.baseSpeed = ZOMBIE.BASE_SPEED_DEFAULT;
    this.maxZombies = ZOMBIE.MAX_ZOMBIES_DEFAULT;
    this.typeWeights = ZOMBIE_TYPE_WEIGHTS.junior;      // v50: middle→junior
    // v2: 保存基础参数（关卡递增的基准）
    this._baseSpawnInterval = ZOMBIE.SPAWN_INTERVAL_DEFAULT_MS;
    this._baseBaseSpeed = ZOMBIE.BASE_SPEED_DEFAULT;
    this._baseTypeWeights = ZOMBIE_TYPE_WEIGHTS.junior; // v50: middle→junior
    this._currentLevel = 1;
    this._hpMult = 1;                  // v31: 当前等级血量倍率（applyLevelRamp 刷新）
    this._spawnStopped = false;        // v38: 末关收官标记（stopSpawn 置位，configure 重置）
    // v4: 僵尸生成健康监测
    this._lastSpawnTime = 0;       // 上次成功生成时间戳(ms)
    this._totalSpawned = 0;        // 累计生成数
    this._spawnFailCount = 0;      // 连续生成失败计数（acquire返回null）
  }

  /**
   * 配置生成器
   * @param {Object} cfg - 来自 DIFFICULTY_CONFIG
   * @param {string} difficulty - primary / junior / senior / ket / pet / custom（v50）
   */
  configure(cfg, difficulty) {
    this.spawnInterval = cfg.spawnInterval;
    this.baseSpeed = cfg.baseSpeed;
    this.maxZombies = cfg.maxZombies;
    this.typeWeights = ZOMBIE_TYPE_WEIGHTS[difficulty] || ZOMBIE_TYPE_WEIGHTS.junior;  // v50: 兜底 junior
    this.spawnTimer = 0;
    // v2: 保存基础参数
    this._baseSpawnInterval = cfg.spawnInterval;
    this._baseBaseSpeed = cfg.baseSpeed;
    this._baseTypeWeights = { ...this.typeWeights };
    this._currentLevel = 1;
    this._hpMult = 1;                  // v31: 新游戏重置血量倍率
    this._spawnStopped = false;        // v38: 末关收官标记重置（新游戏恢复生成）
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
    // v31: 血量递增 — 每关 +HEALTH_PER_LEVEL，封顶 ZOMBIE.HEALTH_RAMP_CAP
    this._hpMult = Math.min(ZOMBIE.HEALTH_RAMP_CAP, 1 + (r.HEALTH_PER_LEVEL || 0) * (lv - 1));
    // v6 修复 (Task 12): 阈值 → ZOMBIE.* 集中常量
    const intervalMult = Math.pow(r.SPAWN_INTERVAL_MULT, lv - 1);
    this.spawnInterval = Math.max(ZOMBIE.SPAWN_INTERVAL_MIN_MS, this._baseSpawnInterval * intervalMult);
    // 速度递增
    const speedMult = Math.pow(r.SPEED_MULT, lv - 1);
    this.baseSpeed = this._baseBaseSpeed * speedMult;
    // football+dancer 概率递增（从 bucket 中转移）
    const bonus = Math.min(ZOMBIE.TOUGH_BONUS_CAP, r.TOUGH_PROB_BONUS * (lv - 1));
    this.typeWeights = this._adjustWeights(this._baseTypeWeights, bonus);
  }

  /**
   * v38: 末关收官 — 停止一切生成
   * 心跳强制释放同步停用（否则收官期名额满时会「回收」存活僵尸，
   * 破坏「清完场上存量」的收官语义）
   */
  stopSpawn() {
    this._spawnStopped = true;
  }

  /**
   * 调整类型权重：从 bucket 中转移概率给 football+dancer
   * @param {Object} base - 基础权重
   * @param {number} bonus - 转移量
   * @returns {Object} 调整后的权重
   */
  _adjustWeights(base, bonus) {
    const w = { ...base };
    // v6 修复 (Task 12): bucket 权重下限 → ZOMBIE.BUCKET_WEIGHT_FLOOR
    w.bucket = Math.max(ZOMBIE.BUCKET_WEIGHT_FLOOR, (w.bucket || 0) - bonus);
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
   * @param {number} dt - 帧间隔(ms)
   * @param {number} activeCount - 当前活跃数
   * @returns {Object|null} 新僵尸配置 {type, pathIndex, baseSpeed} or null
   */
  update(dt, activeCount) {
    if (this._spawnStopped) return null;   // v38: 末关收官，不再生成
    this.spawnTimer += dt;
    const now = Date.now();
    // v44 强度模型统一: 删 60s 时间窗递增 — interval 只由关卡 ramp(applyLevelRamp)
    //   决定, 同关恒定; MIN 钳制保留(防 cfg 直配值低于下限)
    const interval = Math.max(ZOMBIE.SPAWN_INTERVAL_MIN_MS, this.spawnInterval);

    // 常规生成 + 超时强制
    const overshoot = this.spawnTimer >= interval * ZOMBIE.OVERSHOOT_MULT;
    const canSpawn = activeCount < this.maxZombies;

    // v4: 心跳检测 — 超过 HEARTBEAT_STALL_MS 未生成任何僵尸（含 acquire 失败），强制清理一个最早僵尸释放名额
    const noSpawnDuration = now - this._lastSpawnTime;
    const heartbeatStall = noSpawnDuration > ZOMBIE.HEARTBEAT_STALL_MS && activeCount >= this.maxZombies;

    if ((this.spawnTimer >= interval || overshoot) && canSpawn) {
      this.spawnTimer = overshoot ? 0 : (this.spawnTimer - interval);
      const type = this._rollType();
      const pathIndex = Math.floor(Math.random() * pathManager.getPathCount());
      this._lastSpawnTime = now;
      this._totalSpawned++;
      return { type, pathIndex, baseSpeed: this.baseSpeed, hpMult: this._hpMult };  // v44: speedMult 随时间窗退役
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
    // v51: 终局大波队列 — launchFinalWave 填充, update 按节奏释放
    this._waveQueue = null;    // null=无大波; [{type, lane, hpMult}] 待入场
    this._waveTimer = 0;       // 下一只入场倒计时(ms)
    // v60: 中场僵尸波队列 — 第 3/6 关开局压场（独立于终局大波, 不参与胜利判定）
    this._midWaveQueue = null; // null=无中场波; [{type, lane, hpMult}] 待入场
    this._midWaveTimer = 0;    // 中场波下一只入场倒计时(ms)
    // v6 修复 (Task 9 F2): pool 兜底强制释放时同步从 zombies 数组移除，
    //  避免同一对象在数组中两个索引位置（每帧被处理 2 次）
    this.pool.onForceRelease = (z) => {
      const idx = this.zombies.indexOf(z);
      if (idx >= 0) this.zombies.splice(idx, 1);
    };
  }

  /**
   * 重置（新游戏）
   */
  reset(cfg, difficulty) {
    this.pool.clearAll();
    this.zombies = [];
    this._waveQueue = null;    // v51: 清终局大波残留（防上局未放完的队列泄入新局）
    this._waveTimer = 0;
    this._midWaveQueue = null;   // v60: 清中场波残留（同上, 防泄入新局）
    this._midWaveTimer = 0;
    this.spawner.configure(cfg, difficulty);
  }

  /**
   * v2 关卡递增（转发给 spawner）
   */
  applyLevelRamp(level, rampCfg) {
    this.spawner.applyLevelRamp(level, rampCfg);
  }

  /**
   * v38: 末关停止生成（转发给 spawner）
   */
  stopSpawn() {
    this.spawner.stopSpawn();
  }

  /**
   * v51: 僵尸王终局大波 — 王率先入场 + LEVEL.KING_WAVE_ESCORTS 只护卫按节奏跟上
   * 由 gameManager 进入末关时调用（常规生成已 stopSpawn, 大波是收官唯一新内容）
   * - 王: 随机车道, hpMult 恒 1（血量恒 32, 不随难度/关卡漂移 → 全档一致的压轴挑战）
   * - 护卫: 类型按 spawner 当前权重抽取(末关 football/dancer 占比高), 血量用当前
   *   hpMult(与常规生成同源); 车道轮转 + offset 随机 → 每道恰 3 只, 均衡压场
   * - 不受 spawner.maxZombies 配额限制(压力事件定位, 同 v49 召唤惯例), 硬上限 POOL_MAX 兜底
   * @returns {number} 队列总长（1 王 + N 护卫）
   */
  launchFinalWave() {
    const lanes = pathManager.getPathCount();
    const queue = [{
      type: 'king',
      lane: Math.floor(Math.random() * lanes),
      hpMult: 1
    }];
    const offset = Math.floor(Math.random() * lanes);
    for (let i = 0; i < LEVEL.KING_WAVE_ESCORTS; i++) {
      queue.push({
        type: this.spawner._rollType(),
        lane: (i + offset) % lanes,
        hpMult: this.spawner._hpMult
      });
    }
    this._waveQueue = queue;
    this._waveTimer = 0;   // 首帧立即放王
    return queue.length;
  }

  /**
   * v51: 终局大波是否已全部入场（无队列或已放完）
   * 胜利判定守卫 — 防止玩家在护卫队列放完前清空场上存量而提前通关
   */
  isFinalWaveDone() {
    return !this._waveQueue || this._waveQueue.length === 0;
  }

  /**
   * v60: 中场僵尸波 — LEVEL.MID_WAVES 关开局的一波快速压场（独立于终局大波）
   * 由 gameManager 关卡推进时调用（常规生成照常, 中场波是额外压力事件）;
   * toast 预警由页面 onLevelChange 负责, 此处只管队列与入场节奏
   * - 类型按 spawner 当前权重抽取（与常规/终局大波同源, 关卡 ramp 自动生效）
   * - 车道轮转 + offset 随机 → 波内均衡压场; 不受 maxZombies 配额限制
   *   （压力事件定位, 同终局大波/舞王召唤惯例）, 硬上限 POOL_MAX 兜底
   * - 首只延迟 MID_WAVE_WARN_MS（预警窗口）, 之后按 MID_WAVE_STAGGER_MS 节奏入场
   * @returns {number} 队列总长
   */
  launchMidWave() {
    const lanes = pathManager.getPathCount();
    const queue = [];
    const offset = Math.floor(Math.random() * lanes);
    for (let i = 0; i < LEVEL.MID_WAVE_SIZE; i++) {
      queue.push({
        type: this.spawner._rollType(),
        lane: (i + offset) % lanes,
        hpMult: this.spawner._hpMult
      });
    }
    this._midWaveQueue = queue;
    this._midWaveTimer = LEVEL.MID_WAVE_WARN_MS;   // 首只延迟 = 预警窗口
    return queue.length;
  }

  /**
   * 每帧更新所有僵尸位置与状态
   * @param {number} dt - 帧间隔(ms)
   * @param {Function} onReachEnd - 僵尸到达终点回调 (zombie) => void
   * @param {Function} [onSummon] - v49 舞王召唤回调 (intent, minions) => void（粒子/振动反馈）
   */
  update(dt, onReachEnd, onSummon) {
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
          spawnCfg.type, spawnCfg.pathIndex, spawnCfg.baseSpeed, spawnCfg.hpMult
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

    // 1.5 v51: 终局大波按节奏入场 — 与常规生成解耦(spawner 停止后仍生效),
    //   队列对象 push 进 this.zombies 后由下方状态机/渲染/战斗链路自动接管
    if (this._waveQueue && this._waveQueue.length > 0) {
      this._waveTimer -= dt;
      if (this._waveTimer <= 0) {
        const entry = this._waveQueue.shift();
        const z = this.pool.acquire(createZombie(
          entry.type, entry.lane, this.spawner.baseSpeed, entry.hpMult
        ));
        if (z) {
          this.zombies.push(z);
        } else {
          // pool 满兜底: 丢弃该护卫不阻塞队列（现实并发: 场上+队列 > POOL_MAX 30 极罕见）
          console.warn('[ZombieManager] 终局大波入场失败(pool 满), 丢弃 type=' + entry.type);
        }
        this._waveTimer = LEVEL.KING_WAVE_STAGGER_MS;
      }
    }

    // 1.6 v60: 中场僵尸波按节奏入场 — 与终局大波同模式但独立队列;
    //   首只经 MID_WAVE_WARN_MS 预警窗口后入场, 不影响常规生成与胜利判定
    if (this._midWaveQueue && this._midWaveQueue.length > 0) {
      this._midWaveTimer -= dt;
      if (this._midWaveTimer <= 0) {
        const entry = this._midWaveQueue.shift();
        const z = this.pool.acquire(createZombie(
          entry.type, entry.lane, this.spawner.baseSpeed, entry.hpMult
        ));
        if (z) {
          this.zombies.push(z);
        } else {
          console.warn('[ZombieManager] 中场波入场失败(pool 满), 丢弃 type=' + entry.type);
        }
        this._midWaveTimer = LEVEL.MID_WAVE_STAGGER_MS;
      }
    }

    // 2. 更新每个僵尸
    const dtSec = dt / 1000;
    // v49: 舞王召唤意图 — 循环内只收集, 循环外统一结算
    //   (pool.acquire 名额满时会强制回收最早僵尸并 splice this.zombies,
    //    倒序循环内执行会打乱后续迭代索引 → 重复/漏更新)
    const summonIntents = [];
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
      // v49: 舞王召唤倒计时 — 仅 walking 状态跳动(被植物挡住啃食时停跳,
      //  玩家可用肉盾卡位压制召唤 — 反制窗口); 命中冷却点先记意图
      if (z.type === 'dancer' && z.state === 'walking') {
        z.summonTimer -= dt;
        if (z.summonTimer <= 0) {
          z.summonTimer = ZOMBIE.DANCER_SUMMON_COOLDOWN_MS;   // 再次召唤需冷却
          summonIntents.push({ dancer: z, lane: z.pathIndex,
            progress: Math.max(0, z.progress - ZOMBIE.DANCER_SUMMON_BACK) });
        }
      }

      // 状态机
      if (z.state === 'walking') {
        const effSpeed = z.speed * z.slowFactor * z.boostMult;
        z.progress += effSpeed * dtSec;
        // v6 修复 (Task 12): 摇摆速度 → ZOMBIE.WOBBLE_SPEED_*
        z.wobble += dtSec * ZOMBIE.WOBBLE_SPEED_WALKING;
        if (z.progress >= 1) {
          z.progress = 1;
          z.state = 'reached';
          if (onReachEnd) onReachEnd(z);
          z.state = 'dying';
          z.stateTimer = 0;
        }
      } else if (z.state === 'eating') {
        // 啃食中不前进，仅摇摆动画
        z.wobble += dtSec * ZOMBIE.WOBBLE_SPEED_EATING;
        // 由 gameManager._resolveZombiePlantCombat 负责造成伤害与解除阻塞
      } else if (z.state === 'dying') {
        z.stateTimer += dt;
        // v6 修复 (Task 12): 死亡时长 → ZOMBIE.DYING_DURATION_MS（与 renderer _drawZombie 同步）
        if (z.stateTimer > ZOMBIE.DYING_DURATION_MS) {
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

    // v49: 结算舞王召唤(循环外执行, 理由见 summonIntents 声明处注释)
    if (summonIntents.length > 0) this._resolveDancerSummons(summonIntents, onSummon);
  }

  /**
   * v49: 舞王召唤结算 — 每条邻路生成 1 只伴舞小鬼
   * 舞王 lane 0 → [1]; lane 1 → [0,2]; lane 2 → [1]（本路不出 — 舞王自己在）
   * 召唤物速度/血量倍率取 spawner 当前值(与常规生成同源, 关卡递增自动生效);
   * 不受 spawner.maxZombies 配额限制(压力技能定位), 硬上限由 pool POOL_MAX 兜底
   * @param {Array} intents - [{dancer, lane, progress}] 循环内收集的意图
   * @param {Function} [onSummon] - (intent, minions) => void 反馈回调
   */
  _resolveDancerSummons(intents, onSummon) {
    for (const intent of intents) {
      const minions = [];
      for (const lane of this._summonLanes(intent.lane)) {
        const m = this.pool.acquire(createZombie(
          ZOMBIE.DANCER_SUMMON_TYPE, lane, this.spawner.baseSpeed, this.spawner._hpMult
        ));
        if (m) {
          m.progress = intent.progress;
          this.zombies.push(m);
          minions.push(m);
        }
      }
      if (minions.length > 0 && onSummon) onSummon(intent, minions);
    }
  }

  /**
   * v49: 舞王召唤覆盖的邻路(左右各一条, 仅存在的车道)
   */
  _summonLanes(lane) {
    const lanes = [];
    if (lane - 1 >= 0) lanes.push(lane - 1);
    if (lane + 1 < pathManager.getPathCount()) lanes.push(lane + 1);
    return lanes;
  }

  /**
   * 获取所有活跃僵尸（渲染用）
   */
  getAll() {
    return this.zombies;
  }

  // v6 修复 (Task 11 F8): 删除零调用 findById 方法

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
    // v6 修复 (Task 12): 受击闪烁时长 → ZOMBIE.HIT_FLASH_MS（与 renderer _drawZombie 闪烁除数耦合）
    zombie.hitFlash = ZOMBIE.HIT_FLASH_MS;
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
   * v60: 全场僵尸临时减速（连击里程碑「寒冰脉冲」奖励）
   * 镜像 applyGlobalSpeedBoost; 叠加规则与 takeDamage 减速一致：
   * 取更强的减速（factor 更小者）, 时长取 max — 与寒冰射手弹可叠加共存
   * @param {number} factor - 减速因子（如 0.25 = 速度降至 25%）
   * @param {number} duration - 持续时长(ms)
   */
  applyGlobalSlow(factor, duration) {
    for (const z of this.zombies) {
      if (z.state === 'walking' || z.state === 'eating') {
        if (z.slowTimer <= 0 || factor < z.slowFactor) {
          z.slowFactor = factor;
        }
        z.slowTimer = Math.max(z.slowTimer, duration);
      }
    }
  }

  // v6 修复 (Task 11 F8): 删除零调用 kill 方法（kill 仍是半成品 API，调用方从未存在）

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
