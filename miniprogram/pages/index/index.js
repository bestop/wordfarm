// pages/index/index.js - 欢迎页（v76 糖果果冻打磨版）：糖果牌匾导航 + 数据胶囊条
//   + PvZ 插画横幅（/images/banner-hero.jpg + CSS「VS」大字）+ 六色果冻词库牌
//   + 大冒险卡（左插画 + 右双色标题/2×2 玩法徽章 + 卡内居中「开始冒险」果冻按钮 + 右下角龙珠奖励球）
// v86 变化（外研版词库 + 弹窗三级筛选）：
//   · 「更多词库」弹窗新增「外研版（一年级起点）· 外语教学与研究出版社」组
//     （一~六年级上/下册十二档，data/wyWords.js）；pack-bar/胶囊动态改名同步支持 wy 档
//   · 弹窗列表改三级筛选：版本（外研/人教PEP/沪教）→ 年级（一~六）→ 册别（上/下），
//     结果区只显示命中档位——修 34+ 行长列表一屏滚不完、找目标册麻烦的问题
// v85 变化（词库信息条同步 + 首屏兜底）：
//   · pack-bar「当前词库条」三处同步：弹窗选中词库 / 点首页经典胶囊切档 / onShow 回到首页，
//     信息条实时跟随最新档位——修复「从更多词库选完，下方仍显示旧词库信息」
//   · _buildPackBar 查表防御：元信息与词池表错配时回退 null，绝不在 onLoad/onShow 抛错
//   · onLoad 整体 try-catch 兜底 + applyLayout 必执行：任何初始化异常都不再阻塞首屏渲染
// v84 变化（逻辑零新增，纯数据扩展）：「更多词库」弹窗新增「人教版 PEP · 人民教育出版社」组
//   （一~六年级上/下册十二档，data/pepWords.js）；pack-bar/胶囊动态改名同步支持 pep 档
// v76 变化（仅视觉微调，逻辑零改动）：背景果冻气泡与星心花加大加立体、
//   大冒险卡整体高度回压（插画/按钮同步收紧，横幅吸收余量）
// v75 变化：龙珠一星移到奖励球上、整体下移填满一屏、词库牌间距护芽、背景星心花气泡扩充
// v74/v73/v72 历史变化见 git log
// v7 设计 tokens（基于模块节奏 = 18rpx 的 1/3/2/3 比例）：
//   字号 5 级 / 圆角 3 级 / 间距 3 级 / 文本色 3 级

const app = getApp();
const { applyLayout } = require('../../utils/layoutUtil.js');
// D4: 模块期同步读 app.globalData.layout，避免首帧 1334rpx 硬编码闪烁
const _initLayout = (app.globalData && app.globalData.layout) || {};
const _initPageHeight = _initLayout.windowHeightRpx || 1334;
const _initSafeBottomRpx = _initLayout.safeBottomRpx || 0;
const audioManager = require('../../utils/audioManager.js');
const storageManager = require('../../utils/storageManager.js');
const { ASSET_KEYS } = require('../../utils/constants.js');
const { rewardManager } = require('../../utils/rewardManager.js');
const customWordPack = require('../../utils/customWordPack.js');
const { SH_GRADE_INFO, SHANGHAI_WORD_BANKS } = require('../../data/shanghaiWords.js');  // v82: 沪教版词库元信息
const { PEP_GRADE_INFO, PEP_WORD_BANKS } = require('../../data/pepWords.js');          // v84: 人教版PEP词库元信息
const { WY_GRADE_INFO, WY_WORD_BANKS } = require('../../data/wyWords.js');             // v86: 外研版词库元信息
// v86: 全部教材/启蒙词库元信息合表（外研在前，新表优先）—— pack-bar 与胶囊动态改名共用
const ALL_GRADE_INFO = WY_GRADE_INFO.concat(PEP_GRADE_INFO, SH_GRADE_INFO);
// v86: 词池合表 —— _buildPackBar 防御性查表（任一系列 key 均能找到对应词池）
const ALL_BANK_TABLE = Object.assign({}, SHANGHAI_WORD_BANKS, PEP_WORD_BANKS, WY_WORD_BANKS);
// v86: 弹窗三级筛选 —— 版本元表（年级上限/主色/副注），editions 按新增时间倒序展示
const DICT_EDITION_TABLE = {
  wy:  { info: WY_GRADE_INFO,       bank: WY_WORD_BANKS,       maxGrade: 6, color: '#7EE0A8', name: '外研版',  desc: '外研社 · 一年级起点' },
  pep: { info: PEP_GRADE_INFO,      bank: PEP_WORD_BANKS,      maxGrade: 6, color: '#7CC8FA', name: '人教PEP', desc: '人民教育出版社 · 三年级起点' },
  sh:  { info: SH_GRADE_INFO,       bank: SHANGHAI_WORD_BANKS, maxGrade: 5, color: '#C79BF2', name: '沪教版',  desc: '上海教育出版社 · 五四制' }
};
const DICT_EDITIONS = [
  { key: 'wy',  name: '外研版' },
  { key: 'pep', name: '人教PEP' },
  { key: 'sh',  name: '沪教版' }
];
const DICT_VOLS = [
  { key: 'up',   label: '上册' },
  { key: 'down', label: '下册' }
];
const GRADE_CN = ['', '一', '二', '三', '四', '五', '六'];

Page({
  data: {
    // 游戏数据
    difficulty: 'junior',
    soundEnabled: true,
    highestScore: 0,
    totalGames: 0,
    rewardPoints: 0,          // v32: 亲子积分（奖励中心入口）
    knowMoreVisible: false,   // v33: 「立即了解」玩法弹窗显隐

    // 自定义导航栏（v71：仅居中木牌匾，无左右按钮）
    statusBarHeight: 20,
    navBarHeight: 44,          // 44px 为 iOS 标准导航条

    // 自适应
    safeTop: 0,
    safeBottom: 0,
    pageHeight: _initPageHeight,
    safeBottomRpx: _initSafeBottomRpx,

    // 难度列表（v50: 中学拆初中/高中、大学退役、新增 KET/PET 考试档，共 6 项）
    // v82: 第 6 枚改「更多词库」——点击弹词库选择列表，不再直接上传文件
    // v83: 弹窗列表移除「经典词库」组，仅保留沪教版（1-5 年级上/下册）+ 我的词库；经典五档仍可经本排胶囊直选
    // v84: 弹窗新增人教版 PEP 组（一~六年级上/下册十二档）
    difficulties: [
      { key: 'primary', name: '小学' },
      { key: 'junior',  name: '初中' },
      { key: 'senior',  name: '高中' },
      { key: 'ket',     name: 'KET' },
      { key: 'pet',     name: 'PET' },
      { key: 'more',    name: '更多词库' }
    ],

    // v82: 词库选择弹窗（果冻风果冻卡片列表）— v83: 移除经典词库组，仅沪教版上/下册 + 我的词库
    //   v84: 新增人教版 PEP 组（pep1~pep6 / pep1b~pep6b 十二档）
    //   v86: 改三级筛选 —— dictEditions 版本 chips / dictGrades 年级 chips / dictVols 册别 chips /
    //     dictFilter 当前筛选 { ed, grade, vol } / dictResult 命中结果行（0~1 行）/ dictCustom 我的词库组
    dictSheetVisible: false,
    dictEditions: DICT_EDITIONS,
    dictGrades: [],
    dictVols: DICT_VOLS,
    dictFilter: { ed: 'wy', grade: 1, vol: 'up' },
    dictResult: [],
    dictCustom: [],
    moreActive: false,        // v82: 第 6 枚胶囊（更多词库）选中态
    // v82: 当前词库信息条（替换 v35 customPackInfo —— shX/pepX/custom 均展示；点击：custom→管理、其余→开弹窗）
    packBar: null,

    // 玩法徽章（v68 渲染于 Hero 大卡 banner-chips 2×2，文案/图标对齐参考图）
    // 底色：浅彩纸签调（配合 v68 白描边胶囊）
    howtoList: [
      { id: 'a1', icon: '✅', title: '答对消除', bg: '#E3F6C8' },
      { id: 'a2', icon: '⚡',  title: '连击加速', bg: '#FFEDB8' },
      { id: 'a3', icon: '🔥',  title: '连击翻倍', bg: '#FFE0CC' },
      { id: 'a4', icon: '🛡️', title: '防线守卫', bg: '#DCF1FB' }
    ],

    // v33: 「立即了解」玩法弹窗内容（6 条规则 · 左对齐卡片式 · 徽章六色循环）
    // v63: 规则纸条底色同步「木语农场」纸色系
    knowMoreList: [
      { id: 'k1', icon: '✅', title: '答对发射豌豆', desc: '答对单词，植物立即开火，阳光分数双收',
        bg: '#E3F6C8', numBg: 'linear-gradient(180deg, #9CCC65, #558B2F)', numColor: '#FFFFFF' },
      { id: 'k2', icon: '⚡', title: '连续答错才加速', desc: '连续答错两题僵尸才狂奔，偶尔答错别紧张',
        bg: '#FFEDB8', numBg: 'linear-gradient(180deg, #FFC940, #EF8F00)', numColor: '#FFFFFF' },
      { id: 'k3', icon: '🔥', title: '连击分数翻倍', desc: '连续答对触发连击，分数越滚越高',
        bg: '#FFE0CC', numBg: 'linear-gradient(180deg, #FF8A65, #D84315)', numColor: '#FFFFFF' },
      { id: 'k4', icon: '🌻', title: '收集掉落阳光', desc: '向日葵定期掉阳光，点一点就能收集',
        bg: '#FFF3B8', numBg: 'linear-gradient(180deg, #FBC02D, #E65100)', numColor: '#FFFFFF' },
      { id: 'k5', icon: '🛡️', title: '守住三条防线', desc: '三条防线全部失守，本关就失败啦',
        bg: '#DCF1FB', numBg: 'linear-gradient(180deg, #81CCE8, #2E88B5)', numColor: '#FFFFFF' },
      { id: 'k6', icon: '🏆', title: '清场即通关', desc: '撑到最后一波，清光僵尸赢下胜利',
        bg: '#F2E0F8', numBg: 'linear-gradient(180deg, #CE93D8, #8E24AA)', numColor: '#FFFFFF' }
    ]
  },

  onLoad() {
    // v85: 初始化整体 try-catch 兜底——存档异常、词库表错配等极端情况降级为默认值，
    //   绝不让首屏停在空数据（applyLayout 移出 try，保证 pageHeight 必被设置）
    try {
      const g = app.globalData;
      // 状态栏高度（自定义导航栏必备；v71 无左右按钮，无需胶囊矩形）
      let statusBar = 20;
      let navBarInner = 44;
      try {
        const sys = wx.getSystemInfoSync();
        statusBar = sys.statusBarHeight || 20;
        const m = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
        if (m) {
          // 导航条高度 = 胶囊顶到状态栏的距离 * 2 + 胶囊高度（保持与胶囊垂直对齐的节奏）
          const topGap = m.top - statusBar;
          navBarInner = topGap * 2 + m.height;
        }
      } catch (e) { /* ignore */ }

      this.setData({
        difficulty: g.difficulty,
        soundEnabled: g.soundEnabled,
        highestScore: g.highestScore,
        totalGames: g.totalGames,
        rewardPoints: rewardManager.getWallet().points,
        packBar: this._buildPackBar(g.difficulty, g.customPack),
        dictCustom: this._buildCustomGroups(g.customPack),
        safeTop: g.safeAreaInset.top,
        safeBottom: g.safeAreaInset.bottom,
        statusBarHeight: statusBar,
        navBarHeight: navBarInner
      });
      this._syncMorePill();
    } catch (e) {
      console.error('[Index] onLoad 初始化降级:', e);
    }
    applyLayout(this);
  },

  onShow() {
    // v85: 回到首页同步全局词库档——从游戏页返回/后台切回时，difficulty、pack-bar 与第 6 枚
    //   胶囊名跟随最新档位，不再残留上一次会话的词库信息
    const diff = app.globalData.difficulty;
    this.setData({
      highestScore: app.globalData.highestScore,
      totalGames: app.globalData.totalGames,
      rewardPoints: rewardManager.getWallet().points,
      difficulty: diff,
      packBar: this._buildPackBar(diff, app.globalData.customPack)
    });
    this._syncMorePill();
  },

  /**
   * v32: 打开亲子奖励中心（首页第 4 张统计卡入口）
   */
  onOpenRewards() {
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    wx.navigateTo({
      url: '/pages/rewards/rewards',
      fail: (err) => {
        console.error('[Index] 跳转奖励中心失败:', err);
        wx.showToast({ title: '页面加载失败', icon: 'none' });
      }
    });
  },

  onAdaptiveResize() {
    applyLayout(this);
  },

  /* ============ 事件 ============ */

  onSelectDifficulty(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;

    // v82: 「更多词库」档 — 打开词库选择弹窗（不直接选中）
    if (key === 'more') {
      this.openDictSheet();
      return;
    }

    // v35: 从 custom/shX 切走：提示词库仍保留、可随时切回
    if (this.data.difficulty === 'custom' && key !== 'custom') {
      wx.showToast({ title: '词库已保留，随时切回', icon: 'none', duration: 1200 });
    }

    this.setData({ difficulty: key, packBar: this._buildPackBar(key, app.globalData.customPack) });
    app.globalData.difficulty = key;
    storageManager.saveUserData({
      highestScore: app.globalData.highestScore,
      totalGames: app.globalData.totalGames,
      difficulty: key,
      soundEnabled: app.globalData.soundEnabled
    });
    this._syncMorePill();
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  },

  /* ============ v82: 词库选择弹窗（更多词库） ============ */

  /** 打开弹窗：从当前档位反推三级筛选初值，重建筛选条与结果区（含最新导入词包状态） */
  openDictSheet() {
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    const parsed = this._parsePackKey(this.data.difficulty);
    let filter = parsed || { ed: 'wy', grade: 1, vol: 'up' };   // 无教材档在选时默认外研一上
    const ed = DICT_EDITION_TABLE[filter.ed];
    if (!ed) filter = { ed: 'wy', grade: 1, vol: 'up' };        // 防御：未知版本回默认
    else if (filter.grade > ed.maxGrade) filter.grade = 1;      // 沪教无六年级：越界回一年级
    this.setData({
      dictSheetVisible: true,
      dictFilter: filter,
      dictGrades: this._buildGradeChips(filter.ed),
      dictResult: this._buildDictResult(filter),
      dictCustom: this._buildCustomGroups(app.globalData.customPack)
    });
  },

  closeDictSheet() {
    this.setData({ dictSheetVisible: false });
  },

  noop() { /* 阻止冒泡占位 */ },

  /**
   * 弹窗内选中词库：内置档/沪教档/PEP 档直接生效；我的词库→选中 custom；
   * 底部「从聊天文件导入」走原文件导入流程（能力保留）
   */
  onSelectDict(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    this.setData({ dictSheetVisible: false });
    if (key === this.data.difficulty) return;   // 重复选中直接收起
    // v85: pack-bar 同步跟随最新档位（修复「弹窗选完词库，下方信息条仍是旧档」）
    this.setData({ difficulty: key, packBar: this._buildPackBar(key, app.globalData.customPack) });
    app.globalData.difficulty = key;
    storageManager.saveUserData({
      highestScore: app.globalData.highestScore,
      totalGames: app.globalData.totalGames,
      difficulty: key,
      soundEnabled: app.globalData.soundEnabled
    });
    this._syncMorePill();
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  },

  /** 弹窗底部入口：从聊天文件导入自定义词库（v35 能力保留） */
  onImportFromFile() {
    this.setData({ dictSheetVisible: false });
    this._importWordPack();
  },

  /** pack-bar 点击：custom 档→管理面板；shX/pepX→打开选择弹窗 */
  onPackBarTap() {
    if (this.data.difficulty === 'custom') {
      this._manageWordPack();
    } else {
      this.openDictSheet();
    }
  },

  /**
   * v86: 从档位 key 反推三级筛选初值（wy3b → { ed:'wy', grade:3, vol:'down' }）
   *   非教材档（经典/custom/未知）返回 null —— openDictSheet 里再落默认值
   * @param {string} key
   * @returns {Object|null} { ed, grade, vol }
   */
  _parsePackKey(key) {
    const m = /^(wy|pep|sh)([1-6])b?$/.exec(key || '');
    if (!m) return null;
    return { ed: m[1], grade: parseInt(m[2], 10), vol: key.charAt(key.length - 1) === 'b' ? 'down' : 'up' };
  },

  /** v86: 生成当前版本的年级 chips（沪教 1-5 / 外研·PEP 1-6） */
  _buildGradeChips(ed) {
    const t = DICT_EDITION_TABLE[ed];
    const max = t ? t.maxGrade : 6;
    const chips = [];
    for (let i = 1; i <= max; i++) chips.push({ g: i, label: GRADE_CN[i] + '年级' });
    return chips;
  },

  /**
   * v86: 按三级筛选构建命中结果行（版本 + 年级 + 册别 → 恰 0~1 档）
   *   词池缺失（数据表错配）时返回空数组，结果区显示占位提示
   * @param {Object} filter - { ed, grade, vol }
   */
  _buildDictResult(filter) {
    if (!filter) return [];
    const ed = DICT_EDITION_TABLE[filter.ed];
    if (!ed) return [];
    const key = filter.ed + filter.grade + (filter.vol === 'down' ? 'b' : '');
    const g = ed.info.find(x => x.key === key);
    const bank = ed.bank[key];
    if (!g || !bank) return [];
    // 副注沿用各档元信息说明（沪教「牛津上海本地版·五四制」/ PEP「启蒙衔接词池·教材」/ 外研「一年级起点」）
    return [{ key: key, name: g.name, desc: g.desc + ' · ' + bank.length + ' 词', color: ed.color }];
  },

  /** v86: 我的词库组（无导入词包时为空数组，结果区不渲染） */
  _buildCustomGroups(pack) {
    if (pack && pack.words && pack.words.length) {
      return [{ title: '我的词库', items: [{ key: 'custom', name: pack.name || '导入词库', desc: '自定义导入 · ' + pack.count + ' 词', color: '#FFD34D' }] }];
    }
    return [];
  },

  /** v86: 筛选条事件 — 切版本（年级越界回一年级，册别保留） */
  onDictEd(e) {
    const ed = e.currentTarget.dataset.ed;
    if (!DICT_EDITION_TABLE[ed]) return;
    const filter = { ed: ed, grade: this.data.dictFilter.grade, vol: this.data.dictFilter.vol };
    if (filter.grade > DICT_EDITION_TABLE[ed].maxGrade) filter.grade = 1;
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({
      dictFilter: filter,
      dictGrades: this._buildGradeChips(ed),
      dictResult: this._buildDictResult(filter)
    });
  },

  /** v86: 筛选条事件 — 切年级 */
  onDictGrade(e) {
    const grade = parseInt(e.currentTarget.dataset.g, 10);
    if (!grade) return;
    const filter = { ed: this.data.dictFilter.ed, grade: grade, vol: this.data.dictFilter.vol };
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({ dictFilter: filter, dictResult: this._buildDictResult(filter) });
  },

  /** v86: 筛选条事件 — 切册别（上/下） */
  onDictVol(e) {
    const vol = e.currentTarget.dataset.vol;
    if (vol !== 'up' && vol !== 'down') return;
    const filter = { ed: this.data.dictFilter.ed, grade: this.data.dictFilter.grade, vol: vol };
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({ dictFilter: filter, dictResult: this._buildDictResult(filter) });
  },

  /**
   * v82: 构建 pack-bar 当前词库信息（shX/pepX/custom 显示；内置经典档不显示）
   * v84: 查表改为 ALL_GRADE_INFO（PEP + 沪教）
   * @param {string} difficulty
   * @param {Object|null} pack
   */
  _buildPackBar(difficulty, pack) {
    if (difficulty === 'custom') {
      if (pack && pack.words && pack.words.length) {
        return { name: pack.name || '导入词库', count: pack.count, isCustom: true };
      }
      return null;
    }
    const g = ALL_GRADE_INFO.find(x => x.key === difficulty);
    if (g) {
      // v85 防御：元信息与词池表错配（旧存档 key 在新词池表缺失等极端情况）时回退 null，
      //   绝不在 onLoad/onShow 抛错阻塞首屏渲染
      const bank = ALL_BANK_TABLE[g.key];
      if (!bank) return null;
      return { name: g.name, count: bank.length, isCustom: false };
    }
    return null;
  },

  /**
   * v82: 同步第 6 枚胶囊（更多词库）名称与选中态 — v83: 支持下册（沪教一下~沪教五下）——
   *   选 shX/shXb → 「沪教X上/下」+ active；v84: 选 pepX/pepXb → 「PEP X上/下」+ active；
   *   v86: 选 wyX/wyXb → 「外研X上/下」+ active（ALL_GRADE_INFO 已合外研表）；
   *   选 custom → 「我的词库」+ active；其余 → 「更多词库」
   */
  _syncMorePill() {
    const diff = this.data.difficulty;
    const g = ALL_GRADE_INFO.find(x => x.key === diff);
    const name = g ? g.short : (diff === 'custom' ? '我的词库' : '更多词库');
    this.setData({
      'difficulties[5].name': name,
      moreActive: !!g || diff === 'custom'
    });
  },

  /* ============ v35: 自定义词库 ============ */

  /**
   * 发起词库导入：微信聊天文件选择 → 解析 → 持久化 → 选中 custom 档
   */
  _importWordPack() {
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    wx.showLoading({ title: '读取文件…', mask: true });
    customWordPack.importFromFile().then((res) => {
      wx.hideLoading();
      if (res.ok) {
        // 同步全局与页面（v82: pack-bar + 胶囊名同步）
        app.globalData.customPack = customWordPack.loadPack();
        this.setData({
          difficulty: 'custom',
          packBar: this._buildPackBar('custom', app.globalData.customPack)
        });
        this._syncMorePill();
        app.globalData.difficulty = 'custom';
        storageManager.saveUserData({
          highestScore: app.globalData.highestScore,
          totalGames: app.globalData.totalGames,
          difficulty: 'custom',
          soundEnabled: app.globalData.soundEnabled
        });
        wx.showToast({ title: '导入成功！' + res.count + ' 个单词', icon: 'success', duration: 1600 });
      } else if (res.cancelled) {
        // 用户取消选择，静默返回
      } else {
        wx.showModal({
          title: '导入失败',
          content: res.error || '请检查文件格式',
          showCancel: false,
          confirmText: '知道了',
          confirmColor: '#5AA454'
        });
      }
    });
  },

  /**
   * 已选中 custom 档再点击：管理面板（换词库 / 清除）
   */
  _manageWordPack() {
    const pack = app.globalData.customPack || {};
    wx.showActionSheet({
      alertText: '当前词库：' + (pack.name || '自定义词库') + '（' + (pack.count || 0) + ' 词）',
      itemList: ['换一个词库文件', '清除词库'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this._importWordPack();
        } else if (res.tapIndex === 1) {
          customWordPack.clearPack();
          app.globalData.customPack = null;
          this.setData({ packBar: null });
          this._syncMorePill();
          wx.showToast({ title: '词库已清除', icon: 'none', duration: 1200 });
        }
      },
      fail: () => { /* 取消 */ }
    });
  },

  onToggleSound() {
    const next = !this.data.soundEnabled;
    this.setData({ soundEnabled: next });
    app.globalData.soundEnabled = next;
    audioManager.setEnabled(next);
    storageManager.saveUserData({
      highestScore: app.globalData.highestScore,
      totalGames: app.globalData.totalGames,
      difficulty: app.globalData.difficulty,
      soundEnabled: next
    });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  },

  /* v33: 「立即了解」→ 打开左对齐卡片式玩法弹窗（替代原生 showModal） */
  onKnowMore() {
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({ knowMoreVisible: true });
  },

  /* v33: 关闭弹窗（点遮罩 / 右上角 ✕） */
  onKnowMoreClose() {
    this.setData({ knowMoreVisible: false });
  },

  /* v33: CTA「我知道啦」— 关闭 + 轻震反馈 */
  onKnowMoreConfirm() {
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({ knowMoreVisible: false });
  },

  /* v33: 弹窗内「去瞧瞧」→ 关闭弹窗并跳转奖励中心（联动 v32） */
  onKnowMoreGoRewards() {
    this.setData({ knowMoreVisible: false });
    this.onOpenRewards();
  },

  /* v33: 事件阻断空函数（弹窗卡片 catchtap / 遮罩 catchtouchmove 用） */
  noop() {},

  onStart() {
    audioManager.play(ASSET_KEYS.AUDIO.START);
    wx.navigateTo({
      url: '/pages/game/game?difficulty=' + this.data.difficulty,
      fail: (err) => {
        console.error('[Index] 跳转游戏页失败:', err);
        wx.showToast({ title: '页面加载失败', icon: 'none' });
      }
    });
  },

  onBannerStart() {
    this.onStart();
  },

  onShareAppMessage() {
    return {
      title: '单词农场 - 边玩边背单词，保卫你的小庄园！',
      path: '/pages/index/index',
      imageUrl: ''
    };
  }
});
