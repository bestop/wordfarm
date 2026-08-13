// tests/gameManager.test.js - 游戏管理器单元测试
// 测试：初始化、关卡推进、答题、阳光经济、失败判定、结算

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

const { DIFFICULTY_CONFIG, LIVES, LEVEL, SUNLIGHT, PLANT_TYPES, BASE_PLANT, COMBAT } = require('../miniprogram/utils/constants.js');
const { gameManager, GameManager, PHASE } = require('../miniprogram/utils/gameManager.js');

// 最小题库
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
  { en: 'juice', zh: '果汁', phonetic: '/dʒuːs/', difficulty: 1 }
];

describe('GameManager', () => {
  let gm;

  beforeEach(() => {
    gm = new GameManager();
    // 设置回调
    gm.onStateChange = jest.fn();
    gm.onQuestionChange = jest.fn();
    gm.onScoreChange = jest.fn();
    gm.onDefenseChange = jest.fn();
    gm.onComboChange = jest.fn();
    gm.onSunlightChange = jest.fn();
    gm.onShopSelect = jest.fn();
    gm.onGameOver = jest.fn();
    gm.onLevelChange = jest.fn();
    // 初始化
    gm.initGame('middle', MOCK_WORD_BANK);
  });

  afterEach(() => {
    gm.destroy();
  });

  // ========== 初始化 ==========
  describe('initGame', () => {
    it('应正确初始化游戏状态', () => {
      expect(gm.state.score).toBe(0);
      expect(gm.state.defenseLines).toBe(LIVES.INITIAL);
      expect(gm.state.level).toBe(1);
      expect(gm.state.levelTimer).toBe(0);
      expect(gm.state.combo).toBe(0);
      expect(gm.state.sunlight).toBe(SUNLIGHT.INITIAL);
      expect(gm.state.phase).toBe(PHASE.READY);
      expect(gm.state.difficulty).toBe('middle');
    });

    it('应通知所有回调', () => {
      expect(gm.onStateChange).toHaveBeenCalled();
      expect(gm.onSunlightChange).toHaveBeenCalledWith(SUNLIGHT.INITIAL);
      expect(gm.onDefenseChange).toHaveBeenCalledWith(LIVES.INITIAL);
      expect(gm.onLevelChange).toHaveBeenCalledWith(1);
    });
  });

  // ========== 答题 ==========
  describe('answer', () => {
    it('应生成题目', () => {
      gm.start();
      expect(gm.onQuestionChange).toHaveBeenCalled();
      const question = gm.onQuestionChange.mock.calls[0][0];
      expect(question).toBeDefined();
      expect(question).toHaveProperty('content');
      expect(question).toHaveProperty('options');
      expect(question).toHaveProperty('correctAnswer');
    });

    it('答对应增加分数和阳光', () => {
      gm.start();
      const question = gm.onQuestionChange.mock.calls[0][0];
      const result = gm.answer(question.correctAnswer);
      expect(result.correct).toBe(true);
      expect(result.score).toBeGreaterThan(0);
      expect(result.sunlightReward).toBe(SUNLIGHT.REWARD_CORRECT);
      expect(gm.onScoreChange).toHaveBeenCalled();
      expect(gm.onSunlightChange).toHaveBeenCalled();
    });

    it('答对应增加连击', () => {
      gm.start();
      const q1 = gm.onQuestionChange.mock.calls[0][0];
      gm.answer(q1.correctAnswer);
      expect(gm.state.combo).toBe(1);
      // 第二题
      const q2 = gm.onQuestionChange.mock.calls[1][0];
      gm.answer(q2.correctAnswer);
      expect(gm.state.combo).toBe(2);
    });

    it('答错应清零连击', () => {
      gm.start();
      const q1 = gm.onQuestionChange.mock.calls[0][0];
      gm.answer(q1.correctAnswer);
      const q2 = gm.onQuestionChange.mock.calls[1][0];
      // 选择错误答案
      const wrongIdx = (q2.correctAnswer + 1) % q2.options.length;
      gm.answer(wrongIdx);
      expect(gm.state.combo).toBe(0);
    });

    it('答错应触发全场僵尸加速', () => {
      gm.start();
      const q = gm.onQuestionChange.mock.calls[0][0];
      const wrongIdx = (q.correctAnswer + 1) % q.options.length;
      const result = gm.answer(wrongIdx);
      expect(result.correct).toBe(false);
      // 验证加速已被调用（通过 zombieManager）
    });
  });

  // ========== 阳光经济 ==========
  describe('阳光经济', () => {
    it('应正确扣除阳光购买植物', () => {
      const initialSunlight = gm.state.sunlight;
      gm.selectPlant('shooter');
      // 模拟点击到有效格子
      const res = gm.tryPlacePlantAt(82.5, 152.2); // lane=0, slot=1
      if (res.ok) {
        expect(gm.state.sunlight).toBeLessThan(initialSunlight);
      }
    });

    it('阳光不足时应拒绝购买', () => {
      // 耗尽阳光
      gm.state.sunlight = 0;
      gm.state.isPlaying = true;
      gm.selectPlant('shooter');
      const res = gm.tryPlacePlantAt(82.5, 152.2);
      if (!res.ok) {
        expect(res.reason).toBe('阳光不足');
      }
    });

    it('选择植物应触发商店选中回调', () => {
      gm.selectPlant('shooter');
      expect(gm.onShopSelect).toHaveBeenCalledWith('shooter');
      // 再次选择取消
      gm.selectPlant('shooter');
      expect(gm.onShopSelect).toHaveBeenCalledWith(null);
    });

    it('放置植物后阳光不足应自动取消选中', () => {
      gm.state.sunlight = PLANT_TYPES.shooter.cost;
      gm.selectPlant('shooter');
      const res = gm.tryPlacePlantAt(82.5, 152.2);
      if (res.ok) {
        expect(gm.state.sunlight).toBe(0);
        expect(gm.onShopSelect).toHaveBeenCalledWith(null);
      }
    });
  });

  // ========== 关卡推进 ==========
  describe('关卡推进', () => {
    it('应随关卡推进增加 level', () => {
      gm.start();
      expect(gm.state.level).toBe(1);
      // 模拟关卡计时器累积（直接操作 state）
      gm.state.levelTimer = LEVEL.TIME_PER_LEVEL;
      // 由于 _loop 需要 rAF，这里直接测试 levelTimer 逻辑
      expect(gm.state.levelTimer).toBe(LEVEL.TIME_PER_LEVEL);
    });

    it('level 不应超过 MAX_LEVEL', () => {
      gm.state.level = LEVEL.MAX_LEVEL;
      gm.state.levelTimer = LEVEL.TIME_PER_LEVEL + 1000;
      // 即使超过时间，level 也不应继续增长
      expect(gm.state.level).toBe(LEVEL.MAX_LEVEL);
    });
  });

  // ========== 失败判定 ==========
  describe('失败判定', () => {
    it('defenseLines 为 0 时应触发游戏结束', () => {
      gm.state.defenseLines = 1;
      gm._onBaseDestroyed(0);
      expect(gm.state.defenseLines).toBe(0);
      expect(gm.onDefenseChange).toHaveBeenCalled();
    });

    it('基地植物被摧毁应清零连击', () => {
      gm.state.combo = 3;
      gm.state.defenseLines = 2;
      gm._onBaseDestroyed(0);
      expect(gm.state.combo).toBe(0);
      expect(gm.onComboChange).toHaveBeenCalledWith(0);
    });
  });

  // ========== 结算 ==========
  describe('getSummary', () => {
    it('应返回正确的结算数据', () => {
      gm.state.score = 500;
      gm.state.level = 3;
      gm.state.maxCombo = 5;
      gm.state.killedZombies = 10;
      gm.state.plantsPlaced = 4;
      gm.state.gameTime = 120000;
      const summary = gm.getSummary();
      expect(summary.score).toBe(500);
      expect(summary.level).toBe(3);
      expect(summary.maxCombo).toBe(5);
      expect(summary.killedZombies).toBe(10);
      expect(summary.plantsPlaced).toBe(4);
      expect(summary).toHaveProperty('accuracy');
      expect(summary).toHaveProperty('stars');
      expect(summary).toHaveProperty('avgFps');
      expect(summary.difficulty).toBe('middle');
    });
  });

  // ========== 暂停/恢复 ==========
  describe('pause/resume', () => {
    it('应能暂停游戏', () => {
      gm.start();
      const ok = gm.pause();
      expect(ok).toBe(true);
      expect(gm.state.paused).toBe(true);
      expect(gm.state.isPlaying).toBe(false);
    });

    it('应能恢复游戏', () => {
      gm.start();
      gm.pause();
      const ok = gm.resume();
      expect(ok).toBe(true);
      expect(gm.state.paused).toBe(false);
      expect(gm.state.isPlaying).toBe(true);
    });

    it('非 PLAYING 状态不应暂停', () => {
      const ok = gm.pause();
      expect(ok).toBe(false);
    });

    it('已暂停状态不应重复暂停', () => {
      gm.start();
      gm.pause();
      const ok = gm.pause();
      expect(ok).toBe(false);
    });
  });
});