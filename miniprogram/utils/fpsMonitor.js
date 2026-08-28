// utils/fpsMonitor.js - 帧率监控与动态降级
// 实时统计 FPS，在低端设备自动降低渲染质量

const { PERFORMANCE } = require('./constants.js');

class FpsMonitor {
  constructor() {
    this.frames = 0;
    // v6 修复 (Task 11 F22): lastSampleTime 初始化为 Date.now()，避免 reset() 之前 tick 时首采样 elapsed 巨大导致 bogus 降级
    this.lastSampleTime = Date.now();
    this.fps = 60;
    this.history = [];          // 最近N次采样
    this.historyMax = 10;
    this.qualityLevel = 1;      // 1=高 0.7=中 0.4=低
    this.degradedAt = 0;
  }

  /**
   * 每帧调用
   */
  tick() {
    this.frames++;
    const now = Date.now();
    if (now - this.lastSampleTime >= 500) {
      const elapsed = (now - this.lastSampleTime) / 1000;
      // v6 修复 (Task 11 F23): elapsed > 0 防御，避免时钟回拨或并行 tick 时 NaN 污染 history 数组
      this.fps = elapsed > 0 ? Math.round(this.frames / elapsed) : 0;
      this.history.push(this.fps);
      if (this.history.length > this.historyMax) this.history.shift();
      this.frames = 0;
      this.lastSampleTime = now;
      this._autoDegrade();
    }
  }

  /**
   * 平均FPS
   */
  getAvgFps() {
    if (!this.history.length) return this.fps;
    return Math.round(this.history.reduce((a, b) => a + b, 0) / this.history.length);
  }

  /**
   * 自动降级：连续低于MIN_FPS则降低渲染质量
   */
  _autoDegrade() {
    const avg = this.getAvgFps();
    if (avg < PERFORMANCE.MIN_FPS && this.qualityLevel > 0.4) {
      // 连续3次低于阈值才降级
      const lowCount = this.history.slice(-3).filter(f => f < PERFORMANCE.MIN_FPS).length;
      if (lowCount >= 3) {
        this.qualityLevel = this.qualityLevel === 1 ? 0.7 : 0.4;
        this.degradedAt = Date.now();
        console.warn('[FPS] 性能降级至', this.qualityLevel, '当前FPS:', avg);
      }
    } else if (avg >= PERFORMANCE.TARGET_FPS - 5 && this.qualityLevel < 1) {
      // 性能恢复，尝试升级
      const highCount = this.history.slice(-5).filter(f => f >= PERFORMANCE.TARGET_FPS - 5).length;
      if (highCount >= 5) {
        this.qualityLevel = this.qualityLevel === 0.4 ? 0.7 : 1;
        console.info('[FPS] 性能升级至', this.qualityLevel);
      }
    }
  }

  /**
   * 重置
   */
  reset() {
    this.frames = 0;
    this.lastSampleTime = Date.now();
    this.fps = 60;
    this.history = [];
    this.qualityLevel = 1;
  }

  /**
   * 是否应跳过某些细节渲染（粒子/阴影等）
   */
  shouldSkipDetails() {
    return this.qualityLevel < 0.7;
  }
}

const fpsMonitor = new FpsMonitor();

module.exports = {
  fpsMonitor,
  FpsMonitor
};
