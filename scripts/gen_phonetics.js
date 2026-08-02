// Build a heuristic phonetic (IPA-style) dictionary for all 1275 words in WORD_BANK.
// Saves result to a JSON file that will be consumed by the patcher PowerShell script.
// This runs with plain Node - no TS compilation required.

const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, '..', '..', 'src', 'game', 'data.ts');
const OUT = path.join(__dirname, 'phonetics.json');

const raw = fs.readFileSync(SOURCE, 'utf8');
const re = /{ en: '([^']+)', zh: '([^']+)', difficulty: ([123]) }/g;
const words = [];
let m;
while ((m = re.exec(raw)) !== null) words.push({ en: m[1], zh: m[2], d: m[3] });

// ---- Heuristic IPA phonetic generator ----
// Suffixes that are reliable:
const SUFFIX = [
  [/tion$/i, 'ʃən'],
  [/sion$/i, 'ʒən'],
  [/cial$/i, 'ʃəl'],
  [/tial$/i, 'ʃəl'],
  [/ssion$/i, 'ʃən'],
  [/gious$/i, 'dʒəs'],
  [/cious$/i, 'ʃəs'],
  [/tious$/i, 'ʃəs'],
  [/eous$/i, 'iəs'],
  [/ence$/i, 'əns'],
  [/ance$/i, 'əns'],
  [/ment$/i, 'mənt'],
  [/ness$/i, 'nəs'],
  [/able$/i, 'əbəl'],
  [/ible$/i, 'əbəl'],
  [/ful$/i, 'fəl'],
  [/less$/i, 'ləs'],
  [/hood$/i, 'hʊd'],
  [/ward$/i, 'wɚd'],
  [/ship$/i, 'ʃɪp'],
  [/dom$/i, 'dəm'],
  [/ism$/i, 'ɪzəm'],
  [/ist$/i, 'ɪst'],
  [/ity$/i, 'əti'],
  [/ly$/i, 'li'],
  [/er$/i, 'ɚ'],
  [/or$/i, 'ɚ'],
  [/our$/i, 'ʊr'],
  [/ous$/i, 'əs'],
  [/ive$/i, 'ɪv'],
  [/ize$/i, 'aɪz'],
  [/ise$/i, 'aɪz'],
  [/ate$/i, 'eɪt'],
  [/en$/i, 'ən'],
  [/ure$/i, 'jʊr'],
  [/age$/i, 'ɪdʒ'],
  [/al$/i, 'əl'],
  [/ant$/i, 'ənt'],
  [/ent$/i, 'ənt'],
  [/ary$/i, 'eri'],
  [/ory$/i, 'ɔri'],
  [/ery$/i, 'əri'],
  [/ing$/i, 'ɪŋ'],
  [/ed$/i, 'd'],
  [/es$/i, 'z'],
  [/s$/i, 'z'],
];

// Vowel and consonant maps
const VOWELS = new Set('aeiou'.split(''));
const VOICED_F = new Set('bdglmnrvwyz'.split('')); // for final s voiced vs unvoiced

// Diphthong/vowel quality by pattern (very rough but readable)
function vowelSound(letter, context) {
  // context: "long" if vowel-consonant-e pattern or single vowel in open syllable; we approximate with ending letter
  switch (letter) {
    case 'a': return context === 'long' ? 'eɪ' : 'æ';
    case 'e': return context === 'long' ? 'iː' : 'ɛ';
    case 'i': return context === 'long' ? 'aɪ' : 'ɪ';
    case 'o': return context === 'long' ? 'oʊ' : 'ɒ';
    case 'u': return context === 'long' ? 'juː' : 'ʌ';
  }
  return letter;
}

function guessPhonetic(w) {
  // Strip off known suffix, phonetize the root, re-append suffix IPA.
  w = w.toLowerCase();
  for (const [pat, ipa] of SUFFIX) {
    if (pat.test(w)) {
      const root = w.replace(pat, '');
      return guessRoot(root) + ipa;
    }
  }
  return guessRoot(w);
}

function guessRoot(root) {
  if (!root) return '';
  // Two/three letter short words
  if (root.length <= 3) {
    if (root === 'a') return 'ə';
    if (root === 'i') return 'aɪ';
    if (root === 'we') return 'wiː';
    if (root === 'he') return 'hiː';
    if (root === 'me') return 'miː';
    if (root === 'be') return 'biː';
    if (root === 'go') return 'ɡoʊ';
    if (root === 'no') return 'noʊ';
    if (root === 'so') return 'soʊ';
    if (root === 'do') return 'duː';
    if (root === 'to') return 'tuː';
    if (root === 'my') return 'maɪ';
    if (root === 'by') return 'baɪ';
    if (root === 'up') return 'ʌp';
    if (root === 'it') return 'ɪt';
    if (root === 'is') return 'ɪz';
    if (root === 'in') return 'ɪn';
    if (root === 'on') return 'ɒn';
    if (root === 'at') return 'æt';
    if (root === 'an') return 'æn';
    if (root === 'as') return 'æz';
    if (root === 'or') return 'ɔr';
    if (root === 'of') return 'ʌv';
    if (root === 'if') return 'ɪf';
    if (root === 'us') return 'ʌs';
    if (root === 'am') return 'æm';
  }

  // Very crude: split root into CV chunks and assign vowel long if next pattern is C+e or final in 2-syllable words
  const chars = root.split('');
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (!VOWELS.has(c)) {
      // Consonant mapping
      if (c === 'c') {
        const next = chars[i + 1];
        out += (next && 'eiy'.includes(next)) ? 's' : 'k';
      } else if (c === 'g') {
        const next = chars[i + 1];
        out += (next && 'eiy'.includes(next)) ? 'dʒ' : 'ɡ';
      } else if (c === 'q') {
        out += 'kw';
      } else if (c === 'x') {
        out += 'ks';
      } else if (c === 'y') {
        const prev = chars[i - 1];
        // y at start -> j, y at end after consonant -> short i
        if (i === 0) out += 'j';
        else if (VOWELS.has(prev)) {} // handled in vowel diphthongs
        else out += 'i';
      } else if (c === 'h') {
        const prev = chars[i - 1];
        if (prev === 'p' || prev === 's' || prev === 't' || prev === 'w') { /* digraph handled below */ }
        else out += 'h';
      } else {
        out += c;
      }
    } else {
      // Vowel cluster handling
      let cluster = c;
      let j = i + 1;
      while (j < chars.length && VOWELS.has(chars[j]) && j < i + 3) { cluster += chars[j]; j++; }
      const nextCons = chars[j];
      const afterNext = chars[j + 1];
      const isLong = (nextCons && afterNext === 'e' && j === chars.length - 2) ||
                     (nextCons && afterNext && !VOWELS.has(nextCons) && VOWELS.has(afterNext) && j < chars.length - 1);
      // Known diphthongs
      switch (cluster) {
        case 'ai': case 'ay': out += 'eɪ'; break;
        case 'au': case 'aw': out += 'ɔː'; break;
        case 'ea': out += (nextCons === 'd' || nextCons === undefined) ? 'iː' : 'ɛ'; break;
        case 'ee': out += 'iː'; break;
        case 'ei': case 'ey': out += 'eɪ'; break;
        case 'ie': out += 'aɪ'; break;
        case 'oa': out += 'oʊ'; break;
        case 'oo': out += 'uː'; break;
        case 'ou': case 'ow': out += 'aʊ'; break;
        case 'oi': case 'oy': out += 'ɔɪ'; break;
        case 'ue': out += 'uː'; break;
        case 'ui': out += 'uː'; break;
        case 'a': out += vowelSound('a', isLong ? 'long' : 'short'); break;
        case 'e': out += vowelSound('e', isLong ? 'long' : 'short'); break;
        case 'i': out += vowelSound('i', isLong ? 'long' : 'short'); break;
        case 'o': out += vowelSound('o', isLong ? 'long' : 'short'); break;
        case 'u': out += vowelSound('u', isLong ? 'long' : 'short'); break;
        default: out += cluster;
      }
      i = j - 1;
    }
  }

  // Fix common digraphs that may have been double-mapped
  out = out
    .replace(/th/g, 'θ')          // default unvoiced (will be wrong sometimes but readable)
    .replace(/sh/g, 'ʃ')
    .replace(/ch/g, 'tʃ')
    .replace(/dʒʒ/g, 'dʒ')
    .replace(/kk/g, 'k')
    .replace(/tt/g, 't')
    .replace(/dd/g, 'd')
    .replace(/pp/g, 'p')
    .replace(/bb/g, 'b')
    .replace(/ll/g, 'l')
    .replace(/mm/g, 'm')
    .replace(/nn/g, 'n')
    .replace(/ss/g, 's')
    .replace(/gg/g, 'ɡ')
    .replace(/rr/g, 'r')
    .replace(/ff/g, 'f');

  return out;
}

// Hand-curated overrides for the most common 150 words (highest confidence)
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
  apple: 'æpəl', banana: 'bənænə', orange_: 'ɒrɪndʒ', grape: 'ɡreɪp',
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
  student_: 'stuːdənt', teacher_: 'tiːtʃər', driver: 'draɪvər', cook: 'kʊk',
  police: 'pəliːs', soldier: 'soʊldʒər',
  chinese: 'tʃaɪniːz', english: 'ɪŋɡlɪʃ', math: 'mæθ',
  music: 'mjuːzɪk', art: 'ɑːrt', science: 'saɪəns', history: 'hɪstəri',
  tennis: 'tenɪs', football: 'fʊtbɔːl', basketball: 'bæskɪtbɔːl',
  soccer: 'sɒkər', baseball: 'beɪsbɔːl', volleyball: 'vɒlibɔːl',
  china: 'tʃaɪnə', america: 'əmerɪkə', england: 'ɪŋɡlənd',
  japan: 'dʒəpæn', france: 'fræns', germany: 'dʒɜːrməni',
  tokyo: 'toʊkioʊ', london: 'lʌndən', paris: 'pærɪs',
  hospital: 'hɒspɪtəl', library: 'laɪbreri', museum: 'mjʊziːəm',
  park: 'pɑːrk', zoo: 'zuː',
};

const dict = {};
for (const w of words) {
  let ph;
  if (OVERRIDES[w.en]) ph = OVERRIDES[w.en];
  else ph = guessPhonetic(w.en);
  dict[w.en] = `/${ph}/`;
}

fs.writeFileSync(OUT, JSON.stringify(dict, null, 2));
console.log('words=' + words.length + ' phonetic-dict=' + Object.keys(dict).length);
console.log('sample:');
for (const k of Object.keys(dict).slice(0, 20)) console.log(' ', k, '=>', dict[k]);
