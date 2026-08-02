// utils/gameManager.js - 游戏主管理器
// 负责: 游戏状态、主循环(requestAnimationFrame)、协调各子系统、阳光经济、植物放置、战斗结算

const {
  DIFFICULTY_CONFIG, LIVES, PERFORMANCE, ASSET_KEYS,
  SUNLIGHT, PLANT_TYPES, COMBAT
} = require('./constants.js');
const { zombieManager } = require('./zombieManager.js');
const { plantManager } = require('./plantManager.js');
const { quizManager } = require('./quizManager.js');
const { pathManager } = require('./pathManager.js');
const { renderer } = require('./renderer.js');
const { fpsMonitor } = require('./fpsMonitor.js');
const audioManager = require('./audioManager.js');

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
      lives: LIVES.INITIAL,
      level: 1,
      combo: 0,
      isPlaying: false,
      gameTime: 0,           // 累计游戏时长(ms)
      paused: false,
      phase: PHASE.READY,
      difficulty: 'medium',
      maxCombo: 0,
      killedZombies: 0,
      plantsPlaced: 0,       // 已放置植物数
      sunlight: SUNLIGHT.INITIAL,    // 阳光货币
      selectedPlant: null,   // 当前商店选中植物类型
      lastAnswerTime: 0,
      startTime: 0
    };

    this.rafId = null;
    this.lastTime = 0;
    this._loopErrorCount = 0;
    // UI 回调
    this.onStateChange = null;      // 状态变化回调
    this.onQuestionChange = null;   // 题目变化回调
    this.onGameOver = null;         // 游戏结束回调
    this.onScoreChange = null;      // 分数变化回调
    this.onLifeChange = null;       // 生命值变化回调
    this.onComboChange = null;      // 连击变化回调
    this.onSunlightChange = null;   // 阳光变化回调
    this.onShopSelect = null;       // 商店选中变化回调
    this.onRenderError = null;      // 渲染致命错误回调
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
   * @param {string} difficulty - easy/medium/hard
   * @param {Array} wordBank - 题库
   */
  initGame(difficulty, wordBank) {
    const cfg = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;
    this.state = {
      score: 0,
      lives: LIVES.INITIAL,
      level: 1,
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
      lastAnswerTime: 0,
      startTime: 0
    };
    this._loopErrorCount = 0;

    // 重置各子系统
    pathManager.init();
    quizManager.setWordBank(wordBank);
    quizManager.reset(4);
    zombieManager.reset(cfg, difficulty);
    plantManager.reset();
    renderer.clear();
    fpsMonitor.reset();

    this._notifyAll();
    if (this.onSunlightChange) this.onSunlightChange(this.state.sunlight);
    if (this.onShopSelect) this.onShopSelect(this.state.selectedPlant);
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

      // 1. 植物/投射物更新（攻击、产阳光、飞行、碰撞）
      const sunlightProduced = plantManager.update(dt, {
        getZombiesInLane: (lane) => zombieManager.getZombiesInLane(lane),
        onHitZombie: (zombie, proj) => this._onProjectileHit(zombie, proj)
      });
      if (sunlightProduced > 0) this._addSunlight(sunlightProduced);

      // 2. 僵尸-植物战斗（僵尸啃植物 / 阻挡）
      this._resolveZombiePlantCombat(dt);

      // 3. 僵尸更新（移动、生成、状态机）
      zombieManager.update(dt, (zombie) => this._onZombieReachEnd(zombie));

      // 4. 渲染（render 内部含错误保护）
      renderer.render(
        this.state,
        zombieManager.getAll(),
        plantManager.getPlants(),
        plantManager.getProjectiles()
      );

      // 检查结束条件
      if (this.state.lives <= 0) {
        this._gameOver();
        return;
      }

      // 下一帧
      if (this.canvas && this.canvas.requestAnimationFrame) {
        this.rafId = this.canvas.requestAnimationFrame(() => this._loop());
      } else {
        // 兜底：无 canvas RAF 时用 setTimeout
        this.rafId = setTimeout(() => this._loop(), 1000 / PERFORMANCE.TARGET_FPS);
      }
    } catch (err) {
      console.error('[GameManager] 主循环异常:', err);
      this._loopErrorCount = (this._loopErrorCount || 0) + 1;
      if (this._loopErrorCount >= 3) {
        console.error('[GameManager] 主循环连续异常 ' + this._loopErrorCount + ' 次，终止');
        this.state.isPlaying = false;
        if (this.onGameOver) this.onGameOver(this.getSummary());
      } else {
        if (this.canvas && this.canvas.requestAnimationFrame) {
          this.rafId = this.canvas.requestAnimationFrame(() => this._loop());
        }
      }
    }
  }

  /**
   * 投射物命中僵尸
   */
  _onProjectileHit(zombie, proj) {
    const opts = proj.slow ? { slow: proj.slow } : null;
    const killed = zombieManager.takeDamage(zombie, proj.damage, opts);
    if (killed) {
      this.state.killedZombies++;
      this.state.score += zombie.scoreReward;
      audioManager.play(ASSET_KEYS.AUDIO.KILL);
      // 粒子爆炸
      const pos = pathManager.getPosition(zombie.pathIndex, zombie.progress);
      renderer.addBurst(pos.x, pos.y, zombie.color, 14);
      if (this.onScoreChange) this.onScoreChange(this.state.score);
    }
  }

  /**
   * 僵尸-植物战斗结算
   * - walking 僵尸到达植物槽位 → 转 eating，停止前进
   * - eating 僵尸按间隔啃咬植物
   * - 植物死亡 → 僵尸恢复 walking
   */
  _resolveZombiePlantCombat(dt) {
    const plants = plantManager.getPlants();
    if (!plants.length) {
      // 无植物：所有 eating 僵尸恢复 walking
      for (const z of zombieManager.getAll()) {
        if (z.state === 'eating') {
          z.state = 'walking';
          z.blockedBy = null;
        }
      }
      return;
    }
    // 按车道索引植物以加速查找
    const EPS = 0.01;
    for (const z of zombieManager.getAll()) {
      if (z.state !== 'walking' && z.state !== 'eating') continue;
      // 查找阻挡植物：同车道、plantProgress >= z.progress - EPS 中最小者
      let blockPlant = null;
      let blockPP = Infinity;
      for (const p of plants) {
        if (p.state === 'dead' || !p.active) continue;
        if (p.lane !== z.pathIndex) continue;
        const pp = (p.slot + 0.5) / 5; // GRID.COLS=5
        if (pp >= z.progress - EPS && pp < blockPP) {
          blockPP = pp;
          blockPlant = p;
        }
      }
      if (blockPlant && z.progress >= blockPP - COMBAT.ZOMBIE_EAT_RANGE) {
        // 到达植物，啃食
        z.state = 'eating';
        z.blockedBy = blockPlant.id;
        if (z.attackCooldown <= 0) {
          const plantDied = plantManager.takeDamage(blockPlant, COMBAT.ZOMBIE_ATTACK_DAMAGE);
          z.attackCooldown = COMBAT.ZOMBIE_ATTACK_INTERVAL;
          if (plantDied) {
            // 植物被啃掉，僵尸恢复前进
            z.state = 'walking';
            z.blockedBy = null;
          }
        }
      } else if (z.state === 'eating') {
        // 阻挡植物已消失，恢复 walking
        z.state = 'walking';
        z.blockedBy = null;
      }
    }
  }

  /**
   * 生成下一题（题目与僵尸解耦，仅用于答题赚取阳光）
   */
  _nextQuestion() {
    const cfg = DIFFICULTY_CONFIG[this.state.difficulty];
    const q = quizManager.generateQuestion(cfg.difficultyWeights);
    if (q && this.onQuestionChange) this.onQuestionChange(q);
  }

  /**
   * 僵尸到达终点 - 扣血
   */
  _onZombieReachEnd(zombie) {
    this.state.lives = Math.max(0, this.state.lives - 1);
    if (this.onLifeChange) this.onLifeChange(this.state.lives);
    if (this.state.combo > 0) {
      this.state.combo = 0;
      if (this.onComboChange) this.onComboChange(0);
    }
    if (this.state.lives <= 0) {
      this._gameOver();
    } else {
      wx.vibrateShort && wx.vibrateShort({ type: 'heavy' });
    }
  }

  /**
   * 答题判定
   * - 答对：加分、加阳光、生成下一题
   * - 答错：全场僵尸临时加速、连击清零、生成下一题
   * @param {number} optionIndex - 选项索引
   * @returns {Object} {correct, score, combo, sunlightReward}
   */
  answer(optionIndex) {
    if (!this.state.isPlaying) return { correct: false };
    const result = quizManager.answer(optionIndex);
    this.state.lastAnswerTime = Date.now();

    if (result.correct) {
      // 答对：加阳光
      this._addSunlight(result.sunlightReward);
      this.state.score += result.score;
      this.state.combo = result.combo;
      this.state.maxCombo = Math.max(this.state.maxCombo, result.combo);
      audioManager.play(ASSET_KEYS.AUDIO.CORRECT);
      if (this.onScoreChange) this.onScoreChange(this.state.score);
      if (this.onComboChange) this.onComboChange(this.state.combo);
      this._nextQuestion();
      return { correct: true, score: result.score, combo: result.combo, sunlightReward: result.sunlightReward };
    } else {
      // 答错：全场僵尸临时加速
      audioManager.play(ASSET_KEYS.AUDIO.WRONG);
      zombieManager.applyGlobalSpeedBoost(
        SUNLIGHT.PENALTY_WRONG_SPEED_MULT,
        SUNLIGHT.PENALTY_WRONG_SPEED_TIME
      );
      this.state.combo = 0;
      if (this.onComboChange) this.onComboChange(0);
      this._nextQuestion();
      return { correct: false, score: 0, combo: 0, sunlightReward: 0 };
    }
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
   * 选择/取消选择商店植物
   * @param {string} type - PLANT_TYPES 键名
   */
  selectPlant(type) {
    if (!PLANT_TYPES[type]) return;
    this.state.selectedPlant = (this.state.selectedPlant === type) ? null : type;
    if (this.onShopSelect) this.onShopSelect(this.state.selectedPlant);
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
    // 放置后保持选中，便于连续放置（阳光不足时自动取消）
    if (this.state.sunlight < def.cost) {
      this.state.selectedPlant = null;
      if (this.onShopSelect) this.onShopSelect(null);
    }
    return { ok: true };
  }

  /**
   * 暂停
   */
  pause() {
    if (this.state.phase !== PHASE.PLAYING) return;
    this.state.paused = true;
    this.state.isPlaying = false;
    this._cancelRaf();
    this._notifyAll();
  }

  /**
   * 恢复
   */
  resume() {
    if (this.state.phase !== PHASE.PLAYING) return;
    this.state.paused = false;
    this.state.isPlaying = true;
    this.lastTime = Date.now();
    this._loop();
    this._notifyAll();
  }

  /**
   * 取消主循环
   */
  _cancelRaf() {
    if (this.rafId) {
      if (this.canvas && this.canvas.cancelAnimationFrame) {
        this.canvas.cancelAnimationFrame(this.rafId);
      } else {
        clearTimeout(this.rafId);
      }
      this.rafId = null;
    }
  }

  /**
   * 游戏结束
   */
  _gameOver() {
    this.state.phase = PHASE.GAME_OVER;
    this.state.isPlaying = false;
    this._cancelRaf();
    audioManager.play(ASSET_KEYS.AUDIO.GAME_OVER);
    const summary = this.getSummary();
    if (this.onGameOver) this.onGameOver(summary);
    this._notifyAll();
  }

  /**
   * 获取结算数据
   */
  getSummary() {
    const acc = quizManager.getAccuracy();
    const stars = acc >= 0.9 ? 3 : acc >= 0.7 ? 2 : acc >= 0.5 ? 1 : 0;
    return {
      score: this.state.score,
      maxCombo: this.state.maxCombo,
      killedZombies: this.state.killedZombies,
      plantsPlaced: this.state.plantsPlaced,
      correctCount: quizManager.correctCount,
      wrongCount: quizManager.wrongCount,
      totalAnswered: quizManager.totalAnswered,
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
   * 销毁
   */
  destroy() {
    this.state.isPlaying = false;
    this._cancelRaf();
    zombieManager.clear();
    plantManager.clear();
    renderer.clear();
  }
}

const gameManager = new GameManager();

module.exports = {
  gameManager,
  GameManager,
  PHASE
};
