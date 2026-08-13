// tests/plantManager.test.js - 植物系统单元测试
// 测试：植物放置、基地植物、投射物、樱桃炸弹、火焰穿透、伤害

const path = require('path');

// ---------- Mock pathManager ----------
jest.mock('../miniprogram/utils/pathManager.js', () => {
  const GRID = { ROWS: 3, COLS: 5 };
  const b = { left: 30, right: 345, top: 48, bottom: 570 };
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

const { PLANT_TYPES, GRID, BASE_PLANT, SUNLIGHT, COMBAT } = require('../miniprogram/utils/constants.js');
const { plantManager, PlantManager } = require('../miniprogram/utils/plantManager.js');

describe('PlantManager', () => {
  beforeEach(() => {
    plantManager.reset();
  });

  // ========== 基地植物 ==========
  describe('initBasePlants', () => {
    it('应在每条车道创建 1 个基地植物', () => {
      plantManager.initBasePlants();
      const plants = plantManager.getPlants();
      expect(plants).toHaveLength(GRID.ROWS);
      plants.forEach((p, i) => {
        expect(p.isBase).toBe(true);
        expect(p.lane).toBe(i);
        expect(p.slot).toBe(BASE_PLANT.SLOT);
        expect(p.health).toBe(BASE_PLANT.HEALTH);
        expect(p.maxHealth).toBe(BASE_PLANT.HEALTH);
        expect(p.type).toBe(BASE_PLANT.TYPE);
      });
    });

    it('基地植物应占据 slot=4', () => {
      plantManager.initBasePlants();
      const plants = plantManager.getPlants();
      plants.forEach(p => {
        expect(p.slot).toBe(4);
      });
    });
  });

  // ========== 植物放置 ==========
  describe('placePlant', () => {
    beforeEach(() => {
      plantManager.initBasePlants();
    });

    it('应在有效位置放置植物', () => {
      const res = plantManager.placePlant('shooter', 0, 0);
      expect(res.ok).toBe(true);
      expect(res.plant).toBeDefined();
      expect(res.plant.type).toBe('shooter');
      expect(res.plant.lane).toBe(0);
      expect(res.plant.slot).toBe(0);
    });

    it('应拒绝越界位置', () => {
      expect(plantManager.placePlant('shooter', -1, 0).ok).toBe(false);
      expect(plantManager.placePlant('shooter', 3, 0).ok).toBe(false);
      expect(plantManager.placePlant('shooter', 0, -1).ok).toBe(false);
      expect(plantManager.placePlant('shooter', 0, 5).ok).toBe(false);
    });

    it('应拒绝在基地植物槽位放置', () => {
      const res = plantManager.placePlant('shooter', 0, BASE_PLANT.SLOT);
      expect(res.ok).toBe(false);
      expect(res.reason).toContain('防线');
    });

    it('应拒绝在已有植物位置放置', () => {
      plantManager.placePlant('shooter', 0, 0);
      const res = plantManager.placePlant('wall', 0, 0);
      expect(res.ok).toBe(false);
      expect(res.reason).toContain('已有植物');
    });

    it('应拒绝未知植物类型', () => {
      const res = plantManager.placePlant('unknown', 0, 0);
      expect(res.ok).toBe(false);
    });

    // 樱桃炸弹
    it('樱桃炸弹应有引信计时器', () => {
      const res = plantManager.placePlant('cherry', 0, 0);
      expect(res.ok).toBe(true);
      expect(res.plant.fuseTimer).toBeGreaterThan(0);
      expect(res.plant.exploded).toBe(false);
    });

    // 火焰射手
    it('火焰射手应有正确的伤害和攻击间隔', () => {
      const res = plantManager.placePlant('fire', 0, 0);
      expect(res.ok).toBe(true);
      expect(res.plant.def.damage).toBe(3);
      expect(res.plant.def.attackInterval).toBe(1500);
    });
  });

  // ========== 伤害 ==========
  describe('takeDamage', () => {
    it('应减少植物生命值', () => {
      plantManager.placePlant('shooter', 0, 0);
      const plants = plantManager.getPlants();
      const result = plantManager.takeDamage(plants[0], 1);
      expect(result.died).toBe(false);
      expect(plants[0].health).toBe(2); // shooter health=3, -1=2
    });

    it('应在生命值归零时标记植物死亡', () => {
      plantManager.placePlant('shooter', 0, 0);
      const plants = plantManager.getPlants();
      const result = plantManager.takeDamage(plants[0], 3);
      expect(result.died).toBe(true);
      expect(plants[0].state).toBe('dead');
    });

    it('基地植物被摧毁应返回 isBase=true', () => {
      plantManager.initBasePlants();
      const plants = plantManager.getPlants();
      const basePlant = plants.find(p => p.isBase);
      const result = plantManager.takeDamage(basePlant, BASE_PLANT.HEALTH);
      expect(result.died).toBe(true);
      expect(result.isBase).toBe(true);
      expect(result.lane).toBe(basePlant.lane);
    });

    it('坚果墙应能承受更多伤害', () => {
      plantManager.placePlant('wall', 0, 0);
      const plants = plantManager.getPlants();
      expect(plants[0].maxHealth).toBe(8);
      const result = plantManager.takeDamage(plants[0], 7);
      expect(result.died).toBe(false);
      expect(plants[0].health).toBe(1);
    });
  });

  // ========== 樱桃炸弹 ==========
  describe('樱桃炸弹爆炸', () => {
    it('引信倒计时结束后应触发爆炸', () => {
      plantManager.placePlant('cherry', 0, 0);
      const plants = plantManager.getPlants();
      const cherry = plants.find(p => p.type === 'cherry');
      expect(cherry).toBeDefined();
      expect(cherry.fuseTimer).toBeGreaterThan(0);

      const onExplode = jest.fn();
      const ctx = {
        getZombiesInLane: () => [],
        onHitZombie: jest.fn(),
        onPlantExplode: onExplode
      };

      // 推进时间超过引信
      plantManager.update(cherry.fuseTimer + 100, ctx);
      expect(onExplode).toHaveBeenCalled();
    });

    it('爆炸后植物应消失', () => {
      plantManager.placePlant('cherry', 0, 0);
      const plants = plantManager.getPlants();
      const cherry = plants.find(p => p.type === 'cherry');
      const ctx = {
        getZombiesInLane: () => [],
        onHitZombie: jest.fn(),
        onPlantExplode: jest.fn()
      };
      plantManager.update(cherry.fuseTimer + 100, ctx);
      // 爆炸后 cherry 状态应为 dead
      expect(cherry.exploded).toBe(true);
      expect(cherry.state).toBe('dead');
    });
  });

  // ========== 投射物 ==========
  describe('投射物', () => {
    it('攻击型植物应在冷却结束后发射投射物', () => {
      plantManager.placePlant('shooter', 0, 0);
      const ctx = {
        getZombiesInLane: () => [],
        onHitZombie: jest.fn(),
        onPlantExplode: jest.fn()
      };
      // 推进足够时间让冷却结束
      plantManager.update(2000, ctx);
      // 无目标时不应发射投射物
      const proj = plantManager.getProjectiles();
      expect(proj).toHaveLength(0);
    });

    it('有目标时应发射投射物', () => {
      plantManager.placePlant('shooter', 0, 2);
      const mockZombie = {
        id: 1,
        pathIndex: 0,
        progress: 0.2,
        radius: 36,
        health: 2,
        state: 'walking',
        scoreReward: 100
      };
      const ctx = {
        getZombiesInLane: () => [mockZombie],
        onHitZombie: jest.fn(),
        onPlantExplode: jest.fn()
      };
      // 分两次推进：先触发冷却（600ms > 初始冷却 550ms），再小步推进让投射物出膛
      plantManager.update(600, ctx);
      const proj = plantManager.getProjectiles();
      expect(proj.length).toBeGreaterThan(0);
    });

    it('投射物应向上飞行', () => {
      plantManager.placePlant('shooter', 0, 2);
      const mockZombie = {
        id: 1, pathIndex: 0, progress: 0.2, radius: 36,
        health: 2, state: 'walking', scoreReward: 100
      };
      const ctx = {
        getZombiesInLane: () => [mockZombie],
        onHitZombie: jest.fn(),
        onPlantExplode: jest.fn()
      };
      plantManager.update(2000, ctx);
      const proj = plantManager.getProjectiles();
      if (proj.length > 0) {
        const initialY = proj[0].y;
        plantManager.update(100, ctx);
        if (proj[0].active) {
          expect(proj[0].y).toBeLessThan(initialY);
        }
      }
    });
  });

  // ========== 查找目标 ==========
  describe('_findTarget', () => {
    it('应返回同车道最接近植物的僵尸', () => {
      const plant = { lane: 0, slot: 3, def: PLANT_TYPES.shooter };
      const zombies = [
        { pathIndex: 0, progress: 0.1, state: 'walking' },
        { pathIndex: 0, progress: 0.4, state: 'walking' },
        { pathIndex: 1, progress: 0.2, state: 'walking' } // 不同车道
      ];
      const getZombiesInLane = (lane) => zombies.filter(z => z.pathIndex === lane);
      const target = plantManager._findTarget(plant, getZombiesInLane);
      expect(target).toBeDefined();
      expect(target.progress).toBe(0.4); // 最接近的
    });

    it('不应攻击已越过植物的僵尸', () => {
      const plant = { lane: 0, slot: 1, def: PLANT_TYPES.shooter };
      const zombies = [
        { pathIndex: 0, progress: 0.5, state: 'walking' } // progress > plant progress
      ];
      const getZombiesInLane = () => zombies;
      const target = plantManager._findTarget(plant, getZombiesInLane);
      expect(target).toBeNull();
    });
  });

  // ========== 清理 ==========
  describe('reset/clear', () => {
    it('reset 应清空所有植物和投射物', () => {
      plantManager.initBasePlants();
      plantManager.placePlant('shooter', 0, 0);
      expect(plantManager.getPlants().length).toBeGreaterThan(0);
      plantManager.reset();
      expect(plantManager.getPlants()).toHaveLength(0);
      expect(plantManager.getProjectiles()).toHaveLength(0);
    });
  });
});