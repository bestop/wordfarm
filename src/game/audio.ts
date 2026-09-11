// src/game/audio.ts - 音效管理器
// 移植自微信小程序端 utils/audioManager.js — 程序化合成 10 种音效（零音频文件）
// 浏览器原生 Web Audio API（wx.createWebAudioContext 的浏览器对应物）
// 兜底：轻量视觉/振动反馈由调用方处理，此处静默失败不阻断主流程

import { AUDIO_KEYS, type AudioKey } from './constants'

let soundEnabled = true
let audioContext: AudioContext | null = null

/** 确保音频上下文就绪（浏览器要求首次用户手势后才能创建/恢复） */
function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!audioContext) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      audioContext = new Ctor()
    }
    if (audioContext.state === 'suspended') {
      void audioContext.resume()
    }
    return audioContext
  } catch {
    return null
  }
}

function init(enabled: boolean) {
  soundEnabled = enabled !== false
}

function setEnabled(enabled: boolean) {
  const prev = soundEnabled
  soundEnabled = !!enabled
  if (!soundEnabled && prev) pause()
  else if (soundEnabled && !prev) resume()
}

function isEnabled() {
  return soundEnabled
}

/** 解锁音频（须在用户手势事件中调用一次，如点击「开始游戏」） */
function unlock() {
  ensureContext()
}

interface SynthOptions {
  freq: number
  freqEnd?: number
  duration?: number
  wave?: OscillatorType
  volume?: number
  delayMs?: number
}

function playSynth(o: SynthOptions) {
  if (!soundEnabled) return
  const ctx = ensureContext()
  if (!ctx) return
  try {
    const startAt = ctx.currentTime + (o.delayMs ?? 0) / 1000
    const duration = o.duration ?? 0.2
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = o.wave || 'sine'
    osc.frequency.setValueAtTime(o.freq, startAt)
    if (o.freqEnd) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), startAt + duration)
    }
    const vol = o.volume ?? 0.18
    gain.gain.setValueAtTime(0, startAt)
    gain.gain.linearRampToValueAtTime(vol, startAt + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(startAt)
    osc.stop(startAt + duration + 0.05)
  } catch {
    // 静默失败（与小程序端 v6 F12 惯例一致，可诊断但不阻断）
  }
}

/** 播放指定音效（setTimeout 链改为 delayMs 参数，浏览器主线程更稳） */
function play(key: AudioKey | string) {
  if (!soundEnabled) return
  switch (key) {
    case AUDIO_KEYS.START: // 上扬两音
      playSynth({ freq: 523, freqEnd: 784, duration: 0.18, wave: 'triangle', volume: 0.2 })
      playSynth({ freq: 784, freqEnd: 1047, duration: 0.22, wave: 'triangle', volume: 0.2, delayMs: 140 })
      break
    case AUDIO_KEYS.CORRECT: // 清脆上行琶音
      playSynth({ freq: 659, duration: 0.1, wave: 'sine', volume: 0.22 })
      playSynth({ freq: 880, duration: 0.12, wave: 'sine', volume: 0.22, delayMs: 90 })
      playSynth({ freq: 1319, duration: 0.16, wave: 'sine', volume: 0.2, delayMs: 180 })
      break
    case AUDIO_KEYS.WRONG: // 低沉下行
      playSynth({ freq: 220, freqEnd: 110, duration: 0.32, wave: 'sawtooth', volume: 0.18 })
      break
    case AUDIO_KEYS.KILL: // 短促爆破音
      playSynth({ freq: 880, freqEnd: 220, duration: 0.18, wave: 'square', volume: 0.2 })
      playSynth({ freq: 440, freqEnd: 110, duration: 0.14, wave: 'triangle', volume: 0.16, delayMs: 80 })
      break
    case AUDIO_KEYS.GAME_OVER: // 下行三音
      playSynth({ freq: 523, duration: 0.2, wave: 'triangle', volume: 0.2 })
      playSynth({ freq: 392, duration: 0.24, wave: 'triangle', volume: 0.2, delayMs: 200 })
      playSynth({ freq: 261, duration: 0.4, wave: 'triangle', volume: 0.2, delayMs: 440 })
      break
    case AUDIO_KEYS.WIN: // 胜利华彩：上行五音琶音 + 高八度收尾
      playSynth({ freq: 523, duration: 0.16, wave: 'triangle', volume: 0.22 })
      playSynth({ freq: 659, duration: 0.16, wave: 'triangle', volume: 0.22, delayMs: 140 })
      playSynth({ freq: 784, duration: 0.16, wave: 'triangle', volume: 0.22, delayMs: 280 })
      playSynth({ freq: 1047, duration: 0.2, wave: 'triangle', volume: 0.22, delayMs: 420 })
      playSynth({ freq: 1568, duration: 0.36, wave: 'sine', volume: 0.2, delayMs: 600 })
      break
    case AUDIO_KEYS.LEVEL_UP: // 关卡推进：清亮双音 ping
      playSynth({ freq: 880, duration: 0.12, wave: 'triangle', volume: 0.2 })
      playSynth({ freq: 1319, duration: 0.16, wave: 'triangle', volume: 0.2, delayMs: 110 })
      break
    case AUDIO_KEYS.FINAL_WAVE: // v51 终局大波：低音战争号角双响
      playSynth({ freq: 196, freqEnd: 147, duration: 0.45, wave: 'sawtooth', volume: 0.22 })
      playSynth({ freq: 165, freqEnd: 110, duration: 0.55, wave: 'sawtooth', volume: 0.22, delayMs: 380 })
      break
    case AUDIO_KEYS.SUN: // 阳光收集：高频亮闪（铃铛感）
      playSynth({ freq: 1319, duration: 0.1, wave: 'sine', volume: 0.18 })
      playSynth({ freq: 1760, duration: 0.12, wave: 'sine', volume: 0.16, delayMs: 70 })
      break
    case AUDIO_KEYS.PLACE: // 植物放置：低频闷响（土落感）
      playSynth({ freq: 196, freqEnd: 130, duration: 0.14, wave: 'sine', volume: 0.2 })
      break
    default:
      break
  }
}

function pause() {
  if (audioContext && audioContext.state === 'running') {
    try { void audioContext.suspend() } catch { /* ignore */ }
  }
}

function resume() {
  if (audioContext && audioContext.state === 'suspended') {
    try { void audioContext.resume() } catch { /* ignore */ }
  }
}

function destroy() {
  try {
    if (audioContext) void audioContext.close()
  } catch { /* ignore */ }
  audioContext = null
  soundEnabled = false
}

export const audioManager = {
  init,
  setEnabled,
  isEnabled,
  unlock,
  play,
  pause,
  resume,
  destroy,
}
