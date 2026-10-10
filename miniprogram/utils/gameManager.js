// utils/gameManager.js - 游戏主管理器(协调者)
// v56 职责图谱(原 7 职责轻度 God Object 治理, 2 域外迁薄委托):
//   ① 状态机/生命周期(initGame/start/pause/resume/_gameOver/destroy)
//   ② 主循环调度 + 错误熔断(_loop/_cancelRaf/fpsMonitor)
//   ③ 关卡推进与终局判定(升关 ramp/末关收官/胜负条件)
//   ④ 战斗结算 → utils/combatResolver.js(v56 外迁, 方法名留守薄委托)
//   ⑤ 答题联动与题目限时(answer/_nextQuestion/超时温和分支)
//   ⑥ 阳光经济与植物放置(_addSunlight/collectSun/selectPlant/tryPlacePlantAt)
//   ⑦ UI 通知(12 回调分发; sunsView 视图映射 → utils/viewModels.js, v56 外迁)
// 生命周期契约: 页面 onUnload/onQuit 调 destroy() — 停循环 + 清实体 +
//   解除全部跨模块回调引用(12 UI 回调/renderer.onRenderFatal/canvas)

const {
  DIFFICULTY_CONFIG, LIVES, LEVEL, PERFORMANCE, ASSET_KEYS,
  SUNLIGHT, PLANT_TYPES, QUIZ, SCORING
  // v56 职责外迁收敛: COMBAT/GRID/PLANT/PARTICLE 随战斗结算 → combatResolver.js,
  //   UI 随 sunsView 映射 → viewModels.js(v37 修复注记随迁); ZOMBIE 本就零消费移除
} = require('./constants.js');
const { zombieManager } = require('./zombieManager.js');
const { plantManager } = require('./plantManager.js');
const { quizManager } = require('./quizManager.js');
const { pathManager } = require('./pathManager.js');
const { renderer } = require('./renderer.js');
const { fpsMonitor } = require('./fpsMonitor.js');
const audioManager = require('./audioManager.js');
const combatResolver = require('./combatResolver.js');   // v56: 战斗结算域(6 方法外迁)
const viewModels = require('./viewModels.js');           // v56: sunsView 视图映射(纯函数)

/**
 * 游戏阶段
 */
const PHASE = {
  READY: 'ready',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAME_OVER: 'gameover',
  VICTORY: 'victory'
};

class GameManager {
  constructor() {
    // 游戏状态对象
    this.state = {
      score: 0,
      defenseLines: LIVES.INITIAL,  // 防线数（僵尸突破终点扣减，全部扣完即失败）
      level: 1,                     // v2: 当前关卡
      levelTimer: 0,                // v2: 关卡计时器(ms)
      combo: 0,
      isPlaying: false,
      gameTime: 0,           // 累计游戏时长(ms)
      paused: false,
      phase: PHASE.READY,
      difficulty: 'junior',
      maxCombo: 0,
      killedZombies: 0,
      plantsPlaced: 0,       // 已放置植物数
      sunlight: SUNLIGHT.INITIAL,    // 阳光货币
      selectedPlant: null,   // 当前商店选中植物类型
      shovelSelected: false, // v66: 铲子工具选中态（与 selectedPlant 互斥）
      startTime: 0
    };

    this.rafId = null;
    this.lastTime = 0;
    this._loopErrorCount = 0;
    // UI 回调
    this.onStateChange = null;      // 状态变化回调
    this.onQuestionChange = null;   // 题目变化回调
    this.onGameOver = null;         // 游戏结束回调（失败/胜利统一触发，summary.result: 'win' | 'lose'）
    this.onScoreChange = null;      // 分数变化回调
    this.onDefenseChange = null;    // v2: 防线变化回调（替代 onLifeChange）
    this.onComboChange = null;      // 连击变化回调
    this.onSunlightChange = null;   // 阳光变化回调
    this.onShopSelect = null;       // 商店选中变化回调
    this.onShovelSelect = null;     // v66: 铲子选中变化回调
    this.onSunsChange = null;       // v3: 可收集阳光列表变化回调 (sunsView[]) => void
    this.onRenderError = null;      // 渲染致命错误回调
    this.onLevelChange = null;      // v2: 关卡变化回调
    this.onQuizTimeout = null;     // v39: 题目超时回调（换题后触发，供页面展示反馈浮层）
    this.canvas = null;
  }

  /**
   * 设置 canvas
   */
  attachCanvas(canvas) {
    this.canvas = canvas;
  }

  /**
   * 初始化新游戏
   * @param {string} difficulty - primary(小学) / junior(初中) / senior(高中) / ket / pet / custom(导入词库)（v50）
   * @param {Array} wordBank - 题库
   */
  initGame(difficulty, wordBank) {
    const cfg = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.junior;  // v50: 兜底 junior
    this.state = {
      score: 0,
      defenseLines: LIVES.INITIAL,  // 防线数（3 道，僵尸突破终点扣减）
      level: 1,
      levelTimer: 0,
      combo: 0,
      isPlaying: false,
      gameTime: 0,
      paused: false,
      phase: PHASE.READY,
      difficulty: difficulty,
      maxCombo: 0,
      killedZombies: 0,
      plantsPlaced: 0,
      sunlight: SUNLIGHT.INITIAL,
      selectedPlant: null,
      shovelSelected: false,   // v66: 新局铲子态复位
      startTime: 0
    };
    this._loopErrorCount = 0;
    this._lastSunViewVersion = -1;   // v3: 阳光上次同步版本
    this._lastSunSyncAt = 0;         // v3: 上次阳光同步时间
    this._lastSpawnLogTime = 0;      // v4: 僵尸生成健康日志上次输出时间
    this._pauseStartTime = 0;        // v4: 暂停开始时间
    this._finalWaveAt = -1;          // v38: 末关收官起始 gameTime（-1=未进入收官）
    this._questionDeadline = 0;      // v39: 当前题截止时刻（0=无题/解除武装）
    this._questionTimeLimit = (cfg && cfg.questionTimeLimit) || QUIZ.TIMEOUT_FALLBACK_MS;  // v39: 按难度取限时
    this._questionTimeBonusMs = 0;    // v61: 护学限时加成（当前题生效值, 每题在 _nextQuestion 消费）
    this._pendingRecoveryBonusMs = 0; // v61: 护学限时加成（待落位值, answer 错分支预置）
    this._levelTimeMs = this._computeLevelTimeMs(difficulty, cfg, wordBank);   // v41: 一局节奏（易→短/难→长）
    console.info('[GameManager] v41 一局节奏: 每关 ' + (this._levelTimeMs / 1000) +
      's, 预计全程 ~' + Math.round((LEVEL.MAX_LEVEL - 1) * this._levelTimeMs / 60000) + ' 分钟 + 收官清场');

    // 重置各子系统
    pathManager.init();
    quizManager.setWordBank(wordBank);
    // v6 修复 (Task 12): 选项数 → QUIZ.OPTION_COUNT
    quizManager.reset(QUIZ.OPTION_COUNT);
    zombieManager.reset(cfg, difficulty);
    plantManager.reset();
    renderer.clear();
    fpsMonitor.reset();

    this._notifyAll();
    if (this.onSunlightChange) this.onSunlightChange(this.state.sunlight);
    if (this.onShopSelect) this.onShopSelect(this.state.selectedPlant);
    if (this.onDefenseChange) this.onDefenseChange(this.state.defenseLines);
    if (this.onLevelChange) this.onLevelChange(this.state.level);
  }

  /**
   * 开始游戏
   */
  start() {
    try {
      this.state.phase = PHASE.PLAYING;
      this.state.isPlaying = true;
      this.state.startTime = Date.now();
      this.state.gameTime = 0;
      this.lastTime = Date.now();
      fpsMonitor.reset();
      audioManager.play(ASSET_KEYS.AUDIO.START);
      // 渲染致命错误回调：连续渲染失败时停止主循环
      renderer.onRenderFatal = (err) => {
        console.error('[GameManager] 渲染连续失败，停止主循环:', err);
        this.state.isPlaying = false;
        if (this.onRenderError) this.onRenderError(err);
      };
      // 生成首道题目
      this._nextQuestion();
      this._loop();
      this._notifyAll();
    } catch (err) {
      console.error('[GameManager] start 失败:', err);
      this.state.isPlaying = false;
      this.state.phase = PHASE.GAME_OVER;
      if (this.onGameOver) this.onGameOver(this.getSummary());
    }
  }

  /**
   * 主循环 - requestAnimationFrame 60fps
   */
  _loop() {
    if (!this.state.isPlaying) return;
    try {
      const now = Date.now();
      let dt = now - this.lastTime;
      this.lastTime = now;
      // 限制单帧最大间隔，防止跳帧
      if (dt > PERFORMANCE.MAX_DELTA) dt = PERFORMANCE.MAX_DELTA;

      fpsMonitor.tick();
      this.state.gameTime += dt;

      // v2: 关卡推进（混合模式）— 每 levelTime ms 推进一关
      this.state.levelTimer += dt;
      const cfg = DIFFICULTY_CONFIG[this.state.difficulty] || DIFFICULTY_CONFIG.junior;  // v50: 兜底 junior
      // v41: 关卡节奏用 initGame 算好的 _levelTimeMs（难度档/词库实际难度），
      //   cfg 此后仅用于 rampCfg（applyLevelRamp）
      const levelTime = this._levelTimeMs || LEVEL.TIME_PER_LEVEL;
      if (this.state.levelTimer >= levelTime && this.state.level < LEVEL.MAX_LEVEL) {
        this.state.level++;
        this.state.levelTimer = 0;
        const rampCfg = (cfg && cfg.levelRamp) || LEVEL.RAMP;
        zombieManager.applyLevelRamp(this.state.level, rampCfg);
        // v38: 末关收官 — 进入末关(v51: MAX_LEVEL=10)即停止常规生成；
        //   旧胜利条件（gameTime≥全程 + 场清）因末关仍持续生成，
        //   「场上 0 僵尸」窗口只有 ~1.2s 生成间隙，几乎不可达
        if (this.state.level >= LEVEL.MAX_LEVEL) {
          zombieManager.stopSpawn();
          this._finalWaveAt = this.state.gameTime;
          // v51: 僵尸王终局大波 — 王率先入场 + 护卫队跟上（清完整波才通关, 见胜利判定大波守卫）
          zombieManager.launchFinalWave();
        }
        // v60: 中场僵尸波 — 第 3/6 关开局额外一波压场（长局节奏起伏）;
        //   与末关互斥（LEVEL.MID_WAVES [3,6] vs MAX_LEVEL 10）, 预警 toast
        //   由页面侧 onLevelChange 发出, 僵尸经 MID_WAVE_WARN_MS 预警窗口后
        //   入场（常规生成不受影响, 独立于终局大波与胜利判定）
        if (LEVEL.MID_WAVES.indexOf(this.state.level) >= 0) {
          zombieManager.launchMidWave();
        }
        if (this.onLevelChange) this.onLevelChange(this.state.level);
        // 关卡提示振动 + 清亮双音 ping
        wx.vibrateShort && wx.vibrateShort({ type: 'light' });
        audioManager.play(ASSET_KEYS.AUDIO.LEVEL_UP);
      }

      // v39: 题目限时判定 — 超时走温和分支（换题 + 连击清零，不加速僵尸）；
      //   暂停期间主循环停摆，本检查天然冻结，resume 时统一平移 deadline
      if (this._questionDeadline > 0 && Date.now() >= this._questionDeadline) {
        this._handleQuestionTimeout();
      }

      // 1. 植物/投射物更新（攻击、产阳光、飞行、碰撞、v2樱桃炸弹引信、v4食人花近战）
      const sunlightProduced = plantManager.update(dt, {
        getZombiesInLane: (lane) => zombieManager.getZombiesInLane(lane),
        onHitZombie: (zombie, proj) => this._onProjectileHit(zombie, proj),
        onPlantExplode: (plant) => this._onPlantExplode(plant),
        onChomperBite: (plant, zombie, damage) => this._onChomperBite(plant, zombie, damage)
      });
      if (sunlightProduced > 0) this._addSunlight(sunlightProduced);

      // 1.5 v3: 可收集阳光视图同步（每 SUN_SYNC_INTERVAL_MS 或版本变化时推送到 UI 层）
      const curVer = plantManager.getSunVersion();
      // v6 修复 (Task 12): 同步间隔 → PERFORMANCE.SUN_SYNC_INTERVAL_MS
      if (curVer !== this._lastSunViewVersion ||
          this.state.gameTime - this._lastSunSyncAt >= PERFORMANCE.SUN_SYNC_INTERVAL_MS) {
        this._lastSunViewVersion = curVer;
        this._lastSunSyncAt = this.state.gameTime;
        this._notifySunsView();
      }

      // 2. 僵尸-植物战斗（僵尸啃植物 / 阻挡）
      this._resolveZombiePlantCombat(dt);

      // 3. 僵尸更新（移动、生成、状态机; v49: 舞王召唤回调 → 感知反馈）
      zombieManager.update(dt, (zombie) => this._onZombieReachEnd(zombie),
        (intent, minions) => this._onDancerSummon(intent, minions));

      // 4. 渲染（render 内部含错误保护）
      // v6 修复 (Task 7-B F4): 传 dt 给 renderer，供 _drawParticles 用动态帧间隔
      renderer.render(
        this.state,
        zombieManager.getAll(),
        plantManager.getPlants(),
        plantManager.getProjectiles(),
        dt
      );

      // v2: 失败判定改为防线全部被毁（替代 lives <= 0）
      if (this.state.defenseLines <= 0) {
        this._gameOver('lose');
        return;
      }

      // v38: 胜利判定重做 — 末关停生成后，场上僵尸清空即通关
      //   （1.5s 定格：死亡动画收尾 + 通关仪式感；防线归零判定在前，输赢优先级不变）
      // v51: 大波守卫 — 终局大波按 400ms 节奏入场, 若玩家在大波放完前清空场上存量,
      //   仅凭场清会提前通关 → 增加 isFinalWaveDone() 条件（队列清空 + 场清 才胜利）
      if (this._finalWaveAt >= 0 &&
          this.state.gameTime - this._finalWaveAt >= LEVEL.FINAL_CLEAR_GRACE_MS &&
          zombieManager.getAll().length === 0 &&
          zombieManager.isFinalWaveDone()) {
        this._gameOver('win');
        return;
      }

      // v4: 僵尸生成健康日志 — 每 30s 输出一次关键指标，便于定位生成异常
      if (!this._lastSpawnLogTime) this._lastSpawnLogTime = this.state.gameTime;
      // v6 修复 (Task 12): 日志间隔 → PERFORMANCE.SPAWN_LOG_INTERVAL_MS
      if (this.state.gameTime - this._lastSpawnLogTime >= PERFORMANCE.SPAWN_LOG_INTERVAL_MS) {
        const sp = zombieManager.spawner;
        console.info('[GameManager] 僵尸生成健康报告: gameTime=' + this.state.gameTime +
          'ms, level=' + this.state.level +
          ', activeZombies=' + zombieManager.getAll().length +
          ', totalSpawned=' + sp._totalSpawned +
          ', failCount=' + sp._spawnFailCount +
          ', spawnInterval=' + sp.spawnInterval.toFixed(0) + 'ms' +
          ', spawnTimer=' + sp.spawnTimer.toFixed(0) + 'ms' +
          ', maxZombies=' + sp.maxZombies +
          ', poolSize=' + zombieManager.pool.pool.length +
          ', poolActive=' + zombieManager.pool.active.size);
        this._lastSpawnLogTime = this.state.gameTime;
      }

      // 下一帧
      this._loopErrorCount = 0;  // 成功帧重置错误计数，避免非连续错误累积导致误终止
      if (this.canvas && this.canvas.requestAnimationFrame) {
        this.rafId = this.canvas.requestAnimationFrame(() => this._loop());
      } else {
        // 兜底：无 canvas RAF 时用 setTimeout
        this.rafId = setTimeout(() => this._loop(), 1000 / PERFORMANCE.TARGET_FPS);
      }
    } catch (err) {
      console.error('[GameManager] 主循环异常:', err);
      this._loopErrorCount = (this._loopErrorCount || 0) + 1;
      // v6 修复 (Task 12): 终止阈值 → PERFORMANCE.LOOP_FATAL_THRESHOLD
      if (this._loopErrorCount >= PERFORMANCE.LOOP_FATAL_THRESHOLD) {
        console.error('[GameManager] 主循环连续异常 ' + this._loopErrorCount + ' 次，终止');
        this.state.isPlaying = false;
        if (this.onGameOver) this.onGameOver(this.getSummary());
      } else {
        if (this.canvas && this.canvas.requestAnimationFrame) {
          this.rafId = this.canvas.requestAnimationFrame(() => this._loop());
        } else {
          // v6 修复 (Task 7-A F3)：镜像 success 分支的 setTimeout 兜底，避免 canvas 脱离后主循环静默死亡
          this.rafId = setTimeout(() => this._loop(), 1000 / PERFORMANCE.TARGET_FPS);
        }
      }
    }
  }

  // ============ 战斗结算(薄委托 → utils/combatResolver.js, v56 外迁) ============

  /**
   * 投射物命中僵尸
   * v56: 战斗结算域外迁 utils/combatResolver.js — 薄委托保持方法名/调用面不变
   */
  _onProjectileHit(zombie, proj) {
    combatResolver.onProjectileHit(this, zombie, proj);
  }

  /**
   * 食人花咬合僵尸
   * v56: 战斗结算域外迁 utils/combatResolver.js — 薄委托保持方法名/调用面不变
   */
  _onChomperBite(plant, zombie, damage) {
    combatResolver.onChomperBite(this, plant, zombie, damage);
  }

  /**
   * 僵尸-植物战斗结算
   * v56: 战斗结算域外迁 utils/combatResolver.js — 薄委托保持方法名/调用面不变
   */
  _resolveZombiePlantCombat(dt) {
    combatResolver.resolveZombiePlantCombat(this, dt);
  }

  /**
   * 樱桃炸弹爆炸(范围伤害)
   * v56: 战斗结算域外迁 utils/combatResolver.js — 薄委托保持方法名/调用面不变
   */
  _onPlantExplode(plant) {
    combatResolver.onPlantExplode(this, plant);
  }

  /**
   * 生成下一题（题目与僵尸解耦，仅用于答题赚取阳光）
   */
  _nextQuestion() {
    const cfg = DIFFICULTY_CONFIG[this.state.difficulty] || DIFFICULTY_CONFIG.junior;  // v50: 兜底 junior(与 initGame 同款防御, 旧键存量迁移期)
    // v61: 接住护学限时加成（answer 错分支预置）— 每题消费一次, 下一题自然回基础限时
    this._questionTimeBonusMs = this._pendingRecoveryBonusMs || 0;
    this._pendingRecoveryBonusMs = 0;
    const q = quizManager.generateQuestion(cfg.difficultyWeights);
    // v39: 题目限时 — 新题落地即刷新截止时刻；q=null（空题库）时解除武装，
    //   防止陈旧 deadline 反复触发超时
    this._questionDeadline = q ? (Date.now() + this._questionTimeLimit + this._questionTimeBonusMs) : 0;
    if (q && this.onQuestionChange) this.onQuestionChange(q);
  }

  /**
   * 僵尸到达终点(扣防线)
   * v56: 战斗结算域外迁 utils/combatResolver.js — 薄委托保持方法名/调用面不变
   */
  _onZombieReachEnd(zombie) {
    combatResolver.onZombieReachEnd(this, zombie);
  }

  /**
   * 舞王召唤感知反馈
   * v56: 战斗结算域外迁 utils/combatResolver.js — 薄委托保持方法名/调用面不变
   */
  _onDancerSummon(intent, minions) {
    combatResolver.onDancerSummon(this, intent, minions);
  }

  /**
   * 答题判定
   * - 答对：加分、加阳光、生成下一题
   * - 答错：连击清零、生成下一题；v61 演进「警示一次 + 护学接管」— 二错加速一次,
   *   三错起喘息减速 + 限时放宽（v45 首错免罚保留, 反死亡螺旋）
   * @param {number} optionIndex - 选项索引
   * @returns {Object} {correct, score, combo, sunlightReward}
   */
  answer(optionIndex) {
    if (!this.state.isPlaying) return { correct: false };
    const result = quizManager.answer(optionIndex);

    if (result.correct) {
      // 答对：加阳光
      this._addSunlight(result.sunlightReward);
      this.state.score += result.score;
      this.state.combo = result.combo;
      this.state.maxCombo = Math.max(this.state.maxCombo, result.combo);
      audioManager.play(ASSET_KEYS.AUDIO.CORRECT);
      if (this.onScoreChange) this.onScoreChange(this.state.score);
      if (this.onComboChange) this.onComboChange(this.state.combo);
      // v60: 连击里程碑奖励 + 单词魔法弹（答对 = 直接参战, 学习与战斗强绑定）
      this._resolveComboMilestone(result.combo);
      if (result.combo >= QUIZ.MAGIC.MIN_COMBO) combatResolver.onQuizMagic(this);
      this._nextQuestion();
      return { correct: true, score: result.score, combo: result.combo, sunlightReward: result.sunlightReward };
    } else {
      // 答错：v45 温和化(首错免罚) → v61 演进「警示一次 + 护学接管」:
      //   连续第 2 错全场临时加速一次（学习的后果感）; 第 3 错起不再加压, 转入
      //   喘息减速 + 限时放宽（反死亡螺旋 — 挣扎中的孩子需要的是帮助而非更重的惩罚）
      audioManager.play(ASSET_KEYS.AUDIO.WRONG);
      const wrongStreak = result.wrongStreak || 0;
      if (wrongStreak === SUNLIGHT.PENALTY_WRONG_FREE_STREAK + 1) {
        zombieManager.applyGlobalSpeedBoost(
          SUNLIGHT.PENALTY_WRONG_SPEED_MULT,
          SUNLIGHT.PENALTY_WRONG_SPEED_TIME
        );
      } else if (wrongStreak === QUIZ.RECOVERY.MIN_STREAK) {
        // v61 护学: 恰第 3 错全场喘息减速（复用寒冰脉冲因子, 让孩子定定神）
        zombieManager.applyGlobalSlow(QUIZ.FREEZE_FACTOR, QUIZ.RECOVERY.BREATHE_MS);
      }
      // v61 护学: 三错起下一题限时放宽（经 _pendingRecoveryBonusMs 在 _nextQuestion 内落位,
      //   页面倒计时条经 getQuizTimeLimit 按放大后的满格自动跟随）
      this._pendingRecoveryBonusMs = (wrongStreak >= QUIZ.RECOVERY.MIN_STREAK)
        ? Math.min(Math.round((this._questionTimeLimit || 0) * QUIZ.RECOVERY.TIME_BONUS_PCT),
                   QUIZ.RECOVERY.TIME_BONUS_MAX_MS)
        : 0;
      this.state.combo = 0;
      if (this.onComboChange) this.onComboChange(0);
      this._nextQuestion();
      return { correct: false, score: 0, combo: 0, sunlightReward: 0 };
    }
  }

  /**
   * v60: 连击里程碑结算 — combo 恰达 QUIZ.MILESTONES 阈值时触发一次性奖励
   *   （sun=阳光直接入账 / sunrain=天降阳光雨 / freeze=全场寒冰脉冲）
   * 由 answer 正确分支调用; 断连后重爬到阈值会再次触发（鼓励保持连击,
   * 每次都需真实连续答对 5/10/15 题达成）; 页面 toast 反馈由 onComboChange
   * 消费侧（game.js）按同一阈值集合负责, 本方法只管奖励结算
   * @param {number} combo - 本题答对后的连击数
   */
  _resolveComboMilestone(combo) {
    const m = QUIZ.MILESTONES.find(ms => ms.combo === combo);
    if (!m) return;
    if (m.type === 'sun') {
      this._addSunlight(m.value);
    } else if (m.type === 'sunrain') {
      plantManager.spawnBonusSuns(m.value);
    } else if (m.type === 'freeze') {
      zombieManager.applyGlobalSlow(QUIZ.FREEZE_FACTOR, m.value);
      wx.vibrateShort && wx.vibrateShort({ type: 'medium' });
    }
  }

  /**
   * v39: 题目超时处理（温和分支，儿童向刻意与答错惩罚区分）
   * 触发序：先解除武装 → 统计 → 换题（onQuestionChange 先把页面反馈置回 idle）
   * → 超时回调（页面再覆盖为 timeout 浮层）
   */
  _handleQuestionTimeout() {
    this._questionDeadline = 0;          // 先解除武装，防同帧/后续帧重入
    quizManager.registerTimeout();       // 统计：timeoutCount++ / totalAnswered++ / 连击清零
    audioManager.play(ASSET_KEYS.AUDIO.WRONG);
    this.state.combo = 0;
    if (this.onComboChange) this.onComboChange(0);
    this._nextQuestion();                // 换题（内部刷新 deadline + 通知页面新题）
    if (this.onQuizTimeout) this.onQuizTimeout();
  }

  /**
   * v39: 当前难度单题限时(ms)
   * v61: 含护学限时加成 — 连错≥3 后的当前题返回 基础限时+加成, 页面倒计时条满格基准随之放大
   */
  getQuizTimeLimit() {
    return (this._questionTimeLimit || 0) + (this._questionTimeBonusMs || 0);
  }

  /**
   * v61: 当前连续答错次数 — 页面侧护学反馈分层读取（answer 返回形状保持不变, task60 C2d 锚点不碰）
   */
  getWrongStreak() {
    return quizManager.wrongStreak || 0;
  }

  /**
   * v39: 当前题剩余毫秒（无进行中的题返回 null）— 页面倒计时心跳数据源
   */
  getQuizRemainMs() {
    if (!this._questionDeadline) return null;
    return Math.max(0, this._questionDeadline - Date.now());
  }

  /**
   * v41: 计算本局每关时长 — 一局时间随单词难易度伸缩
   * 内置档：直接取难度档 levelTime（小学 48s / 初中 60s / 高中 72s — v50 重划）
   * 自定义档：按导入词库平均难度(1.0~3.0)线性插值 LEVEL_TIME_EASY~HARD，
   *   整秒取整（词库 difficulty 经 customWordPack 归一 ∈ {1,2,3}，
   *   兜底：无合法难度字段 → 保守用基准值）
   */
  _computeLevelTimeMs(difficulty, cfg, wordBank) {
    const base = (cfg && cfg.levelTime) || LEVEL.TIME_PER_LEVEL;
    if (difficulty !== 'custom' || !Array.isArray(wordBank) || !wordBank.length) {
      return base;
    }
    let sum = 0, n = 0;
    for (let i = 0; i < wordBank.length; i++) {
      const d = wordBank[i] && Number(wordBank[i].difficulty);
      if (d >= 1 && d <= 3) { sum += d; n++; }
    }
    if (!n) return base;
    const avg = sum / n;
    const t = LEVEL.LEVEL_TIME_EASY + (avg - 1) / 2 * (LEVEL.LEVEL_TIME_HARD - LEVEL.LEVEL_TIME_EASY);
    return Math.round(t / 1000) * 1000;
  }

  /**
   * v41: 本局每关时长(ms) — 供外部展示/诊断
   */
  getLevelTimeMs() {
    return this._levelTimeMs || 0;
  }

  // ============ 阳光经济 / 植物放置 ============

  /**
   * 增减阳光（带上下限）
   */
  _addSunlight(amount) {
    this.state.sunlight = Math.max(0, Math.min(SUNLIGHT.MAX, this.state.sunlight + amount));
    if (this.onSunlightChange) this.onSunlightChange(this.state.sunlight);
  }

  /**
   * v3: 可收集阳光视图同步 — 映射体外迁 viewModels.js(v56), 分发留守
   * (跨文件耦合注记见 constants.js / plantManager.js: SUN_COLLECT_WINDOW_MS 同步口径)
   */
  _notifySunsView() {
    if (!this.onSunsChange) return;
    this.onSunsChange(viewModels.buildSunsView(plantManager.getSuns(), pathManager.canvasSize));
  }

  /**
   * v3: 玩家点击收集一颗阳光
   * @param {number} sunId
   * @returns {{ok: boolean, value: number}}
   */
  collectSun(sunId) {
    const res = plantManager.collectSun(sunId);
    if (!res.ok) return { ok: false, value: 0 };
    this._addSunlight(res.value);
    audioManager.play(ASSET_KEYS.AUDIO.SUN);
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    // 立即推送一版视图（触发收集动画开始）
    this._notifySunsView();
    return { ok: true, value: res.value };
  }

  /**
   * v23: 获取未收集的阳光列表（页面 onCanvasTap 点击兜底命中检测用）
   * @returns {Array} 未收集阳光对象数组（含 x/y/offsetX/offsetY/id）
   */
  getUncollectedSuns() {
    return plantManager.getSuns().filter(s => !s.collected);
  }

  /**
   * 选择/取消选择商店植物
   * v66: 与铲子互斥 — 选中植物时自动收起铲子（反向见 selectShovel）
   * @param {string} type - PLANT_TYPES 键名
   */
  selectPlant(type) {
    if (!PLANT_TYPES[type]) return;
    this.state.selectedPlant = (this.state.selectedPlant === type) ? null : type;
    if (this.state.selectedPlant && this.state.shovelSelected) {
      this.state.shovelSelected = false;
      if (this.onShovelSelect) this.onShovelSelect(false);
    }
    if (this.onShopSelect) this.onShopSelect(this.state.selectedPlant);
  }

  /**
   * v66: 切换铲子工具选中态（移除植物/半价回收）
   * 与植物选择互斥 — 选中铲子时自动取消植物选中（商店栏/放置提示同步收起）
   */
  selectShovel() {
    this.state.shovelSelected = !this.state.shovelSelected;
    if (this.state.shovelSelected && this.state.selectedPlant) {
      this.state.selectedPlant = null;
      if (this.onShopSelect) this.onShopSelect(null);
    }
    if (this.onShovelSelect) this.onShovelSelect(this.state.shovelSelected);
  }

  /**
   * v66: 在 canvas 像素坐标处尝试铲除植物（铲子选中态下点击草坪）
   * @param {number} x - canvas 内 px
   * @param {number} y - canvas 内 px
   * @returns {Object} {ok, reason, name, refund}
   */
  tryRemovePlantAt(x, y) {
    if (!this.state.isPlaying) return { ok: false, reason: '游戏未进行', name: '', refund: 0 };
    if (!this.state.shovelSelected) return { ok: false, reason: '未选择铲子', name: '', refund: 0 };
    const cell = pathManager.pixelToCell(x, y);
    if (!cell) return { ok: false, reason: '位置无效', name: '', refund: 0 };
    const res = plantManager.removePlantAt(cell.lane, cell.slot);
    if (!res.ok) return { ok: false, reason: res.reason, name: '', refund: 0 };
    // 半价回收入账（refund=0 的零成本植物也静默成功）
    if (res.refund > 0) this._addSunlight(res.refund);
    audioManager.play(ASSET_KEYS.AUDIO.PLACE);   // 复用放置音效（同类确认音）
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    return { ok: true, reason: '', name: res.name, refund: res.refund };
  }

  /**
   * 在 canvas 像素坐标处尝试放置选中的植物
   * @param {number} x - canvas 内 px
   * @param {number} y - canvas 内 px
   * @returns {Object} {ok, reason}
   */
  tryPlacePlantAt(x, y) {
    if (!this.state.isPlaying) return { ok: false, reason: '游戏未进行' };
    const type = this.state.selectedPlant;
    if (!type) return { ok: false, reason: '未选择植物' };
    const def = PLANT_TYPES[type];
    if (this.state.sunlight < def.cost) return { ok: false, reason: '阳光不足' };
    const cell = pathManager.pixelToCell(x, y);
    if (!cell) return { ok: false, reason: '位置无效' };
    const res = plantManager.placePlant(type, cell.lane, cell.slot);
    if (!res.ok) return { ok: false, reason: res.reason };
    this._addSunlight(-def.cost);
    this.state.plantsPlaced++;
    audioManager.play(ASSET_KEYS.AUDIO.PLACE);
    // 放置后保持选中，便于连续放置（阳光不足时自动取消）
    if (this.state.sunlight < def.cost) {
      this.state.selectedPlant = null;
      if (this.onShopSelect) this.onShopSelect(null);
    }
    return { ok: true };
  }

  // ============ 生命周期: 暂停/恢复/终局/销毁 ============

  /**
   * 暂停
   * @returns {boolean} true 表示成功执行，false 被守卫拒绝
   */
  pause() {
    if (this.state.phase !== PHASE.PLAYING) {
      console.warn('[GameManager] pause 被拒绝：phase=', this.state.phase);
      return false;
    }
    if (this.state.paused) {
      console.warn('[GameManager] pause 重复调用，已处于暂停状态');
      return false;
    }
    this._pauseStartTime = Date.now();  // v4: 记录暂停开始时间(v39 题目钟平移 + 日志用; v44 后 spawner 已免平移)
    this.state.paused = true;
    this.state.isPlaying = false;
    this._cancelRaf();
    this._notifyAll();
    return true;
  }

  /**
   * 恢复
   * @returns {boolean} true 表示成功执行，false 被守卫拒绝
   */
  resume() {
    if (this.state.phase !== PHASE.PLAYING) {
      console.warn('[GameManager] resume 被拒绝：phase=', this.state.phase);
      return false;
    }
    if (!this.state.paused) {
      console.warn('[GameManager] resume 重复调用，当前未暂停');
      return false;
    }
    const pauseDuration = Date.now() - (this._pauseStartTime || Date.now());
    this.state.paused = false;
    this.state.isPlaying = true;
    this.lastTime = Date.now();
    // v44 强度模型统一: spawner 已不依赖 wall clock(时间窗轨道退役),
    //   暂停无需再平移 spawner 起始钟(v4 workaround 随之退役)
    // v39: 题目限时时钟同步平移 — 否则长暂停后恢复时 deadline 已过期 → 瞬间误判超时；
    //   题目起始钟同步平移，保住答对速度奖励的公平性
    if (pauseDuration > 0 && this._questionDeadline > 0) {
      this._questionDeadline += pauseDuration;
      quizManager.shiftQuestionClock(pauseDuration);
    }
    console.info('[GameManager] resume: 暂停时长=' + pauseDuration + 'ms');
    // 清理残留 rafId
    if (this.rafId) {
      if (this.canvas && this.canvas.cancelAnimationFrame) {
        try { this.canvas.cancelAnimationFrame(this.rafId); } catch (e) {}
      } else {
        try { clearTimeout(this.rafId); } catch (e) {}
      }
      this.rafId = null;
    }
    this._loop();
    this._notifyAll();
    return true;
  }

  /**
   * 取消主循环
   * v56: 双分支补 try-catch(镜像 resume 的防御) — 页面卸载时 canvas 节点可能
   *   已先于 destroy 销毁, cancel 抛错会中断收尾(子管理器清理被跳过)
   */
  _cancelRaf() {
    if (this.rafId) {
      if (this.canvas && this.canvas.cancelAnimationFrame) {
        try { this.canvas.cancelAnimationFrame(this.rafId); } catch (e) {}
      } else {
        try { clearTimeout(this.rafId); } catch (e) {}
      }
      this.rafId = null;
    }
  }

  /**
   * 游戏结束 / 胜利
   * @param {'win'|'lose'} result
   */
  _gameOver(result) {
    this.state.phase = (result === 'win') ? PHASE.VICTORY : PHASE.GAME_OVER;
    this.state.isPlaying = false;
    this._cancelRaf();
    if (result === 'win') {
      audioManager.play(ASSET_KEYS.AUDIO.WIN);  // 胜利华彩（区别于 LEVEL_UP 的短 ping）
    } else {
      audioManager.play(ASSET_KEYS.AUDIO.GAME_OVER);
    }
    const summary = this.getSummary(result);
    if (this.onGameOver) this.onGameOver(summary);
    this._notifyAll();
  }

  /**
   * 获取结算数据
   * @param {'win'|'lose'} [result] - 可选显式指定结果，缺省基于 phase 推断
   */
  getSummary(result) {
    const acc = quizManager.getAccuracy();
    // v6 修复 (Task 12): 星级阈值 → SCORING.STAR_3/2/1_ACC
    const stars = acc >= SCORING.STAR_3_ACC ? 3 : acc >= SCORING.STAR_2_ACC ? 2 : acc >= SCORING.STAR_1_ACC ? 1 : 0;
    const r = result || (this.state.phase === PHASE.VICTORY ? 'win' : 'lose');
    return {
      result: r,
      score: this.state.score,
      level: this.state.level,            // v2: 最终关卡
      maxCombo: this.state.maxCombo,
      killedZombies: this.state.killedZombies,
      plantsPlaced: this.state.plantsPlaced,
      correctCount: quizManager.correctCount,
      wrongCount: quizManager.wrongCount,
      totalAnswered: quizManager.totalAnswered,
      timeoutCount: quizManager.timeoutCount || 0,   // v39: 超时未答次数
      accuracy: acc,
      stars: stars,
      gameTime: this.state.gameTime,
      difficulty: this.state.difficulty,
      avgFps: fpsMonitor.getAvgFps()
    };
  }

  /**
   * 通知所有UI回调
   */
  _notifyAll() {
    if (this.onStateChange) this.onStateChange({ ...this.state });
  }

  /**
   * 销毁 — 页面 onUnload/onQuit 收尾
   * v56 生命周期修复: 旧版仅停循环+清实体, 12 个 UI 回调与 renderer.onRenderFatal
   *   闭包继续持有已卸载页面实例(单例长寿命 → 引用泄漏 + 迟到回调打到死页面
   *   setData) — 现补齐收尾: 解除渲染致命错误钩子 / 题目限时解除武装(v39 口径) /
   *   阶段复位 / 清空全部 UI 回调引用 / 释放 canvas 节点引用
   */
  destroy() {
    this.state.isPlaying = false;
    this.state.paused = false;
    this._cancelRaf();
    zombieManager.clear();
    plantManager.clear();
    renderer.clear();
    renderer.onRenderFatal = null;     // v56: 解除渲染致命错误闭包(捕获 this + onRenderError → 页面)
    this._questionDeadline = 0;        // v39 配套: 解除题目限时武装(0=无题/解除, 防陈旧 deadline)
    this.state.phase = PHASE.READY;    // 复位阶段: pause/resume 守卫回归初始语义
    this._pauseStartTime = 0;
    this._clearUiCallbacks();          // v56: 12 个 UI 回调引用全部置空
    this.canvas = null;                // v56: 释放已卸载页面的 canvas 节点引用
  }

  /**
   * v56: 清空全部 UI 回调引用(名单与 constructor 接线面一一对应)
   */
  _clearUiCallbacks() {
    const names = ['onStateChange', 'onQuestionChange', 'onGameOver', 'onScoreChange',
      'onDefenseChange', 'onComboChange', 'onSunlightChange', 'onShopSelect',
      'onShovelSelect', 'onSunsChange', 'onRenderError', 'onLevelChange', 'onQuizTimeout'];
    for (const name of names) this[name] = null;
  }
}

const gameManager = new GameManager();

module.exports = {
  gameManager,
  GameManager,
  PHASE
};
