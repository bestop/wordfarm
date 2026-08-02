// 临时脚本：将 src/game/data.ts 题库转换为小程序 words.js
const fs = require('fs');
const txt = fs.readFileSync('c:/Users/shenhq/Documents/GitHub/wordfarm/src/game/data.ts', 'utf8');
const re = /\{\s*en:\s*'([^']+)',\s*zh:\s*'([^']+)',\s*phonetic:\s*'([^']+)',\s*difficulty:\s*(\d)\s*\}/g;
const arr = [];
let m;
while ((m = re.exec(txt)) !== null) {
  arr.push({ en: m[1], zh: m[2], phonetic: m[3], difficulty: parseInt(m[4]) });
}

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

let out = '// data/words.js - 单词题库\n';
out += '// 来源: 小学英语词汇库 (1274词)，含音标与难度分级\n';
out += '// 难度: 1=基础 2=进阶 3=高阶\n\n';
out += 'const WORD_BANK = [\n';
arr.forEach((w, i) => {
  out += "  { en: '" + esc(w.en) + "', zh: '" + esc(w.zh) + "', phonetic: '" + esc(w.phonetic) + "', difficulty: " + w.difficulty + ' }';
  out += (i < arr.length - 1) ? ',\n' : '\n';
});
out += '];\n\n';
out += 'module.exports = { WORD_BANK };\n';

fs.writeFileSync('c:/Users/shenhq/Documents/GitHub/wordfarm/miniprogram/data/words.js', out);
console.log('Wrote words.js with', arr.length, 'words');
console.log('File size:', fs.statSync('c:/Users/shenhq/Documents/GitHub/wordfarm/miniprogram/data/words.js').size, 'bytes');
