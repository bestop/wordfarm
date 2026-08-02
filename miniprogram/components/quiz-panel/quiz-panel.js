// components/quiz-panel/quiz-panel.js - 答题面板组件

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
    }
  },

  data: {
    selectedOption: -1
  },

  observers: {
    'question': function(q) {
      // 题目变化时重置选中状态
      this.setData({ selectedOption: -1 });
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
