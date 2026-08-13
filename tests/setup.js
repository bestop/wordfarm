// tests/setup.js - 全局 Mock 环境
// 模拟微信小程序 wx 全局对象 + Canvas 2D 上下文

// ---------- wx 全局 Mock ----------
global.wx = {
  vibrateShort: jest.fn(),
  showToast: jest.fn(),
  showModal: jest.fn((opts) => {
    if (opts.success) opts.success({ confirm: false });
  }),
  getStorageSync: jest.fn(() => null),
  setStorageSync: jest.fn(),
  removeStorageSync: jest.fn(),
  redirectTo: jest.fn(),
  navigateTo: jest.fn(),
  createOffscreenCanvas: jest.fn(() => {
    const offCtx = createMockCanvasContext();
    return {
      getContext: () => offCtx,
      width: 0,
      height: 0
    };
  }),
  createSelectorQuery: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    fields: jest.fn().mockReturnThis(),
    boundingClientRect: jest.fn().mockReturnThis(),
    exec: jest.fn((cb) => {
      if (cb) cb([{ node: createMockCanvas(), width: 375, height: 600 }]);
    })
  })),
  getSystemInfoSync: jest.fn(() => ({
    pixelRatio: 2,
    windowWidth: 375,
    windowHeight: 667,
    safeArea: { top: 20, bottom: 0 }
  }))
};

// ---------- Canvas Mock ----------
function createMockCanvasContext() {
  return {
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    scale: jest.fn(),
    rotate: jest.fn(),
    beginPath: jest.fn(),
    closePath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    arc: jest.fn(),
    arcTo: jest.fn(),
    ellipse: jest.fn(),
    quadraticCurveTo: jest.fn(),
    bezierCurveTo: jest.fn(),
    rect: jest.fn(),
    fill: jest.fn(),
    stroke: jest.fn(),
    fillRect: jest.fn(),
    clearRect: jest.fn(),
    drawImage: jest.fn(),
    fillText: jest.fn(),
    strokeText: jest.fn(),
    createLinearGradient: jest.fn(() => ({
      addColorStop: jest.fn()
    })),
    setTransform: jest.fn(),
    getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(100) })),
    putImageData: jest.fn(),
    measureText: jest.fn(() => ({ width: 50 })),
    // 样式属性
    set fillStyle(val) { this._fillStyle = val; },
    get fillStyle() { return this._fillStyle; },
    set strokeStyle(val) { this._strokeStyle = val; },
    get strokeStyle() { return this._strokeStyle; },
    set lineWidth(val) { this._lineWidth = val; },
    get lineWidth() { return this._lineWidth; },
    set lineJoin(val) { this._lineJoin = val; },
    get lineJoin() { return this._lineJoin; },
    set lineCap(val) { this._lineCap = val; },
    get lineCap() { return this._lineCap; },
    set globalAlpha(val) { this._globalAlpha = val; },
    get globalAlpha() { return this._globalAlpha; },
    set font(val) { this._font = val; },
    get font() { return this._font; },
    set textAlign(val) { this._textAlign = val; },
    get textAlign() { return this._textAlign; },
    roundRect: jest.fn()
  };
}

function createMockCanvas() {
  const ctx = createMockCanvasContext();
  return {
    getContext: () => ctx,
    width: 375,
    height: 600,
    requestAnimationFrame: jest.fn((cb) => {
      setTimeout(cb, 16);
      return 1;
    }),
    cancelAnimationFrame: jest.fn()
  };
}

// ---------- 全局 Date mock（固定时间基准，避免测试结果依赖真实时间） ----------
const MOCK_NOW = 1700000000000;
Date.now = jest.fn(() => MOCK_NOW);

// ---------- 全局 Math.random seed（可选：确定性测试） ----------
const originalRandom = Math.random;
Math.random = jest.fn(() => 0.5);

// 暴露原始 random 供测试中需要真随机的场景使用
global._originalRandom = originalRandom;

// 注意：jest.clearAllMocks 在 jest.config.js 中通过 clearMocks: true 自动调用