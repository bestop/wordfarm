// pages/game/game.js - 游戏页：Canvas渲染 + HUD + 答题面板

const app = getApp();
const { gameManager, PHASE } = require('../../utils/gameManager.js');
const { renderer } = require('../../utils/renderer.js');
const { pathManager } = require('../../utils/pathManager.js');
const { DIFFICULTY_CONFIG, UI, ASSET_KEYS, PLANT_TYPES, PLANT_ORDER, SUNLIGHT } = require('../../utils/constants.js');
const audioManager = require('../../utils/audioManager.js');
const storageManager = require('../../utils/storageManager.js');
const { WORD_BANK } = require('../../data/words.js');
const { applyLayout } = require('../../utils/layoutUtil.js');

/**
 * 构建商店栏数据
 * @param {number} sunlight - 当前阳光
 * @returns {Array} 商店项数组
 */
function buildShopItems(sunlight) {
  return PLANT_ORDER.map(type => {
    const def = PLANT_TYPES[type];
    return {
      type: type,
      name: def.name,
      emoji: def.emoji,
      cost: def.cost,
      affordable: sunlight >= def.cost
    };
  });
}

Page({
  data: {
    // UI 状态
    difficulty: 'middle',
    score: 0,
    defenseLines: 3,          // v2: 防线数（替代 lives）
    level: 1,                 // v2: 当前关卡
    combo: 0,
    comboMult: 1,
    maxCombo: 0,
    fps: 60,
    paused: false,
    // 阳光经济 / 植物
    sunlight: SUNLIGHT.INITIAL,
    selectedPlant: null,
    shopItems: buildShopItems(SUNLIGHT.INITIAL),
    // 题目
    currentQuestion: null,
    feedback: 'idle',         // 'idle' | 'correct' | 'wrong'
    quizDisabled: false,
    // 布局
    quizPanelH: 0,            // 答题面板高度(rpx)
    safeTop: 0,
    safeBottom: 0,
    // 自适应布局
    pageHeight: 1334,
    safeBottomRpx: 0,
    // 初始化标记
    ready: false
  },

  onLoad(options) {
    const difficulty = options.difficulty || app.globalData.difficulty || 'middle';
    this.setData({
      difficulty,
      safeTop: app.globalData.safeAreaInset.top,
      safeBottom: app.globalData.safeAreaInset.bottom,
      defenseLines: 3,
      level: 1
    });
    // 应用自适应布局
    applyLayout(this);

    // 初始化游戏（题库 + 难度）
    gameManager.initGame(difficulty, WORD_BANK);

    // 绑定 gameManager 回调
    gameManager.onStateChange = (state) => this._onStateChange(state);
    gameManager.onQuestionChange = (q) => this._onQuestionChange(q);
    gameManager.onScoreChange = (s) => this.setData({ score: s });
    // v2: 防线变化（替代 onLifeChange）
    gameManager.onDefenseChange = (dl) => {
      this.setData({ defenseLines: dl });
      if (wx.vibrateShort) wx.vibrateShort({ type: 'heavy' });
    };
    // v2: 关卡变化
    gameManager.onLevelChange = (lv) => this.setData({ level: lv });
    gameManager.onComboChange = (c) => this.setData({ combo: c });
    gameManager.onSunlightChange = (sunlight) => this._onSunlightChange(sunlight);
    gameManager.onShopSelect = (type) => this.setData({ selectedPlant: type });
    gameManager.onGameOver = (summary) => this._onGameOver(summary);
  },

  /**
   * 横竖屏切换 / 窗口尺寸变化时重新计算布局
   * 游戏中通常锁定竖屏，此回调主要用于页面初始化阶段的尺寸更新
   */
  onAdaptiveResize() {
    applyLayout(this);
  },

  onReady() {
    // 初始化 Canvas（必须在 onReady 后）
    this._initCanvas();
  },

  onShow() {
    audioManager.resume();
  },

  onHide() {
    // 页面隐藏自动暂停
    if (gameManager.state.isPlaying) {
      gameManager.pause();
      this.setData({ paused: true });
    }
  },

  onUnload() {
    gameManager.destroy();
  },

  /**
   * 初始化 Canvas
   * 布局策略：canvas-wrap 采用 flex:1 自动填充剩余空间，
   * 因此 canvas 实际尺寸需在 DOM 渲染后通过 SelectorQuery 实测获取，
   * 而非手动用 windowHeight 减去各区域高度（HUD 实际高度与常量不符会累积误差）。
   * 关键：必须在 quizPanelH 应用到 WXML 并完成布局后再实测 canvas 尺寸，
   * 否则 canvas 缓冲尺寸与实际 CSS 尺寸不一致会导致绘制错位与点击放置偏移。
   */
  _initCanvas() {
    try {
      const sys = app.globalData.systemInfo;
      const dpr = sys.pixelRatio || 1;
      const screenW = sys.windowWidth;
      const screenH = sys.windowHeight;

      // px → rpx 转换因子: 750rpx = 屏幕宽度
      const pxToRpx = (px) => px * 750 / screenW;

      // 答题面板占屏幕高度 30%（quiz-wrap 高度，box-sizing:border-box 含 safeBottom）
      const quizPanelRatio = UI.QUIZ_PANEL_HEIGHT_RATIO;
      const quizPanelHpx = screenH * quizPanelRatio;

      // 在 setData 回调（视图层已应用 quizPanelH 并完成布局）后再实测 canvas 尺寸
      this.setData({
        quizPanelH: pxToRpx(quizPanelHpx),
        ready: true
      }, () => {
        this._tryInitCanvasNode(dpr, 0);
      });
    } catch (err) {
      console.error('[Game] _initCanvas 失败:', err);
      this._showInitError();
    }
  },

  /**
   * 尝试获取 canvas 节点并初始化（带重试）
   * 首次 onReady 后 wxml 可能未渲染完成，需延迟重试；
   * flex:1 布局下 canvas 实际宽高由 SelectorQuery 实测得到。
   * @param {number} dpr - 设备像素比
   * @param {number} attempt - 当前尝试次数
   */
  _tryInitCanvasNode(dpr, attempt) {
    const MAX_ATTEMPTS = 5;
    const query = wx.createSelectorQuery();
    query.select('#gameCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        // 异步回调内独立 try-catch，防止错误逃逸
        try {
          if (!res || !res[0] || !res[0].node) {
            if (attempt < MAX_ATTEMPTS) {
              console.warn('[Game] Canvas节点未就绪，第' + (attempt + 1) + '次重试...');
              setTimeout(() => this._tryInitCanvasNode(dpr, attempt + 1), 100);
              return;
            }
            console.error('[Game] Canvas节点获取失败（已重试' + MAX_ATTEMPTS + '次）');
            this._showInitError();
            return;
          }
          const canvas = res[0].node;
          // 实测 canvas 渲染尺寸（flex:1 下由布局自动分配）
          let canvasWpx = res[0].width || 0;
          let canvasHpx = res[0].height || 0;
          // 兜底：实测尺寸为 0 时（布局尚未稳定），用屏幕宽高估算
          const sys = app.globalData.systemInfo;
          const screenW = sys.windowWidth;
          const screenH = sys.windowHeight;
          if (canvasWpx <= 0) canvasWpx = screenW;
          if (canvasHpx <= 0) {
            const rpxToPx = (rpx) => rpx * screenW / 750;
            const hudHpx = rpxToPx(UI.HUD_HEIGHT);
            const shopBarHpx = rpxToPx(UI.SHOP_BAR_HEIGHT);
            const quizPanelHpx = screenH * UI.QUIZ_PANEL_HEIGHT_RATIO;
            canvasHpx = Math.max(200, screenH - hudHpx - shopBarHpx - quizPanelHpx);
          }
          const ctx = canvas.getContext('2d');
          // 设置 canvas 实际像素尺寸
          canvas.width = canvasWpx * dpr;
          canvas.height = canvasHpx * dpr;
          ctx.scale(dpr, dpr);

          // 绑定渲染器（内部含离屏缓存错误保护）
          renderer.attach(ctx, canvasWpx, canvasHpx, dpr);
          pathManager.setCanvasSize(canvasWpx, canvasHpx);
          pathManager.init();

          // 保存 canvas 引用给 gameManager 用于 requestAnimationFrame
          gameManager.attachCanvas(canvas);

          // 启动游戏（内部含错误处理）
          gameManager.start();
        } catch (err) {
          console.error('[Game] Canvas初始化回调异常:', err);
          this._showInitError();
        }
      });
  },

  /**
   * 显示初始化错误并返回首页
   */
  _showInitError() {
    wx.showModal({
      title: '初始化失败',
      content: '游戏画面加载失败，请返回重试。如多次失败请检查微信版本是否为 7.0.0 以上。',
      showCancel: false,
      confirmText: '返回首页',
      confirmColor: '#F48FB1',
      success: () => {
        wx.redirectTo({ url: '/pages/index/index' });
      }
    });
  },

  /**
   * 游戏状态变化
   */
  _onStateChange(state) {
    this.setData({
      paused: state.paused,
      combo: state.combo
    });
  },

  /**
   * 题目变化
   */
  _onQuestionChange(q) {
    this.setData({
      currentQuestion: q,
      feedback: 'idle',
      quizDisabled: false
    });
  },

  /**
   * 答题
   */
  onAnswer(e) {
    if (this.data.quizDisabled) return;
    const optionIndex = e.detail.optionIndex;
    this.setData({ quizDisabled: true });

    const result = gameManager.answer(optionIndex);

    if (result.correct) {
      this.setData({ feedback: 'correct' });
      // 短暂延迟后清理反馈（题目会通过回调更新）
      setTimeout(() => {
        this.setData({ feedback: 'idle' });
      }, 350);
    } else {
      this.setData({ feedback: 'wrong' });
      setTimeout(() => {
        this.setData({ feedback: 'idle' });
      }, 500);
    }
  },

  /**
   * 阳光变化：更新 HUD 与商店栏可购买状态
   */
  _onSunlightChange(sunlight) {
    this.setData({
      sunlight: sunlight,
      shopItems: buildShopItems(sunlight)
    });
  },

  /**
   * 商店栏点击：选择/取消植物
   */
  onShopSelect(e) {
    const type = e.currentTarget.dataset.type;
    if (!type) return;
    const item = this.data.shopItems.find(i => i.type === type);
    // 阳光不足时禁止选择
    if (item && !item.affordable) {
      wx.showToast({ title: '阳光不足', icon: 'none', duration: 800 });
      return;
    }
    gameManager.selectPlant(type);
  },

  /**
   * Canvas 点击放置植物
   * 用 boundingClientRect 将 clientX/Y 转为 canvas 内像素坐标
   */
  onCanvasTap(e) {
    if (!this.data.selectedPlant) return;
    const touch = (e.changedTouches && e.changedTouches[0]) ||
                  (e.touches && e.touches[0]);
    if (!touch) return;
    const query = wx.createSelectorQuery();
    query.select('#gameCanvas').boundingClientRect((rect) => {
      if (!rect) return;
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      const res = gameManager.tryPlacePlantAt(x, y);
      if (!res.ok) {
        if (res.reason && res.reason !== '未选择植物') {
          wx.showToast({ title: res.reason, icon: 'none', duration: 800 });
        }
      } else {
        if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
      }
    }).exec();
  },

  /**
   * 游戏结束
   */
  _onGameOver(summary) {
    // 保存结算
    storageManager.saveLastResult(summary);
    // 更新最高分
    const isRecord = app.updateHighestScore(summary.score);
    app.incrementGameCount();
    // 延迟跳转结果页（让玩家看到最后画面）
    setTimeout(() => {
      wx.redirectTo({
        url: '/pages/result/result?isRecord=' + (isRecord ? 1 : 0),
        fail: (err) => {
          console.error('[Game] 跳转结果页失败:', err);
          wx.showToast({ title: '结算加载失败', icon: 'none' });
        }
      });
    }, 1200);
  },

  /**
   * 暂停/继续
   * 事件绑定策略（见 game.wxml 注释）：
   *   - mask catchtap="onTogglePause"（点空白处继续）
   *   - button catchtap 阻止冒泡（避免双触发）
   *   - 80ms 防抖为双保险（部分安卓机型一次 tap 触发 2 次的边缘情况）
   */
  onTogglePause() {
    const now = Date.now();
    if (this._lastTogglePauseTs && now - this._lastTogglePauseTs < 80) return;
    this._lastTogglePauseTs = now;

    if (gameManager.state.paused) {
      const ok = gameManager.resume();
      this.setData({ paused: false });
      console.log('[Game] 继续游戏', { ok, phase: gameManager.state.phase });
    } else {
      const ok = gameManager.pause();
      this.setData({ paused: true });
      console.log('[Game] 暂停游戏', { ok, phase: gameManager.state.phase });
    }
  },

  /**
   * 返回首页（放弃当前局）
   */
  onQuit() {
    wx.showModal({
      title: '放弃本局？',
      content: '当前进度将不会保存',
      confirmText: '放弃',
      cancelText: '继续游戏',
      confirmColor: '#EF5350',
      success: (res) => {
        if (res.confirm) {
          gameManager.destroy();
          wx.redirectTo({ url: '/pages/index/index' });
        }
      }
    });
  },

  /**
   * 分享
   */
  onShareAppMessage() {
    return {
      title: '我在单词农场得了' + this.data.score + '分，快来挑战！',
      path: '/pages/index/index'
    };
  }
});
