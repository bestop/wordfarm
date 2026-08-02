// One-shot: add phonetic field to Word interface + every WORD_BANK entry.
const fs = require('fs');
const path = require('path');
const DATA = path.resolve(__dirname, '..', 'src', 'game', 'data.ts');

let raw = fs.readFileSync(DATA, 'utf8');

// 1. Ensure Word interface has optional phonetic
if (!/phonetic\??\s*:\s*string/.test(raw)) {
  raw = raw.replace(
    /(export interface Word \{[\s\S]*?difficulty: 1 \| 2 \| 3;)/,
    '$1\n  phonetic?: string;'
  );
}

// ---- Heuristic IPA generator (same logic as gen_phonetics.js, but inline) ----
const SUFFIX = [
  [/tion$/, 'ʃən'], [/sion$/, 'ʒən'], [/ssion$/, 'ʃən'],
  [/cial$/, 'ʃəl'], [/tial$/, 'ʃəl'],
  [/gious$/, 'dʒəs'], [/cious$/, 'ʃəs'], [/tious$/, 'ʃəs'], [/eous$/, 'iəs'],
  [/ence$/, 'əns'], [/ance$/, 'əns'], [/ment$/, 'mənt'], [/ness$/, 'nəs'],
  [/able$/, 'əbəl'], [/ible$/, 'əbəl'],
  [/ful$/, 'fəl'], [/less$/, 'ləs'], [/hood$/, 'hʊd'], [/ward$/, 'wɚd'],
  [/ship$/, 'ʃɪp'], [/dom$/, 'dəm'], [/ism$/, 'ɪzəm'], [/ist$/, 'ɪst'],
  [/ity$/, 'əti'], [/ly$/, 'li'],
  [/er$/, 'ɚ'], [/or$/, 'ɚ'], [/our$/, 'ʊr'], [/ous$/, 'əs'], [/ive$/, 'ɪv'],
  [/ize$/, 'aɪz'], [/ise$/, 'aɪz'], [/ate$/, 'eɪt'], [/en$/, 'ən'],
  [/ure$/, 'jʊr'], [/age$/, 'ɪdʒ'],
  [/al$/, 'əl'], [/ant$/, 'ənt'], [/ent$/, 'ənt'],
  [/ary$/, 'eri'], [/ory$/, 'ɔri'], [/ery$/, 'əri'],
  [/ing$/, 'ɪŋ'], [/ed$/, 'd'], [/es$/, 'z'], [/s$/, 'z'],
];
const VOWELS = new Set(['a','e','i','o','u']);

// Hand-curated common word overrides (highest confidence)
const OVERRIDES = {
  one: 'wʌn', two: 'tuː', three: 'θriː', four: 'fɔːr', five: 'faɪv',
  six: 'sɪks', seven: 'sɛvən', eight: 'eɪt', nine: 'naɪn', ten: 'tɛn',
  eleven: 'ɪlɛvən', twelve: 'twɛlv', thirteen: 'θɜːrtiːn', fourteen: 'fɔːrtiːn',
  fifteen: 'fɪftiːn', sixteen: 'sɪkstiːn', seventeen: 'sɛvəntiːn', eighteen: 'eɪtiːn',
  nineteen: 'naɪntiːn', twenty: 'twɛnti', hundred: 'hʌndrəd', thousand: 'θaʊzənd',
  first: 'fɜːrst', second: 'sɛkənd', third: 'θɜːrd',
  red: 'rɛd', blue: 'bluː', green: 'ɡriːn', yellow: 'jɛloʊ',
  white: 'waɪt', black: 'blæk', pink: 'pɪŋk', orange: 'ɒrɪndʒ',
  purple: 'pɜːrpəl', brown: 'braʊn', gray: 'ɡreɪ', gold: 'ɡoʊld', silver: 'sɪlvər',
  cat: 'kæt', dog: 'dɒɡ', bird: 'bɜːrd', fish: 'fɪʃ', pig: 'pɪɡ', cow: 'kaʊ',
  hen: 'hɛn', duck: 'dʌk', horse: 'hɔːrs', sheep: 'ʃiːp', goat: 'ɡoʊt',
  mouse: 'maʊs', rabbit: 'ræbɪt', frog: 'frɒɡ', bear: 'bɛr', monkey: 'mʌŋki',
  panda: 'pændə', tiger: 'taɪɡər', lion: 'laɪən', elephant: 'ɛlɪfənt',
  fox: 'fɒks', wolf: 'wʊlf', deer: 'dɪr', bee: 'biː', ant: 'ænt',
  butterfly: 'bʌtərflaɪ', snake: 'sneɪk', turtle: 'tɜːrtəl', whale: 'weɪl',
  shark: 'ʃɑːrk', chicken: 'tʃɪkɪn', cock: 'kɒk', goose: 'ɡuːs',
  father: 'fɑːðər', mother: 'mʌðər', brother: 'brʌðər', sister: 'sɪstər',
  son: 'sʌn', daughter: 'dɔːtər', grandpa: 'ɡrænpɑː', grandma: 'ɡrænmɑː',
  uncle: 'ʌŋkəl', aunt: 'ænt', baby: 'beɪbi', family: 'fæməli',
  parent: 'pɛrənt', boy: 'bɔɪ', girl: 'ɡɜːrl', friend: 'frɛnd',
  classmate: 'klæsmeɪt', head: 'hɛd', face: 'feɪs', eye: 'aɪ',
  ear: 'ɪr', nose: 'noʊz', mouth: 'maʊθ', tooth: 'tuːθ',
  tongue: 'tʌŋ', neck: 'nɛk', hand: 'hænd', arm: 'ɑːrm',
  i: 'aɪ', you: 'juː', he: 'hiː', she: 'ʃiː', we: 'wiː',
  they: 'ðeɪ', me: 'miː', him: 'hɪm', her: 'hɜːr', us: 'ʌs',
  them: 'ðɛm', my: 'maɪ', your: 'jʊr', his: 'hɪz',
  its: 'ɪts', our: 'aʊər', their: 'ðɛr', this: 'ðɪs',
  that: 'ðæt', these: 'ðiːz', those: 'ðoʊz', what: 'wʌt',
  who: 'huː', where: 'wɛr', when: 'wɛn', why: 'waɪ', how: 'haʊ',
  which: 'wɪtʃ', have: 'hæv', has: 'hæz', had: 'hæd',
  do: 'duː', does: 'dʌz', did: 'dɪd', done: 'dʌn',
  go: 'ɡoʊ', goes: 'ɡoʊz', went: 'wɛnt', gone: 'ɡɒn',
  come: 'kʌm', comes: 'kʌmz', came: 'keɪm', see: 'siː',
  saw: 'sɔː', say: 'seɪ', said: 'sɛd', tell: 'tɛl',
  told: 'toʊld', speak: 'spiːk', spoke: 'spoʊk', talk: 'tɔːk',
  walk: 'wɔːk', run: 'rʌn', ran: 'ræn', jump: 'dʒʌmp',
  swim: 'swɪm', sing: 'sɪŋ', sang: 'sæŋ', dance: 'dæns',
  read: 'riːd', write: 'raɪt', wrote: 'roʊt', draw: 'drɔː',
  play: 'pleɪ', played: 'pleɪd', eat: 'iːt', ate: 'eɪt',
  drink: 'drɪŋk', drank: 'dræŋk', sleep: 'sliːp', slept: 'slɛpt',
  buy: 'baɪ', bought: 'bɔːt', sell: 'sɛl', sold: 'soʊld',
  learn: 'lɜːrn', teach: 'tiːtʃ', taught: 'tɔːt', know: 'noʊ',
  knew: 'njuː', make: 'meɪk', made: 'meɪd', take: 'teɪk',
  took: 'tʊk', give: 'ɡɪv', gave: 'ɡeɪv', get: 'ɡɛt',
  got: 'ɡɒt', put: 'pʊt', cut: 'kʌt', sit: 'sɪt',
  sat: 'sæt', stand: 'stænd', stood: 'stʊd', lie: 'laɪ',
  lay: 'leɪ', laid: 'leɪd', open: 'oʊpən', close: 'kloʊz',
  start: 'stɑːrt', stop: 'stɒp', begin: 'bɪɡɪn', began: 'bɪɡæn',
  begun: 'bɪɡʌn', finish: 'fɪnɪʃ', want: 'wɒnt', need: 'niːd',
  love: 'lʌv', like: 'laɪk', hate: 'heɪt', think: 'θɪŋk',
  thought: 'θɔːt', believe: 'bɪliːv', understand: 'ʌndərstænd',
  morning: 'mɔːrnɪŋ', afternoon: 'æftərnuːn', evening: 'iːvnɪŋ',
  night: 'naɪt', today: 'tədeɪ', yesterday: 'jɛstərdeɪ', tomorrow: 'təmɒroʊ',
  monday: 'mʌndeɪ', tuesday: 'tuːzdeɪ', wednesday: 'wɛnzdeɪ', thursday: 'θɜːrzdeɪ',
  friday: 'fraɪdeɪ', saturday: 'sætərdeɪ', sunday: 'sʌndeɪ',
  spring: 'sprɪŋ', summer: 'sʌmər', autumn: 'ɔːtəm', winter: 'wɪntər',
  apple: 'æpəl', banana: 'bənænə', grape: 'ɡreɪp',
  peach: 'piːtʃ', pear: 'pɛr', watermelon: 'wɔːtərmɛlən', strawberry: 'strɔːbəri',
  pineapple: 'paɪnæpəl',
  rice: 'raɪs', bread: 'brɛd', noodle: 'nuːdəl', egg: 'ɛɡ',
  milk: 'mɪlk', water: 'wɔːtər', juice: 'dʒuːs', tea: 'tiː',
  coffee: 'kɒfi', cake: 'keɪk', candy: 'kændi', sugar: 'ʃʊɡər',
  salt: 'sɔːlt', pepper: 'pɛpər',
  book: 'bʊk', pen: 'pɛn', pencil: 'pɛnsəl', bag: 'bæɡ',
  desk: 'dɛsk', chair: 'tʃɛr', table: 'teɪbəl', school: 'skuːl',
  teacher: 'tiːtʃər', student: 'stuːdənt', classroom: 'klæsruːm',
  blackboard: 'blækbɔːrd', playground: 'pleɪɡraʊnd',
  car: 'kɑːr', bus: 'bʌs', bike: 'baɪk', train: 'treɪn',
  plane: 'pleɪn', ship: 'ʃɪp', boat: 'boʊt', subway: 'sʌbweɪ',
  big: 'bɪɡ', small: 'smɔːl', long: 'lɒŋ', short: 'ʃɔːrt',
  tall: 'tɔːl', high: 'haɪ', low: 'loʊ', fast: 'fæst',
  slow: 'sloʊ', new: 'njuː', old: 'oʊld', young: 'jʌŋ',
  hot: 'hɒt', cold: 'koʊld', warm: 'wɔːrm', cool: 'kuːl',
  clean: 'kliːn', dirty: 'dɜːrti', easy: 'iːzi', hard: 'hɑːrd',
  happy: 'hæpi', sad: 'sæd', angry: 'æŋɡri', tired: 'taɪərd',
  hungry: 'hʌŋɡri', thirsty: 'θɜːrsti', right: 'raɪt', wrong: 'rɒŋ',
  true: 'truː', false: 'fɔːls', good: 'ɡʊd', bad: 'bæd',
  better: 'bɛtər', best: 'bɛst', much: 'mʌtʃ', many: 'meni',
  little: 'lɪtəl',
  doctor: 'dɒktər', nurse: 'nɜːrs', farmer: 'fɑːrmər', worker: 'wɜːrkər',
  driver: 'draɪvər', cook: 'kʊk', police: 'pəliːs', soldier: 'soʊldʒər',
  chinese: 'tʃaɪniːz', english: 'ɪŋɡlɪʃ', math: 'mæθ',
  music: 'mjuːzɪk', art: 'ɑːrt', science: 'saɪəns', history: 'hɪstəri',
  tennis: 'tenɪs', football: 'fʊtbɔːl', basketball: 'bæskɪtbɔːl',
  soccer: 'sɒkər', baseball: 'beɪsbɔːl', volleyball: 'vɒlibɔːl',
  china: 'tʃaɪnə', america: 'əmerɪkə', england: 'ɪŋɡlənd',
  japan: 'dʒəpæn', france: 'fræns', germany: 'dʒɜːrməni',
  tokyo: 'toʊkioʊ', london: 'lʌndən', paris: 'pærɪs',
  hospital: 'hɒspɪtəl', library: 'laɪbreri', museum: 'mjʊziːəm',
  park: 'pɑːrk', zoo: 'zuː',
  skating: 'skeɪtɪŋ', skiing: 'skiːɪŋ', swimming: 'swɪmɪŋ',
  running: 'rʌnɪŋ', cycling: 'saɪklɪŋ', cooking: 'kʊkɪŋ',
  reading: 'ridɪŋ', writing: 'raɪtɪŋ', singing: 'sɪŋɪŋ',
  dancing: 'dænsɪŋ', drawing: 'drɔːɪŋ', craft: 'kræft',
};

function vowelLongShort(letter, isLong) {
  switch (letter) {
    case 'a': return isLong ? 'eɪ' : 'æ';
    case 'e': return isLong ? 'iː' : 'ɛ';
    case 'i': return isLong ? 'aɪ' : 'ɪ';
    case 'o': return isLong ? 'oʊ' : 'ɒ';
    case 'u': return isLong ? 'juː' : 'ʌ';
  }
  return letter;
}

function guessRoot(root) {
  if (!root) return '';
  const out = [];
  for (let i = 0; i < root.length; i++) {
    const c = root[i];
    if (VOWELS.has(c)) {
      let cluster = c;
      let j = i + 1;
      while (j < root.length && VOWELS.has(root[j]) && j < i + 3) { cluster += root[j]; j++; }
      const nextCons = root[j];
      const afterNext = root[j + 1];
      const isLong =
        (nextCons && afterNext === 'e' && j === root.length - 2) ||
        (nextCons && afterNext && !VOWELS.has(nextCons) && VOWELS.has(afterNext));
      switch (cluster) {
        case 'ai': case 'ay': out.push('eɪ'); break;
        case 'au': case 'aw': out.push('ɔː'); break;
        case 'ea': out.push(nextCons === 'd' || nextCons === undefined ? 'iː' : 'ɛ'); break;
        case 'ee': out.push('iː'); break;
        case 'ei': case 'ey': out.push('eɪ'); break;
        case 'ie': out.push('aɪ'); break;
        case 'oa': out.push('oʊ'); break;
        case 'oo': out.push('uː'); break;
        case 'ou': case 'ow': out.push('aʊ'); break;
        case 'oi': case 'oy': out.push('ɔɪ'); break;
        case 'ue': case 'ui': out.push('uː'); break;
        default:
          if (cluster.length === 1) out.push(vowelLongShort(cluster, isLong));
          else out.push(cluster);
      }
      i = j - 1;
    } else {
      switch (c) {
        case 'c': {
          const n = root[i + 1];
          out.push(n && 'eiy'.includes(n) ? 's' : 'k');
          break;
        }
        case 'g': {
          const n = root[i + 1];
          out.push(n && 'eiy'.includes(n) ? 'dʒ' : 'ɡ');
          break;
        }
        case 'q': out.push('kw'); break;
        case 'x': out.push('ks'); break;
        case 'y': {
          const p = root[i - 1];
          if (i === 0) out.push('j');
          else if (!VOWELS.has(p)) out.push('i');
          break;
        }
        default: out.push(c);
      }
    }
  }
  let s = out.join('');
  s = s.replace(/th/g, 'θ');
  s = s.replace(/sh/g, 'ʃ');
  s = s.replace(/ch/g, 'tʃ');
  s = s.replace(/dʒʒ/g, 'dʒ');
  s = s.replace(/kk/g, 'k').replace(/tt/g, 't').replace(/dd/g, 'd').replace(/pp/g, 'p').replace(/bb/g, 'b');
  s = s.replace(/ll/g, 'l').replace(/mm/g, 'm').replace(/nn/g, 'n').replace(/ss/g, 's');
  s = s.replace(/gg/g, 'ɡ').replace(/rr/g, 'r').replace(/ff/g, 'f');
  return s;
}

function getPhonetic(w) {
  w = w.toLowerCase();
  if (OVERRIDES[w]) return OVERRIDES[w];
  for (const [pat, ipa] of SUFFIX) {
    if (pat.test(w)) {
      return guessRoot(w.replace(pat, '')) + ipa;
    }
  }
  return guessRoot(w);
}

// 2. Apply to WORD_BANK entries
const RE = /\{\s*en:\s*'([^']+)',\s*zh:\s*'([^']+)',\s*difficulty:\s*([123])\s*\}/g;
let count = 0;
const newRaw = raw.replace(RE, (m, en, zh, d) => {
  count++;
  const ph = getPhonetic(en);
  return `{ en: '${en}', zh: '${zh}', phonetic: '/${ph}/', difficulty: ${d} }`;
});

fs.writeFileSync(DATA, newRaw, 'utf8');
console.log('Patched entries:', count);
console.log('Sample phonetics:');
const sample = new Set();
let mm;
const RE2 = /phonetic: '\/([^']+)\/', difficulty: [123]/g;
while ((mm = RE2.exec(newRaw)) !== null && sample.size < 15) sample.add(mm[1]);
[...sample].forEach(p => console.log('  /' + p + '/'));
