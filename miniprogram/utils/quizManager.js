// utils/quizManager.js - 答题系统管理器
// 负责: 题目选取、选项生成、答题判定、计分、连击、阳光奖励
// 支持三种题型: en2zh(英→中) / zh2en(中→英) / word2pho(词→音标)

const { SCORING, QUESTION_TYPES, SUNLIGHT } = require('./constants.js');

let __questionIdSeed = 1;

/**
 * 答题管理器
 */
class QuizManager {
  constructor() {
    this.wordBank = [];        // 题库
    this.usedIds = new Set();  // 已用题目索引(避免短期重复)
    this.currentQuestion = null;
    this.questionStartTime = 0;
    this.combo = 0;            // 连续答对次数
    this.maxCombo = 0;
    this.correctCount = 0;
    this.wrongCount = 0;
    this.totalAnswered = 0;
    this.timeoutCount = 0;     // v39: 超时未答次数
    this.wrongStreak = 0;     // v45: 连续答错计数 — 答对清零; 超时不计入(v39温和口径), 二错起才触发僵尸加速
    this.optionCount = 4;      // 默认4选项
  }

  /**
   * 初始化题库
   * @param {Array} words - 单词数组 {en,zh,phonetic,difficulty}
   */
  setWordBank(words) {
    this.wordBank = words.slice();
  }

  /**
   * 设置选项数量
   */
  setOptionCount(n) {
    this.optionCount = Math.max(2, Math.min(4, n));
  }

  /**
   * 重置（新游戏）
   */
  reset(optionCount) {
    this.usedIds.clear();
    this.currentQuestion = null;
    this.combo = 0;
    this.maxCombo = 0;
    this.correctCount = 0;
    this.wrongCount = 0;
    this.totalAnswered = 0;
    this.timeoutCount = 0;     // v39: 超时未答次数（新游戏重置）
    this.wrongStreak = 0;     // v45: 新局清零 — 免罚档位重新生效
    if (optionCount) this.setOptionCount(optionCount);
  }

  /**
   * 根据难度权重筛选可用题库
   * @param {Object} difficultyWeights - {1: 0.4, 2: 0.4, 3: 0.2}
   * @returns {Array} 候选词列表
   */
  _filterByDifficulty(difficultyWeights) {
    if (!this.wordBank.length) return [];
    // 按权重抽取难度
    const r = Math.random();
    let acc = 0;
    let targetDiff = 1;
    for (const [d, w] of Object.entries(difficultyWeights)) {
      acc += w;
      if (r <= acc) { targetDiff = parseInt(d); break; }
    }
    const candidates = this.wordBank.filter(w => w.difficulty === targetDiff);
    return candidates.length ? candidates : this.wordBank;
  }

  /**
   * 生成干扰选项
   * @param {Object} correct - 正确词
   * @param {number} count - 干扰项数量
   * @param {string} field - 取值字段 'zh'|'en'|'phonetic'
   * @returns {Array} 干扰词数组
   */
  _generateDistractors(correct, count, field) {
    const correctVal = correct[field];
    // v52: 语义公平排除 — zh2en(field='en') 时与正确词同 zh 的兄弟词也是合法答案
    //   (基库 71 组同译词: learn/study 同译「学习」等), 混入干扰项会形成「双正确
    //   选项被判错」; v50 已在数据侧为考试词库去撞, 此处代码侧泛化兜住基库与
    //   任意导入词库。en2zh/word2pho 按字段值过滤已天然免疫同值。
    //   兄弟词进 relax 池: 仅当严格池凑不满 count(病态词库全同译)才兜底,
    //   保住「4 选项不变量」优先于极端数据的公平性
    const isZh2En = field === 'en';
    const strict = [];
    const relax = [];
    for (const w of this.wordBank) {
      if (!w[field] || w[field] === correctVal) continue;
      if (isZh2En && w.zh === correct.zh) { relax.push(w); continue; }
      strict.push(w);
    }
    // v52: 部分选择采样(只洗前 count 位)替代全量洗牌 O(n)→O(count);
    //   逐项文本去重 — 导入词库脏数据(同字段同值)会产生重复选项文本
    const seen = new Set([correctVal]);
    const picked = [];
    const pickFrom = (pool) => {
      for (let k = 0; k < pool.length && picked.length < count; k++) {
        const j = k + Math.floor(Math.random() * (pool.length - k));
        const tmp = pool[k]; pool[k] = pool[j]; pool[j] = tmp;
        const val = pool[k][field];
        if (!seen.has(val)) {
          seen.add(val);
          picked.push(pool[k]);
        }
      }
    };
    pickFrom(strict);
    if (picked.length < count) pickFrom(relax);
    return picked;
  }

  /**
   * 按权重随机选题型
   * @returns {string} 'en2zh' | 'zh2en' | 'word2pho'
   */
  _rollQuestionType() {
    const r = Math.random();
    let acc = 0;
    for (const v of Object.values(QUESTION_TYPES)) {
      acc += v.weight;
      if (r <= acc) return v.key;
    }
    return 'en2zh';
  }

  /**
   * 生成一道题目
   * @param {Object} difficultyWeights - 难度权重
   * @returns {Object} 题目对象 {id, type, content, phonetic, prompt, options, correctAnswer, answerValue, difficulty}
   */
  generateQuestion(difficultyWeights) {
    if (!this.wordBank.length) return null;
    const candidates = this._filterByDifficulty(difficultyWeights);
    if (!candidates.length) return null;

    // 随机选词（尽量避免短期重复）
    let word = null;
    for (let tries = 0; tries < 8; tries++) {
      const w = candidates[Math.floor(Math.random() * candidates.length)];
      if (!this.usedIds.has(w.en)) { word = w; break; }
    }
    if (!word) word = candidates[Math.floor(Math.random() * candidates.length)];
    this.usedIds.add(word.en);
    // 限制 usedIds 大小
    if (this.usedIds.size > Math.floor(this.wordBank.length * 0.5)) {
      const arr = Array.from(this.usedIds);
      this.usedIds = new Set(arr.slice(Math.floor(arr.length / 2)));
    }

    // 随机选题型
    const qType = this._rollQuestionType();
    let content, prompt, optionsField, answerValue, phonetic = '';

    switch (qType) {
      case 'en2zh':
        content = word.en;
        prompt = QUESTION_TYPES.EN_TO_ZH.label;
        optionsField = 'zh';
        answerValue = word.zh;
        phonetic = word.phonetic || '';
        break;
      case 'zh2en':
        content = word.zh;
        prompt = QUESTION_TYPES.ZH_TO_EN.label;
        optionsField = 'en';
        answerValue = word.en;
        break;
      case 'word2pho':
        // 无音标的词不适合出 word2pho，降级为 en2zh
        if (!word.phonetic) {
          content = word.en;
          prompt = QUESTION_TYPES.EN_TO_ZH.label;
          optionsField = 'zh';
          answerValue = word.zh;
          phonetic = word.phonetic || '';
        } else {
          content = word.en;
          prompt = QUESTION_TYPES.WORD_TO_PHO.label;
          optionsField = 'phonetic';
          answerValue = word.phonetic;
          phonetic = '';   // 不在题干预告答案(音标即选项)
        }
        break;
      default:
        content = word.en;
        prompt = QUESTION_TYPES.EN_TO_ZH.label;
        optionsField = 'zh';
        answerValue = word.zh;
        phonetic = word.phonetic || '';
    }

    // 生成干扰项
    const distractorCount = this.optionCount - 1;
    const distractors = this._generateDistractors(word, distractorCount, optionsField);

    // 组装选项
    const options = [
      { text: word[optionsField], correct: true },
      ...distractors.map(d => ({ text: d[optionsField], correct: false }))
    ];
    // 打乱
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    // 记录正确答案索引
    const correctAnswer = options.findIndex(o => o.correct);

    const question = {
      id: __questionIdSeed++,
      type: qType,                  // 'en2zh' | 'zh2en' | 'word2pho'
      content: content,             // 题干
      phonetic: phonetic,           // 音标（仅 en2zh/word2pho 展示）
      prompt: prompt,               // 题型提示文案
      options: options.map(o => o.text),
      correctAnswer: correctAnswer,
      answerValue: answerValue,     // 正确答案文本
      difficulty: word.difficulty
    };

    this.currentQuestion = question;
    this.questionStartTime = Date.now();
    return question;
  }

  /**
   * 判定答题
   * @param {number} optionIndex - 选择的选项索引
   * @returns {Object} {correct, score, combo, comboMult, sunlightReward}
   */
  answer(optionIndex) {
    // v6 修复 (Task 7-A F12)：返回形状必须与成功分支一致，否则 gameManager.answer 读 undefined → maxCombo 变 NaN
    if (!this.currentQuestion) return { correct: false, score: 0, combo: 0, comboMult: 1, sunlightReward: 0, wrongStreak: 0 };
    const correct = optionIndex === this.currentQuestion.correctAnswer;
    this.totalAnswered++;
    let score = 0;
    let comboMult = 1;
    let sunlightReward = 0;
    if (correct) {
      this.correctCount++;
      this.combo++;
      this.wrongStreak = 0;   // v45: 答对即中断连续答错
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      // 连击倍率
      const idx = Math.min(this.combo - 1, SCORING.COMBO_MULTIPLIERS.length - 1);
      comboMult = SCORING.COMBO_MULTIPLIERS[idx] || SCORING.COMBO_MAX_MULT;
      // 速度奖励
      const elapsed = Date.now() - this.questionStartTime;
      let speedBonus = 0;
      if (elapsed <= SCORING.SPEED_BONUS_TIME) {
        speedBonus = Math.round(SCORING.SPEED_BONUS_MAX * (1 - elapsed / SCORING.SPEED_BONUS_TIME));
      }
      score = Math.round((SCORING.BASE_SCORE + speedBonus) * comboMult);
      sunlightReward = SUNLIGHT.REWARD_CORRECT;
    } else {
      this.wrongCount++;
      this.wrongStreak++;     // v45: 连续答错累积(超时不计) — gameManager 侧二错起才加速
      this.combo = 0;
    }
    return { correct, score, combo: this.combo, comboMult, sunlightReward, wrongStreak: this.wrongStreak };
  }

  /**
   * v39: 登记一次超时未答（温和处理：换题 + 连击清零，不加速僵尸）
   * 统计口径：计入 totalAnswered（诚实反映漏答、拉低准确率），不计入 wrongCount
   * @returns {boolean} 是否登记成功（当前无题时 false）
   */
  registerTimeout() {
    if (!this.currentQuestion) return false;
    this.timeoutCount++;
    this.totalAnswered++;
    this.combo = 0;
    return true;
  }

  /**
   * v39: 暂停恢复时平移题目起始时钟（与 spawner.gameStartTime 同模式）
   * 否则长暂停后 elapsed 虚增 → 恢复瞬间误判超时 / 答对速度奖励丢失
   */
  shiftQuestionClock(ms) {
    if (this.questionStartTime > 0) this.questionStartTime += ms;
  }

  /**
   * 获取当前题目
   */
  getCurrent() {
    return this.currentQuestion;
  }

  /**
   * 统计准确率
   */
  getAccuracy() {
    if (this.totalAnswered === 0) return 0;
    return this.correctCount / this.totalAnswered;
  }
}

const quizManager = new QuizManager();

module.exports = {
  quizManager,
  QuizManager
};
