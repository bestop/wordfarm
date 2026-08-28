// app.js - 单词农场微信小程序入口
// 负责全局状态、资源预加载、生命周期管理

const storageManager = require('./utils/storageManager.js');
const audioManager = require('./utils/audioManager.js');

App({
  globalData: {
    // 用户配置
    difficulty: 'middle',        // 难度: primary(小学) / middle(中学) / college(大学)
    soundEnabled: true,          // 音效开关
    // 用户数据
    highestScore: 0,             // 历史最高分
    totalGames: 0,               // 总游戏次数
    // 设备信息
    systemInfo: null,            // 设备信息（含安全区域）
    safeAreaInset: { top: 0, bottom: 0 },
    // 自适应布局信息（onLaunch 中计算）
    layout: null,
    // 资源加载状态
    resourcesLoaded: false,
    // 上局结算（用于结果页）
    lastResult: null
  },

  /**
   * 小程序启动 - 初始化全局数据、预加载资源
   */
  onLaunch(options) {
    try {
      // 1. 获取设备信息（含安全区域）
      const sys = wx.getSystemInfoSync();
      this.globalData.systemInfo = sys;

      // 2. 计算自适应布局信息
      this._computeLayout(sys);

      // 3. 读取本地存储的用户数据
      const stored = storageManager.loadUserData();
      this.globalData.highestScore = stored.highestScore || 0;
      this.globalData.totalGames = stored.totalGames || 0;
      // 老数据迁移：旧版 easy/medium/hard → 新版 primary/middle/college
      const rawDiff = stored.difficulty || 'middle';
      this.globalData.difficulty = this._migrateDifficulty(rawDiff);
      this.globalData.soundEnabled = stored.soundEnabled !== false;

      // 4. 预加载音频资源
      audioManager.init(this.globalData.soundEnabled);

      // 5. 标记资源就绪
      this.globalData.resourcesLoaded = true;

      // 6. 监听屏幕旋转 / 窗口尺寸变化（横竖屏切换）
      if (wx.onWindowResize) {
        wx.onWindowResize((res) => {
          // 重新获取系统信息（旋转后 safeArea 等可能变化）
          try {
            const newSys = wx.getSystemInfoSync();
            this._computeLayout(newSys);
          } catch (e) {
            // 降级: 直接用 resize 返回的尺寸
            const rpxRatio = 750 / res.size.windowWidth;
            if (this.globalData.layout) {
              this.globalData.layout.windowWidth = res.size.windowWidth;
              this.globalData.layout.windowHeight = res.size.windowHeight;
              this.globalData.layout.windowHeightRpx = Math.floor(res.size.windowHeight * rpxRatio);
              this.globalData.layout.rpxRatio = rpxRatio;
              // D2: 旧版本未重置安全区，旋转后切换到横屏时用过期竖屏数据导致错误 padding
              // res.size 未携带 safeArea，无法重新计算，置 0 比留过期值更安全
              this.globalData.layout.safeTopPx = 0;
              this.globalData.layout.safeBottomPx = 0;
              this.globalData.layout.safeTopRpx = 0;
              this.globalData.layout.safeBottomRpx = 0;
            }
          }
          // 通知当前页面重新计算布局
          const pages = getCurrentPages();
          const current = pages[pages.length - 1];
          if (current && typeof current.onAdaptiveResize === 'function') {
            current.onAdaptiveResize(this.globalData.layout);
          }
        });
      }

      console.log('[App] 启动完成', {
        device: sys.model,
        pixelRatio: sys.pixelRatio,
        screenWidth: sys.screenWidth,
        screenHeight: sys.screenHeight,
        windowHeight: sys.windowHeight,
        windowHeightRpx: this.globalData.layout.windowHeightRpx,
        safeArea: this.globalData.safeAreaInset
      });
    } catch (err) {
      console.error('[App] 启动失败:', err);
      // 异常处理: 即便初始化失败，仍允许进入首页
      this.globalData.resourcesLoaded = false;
      // 确保布局信息有默认值
      this._computeLayoutSafe();
    }
  },

  /**
   * 计算自适应布局信息
   * 核心思路: windowHeight 是排除导航栏后的可用高度
   * 将其转换为 rpx 供 WXML 内联样式使用
   * @param {Object} sys - wx.getSystemInfoSync() 返回值
   */
  _computeLayout(sys) {
    // v6 修复 (Task 11 F24): 提取 statusBarHeight 表达式为本地常量，避免 L122/L135 重复
    const fallbackStatusBar = sys.statusBarHeight || (sys.platform === 'android' ? 24 : 20);
    const windowWidth = sys.windowWidth || 375;
    const windowHeight = sys.windowHeight || 667;
    const rpxRatio = 750 / windowWidth;
    const safeArea = (sys.safeArea && typeof sys.safeArea.bottom === 'number') ? sys.safeArea : null;
    // 安全区: 顶部(状态栏) + 底部(home indicator)
    // D1: safeArea 完全缺失时不再用 windowHeight 充当 bottom（会误把导航栏高当作 home indicator）
    let safeTopPx, safeBottomPx;
    if (safeArea) {
      safeTopPx = safeArea.top || 0;
      safeBottomPx = Math.max(0, (sys.screenHeight || windowHeight) - safeArea.bottom);
    } else {
      // safeArea 完全缺失：顶部用 statusBarHeight 公共回退，底部置 0（无 home indicator 信息时不猜测）
      safeTopPx = fallbackStatusBar;
      safeBottomPx = 0;
    }

    this.globalData.layout = {
      windowWidth: windowWidth,
      windowHeight: windowHeight,
      windowHeightRpx: Math.floor(windowHeight * rpxRatio),
      rpxRatio: rpxRatio,
      safeTopPx: safeTopPx,
      safeBottomPx: safeBottomPx,
      safeTopRpx: Math.floor(safeTopPx * rpxRatio),
      safeBottomRpx: Math.floor(safeBottomPx * rpxRatio),
      statusBarHeight: fallbackStatusBar,
      platform: sys.platform || 'unknown'
    };

    // 同时更新 safeAreaInset（向后兼容）
    this.globalData.safeAreaInset = {
      top: safeTopPx,
      bottom: safeBottomPx
    };
  },

  /**
   * 安全降级: 布局计算失败时提供默认值
   */
  _computeLayoutSafe() {
    if (this.globalData.layout) return;
    this.globalData.layout = {
      windowWidth: 375,
      windowHeight: 667,
      windowHeightRpx: 1334,
      rpxRatio: 2,
      safeTopPx: 0,
      safeBottomPx: 0,
      safeTopRpx: 0,
      safeBottomRpx: 0,
      statusBarHeight: 20,
      platform: 'unknown'
    };
  },

  /**
   * 小程序显示
   */
  onShow() {
    audioManager.resume();
  },

  /**
   * 小程序隐藏 - 暂停音频
   */
  onHide() {
    audioManager.pause();
  },

  /**
   * 全局错误捕获
   */
  onError(err) {
    console.error('[App] 全局错误:', err);
    wx.showToast({
      title: '发生错误，请重试',
      icon: 'none',
      duration: 2000
    });
  },

  /**
   * 更新最高分（带本地存储）
   * @param {number} score
   * @returns {boolean} 是否破纪录
   */
  updateHighestScore(score) {
    if (score > this.globalData.highestScore) {
      this.globalData.highestScore = score;
      storageManager.saveUserData({
        highestScore: score,
        totalGames: this.globalData.totalGames,
        difficulty: this.globalData.difficulty,
        soundEnabled: this.globalData.soundEnabled
      });
      return true;
    }
    return false;
  },

  /**
   * 累加游戏次数
   */
  incrementGameCount() {
    this.globalData.totalGames += 1;
    storageManager.saveUserData({
      highestScore: this.globalData.highestScore,
      totalGames: this.globalData.totalGames,
      difficulty: this.globalData.difficulty,
      soundEnabled: this.globalData.soundEnabled
    });
  },

  /**
   * 难度 key 迁移：旧版 easy/medium/hard → 新版 primary/middle/college
   * 兼容老用户 storage 数据，未识别的值回退到 'middle'
   * @param {string} raw
   * @returns {string} primary | middle | college
   */
  _migrateDifficulty(raw) {
    const map = { easy: 'primary', medium: 'middle', hard: 'college' };
    if (raw && Object.prototype.hasOwnProperty.call(map, raw)) {
      return map[raw];
    }
    // 已经是新 key 或未知值，做合法性校验
    if (raw === 'primary' || raw === 'middle' || raw === 'college') return raw;
    return 'middle';
  }
});
