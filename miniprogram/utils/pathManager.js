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
  }

  /**
   * 初始化（保留接口兼容，直线车道无需预采样）
   */
  init() {
    this.initialized = true;
  }

  /**
   * 设置 canvas 尺寸
   */
  setCanvasSize(w, h) {
    this.canvasSize = { w, h };
  }

  /**
   * 获取路径数量（=车道数=GRID.ROWS）
   */
  getPathCount() {
    return GRID.ROWS;
  }

  // ============ 网格几何 ============

  /**
   * 获取网格像素边界
   */
  getGridBounds() {
    return {
      left: this.canvasSize.w * GRID.LEFT_RATIO,
      right: this.canvasSize.w * (1 - GRID.RIGHT_RATIO),
      top: this.canvasSize.h * GRID.TOP_RATIO,
      bottom: this.canvasSize.h * (1 - GRID.BOTTOM_RATIO)
    };
  }

  /**
   * 网格顶部 Y（spawn 区下沿）
   */
  getGridTop() {
    return this.canvasSize.h * GRID.TOP_RATIO;
  }

  /**
   * 单元格尺寸
   * 注意：横向按 ROWS(车道) 划分，纵向按 COLS(槽位) 划分
   */
  getCellSize() {
    const b = this.getGridBounds();
    return {
      w: (b.right - b.left) / GRID.ROWS,
      h: (b.bottom - b.top) / GRID.COLS
    };
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
