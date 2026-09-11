// gen-web-words.mjs - 把小程序词库 (words.js + examWords.js) 转换为网页端 TS 模块
import { createRequire } from 'module';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const require = createRequire(import.meta.url);
const SRC = '/home/z/my-project/upload/wordfarm_extracted/wordfarm/miniprogram/data';
const OUT = '/home/z/my-project/src/game/words.ts';

const { WORD_BANK } = require(`${SRC}/words.js`);
const { KET_WORDS, PET_WORDS, EXAM_WORD_BANK } = require(`${SRC}/examWords.js`);

const fmt = (w) =>
  `  { en: ${JSON.stringify(w.en)}, zh: ${JSON.stringify(w.zh)}, phonetic: ${JSON.stringify(w.phonetic || '')}, difficulty: ${w.difficulty} }`;

const block = (title, arr) => `// ${title}（${arr.length} 词）\n` + arr.map(fmt).join(',\n');

const content = `// src/game/words.ts - 单词题库（自动生成，勿手改）
// 来源: 微信小程序端 data/words.js (v50) + data/examWords.js (剑桥考试词库 v50)
// 难度: 1=小学 2=初中 3=高中 4=KET(A2) 5=PET(B1)

export interface Word {
  en: string
  zh: string
  phonetic: string
  difficulty: number
}

export const WORD_BANK: Word[] = [
${block('基础库: 小学/初中/高中', WORD_BANK)}
]

export const EXAM_WORD_BANK: Word[] = [
${block('剑桥考试词库: KET', KET_WORDS)},
${block('剑桥考试词库: PET', PET_WORDS)}
]

// KET/PET 难度档使用的完整词池 = 基础库 + 考试专属词（干扰项跨池，与小程序一致）
export const FULL_WORD_BANK: Word[] = [...WORD_BANK, ...EXAM_WORD_BANK]

export const WORD_BANK_STATS = {
  basic: WORD_BANK.length,
  exam: EXAM_WORD_BANK.length,
  total: FULL_WORD_BANK.length,
}
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, content);
console.log(`OK words.ts: basic=${WORD_BANK.length} exam=${EXAM_WORD_BANK.length} total=${WORD_BANK.length + EXAM_WORD_BANK.length}`);
