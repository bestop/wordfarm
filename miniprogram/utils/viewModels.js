// utils/viewModels.js - 页面视图模型构建(v56 自 gameManager.js 拆分)
// 纯代码搬运: 原 gameManager._notifySunsView 的 suns→sunsView 映射体抽为
//   纯函数(入参 suns + canvasSize, 出参视图数组, 零实例依赖); onSunsChange
//   分发守卫留守 gameManager(_notifySunsView 薄委托, 方法名不变)
// 跨文件耦合保持: SUN_COLLECT_WINDOW_MS 与 plantManager.update 删除时机
//   必须同步(注记见 constants.js / plantManager.js, 原样有效)
// v37 修复注记随迁: UI 常量消费点在此(原 gameManager 漏导入导致收集太阳报错)
const { SUNLIGHT, UI } = require('./constants.js');

/**
 * v3: 把 plantManager suns 转成页面 DOM 层可显示的视图模型(百分比坐标 + 状态)
 * canvas-wrap 相对定位 → 阳光 left/top 用 canvas 内像素相对 canvas 宽高比转换
 * @param {Array} suns - plantManager.getSuns() 原始阳光对象数组
 * @param {Object} canvasSize - pathManager.canvasSize({w,h}, 缺省兜底 0)
 * @returns {Array} sunsView[] 视图模型(id/value/left/top/opacity/scale/collected)
 */
function buildSunsView(suns, canvasSize) {
  const cs = canvasSize || { w: 0, h: 0 };
  const scaleW = cs.w > 0 ? 100 / cs.w : 0;
  const scaleH = cs.h > 0 ? 100 / cs.h : 0;
  const list = new Array(suns.length);
  for (let i = 0; i < suns.length; i++) {
    const s = suns[i];
    const x = (s.x + (s.offsetX || 0)) * scaleW;
    const y = (s.y + (s.offsetY || 0)) * scaleH;
    // 收集动画：飘到左上角（阳光HUD位置），12~15% progress 期间快速飘入
    let left = x;
    let top = y;
    let opacity = 1;
    let scale = 1;
    // v6 修复 (Task 12): 阳光动画参数 → SUNLIGHT/UI 集中常量
    //   SUN_COLLECT_WINDOW_MS 与 plantManager.update 删除时机必须同步
    if (s.collected) {
      const u = Math.min(1, (s.t - s.collectAt) / SUNLIGHT.SUN_COLLECT_WINDOW_MS);
      left = x * (1 - u);          // 线性插值向 0,0（HUD左上方）
      top = y * (1 - u);
      opacity = 1 - u;
      scale = 1 - UI.SUN_COLLECT_SHRINK * u;
    } else if (s.t < SUNLIGHT.SUN_APPEAR_MS) {
      // 出现动画：0~SUN_APPEAR_MS 弹入放大
      const u = Math.min(1, s.t / SUNLIGHT.SUN_APPEAR_MS);
      scale = UI.SUN_APPEAR_SCALE_START + UI.SUN_APPEAR_SCALE_RANGE * u;
      opacity = u;
    }
    list[i] = {
      id: s.id,
      value: s.value,
      left: left.toFixed(2) + '%',
      top: top.toFixed(2) + '%',
      opacity: opacity.toFixed(2),
      scale: scale.toFixed(2),
      collected: !!s.collected
    };
  }
  return list;
}

module.exports = {
  buildSunsView
};
