// pages/result/result.js - 结算页

const app = getApp();
const storageManager = require('../../utils/storageManager.js');
const audioManager = require('../../utils/audioManager.js');
const { ASSET_KEYS } = require('../../utils/constants.js');
const { applyLayout } = require('../../utils/layoutUtil.js');

Page({
  data: {
    isRecord: false,
    score: 0,
    highestScore: 0,
    maxCombo: 0,
    killedZombies: 0,
    correctCount: 0,
    wrongCount: 0,
    accuracy: 0,
    stars: 0,
    gameTime: 0,
    difficulty: 'middle',
    difficultyName: '中学',
    safeTop: 0,
    safeBottom: 0,
    // v2: 胜利/失败标识
    result: 'lose',
    // 星星动画
    starAnim: [false, false, false],
    // 自适应布局
    pageHeight: 1334,
    safeTopRpx: 0,
    safeBottomRpx: 0
  },

  onLoad(options) {
    const result = storageManager.loadLastResult();
    const isRecord = options.isRecord === '1';
    if (!result) {
      // 无结算数据，返回首页
      wx.redirectTo({ url: '/pages/index/index' });
      return;
    }

    // 难度映射表（新版 key + 兼容老数据）
    const diffMap = {
      primary: '小学', middle: '中学', college: '大学',
      // 老数据兼容
      easy: '小学', medium: '中学', hard: '大学'
    };
    this.setData({
      isRecord,
      score: result.score || 0,
      highestScore: app.globalData.highestScore,
      maxCombo: result.maxCombo || 0,
      killedZombies: result.killedZombies || 0,
      correctCount: result.correctCount || 0,
      wrongCount: result.wrongCount || 0,
      accuracy: Math.round((result.accuracy || 0) * 100),
      stars: result.stars || 0,
      gameTime: Math.round((result.gameTime || 0) / 1000),
      difficulty: result.difficulty || 'middle',
      difficultyName: diffMap[result.difficulty] || '中学',
      result: result.result || 'lose',
      safeTop: app.globalData.safeAreaInset.top,
      safeBottom: app.globalData.safeAreaInset.bottom
    });

    // 应用自适应布局
    applyLayout(this);

    // 播放音效（胜利用 WIN 音效，否则 GAME_OVER）
    setTimeout(() => {
      if (this.data.result === 'win' && ASSET_KEYS.AUDIO.WIN) {
        audioManager.play(ASSET_KEYS.AUDIO.WIN);
      } else {
        audioManager.play(ASSET_KEYS.AUDIO.GAME_OVER);
      }
    }, 300);

    // 星星依次点亮动画
    const stars = result.stars || 0;
    for (let i = 0; i < stars; i++) {
      setTimeout(() => {
        this.setData({ ['starAnim[' + i + ']']: true });
      }, 600 + i * 350);
    }
  },

  /**
   * 横竖屏切换 / 窗口尺寸变化时重新计算布局
   */
  onAdaptiveResize() {
    applyLayout(this);
  },

  /**
   * 再玩一次
   */
  onReplay() {
    audioManager.play(ASSET_KEYS.AUDIO.START);
    wx.redirectTo({
      url: '/pages/game/game?difficulty=' + this.data.difficulty
    });
  },

  /**
   * 返回首页
   */
  onHome() {
    wx.redirectTo({ url: '/pages/index/index' });
  },

  /**
   * 分享
   */
  onShareAppMessage() {
    return {
      title: '我在单词农场' + this.data.difficultyName + '模式得了' + this.data.score + '分！连击x' + this.data.maxCombo + '，准确率' + this.data.accuracy + '%',
      path: '/pages/index/index'
    };
  },

  /**
   * 保存到相册（截图分享，调用 canvas 截图能力可扩展）
   */
  onSaveImage() {
    wx.showToast({
      title: '可截图分享给好友～',
      icon: 'none',
      duration: 2000
    });
    this.onShareAppMessage();
  }
});
