// pages/rewards/rewards.js - 亲子奖励中心 (v32)
// 三档奖励体系：🟢 即时小奖励（单次通关解锁）/ 🟡 周末中等（连续打卡解锁）/ 🔵 长线大奖（月度目标解锁）
// 兑换需家长确认：长按 2 秒发放（防孩子自行兑换）

const app = getApp();
const { applyLayout } = require('../../utils/layoutUtil.js');
const _initLayout = (app.globalData && app.globalData.layout) || {};
const _initPageHeight = _initLayout.windowHeightRpx || 1334;
const _initSafeBottomRpx = _initLayout.safeBottomRpx || 0;
const audioManager = require('../../utils/audioManager.js');
const { ASSET_KEYS } = require('../../utils/constants.js');
const { rewardManager } = require('../../utils/rewardManager.js');

// 家长确认长按时长（ms）
const PARENT_HOLD_MS = 2000;

Page({
  data: {
    wallet: null,          // {points, streak, monthPoints, monthGoal, ...}
    tiers: [],             // 三档奖励视图模型
    history: [],           // 最近兑换记录
    confirmingId: null,    // 当前展开家长确认的奖励 id
    holdRunning: false,    // 长按进度条动画开关
    // 自适应布局
    pageHeight: _initPageHeight,
    safeBottomRpx: _initSafeBottomRpx
  },

  onLoad() {
    this._holdTimer = null;
    this.refresh();
    applyLayout(this);
  },

  onShow() {
    // 从游戏页返回时刷新积分
    this.refresh();
  },

  onAdaptiveResize() {
    applyLayout(this);
  },

  onUnload() {
    // v52: 家长确认长按计时器兜底清理（防卸载后 _doRedeem 触发已销毁页面 setData）
    if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
  },

  /**
   * 刷新全部页面数据
   */
  refresh() {
    const data = rewardManager.getPageData();
    this.setData({
      wallet: data.wallet,
      tiers: data.tiers,
      history: this._formatHistory(data.history)
    });
  },

  /**
   * 兑换记录时间格式化（相对天数）
   */
  _formatHistory(list) {
    const now = Date.now();
    return list.map(h => {
      const days = Math.floor((now - h.ts) / 86400000);
      let timeText;
      if (days <= 0) timeText = '今天';
      else if (days === 1) timeText = '昨天';
      else {
        const d = new Date(h.ts);
        timeText = (d.getMonth() + 1) + '月' + d.getDate() + '日';
      }
      return { ...h, timeText: timeText };
    });
  },

  /* ============ 兑换流程（家长确认） ============ */

  /**
   * 点击兑换按钮：可兑换 → 展开家长确认；不可兑换 → 提示原因
   */
  onTapRedeem(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (this.data.confirmingId === id) {
      // 再点一次收起
      this.setData({ confirmingId: null, holdRunning: false });
      return;
    }
    const check = rewardManager.checkRedeem(id);
    if (!check.ok) {
      wx.showToast({ title: check.reasonText, icon: 'none', duration: 1800 });
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
      return;
    }
    this.setData({ confirmingId: id, holdRunning: false });
  },

  /**
   * 家长确认：长按开始（启动 2 秒计时 + 进度条动画）
   */
  onHoldStart(e) {
    const id = e.currentTarget.dataset.id;
    if (id !== this.data.confirmingId) return;
    this.setData({ holdRunning: true });
    if (this._holdTimer) clearTimeout(this._holdTimer);
    this._holdTimer = setTimeout(() => {
      this._doRedeem(id);
    }, PARENT_HOLD_MS);
  },

  /**
   * 长按中断（松手过早 / 滑出）：取消计时
   */
  onHoldCancel() {
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }
    if (this.data.holdRunning) {
      // 已经在长按中松手 → 提示需按满 2 秒
      wx.showToast({ title: '请按满 2 秒完成发放', icon: 'none', duration: 1200 });
    }
    this.setData({ holdRunning: false });
  },

  /**
   * 执行兑换
   */
  _doRedeem(id) {
    if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
    const res = rewardManager.redeem(id);
    if (res.ok) {
      audioManager.play(ASSET_KEYS.AUDIO.SUN);   // 轻快铃声，收集感
      if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
      // 找到奖励名用于成功提示
      let name = '';
      for (const t of this.data.tiers) {
        const item = t.items.find(i => i.id === id);
        if (item) { name = item.emoji + ' ' + item.name; break; }
      }
      wx.showToast({ title: '已发放：' + name, icon: 'none', duration: 2200 });
    } else {
      wx.showToast({ title: res.reasonText, icon: 'none', duration: 1800 });
    }
    this.setData({ confirmingId: null, holdRunning: false });
    this.refresh();
  },

  onShareAppMessage() {
    return {
      title: '单词农场亲子奖励 - 边玩边学，攒积分换亲子时光！',
      path: '/pages/index/index'
    };
  }
});
