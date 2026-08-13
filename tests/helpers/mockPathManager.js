// tests/helpers/mockPathManager.js - PathManager Mock
// 提供确定性的坐标计算，避免依赖真实 Canvas 尺寸

const { GRID } = require('../../miniprogram/utils/constants.js');

/**
 * 创建一个 mock pathManager，所有坐标计算为确定值
 * @param {number} [canvasW=375] - 模拟 canvas 宽度
 * @param {number} [canvasH=600] - 模拟 canvas 高度
 * @returns {Object} mock pathManager 实例
 */
function createMockPathManager(canvasW = 375, canvasH = 600) {
  const b = {
    left: canvasW * GRID.LEFT_RATIO,
    right: canvasW * (1 - GRID.RIGHT_RATIO),
    top: canvasH * GRID.TOP_RATIO,
    bottom: canvasH * (1 - GRID.BOTTOM_RATIO)
  };
  const cs = {
    w: (b.right - b.left) / GRID.ROWS,
    h: (b.bottom - b.top) / GRID.COLS
  };

  return {
    init: jest.fn(),
    setCanvasSize: jest.fn(function(w, h) {
      this._w = w;
      this._h = h;
    }),
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
    }),
    _w: canvasW,
    _h: canvasH
  };
}

module.exports = { createMockPathManager };