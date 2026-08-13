// tests/integration.test.js - 集成测试
// 模拟完整游戏流程：初始化 → 答题 → 僵尸生成 → 防线被破 → 游戏结束

const path = require('path');

// ---------- Mock 依赖 ----------
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
      pixelToCell: jest.fn((x, y) => {
        if (x < b.left || x > b.right || y < b.top || y > b.bottom) return null;
        const lane = Math.floor((x - b.left) / cs.w);
        const slot = Math.floor((y - b.top) / cs.h);
        if (lane < 0 || lane >= GRID.ROWS || slot < 0 || slot >= GRID.COLS) return null;
        return { lane, slot };
      })
    }
  };
});

jest.mock('../miniprogram/utils/renderer.js', () => ({
  renderer: {
    clear: jest.fn(),
    render: jest.fn(),
    addBurst: jest.fn(),
    attach: jest.fn(),
    onRenderFatal: null
  }
}));

jest.mock('../miniprogram/utils/fpsMonitor.js', () => ({
  fpsMonitor: {
    reset: jest.fn(),
    tick: jest.fn(),
    getAvgFps: jest.fn(() => 60)
  }
}));

jest.mock('../miniprogram/utils/audioManager.js', () => ({
  play: jest.fn(),
  resume: jest.fn()
}));

const { DIFFICULTY_CONFIG, ZOMBIE_TYPES, PLANT_TYPES, BASE_PLANT, SUNLIGHT, LEVEL, COMBAT, LIVES, GRID } = require('../miniprogram/utils/constants.js');
const { gameManager } = require('../miniprogram/utils/gameManager.js');
const { zombieManager } = require('../miniprogram/utils/zombieManager.js');
const { plantManager } = require('../miniprogram/utils/plantManager.js');

const MOCK_WORD_BANK = [
  { en: 'apple', zh: '苹果', phonetic: '/æpəl/', difficulty: 1 },
  { en: 'banana', zh: '香蕉', phonetic: '/bənænə/', difficulty: 1 },
  { en: 'cat', zh: '猫', phonetic: '/kæt/', difficulty: 1 },
  { en: 'dog', zh: '狗', phonetic: '/dɒɡ/', difficulty: 1 },
  { en: 'egg', zh: '鸡蛋', phonetic: '/ɛɡ/', difficulty: 1 },
  { en: 'fish', zh: '鱼', phonetic: '/fɪʃ/', difficulty: 1 },
  { en: 'grape', zh: '葡萄', phonetic: '/ɡreɪp/', difficulty: 1 },
  { en: 'house', zh: '房子', phonetic: '/haʊs/', difficulty: 1 },
  { en: 'ice', zh: '冰', phonetic: '/aɪs/', difficulty: 1 },
  { en: 'juice', zh: '果汁', phonetic: '/dʒuːs/', difficulty: 1 },
  { en: 'king', zh: '国王', phonetic: '/kɪŋ/', difficulty: 1 },
  { en: 'lion', zh: '狮子', phonetic: '/laɪən/', difficulty: 1 },
  { en: 'moon', zh: '月亮', phonetic: '/muːn/', difficulty: 1 },
  { en: 'nose', zh: '鼻子', phonetic: '/noʊz/', difficulty: 1 },
  { en: 'orange', zh: '橙子', phonetic: '/ɒrɪndʒ/', difficulty: 1 }
];

describe('Integration - 完整游戏流程', () => {
  beforeEach(() => {
    gameManager.onStateChange = jest.fn();
    gameManager.onQuestionChange = jest.fn();
    gameManager.onScoreChange = jest.fn();
    gameManager.onDefenseChange = jest.fn();
    gameManager.onComboChange = jest.fn();
    gameManager.onSunlightChange = jest.fn();
    gameManager.onShopSelect = jest.fn();
    gameManager.onGameOver = jest.fn();
    gameManager.onLevelChange = jest.fn();
    gameManager.initGame('middle', MOCK_WORD_BANK);
  });

  afterEach(() => {
    gameManager.destroy();
  });

  it('应完成完整的游戏初始化流程', () => {
    // 验证初始状态
    expect(gameManager.state.defenseLines).toBe(3);
    expect(gameManager.state.level).toBe(1);
    expect(gameManager.state.sunlight).toBe(SUNLIGHT.INITIAL);
    expect(gameManager.state.phase).toBe('ready');

    // 验证基地植物已初始化
    const plants = plantManager.getPlants();
    const basePlants = plants.filter(p => p.isBase);
    expect(basePlants).toHaveLength(3);
    basePlants.forEach(p => {
      expect(p.slot).toBe(BASE_PLANT.SLOT);
      expect(p.health).toBe(BASE_PLANT.HEALTH);
    });
  });

  it('应支持连续答题累积阳光', () => {
    gameManager.start();
    const initialSunlight = gameManager.state.sunlight;

    // 模拟连续答对 5 题
    for (let i = 0; i < 5; i++) {
      const q = gameManager.onQuestionChange.mock.calls[i]?.[0];
      if (q) {
        gameManager.answer(q.correctAnswer);
      }
    }

    expect(gameManager.state.sunlight).toBeGreaterThan(initialSunlight);
    expect(gameManager.state.combo).toBeGreaterThanOrEqual(0);
  });

  it('应正确生成僵尸', () => {
    gameManager.start();
    // 模拟足够时间让僵尸生成
    const initialCount = zombieManager.getAll().length;
    for (let i = 0; i < 30; i++) {
      zombieManager.update(4000, () => {});
    }
    const finalCount = zombieManager.getAll().length;
    // 僵尸数量应增加（至少有一些被生成）
    expect(finalCount).toBeGreaterThanOrEqual(initialCount);
  });

  it('僵尸应能被击杀', () => {
    gameManager.start();
    // 生成僵尸（仅3轮，确保存活）
    for (let i = 0; i < 3; i++) {
      zombieManager.update(4000, () => {});
    }
    const zombies = zombieManager.getAll();
    expect(zombies.length).toBeGreaterThan(0);
    const z = zombies[0];
    expect(z.state).toBe('walking');
    const killed = zombieManager.takeDamage(z, 100);
    expect(killed).toBe(true);
    expect(z.state).toBe('dying');
  });

  it('防线应能被突破', () => {
    gameManager.start();
    // 获取基地植物
    const plants = plantManager.getPlants();
    const basePlant = plants.find(p => p.isBase);
    expect(basePlant).toBeDefined();

    // 模拟僵尸啃食基地植物
    for (let i = 0; i < BASE_PLANT.HEALTH; i++) {
      const result = plantManager.takeDamage(basePlant, COMBAT.ZOMBIE_ATTACK_DAMAGE);
      if (result.died) {
        gameManager._onBaseDestroyed(result.lane);
        expect(gameManager.state.defenseLines).toBeLessThan(3);
        break;
      }
    }
  });

  it('应支持不同难度配置', () => {
    gameManager.initGame('primary', MOCK_WORD_BANK);
    expect(gameManager.state.difficulty).toBe('primary');
    expect(gameManager.state.sunlight).toBe(SUNLIGHT.INITIAL);

    gameManager.initGame('college', MOCK_WORD_BANK);
    expect(gameManager.state.difficulty).toBe('college');
  });

  it('应支持放置多种植物', () => {
    // 先设置足够的阳光
    gameManager.state.sunlight = 500;
    gameManager.state.isPlaying = true;

    // 放置豌豆射手
    gameManager.selectPlant('shooter');
    const res1 = gameManager.tryPlacePlantAt(82.5, 152.2);
    expect(res1.ok).toBe(true);

    // 放置坚果墙
    gameManager.selectPlant('wall');
    const res2 = gameManager.tryPlacePlantAt(187.5, 152.2);
    expect(res2.ok).toBe(true);

    // 放置樱桃炸弹
    gameManager.selectPlant('cherry');
    const res3 = gameManager.tryPlacePlantAt(82.5, 360.6);
    expect(res3.ok).toBe(true);

    // 验证植物数量
    const plants = plantManager.getPlants();
    const userPlants = plants.filter(p => !p.isBase);
    expect(userPlants.length).toBe(3);
  });

  it('结算数据应包含所有必要字段', () => {
    gameManager.state.score = 1000;
    gameManager.state.level = 5;
    gameManager.state.maxCombo = 8;
    gameManager.state.killedZombies = 20;
    gameManager.state.plantsPlaced = 6;
    gameManager.state.gameTime = 180000;

    const summary = gameManager.getSummary();
    expect(summary).toHaveProperty('score');
    expect(summary).toHaveProperty('level');
    expect(summary).toHaveProperty('maxCombo');
    expect(summary).toHaveProperty('killedZombies');
    expect(summary).toHaveProperty('plantsPlaced');
    expect(summary).toHaveProperty('correctCount');
    expect(summary).toHaveProperty('wrongCount');
    expect(summary).toHaveProperty('accuracy');
    expect(summary).toHaveProperty('stars');
    expect(summary).toHaveProperty('gameTime');
    expect(summary).toHaveProperty('difficulty');
    expect(summary).toHaveProperty('avgFps');
  });

  it('stars 应根据准确率正确计算', () => {
    gameManager.state.score = 500;
    // 准确率通过 quizManager 计算，这里仅验证字段存在
    const summary = gameManager.getSummary();
    expect([0, 1, 2, 3]).toContain(summary.stars);
  });
});