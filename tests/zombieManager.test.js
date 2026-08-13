// tests/zombieManager.test.js - 僵尸系统单元测试
// 测试：僵尸创建、对象池、生成管理、移动、状态机、伤害、buff、关卡递增

const path = require('path');

// ---------- Mock pathManager ----------
jest.mock('../miniprogram/utils/pathManager.js', () => {
  const GRID = { ROWS: 3, COLS: 5 };
  const b = {
    left: 30, right: 345, top: 48, bottom: 570
  };
  const cs = { w: 105, h: 104.4 };
  return {
    pathManager: {
      init: jest.fn(),
      setCanvasSize: jest.fn(),
      getPathCount: jest.fn(() => GRID.ROWS),
      getGridBounds: jest.fn(() => b),
      getGridTop: jest.fn(() => b.top),
      getCellSize: jest.fn(() => cs),
      getGridCellCenter: jest.fn((lane, slot) => ({
        x: b.left + (lane + 0.5) * cs.w,
        y: b.top + (slot + 0.5) * cs.h
      })),
      getPosition: jest.fn((pathIndex, t) => {
        const clampedT = Math.max(0, Math.min(1, t));
        return {
          x: b.left + (pathIndex + 0.5) * cs.w,
          y: b.top + clampedT * (b.bottom - b.top)
        };
      }),
      getPathLength: jest.fn(() => b.bottom - b.top),
      pixelToCell: jest.fn()
    }
  };
});

const { ZOMBIE_TYPES, ZOMBIE_TYPE_WEIGHTS, DIFFICULTY_CONFIG, PERFORMANCE, COMBAT, LEVEL } = require('../miniprogram/utils/constants.js');
const { zombieManager, createZombie, ZombiePool, ZombieSpawner, ZombieManager } = require('../miniprogram/utils/zombieManager.js');

describe('ZombieManager', () => {
  beforeEach(() => {
    zombieManager.reset(DIFFICULTY_CONFIG.middle, 'middle');
  });

  // ========== 僵尸创建 ==========
  describe('createZombie', () => {
    it('应创建具有正确属性的普通僵尸', () => {
      const z = createZombie('normal', 0, 38);
      expect(z.type).toBe('normal');
      expect(z.name).toBe('普通僵尸');
      expect(z.pathIndex).toBe(0);
      expect(z.progress).toBe(0);
      expect(z.state).toBe('walking');
      expect(z.health).toBe(2);
      expect(z.maxHealth).toBe(2);
      expect(z.speedMultiplier).toBeUndefined(); // speed 已归一化
      expect(z.radius).toBe(36);
      expect(z.active).toBe(true);
    });

    it('应创建具有正确属性的快速僵尸', () => {
      const z = createZombie('fast', 1, 38);
      expect(z.type).toBe('fast');
      expect(z.health).toBe(1);
      expect(z.radius).toBe(30);
      expect(z.scoreReward).toBe(150);
    });

    it('应创建具有正确属性的壮汉僵尸', () => {
      const z = createZombie('strong', 2, 38);
      expect(z.type).toBe('strong');
      expect(z.health).toBe(5);
      expect(z.maxHealth).toBe(5);
      expect(z.scoreReward).toBe(250);
    });

    it('应创建具有正确属性的护甲僵尸', () => {
      const z = createZombie('armored', 0, 38);
      expect(z.type).toBe('armored');
      expect(z.health).toBe(6);
      expect(z.maxHealth).toBe(6);
      expect(z.scoreReward).toBe(300);
      expect(z.radius).toBe(40);
    });

    it('未知类型应回退到普通僵尸', () => {
      const z = createZombie('unknown', 0, 38);
      expect(z.type).toBe('normal');
    });
  });

  // ========== 对象池 ==========
  describe('ZombiePool', () => {
    let pool;
    beforeEach(() => { pool = new ZombiePool(); });

    it('应预分配指定数量的对象', () => {
      expect(pool.pool.length).toBe(PERFORMANCE.POOL_PREALLOC);
    });

    it('应能从池中获取对象', () => {
      const cfg = createZombie('normal', 0, 38);
      const z = pool.acquire(cfg);
      expect(z).not.toBeNull();
      expect(z.active).toBe(true);
      expect(z.type).toBe('normal');
    });

    it('应能归还对象到池中', () => {
      const cfg = createZombie('normal', 0, 38);
      const z = pool.acquire(cfg);
      pool.release(z);
      expect(z.active).toBe(false);
      expect(z.state).toBe('dead');
    });

    it('不应超过池上限', () => {
      const cfg = createZombie('normal', 0, 38);
      // 填满池子
      for (let i = 0; i < PERFORMANCE.POOL_MAX; i++) {
        pool.acquire(cfg);
      }
      const overflow = pool.acquire(cfg);
      expect(overflow).toBeNull();
    });
  });

  // ========== 生成管理器 ==========
  describe('ZombieSpawner', () => {
    let spawner;
    beforeEach(() => {
      spawner = new ZombieSpawner();
      spawner.configure(DIFFICULTY_CONFIG.middle, 'middle');
    });

    it('应按配置设置生成间隔', () => {
      expect(spawner.spawnInterval).toBe(3200);
      expect(spawner.baseSpeed).toBe(38);
      expect(spawner.maxZombies).toBe(8);
    });

    it('应保存基础参数用于关卡递增', () => {
      expect(spawner._baseSpawnInterval).toBe(3200);
      expect(spawner._baseBaseSpeed).toBe(38);
    });

    it('不应在活跃数达到上限时生成', () => {
      const result = spawner.update(10000, spawner.maxZombies);
      expect(result).toBeNull();
    });

    it('应在时间足够且活跃数未满时生成', () => {
      const result = spawner.update(4000, 3);
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('pathIndex');
      expect(result).toHaveProperty('baseSpeed');
      expect(result.pathIndex).toBeGreaterThanOrEqual(0);
      expect(result.pathIndex).toBeLessThan(3);
    });

    // ========== 关卡递增 ==========
    describe('applyLevelRamp', () => {
      it('应随关卡提升减少生成间隔', () => {
        const origInterval = spawner.spawnInterval;
        spawner.applyLevelRamp(5, LEVEL.RAMP);
        expect(spawner.spawnInterval).toBeLessThan(origInterval);
      });

      it('应随关卡提升增加基础速度', () => {
        const origSpeed = spawner.baseSpeed;
        spawner.applyLevelRamp(10, LEVEL.RAMP);
        expect(spawner.baseSpeed).toBeGreaterThan(origSpeed);
      });

      it('生成间隔不应低于 1200ms', () => {
        spawner.applyLevelRamp(20, LEVEL.RAMP);
        expect(spawner.spawnInterval).toBeGreaterThanOrEqual(1200);
      });

      it('应随关卡提升增加强壮/护甲僵尸概率', () => {
        spawner.applyLevelRamp(10, LEVEL.RAMP);
        expect(spawner.typeWeights.strong).toBeGreaterThan(0.12);
        expect(spawner.typeWeights.armored).toBeGreaterThan(0.10);
      });

      it('normal 权重不应低于 10%', () => {
        spawner.applyLevelRamp(20, LEVEL.RAMP);
        expect(spawner.typeWeights.normal).toBeGreaterThanOrEqual(0.10);
      });
    });
  });

  // ========== 僵尸管理 ==========
  describe('ZombieManager', () => {
    it('reset 应清空所有僵尸', () => {
      zombieManager.reset(DIFFICULTY_CONFIG.middle, 'middle');
      expect(zombieManager.getAll()).toHaveLength(0);
    });

    it('update 应在时间足够时生成僵尸', () => {
      // 模拟足够时间让僵尸生成
      for (let i = 0; i < 10; i++) {
        zombieManager.update(4000, () => {});
      }
      expect(zombieManager.getAll().length).toBeGreaterThan(0);
    });

    it('僵尸应随时间移动', () => {
      // 强制生成一只僵尸（仅3轮，确保不死）
      zombieManager.reset(DIFFICULTY_CONFIG.middle, 'middle');
      for (let i = 0; i < 3; i++) {
        zombieManager.update(4000, () => {});
      }
      const zombies = zombieManager.getAll();
      expect(zombies.length).toBeGreaterThan(0);
      const z = zombies[0];
      expect(z.state).toBe('walking');
      const progress = z.progress;
      zombieManager.update(1000, () => {});
      expect(z.progress).toBeGreaterThan(progress);
    });

    it('getZombiesInLane 应返回指定车道的僵尸', () => {
      zombieManager.reset(DIFFICULTY_CONFIG.middle, 'middle');
      for (let i = 0; i < 20; i++) {
        zombieManager.update(4000, () => {});
      }
      const laneZombies = zombieManager.getZombiesInLane(0);
      laneZombies.forEach(z => {
        expect(z.pathIndex).toBe(0);
      });
    });

    // ========== 伤害系统 ==========
    describe('takeDamage', () => {
      it('应减少僵尸生命值', () => {
        zombieManager.reset(DIFFICULTY_CONFIG.middle, 'middle');
        for (let i = 0; i < 3; i++) {
          zombieManager.update(4000, () => {});
        }
        const zombies = zombieManager.getAll();
        expect(zombies.length).toBeGreaterThan(0);
        const z = zombies[0];
        expect(z.state).toBe('walking');
        const initialHealth = z.health;
        zombieManager.takeDamage(z, 1);
        expect(z.health).toBe(initialHealth - 1);
      });

      it('应在生命值归零时击杀僵尸', () => {
        zombieManager.reset(DIFFICULTY_CONFIG.middle, 'middle');
        for (let i = 0; i < 3; i++) {
          zombieManager.update(4000, () => {});
        }
        const zombies = zombieManager.getAll();
        expect(zombies.length).toBeGreaterThan(0);
        const z = zombies[0];
        expect(z.state).toBe('walking');
        const killed = zombieManager.takeDamage(z, z.health);
        expect(killed).toBe(true);
        expect(z.state).toBe('dying');
      });

      it('应正确应用减速效果', () => {
        zombieManager.reset(DIFFICULTY_CONFIG.middle, 'middle');
        for (let i = 0; i < 3; i++) {
          zombieManager.update(4000, () => {});
        }
        const zombies = zombieManager.getAll();
        expect(zombies.length).toBeGreaterThan(0);
        const z = zombies[0];
        expect(z.state).toBe('walking');
        zombieManager.takeDamage(z, 1, { slow: { factor: 0.5, duration: 2000 } });
        expect(z.slowFactor).toBe(0.5);
        expect(z.slowTimer).toBeGreaterThan(0);
      });
    });

    // ========== 全局加速 ==========
    describe('applyGlobalSpeedBoost', () => {
      it('应对所有僵尸应用加速效果', () => {
        zombieManager.reset(DIFFICULTY_CONFIG.middle, 'middle');
        for (let i = 0; i < 15; i++) {
          zombieManager.update(4000, () => {});
        }
        zombieManager.applyGlobalSpeedBoost(1.3, 3000);
        const zombies = zombieManager.getAll();
        zombies.forEach(z => {
          if (z.state === 'walking' || z.state === 'eating') {
            expect(z.boostMult).toBe(1.3);
            expect(z.boostTimer).toBeGreaterThan(0);
          }
        });
      });
    });

    // ========== 减速 buff 计时衰减 ==========
    it('减速和加速 buff 应随时间衰减', () => {
      zombieManager.reset(DIFFICULTY_CONFIG.middle, 'middle');
      for (let i = 0; i < 3; i++) {
        zombieManager.update(4000, () => {});
      }
      const zombies = zombieManager.getAll();
      expect(zombies.length).toBeGreaterThan(0);
      const z = zombies[0];
      expect(z.state).toBe('walking');
      zombieManager.takeDamage(z, 1, { slow: { factor: 0.5, duration: 500 } });
      zombieManager.applyGlobalSpeedBoost(1.3, 500);
      expect(z.slowTimer).toBeGreaterThan(0);
      expect(z.boostTimer).toBeGreaterThan(0);
      // 推进足够时间
      zombieManager.update(600, () => {});
      expect(z.slowFactor).toBe(1.0);
      expect(z.slowTimer).toBe(0);
      expect(z.boostMult).toBe(1.0);
      expect(z.boostTimer).toBe(0);
    });
  });
});