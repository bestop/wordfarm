// utils/pathManager.js - 路径管理器
// 直线车道 + 网格坐标系（3 行 × 5 列）
// lane=0,1,2 对应三条竖向车道；slot=0~4 从 spawn 侧(顶) 到 房子侧(底)

const { GRID } = require('./constants.js');

// v6 修复 (Task 11 F7): 删除 cubicBezier / quadBezier / samplePath 三函数 + 全部导出
//  原注释「保留为工具导出」误导，全项目零调用。直线车道下路径采样在 pathManager.init 中也已退化为 initialized=true

/**
 * 路径管理器：直线车道 + 网格坐标系
 */
class PathManager {
  constructor() {
    this.pathSamples = [];   // 保留兼容（直线车道无需预采样）
    this.canvasSize = { w: 0, h: 0 };
    this.initialized = false;
    // v66 性能优化: 网格几何缓存 — 旧版 getGridBounds/getCellSize 每次调用
    //   都新建对象, 而 getPosition/_drawZombie/_drawPlant/投射物碰撞每帧各调
    //   数十~数百次 → 稳定 GC 压力。现改为 setCanvasSize 时一次预计算,
    //   其余方法只读缓存（惰性兜底: 未 setCanvasSize 前调用则按零尺寸构建一次）
    this._bounds = null;     // {left,right,top,bottom}
    this._cell = null;       // {w,h}
  }

  /**
   * 初始化（保留接口兼容，直线车道无需预采样）
   */
  init() {
    this.initialized = true;
  }

  /**
   * 设置 canvas 尺寸（v66: 同步重建几何缓存）
   */
  setCanvasSize(w, h) {
    this.canvasSize = { w, h };
    this._recalcGeometry();
  }

  /**
   * v66: 重算网格几何缓存（bounds + cellSize）
   */
  _recalcGeometry() {
    const { w, h } = this.canvasSize;
    this._bounds = {
      left: w * GRID.LEFT_RATIO,
      right: w * (1 - GRID.RIGHT_RATIO),
      top: h * GRID.TOP_RATIO,
      bottom: h * (1 - GRID.BOTTOM_RATIO)
    };
    this._cell = {
      w: (this._bounds.right - this._bounds.left) / GRID.ROWS,
      h: (this._bounds.bottom - this._bounds.top) / GRID.COLS
    };
  }

  /**
   * 获取路径数量（=车道数=GRID.ROWS）
   */
  getPathCount() {
    return GRID.ROWS;
  }

  // ============ 网格几何（v66: 全部读缓存） ============

  /**
   * 获取网格像素边界（缓存对象, 调用方只读勿改）
   */
  getGridBounds() {
    if (!this._bounds) this._recalcGeometry();
    return this._bounds;
  }

  /**
   * 网格顶部 Y（spawn 区下沿）
   */
  getGridTop() {
    return this.getGridBounds().top;
  }

  /**
   * 单元格尺寸（缓存对象, 调用方只读勿改）
   * 注意：横向按 ROWS(车道) 划分，纵向按 COLS(槽位) 划分
   */
  getCellSize() {
    if (!this._cell) this._recalcGeometry();
    return this._cell;
  }

  /**
   * 网格单元中心像素坐标
   * @param {number} lane - 车道 0~2
   * @param {number} slot - 槽位 0~4
   */
  getGridCellCenter(lane, slot) {
    const b = this.getGridBounds();
    const cs = this.getCellSize();
    return {
      x: b.left + (lane + 0.5) * cs.w,
      y: b.top + (slot + 0.5) * cs.h
    };
  }

  /**
   * 像素坐标 → 网格单元（点击放置用）
   * @returns {{lane, slot} | null}
   */
  pixelToCell(x, y) {
    const b = this.getGridBounds();
    const cs = this.getCellSize();
    if (x < b.left || x > b.right || y < b.top || y > b.bottom) return null;
    const lane = Math.floor((x - b.left) / cs.w);
    const slot = Math.floor((y - b.top) / cs.h);
    if (lane < 0 || lane >= GRID.ROWS || slot < 0 || slot >= GRID.COLS) return null;
    return { lane, slot };
  }

  // ============ 路径位置 ============

  /**
   * 根据进度 t 获取车道上的像素坐标（直线）
   * @param {number} pathIndex - 车道索引 0~2
   * @param {number} t - 进度 0~1（0=spawn顶 1=房子底）
   * @returns {{x, y}} 像素坐标
   */
  getPosition(pathIndex, t) {
    const b = this.getGridBounds();
    const cs = this.getCellSize();
    const laneX = b.left + (pathIndex + 0.5) * cs.w;
    const clampedT = Math.max(0, Math.min(1, t));
    const y = b.top + clampedT * (b.bottom - b.top);
    return { x: laneX, y };
  }

  /**
   * 获取路径总像素长度（直线高度，用于速度换算）
   */
  getPathLength(pathIndex) {
    const b = this.getGridBounds();
    return b.bottom - b.top;
  }
}

// 单例
const pathManager = new PathManager();

module.exports = {
  pathManager,
  PathManager
};
