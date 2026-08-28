// utils/layoutUtil.js - 自适应布局工具
// 提供: 页面可用高度计算(rpx)、安全区适配、横竖屏切换响应
//
// 核心原理:
//   微信小程序中 100vh = screenHeight（含导航栏），比实际可见区域高，
//   导致底部内容被截断。本工具用 windowHeight（排除导航栏的可用高度）
//   转换为 rpx 供 WXML 内联样式使用，确保内容完整显示。
//
// 使用方式:
//   const { applyLayout } = require('../../utils/layoutUtil.js');
//   Page({
//     onLoad() { applyLayout(this); },
//     onAdaptiveResize() { applyLayout(this); }
//   });
//   // WXML: <view class="page" style="height: {{pageHeight}}rpx;">

/**
 * 将布局信息应用到页面 data
 * 设置 pageHeight / safeTopRpx / safeBottomRpx 供 WXML 使用
 * @param {Object} pageInstance - Page 实例 (this)
 */
function applyLayout(pageInstance) {
  const app = getApp();
  let layout = app.globalData && app.globalData.layout;

  // 降级: layout 不存在时直接获取
  if (!layout) {
    try {
      const sys = wx.getSystemInfoSync();
      const rpxRatio = 750 / (sys.windowWidth || 375);
      const safeArea = sys.safeArea || {};
      layout = {
        windowHeightRpx: Math.floor((sys.windowHeight || 667) * rpxRatio),
        safeTopRpx: Math.floor((safeArea.top || 0) * rpxRatio),
        safeBottomRpx: Math.floor(
          Math.max(0, (sys.screenHeight || sys.windowHeight) - (safeArea.bottom || sys.windowHeight)) * rpxRatio
        )
      };
    } catch (e) {
      layout = { windowHeightRpx: 1334, safeTopRpx: 0, safeBottomRpx: 0 };
    }
  }

  pageInstance.setData({
    pageHeight: layout.windowHeightRpx,
    safeTopRpx: layout.safeTopRpx || 0,
    safeBottomRpx: layout.safeBottomRpx || 0
  });
}

/**
 * 获取当前布局信息（供需要 px 值的场景使用，如 Canvas 尺寸计算）
 * @returns {Object} { windowWidth, windowHeight, rpxRatio, safeTopPx, safeBottomPx, ... }
 */
function getLayout() {
  const app = getApp();
  if (app.globalData && app.globalData.layout) {
    return app.globalData.layout;
  }
  // 降级
  try {
    const sys = wx.getSystemInfoSync();
    const rpxRatio = 750 / (sys.windowWidth || 375);
    const safeArea = sys.safeArea || {};
    return {
      windowWidth: sys.windowWidth || 375,
      windowHeight: sys.windowHeight || 667,
      windowHeightRpx: Math.floor((sys.windowHeight || 667) * rpxRatio),
      rpxRatio: rpxRatio,
      safeTopPx: safeArea.top || 0,
      safeBottomPx: Math.max(0, (sys.screenHeight || sys.windowHeight) - (safeArea.bottom || sys.windowHeight)),
      safeTopRpx: Math.floor((safeArea.top || 0) * rpxRatio),
      safeBottomRpx: Math.floor(
        Math.max(0, (sys.screenHeight || sys.windowHeight) - (safeArea.bottom || sys.windowHeight)) * rpxRatio
      )
    };
  } catch (e) {
    return {
      windowWidth: 375, windowHeight: 667, windowHeightRpx: 1334,
      rpxRatio: 2, safeTopPx: 0, safeBottomPx: 0, safeTopRpx: 0, safeBottomRpx: 0
    };
  }
}

/**
 * rpx → px 转换
 * @param {number} rpx
 * @returns {number} px
 */
function rpxToPx(rpx) {
  const layout = getLayout();
  return rpx * layout.windowWidth / 750;
}

/**
 * px → rpx 转换
 * @param {number} px
 * @returns {number} rpx
 */
function pxToRpx(px) {
  const layout = getLayout();
  return px * 750 / layout.windowWidth;
}

module.exports = {
  applyLayout,
  getLayout,
  rpxToPx,
  pxToRpx
};
