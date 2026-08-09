// pages/index/index.js - 欢迎页：难度选择 + 开始游戏

const app = getApp();
const { applyLayout } = require('../../utils/layoutUtil.js');

Page({
  data: {
    difficulty: 'middle',          // 当前选中难度（小学/中学/大学）
    difficulties: [
      { key: 'primary', name: '小学', desc: '基础词汇 · 慢速僵尸', emoji: '🌱', color: '#B5EAD7' },
      { key: 'middle',  name: '中学', desc: '进阶词汇 · 标准节奏', emoji: '🌿', color: '#FFD1DC' },
      { key: 'college', name: '大学', desc: '高阶词汇 · 高速强敌', emoji: '🎓', color: '#FFDAC1' }
    ],
    soundEnabled: true,
    highestScore: 0,
    totalGames: 0,
    safeTop: 0,
    safeBottom: 0,
    bannerAnim: true,
    // 自适应布局
    pageHeight: 1334,              // 页面可用高度(rpx)，onLoad 中由 layoutUtil 计算
    safeTopRpx: 0,
    safeBottomRpx: 0
  },

  onLoad() {
    // 同步全局配置到本页
    const g = app.globalData;
    this.setData({
      difficulty: g.difficulty,
      soundEnabled: g.soundEnabled,
      highestScore: g.highestScore,
      totalGames: g.totalGames,
      safeTop: g.safeAreaInset.top,
      safeBottom: g.safeAreaInset.bottom
    });
    // 应用自适应布局（计算 pageHeight / safeTopRpx / safeBottomRpx）
    applyLayout(this);
  },

  /**
   * 横竖屏切换 / 窗口尺寸变化时重新计算布局
   * 由 app.js 的 wx.onWindowResize 回调触发
   */
  onAdaptiveResize() {
    applyLayout(this);
  },

  onShow() {
    // 重新进入时刷新最高分
    this.setData({ highestScore: app.globalData.highestScore });
  },

  /**
   * 选择难度
   */
  onSelectDifficulty(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ difficulty: key });
    app.globalData.difficulty = key;
    // 持久化
    require('../../utils/storageManager.js').saveUserData({
      highestScore: app.globalData.highestScore,
      totalGames: app.globalData.totalGames,
      difficulty: key,
      soundEnabled: app.globalData.soundEnabled
    });
    // 轻反馈
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  },

  /**
   * 切换音效开关
   */
  onToggleSound() {
    const next = !this.data.soundEnabled;
    this.setData({ soundEnabled: next });
    app.globalData.soundEnabled = next;
    const audio = require('../../utils/audioManager.js');
    audio.setEnabled(next);
    require('../../utils/storageManager.js').saveUserData({
      highestScore: app.globalData.highestScore,
      totalGames: app.globalData.totalGames,
      difficulty: app.globalData.difficulty,
      soundEnabled: next
    });
  },

  /**
   * 开始游戏
   */
  onStart() {
    const audio = require('../../utils/audioManager.js');
    audio.play(require('../../utils/constants.js').ASSET_KEYS.AUDIO.START);
    wx.navigateTo({
      url: '/pages/game/game?difficulty=' + this.data.difficulty,
      fail: (err) => {
        console.error('[Index] 跳转游戏页失败:', err);
        wx.showToast({ title: '页面加载失败', icon: 'none' });
      }
    });
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '单词农场 - 边玩边背单词，保卫你的小庄园！',
      path: '/pages/index/index',
      imageUrl: ''
    };
  }
});
