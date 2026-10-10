// utils/plantManager.js - 植物武器系统管理器
// 负责: 植物对象池、投射物对象池、网格放置、攻击/产阳光/投射物飞行与碰撞
// 植物7种: sunflower(向日葵) / shooter(豌豆射手) / wall(坚果) / freezer(寒冰射手) / cherry(樱桃炸弹) / chomper(食人花) / fire(火焰射手·v48三连发覆盖邻路)

const { PLANT_TYPES, GRID, PROJECTILE, SUNLIGHT, PLANT } = require('./constants.js');
const { pathManager } = require('./pathManager.js');

let __plantIdSeed = 1;
let __projIdSeed = 1;
let __sunIdSeed = 1;  // 收集阳光对象 id 生成器
const SUN_MAX_ACTIVE = 10;          // 同屏阳光上限，防止无限堆积
const SUN_LIFETIME_MS = 10000;      // 阳光未被收集的寿命（10s）
// v6 修复 (Task 12): SUN_COLLECT_WNDOW typo 常量已删除 — 改用 SUNLIGHT.SUN_COLLECT_WINDOW_MS
//   跨文件耦合：gameManager._notifySunsView 收集动画 progress 必须用同一时长，否则阳光消失早/晚于动画

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

  // v6 修复 (Task 11 F9): 删除零调用 getPlantById 方法

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
      // v6 修复 (Task 12): 初始冷却比例 → PLANT.INITIAL_CD_RATIO
      attackCooldown: def.attackInterval ? def.attackInterval * PLANT.INITIAL_CD_RATIO : 0,
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
      chomperSwallowProgress: 0,                       // 吞咽鼓起进度 0~1
      // v64 角色动效（纯视觉，渲染层读取）：
      age: 0,                // 存活时长(ms) — 入场弹跳动画用（< PLANT.SPAWN_POP_MS 内播弹入）
      shootFx: 0             // 射击后坐力归一化计时(1→0) — _spawnProjectile 置 1，update 按 SHOOT_FX_MS 线性衰减
    };
    this.plants.push(plant);
    return { ok: true, plant: plant, cost: def.cost };
  }

  /**
   * 植物受击（被僵尸啃）
   * @param {Object} plant
   * @param {number} amount
   * @returns {Object} {died: boolean, lane: number}
   *   v2: 返回对象而非布尔值，携带 lane 信息
   */
  takeDamage(plant, amount) {
    if (!plant || plant.state === 'dead') return { died: false, lane: -1 };
    plant.health -= amount;
    // v6 修复 (Task 12): 受击闪烁时长 → PLANT.HIT_FLASH_MS（与 renderer _drawPlant 闪烁除数耦合）
    plant.hitFlash = PLANT.HIT_FLASH_MS;
    if (plant.health <= 0) {
      plant.health = 0;
      plant.state = 'dead';
      return { died: true, lane: plant.lane };
    }
    return { died: false, lane: -1 };
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
      // v6 修复 (Task 12): 摇摆速度 → PLANT.WOBBLE_SPEED
      p.wobble += dtSec * PLANT.WOBBLE_SPEED;
      if (p.hitFlash > 0) p.hitFlash -= dt;
      // v64 角色动效：存活时长累加（入场弹跳用）+ 射击后坐力线性衰减（纯视觉）
      p.age += dt;
      if (p.shootFx > 0) p.shootFx = Math.max(0, p.shootFx - dt / PLANT.SHOOT_FX_MS);

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
          // v48: multiLane 植物(火焰射手)目标感知扩展到覆盖车道(本路+邻路),
          //      邻路有来袭僵尸即触发齐射; 单路植物语义不变
          const target = def.projectile.multiLane
            ? this._findTargetMultiLane(p, ctx.getZombiesInLane)
            : this._findTarget(p, ctx.getZombiesInLane);
          if (target) {
            this._spawnProjectile(p, def.projectile);
            p.attackCooldown = def.attackInterval;
          } else {
            // v6 修复 (Task 12): 无目标重试冷却 → PLANT.NO_TARGET_RETRY_MS
            p.attackCooldown = PLANT.NO_TARGET_RETRY_MS;
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
        // v6 修复 (Task 12): SUN_COLLECT_WNDOW typo → SUNLIGHT.SUN_COLLECT_WINDOW_MS
        if (s.t >= s.collectAt + SUNLIGHT.SUN_COLLECT_WINDOW_MS) {
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
        // v6 修复 (Task 11 F10): hitTargets 永远是数组（_spawnProjectile 初始化），删防御性 &&
        if (isPierce && pr.hitTargets.includes(z.id)) continue;
        const zpos = pathManager.getPosition(z.pathIndex, z.progress);
        const dx = pr.x - zpos.x;
        const dy = pr.y - zpos.y;
        const hitR = z.radius + pr.radius;
        if (dx * dx + dy * dy < hitR * hitR) {
          if (ctx.onHitZombie) ctx.onHitZombie(z, pr);
          if (isPierce) {
            // 穿透：记录命中目标，减少剩余穿透次数
            pr.hitTargets.push(z.id);
            pr.pierceCount = (pr.pierceCount || 0) + 1;
            // v6 修复 (Task 12): 默认穿透数 → PROJECTILE.PIERCE_MAX_DEFAULT
            if (pr.pierceCount >= (projDef.pierceMax || PROJECTILE.PIERCE_MAX_DEFAULT)) {
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
    // v6 修复 (Task 12): SNAP_DURATION → PLANT.CHOMPER.SNAP_DURATION_MS
    const SNAP_DURATION = PLANT.CHOMPER.SNAP_DURATION_MS;
    const swallowTime = def.swallowTime || 3000;

    if (p.chomperTimer > 0) p.chomperTimer -= dt;

    switch (p.chomperState) {
      case 'snap': {
        const elapsed = SNAP_DURATION - Math.max(0, p.chomperTimer);
        p.chomperBiteProgress = Math.min(1, elapsed / SNAP_DURATION);

        // v6 修复 (Task 12): 咬合伤害点 → PLANT.CHOMPER.BITE_DAMAGE_POINT
        if (!p._biteDealt && elapsed >= SNAP_DURATION * PLANT.CHOMPER.BITE_DAMAGE_POINT) {
          p._biteDealt = true;
          const target = this._findMeleeTarget(p, ctx.getZombiesInLane);
          if (target && ctx.onChomperBite) {
            ctx.onChomperBite(p, target, def.damage);
          }
        }

        if (p.chomperTimer <= 0) {
          p.chomperState = 'swallow';
          // v6 修复 (Task 12): 未咬中短吞咽期 → PLANT.CHOMPER.NO_BITE_SWALLOW_MS
          p.chomperTimer = p._biteDealt ? swallowTime : PLANT.CHOMPER.NO_BITE_SWALLOW_MS;
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
            // v6 修复 (Task 12): 待机重试冷却 → PLANT.CHOMPER.IDLE_RETRY_MS
            p.attackCooldown = PLANT.CHOMPER.IDLE_RETRY_MS;
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
   * v48: multiLane 投射物(火焰射手三连发) — 本路 + 左右邻路各一发;
   *      邻路弹直接出生在邻路列中心并沿该列向上飞(碰撞按 pr.lane 查
   *      询该列僵尸、僵尸 x=列中心, 渲染按 pr.x/pr.y — 全链路零特殊
   *      分支); 边路植物无邻路侧自动少发, 只覆盖存在的车道
   */
  _spawnProjectile(plant, projDef) {
    const slow = projDef.slow || null;
    // v64 角色动效：触发射击后坐力（纯视觉，渲染层在 shootFx>0 时绘制 kick + 炮口闪光）
    plant.shootFx = 1;
    const lanes = projDef.multiLane ? this._coveredLanes(plant.lane) : [plant.lane];
    for (const lane of lanes) {
      const x = (lane === plant.lane)
        ? plant.x
        : pathManager.getGridCellCenter(lane, plant.slot).x;   // 邻路列中心
      // v49: 邻路弹伤害减半 — 本路全额, 邻路 ×adjacentDamageRatio(向下
      // 取整, 下限 1 防零伤); 无该系数的植物(单路系)语义零变化
      const dmg = (lane === plant.lane || !projDef.adjacentDamageRatio)
        ? plant.def.damage
        : Math.max(1, Math.floor(plant.def.damage * projDef.adjacentDamageRatio));
      this.projectiles.push({
        id: __projIdSeed++,
        lane: lane,
        x: x,
        y: plant.y - 10,         // 略偏上发射
        vy: -projDef.speed,      // 负值=向上
        damage: dmg,                    // v49: 本路全额 / 邻路减半
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
  }

  /**
   * v48: multiLane 植物覆盖的车道（本路 + 存在的左右邻路）
   * lane 0 → [0,1]; lane 1 → [0,1,2]; lane 2 → [1,2]
   */
  _coveredLanes(lane) {
    const lanes = [];
    for (let l = lane - 1; l <= lane + 1; l++) {
      if (l >= 0 && l < GRID.ROWS) lanes.push(l);
    }
    return lanes;
  }

  /**
   * v48: multiLane 植物目标查找 — 覆盖车道内 progress < 植物进度的
   * 最近僵尸(来袭方向)。单路版本见 _findTarget; 植物进度跨车道同坐标
   * (slot 决定纵向), 邻路僵尸 progress 语义一致可直接比较
   */
  _findTargetMultiLane(plant, getZombiesInLane) {
    const plantProgress = PlantManager.slotToProgress(plant.slot);
    let target = null;
    for (const lane of this._coveredLanes(plant.lane)) {
      for (const z of getZombiesInLane(lane)) {
        // 仅攻击位于植物上方(进度更小)的来袭僵尸
        if (z.progress < plantProgress - 0.01) {
          if (!target || z.progress > target.progress) {
            target = z;  // 取最接近植物的(进度最大)
          }
        }
      }
    }
    return target;
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
   * v60: 天降阳光雨 — 连击里程碑奖励（QUIZ.MILESTONES type:'sunrain'）
   * 网格范围内随机掉落 n 颗可收集阳光; 位置偏网格上半区（视觉醒目,
   * 飘落感更强）; 同屏上限保护（同向日葵产阳光惯例, 满额时提前收工）
   * @param {number} n - 掉落颗数
   * @param {number} [value] - 每颗面值（默认 25）
   * @returns {number} 实际掉落颗数（可能因同屏上限 < n）
   */
  spawnBonusSuns(n, value) {
    const b = pathManager.getGridBounds();
    const spanY = b.bottom - b.top;
    let placed = 0;
    for (let i = 0; i < n; i++) {
      const activeSuns = this.suns.filter(s => !s.collected).length;
      if (activeSuns >= SUN_MAX_ACTIVE) break;
      const x = b.left + Math.random() * (b.right - b.left);
      const y = b.top + spanY * (0.15 + Math.random() * 0.6);
      this._spawnSun(x, y, value || 25);
      placed++;
    }
    return placed;
  }

  /**
   * v60: 击杀掉宝 — 僵尸阵亡位置掉落一颗可收集阳光
   * （combatResolver 三处击杀分支按 SUNLIGHT.LOOT_CHANCE roll 后调用）
   * 与向日葵阳光走同一收集/超时链路; 同屏超限时放弃掉落（掉宝是惊喜
   * 不是权益, 不做直接入账补偿——引导玩家勤收集）
   * @param {number} x - canvas 内像素 X（僵尸阵亡位置）
   * @param {number} y - canvas 内像素 Y
   * @param {number} value - 面值
   * @returns {boolean} 是否成功掉落
   */
  spawnLootSun(x, y, value) {
    const activeSuns = this.suns.filter(s => !s.collected).length;
    if (activeSuns >= SUN_MAX_ACTIVE) return false;
    this._spawnSun(x, y, value);
    return true;
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
    // 回收路径：update 的 1.5 段在 s.t ≥ collectAt + SUN_COLLECT_WINDOW_MS 时删除
    //   （收集动画结束即删；v52 澄清旧注释「2× 强制删」的失实表述）
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
