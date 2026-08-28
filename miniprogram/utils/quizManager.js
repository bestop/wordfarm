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
    const pool = this.wordBank.filter(w => w[field] !== correctVal && w[field]);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
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
    if (!this.currentQuestion) return { correct: false, score: 0, combo: 0, comboMult: 1, sunlightReward: 0 };
    const correct = optionIndex === this.currentQuestion.correctAnswer;
    this.totalAnswered++;
    let score = 0;
    let comboMult = 1;
    let sunlightReward = 0;
    if (correct) {
      this.correctCount++;
      this.combo++;
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
      this.combo = 0;
    }
    return { correct, score, combo: this.combo, comboMult, sunlightReward };
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
