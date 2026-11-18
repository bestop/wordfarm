// gen-web-words.mjs - 把小程序词库转换为网页端 TS 模块（v88 起全词库同源同步）
//
// 用法: node scripts/gen-web-words.mjs（或 bun scripts/gen-web-words.mjs）
// 来源: miniprogram/data/{words,examWords,shanghaiWords,pepWords,wyWords}.js
// 输出: src/game/words.ts（自动生成，勿手改 —— 改动词库请编辑小程序端 data/*.js 后重跑本脚本）
//
// 同步范围:
//   · 基础库 WORD_BANK + 剑桥考试库 KET/PET（v50 机制不变）
//   · 教材词库 34 档（小程序 v82~v87）: 沪教 sh1~sh5b(10) + 人教PEP pep1~pep6b(12) + 外研 wy1~wy6b(12)
//   · TEXTBOOK_EDITIONS 三级筛选元数据（版本→年级→上下册，与小程序端 DICT_EDITION_TABLE 对齐）
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'miniprogram/data');
const OUT = resolve(ROOT, 'src/game/words.ts');

const { WORD_BANK } = require(`${SRC}/words.js`);
const { KET_WORDS, PET_WORDS } = require(`${SRC}/examWords.js`);
const { SHANGHAI_WORD_BANKS, SH_GRADE_INFO } = require(`${SRC}/shanghaiWords.js`);
const { PEP_WORD_BANKS, PEP_GRADE_INFO } = require(`${SRC}/pepWords.js`);
const { WY_WORD_BANKS, WY_GRADE_INFO } = require(`${SRC}/wyWords.js`);

// 教材版本元表 —— 顺序即弹窗展示顺序（与小程序端 index.js DICT_EDITION_TABLE 一致）
const EDITIONS = [
  { key: 'wy', name: '外研版', desc: '外研社一年级起点系列教材', color: '#7EE0A8', info: WY_GRADE_INFO, bank: WY_WORD_BANKS },
  { key: 'pep', name: '人教PEP', desc: '人民教育出版社·三年级起点', color: '#7CC8FA', info: PEP_GRADE_INFO, bank: PEP_WORD_BANKS },
  { key: 'sh', name: '沪教版', desc: '上海教育出版社·五四制', color: '#C79BF2', info: SH_GRADE_INFO, bank: SHANGHAI_WORD_BANKS },
];

// 档位 key 解析: sh1b → { ed:'sh', grade:1, vol:'down' }
function parseBankKey(key) {
  const m = /^(wy|pep|sh)(\d)(b?)$/.exec(key);
  if (!m) return null;
  return { ed: m[1], grade: parseInt(m[2], 10), vol: m[3] ? 'down' : 'up' };
}

// ---- 校验: 池非空 / 字段齐全 / 难度合法 / 池内 en 不重复 ----
function validatePool(key, pool) {
  if (!Array.isArray(pool) || pool.length === 0) throw new Error(`词池 ${key} 为空`);
  const seen = new Set();
  for (const w of pool) {
    if (!w.en || !w.zh) throw new Error(`词池 ${key} 存在缺 en/zh 的词条`);
    if (w.phonetic === undefined || w.phonetic === null) throw new Error(`词池 ${key} 词条 ${w.en} 缺 phonetic 字段（应为 ''）`);
    if (![1, 2].includes(w.difficulty)) throw new Error(`词池 ${key} 词条 ${w.en} 难度非法: ${w.difficulty}`);
    const k = w.en.toLowerCase();
    if (seen.has(k)) throw new Error(`词池 ${key} 内重复单词: ${w.en}`);
    seen.add(k);
  }
}

const fmt = (w) =>
  `    { en: ${JSON.stringify(w.en)}, zh: ${JSON.stringify(w.zh)}, phonetic: ${JSON.stringify(w.phonetic || '')}, difficulty: ${w.difficulty} }`;

// 基础库 / 考试库条目缩进为 2 空格（沿用 v50 格式），教材池为 4 空格
const basicBlock = WORD_BANK.map((w) =>
  `  { en: ${JSON.stringify(w.en)}, zh: ${JSON.stringify(w.zh)}, phonetic: ${JSON.stringify(w.phonetic || '')}, difficulty: ${w.difficulty} }`
).join(',\n');
const examBlock = KET_WORDS.map((w) =>
  `  { en: ${JSON.stringify(w.en)}, zh: ${JSON.stringify(w.zh)}, phonetic: ${JSON.stringify(w.phonetic || '')}, difficulty: ${w.difficulty} }`
).join(',\n');
const petBlock = PET_WORDS.map((w) =>
  `  { en: ${JSON.stringify(w.en)}, zh: ${JSON.stringify(w.zh)}, phonetic: ${JSON.stringify(w.phonetic || '')}, difficulty: ${w.difficulty} }`
).join(',\n');

// ---- 教材 34 档 ----
const allMeta = [];   // { key, name, short, desc, edition, grade, vol }
const poolBlocks = []; // Record 条目文本
const bankCount = {};
for (const ed of EDITIONS) {
  for (const info of ed.info) {
    const parsed = parseBankKey(info.key);
    if (!parsed) throw new Error(`无法解析档位 key: ${info.key}`);
    if (parsed.ed !== ed.key) throw new Error(`档位 ${info.key} 归属版本不符`);
    const pool = ed.bank[info.key];
    validatePool(info.key, pool);
    allMeta.push({
      key: info.key, name: info.name, short: info.short, desc: info.desc,
      edition: ed.key, grade: parsed.grade, vol: parsed.vol,
    });
    bankCount[ed.key] = (bankCount[ed.key] || 0) + 1;
    poolBlocks.push(
      `  ${info.key}: [\n${pool.map((w) => fmt(w)).join(',\n')}\n  ]`
    );
  }
}
const textbookKeys = allMeta.map((m) => m.key);
const tbWordTotal = allMeta.reduce((s, m) => {
  const ed = EDITIONS.find((e) => e.key === m.edition);
  return s + ed.bank[m.key].length;
}, 0);

// 三级筛选: editions → grades(1..maxGrade) → vol(up/down)
const editionBlocks = EDITIONS.map((ed) => {
  const maxGrade = Math.max(...ed.info.map((i) => parseBankKey(i.key).grade));
  const gradeEntries = [];
  for (let g = 1; g <= maxGrade; g++) {
    const up = ed.info.find((i) => { const p = parseBankKey(i.key); return p.grade === g && p.vol === 'up'; });
    const down = ed.info.find((i) => { const p = parseBankKey(i.key); return p.grade === g && p.vol === 'down'; });
    if (!up) throw new Error(`${ed.key} 缺少 ${g} 年级上册档`);
    gradeEntries.push(
      `      ${g}: { up: '${up.key}', down: '${down ? down.key : up.key}'${down ? '' : ' /* 该版本无下册档，回退上册 */'} }`
    );
  }
  return `    {\n      key: '${ed.key}', name: '${ed.name}', desc: '${ed.desc}', color: '${ed.color}', maxGrade: ${maxGrade},\n      banks: {\n${gradeEntries.join(',\n')}\n      },\n    }`;
}).join(',\n');

// 各档元信息（三级筛选结果行 / 结算页展示用）
const metaBlocks = allMeta.map((m) =>
  `    { key: '${m.key}', name: '${m.name}', short: '${m.short}', desc: '${m.desc}', edition: '${m.edition}' as TextbookEditionKey, grade: ${m.grade}, vol: '${m.vol}' as 'up' | 'down', color: '${EDITIONS.find((e) => e.key === m.edition).color}' }`
).join(',\n');

const basicTotal = WORD_BANK.length;
const examTotal = KET_WORDS.length + PET_WORDS.length;

const content = `// src/game/words.ts - 单词题库（自动生成，勿手改）
// 生成器: scripts/gen-web-words.mjs —— 编辑词库请改小程序端 miniprogram/data/*.js 后重跑
// 来源(v88 同步): data/words.js + examWords.js + shanghaiWords.js(v82~v87) + pepWords.js(v84) + wyWords.js(v86)
// 难度: 基础/考试库 1=小学 2=初中 3=高中 4=KET(A2) 5=PET(B1)；教材库 1=基础 2=进阶
// 出题机制与小程序端一致: 无音标词 word2pho 自动降级 en2zh；干扰项跨词条过滤（quizEngine）

export interface Word {
  en: string
  zh: string
  phonetic: string
  difficulty: number
}

export const WORD_BANK: Word[] = [
${basicBlock}
]

export const EXAM_WORD_BANK: Word[] = [
${examBlock},
${petBlock}
]

// KET/PET 难度档使用的完整词池 = 基础库 + 考试专属词（干扰项跨池，与小程序一致）
export const FULL_WORD_BANK: Word[] = [...WORD_BANK, ...EXAM_WORD_BANK]

// ============ 教材词库（v88 同步小程序 v82~v87: 沪教 10 档 + 人教PEP 12 档 + 外研 12 档） ============
// 独立词池模式（与 custom 档同机制: 整库出题，不混全量池）
export type TextbookEditionKey = 'wy' | 'pep' | 'sh'

export type TextbookKey =
${textbookKeys.map((k) => `  | '${k}'`).join('\n')}

export interface TextbookBankMeta {
  key: TextbookKey
  name: string       // 全名，如「外研版三年级上册」
  short: string      // 短名，如「外研三上」
  desc: string       // 副注
  edition: TextbookEditionKey
  grade: number
  vol: 'up' | 'down'
  color: string      // 版本主题色
}

export const TEXTBOOK_BANKS: Record<TextbookKey, Word[]> = {
${poolBlocks.join(',\n')},
}

export const TEXTBOOK_META: TextbookBankMeta[] = [
${metaBlocks},
]

export interface TextbookEdition {
  key: TextbookEditionKey
  name: string       // 版本名，如「外研版」
  desc: string       // 版本副注
  color: string
  maxGrade: number   // 版本年级上限（沪教 5 / PEP·外研 6）
  banks: Record<number, { up: TextbookKey; down: TextbookKey }>  // 年级 → 上/下册档位 key
}

// 三级筛选元数据（版本 → 年级 → 上下册），与小程序端「更多词库」弹窗同构
export const TEXTBOOK_EDITIONS: TextbookEdition[] = [
${editionBlocks},
]

/** 由档位 key 反查元信息（防御式: 未知 key 返回 null） */
export function findTextbookMeta(key: string): TextbookBankMeta | null {
  return TEXTBOOK_META.find((m) => m.key === key) || null
}

export const WORD_BANK_STATS = {
  basic: WORD_BANK.length,
  exam: EXAM_WORD_BANK.length,
  textbook: ${tbWordTotal},
  textbookBanks: ${allMeta.length},
  total: WORD_BANK.length + EXAM_WORD_BANK.length + ${tbWordTotal},
}
`;

writeFileSync(OUT, content);

const dist = Object.entries(bankCount).map(([k, n]) => `${k}:${n}`).join(' + ');
const poolStat = allMeta
  .map((m) => {
    const ed = EDITIONS.find((e) => e.key === m.edition);
    const pool = ed.bank[m.key];
    const d1 = pool.filter((w) => w.difficulty === 1).length;
    return `${m.key}=${pool.length}(${Math.round((d1 / pool.length) * 100)}%基础)`;
  })
  .join(' ');
console.log(`OK words.ts: basic=${basicTotal} exam=${examTotal} textbook=${tbWordTotal}(${allMeta.length}档: ${dist}) total=${basicTotal + examTotal + tbWordTotal}`);
console.log(`各档词数: ${poolStat}`);
