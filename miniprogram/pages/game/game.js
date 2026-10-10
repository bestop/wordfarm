// pages/game/game.js - 游戏页：Canvas渲染 + HUD + 答题面板

const app = getApp();
const { gameManager, PHASE } = require('../../utils/gameManager.js');
// D4: 模块期同步读 app.globalData.layout，避免首帧 1334rpx 硬编码闪烁
const _initLayout = (app.globalData && app.globalData.layout) || {};
const _initPageHeight = _initLayout.windowHeightRpx || 1334;
const _initSafeBottomRpx = _initLayout.safeBottomRpx || 0;
const { renderer } = require('../../utils/renderer.js');
const { pathManager } = require('../../utils/pathManager.js');
const { DIFFICULTY_CONFIG, UI, ASSET_KEYS, PLANT_TYPES, PLANT_ORDER, SUNLIGHT, LEVEL, QUIZ } = require('../../utils/constants.js');
const audioManager = require('../../utils/audioManager.js');
const storageManager = require('../../utils/storageManager.js');
const { rewardManager } = require('../../utils/rewardManager.js');
const { WORD_BANK } = require('../../data/words.js');
const { EXAM_WORD_BANK } = require('../../data/examWords.js');   // v50: KET/PET 剑桥考试词库
// v50: 内置六档喂全量词库（基础 1274 + 考试 679）；custom 档在 onLoad/onRestart 单独喂导入词库
const FULL_WORD_BANK = WORD_BANK.concat(EXAM_WORD_BANK);
const customWordPack = require('../../utils/customWordPack.js');
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
    difficulty: 'junior',
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
    shovelSelected: false,    // v66: 铲子工具选中态（移除植物/半价回收）
    shopItems: buildShopItems(SUNLIGHT.INITIAL),
    // 题目
    currentQuestion: null,
    feedback: 'idle',         // 'idle' | 'correct' | 'wrong' | 'timeout'
    quizDisabled: false,
    // v39: 题目限时倒计时（remainMs=-1 隐藏；500ms 心跳刷新，条宽 CSS transition 平滑）
    quizTimeLimit: 0,
    quizRemainMs: -1,
    // 布局
    // 自适应布局
    pageHeight: _initPageHeight,
    safeBottomRpx: _initSafeBottomRpx,
    // v3: 可收集阳光视图数组（DOM层可点击☀️图标）
    sunsView: [],
    // v61: 里程碑全屏彩带视图数组（纯 CSS 动画层, CLEAR_MS 后整层卸载）
    confettiView: [],
    // 游戏结束结算浮层（一屏显示，禁止滚动）
    gameOverVisible: false,
    gameOverSummary: null,
    gameOverIsRecord: false
  },

  onLoad(options) {
    const difficulty = options.difficulty || app.globalData.difficulty || 'junior';   // v50
    this.setData({
      difficulty,
      defenseLines: 3,
      level: 1
    });
    // 应用自适应布局
    applyLayout(this);

    // 初始化游戏（题库 + 难度）— v35: custom 档优先用导入词库
    const pack = customWordPack.loadPack();
    if (difficulty === 'custom' && pack && pack.words.length) {
      gameManager.initGame(difficulty, pack.words);
      wx.showToast({ title: '词库：' + pack.name, icon: 'none', duration: 1400 });
    } else {
      gameManager.initGame(difficulty, FULL_WORD_BANK);
    }
    // v39: 本局题目限时（难度档配置）+ 倒计时心跳（tick 内守卫齐全，
    //   暂停/未开始/已结束自动静默，interval 生命周期 = 页面生命周期）
    this.setData({ quizTimeLimit: gameManager.getQuizTimeLimit() });
    this._quizTimerId = setInterval(() => this._onQuizTimerTick(), QUIZ.TIMER_TICK_MS);

    // 绑定 gameManager 回调
    gameManager.onStateChange = (state) => this._onStateChange(state);
    gameManager.onQuestionChange = (q) => this._onQuestionChange(q);
    gameManager.onQuizTimeout = () => this._onQuizTimeout();   // v39: 超时反馈浮层
    gameManager.onScoreChange = (s) => this.setData({ score: s });
    // v2: 防线变化（替代 onLifeChange）
    gameManager.onDefenseChange = (dl) => {
      this.setData({ defenseLines: dl });
      if (wx.vibrateShort) wx.vibrateShort({ type: 'heavy' });
    };
    // v2: 关卡变化
    gameManager.onLevelChange = (lv) => {
      this.setData({ level: lv });
      // v38: 末关收官提示 — v51 演进为僵尸王终局大波：王率护卫压场，清完整波即通关
      if (lv >= LEVEL.MAX_LEVEL) {
        wx.showToast({ title: '最后一关！僵尸王带一大波僵尸来袭', icon: 'none', duration: 2500 });
        audioManager.play(ASSET_KEYS.AUDIO.FINAL_WAVE);
        if (wx.vibrateShort) wx.vibrateShort({ type: 'heavy' });
      } else if (LEVEL.MID_WAVES.indexOf(lv) >= 0) {
        // v60: 中场僵尸波预警 — toast 先行, 僵尸经 MID_WAVE_WARN_MS(~1.5s) 后入场
        wx.showToast({ title: '🌊 一大波僵尸正在接近！', icon: 'none', duration: 1800 });
        if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
      }
    };
    gameManager.onComboChange = (c) => this._onComboChange(c);
    gameManager.onSunlightChange = (sunlight) => this._onSunlightChange(sunlight);
    gameManager.onShopSelect = (type) => this._onPlantSelectionChanged(type);
    gameManager.onShovelSelect = (sel) => this.setData({ shovelSelected: !!sel });   // v66: 铲子态同步
    gameManager.onGameOver = (summary) => this._onGameOver(summary);
    gameManager.onSunsChange = (view) => this.setData({ sunsView: view });
  },

  /**
   * v60: 连击变化 — 更新 HUD + 里程碑 toast 反馈
   * 里程碑阈值与 gameManager._resolveComboMilestone 同源（QUIZ.MILESTONES）：
   *   奖励结算（阳光入账/阳光雨/全场冰冻）在管理器侧, 感知反馈（toast +
   *   light 振动）在页面侧; freeze 的 medium 振动由管理器侧负责, 此处
   *   跳过避免双振。combo 断连清零(0)时无 toast 天然静默
   */
  _onComboChange(c) {
    this.setData({ combo: c });
    const m = QUIZ.MILESTONES.find(ms => ms.combo === c);
    if (!m) return;
    // v61: 里程碑升级 — 全屏彩带 + 成就双音 ping（toast 讲清奖励内容, 彩带负责情绪冲击）
    //   音色复用 LEVEL_UP 清亮双音（连击升档语义; 偶与关卡推进同帧亦为同族正向提示）
    audioManager.play(ASSET_KEYS.AUDIO.LEVEL_UP);
    this._launchConfetti(QUIZ.MILESTONES.indexOf(m));
    if (m.type === 'sun') {
      wx.showToast({ title: '🎉 连击 x' + c + '！阳光 +50', icon: 'none', duration: 1200 });
    } else if (m.type === 'sunrain') {
      wx.showToast({ title: '🌞 连击 x' + c + '！天降阳光雨', icon: 'none', duration: 1200 });
    } else if (m.type === 'freeze') {
      wx.showToast({ title: '❄️ 连击 x' + c + '！寒冰脉冲冻结全场', icon: 'none', duration: 1200 });
    }
    if (m.type !== 'freeze' && wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  },

  /**
   * v61: 里程碑全屏彩带 — 纯 CSS 动画层（pointer-events:none, 不拦截答题/收集阳光）
   * 三档强度随 QUIZ.MILESTONES 档位递增: 片数/星星数/顶档金色调;
   * CLEAR_MS 后 wx:if 卸载整层 DOM（零常驻开销）; 计时器登记 _confettiTimer,
   * onUnload/结算/重开统一清理（v52 防已销毁页面 setData 惯例）
   * @param {number} tier - 里程碑档位索引（0=combo5 / 1=combo10 / 2=combo15）
   */
  _launchConfetti(tier) {
    const cfg = QUIZ.CONFETTI;
    const palette = tier >= 2 ? cfg.PALETTE_GOLD : cfg.PALETTE;
    const count = cfg.COUNTS[tier] || cfg.COUNTS[0];
    const paths = ['a', 'b', 'c'];
    const randDur = () => (cfg.DUR_MIN + Math.random() * (cfg.DUR_MAX - cfg.DUR_MIN)).toFixed(2);
    const pieces = [];
    for (let i = 0; i < count; i++) {
      const dot = Math.random() < cfg.DOT_RATIO;
      pieces.push({
        id: i,
        left: (Math.random() * 96).toFixed(1),
        cls: dot ? 'confetti-dot' : 'confetti-strip',
        path: paths[i % paths.length],
        bg: palette[i % palette.length],
        w: dot ? cfg.DOT_SIZE : cfg.STRIP_W,
        h: dot ? cfg.DOT_SIZE : cfg.STRIP_H,
        dur: randDur(),
        delay: (Math.random() * cfg.DELAY_MAX).toFixed(2)
      });
    }
    const stars = cfg.STARS[tier] || 0;
    for (let s = 0; s < stars; s++) {
      pieces.push({
        id: count + s,
        left: (4 + Math.random() * 92).toFixed(1),
        cls: 'confetti-star',
        path: paths[s % paths.length],
        bg: 'transparent',
        emoji: cfg.STAR_EMOJIS[s % cfg.STAR_EMOJIS.length],
        w: 40,
        h: 40,
        dur: randDur(),
        delay: (Math.random() * cfg.DELAY_MAX).toFixed(2)
      });
    }
    if (this._confettiTimer) clearTimeout(this._confettiTimer);
    this.setData({ confettiView: pieces });
    this._confettiTimer = setTimeout(() => {
      this._confettiTimer = null;
      if (this.data.confettiView.length) this.setData({ confettiView: [] });
    }, cfg.CLEAR_MS);
  },

  /**
   * v61: 连续答错护学反馈 — 与管理器侧分层同源：惩罚/喘息结算在 gameManager
   * （二错警示加速一次/三错喘息减速）, 情绪反馈在页面（阶梯鼓励 toast）;
   * 首错保持纯面板红闪不加 toast（避免高频打扰）
   * @param {number} streak - 本次答错后的连续答错次数
   */
  _onWrongStreak(streak) {
    if (streak === SUNLIGHT.PENALTY_WRONG_FREE_STREAK + 1) {
      wx.showToast({ title: '💪 别灰心，慢慢想，你可以的！', icon: 'none', duration: 1400 });
    } else if (streak === QUIZ.RECOVERY.MIN_STREAK) {
      wx.showToast({ title: '🌿 僵尸们也歇了口气，深呼吸～', icon: 'none', duration: 1600 });
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    } else if (streak > QUIZ.RECOVERY.MIN_STREAK) {
      wx.showToast({ title: '🌱 稳住！多读两遍题目，你能行！', icon: 'none', duration: 1400 });
    }
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
            // v43: 幂等护栏 — 尺寸未变时跳过（免 ctx 变换重置 + 背景离屏缓存重建 churn）
            if (this._lastCanvasCssSize &&
                this._lastCanvasCssSize.w === w && this._lastCanvasCssSize.h === h) return;
            const sys = app.globalData.systemInfo;
            const dpr = sys.pixelRatio || 1;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            renderer.onResize(w, h, dpr);
            pathManager.setCanvasSize(w, h);
            pathManager.init();
            this._lastCanvasCssSize = { w: w, h: h };   // v43: 记录已应用尺寸
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
    // v17 布局校验诊断：实测 quiz-wrap 底部是否超出视口（纯 CSS 链路下应永远 OK）
    this._verifyQuizVisibility();
  },

  /**
   * v17 布局校验（Task 21）：SelectorQuery 实测 quiz-wrap 底部 vs 视口高度
   * 纯 CSS 视口链路（page100% → game-page100%）下不应触发；若触发输出诊断日志
   * 帮助真机定位特殊机型渲染差异，不影响游戏逻辑
   */
  _verifyQuizVisibility() {
    try {
      const query = wx.createSelectorQuery();
      query.select('.game-page').boundingClientRect();
      query.select('.quiz-wrap').boundingClientRect();
      query.exec((res) => {
        try {
          if (!res || !res[0] || !res[1]) return;
          const pageRect = res[0];
          const quizRect = res[1];
          const overshoot = (quizRect.bottom || 0) - (pageRect.bottom || 0);
          if (overshoot > 0.5) {
            console.warn('[Game] v17 布局校验: quiz-wrap 底部超出视口', overshoot.toFixed(1) + 'px',
              'pageH=' + pageRect.height, 'quizBottom=' + quizRect.bottom);
          } else {
            console.log('[Game] v17 布局校验通过: 4 选项完整可见, 页面余量',
              ((pageRect.bottom || 0) - (quizRect.bottom || 0)).toFixed(1) + 'px');
          }
        } catch (e) { /* 静默: 诊断逻辑不阻塞游戏 */ }
      });
    } catch (e) { /* 静默: 诊断逻辑不阻塞游戏 */ }
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
    // v39: 清理倒计时心跳与超时反馈 timer
    if (this._quizTimerId) { clearInterval(this._quizTimerId); this._quizTimerId = null; }
    if (this._timeoutFbTimer) { clearTimeout(this._timeoutFbTimer); this._timeoutFbTimer = null; }
    // v52: 反馈消隐/结算浮层延迟 timer（防已销毁页面 setData）
    if (this._feedbackFadeTimer) { clearTimeout(this._feedbackFadeTimer); this._feedbackFadeTimer = null; }
    if (this._gameOverTimer) { clearTimeout(this._gameOverTimer); this._gameOverTimer = null; }
    // v61: 彩带整层卸载计时器
    if (this._confettiTimer) { clearTimeout(this._confettiTimer); this._confettiTimer = null; }
    gameManager.destroy();
  },

  /**
   * 初始化 Canvas
   * 布局策略（v15）：canvas-wrap flex:1 + flex-shrink:1 自动吸收剩余空间，
   * quiz-wrap flex-shrink:0 文档流末端不被压缩，永远完整显示 4 个答案选项。
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
      });
    } catch (err) {
      console.error('[Game] _initCanvas 失败:', err);
      this._showInitError();
    }
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
          // v43: 记录初始实测尺寸（_resizeCanvas 幂等护栏的基准）；复位首题重测标记
          this._lastCanvasCssSize = { w: canvasWpx, h: canvasHpx };
          this._quizPanelMeasured = false;

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
      quizDisabled: false,
      quizRemainMs: q ? gameManager.getQuizRemainMs() : -1,   // v39: 新题倒计时即时满格
      quizTimeLimit: gameManager.getQuizTimeLimit()           // v61: 每题同步有效限时（护学加成后满格基准随之放大）
    }, () => {
      // v43: 首题渲染后面板从「准备中」占位矮态长高（v42 两行选项后 Δ更大）→
      //   canvas-wrap flex:1 收缩, CSS 高度 < 初始化实测值 → 点击 y 整体上移约一行,
      //   表现为「点最下排命中上一格已有植物」。渲染回调里一次性重测 canvas,
      //   恢复「网格坐标 == 当前 CSS 尺寸」不变量（v23 注释的坐标前提）。
      //   护栏: 仅首题(q 真值)触发; 此时零植物/零僵尸, 重测安全;
      //   _resizeCanvas 内置尺寸未变跳过 → 无 churn。
      if (!this._quizPanelMeasured && q) {
        this._quizPanelMeasured = true;
        this._resizeCanvas();
      }
    });
    // v15: quiz-wrap 改为文档流后，flex 自动重排，无需 JS 测高同步
  },

  /**
   * 答题
   */
  onAnswer(e) {
    if (this.data.quizDisabled) return;
    // v52: 暂停态拦截 — 暂停遮罩只盖 canvas 区, quiz-wrap 仍可点; 放行的话
    //   gameManager.answer 被 isPlaying 守卫拒绝(返回 correct:false)但页面已
    //   置 feedback='wrong'+quizDisabled=true → 假错误反馈 + 当前题锁死到超时
    if (this.data.paused) return;
    const optionIndex = e.detail.optionIndex;
    this.setData({ quizDisabled: true });
    // v61: 答题前留底连错计数（答对即被清零, 护学回归认可需要「之前」的值）
    const prevWrongStreak = gameManager.getWrongStreak();

    const result = gameManager.answer(optionIndex);

    if (result.correct) {
      this.setData({ feedback: 'correct' });
      // 短暂延迟后清理反馈（题目会通过回调更新）
      // v52: 统一走 _scheduleFeedbackFade — 反馈态守卫 + 计时器登记(见方法注释)
      this._scheduleFeedbackFade('correct', 350);
      // v61: 护学回归认可 — 连错≥3 后首次答对（此刻 combo=1, 不会与里程碑 toast 撞车）
      if (prevWrongStreak >= QUIZ.RECOVERY.MIN_STREAK) {
        wx.showToast({ title: '👏 状态回来了，继续保持！', icon: 'none', duration: 1200 });
        if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
      }
    } else {
      this.setData({ feedback: 'wrong' });
      this._scheduleFeedbackFade('wrong', 500);
      // v61: 连错阶梯鼓励（惩罚/喘息结算在管理器侧同步进行, 见 gameManager.answer）
      this._onWrongStreak(gameManager.getWrongStreak());
    }
  },

  /**
   * v52: 反馈消隐调度 — 仅当当前反馈态仍与本轮一致时才清回 idle。
   *   防跨题竞态: 前一题 500ms 消隐计时器晚于新题反馈落地时会提前掐灭新题
   *   的正确闪烁(v39 超时消隐同款守卫模式); 计时器登记到 _feedbackFadeTimer,
   *   onUnload 统一清理, 防已销毁页面 setData
   */
  _scheduleFeedbackFade(kind, delay) {
    if (this._feedbackFadeTimer) clearTimeout(this._feedbackFadeTimer);
    this._feedbackFadeTimer = setTimeout(() => {
      this._feedbackFadeTimer = null;
      if (this.data.feedback === kind) this.setData({ feedback: 'idle' });
    }, delay);
  },

  /**
   * v39: 题目超时反馈 — onQuizTimeout 在换题之后触发（覆盖 _onQuestionChange 置回的
   * idle），900ms 后自动消隐；期间不锁操作，孩子可立即作答新题（温和超时）
   */
  _onQuizTimeout() {
    this.setData({ feedback: 'timeout', quizDisabled: false });
    if (this._timeoutFbTimer) clearTimeout(this._timeoutFbTimer);
    this._timeoutFbTimer = setTimeout(() => {
      if (this.data.feedback === 'timeout') this.setData({ feedback: 'idle' });
      this._timeoutFbTimer = null;
    }, 900);
  },

  /**
   * v39: 倒计时心跳（500ms）— 仅进行中且未暂停时推送剩余毫秒；
   * isPlaying=false 覆盖 暂停(自动停表)/未开始/已结束 三态，无需单独管理生命周期
   */
  _onQuizTimerTick() {
    if (!gameManager.state.isPlaying || this.data.gameOverVisible || !this.data.currentQuestion) return;
    const r = gameManager.getQuizRemainMs();
    if (r === null || r === this.data.quizRemainMs) return;
    this.setData({ quizRemainMs: r });
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
   * v66: 商店栏铲子点击 — 切换铲子选中态（移除植物/半价回收）
   * 与植物选择互斥（gameManager 内部保证双向互清, 页面态经回调同步）
   */
  onShovelTap() {
    const next = !this.data.shovelSelected;
    gameManager.selectShovel();
    // 选中时提示用法（铲除不收起铲子, 便于连续修整草坪）
    if (next) {
      wx.showToast({ title: '铲子已就位：点击植物回收一半阳光', icon: 'none', duration: 1400 });
    }
  },

  /**
   * Canvas 点击放置植物
   * 用 boundingClientRect 将 clientX/Y 转为 canvas 内像素坐标
   * v6 修复 (Task 7-C F2/F3)：父层 bindtouchend 改为 bindtap，使子元素 catchtap 能正确阻止冒泡。
   *   tap 事件 e.detail.x/y 等价于 e.changedTouches[0].clientX/clientY（同视口坐标系）。
   */
  onCanvasTap(e) {
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
      // v23 修复（点击阳光误报错）：DOM 层 catchtap 未接住（点偏/机型渲染差异）时，
      //   点击落在阳光附近 → 优先收集该阳光并返回，不再走放植物流程弹「该格已有植物」等误导提示
      if (this._tryCollectSunAt(x, y)) return;
      // v66: 铲子模式 — 点击网格铲除植物并半价回收（不与放置流程交叉）
      if (this.data.shovelSelected) {
        const rm = gameManager.tryRemovePlantAt(x, y);
        if (rm.ok) {
          const refundText = rm.refund > 0 ? ' 回收 +' + rm.refund + '☀️' : '';
          wx.showToast({ title: '已铲除 ' + rm.name + refundText, icon: 'none', duration: 900 });
        } else if (rm.reason && rm.reason !== '未选择铲子') {
          wx.showToast({ title: rm.reason, icon: 'none', duration: 800 });
        }
        return;
      }
      if (!this.data.selectedPlant) return;
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
   * v23: 阳光点击兜底收集
   * 场景：玩家瞄准阳光点击但落在 DOM 热区之外（点偏 / 机型渲染差异），
   *   事件冒泡到 canvas-wrap 的 onCanvasTap。此处把 tap 坐标与所有未收集
   *   阳光的实时坐标比对，命中半径内（UI.SUN_TAP_HIT_RADIUS）直接收集，
   *   避免误走放植物流程弹出「该格已有植物」/「位置无效」等错误提示。
   * 坐标系：pathManager 与本函数均为 canvas CSS 像素，可直接比对。
   * @param {number} x - canvas 内像素 X
   * @param {number} y - canvas 内像素 Y
   * @returns {boolean} true 表示命中并已收集
   */
  _tryCollectSunAt(x, y) {
    try {
      const suns = gameManager.getUncollectedSuns();
      const r2 = UI.SUN_TAP_HIT_RADIUS * UI.SUN_TAP_HIT_RADIUS;
      for (let i = 0; i < suns.length; i++) {
        const s = suns[i];
        const dx = x - (s.x + (s.offsetX || 0));
        const dy = y - (s.y + (s.offsetY || 0));
        if (dx * dx + dy * dy <= r2) {
          gameManager.collectSun(s.id);
          return true;
        }
      }
    } catch (e) { /* 兜底逻辑异常不阻塞主流程 */ }
    return false;
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
    // v36: 得分大数字千分位格式化（与亲子积分换算条展示一致）
    summary.scoreText = String(Math.max(0, Number(summary.score) || 0))
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    // 更新最高分
    const isRecord = app.updateHighestScore(summary.score);
    app.incrementGameCount();
    // v32: 通关亲子积分 / v47: 败局努力积分（失败不空手; 两者均内部同局去重, 重复调用安全）
    const rewardSettle = (summary.result === 'win')
      ? rewardManager.settleWin(summary)
      : rewardManager.settleLose(summary);
    // 清理遗留的阳光视图 / 答题面板状态
    this.setData({
      sunsView: [],
      confettiView: [],              // v61: 彩带随局终卸载
      quizDisabled: true,
      feedback: 'idle',
      quizRemainMs: -1        // v39: 结束即隐藏倒计时
    });
    // v6 修复 (Task 7-C F22 + F4)：_gameOver 内部已 _cancelRaf + 设 phase=VICTORY/GAME_OVER，
    //   再调 pause() 会被 phase 守卫拒绝并打印 warn。改为直接清理 plantTip timer。
    if (_plantTipTimer) { clearTimeout(_plantTipTimer); _plantTipTimer = null; }
    if (this._confettiTimer) { clearTimeout(this._confettiTimer); this._confettiTimer = null; }   // v61: 彩带随局终卸载
    // 稍等最后一帧渲染后再弹出浮层（让玩家看到最后结果画面）
    // v52: 登记 _gameOverTimer — onUnload/onQuit 清理, 防已销毁页面 setData
    this._gameOverTimer = setTimeout(() => {
      this.setData({
        gameOverVisible: true,
        gameOverSummary: summary,
        gameOverIsRecord: isRecord,
        rewardSettle: rewardSettle
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
      rewardSettle: null,
      score: 0,
      defenseLines: 3,
      level: 1,
      combo: 0,
      sunlight: SUNLIGHT.INITIAL,
      selectedPlant: null,
      selectedPlantName: '',
      plantTipVisible: false,
      shovelSelected: false,     // v66: 重开铲子态复位
      shopItems: buildShopItems(SUNLIGHT.INITIAL),
      currentQuestion: null,
      feedback: 'idle',
      quizDisabled: false,
      quizRemainMs: -1,          // v39: 重开隐藏倒计时（首题落地后再满格）
      paused: false,
      sunsView: [],
      confettiView: []        // v61: 彩带层随重开清空
    });
    // 重新初始化游戏管理器
    // v39 附带修复：custom 档重开沿用导入词库（原硬编码 WORD_BANK，重开后自定义词库被静默丢弃）
    const pack = customWordPack.loadPack();
    if (difficulty === 'custom' && pack && pack.words.length) {
      gameManager.initGame(difficulty, pack.words);
    } else {
      gameManager.initGame(difficulty, FULL_WORD_BANK);
    }
    this.setData({ quizTimeLimit: gameManager.getQuizTimeLimit() });   // v39: 重读限时（同页重开局）
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
          // v52: 结算浮层 900ms 延迟窗口内退局的清理（防已销毁页面 setData）
          if (this._gameOverTimer) { clearTimeout(this._gameOverTimer); this._gameOverTimer = null; }
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
