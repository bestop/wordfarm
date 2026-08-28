// pages/game/game.js - 游戏页：Canvas渲染 + HUD + 答题面板

const app = getApp();
const { gameManager, PHASE } = require('../../utils/gameManager.js');
// D4: 模块期同步读 app.globalData.layout，避免首帧 1334rpx 硬编码闪烁
const _initLayout = (app.globalData && app.globalData.layout) || {};
const _initPageHeight = _initLayout.windowHeightRpx || 1334;
const _initSafeBottomRpx = _initLayout.safeBottomRpx || 0;
const { renderer } = require('../../utils/renderer.js');
const { pathManager } = require('../../utils/pathManager.js');
const { DIFFICULTY_CONFIG, UI, ASSET_KEYS, PLANT_TYPES, PLANT_ORDER, SUNLIGHT } = require('../../utils/constants.js');
const audioManager = require('../../utils/audioManager.js');
const storageManager = require('../../utils/storageManager.js');
const { WORD_BANK } = require('../../data/words.js');
const { applyLayout } = require('../../utils/layoutUtil.js');

// 植物选择提示浮层的自动隐藏计时器（跨回调共享）
let _plantTipTimer = null;

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
    paused: false,
    // 阳光经济 / 植物
    sunlight: SUNLIGHT.INITIAL,
    selectedPlant: null,
    selectedPlantName: '',
    plantTipVisible: false,
    shopItems: buildShopItems(SUNLIGHT.INITIAL),
    // 题目
    currentQuestion: null,
    feedback: 'idle',         // 'idle' | 'correct' | 'wrong'
    quizDisabled: false,
    // 布局
    // 自适应布局
    pageHeight: _initPageHeight,
    safeBottomRpx: _initSafeBottomRpx,
    quizSpacerH: 340,      // v14: fixed 面板占位高度（实测后更新，默认 340 兜底）
    // v3: 可收集阳光视图数组（DOM层可点击☀️图标）
    sunsView: [],
    // 游戏结束结算浮层（一屏显示，禁止滚动）
    gameOverVisible: false,
    gameOverSummary: null,
    gameOverIsRecord: false
  },

  onLoad(options) {
    const difficulty = options.difficulty || app.globalData.difficulty || 'middle';
    this.setData({
      difficulty,
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
    gameManager.onShopSelect = (type) => this._onPlantSelectionChanged(type);
    gameManager.onGameOver = (summary) => this._onGameOver(summary);
    gameManager.onSunsChange = (view) => this.setData({ sunsView: view });
  },

  /**
   * 植物选中状态变化回调：
   * - 翻译 type → 中文名
   * - 选中时弹出柔和提示，并在 2600ms 后自动隐藏（避免持续干扰主操作）
   * - 取消选中时立即隐藏提示
   */
  _onPlantSelectionChanged(type) {
    if (_plantTipTimer) {
      clearTimeout(_plantTipTimer);
      _plantTipTimer = null;
    }
    const name = (type && PLANT_TYPES[type]) ? PLANT_TYPES[type].name : '';
    if (type) {
      this.setData({
        selectedPlant: type,
        selectedPlantName: name,
        plantTipVisible: true
      });
      _plantTipTimer = setTimeout(() => {
        this.setData({ plantTipVisible: false });
        _plantTipTimer = null;
      }, 2600);
    } else {
      this.setData({
        selectedPlant: null,
        selectedPlantName: '',
        plantTipVisible: false
      });
    }
  },

  /**
   * 横竖屏切换 / 窗口尺寸变化时重新计算布局
   * v6 修复 (Task 7-B F8): 同步通知 renderer / pathManager 重新同步内部尺寸状态，
   *  避免旋转/分屏后画面错位（背景离屏缓存过期、路径采样过期）
   */
  onAdaptiveResize() {
    applyLayout(this);
    this._resizeCanvas();
  },

  /**
   * v6 修复 (Task 7-B F8): 画布尺寸变化时重新测量 + 通知 renderer / pathManager
   * 与 _initCanvas 不同：不重新 attach、不重启游戏循环，只更新尺寸相关状态
   * 适用场景：wx.onWindowResize 触发的旋转/分屏
   */
  _resizeCanvas() {
    try {
      const query = wx.createSelectorQuery();
      query.select('#gameCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          try {
            if (!res || !res[0] || !res[0].node) return;
            const canvas = res[0].node;
            const w = res[0].width || 0;
            const h = res[0].height || 0;
            if (w <= 0 || h <= 0) return;
            const sys = app.globalData.systemInfo;
            const dpr = sys.pixelRatio || 1;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            renderer.onResize(w, h, dpr);
            pathManager.setCanvasSize(w, h);
            pathManager.init();
          } catch (err) {
            console.warn('[Game] _resizeCanvas 异步回调异常:', err);
          }
        });
    } catch (err) {
      console.warn('[Game] _resizeCanvas 失败:', err);
    }
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
    // v6 修复 (Task 7-C F4)：清理植物提示 timer，防止页面卸载后 setData-on-destroyed 警告
    if (_plantTipTimer) { clearTimeout(_plantTipTimer); _plantTipTimer = null; }
    gameManager.destroy();
  },

  /**
   * 初始化 Canvas
   * 布局策略：canvas-wrap 采用 flex:1 自动填充剩余空间，
   * quiz-wrap 采用内容自适应高度（v10：题目+4选项完整显示后剩余归 canvas），
   * canvas 实际尺寸在 DOM 渲染后通过 SelectorQuery 实测获取。
   */
  _initCanvas() {
    try {
      const sys = app.globalData.systemInfo;
      const dpr = sys.pixelRatio || 1;

      // v6 修复 (Task 11 F15): 删除 ready 字段后用 wx.nextTick 触发调度
      //  wx.nextTick 是微任务（基础库 2.7.0+ 全可用），降级 setTimeout(0) 保证不静默失败
      const _scheduleAfterRender = wx.nextTick
        ? (cb) => wx.nextTick(cb)
        : (cb) => setTimeout(cb, 0);
      _scheduleAfterRender(() => {
        this._tryInitCanvasNode(dpr, 0);
        this._measureQuizPanel(false);   // v14: 实测面板高度 → 更新 spacer
      });
    } catch (err) {
      console.error('[Game] _initCanvas 失败:', err);
      this._showInitError();
    }
  },

  /**
   * v14: 实测 fixed 答题面板的实际渲染高度，同步更新文档流占位 spacer。
   * 保证 canvas（flex 弹性区）计算出的可用空间 = 视口 - HUD - 商店栏 - 面板实际高度，
   * 面板则始终钉在视口底部完整显示 4 个答案选项。
   */
  _measureQuizPanel(retry) {
    const query = wx.createSelectorQuery();
    query.select('#quizPanelHost')
      .boundingClientRect()
      .exec((res) => {
        try {
          const rect = res && res[0];
          if (rect && rect.height > 0) {
            const sys = app.globalData.systemInfo;
            const pxToRpx = (px) => px * 750 / (sys.windowWidth || 375);
            const h = Math.ceil(pxToRpx(rect.height));
            if (h > 0 && Math.abs(h - this.data.quizSpacerH) > 2) {
              this.setData({ quizSpacerH: h });
            }
          } else if (!retry) {
            // 首次测量失败：300ms 后重试一次（面板渲染可能有延迟）
            setTimeout(() => this._measureQuizPanel(true), 300);
          }
        } catch (err) {
          console.warn('[Game] 面板高度测量异常:', err);
        }
      });
  },

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
            // 兜底估算：屏高 - HUD - 商店栏 - 答题面板(自适应≈题目70rpx+选项120rpx+padding)
            const rpxToPx = (rpx) => rpx * screenW / 750;
            const hudHpx = rpxToPx(UI.HUD_HEIGHT);
            const shopBarHpx = rpxToPx(UI.SHOP_BAR_HEIGHT);
            const quizPanelHpx = rpxToPx(200);
            canvasHpx = Math.max(200, screenH - hudHpx - shopBarHpx - quizPanelHpx);
          }
          const ctx = canvas.getContext('2d');
          // 设置 canvas 实际像素尺寸
          canvas.width = canvasWpx * dpr;
          canvas.height = canvasHpx * dpr;
          ctx.scale(dpr, dpr);

          // 绑定渲染器（内部含离屏缓存错误保护）
          // v6 修复 (Task 7-B F2): 传 canvas 节点供 _preloadImages 调 canvas.createImage()，
          //  激活此前一直走矢量兜底的图片加载路径
          renderer.attach(ctx, canvasWpx, canvasHpx, dpr, canvas);
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
    }, () => {
      // v14: 题目文案长度变化会改变换行数 → 面板高度变化，需重测并同步 spacer
      this._measureQuizPanel(false);
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
   * v6 修复 (Task 7-C F2/F3)：父层 bindtouchend 改为 bindtap，使子元素 catchtap 能正确阻止冒泡。
   *   tap 事件 e.detail.x/y 等价于 e.changedTouches[0].clientX/clientY（同视口坐标系）。
   */
  onCanvasTap(e) {
    if (!this.data.selectedPlant) return;
    // v6 修复 (Task 7-C F3)：暂停状态不响应 canvas 点击，避免误触 toast
    if (this.data.paused) return;
    // tap 事件优先用 e.detail.x/y；兼容老式 touch 事件
    let clientX, clientY;
    if (e.detail && typeof e.detail.x === 'number') {
      clientX = e.detail.x;
      clientY = e.detail.y;
    } else {
      const touch = (e.changedTouches && e.changedTouches[0]) ||
                    (e.touches && e.touches[0]);
      if (!touch) return;
      clientX = touch.clientX;
      clientY = touch.clientY;
    }
    const query = wx.createSelectorQuery();
    query.select('#gameCanvas').boundingClientRect((rect) => {
      if (!rect) return;
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const res = gameManager.tryPlacePlantAt(x, y);
      if (!res.ok) {
        if (res.reason && res.reason !== '未选择植物') {
          wx.showToast({ title: res.reason, icon: 'none', duration: 800 });
        }
      } else if (res.ok) {
        // 放置成功：立即收起选择提示，避免持续遮挡游戏画面
        if (_plantTipTimer) { clearTimeout(_plantTipTimer); _plantTipTimer = null; }
        this.setData({ plantTipVisible: false });
      }
    }).exec();
  },

  /**
   * v3: 玩家点击收集 Canvas 上浮动的阳光
   */
  onSunTap(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id && id !== 0) return;
    gameManager.collectSun(id);
  },

  /**
   * 游戏结束：弹出一屏结算浮层（替代跳转不存在的 result 页，保证单屏完整显示）
   */
  _onGameOver(summary) {
    // 保存结算
    storageManager.saveLastResult(summary);
    // 更新最高分
    const isRecord = app.updateHighestScore(summary.score);
    app.incrementGameCount();
    // 清理遗留的阳光视图 / 答题面板状态
    this.setData({
      sunsView: [],
      quizDisabled: true,
      feedback: 'idle'
    });
    // v6 修复 (Task 7-C F22 + F4)：_gameOver 内部已 _cancelRaf + 设 phase=VICTORY/GAME_OVER，
    //   再调 pause() 会被 phase 守卫拒绝并打印 warn。改为直接清理 plantTip timer。
    if (_plantTipTimer) { clearTimeout(_plantTipTimer); _plantTipTimer = null; }
    // 稍等最后一帧渲染后再弹出浮层（让玩家看到最后结果画面）
    setTimeout(() => {
      this.setData({
        gameOverVisible: true,
        gameOverSummary: summary,
        gameOverIsRecord: isRecord
      });
    }, 900);
  },

  /**
   * 结算页：再来一局（重新初始化本局）
   * v6 修复 (Task 7-C F1)：原调 gameManager.resume() 会被 phase 守卫拒绝（initGame 后 phase=READY），
   *   导致循环不启动 + 题目永久卡住。改为 start()：内部 transition 到 PLAYING + 生成首题 + 启动 _loop。
   */
  onGameOverRestart() {
    const difficulty = this.data.difficulty;
    // v6 修复 (Task 7-C F4)：清理植物提示 timer，防止跨局泄漏
    if (_plantTipTimer) { clearTimeout(_plantTipTimer); _plantTipTimer = null; }
    // 重置结束浮层
    this.setData({
      gameOverVisible: false,
      gameOverSummary: null,
      gameOverIsRecord: false,
      score: 0,
      defenseLines: 3,
      level: 1,
      combo: 0,
      sunlight: SUNLIGHT.INITIAL,
      selectedPlant: null,
      selectedPlantName: '',
      plantTipVisible: false,
      shopItems: buildShopItems(SUNLIGHT.INITIAL),
      currentQuestion: null,
      feedback: 'idle',
      quizDisabled: false,
      paused: false,
      sunsView: []
    });
    // 重新初始化游戏管理器
    gameManager.initGame(difficulty, WORD_BANK);
    gameManager.start();   // v6 修复：start() 内部会 transition 到 PLAYING 并启动 _loop
  },

  /**
   * 结算页：返回首页
   */
  onGameOverHome() {
    // 先关闭浮层，避免返回后还残留展示
    this.setData({
      gameOverVisible: false,
      gameOverSummary: null
    });
    wx.navigateBack({
      fail: () => {
        // navigateBack 失败（比如首页 directTo 过来没有栈）则 reLaunch
        wx.reLaunch({ url: '/pages/index/index' });
      }
    });
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
          // v6 修复 (Task 7-C F4)：清理植物提示 timer
          if (_plantTipTimer) { clearTimeout(_plantTipTimer); _plantTipTimer = null; }
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
