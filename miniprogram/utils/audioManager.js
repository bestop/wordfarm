// utils/audioManager.js - 音效管理器
// 基于 wx.createInnerAudioContext 实现5种关键音效
// 采用程序化合成音（无需音频文件），通过 Web Audio API 在小程序中合成
// 兜底使用系统振动反馈，确保兼容性

const { ASSET_KEYS } = require('./constants.js');

let soundEnabled = true;
let audioContext = null;

/**
 * 初始化音频系统
 * @param {boolean} enabled - 是否启用音效
 */
function init(enabled) {
  soundEnabled = enabled !== false;
  try {
    // 尝试使用 Web Audio API 合成音效（部分小程序基础库支持）
    if (typeof wx.createWebAudioContext === 'function') {
      audioContext = wx.createWebAudioContext();
      console.log('[Audio] WebAudioContext 已就绪');
    } else {
      console.log('[Audio] WebAudioContext 不可用，将使用振动反馈');
    }
  } catch (err) {
    console.warn('[Audio] 初始化失败:', err);
  }
}

/**
 * 设置音效开关
 * v6 修复 (Task 7-B F9): 关音效时 suspend audioContext 省电，开音效时 resume
 *  此前只改 soundEnabled flag，audioContext 仍运行（电池消耗）
 * @param {boolean} enabled
 */
function setEnabled(enabled) {
  const prev = soundEnabled;
  soundEnabled = !!enabled;
  if (!soundEnabled && prev) {
    // 开→关：suspend audioContext
    pause();
  } else if (soundEnabled && !prev) {
    // 关→开：resume audioContext
    // v6 修复 (Task 11 F30): audioContext 懒重建 — init 期 wx.createWebAudioContext 可能不可用，
    //  此时再尝试一次（用户主动开音效是合适时机）
    if (!audioContext && typeof wx.createWebAudioContext === 'function') {
      try { audioContext = wx.createWebAudioContext(); } catch (e) {}
    }
    resume();
  }
}

/**
 * 播放合成音效（基于振荡器）
 * @param {string} type - 音效类型
 * @param {Object} options - 频率/时长/波形配置
 */
function playSynth(type, options = {}) {
  if (!soundEnabled || !audioContext) return;
  try {
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = options.wave || 'sine';
    osc.frequency.setValueAtTime(options.freq || 440, now);
    if (options.freqEnd) {
      osc.frequency.exponentialRampToValueAtTime(options.freqEnd, now + (options.duration || 0.2));
    }
    const vol = options.volume || 0.18;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (options.duration || 0.2));
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + (options.duration || 0.2) + 0.05);
  } catch (err) {
    // v6 修复 (Task 11 F12): 静默失败加日志，开发期可诊断音效合成问题
    console.warn('[Audio] playSynth 失败:', err);
  }
}

/**
 * 振动反馈兜底
 * @param {string} style - 'light' | 'medium' | 'heavy'
 */
function haptic(style = 'light') {
  if (!soundEnabled) return;
  try {
    if (wx.vibrateShort) {
      wx.vibrateShort({ type: style });
    }
  } catch (e) { /* ignore */ }
}

/**
 * 播放指定音效
 * @param {string} key - ASSET_KEYS.AUDIO 中的键
 */
function play(key) {
  if (!soundEnabled) return;
  switch (key) {
    case ASSET_KEYS.AUDIO.START:
      // 上扬两音
      playSynth('start', { freq: 523, freqEnd: 784, duration: 0.18, wave: 'triangle', volume: 0.2 });
      setTimeout(() => playSynth('start', { freq: 784, freqEnd: 1047, duration: 0.22, wave: 'triangle', volume: 0.2 }), 140);
      haptic('light');
      break;
    case ASSET_KEYS.AUDIO.CORRECT:
      // 清脆上行琶音
      playSynth('correct', { freq: 659, duration: 0.10, wave: 'sine', volume: 0.22 });
      setTimeout(() => playSynth('correct', { freq: 880, duration: 0.12, wave: 'sine', volume: 0.22 }), 90);
      setTimeout(() => playSynth('correct', { freq: 1319, duration: 0.16, wave: 'sine', volume: 0.20 }), 180);
      haptic('light');
      break;
    case ASSET_KEYS.AUDIO.WRONG:
      // 低沉下行
      playSynth('wrong', { freq: 220, freqEnd: 110, duration: 0.32, wave: 'sawtooth', volume: 0.18 });
      haptic('heavy');
      break;
    case ASSET_KEYS.AUDIO.KILL:
      // 短促爆破音
      playSynth('kill', { freq: 880, freqEnd: 220, duration: 0.18, wave: 'square', volume: 0.20 });
      setTimeout(() => playSynth('kill', { freq: 440, freqEnd: 110, duration: 0.14, wave: 'triangle', volume: 0.16 }), 80);
      haptic('medium');
      break;
    case ASSET_KEYS.AUDIO.GAME_OVER:
      // 下行三音
      playSynth('over', { freq: 523, duration: 0.20, wave: 'triangle', volume: 0.20 });
      setTimeout(() => playSynth('over', { freq: 392, duration: 0.24, wave: 'triangle', volume: 0.20 }), 200);
      setTimeout(() => playSynth('over', { freq: 261, duration: 0.40, wave: 'triangle', volume: 0.20 }), 440);
      haptic('heavy');
      break;
    case ASSET_KEYS.AUDIO.WIN:
      // 胜利华彩：上行五音琶音 + 高八度收尾，情绪明显区别于 GAME_OVER 的下行哀鸣
      playSynth('win', { freq: 523, duration: 0.16, wave: 'triangle', volume: 0.22 });
      setTimeout(() => playSynth('win', { freq: 659, duration: 0.16, wave: 'triangle', volume: 0.22 }), 140);
      setTimeout(() => playSynth('win', { freq: 784, duration: 0.16, wave: 'triangle', volume: 0.22 }), 280);
      setTimeout(() => playSynth('win', { freq: 1047, duration: 0.20, wave: 'triangle', volume: 0.22 }), 420);
      setTimeout(() => playSynth('win', { freq: 1568, duration: 0.36, wave: 'sine', volume: 0.20 }), 600);
      haptic('medium');
      break;
    case ASSET_KEYS.AUDIO.LEVEL_UP:
      // 关卡推进：清亮双音 ping（高→更高），与胜利华彩区分（更短、更轻）
      playSynth('levelup', { freq: 880, duration: 0.12, wave: 'triangle', volume: 0.20 });
      setTimeout(() => playSynth('levelup', { freq: 1319, duration: 0.16, wave: 'triangle', volume: 0.20 }), 110);
      haptic('light');
      break;
    case ASSET_KEYS.AUDIO.SUN:
      // 阳光收集：高频亮闪（铃铛感），与答题 CORRECT 的中频琶音区分
      playSynth('sun', { freq: 1319, duration: 0.10, wave: 'sine', volume: 0.18 });
      setTimeout(() => playSynth('sun', { freq: 1760, duration: 0.12, wave: 'sine', volume: 0.16 }), 70);
      haptic('light');
      break;
    case ASSET_KEYS.AUDIO.PLACE:
      // 植物放置：低频闷响（土落感），与 KILL 的爆破音区分（更柔、更短）
      playSynth('place', { freq: 196, freqEnd: 130, duration: 0.14, wave: 'sine', volume: 0.20 });
      haptic('medium');
      break;
    default:
      break;
  }
}

/**
 * 暂停（小程序隐藏时）
 */
function pause() {
  if (audioContext && audioContext.suspend) {
    try { audioContext.suspend(); } catch (e) {}
  }
}

/**
 * 恢复（小程序显示时）
 */
function resume() {
  if (audioContext && audioContext.resume) {
    try { audioContext.resume(); } catch (e) {}
  }
}

// v6 新增 (Task 7-B F9)：释放 WebAudio 上下文，避免永不释放
function destroy() {
  try {
    if (audioContext && typeof audioContext.close === 'function') {
      audioContext.close();
    }
  } catch (err) {
    console.warn('[Audio] destroy close failed:', err);
  }
  audioContext = null;
  soundEnabled = false;
}

module.exports = {
  init,
  setEnabled,
  play,
  pause,
  resume,
  destroy           // v6 新增 (Task 7-B F9)
};
