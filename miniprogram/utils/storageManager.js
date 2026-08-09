// utils/storageManager.js - 本地存储管理器
// 封装 wx.setStorageSync / wx.getStorageSync，提供用户数据持久化

const { STORAGE_KEYS } = require('./constants.js');

const DEFAULT_USER_DATA = {
  highestScore: 0,
  totalGames: 0,
  difficulty: 'middle',
  soundEnabled: true,
  lastPlayedAt: 0
};

/**
 * 加载用户数据
 * @returns {Object} 用户数据对象
 */
function loadUserData() {
  try {
    const data = wx.getStorageSync(STORAGE_KEYS.USER_DATA);
    if (!data) return { ...DEFAULT_USER_DATA };
    return { ...DEFAULT_USER_DATA, ...data };
  } catch (err) {
    console.error('[Storage] 读取用户数据失败:', err);
    return { ...DEFAULT_USER_DATA };
  }
}

/**
 * 保存用户数据
 * @param {Object} payload - 需保存的字段
 * @returns {boolean} 是否成功
 */
function saveUserData(payload) {
  try {
    const current = loadUserData();
    const merged = { ...current, ...payload, lastPlayedAt: Date.now() };
    wx.setStorageSync(STORAGE_KEYS.USER_DATA, merged);
    return true;
  } catch (err) {
    console.error('[Storage] 保存用户数据失败:', err);
    return false;
  }
}

/**
 * 保存最近一局结算（用于结果页）
 * @param {Object} result
 */
function saveLastResult(result) {
  try {
    wx.setStorageSync(STORAGE_KEYS.LAST_RESULT, result);
  } catch (err) {
    console.error('[Storage] 保存结算失败:', err);
  }
}

/**
 * 读取最近一局结算
 * @returns {Object|null}
 */
function loadLastResult() {
  try {
    return wx.getStorageSync(STORAGE_KEYS.LAST_RESULT) || null;
  } catch (err) {
    console.error('[Storage] 读取结算失败:', err);
    return null;
  }
}

/**
 * 清除所有数据（设置页重置用）
 */
function clearAll() {
  try {
    wx.removeStorageSync(STORAGE_KEYS.USER_DATA);
    wx.removeStorageSync(STORAGE_KEYS.LAST_RESULT);
    return true;
  } catch (err) {
    console.error('[Storage] 清除数据失败:', err);
    return false;
  }
}

module.exports = {
  loadUserData,
  saveUserData,
  saveLastResult,
  loadLastResult,
  clearAll
};
