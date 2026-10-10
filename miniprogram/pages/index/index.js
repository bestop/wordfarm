// pages/index/index.js - 欢迎页（v7 UI 统一协调）：自定义导航栏 + 统计卡 + 难度胶囊 + 玩法网格 + Banner + 开始
// v7 设计 tokens（基于模块节奏 = 18rpx 的 1/3/2/3 比例）：
//   字号 5 级 / 圆角 3 级 / 间距 3 级 / 文本色 3 级

const app = getApp();
const { applyLayout } = require('../../utils/layoutUtil.js');
// D4: 模块期同步读 app.globalData.layout，避免首帧 1334rpx 硬编码闪烁
const _initLayout = (app.globalData && app.globalData.layout) || {};
const _initPageHeight = _initLayout.windowHeightRpx || 1334;
const _initSafeBottomRpx = _initLayout.safeBottomRpx || 0;
const audioManager = require('../../utils/audioManager.js');
const storageManager = require('../../utils/storageManager.js');
const { ASSET_KEYS } = require('../../utils/constants.js');
const { rewardManager } = require('../../utils/rewardManager.js');
const customWordPack = require('../../utils/customWordPack.js');

Page({
  data: {
    // 游戏数据
    difficulty: 'junior',
    soundEnabled: true,
    highestScore: 0,
    totalGames: 0,
    rewardPoints: 0,          // v32: 亲子积分（奖励中心入口）
    knowMoreVisible: false,   // v33: 「立即了解」玩法弹窗显隐
    customPackInfo: null,     // v35: 已导入词包 {name, count} | null

    // 自定义导航栏（与 capsule 按钮对齐）
    statusBarHeight: 20,
    navBarHeight: 44,          // 44px 为 iOS 标准导航条
    capsuleRight: 12,          // 胶囊右侧距边

    // 自适应
    safeTop: 0,
    safeBottom: 0,
    pageHeight: _initPageHeight,
    safeBottomRpx: _initSafeBottomRpx,

    // 难度列表（v50: 中学拆初中/高中、大学退役、新增 KET/PET 考试档，共 6 项）
    difficulties: [
      { key: 'primary', name: '小学' },
      { key: 'junior',  name: '初中' },
      { key: 'senior',  name: '高中' },
      { key: 'ket',     name: 'KET' },
      { key: 'pet',     name: 'PET' },
      { key: 'custom',  name: '导入词库' }
    ],

    // 玩法卡（单行 4 列，展示游戏核心循环 — 原第二排重复内容已移除）
    // v63: 底色同步「木语农场」纸色系（手账纸签调）
    howtoList: [
      { id: 'a1', icon: '✅', title: '答对消除', bg: '#EAF3D9' },
      { id: 'a2', icon: '⚡',  title: '连错加速', bg: '#FBF0D2' },
      { id: 'a3', icon: '🔥',  title: '连击翻倍', bg: '#F9E4D4' },
      { id: 'a4', icon: '🛡️', title: '防线守卫', bg: '#DFEDF3' }
    ],

    // v33: 「立即了解」玩法弹窗内容（6 条规则 · 左对齐卡片式 · 徽章六色循环）
    // v63: 规则纸条底色同步「木语农场」纸色系
    knowMoreList: [
      { id: 'k1', icon: '✅', title: '答对发射豌豆', desc: '答对单词，植物立即开火，阳光分数双收',
        bg: '#EAF3D9', numBg: 'linear-gradient(180deg, #9CCC65, #558B2F)', numColor: '#FFFFFF' },
      { id: 'k2', icon: '⚡', title: '连续答错才加速', desc: '连续答错两题僵尸才狂奔，偶尔答错别紧张',
        bg: '#FBF0D2', numBg: 'linear-gradient(180deg, #FFC940, #EF8F00)', numColor: '#FFFFFF' },
      { id: 'k3', icon: '🔥', title: '连击分数翻倍', desc: '连续答对触发连击，分数越滚越高',
        bg: '#F9E4D4', numBg: 'linear-gradient(180deg, #FF8A65, #D84315)', numColor: '#FFFFFF' },
      { id: 'k4', icon: '🌻', title: '收集掉落阳光', desc: '向日葵定期掉阳光，点一点就能收集',
        bg: '#FCF2C8', numBg: 'linear-gradient(180deg, #FBC02D, #E65100)', numColor: '#FFFFFF' },
      { id: 'k5', icon: '🛡️', title: '守住三条防线', desc: '三条防线全部失守，本关就失败啦',
        bg: '#DFEDF3', numBg: 'linear-gradient(180deg, #81CCE8, #2E88B5)', numColor: '#FFFFFF' },
      { id: 'k6', icon: '🏆', title: '清场即通关', desc: '撑到最后一波，清光僵尸赢下胜利',
        bg: '#EFE1F0', numBg: 'linear-gradient(180deg, #CE93D8, #8E24AA)', numColor: '#FFFFFF' }
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
      rewardPoints: rewardManager.getWallet().points,
      customPackInfo: g.customPack ? { name: g.customPack.name, count: g.customPack.count } : null,
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
      totalGames: app.globalData.totalGames,
      rewardPoints: rewardManager.getWallet().points
    });
  },

  /**
   * v32: 打开亲子奖励中心（首页第 4 张统计卡入口）
   */
  onOpenRewards() {
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    wx.navigateTo({
      url: '/pages/rewards/rewards',
      fail: (err) => {
        console.error('[Index] 跳转奖励中心失败:', err);
        wx.showToast({ title: '页面加载失败', icon: 'none' });
      }
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

    // v35: 导入词库档 — 特殊处理
    if (key === 'custom') {
      const pack = customWordPack.loadPack();
      if (!pack) {
        // 未导入过 → 直接发起导入
        this._importWordPack();
        return;                     // 导入失败/取消不选中
      }
      if (this.data.difficulty === 'custom') {
        // 已选中状态再点 → 管理面板（换词库/清除）
        this._manageWordPack();
        return;
      }
      // 有词库且未选中 → 选中它（走下方通用选中流程）
    } else if (this.data.difficulty === 'custom') {
      // 从 custom 切走：提示词库仍保留、可随时切回
      wx.showToast({ title: '词库已保留，随时切回', icon: 'none', duration: 1200 });
    }

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

  /* ============ v35: 自定义词库 ============ */

  /**
   * 发起词库导入：微信聊天文件选择 → 解析 → 持久化 → 选中 custom 档
   */
  _importWordPack() {
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    wx.showLoading({ title: '读取文件…', mask: true });
    customWordPack.importFromFile().then((res) => {
      wx.hideLoading();
      if (res.ok) {
        // 同步全局与页面
        app.globalData.customPack = customWordPack.loadPack();
        this.setData({
          difficulty: 'custom',
          customPackInfo: { name: res.name, count: res.count }
        });
        app.globalData.difficulty = 'custom';
        storageManager.saveUserData({
          highestScore: app.globalData.highestScore,
          totalGames: app.globalData.totalGames,
          difficulty: 'custom',
          soundEnabled: app.globalData.soundEnabled
        });
        wx.showToast({ title: '导入成功！' + res.count + ' 个单词', icon: 'success', duration: 1600 });
      } else if (res.cancelled) {
        // 用户取消选择，静默返回
      } else {
        wx.showModal({
          title: '导入失败',
          content: res.error || '请检查文件格式',
          showCancel: false,
          confirmText: '知道了',
          confirmColor: '#5AA454'
        });
      }
    });
  },

  /**
   * 已选中 custom 档再点击：管理面板（换词库 / 清除）
   */
  _manageWordPack() {
    const info = this.data.customPackInfo || {};
    wx.showActionSheet({
      alertText: '当前词库：' + (info.name || '自定义词库') + '（' + (info.count || 0) + ' 词）',
      itemList: ['换一个词库文件', '清除词库'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this._importWordPack();
        } else if (res.tapIndex === 1) {
          customWordPack.clearPack();
          app.globalData.customPack = null;
          this.setData({ customPackInfo: null });
          wx.showToast({ title: '词库已清除', icon: 'none', duration: 1200 });
        }
      },
      fail: () => { /* 取消 */ }
    });
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

  /* v33: 「立即了解」→ 打开左对齐卡片式玩法弹窗（替代原生 showModal） */
  onKnowMore() {
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({ knowMoreVisible: true });
  },

  /* v33: 关闭弹窗（点遮罩 / 右上角 ✕） */
  onKnowMoreClose() {
    this.setData({ knowMoreVisible: false });
  },

  /* v33: CTA「我知道啦」— 关闭 + 轻震反馈 */
  onKnowMoreConfirm() {
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({ knowMoreVisible: false });
  },

  /* v33: 弹窗内「去瞧瞧」→ 关闭弹窗并跳转奖励中心（联动 v32） */
  onKnowMoreGoRewards() {
    this.setData({ knowMoreVisible: false });
    this.onOpenRewards();
  },

  /* v33: 事件阻断空函数（弹窗卡片 catchtap / 遮罩 catchtouchmove 用） */
  noop() {},

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
