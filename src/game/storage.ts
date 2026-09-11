// src/game/storage.ts - 本地存储管理器
// 移植自微信小程序端 utils/storageManager.js — wx.storage → localStorage 对应实现

import { STORAGE_KEYS } from './constants'

export interface UserData {
  highestScore: number
  totalGames: number
  difficulty: string
  soundEnabled: boolean
}

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

// ---- 订阅机制（供 useSyncExternalStore 使用, 缓存快照防无限重渲染） ----
const storageListeners = new Set<() => void>()
let cachedUserData: UserData | null = null

export function subscribeUserData(cb: () => void) {
  storageListeners.add(cb)
  return () => {
    storageListeners.delete(cb)
  }
}

function notifyUserData() {
  cachedUserData = null
  for (const cb of storageListeners) cb()
}

/** 缓存版读取（getSnapshot 必须返回稳定引用） */
export function loadUserDataCached(): UserData {
  if (!cachedUserData) cachedUserData = loadUserData()
  return cachedUserData
}

export function loadUserData(): UserData {
  try {
    if (!isBrowser()) return { ...DEFAULT_USER_DATA }
    const raw = window.localStorage.getItem(STORAGE_KEYS.USER_DATA)
    if (!raw) return { ...DEFAULT_USER_DATA }
    const data = JSON.parse(raw) as Partial<UserData>
    return { ...DEFAULT_USER_DATA, ...data }
  } catch {
    return { ...DEFAULT_USER_DATA }
  }
}

export function saveUserData(payload: Partial<UserData>): boolean {
  try {
    if (!isBrowser()) return false
    const merged = { ...loadUserData(), ...payload }
    window.localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(merged))
    notifyUserData()
    return true
  } catch {
    return false
  }
}

export interface LastResult {
  result: 'win' | 'lose'
  score: number
  level: number
  maxCombo: number
  killedZombies: number
  accuracy: number
  stars: number
  gameTime: number
  difficulty: string
  endedAt: number
}

export function saveLastResult(result: LastResult) {
  try {
    if (!isBrowser()) return
    window.localStorage.setItem(STORAGE_KEYS.LAST_RESULT, JSON.stringify(result))
  } catch { /* ignore */ }
}

export function loadLastResult(): LastResult | null {
  try {
    if (!isBrowser()) return null
    const raw = window.localStorage.getItem(STORAGE_KEYS.LAST_RESULT)
    return raw ? (JSON.parse(raw) as LastResult) : null
  } catch {
    return null
  }
}

export function clearAll(): boolean {
  try {
    if (!isBrowser()) return false
    window.localStorage.removeItem(STORAGE_KEYS.USER_DATA)
    window.localStorage.removeItem(STORAGE_KEYS.LAST_RESULT)
    notifyUserData()
    return true
  } catch {
    return false
  }
}

export { notifyUserData }

export const DEFAULT_USER_DATA: UserData = {
  highestScore: 0,
  totalGames: 0,
  difficulty: 'junior',
  soundEnabled: true,
}
