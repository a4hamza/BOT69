/**
 * Fast Offline Urdu Transliteration Engine
 * Converts Roman Urdu & conversational chat text into authentic Urdu script
 * Uses a comprehensive 13,600+ word dictionary + curated Pakistani vocabulary + phonetic fallback.
 * Zero external network calls. Sub-millisecond execution (<1ms). Negligible memory footprint (<1MB).
 */

const fs = require('fs');
const path = require('path');

// 1. Load base 13,600+ word dictionary
let baseDict = {};
try {
  const dictPath = path.join(__dirname, 'urduDictionary.json');
  if (fs.existsSync(dictPath)) {
    baseDict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
  }
} catch (e) {
  console.warn('[UrduTransliterator] Warning: Could not load base dictionary:', e.message);
}

// 2. High-priority curated dictionary for authentic Pakistani conversational Urdu & common loanwords
const CURATED_DICT = {
  // Greetings & Religious
  'assalam': 'السلام',
  'assalamualaikum': 'السلام علیکم',
  'assalamoalaikum': 'السلام علیکم',
  'salam': 'سلام',
  'wsalam': 'وعلیکم السلام',
  'walekum': 'وعلیکم',
  'walaikum': 'وعلیکم',
  'alhamdulillah': 'الحمدللہ',
  'mashallah': 'ماشاءاللہ',
  'mashaallah': 'ماشاءاللہ',
  'inshallah': 'انشاءاللہ',
  'subhanallah': 'سبحان اللہ',
  'jazakallah': 'جزاک اللہ',
  'shukriya': 'شکریہ',
  'shukria': 'شکریہ',
  'khudahafiz': 'خدا حافظ',
  'hafiz': 'حافظ',
  'allah': 'اللہ',

  // Pronouns & Demonstratives
  'aap': 'آپ',
  'ap': 'آپ',
  'hum': 'ہم',
  'ham': 'ہم',
  'humein': 'ہمیں',
  'hume': 'ہمیں',
  'tum': 'تم',
  'tumhein': 'تمہیں',
  'tumhe': 'تمہیں',
  'main': 'میں',
  'mai': 'میں',
  'mein': 'میں',
  'me': 'میں',
  'mujhe': 'مجھے',
  'mjhe': 'مجھے',
  'tujhe': 'تجھے',
  'tjhe': 'تجھے',
  'mera': 'میرا',
  'meri': 'میری',
  'mere': 'میرے',
  'tera': 'تیرا',
  'teri': 'تیری',
  'tere': 'تیرے',
  'apna': 'اپنا',
  'apni': 'اپنی',
  'apne': 'اپنے',
  'unka': 'ان کا',
  'unki': 'ان کی',
  'unke': 'ان کے',
  'inka': 'ان کا',
  'inki': 'ان کی',
  'inke': 'ان کے',
  'iska': 'اس کا',
  'iski': 'اس کی',
  'iske': 'اس کے',
  'uska': 'اس کا',
  'uski': 'اس کی',
  'uske': 'اس کے',
  'unko': 'ان کو',
  'inko': 'ان کو',
  'usko': 'اس کو',
  'isko': 'اس کو',
  'isse': 'اس سے',
  'usse': 'اس سے',
  'unse': 'ان سے',
  'inse': 'ان سے',
  'wo': 'وہ',
  'woh': 'وہ',
  'ye': 'یہ',
  'yeh': 'یہ',
  'yahan': 'یہاں',
  'wahan': 'وہاں',
  'idhar': 'ادھر',
  'udhar': 'ادھر',

  // Question words
  'kya': 'کیا',
  'kyun': 'کیوں',
  'kyu': 'کیوں',
  'kyon': 'کیوں',
  'kahan': 'کہاں',
  'kaha': 'کہاں',
  'kidhar': 'کدھر',
  'kese': 'کیسے',
  'kaise': 'کیسے',
  'kaisa': 'کیسا',
  'kaisi': 'کیسی',
  'kab': 'کب',
  'kon': 'کون',
  'kaun': 'کون',
  'kis': 'کس',
  'kisko': 'کس کو',
  'kisne': 'کس نے',
  'kitna': 'کتنا',
  'kitni': 'کتنی',
  'kitne': 'کتنے',

  // Auxiliaries & Verbs
  'hai': 'ہے',
  'hain': 'ہیں',
  'hn': 'ہیں',
  'h': 'ہے',
  'hoon': 'ہوں',
  'hun': 'ہوں',
  'ho': 'ہو',
  'tha': 'تھا',
  'thi': 'تھی',
  'the': 'تھے',
  'hoga': 'ہوگا',
  'hogi': 'ہوگی',
  'hoge': 'ہوگے',
  'honge': 'ہوں گے',
  'karo': 'کرو',
  'karein': 'کریں',
  'kare': 'کرے',
  'karna': 'کرنا',
  'karni': 'کرنی',
  'karne': 'کرنے',
  'kar': 'کر',
  'raha': 'رہا',
  'rahi': 'رہی',
  'rahe': 'رہے',
  'rha': 'رہا',
  'rhi': 'رہی',
  'rhe': 'رہے',
  'bol': 'بول',
  'bolo': 'بولو',
  'bole': 'بولے',
  'bolna': 'بولنا',
  'bolti': 'بولتی',
  'bolta': 'بولتا',
  'batao': 'بتاؤ',
  'bata': 'بتا',
  'batai': 'بتائی',
  'bataiye': 'بتائیے',
  'sun': 'سن',
  'suno': 'سنو',
  'sunna': 'سننا',
  'sunao': 'سناؤ',
  'aao': 'آؤ',
  'aana': 'آنا',
  'aaye': 'آئے',
  'aayi': 'آئی',
  'aaya': 'آیا',
  'gaya': 'گیا',
  'gayi': 'گئی',
  'gaye': 'گئے',
  'jao': 'جاؤ',
  'ja': 'جا',
  'jana': 'جانا',
  'jaate': 'جاتے',
  'jaati': 'جاتی',
  'jata': 'جاتا',
  'dekho': 'دیکھو',
  'dekh': 'دیکھ',
  'dekhna': 'دیکھنا',
  'samjhe': 'سمجھے',
  'samjho': 'سمجھو',
  'samajh': 'سمجھ',
  'socho': 'سوچو',
  'soch': 'سوچ',
  'chal': 'چل',
  'chalo': 'چلو',
  'chalte': 'چلتے',
  'rakho': 'رکھو',
  'rakh': 'رکھ',
  'lena': 'لینا',
  'dena': 'دینا',
  'le': 'لے',
  'de': 'دے',
  'lo': 'لو',
  'do': 'دو',
  'mil': 'مل',
  'milo': 'ملو',
  'milte': 'ملتے',

  // Common Particles, Adjectives, Adverbs & Nouns
  'theek': 'ٹھیک',
  'thik': 'ٹھیک',
  'acha': 'اچھا',
  'achha': 'اچھا',
  'accha': 'اچھا',
  'achi': 'اچھی',
  'achhi': 'اچھی',
  'ache': 'اچھے',
  'achhe': 'اچھے',
  'bura': 'برا',
  'bohot': 'بہت',
  'bahut': 'بہت',
  'bht': 'بہت',
  'bhot': 'بہت',
  'nahi': 'نہیں',
  'nhi': 'نہیں',
  'nahin': 'نہیں',
  'na': 'نہ',
  'mat': 'مت',
  'aur': 'اور',
  'bhi': 'بھی',
  'b': 'بھی',
  'toh': 'تو',
  'to': 'تو',
  'ka': 'کا',
  'ki': 'کی',
  'ke': 'کے',
  'ko': 'کو',
  'se': 'سے',
  'par': 'پر',
  'pe': 'پہ',
  'tak': 'تک',
  'liye': 'لیے',
  'keliye': 'کے لیے',
  'sab': 'سب',
  'sabhi': 'سبھی',
  'kuch': 'کچھ',
  'koi': 'کوئی',
  'kisi': 'کسی',
  'sirf': 'صرف',
  'zara': 'ذرا',
  'waise': 'ویسے',
  'wese': 'ویسے',
  'shabash': 'شاباش',
  'khush': 'خوش',
  'dil': 'دل',
  'jaan': 'جان',
  'haal': 'حال',
  'hal': 'حال',
  'bhai': 'بھائی',
  'bhaiya': 'بھیا',
  'bhaiyo': 'بھائیو',
  'yaar': 'یار',
  'yar': 'یار',
  'dost': 'دوست',
  'dosto': 'دوستو',
  'log': 'لوگ',
  'logo': 'لوگوں',
  'umeed': 'امید',
  'baat': 'بات',
  'bat': 'بات',
  'baatein': 'باتیں',
  'kaam': 'کام',
  'kam': 'کام',
  'waqt': 'وقت',
  'ghar': 'گھر',
  'sara': 'سارہ',
  'sarah': 'سارہ',
  'pyara': 'پیارا',
  'pyari': 'پیاری',
  'mosam': 'موسم',
  'kahani': 'کہانی',
  'zaroori': 'ضروری',
  'zaruri': 'ضروری',
  'subah': 'صبح',
  'shaam': 'شام',
  'raat': 'رات',
  'din': 'دن',
  'aaj': 'آج',
  'kal': 'کل',
  'parso': 'پرسوں',
  'ab': 'اب',
  'tab': 'تب',
  'phir': 'پھر',
  'lekin': 'لیکن',
  'magar': 'مگر',

  // Common English loanwords used in Pakistani chats
  'group': 'گروپ',
  'grp': 'گروپ',
  'admin': 'ایڈمن',
  'bot': 'بوٹ',
  'link': 'لنک',
  'rules': 'رولز',
  'rule': 'رول',
  'join': 'جوائن',
  'leave': 'لیو',
  'msg': 'میسج',
  'message': 'میسج',
  'call': 'کال',
  'number': 'نمبر',
  'pic': 'تصویر',
  'pics': 'تصاویر',
  'photo': 'فوٹو',
  'video': 'ویڈیو',
  'audio': 'آڈیو',
  'voice': 'وائس',
  'status': 'سٹیٹس',
  'please': 'پلیز',
  'plz': 'پلیز',
  'pls': 'پلیز',
  'sorry': 'سوری',
  'welcome': 'ویلکم',
  'thanks': 'تھینکس',
  'thankyou': 'تھینک یو',
  'thank': 'تھینک',
  'hello': 'ہیلو',
  'hi': 'ہائے',
  'bye': 'بائے',
  'good': 'گڈ',
  'ok': 'اوکے',
  'okay': 'اوکے',
  'fine': 'فائن',
  'yes': 'یس',
  'no': 'نو',
  'wait': 'ویٹ',
  'check': 'چیک',
  'post': 'پوسٹ',
  'share': 'شیئر',
  'like': 'لائک',
  'game': 'گیم',
  'play': 'پلے',
  'win': 'ون',
  'time': 'ٹائم'
};

// 3. Combined dictionary (Curated overrides base dataset)
const FULL_DICT = Object.assign({}, baseDict, CURATED_DICT);

// 4. Phonetic Digraphs & Monographs
const DIGRAPHS = [
  ['kh', 'کھ'],
  ['gh', 'غ'],
  ['sh', 'ش'],
  ['ch', 'چ'],
  ['th', 'تھ'],
  ['dh', 'دھ'],
  ['bh', 'بھ'],
  ['ph', 'پھ'],
  ['jh', 'جھ'],
  ['rh', 'ڑھ'],
  ['zh', 'ژ'],
  ['aa', 'آ'],
  ['ee', 'ی'],
  ['oo', 'و'],
  ['ai', 'ائے'],
  ['ou', 'اؤ']
];

const MONOGRAPHS = {
  'a': 'ا', 'b': 'ب', 'p': 'پ', 't': 'ت', 's': 'س',
  'j': 'ج', 'd': 'د', 'r': 'ر', 'z': 'ز', 'k': 'ک',
  'g': 'گ', 'l': 'ل', 'm': 'م', 'n': 'ن', 'w': 'و',
  'v': 'و', 'h': 'ہ', 'y': 'ی', 'i': 'ی', 'e': 'ے',
  'o': 'و', 'u': 'و', 'q': 'ق', 'f': 'ف', 'c': 'ک', 'x': 'کس'
};

const CORE_URDU_MARKERS = new Set([
  'kya', 'hai', 'hain', 'ho', 'hoon', 'hun', 'tha', 'thi', 'thay', 'karo', 'karein',
  'karna', 'karni', 'karne', 'raha', 'rahi', 'rahe', 'rha', 'rhi', 'rhe',
  'kaise', 'kese', 'kaisa', 'kaisi', 'bhai', 'yaar', 'yar', 'aap', 'ap', 'tum',
  'hum', 'ham', 'main', 'mai', 'mein', 'mujhe', 'mjhe', 'tujhe', 'mera', 'meri',
  'mere', 'tera', 'teri', 'tere', 'apna', 'apni', 'apne', 'nahi', 'nhi', 'nahin',
  'acha', 'achha', 'achi', 'bohot', 'bahut', 'bht', 'bhi', 'yeh', 'ye', 'woh',
  'wo', 'kahan', 'kyun', 'kyu', 'theek', 'thik', 'shukriya', 'chalo', 'suno',
  'bolo', 'batao', 'aao', 'jao', 'gaya', 'gayi', 'gaye'
]);

const ENGLISH_WORDS = new Set([
  'the', 'is', 'are', 'am', 'was', 'were', 'have', 'has', 'had', 'this', 'that', 'these', 'those',
  'what', 'where', 'when', 'why', 'how', 'who', 'which', 'with', 'for', 'from', 'about',
  'everyone', 'welcome', 'congratulations', 'good', 'morning', 'evening', 'night', 'brother', 'sister',
  'hello', 'rules', 'follow', 'respect', 'enjoy', 'member', 'members', 'people'
]);

/**
 * Phonetic fallback for words not in the dictionary
 */
function phoneticUrdu(word) {
  const str = word.toLowerCase();
  let res = '';
  let i = 0;
  while (i < str.length) {
    let matched = false;
    for (const [digraph, ur] of DIGRAPHS) {
      if (str.startsWith(digraph, i)) {
        res += ur;
        i += digraph.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const ch = str[i];
      res += MONOGRAPHS[ch] || ch;
      i++;
    }
  }
  return res;
}

/**
 * Transliterate a single word token
 */
function transliterateToken(token) {
  if (!/[a-zA-Z]/.test(token)) return token;

  const lower = token.toLowerCase();

  // 1. Direct dictionary match
  if (FULL_DICT[lower]) return FULL_DICT[lower];

  // 2. Normalization: collapse repeated characters (e.g. kyaaa -> kya, bhaiii -> bhai)
  const collapsed = lower.replace(/(.)\1{2,}/g, '$1$1');
  if (FULL_DICT[collapsed]) return FULL_DICT[collapsed];
  const singleCollapsed = lower.replace(/(.)\1+/g, '$1');
  if (FULL_DICT[singleCollapsed]) return FULL_DICT[singleCollapsed];

  // 3. Phonetic mapping fallback (guarantees NO Latin letters remain for the Urdu neural voice)
  return phoneticUrdu(token);
}

/**
 * Fast offline transliterator from Roman Urdu to authentic Urdu script
 * @param {string} text
 * @returns {string}
 */
function transliterateToUrdu(text) {
  if (!text) return '';
  const clean = text.trim();
  if (!/[a-zA-Z]/.test(clean)) return clean; // Pure Urdu script or emojis, return as-is

  const tokens = clean.split(/([a-zA-Z0-9_]+|[^\s\w]+|\s+)/).filter(Boolean);
  return tokens.map(t => transliterateToken(t)).join('');
}

/**
 * Prepare text for Sara / Urdu TTS:
 * - Detects pure Urdu script (preserves 100%)
 * - Detects pure English sentences (keeps English so it speaks fluent English)
 * - Converts Roman Urdu or mixed chat text into authentic Urdu script
 * @param {string} input
 * @returns {{ text: string, isEnglish: boolean }}
 */
function prepareTextForUrduTTS(input) {
  const clean = (input || '').trim();
  if (!clean) return { text: '', isEnglish: false };

  // 1. Pure Urdu script (no Latin characters)
  if (!/[a-zA-Z]/.test(clean)) {
    return { text: clean, isEnglish: false };
  }

  // 2. Tokenize lowercase words
  const words = clean.toLowerCase().match(/[a-z]+/g) || [];
  let hasUrduMarker = false;
  let engWordCount = 0;

  for (const w of words) {
    if (CORE_URDU_MARKERS.has(w)) {
      hasUrduMarker = true;
      break;
    }
    if (ENGLISH_WORDS.has(w)) {
      engWordCount++;
    }
  }

  // If there are NO core Urdu grammatical markers and multiple English words, treat as English
  if (!hasUrduMarker && engWordCount >= 2) {
    return { text: clean, isEnglish: true };
  }

  // 3. Otherwise, transliterate Roman Urdu to authentic Urdu script
  const transliterated = transliterateToUrdu(clean);
  return { text: transliterated, isEnglish: false };
}

module.exports = {
  transliterateToUrdu,
  prepareTextForUrduTTS,
  CURATED_DICT,
  FULL_DICT
};
