// components/quiz-panel/quiz-panel.js - 答题面板组件
// v39: 新增题目限时倒计时（remain-ms / time-limit-ms 属性驱动，纯展示无内部计时器）

const { QUIZ } = require('../../utils/constants.js');

Component({
  properties: {
    // 当前题目对象 {id, content, phonetic, options, correctAnswer, difficulty}
    question: {
      type: Object,
      value: null
    },
    // 答题反馈状态: 'idle' | 'correct' | 'wrong'
    feedback: {
      type: String,
      value: 'idle'
    },
    // 是否禁用（已答等待下一题）
    disabled: {
      type: Boolean,
      value: false
    },
    // v39: 单题限时(ms)，0/缺省隐藏倒计时
    timeLimitMs: {
      type: Number,
      value: 0
    },
    // v39: 剩余毫秒（负值隐藏；页面 500ms 心跳推送，条宽由 CSS transition 平滑）
    remainMs: {
      type: Number,
      value: -1
    }
  },

  data: {
    selectedOption: -1,
    optionLetters: ['A', 'B', 'C', 'D'],   // v40: 选项字母徽章（选项数 2~4, 由 setOptionCount 钳制）
    // v39: 倒计时派生态（observer 计算，无内部计时器）
    timerOn: false,
    remainSec: 0,
    barPct: 100,
    timerDanger: false
  },

  observers: {
    'question': function(q) {
      // 题目变化时重置选中状态
      this.setData({ selectedOption: -1 });
    },
    // v39: remainMs → 秒数 / 条宽 / 紧急态派生（500ms 一次，开销可忽略）
    'remainMs, timeLimitMs': function(remain, limit) {
      if (typeof remain !== 'number' || remain < 0 || !limit || limit <= 0) {
        if (this.data.timerOn) this.setData({ timerOn: false, remainSec: 0, barPct: 100, timerDanger: false });
        return;
      }
      const pct = Math.max(0, Math.min(100, (remain / limit) * 100));
      this.setData({
        timerOn: true,
        remainSec: Math.ceil(remain / 1000),
        barPct: Math.round(pct * 10) / 10,
        timerDanger: remain <= QUIZ.TIMER_DANGER_MS
      });
    }
  },

  methods: {
    /**
     * 点击选项
     */
    onTapOption(e) {
      if (this.data.disabled || !this.data.question) return;
      const idx = e.currentTarget.dataset.index;
      this.setData({ selectedOption: idx });
      // 触发事件给父页面判定
      this.triggerEvent('answer', { optionIndex: idx });
    }
  }
});
