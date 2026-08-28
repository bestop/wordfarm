// pages/index/index.js - 欢迎页（v3 layout 清新农场风）：自定义导航栏 + 统计卡 + 难度胶囊 + 玩法网格 + Banner + 开始

const app = getApp();
const { applyLayout } = require('../../utils/layoutUtil.js');
// D4: 模块期同步读 app.globalData.layout，避免首帧 1334rpx 硬编码闪烁
const _initLayout = (app.globalData && app.globalData.layout) || {};
const _initPageHeight = _initLayout.windowHeightRpx || 1334;
const _initSafeBottomRpx = _initLayout.safeBottomRpx || 0;
const audioManager = require('../../utils/audioManager.js');
const storageManager = require('../../utils/storageManager.js');
const { ASSET_KEYS } = require('../../utils/constants.js');

Page({
  data: {
    // 游戏数据
    difficulty: 'middle',
    soundEnabled: true,
    highestScore: 0,
    totalGames: 0,

    // 自定义导航栏（与 capsule 按钮对齐）
    statusBarHeight: 20,
    navBarHeight: 44,          // 44px 为 iOS 标准导航条
    capsuleRight: 12,          // 胶囊右侧距边

    // 自适应
    safeTop: 0,
    safeBottom: 0,
    pageHeight: _initPageHeight,
    safeBottomRpx: _initSafeBottomRpx,

    // 难度列表
    difficulties: [
      { key: 'primary', name: '小学' },
      { key: 'middle',  name: '中学' },
      { key: 'college', name: '大学' }
    ],

    // 玩法卡（单行 4 列，展示游戏核心循环 — 原第二排重复内容已移除）
    howtoList: [
      { id: 'a1', icon: '✅', title: '答对消除', bg: '#E9F8EA' },
      { id: 'a2', icon: '⚡',  title: '答错加速', bg: '#FFF6E0' },
      { id: 'a3', icon: '🔥',  title: '连击翻倍', bg: '#FFECEC' },
      { id: 'a4', icon: '🛡️', title: '防线守卫', bg: '#EAF0FF' }
    ]
  },

  onLoad() {
    const g = app.globalData;
    // 设备胶囊信息 + 状态栏高度（自定义导航栏必备）
    let statusBar = 20;
    let navBarInner = 44;
    let capsuleRight = 12;
    try {
      const sys = wx.getSystemInfoSync();
      statusBar = sys.statusBarHeight || 20;
      const m = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
      if (m) {
        // 导航条高度 = 胶囊顶到状态栏的距离 * 2 + 胶囊高度
        const topGap = m.top - statusBar;
        navBarInner = topGap * 2 + m.height;
        capsuleRight = sys.windowWidth - m.right;
      }
    } catch (e) { /* ignore */ }

    this.setData({
      difficulty: g.difficulty,
      soundEnabled: g.soundEnabled,
      highestScore: g.highestScore,
      totalGames: g.totalGames,
      safeTop: g.safeAreaInset.top,
      safeBottom: g.safeAreaInset.bottom,
      statusBarHeight: statusBar,
      navBarHeight: navBarInner,
      capsuleRight: Math.max(12, capsuleRight)
    });
    applyLayout(this);
  },

  onShow() {
    this.setData({
      highestScore: app.globalData.highestScore,
      totalGames: app.globalData.totalGames
    });
  },

  onAdaptiveResize() {
    applyLayout(this);
  },

  /* ============ 事件 ============ */

  onBack() {
    // 首页无上一页，轻弹提示
    wx.showToast({ title: '已经是首页啦', icon: 'none', duration: 800 });
  },

  onSelectDifficulty(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    this.setData({ difficulty: key });
    app.globalData.difficulty = key;
    storageManager.saveUserData({
      highestScore: app.globalData.highestScore,
      totalGames: app.globalData.totalGames,
      difficulty: key,
      soundEnabled: app.globalData.soundEnabled
    });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  },

  onToggleSound() {
    const next = !this.data.soundEnabled;
    this.setData({ soundEnabled: next });
    app.globalData.soundEnabled = next;
    audioManager.setEnabled(next);
    storageManager.saveUserData({
      highestScore: app.globalData.highestScore,
      totalGames: app.globalData.totalGames,
      difficulty: app.globalData.difficulty,
      soundEnabled: next
    });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  },

  onKnowMore() {
    wx.showModal({
      title: '怎么玩？一条告诉你 🌱',
      content:
        '【1】答对题：植物发射豌豆打僵尸，得阳光+分数\n' +
        '【2】答错题：僵尸会跑得更快，要集中精神哦\n' +
        '【3】连续答对：触发连击！分数翻倍涨\n' +
        '【4】向日葵会掉阳光☀️，点一点就能收集，用它种更多植物\n' +
        '【5】有 3 条防线，都被僵尸突破就算失败啦\n' +
        '【6】撑到最后一波，把僵尸全部清理干净就通关胜利！',
      showCancel: false,
      confirmText: '我知道啦',
      confirmColor: '#5AA454'
    });
  },

  onStart() {
    audioManager.play(ASSET_KEYS.AUDIO.START);
    wx.navigateTo({
      url: '/pages/game/game?difficulty=' + this.data.difficulty,
      fail: (err) => {
        console.error('[Index] 跳转游戏页失败:', err);
        wx.showToast({ title: '页面加载失败', icon: 'none' });
      }
    });
  },

  onBannerStart() {
    this.onStart();
  },

  onShareAppMessage() {
    return {
      title: '单词农场 - 边玩边背单词，保卫你的小庄园！',
      path: '/pages/index/index',
      imageUrl: ''
    };
  }
});
