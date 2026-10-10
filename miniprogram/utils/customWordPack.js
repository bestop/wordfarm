// utils/customWordPack.js - 自定义词库导入模块 (v35)
// 负责: 词库文件解析(JSON 宽容格式)、本地持久化、微信文件选择导入
// 使用场景: 首页难度选择「导入词库」档 — 家长/老师可将任意词表 JSON 导入,
//          游戏仅从导入词库出题(如「上海五年级英语·新教材」词库文件)
//
// 词库文件格式(宽容解析):
//   方式 A(推荐): { "name": "词库名", "words": [ { "en": "apple", "zh": "苹果",
//                   "phonetic": "/ˈæpl/", "difficulty": 1 }, ... ] }
//   方式 B(极简): [ { "en": "apple", "zh": "苹果" }, ... ]  (顶层直接是数组)
//   · en/zh 必填; phonetic 可选(缺省 ''); difficulty 可选(缺省/非法 → 1)
//   · 有效词数 >= 8 才可导入(4 选项出题需干扰项); en 重复自动去重(保留首个)
//   · difficulty 合法值 1|2|3(对应小学/初中/高中词频档, v50 重划), 其余归 1
//
// 导入渠道: wx.chooseMessageFile(从微信聊天文件选择, 手机端可用)
//   → FileSystemManager.readFile(UTF-8) → parsePack 校验 → savePack 持久化

const { STORAGE_KEYS, CUSTOM_WORD_PACK } = require('./constants.js');

/**
 * 解析词库文本(JSON 字符串) → 标准词包对象
 * 纯函数(无 wx 依赖), 便于单测仿真
 * @param {string} text - JSON 文本
 * @returns {{ok: boolean, error?: string, name?: string, words?: Array}}
 */
function parsePack(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: '文件内容为空' };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: '不是有效的 JSON 文件' };
  }

  // 兼容两种顶层结构: {name, words} 或 纯数组
  let name = '';
  let rawList = null;
  if (Array.isArray(data)) {
    rawList = data;
  } else if (data && typeof data === 'object' && Array.isArray(data.words)) {
    rawList = data.words;
    name = typeof data.name === 'string' ? data.name.trim() : '';
  } else {
    return { ok: false, error: '格式不对：需要 { "name":…, "words": […] } 或直接是单词数组' };
  }
  if (!rawList.length) {
    return { ok: false, error: '词库是空的（words 里没有单词）' };
  }
  if (rawList.length > CUSTOM_WORD_PACK.MAX_WORDS) {
    return { ok: false, error: '词库太大（最多 ' + CUSTOM_WORD_PACK.MAX_WORDS + ' 词，当前 ' + rawList.length + '）' };
  }

  // 逐词校验 + 归一
  const seen = new Set();
  const words = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const en = typeof item.en === 'string' ? item.en.trim() : '';
    const zh = typeof item.zh === 'string' ? item.zh.trim() : '';
    if (!en || !zh) continue;                      // 必填字段缺失 → 丢弃该词
    if (seen.has(en.toLowerCase())) continue;      // en 重复 → 保留首个
    seen.add(en.toLowerCase());
    const phonetic = typeof item.phonetic === 'string' ? item.phonetic.trim() : '';
    const diffNum = parseInt(item.difficulty, 10);
    const difficulty = (diffNum === 2 || diffNum === 3) ? diffNum : 1;
    words.push({ en, zh, phonetic, difficulty });
  }

  if (words.length < CUSTOM_WORD_PACK.MIN_WORDS) {
    return { ok: false, error: '有效单词不足 ' + CUSTOM_WORD_PACK.MIN_WORDS + ' 个（当前 ' + words.length + '）' };
  }

  return {
    ok: true,
    name: name || '自定义词库',
    words,
    importedAt: Date.now()
  };
}

/**
 * 持久化词包(wx storage)
 * @param {Object} pack - parsePack 产物 {ok:true, name, words, importedAt}
 * @returns {boolean}
 */
function savePack(pack) {
  try {
    wx.setStorageSync(STORAGE_KEYS.CUSTOM_WORD_PACK, {
      name: pack.name,
      count: pack.words.length,
      importedAt: pack.importedAt || Date.now(),
      words: pack.words
    });
    return true;
  } catch (err) {
    console.error('[CustomWordPack] 保存词库失败:', err);
    return false;
  }
}

/**
 * 读取已导入词包
 * @returns {Object|null} {name, count, importedAt, words} 或 null(未导入)
 */
function loadPack() {
  try {
    const data = wx.getStorageSync(STORAGE_KEYS.CUSTOM_WORD_PACK);
    if (!data || !Array.isArray(data.words) || !data.words.length) return null;
    return data;
  } catch (err) {
    console.error('[CustomWordPack] 读取词库失败:', err);
    return null;
  }
}

/**
 * 清除词包
 */
function clearPack() {
  try {
    wx.removeStorageSync(STORAGE_KEYS.CUSTOM_WORD_PACK);
  } catch (err) {
    console.error('[CustomWordPack] 清除词库失败:', err);
  }
}

/**
 * 从微信聊天文件选择并导入词库
 * 流程: chooseMessageFile → readFile → parsePack → savePack
 * @returns {Promise<{ok: boolean, cancelled?: boolean, error?: string, name?: string, count?: number}>}
 */
function importFromFile() {
  return new Promise((resolve) => {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: CUSTOM_WORD_PACK.ACCEPT_EXT,
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) {
          resolve({ ok: false, cancelled: true });
          return;
        }
        if (file.size > CUSTOM_WORD_PACK.MAX_FILE_SIZE) {
          resolve({ ok: false, error: '文件太大（请小于 ' + (CUSTOM_WORD_PACK.MAX_FILE_SIZE / 1024) + 'KB）' });
          return;
        }
        const fs = wx.getFileSystemManager();
        fs.readFile({
          filePath: file.path,
          encoding: 'utf-8',
          success: (readRes) => {
            const pack = parsePack(readRes.data);
            if (!pack.ok) {
              resolve({ ok: false, error: pack.error });
              return;
            }
            if (!savePack(pack)) {
              resolve({ ok: false, error: '保存词库失败，请重试' });
              return;
            }
            resolve({ ok: true, name: pack.name, count: pack.words.length });
          },
          fail: () => resolve({ ok: false, error: '读取文件失败' })
        });
      },
      fail: (err) => {
        // 用户取消(errMsg 含 cancel)或接口不可用
        const cancelled = err && err.errMsg && err.errMsg.indexOf('cancel') >= 0;
        resolve({ ok: false, cancelled, error: cancelled ? '' : '选择文件失败' });
      }
    });
  });
}

module.exports = {
  parsePack,
  savePack,
  loadPack,
  clearPack,
  importFromFile
};
