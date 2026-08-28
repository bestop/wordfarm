// utils/plantManager.js - 植物武器系统管理器
// 负责: 植物对象池、投射物对象池、网格放置、攻击/产阳光/投射物飞行与碰撞
// 植物6种: sunflower(向日葵) / shooter(豌豆射手) / wall(坚果) / freezer(寒冰射手) / cherry(樱桃炸弹) / chomper(食人花)

const { PLANT_TYPES, GRID, PROJECTILE, SUNLIGHT } = require('./constants.js');
const { pathManager } = require('./pathManager.js');

let __plantIdSeed = 1;
let __projIdSeed = 1;
let __sunIdSeed = 1;  // 收集阳光对象 id 生成器
const SUN_MAX_ACTIVE = 10;          // 同屏阳光上限，防止无限堆积
const SUN_LIFETIME_MS = 10000;      // 阳光未被收集的寿命（10s）
const SUN_COLLECT_WNDOW = 320;      // 收集动画持续时长(ms)

/**
 * 植物管理器
 * 植物与投射物均用数组管理（数量有上限，无需复杂对象池）
 */
class PlantManager {
  constructor() {
    this.plants = [];          // 活跃植物数组
    this.projectiles = [];     // 活跃投射物数组
    this.suns = [];            // v3: 可收集阳光数组（向日葵产出）
    this.version = 0;          // v3: suns 变更版本号，便于页面对比是否需要刷新
  }

  /**
   * 重置（新游戏）
   */
  reset() {
    this.plants = [];
    this.projectiles = [];
    this.suns = [];
    this.version++;
  }

  /**
   * 计算植物所在槽位的路径进度（与僵尸 progress 同坐标系）
   * @param {number} slot
   * @returns {number} 0~1
   */
  static slotToProgress(slot) {
    return (slot + 0.5) / GRID.COLS;
  }

  /**
   * 查找指定格子的植物
   * @param {number} lane
   * @param {number} slot
   * @returns {Object|null}
   */
  getPlantAt(lane, slot) {
    return this.plants.find(p => p.active && p.lane === lane && p.slot === slot &&
      p.state !== 'dead') || null;
  }

  getPlantById(id) {
    return this.plants.find(p => p.id === id) || null;
  }

  /**
   * 放置植物
   * @param {string} type - PLANT_TYPES 键名
   * @param {number} lane
   * @param {number} slot
   * @returns {Object} {ok, plant, cost, reason}
   */
  placePlant(type, lane, slot) {
    const def = PLANT_TYPES[type];
    if (!def) return { ok: false, reason: '未知植物' };
    if (lane < 0 || lane >= GRID.ROWS || slot < 0 || slot >= GRID.COLS) {
      return { ok: false, reason: '位置越界' };
    }
    if (this.getPlantAt(lane, slot)) {
      return { ok: false, reason: '该格已有植物' };
    }
    const pos = pathManager.getGridCellCenter(lane, slot);
    const plant = {
      id: __plantIdSeed++,
      type: type,
      def: def,
      lane: lane,
      slot: slot,
      x: pos.x,
      y: pos.y,
      health: def.health,
      maxHealth: def.health,
      attackCooldown: def.attackInterval ? def.attackInterval * 0.5 : 0,
      sunCooldown: def.sunInterval || 0,
      state: 'idle',          // idle / dead
      stateTimer: 0,
      hitFlash: 0,
      wobble: Math.random() * Math.PI * 2,
      active: true,
      // 樱桃炸弹引信字段
      fuseTimer: def.isExplosive ? def.fuseTime : 0,
      exploded: false,
      // 食人花状态机：idle(待机) → snap(咬合攻击) → swallow(吞咽消化) → idle
      chomperState: def.isChomper ? 'idle' : null,   // idle | snap | swallow
      chomperTimer: 0,                                 // 当前状态剩余时长(ms)
      chomperBiteProgress: 0,                          // 咬合动画进度 0~1(张口→咬合)
      chomperSwallowProgress: 0                        // 吞咽鼓起进度 0~1
    };
    this.plants.push(plant);
    return { ok: true, plant: plant, cost: def.cost };
  }

  /**
   * 植物受击（被僵尸啃）
   * @param {Object} plant
   * @param {number} amount
   * @returns {Object} {died: boolean, isBase: boolean, lane: number}
   *   v2: 返回对象而非布尔值，携带基地植物被毁信息
   */
  takeDamage(plant, amount) {
    if (!plant || plant.state === 'dead') return { died: false, isBase: false, lane: -1 };
    plant.health -= amount;
    plant.hitFlash = 180;
    if (plant.health <= 0) {
      plant.health = 0;
      plant.state = 'dead';
      return { died: true, isBase: !!plant.isBase, lane: plant.lane };
    }
    return { died: false, isBase: false, lane: -1 };
  }

  /**
   * 每帧更新植物与投射物
   * @param {number} dt - 帧间隔(ms)
   * @param {Object} ctx - {
   *   getZombiesInLane: (lane)=>[],
   *   onHitZombie: (zombie, projectile)=>void,
   *   onPlantExplode: (plant)=>void   v2 樱桃炸弹爆炸回调
   * }
   * @returns {number} 本帧植物产出的阳光总量
   */
  update(dt, ctx) {
    let sunlightProduced = 0;
    const dtSec = dt / 1000;

    // 1. 更新植物
    for (let i = this.plants.length - 1; i >= 0; i--) {
      const p = this.plants[i];
      if (!p.active || p.state === 'dead') {
        this.plants.splice(i, 1);
        continue;
      }
      p.wobble += dtSec * 3;
      if (p.hitFlash > 0) p.hitFlash -= dt;

      const def = p.def;

      // v2 樱桃炸弹引信倒计时
      if (def.isExplosive && !p.exploded) {
        p.fuseTimer -= dt;
        if (p.fuseTimer <= 0) {
          p.exploded = true;
          p.state = 'dead';   // 爆炸后植物消失
          if (ctx.onPlantExplode) ctx.onPlantExplode(p);
          continue;  // 跳过后续攻击逻辑（已爆炸）
        }
        // 引信中不执行攻击
        continue;
      }

      // 攻击型植物：射击
      if (def.attackInterval > 0 && def.projectile) {
        p.attackCooldown -= dt;
        if (p.attackCooldown <= 0) {
          const target = this._findTarget(p, ctx.getZombiesInLane);
          if (target) {
            this._spawnProjectile(p, def.projectile);
            p.attackCooldown = def.attackInterval;
          } else {
            // 无目标时短冷却再检查，避免空转
            p.attackCooldown = 200;
          }
        }
      }

      // 食人花：近战攻击（有范围近战，不发射投射物，需咀嚼CD）
      if (def.isChomper) {
        this._updateChomper(p, dt, ctx);
      }

      // 产阳光植物：按 sunInterval 间隔生成可收集阳光
      if (def.sunInterval > 0) {
        p.sunCooldown -= dt;
        if (p.sunCooldown <= 0) {
          // 同屏阳光上限保护：超过上限时改为直接入账（防止玩家不点收藏导致不产阳光）
          const activeSuns = this.suns.filter(s => !s.collected).length;
          if (activeSuns < SUN_MAX_ACTIVE) {
            this._spawnSun(p.x, p.y - 20, def.sunProduce);
          } else {
            sunlightProduced += def.sunProduce;
          }
          p.sunCooldown = def.sunInterval;
        }
      }
    }

    // 1.5 更新可收集阳光（生命周期、飘动、自动消失）
    for (let i = this.suns.length - 1; i >= 0; i--) {
      const s = this.suns[i];
      s.t += dt;
      // 飘动：基于 sin 的上下浮动 + 轻微左右摆动
      const u = s.t / 1000;
      s.offsetX = Math.sin(u * 1.4 + s.phase) * 8;
      s.offsetY = Math.sin(u * 2.1 + s.phase) * 6;
      if (s.collected) {
        // 已收集：飘入 HUD（向屏幕左上 0,0 方向靠拢），动画结束则删除
        if (s.t >= s.collectAt + SUN_COLLECT_WNDOW) {
          this.suns.splice(i, 1);
          this.version++;
        }
      } else if (s.t >= SUN_LIFETIME_MS) {
        // 超时未收集：直接入账并回收（避免损失阳光造成玩家挫败）
        sunlightProduced += s.value;
        this.suns.splice(i, 1);
        this.version++;
      }
    }

    // 2. 更新投射物
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      if (!pr.active) {
        this.projectiles.splice(i, 1);
        continue;
      }
      pr.y += pr.vy * dtSec;   // vy 为负，向上飞行
      // 飞出网格顶部回收
      const top = pathManager.getGridTop();
      if (pr.y < top - 20) {
        pr.active = false;
        this.projectiles.splice(i, 1);
        continue;
      }
      // 碰撞检测：基于僵尸半径 + 炮弹半径的圆形判定
      const laneZombies = ctx.getZombiesInLane(pr.lane);
      const projDef = pr.def || {};
      // v2 火焰穿透：命中后不消失，记录已命中目标避免重复伤害
      const isPierce = !!projDef.pierce;
      let hit = false;
      for (const z of laneZombies) {
        // 跳过已命中过的僵尸（穿透模式）
        if (isPierce && pr.hitTargets && pr.hitTargets.includes(z.id)) continue;
        const zpos = pathManager.getPosition(z.pathIndex, z.progress);
        const dx = pr.x - zpos.x;
        const dy = pr.y - zpos.y;
        const hitR = z.radius + pr.radius;
        if (dx * dx + dy * dy < hitR * hitR) {
          if (ctx.onHitZombie) ctx.onHitZombie(z, pr);
          if (isPierce) {
            // 穿透：记录命中目标，减少剩余穿透次数
            if (!pr.hitTargets) pr.hitTargets = [];
            pr.hitTargets.push(z.id);
            pr.pierceCount = (pr.pierceCount || 0) + 1;
            if (pr.pierceCount >= (projDef.pierceMax || 3)) {
              // 达到穿透上限，回收
              pr.active = false;
              hit = true;
              break;
            }
            // 继续飞行，不回收
          } else {
            // 普通投射物：命中即消失
            pr.active = false;
            hit = true;
            break;
          }
        }
      }
      if (hit) {
        this.projectiles.splice(i, 1);
      }
    }

    return sunlightProduced;
  }

  /**
   * 查找植物攻击目标：同车道内 progress < 植物进度 的最近僵尸(来袭方向)
   * @param {Object} plant
   * @param {Function} getZombiesInLane
   * @returns {Object|null}
   */
  _findTarget(plant, getZombiesInLane) {
    const plantProgress = PlantManager.slotToProgress(plant.slot);
    const zombies = getZombiesInLane(plant.lane);
    let target = null;
    for (const z of zombies) {
      // 仅攻击位于植物上方(进度更小)的来袭僵尸
      if (z.progress < plantProgress - 0.01) {
        if (!target || z.progress > target.progress) {
          target = z;  // 取最接近植物的(进度最大)
        }
      }
    }
    return target;
  }

  /**
   * 食人花状态机更新：待机 → 咬合 → 吞咽 → 待机
   * 近战规则：当僵尸进入其前方 range 范围内，触发咬合；咬合完成后进入吞咽期
   */
  _updateChomper(p, dt, ctx) {
    const def = p.def;
    const SNAP_DURATION = 300;
    const swallowTime = def.swallowTime || 3000;

    if (p.chomperTimer > 0) p.chomperTimer -= dt;

    switch (p.chomperState) {
      case 'snap': {
        const elapsed = SNAP_DURATION - Math.max(0, p.chomperTimer);
        p.chomperBiteProgress = Math.min(1, elapsed / SNAP_DURATION);

        if (!p._biteDealt && elapsed >= SNAP_DURATION * 0.55) {
          p._biteDealt = true;
          const target = this._findMeleeTarget(p, ctx.getZombiesInLane);
          if (target && ctx.onChomperBite) {
            ctx.onChomperBite(p, target, def.damage);
          }
        }

        if (p.chomperTimer <= 0) {
          p.chomperState = 'swallow';
          p.chomperTimer = p._biteDealt ? swallowTime : 500;
          p.chomperBiteProgress = 0;
          p._biteDealt = false;
          p.chomperSwallowProgress = 0;
        }
        break;
      }

      case 'swallow': {
        const total = p._swallowTotal || swallowTime;
        const elapsed = total - Math.max(0, p.chomperTimer);
        const u = elapsed / total;
        p.chomperSwallowProgress = Math.sin(Math.max(0, Math.min(1, u)) * Math.PI);

        if (p.chomperTimer <= 0) {
          p.chomperState = 'idle';
          p.chomperSwallowProgress = 0;
        }
        break;
      }

      case 'idle':
      default: {
        p.attackCooldown -= dt;
        if (p.attackCooldown <= 0) {
          const target = this._findMeleeTarget(p, ctx.getZombiesInLane);
          if (target) {
            p.chomperState = 'snap';
            p.chomperTimer = SNAP_DURATION;
            p.chomperBiteProgress = 0;
            p._biteDealt = false;
            p._swallowTotal = swallowTime;
          } else {
            p.attackCooldown = 150;
          }
        }
        break;
      }
    }
  }

  /**
   * 食人花近战目标查找：同车道内 progress 在植物「正前方」range 范围内
   * 与射手不同：必须非常接近植物（diff <= range + 0.02 的缓冲区）
   */
  _findMeleeTarget(plant, getZombiesInLane) {
    const def = plant.def;
    const range = def.range || 0.08;
    const plantProgress = PlantManager.slotToProgress(plant.slot);
    const zombies = getZombiesInLane(plant.lane);
    let target = null;
    for (const z of zombies) {
      const diff = plantProgress - z.progress;
      if (diff >= -0.01 && diff <= range + 0.02) {
        if (!target || z.progress > target.progress) {
          target = z;
        }
      }
    }
    return target;
  }

  /**
   * 生成投射物
   * v2: 携带 def 信息以支持火焰穿透
   */
  _spawnProjectile(plant, projDef) {
    const slow = projDef.slow || null;
    this.projectiles.push({
      id: __projIdSeed++,
      lane: plant.lane,
      x: plant.x,
      y: plant.y - 10,         // 略偏上发射
      vy: -projDef.speed,      // 负值=向上
      damage: plant.def.damage,
      type: projDef.type,      // 'normal' | 'ice' | 'fire'
      slow: slow,
      color: projDef.color,
      radius: projDef.radius,
      def: projDef,            // v2: 保留完整 def 供穿透判定
      hitTargets: [],          // v2: 已命中目标列表（穿透用）
      pierceCount: 0,          // v2: 已穿透次数
      active: true
    });
  }

  /**
   * 获取所有植物（渲染用）
   */
  getPlants() {
    return this.plants;
  }

  /**
   * 获取所有投射物（渲染用）
   */
  getProjectiles() {
    return this.projectiles;
  }

  /**
   * v3: 生成可收集阳光（向日葵产阳光调用）
   * 从植物上方浮现一小段初速度后自由飘动
   */
  _spawnSun(x, y, value) {
    this.suns.push({
      id: __sunIdSeed++,
      x: x,                     // canvas 内像素 X（绝对）
      y: y,                     // canvas 内像素 Y（绝对）
      originY: y,
      value: value || 25,
      t: 0,                     // 生命时长(ms)
      phase: Math.random() * Math.PI * 2,  // 飘动随机相位
      offsetX: 0,
      offsetY: 0,
      collected: false,
      collectAt: 0,
      spawnVersion: this.version
    });
    this.version++;
  }

  /**
   * v3: 获取所有可收集阳光（用于页面展示与点击收集）
   */
  getSuns() {
    return this.suns;
  }

  /**
   * v3: 版本号，用于页面判断是否需要 setData 刷新
   */
  getSunVersion() {
    return this.version;
  }

  /**
   * v3: 玩家点击收集阳光
   * @param {number} id
   * @returns {{ok: boolean, value: number, sun: Object | null}}
   */
  collectSun(id) {
    const s = this.suns.find(x => x.id === id && !x.collected);
    if (!s) return { ok: false, value: 0, sun: null };
    s.collected = true;
    s.collectAt = s.t;
    // 回收保证：若超过 2× 动画仍在数组中（异常），下次 update 强制删
    this.version++;
    return { ok: true, value: s.value, sun: s };
  }

  /**
   * 清理
   */
  clear() {
    this.plants = [];
    this.projectiles = [];
    this.suns = [];
    this.version++;
  }
}

const plantManager = new PlantManager();

module.exports = {
  plantManager,
  PlantManager
};
