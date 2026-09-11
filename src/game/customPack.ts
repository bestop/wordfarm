// src/game/customPack.ts - 自定义词库导入模块 (v35)
// 移植自微信小程序端 utils/customWordPack.js — wx.chooseMessageFile → 浏览器 <input type="file">
// 词库文件格式（宽容解析）:
//   方式 A(推荐): { "name": "词库名", "words": [ { "en": "apple", "zh": "苹果", "phonetic": "/ˈæpl/", "difficulty": 1 }, ... ] }
//   方式 B(极简): [ { "en": "apple", "zh": "苹果" }, ... ]  (顶层直接是数组)
//   · en/zh 必填; phonetic 可选(缺省 ''); difficulty 合法值 1|2|3(其余归 1)
//   · 有效词数 >= 8 才可导入; en 重复自动去重(保留首个)

import { CUSTOM_WORD_PACK, STORAGE_KEYS } from './constants'
import type { Word } from './words'

export interface ParsedPack {
  ok: boolean
  error?: string
  name?: string
  words?: Word[]
  importedAt?: number
}

export interface SavedPack {
  name: string
  count: number
  importedAt: number
  words: Word[]
}

/** 解析词库文本(JSON 字符串) → 标准词包对象（纯函数，无 DOM 依赖，便于测试） */
export function parsePack(text: string): ParsedPack {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: '文件内容为空' }
  }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: '不是有效的 JSON 文件' }
  }

  // 兼容两种顶层结构: {name, words} 或 纯数组
  let name = ''
  let rawList: unknown[] | null = null
  if (Array.isArray(data)) {
    rawList = data
  } else if (data && typeof data === 'object' && Array.isArray((data as { words?: unknown[] }).words)) {
    rawList = (data as { words: unknown[] }).words
    const n = (data as { name?: unknown }).name
    name = typeof n === 'string' ? n.trim() : ''
  } else {
    return { ok: false, error: '格式不对：需要 { "name":…, "words": […] } 或直接是单词数组' }
  }
  if (!rawList.length) {
    return { ok: false, error: '词库是空的（words 里没有单词）' }
  }
  if (rawList.length > CUSTOM_WORD_PACK.MAX_WORDS) {
    return { ok: false, error: `词库太大（最多 ${CUSTOM_WORD_PACK.MAX_WORDS} 词，当前 ${rawList.length}）` }
  }

  // 逐词校验 + 归一
  const seen = new Set<string>()
  const words: Word[] = []
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const en = typeof rec.en === 'string' ? rec.en.trim() : ''
    const zh = typeof rec.zh === 'string' ? rec.zh.trim() : ''
    if (!en || !zh) continue // 必填字段缺失 → 丢弃该词
    if (seen.has(en.toLowerCase())) continue // en 重复 → 保留首个
    seen.add(en.toLowerCase())
    const phonetic = typeof rec.phonetic === 'string' ? rec.phonetic.trim() : ''
    const diffNum = parseInt(String(rec.difficulty), 10)
    const difficulty = diffNum === 2 || diffNum === 3 ? diffNum : 1
    words.push({ en, zh, phonetic, difficulty })
  }

  if (words.length < CUSTOM_WORD_PACK.MIN_WORDS) {
    return { ok: false, error: `有效单词不足 ${CUSTOM_WORD_PACK.MIN_WORDS} 个（当前 ${words.length}）` }
  }

  return {
    ok: true,
    name: name || '自定义词库',
    words,
    importedAt: Date.now(),
  }
}

/** 持久化词包（localStorage） */
export function savePack(pack: ParsedPack): boolean {
  try {
    if (typeof window === 'undefined' || !pack.ok || !pack.words) return false
    const payload: SavedPack = {
      name: pack.name || '自定义词库',
      count: pack.words.length,
      importedAt: pack.importedAt || Date.now(),
      words: pack.words,
    }
    window.localStorage.setItem(STORAGE_KEYS.CUSTOM_WORD_PACK, JSON.stringify(payload))
    notifyPack()
    return true
  } catch {
    return false
  }
}

/** 读取已保存词包 */
export function loadPack(): SavedPack | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(STORAGE_KEYS.CUSTOM_WORD_PACK)
    if (!raw) return null
    const pack = JSON.parse(raw) as SavedPack
    if (!pack || !Array.isArray(pack.words) || pack.words.length < CUSTOM_WORD_PACK.MIN_WORDS) return null
    return pack
  } catch {
    return null
  }
}

// ---- 订阅机制（供 useSyncExternalStore 使用） ----
const packListeners = new Set<() => void>()
let cachedPack: SavedPack | null | undefined

export function subscribePack(cb: () => void) {
  packListeners.add(cb)
  return () => {
    packListeners.delete(cb)
  }
}

function notifyPack() {
  cachedPack = undefined
  for (const cb of packListeners) cb()
}

/** 缓存版读取（getSnapshot 必须返回稳定引用；null 需要哨兵区分未初始化） */
export function loadPackCached(): SavedPack | null {
  if (cachedPack === undefined) cachedPack = loadPack()
  return cachedPack
}

/** 删除已保存词包 */
export function removePack(): boolean {
  try {
    if (typeof window === 'undefined') return false
    window.localStorage.removeItem(STORAGE_KEYS.CUSTOM_WORD_PACK)
    notifyPack()
    return true
  } catch {
    return false
  }
}

/** 文件大小 / 扩展名预校验 */
export function validateFile(file: File): { ok: boolean; error?: string } {
  if (file.size > CUSTOM_WORD_PACK.MAX_FILE_SIZE) {
    return { ok: false, error: `文件太大（上限 512KB，当前 ${(file.size / 1024).toFixed(0)}KB）` }
  }
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (!CUSTOM_WORD_PACK.ACCEPT_EXT.includes(ext)) {
    return { ok: false, error: `仅支持 ${CUSTOM_WORD_PACK.ACCEPT_EXT.join(' / ')} 文件` }
  }
  return { ok: true }
}
