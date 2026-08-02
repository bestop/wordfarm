// utils/plantManager.js - 植物武器系统管理器
// 负责: 植物对象池、投射物对象池、网格放置、攻击/产阳光/投射物飞行与碰撞
// 植物4种: shooter(豌豆射手) / sunflower(向日葵) / wall(坚果墙) / freezer(寒冰射手)

const { PLANT_TYPES, GRID, PROJECTILE, SUNLIGHT } = require('./constants.js');
const { pathManager } = require('./pathManager.js');

let __plantIdSeed = 1;
let __projIdSeed = 1;

/**
 * 植物管理器
 * 植物与投射物均用数组管理（数量有上限，无需复杂对象池）
 */
class PlantManager {
  constructor() {
    this.plants = [];          // 活跃植物数组
    this.projectiles = [];     // 活跃投射物数组
  }

  /**
   * 重置（新游戏）
   */
  reset() {
    this.plants = [];
    this.projectiles = [];
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
      attackCooldown: def.attackInterval ? def.attackInterval * 0.5 : 0, // 首发减半等待
      sunCooldown: def.sunInterval || 0,
      state: 'idle',          // idle / dead
      stateTimer: 0,
      hitFlash: 0,
      wobble: Math.random() * Math.PI * 2,
      active: true
    };
    this.plants.push(plant);
    return { ok: true, plant: plant, cost: def.cost };
  }

  /**
   * 植物受击（被僵尸啃）
   * @param {Object} plant
   * @param {number} amount
   * @returns {boolean} 是否死亡
   */
  takeDamage(plant, amount) {
    if (!plant || plant.state === 'dead') return false;
    plant.health -= amount;
    plant.hitFlash = 180;
    if (plant.health <= 0) {
      plant.health = 0;
      plant.state = 'dead';
      return true;
    }
    return false;
  }

  /**
   * 每帧更新植物与投射物
   * @param {number} dt - 帧间隔(ms)
   * @param {Object} ctx - { getZombiesInLane: (lane)=>[], onHitZombie: (zombie, projectile)=>void }
   * @returns {number} 本帧向日葵产出的阳光总量
   */
  update(dt, ctx) {
    let sunlightProduced = 0;
    const dtSec = dt / 1000;
    const zombiesByLane = null; // 按需通过 ctx.getZombiesInLane 获取

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
      // 向日葵：产阳光
      if (def.sunInterval > 0) {
        p.sunCooldown -= dt;
        if (p.sunCooldown <= 0) {
          sunlightProduced += def.sunProduce;
          p.sunCooldown = def.sunInterval;
        }
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
      // 碰撞检测：同车道内 y 接近的僵尸
      const laneZombies = ctx.getZombiesInLane(pr.lane);
      let hit = false;
      for (const z of laneZombies) {
        const zpos = pathManager.getPosition(z.pathIndex, z.progress);
        if (Math.abs(pr.y - zpos.y) < PROJECTILE.HIT_RADIUS &&
            Math.abs(pr.x - zpos.x) < PROJECTILE.HIT_RADIUS) {
          if (ctx.onHitZombie) ctx.onHitZombie(z, pr);
          hit = true;
          break;
        }
      }
      if (hit) {
        pr.active = false;
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
   * 生成投射物
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
      type: projDef.type,      // 'normal' | 'ice'
      slow: slow,
      color: projDef.color,
      radius: projDef.radius,
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
   * 清理
   */
  clear() {
    this.plants = [];
    this.projectiles = [];
  }
}

const plantManager = new PlantManager();

module.exports = {
  plantManager,
  PlantManager
};
