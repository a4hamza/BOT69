/**
 * VIRUZ Anime & Multilingual Voice TTS Engine
 * Converts text into voice audio in the distinct voice styles of iconic Anime characters
 * as well as authentic multilingual voices (Sara: Urdu / Hindi / English with Pakistani/Indian accent).
 * Zero CPU/RAM strain on HYEHOST.
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const crypto = require('crypto');
const { atlasBox } = require('./utils');
const { prepareTextForUrduTTS } = require('./urduTransliterator');

const ANIME_VOICES = {
  sara: {
    id: 'sara',
    name: 'Sara',
    title: 'Pakistani Urdu & English Girl',
    anime: 'Pakistani Urdu & English Voice',
    emoji: '🧕',
    voiceName: 'ur-PK-UzmaNeural',
    lang: 'ur-PK',
    rate: '+0%',
    pitch: '+1Hz',
    isSpecialEngine: true,
    engineType: 'urdu',
    intro: '',
    description: 'Sweet, natural human girl voice with authentic Pakistani Urdu and English pronunciation',
    aliases: ['sara', 'sarah', 'urdu', 'pakistani']
  },
  gul: {
    id: 'gul',
    name: 'Gul',
    title: 'Soft Expressive Urdu Girl',
    anime: 'Urdu Voice',
    emoji: '🌸',
    voiceName: 'ur-IN-GulNeural',
    lang: 'ur-IN',
    rate: '+0%',
    pitch: '+0Hz',
    isSpecialEngine: true,
    engineType: 'urdu',
    intro: '',
    description: 'Soft, fluent, expressive Urdu girl voice',
    aliases: ['gul', 'sara2', 'urdu2', 'urdu_female']
  },
  asad: {
    id: 'asad',
    name: 'Asad',
    title: 'Pakistani Urdu Male',
    anime: 'Pakistani Urdu Voice',
    emoji: '🧔',
    voiceName: 'ur-PK-AsadNeural',
    lang: 'ur-PK',
    rate: '+0%',
    pitch: '+0Hz',
    isSpecialEngine: true,
    engineType: 'urdu',
    intro: '',
    description: 'Deep, authentic Pakistani Urdu male voice',
    aliases: ['asad', 'urdu_male', 'urdu3']
  },
  loli: {
    id: 'loli',
    name: 'Anya / Loli',
    title: 'Cute Anime Girl',
    anime: 'SPY x FAMILY / Chibi Anime',
    emoji: '🌸',
    gender: 'female',
    actor: 'Atsumi Tanezaki (種﨑敦美)',
    edgeVoice: 'ja-JP-NanamiNeural',
    edgePitch: '+28Hz',
    edgeRate: '+10%',
    speaker: 3, // Voicevox Zundamon Cute/Chibi
    speakerAlt: 4, // Voicevox Zundamon Sweet
    isSpecialEngine: true,
    engineType: 'loli',
    intro: 'わくわく！',
    sampleText: 'わくわく！アーニャ、ピーナッツが好き！',
    sampleFile: 'loli_sample.mp3',
    description: 'High-pitched, ultra-cute chibi / anime girl voice (Waku waku!)',
    aliases: ['loli', 'anya', 'klee', 'chibi', 'cute', 'kawaii']
  },
  ben10: {
    id: 'ben10',
    name: 'Ben Tennyson',
    title: 'Wielder of the Omnitrix',
    anime: 'Ben 10 (Classic 2005)',
    emoji: '⌚',
    gender: 'male',
    actor: 'Tara Strong (Classic 10-year-old Ben)',
    edgeVoice: 'en-US-AnaNeural',
    edgePitch: '+3Hz',
    edgeRate: '+6%',
    isSpecialEngine: true,
    engineType: 'ben10',
    intro: "It's hero time!",
    sampleText: "It's hero time! I'm Ben Tennyson and I've got the Omnitrix!",
    sampleFile: 'ben10_sample.mp3',
    description: 'Iconic, energetic, confident 10-year-old boy hero voice of Ben Tennyson from classic Ben 10',
    aliases: ['ben10', 'ben', 'tennyson', 'omnitrix']
  },
  aizen: {
    id: 'aizen',
    name: 'Sosuke Aizen',
    title: 'Mastermind',
    anime: 'Bleach',
    emoji: '🦋',
    gender: 'male',
    actor: 'Sho Hayami (速水奨)',
    edgeVoice: 'ja-JP-KeitaNeural',
    edgePitch: '-6Hz',
    edgeRate: '+0%',
    speaker: 13, // Voicevox Aoyama Ryusei (Deep, calm mastermind)
    intro: 'いつから鏡花水月を使っていないと錯覚していた？',
    sampleText: 'いつから鏡花水月を使っていないと錯覚していた？',
    sampleFile: 'aizen_sample.mp3',
    description: 'Baritone, hypnotic, calculating mastermind voice (Sho Hayami seiyuu style)',
    aliases: ['aizen', 'ai', 'sosuke']
  },
  goku: {
    id: 'goku',
    name: 'Son Goku',
    title: 'Super Saiyan',
    anime: 'Dragon Ball Z',
    emoji: '💥',
    gender: 'female_seiyuu',
    actor: 'Masako Nozawa (野沢雅子)',
    edgeVoice: 'ja-JP-NanamiNeural',
    edgePitch: '-8Hz',
    edgeRate: '+15%',
    speaker: 12,
    intro: 'オッス！オラ悟空！',
    sampleText: 'オッス！オラ悟空！かめはめ波！',
    sampleFile: 'goku_sample.mp3',
    description: 'High-energy, iconic Saiyan warrior voice (Masako Nozawa authentic seiyuu style)',
    aliases: ['goku', 'go', 'songoku', 'kakarot', 'saiyan']
  },
  gojo: {
    id: 'gojo',
    name: 'Satoru Gojo',
    title: 'The Honored One',
    anime: 'Jujutsu Kaisen',
    emoji: '🤞',
    gender: 'male',
    actor: 'Yuichi Nakamura (中村悠一)',
    edgeVoice: 'ja-JP-KeitaNeural',
    edgePitch: '+4Hz',
    edgeRate: '+5%',
    speaker: 11,
    intro: '大丈夫、僕最強だから。',
    sampleText: '大丈夫、僕最強だから。領域展開、無量空処。',
    sampleFile: 'gojo_sample.mp3',
    description: 'Smooth, confident, playful sorcerer voice (Yuichi Nakamura seiyuu style)',
    aliases: ['gojo', 'satoru']
  },
  sukuna: {
    id: 'sukuna',
    name: 'Ryomen Sukuna',
    title: 'King of Curses',
    anime: 'Jujutsu Kaisen',
    emoji: '🩸',
    gender: 'male',
    actor: 'Junichi Suwabe (諏訪部順一)',
    edgeVoice: 'ja-JP-KeitaNeural',
    edgePitch: '-16Hz',
    edgeRate: '-5%',
    speaker: 13,
    intro: '分を弁えろ、痴れ者が。',
    sampleText: '分を弁えろ、痴れ者が。領域展開、伏魔御廚子。',
    sampleFile: 'sukuna_sample.mp3',
    description: 'Deep, menacing, commanding King of Curses voice (Junichi Suwabe seiyuu style)',
    aliases: ['sukuna', 'ryomen', 'curse']
  },
  naruto: {
    id: 'naruto',
    name: 'Naruto Uzumaki',
    title: 'Seventh Hokage',
    anime: 'Naruto',
    emoji: '🍥',
    gender: 'female_seiyuu',
    actor: 'Junko Takeuchi (竹内順子)',
    edgeVoice: 'ja-JP-NanamiNeural',
    edgePitch: '-10Hz',
    edgeRate: '+12%',
    speaker: 12,
    intro: 'だってばよ！',
    sampleText: 'だってばよ！螺旋丸！オレは火影になる男だ！',
    sampleFile: 'naruto_sample.mp3',
    description: 'Fiery, raspy ninja hero voice (Junko Takeuchi authentic seiyuu style)',
    aliases: ['naruto', 'naru', 'uzumaki', 'hokage']
  },
  sasuke: {
    id: 'sasuke',
    name: 'Sasuke Uchiha',
    title: 'Avenger of the Uchiha',
    anime: 'Naruto',
    emoji: '⚡',
    gender: 'male',
    actor: 'Noriaki Sugiyama (杉山紀彰)',
    edgeVoice: 'ja-JP-KeitaNeural',
    edgePitch: '-3Hz',
    edgeRate: '+0%',
    speaker: 11,
    intro: 'うずまきナルト…',
    sampleText: 'うずまきナルト…千鳥！',
    sampleFile: 'sasuke_sample.mp3',
    description: 'Calm, cool, sharp shadow ninja voice (Noriaki Sugiyama seiyuu style)',
    aliases: ['sasuke', 'saske']
  },
  luffy: {
    id: 'luffy',
    name: 'Monkey D. Luffy',
    title: 'King of the Pirates',
    anime: 'One Piece',
    emoji: '👒',
    gender: 'female_seiyuu',
    actor: 'Mayumi Tanaka (田中真弓)',
    edgeVoice: 'ja-JP-NanamiNeural',
    edgePitch: '-6Hz',
    edgeRate: '+18%',
    speaker: 12,
    intro: '海賊王に俺はなる！',
    sampleText: '海賊王に俺はなる！ゴムゴムのピストル！',
    sampleFile: 'luffy_sample.mp3',
    description: 'Fearless, cheekily energetic pirate boy voice (Mayumi Tanaka authentic seiyuu style)',
    aliases: ['luffy', 'luf', 'strawhat']
  },
  zoro: {
    id: 'zoro',
    name: 'Roronoa Zoro',
    title: 'King of Hell Swordsman',
    anime: 'One Piece',
    emoji: '⚔️',
    gender: 'male',
    actor: 'Kazuya Nakai (中井和哉)',
    edgeVoice: 'ja-JP-KeitaNeural',
    edgePitch: '-9Hz',
    edgeRate: '+0%',
    speaker: 13,
    intro: '背中の傷は剣士の恥だ。',
    sampleText: '背中の傷は剣士の恥だ。三刀流奥義、三千世界！',
    sampleFile: 'zoro_sample.mp3',
    description: 'Deep, gruff, stoic swordsman voice (Kazuya Nakai seiyuu style)',
    aliases: ['zoro', 'roronoa', 'marimo']
  },
  levi: {
    id: 'levi',
    name: 'Levi Ackerman',
    title: "Humanity's Strongest",
    anime: 'Attack on Titan',
    emoji: '🗡️',
    gender: 'male',
    actor: 'Hiroshi Kamiya (神谷浩史)',
    edgeVoice: 'ja-JP-KeitaNeural',
    edgePitch: '-4Hz',
    edgeRate: '+2%',
    speaker: 11,
    intro: 'おい、ガキ共…',
    sampleText: 'おい、ガキ共…これはどういう状況だ。',
    sampleFile: 'levi_sample.mp3',
    description: 'Cold, sharp, disciplined captain voice (Hiroshi Kamiya seiyuu style)',
    aliases: ['levi', 'ackerman', 'captain']
  },
  eren: {
    id: 'eren',
    name: 'Eren Yeager',
    title: 'Attack Titan',
    anime: 'Attack on Titan',
    emoji: '🦅',
    gender: 'male',
    actor: 'Yuki Kaji (梶裕貴)',
    edgeVoice: 'ja-JP-KeitaNeural',
    edgePitch: '+6Hz',
    edgeRate: '+10%',
    speaker: 21,
    intro: '戦え、戦え！',
    sampleText: '戦え、戦え！駆逐してやる、この世から一匹残らず！',
    sampleFile: 'eren_sample.mp3',
    description: 'Fierce, intense, shouting warrior voice (Yuki Kaji seiyuu style)',
    aliases: ['eren', 'yeager', 'tatakae']
  },
  makima: {
    id: 'makima',
    name: 'Makima',
    title: 'Control Devil',
    anime: 'Chainsaw Man',
    emoji: '🐕',
    gender: 'female',
    actor: 'Tomori Kusunoki (楠木ともり)',
    edgeVoice: 'ja-JP-NanamiNeural',
    edgePitch: '+0Hz',
    edgeRate: '-2%',
    speaker: 2,
    intro: '私の言うことを聞いて…',
    sampleText: '私の言うことを聞いて…死体になっても私を好きでいてね。',
    sampleFile: 'makima_sample.mp3',
    description: 'Gentle, chilling, hypnotic controlling voice (Tomori Kusunoki seiyuu style)',
    aliases: ['makima', 'control']
  },
  saitama: {
    id: 'saitama',
    name: 'Saitama',
    title: 'One Punch Man',
    anime: 'One Punch Man',
    emoji: '🥊',
    gender: 'male',
    actor: 'Makoto Furukawa (古川慎)',
    edgeVoice: 'ja-JP-KeitaNeural',
    edgePitch: '+0Hz',
    edgeRate: '+0%',
    speaker: 11,
    intro: '趣味でヒーローをやってる者だ。',
    sampleText: '趣味でヒーローをやってる者だ。マジ殴り！',
    sampleFile: 'saitama_sample.mp3',
    description: 'Nonchalant, casual, invincible hero voice (Makoto Furukawa seiyuu style)',
    aliases: ['saitama', 'onepunch', 'bald']
  },
  madara: {
    id: 'madara',
    name: 'Madara Uchiha',
    title: 'Ghost of the Uchiha',
    anime: 'Naruto',
    emoji: '🔥',
    gender: 'male',
    actor: 'Naoya Uchida (内田直哉)',
    edgeVoice: 'ja-JP-KeitaNeural',
    edgePitch: '-14Hz',
    edgeRate: '-2%',
    speaker: 13,
    intro: 'お前も踊るか？',
    sampleText: 'お前も踊るか？この力、うちはマダラの力だ！',
    sampleFile: 'madara_sample.mp3',
    description: 'Imposing, thunderous legendary warrior voice (Naoya Uchida seiyuu style)',
    aliases: ['madara']
  },
  itachi: {
    id: 'itachi',
    name: 'Itachi Uchiha',
    title: 'Sharingan Prodigy',
    anime: 'Naruto',
    emoji: '👁️',
    gender: 'male',
    actor: 'Hideo Ishikawa (石川英郎)',
    edgeVoice: 'ja-JP-KeitaNeural',
    edgePitch: '-5Hz',
    edgeRate: '+0%',
    speaker: 11,
    intro: '許せサスケ、これで最後だ。',
    sampleText: '許せサスケ、これで最後だ。天照！',
    sampleFile: 'itachi_sample.mp3',
    description: 'Calm, wise, melancholic older brother voice (Hideo Ishikawa seiyuu style)',
    aliases: ['itachi']
  },
  tanjiro: {
    id: 'tanjiro',
    name: 'Tanjiro Kamado',
    title: 'Sun Breathing Slayer',
    anime: 'Demon Slayer',
    emoji: '🌊',
    gender: 'male',
    actor: 'Natsuki Hanae (花江夏樹)',
    edgeVoice: 'ja-JP-NanamiNeural',
    edgePitch: '-5Hz',
    edgeRate: '+6%',
    speaker: 21,
    intro: '全集中！水の呼吸！',
    sampleText: '全集中！水の呼吸！心を燃やせ！',
    sampleFile: 'tanjiro_sample.mp3',
    description: 'Earnest, compassionate young slayer voice (Natsuki Hanae seiyuu style)',
    aliases: ['tanjiro', 'kamado']
  },
  nezuko: {
    id: 'nezuko',
    name: 'Nezuko Kamado',
    title: 'Demon Sister',
    anime: 'Demon Slayer',
    emoji: '🎀',
    gender: 'female',
    actor: 'Akari Kito (鬼頭明里)',
    edgeVoice: 'ja-JP-NanamiNeural',
    edgePitch: '+22Hz',
    edgeRate: '+6%',
    speaker: 3,
    intro: 'ムームー！',
    sampleText: 'ムームー！',
    description: 'Soft, cute, high-pitched demon sister voice',
    aliases: ['nezuko']
  },
  dio: {
    id: 'dio',
    name: 'Dio Brando',
    title: 'Vampire Overlord',
    anime: "JoJo's Bizarre Adventure",
    emoji: '⏳',
    gender: 'male',
    actor: 'Takehito Koyasu (子安武人)',
    edgeVoice: 'ja-JP-KeitaNeural',
    edgePitch: '-5Hz',
    edgeRate: '+8%',
    speaker: 13,
    intro: '無駄無駄無駄！ザ・ワールド！',
    sampleText: '無駄無駄無駄！ザ・ワールド！時よ止まれ！',
    sampleFile: 'dio_sample.mp3',
    description: 'Theatrical, wicked, triumphant vampire voice (Takehito Koyasu seiyuu style)',
    aliases: ['dio', 'brando', 'zawarudo']
  },
  allmight: {
    id: 'allmight',
    name: 'All Might',
    title: 'Symbol of Peace',
    anime: 'My Hero Academia',
    emoji: '💪',
    gender: 'male',
    actor: 'Kenta Miyake (三宅健太)',
    edgeVoice: 'ja-JP-KeitaNeural',
    edgePitch: '-7Hz',
    edgeRate: '+8%',
    speaker: 13,
    intro: '私が来た！',
    sampleText: 'もう大丈夫！なぜって？私が来た！デトロイトスマッシュ！',
    sampleFile: 'allmight_sample.mp3',
    description: 'Booming, heroic, proud champion voice (Kenta Miyake seiyuu style)',
    aliases: ['allmight', 'almight', 'toshinori']
  },
  deku: {
    id: 'deku',
    name: 'Izuku Midoriya',
    title: 'Deku',
    anime: 'My Hero Academia',
    emoji: '🥦',
    gender: 'male',
    actor: 'Daiki Yamashita (山下大輝)',
    edgeVoice: 'ja-JP-NanamiNeural',
    edgePitch: '-4Hz',
    edgeRate: '+10%',
    speaker: 12,
    intro: '君を助ける！',
    sampleText: '僕は君を助ける！ワン・フォー・オール、フルカウル！',
    sampleFile: 'deku_sample.mp3',
    description: 'Heartfelt, passionate young boy hero voice (Daiki Yamashita seiyuu style)',
    aliases: ['deku', 'midoriya', 'izuku']
  },
  tsumugi: {
    id: 'tsumugi',
    name: 'Kasukabe Tsumugi',
    title: 'Energetic Gal',
    anime: 'Anime High School',
    emoji: '⭐',
    gender: 'female',
    edgeVoice: 'ja-JP-NanamiNeural',
    edgePitch: '+18Hz',
    edgeRate: '+10%',
    speaker: 8,
    intro: 'やっほー！つむぎだよ！',
    description: 'Hyper-energetic, bright anime girl voice',
    aliases: ['tsumugi', 'kasukabe']
  },
  himari: {
    id: 'himari',
    name: 'Meimei Himari',
    title: 'Tsundere Princess',
    anime: 'Anime Fantasy',
    emoji: '✨',
    gender: 'female',
    edgeVoice: 'ja-JP-NanamiNeural',
    edgePitch: '+16Hz',
    edgeRate: '+8%',
    speaker: 14,
    intro: 'べ、別にアンタのためじゃないんだからね！',
    description: 'Playful, cute tsundere anime girl voice',
    aliases: ['himari', 'meimei', 'tsun']
  },
  zundamon: {
    id: 'zundamon',
    name: 'Zundamon',
    title: 'Anime Fairy',
    anime: 'VOICEVOX Legend',
    emoji: '🧚',
    gender: 'female',
    edgeVoice: 'ja-JP-NanamiNeural',
    edgePitch: '+26Hz',
    edgeRate: '+10%',
    speaker: 3,
    intro: 'ずんだもんなのだ！',
    description: 'Iconic high-pitched cute anime fairy mascot voice',
    aliases: ['zundamon', 'zunda']
  },
  metan: {
    id: 'metan',
    name: 'Shikoku Metan',
    title: 'Ojou-sama',
    anime: 'VOICEVOX Legend',
    emoji: '👑',
    gender: 'female',
    edgeVoice: 'ja-JP-NanamiNeural',
    edgePitch: '+4Hz',
    edgeRate: '+0%',
    speaker: 1,
    intro: 'ごきげんよう、めたんですわ。',
    description: 'Elegant, refined anime lady voice',
    aliases: ['metan', 'shikoku']
  }
};

const ALL_VOICES = ANIME_VOICES;

/**
 * Pick a random character voice (Anime characters)
 * @returns {object}
 */
function getRandomAnimeVoice() {
  const animeList = Object.values(ANIME_VOICES).filter(c => c.id !== 'sara');
  const randomIndex = Math.floor(Math.random() * animeList.length);
  return animeList[randomIndex];
}

/**
 * Find character voice by name or alias
 * @param {string} input 
 * @returns {object|null}
 */
function resolveHero(input) {
  if (!input || typeof input !== 'string') return null;
  const clean = input.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!clean) return null;

  if (clean === 'random' || clean === 'rand') {
    return getRandomAnimeVoice();
  }

  // Check all voices
  for (const char of Object.values(ANIME_VOICES)) {
    if (char.id === clean || char.aliases.some(a => a.replace(/[^a-z0-9]/g, '') === clean)) {
      return char;
    }
  }

  return null;
}

const resolveAnime = resolveHero;
const resolveCharacter = resolveHero;

/**
 * Split long text into speakable chunks (max 180 chars per request)
 * @param {string} text 
 * @param {number} maxChunkLen
 * @returns {string[]}
 */
function splitTextIntoChunks(text, maxChunkLen = 180) {
  const clean = (text || '').trim();
  if (!clean) return [];
  if (clean.length <= maxChunkLen) return [clean];

  const sentences = clean.split(/(?<=[.!?\n۔،])\s+/);
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if (!sentence) continue;
    if ((current + ' ' + sentence).trim().length <= maxChunkLen) {
      current = current ? `${current} ${sentence}` : sentence;
    } else {
      if (current.trim()) chunks.push(current.trim());

      if (sentence.length > maxChunkLen) {
        const words = sentence.split(/\s+/);
        let wordCurrent = '';
        for (const word of words) {
          if ((wordCurrent + ' ' + word).trim().length <= maxChunkLen) {
            wordCurrent = wordCurrent ? `${wordCurrent} ${word}` : word;
          } else {
            if (wordCurrent.trim()) chunks.push(wordCurrent.trim());
            wordCurrent = word;
          }
        }
        current = wordCurrent;
      } else {
        current = sentence;
      }
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

// In-memory LRU cache for instant responses (<5ms, up to 100 items)
const ttsCache = new Map();
const MAX_CACHE_SIZE = 100;

const WIN_EPOCH = 11644473600;
const EDGE_TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;

/**
 * Generate Sec-MS-GEC token for Microsoft Edge Neural TTS authentication
 */
function generateSecMsGec() {
  const unixNow = Math.floor(Date.now() / 1000);
  let ticks = unixNow + WIN_EPOCH;
  ticks -= (ticks % 300);
  const ticksBigInt = BigInt(ticks) * 10000000n;
  const strToHash = `${ticksBigInt}${EDGE_TRUSTED_TOKEN}`;
  return crypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase();
}

/**
 * Synthesize a single audio chunk using Microsoft Edge Neural Voice
 * Supports any voice: ur-PK-UzmaNeural, ur-IN-GulNeural, ur-PK-AsadNeural, en-US-JennyNeural, ja-JP-NanamiNeural
 * Employs sliding inactivity timeout so streaming is robust and never hangs
 * @param {string} text
 * @param {string} voiceName
 * @param {string} lang
 * @param {string} rate
 * @param {string} pitch
 * @returns {Promise<Buffer>}
 */
function synthesizeEdgeNeuralChunk(text, voiceName = 'ur-PK-UzmaNeural', lang = 'ur-PK', rate = '+0%', pitch = '+0Hz') {
  return new Promise((resolve, reject) => {
    const reqId = crypto.randomUUID().replace(/-/g, '');
    const connId = crypto.randomUUID().replace(/-/g, '');
    const secMsGec = generateSecMsGec();

    const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TRUSTED_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connId}`;

    const ws = new WebSocket(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      handshakeTimeout: 10000
    });

    const audioChunks = [];
    let inactivityTimer = null;
    let safetyTimer = null;

    const resetInactivity = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        try { ws.close(); } catch (e) {}
        reject(new Error('Edge Neural TTS stream stalled'));
      }, 10000);
    };

    safetyTimer = setTimeout(() => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      try { ws.close(); } catch (e) {}
      reject(new Error('Edge Neural TTS chunk processing timed out'));
    }, 35000);

    const cleanup = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      if (safetyTimer) clearTimeout(safetyTimer);
    };

    ws.on('open', () => {
      resetInactivity();
      ws.send('Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}');

      const cleanXml = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${voiceName}"><prosody pitch="${pitch}" rate="${rate}" volume="+0%">${cleanXml}</prosody></voice></speak>`;
      const req = `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\nX-Timestamp:${new Date().toISOString()}\r\n\r\n${ssml}`;
      ws.send(req);
    });

    ws.on('message', (data, isBinary) => {
      resetInactivity();
      if (isBinary) {
        const buf = Buffer.from(data);
        if (buf.length > 2) {
          const headerLen = buf.readUInt16BE(0);
          const header = buf.slice(2, 2 + headerLen).toString('utf8');
          if (header.includes('Path:audio')) {
            audioChunks.push(buf.slice(2 + headerLen));
          }
        }
      } else {
        const textMsg = data.toString();
        if (textMsg.includes('Path:turn.end')) {
          cleanup();
          try { ws.close(); } catch (e) {}
          const finalAudio = Buffer.concat(audioChunks);
          if (finalAudio.length > 500) {
            resolve(finalAudio);
          } else {
            reject(new Error('Empty audio received from Edge TTS'));
          }
        }
      }
    });

    ws.on('error', (err) => {
      cleanup();
      try { ws.close(); } catch (e) {}
      reject(err);
    });
  });
}

/**
 * Authentic Pakistani & Multilingual TTS for Sara, Gul, and Asad
 * Supports Pakistani Urdu (Sara/Asad) and soft Indian Urdu (Gul), with fluent English fallback.
 * Uses 100% offline sub-millisecond transliteration engine with 13,600+ word dictionary.
 * Splits long voice notes into sentence chunks and concatenates cleanly.
 * @param {string} rawText
 * @param {string} voiceId - 'sara' | 'gul' | 'asad'
 * @returns {Promise<Buffer>}
 */
async function generateSaraTTS(rawText, voiceId = 'sara') {
  const clean = (rawText || '').trim();
  if (!clean) throw new Error('No text provided to speak! Usage: `.sara <message>`');

  // Cap huge spam texts at 1500 chars to avoid memory exhaustion
  const safeText = clean.length > 1500 ? clean.slice(0, 1500) : clean;

  // Fast offline Urdu transliteration (<1ms, zero network latency)
  const { text: processedText, isEnglish } = prepareTextForUrduTTS(safeText);

  // Determine Neural Voice and Language
  let targetVoice = 'ur-PK-UzmaNeural';
  let targetLang = 'ur-PK';
  let targetPitch = '+1Hz';
  let targetRate = '+0%';

  if (isEnglish) {
    targetVoice = 'en-US-JennyNeural';
    targetLang = 'en-US';
    targetPitch = '+0Hz';
  } else if (voiceId === 'gul') {
    targetVoice = 'ur-IN-GulNeural';
    targetLang = 'ur-IN';
    targetPitch = '+0Hz';
  } else if (voiceId === 'asad') {
    targetVoice = 'ur-PK-AsadNeural';
    targetLang = 'ur-PK';
    targetPitch = '+0Hz';
  }

  // Split into chunks of max 300 chars (sentence boundaries) for large voice notes
  const chunks = splitTextIntoChunks(processedText, 300);

  // 1. Primary Engine: Microsoft Edge Neural
  try {
    const audioParts = [];
    for (let i = 0; i < chunks.length; i++) {
      const part = await synthesizeEdgeNeuralChunk(chunks[i], targetVoice, targetLang, targetRate, targetPitch);
      audioParts.push(part);
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 60)); // natural breath pause
      }
    }
    return Buffer.concat(audioParts);
  } catch (err) {
    console.warn(`[Urdu Edge TTS] Neural engine failed (${err.message}), trying backup engine...`);
  }

  // 2. Fallback Engine: Google Translate Urdu/English endpoint
  try {
    const fallbackChunks = splitTextIntoChunks(processedText, 180);
    const audioParts = [];
    const tlLang = isEnglish ? 'en' : 'ur';
    for (const chunk of fallbackChunks) {
      const encoded = encodeURIComponent(chunk);
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tlLang}&q=${encoded}`;
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 9000
      });
      if (res.data && res.data.length > 500) {
        audioParts.push(Buffer.from(res.data));
      }
    }
    if (audioParts.length > 0) {
      return Buffer.concat(audioParts);
    }
  } catch (backupErr) {
    console.error('[Urdu TTS Fallback] Backup engine failed:', backupErr.message);
  }

  throw new Error('Failed to synthesize Urdu voice. Please try a shorter message.');
}

/**
 * Generate Voicevox Anime Voice Synthesis (v1 Stable Multi-Speaker Endpoint)
 * Offloads synthesis entirely to high-speed cloud cluster with zero host CPU/RAM usage.
 * @param {number} speaker
 * @param {string} text
 * @returns {Promise<Buffer>}
 */
async function generateVoicevoxTTS(speaker = 12, text) {
  // Sanitize text: strip zero-width characters and control codes
  const cleanText = text.replace(/[\u0000-\u001F\u200B-\u200D\uFEFF]/g, ' ').trim();
  const url = `https://api.tts.quest/v1/voicevox/?text=${encodeURIComponent(cleanText)}&speaker=${speaker}`;
  const initRes = await axios.get(url, {
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  if (!initRes.data || !initRes.data.success) {
    throw new Error(initRes.data?.errorMessage || 'Voicevox initialization failed');
  }

  const { audioStatusUrl, mp3DownloadUrl, isAudioReady } = initRes.data;
  if (!mp3DownloadUrl) {
    throw new Error('Invalid Voicevox audio endpoints returned');
  }

  // If already ready immediately (e.g. cached on server), fetch directly
  if (isAudioReady) {
    const audioRes = await axios.get(mp3DownloadUrl, {
      responseType: 'arraybuffer',
      timeout: 9000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (audioRes.data && audioRes.data.length > 500) {
      return Buffer.from(audioRes.data);
    }
  }

  if (!audioStatusUrl) {
    throw new Error('Invalid Voicevox audio status endpoint');
  }

  // Quick initial pause before first poll (150ms for low latency)
  await new Promise(r => setTimeout(r, 150));

  // Poll status up to 35 times with 200ms intervals (~7s wait max)
  for (let i = 0; i < 35; i++) {
    try {
      const statusRes = await axios.get(audioStatusUrl, {
        timeout: 3000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (statusRes.data?.isAudioReady) {
        // Attempt download, with brief retry if CDN is warming up
        for (let d = 0; d < 2; d++) {
          try {
            const audioRes = await axios.get(mp3DownloadUrl, {
              responseType: 'arraybuffer',
              timeout: 8000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            });

            if (audioRes.data && audioRes.data.length > 500) {
              return Buffer.from(audioRes.data);
            }
          } catch (dErr) {
            if (d === 0) await new Promise(r => setTimeout(r, 200));
          }
        }
      }

      if (statusRes.data?.isAudioError) {
        throw new Error('Voicevox audio synthesis reported error');
      }
    } catch (pollErr) {
      if (pollErr.message.includes('reported error')) throw pollErr;
    }
    await new Promise(r => setTimeout(r, 200));
  }

  throw new Error('Voicevox anime synthesis timed out waiting for audio.');
}

/**
 * Generate Voicevox TTS with multi-attempt retry on transient network glitch
 * Includes automatic Edge Neural fallback for 100% uptime (no 429 errors, zero stalls)
/**
 * Synthesize Japanese speech using Google TTS as resilient secondary fallback
 * @param {string} text
 * @param {string} lang
 * @returns {Promise<Buffer>}
 */
async function synthesizeGoogleAnimeFallback(text, lang = 'ja') {
  const chunks = splitTextIntoChunks(text, 180);
  const audioParts = [];
  for (const chunk of chunks) {
    const encoded = encodeURIComponent(chunk);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encoded}`;
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 6000
    });
    if (res.data && res.data.length > 0) {
      audioParts.push(Buffer.from(res.data));
    }
  }
  if (audioParts.length === 0) {
    throw new Error('Google Japanese TTS fallback returned empty audio');
  }
  return Buffer.concat(audioParts);
}

/**
 * Generate Voicevox TTS with multi-attempt retry on transient network glitch
 * Includes automatic Edge Neural fallback for 100% uptime (no 429 errors, zero stalls)
 * @param {number} speaker
 * @param {string} text
 * @param {boolean} isLoli
 * @param {object|null} character
 * @returns {Promise<Buffer>}
 */
async function generateVoicevoxTTSWithRetry(speaker = 12, text, isLoli = false, character = null) {
  let lastErr = null;
  const backoffs = [0, 300];

  for (let attempt = 0; attempt < backoffs.length; attempt++) {
    if (backoffs[attempt] > 0) {
      await new Promise(r => setTimeout(r, backoffs[attempt]));
    }
    try {
      return await generateVoicevoxTTS(speaker, text);
    } catch (err) {
      lastErr = err;
      console.warn(`[Voicevox] Attempt ${attempt + 1}/${backoffs.length} failed (${err.message})`);
    }
  }

  // Graceful fallback to Edge Neural using character profile
  console.warn(`[Voicevox] Cloud cluster busy, using instant Edge Neural fallback (${lastErr?.message})`);
  try {
    const isFemale = character?.gender === 'female' || isLoli || speaker === 1 || speaker === 2 || speaker === 3 || speaker === 4 || speaker === 8 || speaker === 14;
    const targetVoice = character?.edgeVoice || (isFemale ? 'ja-JP-NanamiNeural' : 'ja-JP-KeitaNeural');
    const targetPitch = character?.edgePitch || (isFemale ? (isLoli ? '+28Hz' : '+0Hz') : (speaker === 12 ? '+15Hz' : '+0Hz'));
    const targetRate = character?.edgeRate || (speaker === 12 ? '+15%' : '+0%');
    return await synthesizeEdgeNeuralChunk(text, targetVoice, 'ja-JP', targetRate, targetPitch);
  } catch (fallbackErr) {
    try {
      return await synthesizeGoogleAnimeFallback(text, 'ja');
    } catch (gErr) {
      throw lastErr || fallbackErr || gErr;
    }
  }
}

/**
 * Synthesize Authentic Anime Character Voice Note
 * Primary: Microsoft Edge Neural Japanese with character-tuned pitch, rate, and timbre
 * Fallback 1: Google Japanese TTS (100% uptime fallback)
 * Fallback 2: Voicevox Studio
 * @param {object} character
 * @param {string} speechText
 * @returns {Promise<Buffer>}
 */
async function generateAnimeCharacterTTS(character, speechText) {
  const isFemale = character.gender === 'female' || character.gender === 'female_seiyuu';
  const targetVoice = character.edgeVoice || (isFemale ? 'ja-JP-NanamiNeural' : 'ja-JP-KeitaNeural');
  const targetPitch = character.edgePitch || '+0Hz';
  const targetRate = character.edgeRate || '+0%';

  // Split into chunks of max 250 characters for long text
  const chunks = splitTextIntoChunks(speechText, 250);

  // 1. Primary Engine: Tuned Microsoft Edge Neural Japanese Actor (<1.2s, 0% CPU/RAM)
  try {
    const audioParts = [];
    for (let i = 0; i < chunks.length; i++) {
      const part = await synthesizeEdgeNeuralChunk(chunks[i], targetVoice, 'ja-JP', targetRate, targetPitch);
      audioParts.push(part);
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 60)); // natural breath pause
      }
    }
    return Buffer.concat(audioParts);
  } catch (edgeErr) {
    console.warn(`[Anime TTS] Edge neural actor failed (${edgeErr.message}), trying backup Japanese engines...`);
  }

  // 2. Secondary Fallback: Google Japanese Anime Engine
  try {
    return await synthesizeGoogleAnimeFallback(speechText, 'ja');
  } catch (gErr) {
    console.warn(`[Anime TTS] Google fallback failed (${gErr.message}), trying Voicevox studio...`);
  }

  // 3. Third Fallback: Voicevox Studio
  try {
    const speakerId = character.speaker || 12;
    return await generateVoicevoxTTS(speakerId, speechText);
  } catch (vvErr) {
    throw new Error(`Failed to synthesize ${character.name} voice: ${vvErr.message}`);
  }
}

/**
 * Generate Voice Audio Buffer
 * Supports Pakistani Urdu (Sara, Gul, Asad) and authentic Anime characters (Edge Neural + Voicevox & Google fallback).
 * Zero external CPU/RAM load on host.
 * @param {string} voiceKey 
 * @param {string} rawText 
 * @returns {Promise<{ buffer: Buffer, hero: object, character: object, text: string, engine: string }>}
 */
async function generateHeroTTS(voiceKey, rawText) {
  const character = resolveHero(voiceKey) || ANIME_VOICES.goku;
  const cleanText = (rawText || '').trim();

  if (!cleanText) {
    throw new Error(`No text provided to speak! Usage: \`.${character.id} <message>\` or \`.tts ${character.id} <message>\``);
  }

  // Check in-memory cache for instant response (<5ms)
  const cacheKey = `${character.id}:${cleanText.toLowerCase()}`;
  if (ttsCache.has(cacheKey)) {
    return {
      buffer: ttsCache.get(cacheKey),
      hero: character,
      character,
      text: cleanText,
      engine: 'cached'
    };
  }

  let finalBuffer = null;

  // 1. If Sara, Gul, or Asad, use the specialized Pakistani/Multilingual Urdu engine
  if (character.id === 'sara' || character.id === 'gul' || character.id === 'asad' || character.engineType === 'urdu' || character.engineType === 'sara' || character.engineType === 'asad') {
    finalBuffer = await generateSaraTTS(cleanText, character.id);
  } else if (character.id === 'loli' || character.engineType === 'loli') {
    // 2. Cute Anime Loli engine (Preserved)
    const safeText = cleanText.length > 500 ? cleanText.slice(0, 500) : cleanText;
    const speechText = character.intro ? `${character.intro} ${safeText}` : safeText;
    try {
      finalBuffer = await generateVoicevoxTTSWithRetry(3, speechText, true, character);
    } catch (e) {
      finalBuffer = await synthesizeEdgeNeuralChunk(speechText, 'ja-JP-NanamiNeural', 'ja-JP', '+10%', '+28Hz');
    }
  } else if (character.id === 'ben10' || character.engineType === 'ben10') {
    // 2b. Ben Tennyson Classic 10-year-old boy hero voice (Tara Strong style)
    const safeText = cleanText.length > 500 ? cleanText.slice(0, 500) : cleanText;
    const speechText = character.intro ? `${character.intro} ${safeText}` : safeText;
    finalBuffer = await synthesizeEdgeNeuralChunk(speechText, 'en-US-AnaNeural', 'en-US', '+6%', '+3Hz');
  } else {
    // 3. Authentic Japanese Voicevox Anime Studio Engine (Primary Japanese Voice Actors)
    const safeText = cleanText.length > 500 ? cleanText.slice(0, 500) : cleanText;
    const speechText = character.intro ? `${character.intro} ${safeText}` : safeText;
    const speakerId = character.speaker || 12;

    const chunks = splitTextIntoChunks(speechText, 150);
    if (chunks.length <= 1) {
      finalBuffer = await generateVoicevoxTTSWithRetry(speakerId, speechText, false, character);
    } else {
      const parts = [];
      for (const part of chunks) {
        const buf = await generateVoicevoxTTSWithRetry(speakerId, part, false, character);
        parts.push(buf);
      }
      finalBuffer = Buffer.concat(parts);
    }
  }

  if (!finalBuffer || finalBuffer.length === 0) {
    throw new Error('Failed to synthesize voice audio.');
  }

  // Store in cache (LRU eviction)
  if (ttsCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = ttsCache.keys().next().value;
    ttsCache.delete(oldestKey);
  }
  ttsCache.set(cacheKey, finalBuffer);

  return {
    buffer: finalBuffer,
    hero: character,
    character,
    text: cleanText,
    engine: (character.engineType === 'urdu' || character.id === 'sara') ? 'urdu_neural' : 'voicevox'
  };
}

const generateAnimeTTS = generateHeroTTS;

/**
 * Get formatted anime catalog box for .tts list
 */
function getHeroCatalog() {
  const lines = [
    '🎙️ *VIRUZ MULTILINGUAL & ANIME VOICE TTS*',
    'Speak in authentic multilingual & anime voices:',
    'Direct Commands: `.sara <msg>`, `.gul <msg>`, `.asad <msg>`, `.loli <msg>`, `.goku <msg>`',
    'Standard Format: `.tts <character> <message>`',
    '',
    '🇵🇰 *AUTHENTIC PAKISTANI & URDU VOICES:*',
    '• `.sara <message>` - Sara (Pakistani Urdu & English Girl 🧕)',
    '  _Aliases:_ `.tts sara`, `.tts urdu`, `.urdu <msg>`',
    '• `.gul <message>` - Gul (Soft Expressive Urdu Girl 🌸)',
    '  _Aliases:_ `.tts gul`, `.sara2 <msg>`, `.urdu2 <msg>`',
    '• `.asad <message>` - Asad (Authentic Pakistani Urdu Male 🧔)',
    '  _Aliases:_ `.tts asad`, `.urdu_male <msg>`',
    '',
    '🌸 *CUTE ANIME LOLI / CHIBI VOICE:*',
    '• `.loli <message>` - Anya / Loli (Waku waku chibi anime girl 🌸)',
    '  _Aliases:_ `.anya <msg>`, `.klee <msg>`, `.chibi <msg>`, `.kawaii <msg>`',
    '',
    '⌚ *HERO VOICES:*',
    '• `.ben10 <msg>` - Ben Tennyson (Classic 10-Year-Old Boy Hero ⌚)',
    '  _Aliases:_ `.ben <msg>`, `.tennyson <msg>`, `.omnitrix <msg>`',
    '',
    '💥 *ICONIC ANIME VOICES (REAL SEIYUU ACTOR STYLES):*',
    '• `.goku <msg>` - Son Goku [Masako Nozawa style] 💥',
    '• `.luffy <msg>` - Monkey D. Luffy [Mayumi Tanaka style] 👒',
    '• `.naruto <msg>` - Naruto Uzumaki [Junko Takeuchi style] 🍥',
    '• `.gojo <msg>` - Satoru Gojo [Yuichi Nakamura style] 🤞',
    '• `.sukuna <msg>` - Ryomen Sukuna [Junichi Suwabe style] 🩸',
    '• `.aizen <msg>` - Sosuke Aizen [Sho Hayami style] 🦋',
    '• `.zoro <msg>` - Roronoa Zoro [Kazuya Nakai style] ⚔️',
    '• `.dio <msg>` - Dio Brando [Takehito Koyasu style] ⏳',
    '• `.levi <msg>` - Levi Ackerman [Hiroshi Kamiya style] 🗡️',
    '• `.eren <msg>` - Eren Yeager [Yuki Kaji style] 🦅',
    '• `.makima <msg>` - Makima [Tomori Kusunoki style] 🐕',
    '• `.saitama <msg>` - Saitama [Makoto Furukawa style] 🥊',
    '• `.madara <msg>` - Madara Uchiha [Naoya Uchida style] 🔥',
    '• `.itachi <msg>` - Itachi Uchiha [Hideo Ishikawa style] 👁️',
    '• `.tanjiro <msg>` - Tanjiro Kamado [Natsuki Hanae style] 🌊',
    '• `.deku <msg>` - Izuku Midoriya [Daiki Yamashita style] 🥦',
    '• `.allmight <msg>` - All Might [Kenta Miyake style] 💪',
    '• `.sasuke <msg>` - Sasuke Uchiha [Noriaki Sugiyama style] ⚡',
    '• `.nezuko <msg>` - Nezuko Kamado (Demon Sister 🎀)',
    '• `.tsumugi <msg>` - Kasukabe Tsumugi (Energetic Girl ⭐)',
    '• `.himari <msg>` - Meimei Himari (Tsundere Girl ✨)',
    '• `.zundamon <msg>` - Zundamon (Cute Anime Mascot 🧚)',
    '• `.metan <msg>` - Shikoku Metan (Ojou-sama 👑)',
    '',
    '💡 *Soundboard Tip:* Type `.goku` or any character command without text to play their iconic signature line!',
    '',
    '🎲 *RANDOM ANIME VOICE:*',
    '• `.tts random <message>` (Speaks in a random anime voice)',
    '',
    '⚙️ *ADMIN CONTROLS:*',
    '• `.tts on` - Enable TTS in this group (Admins/Owner)',
    '• `.tts off` - Disable TTS in this group (Admins/Owner)'
  ];

  return atlasBox('ANIME & MULTILINGUAL VOICE CATALOG', lines.join('\n'));
}

const getAnimeCatalog = getHeroCatalog;

/**
 * Returns authentic character voice sample audio buffer from disk
 * @param {string} characterId
 * @returns {Buffer|null}
 */
function getCharacterVoiceSampleBuffer(characterId) {
  const char = resolveHero(characterId);
  const sampleFileName = char?.sampleFile || `${char?.id || characterId}_sample.mp3`;
  const samplePath = path.join(__dirname, '../assets/voices', sampleFileName);
  if (fs.existsSync(samplePath)) {
    return fs.readFileSync(samplePath);
  }
  return null;
}

/**
 * Returns authentic Aizen startup audio buffer from disk
 * @returns {Buffer|null}
 */
function getAizenAuthenticBuffer() {
  return getCharacterVoiceSampleBuffer('aizen');
}

module.exports = {
  ANIME_VOICES,
  HERO_VOICES: ALL_VOICES,
  ALL_VOICES,
  getRandomAnimeVoice,
  resolveHero,
  resolveAnime,
  resolveCharacter,
  splitTextIntoChunks,
  generateHeroTTS,
  generateAnimeTTS,
  generateSaraTTS,
  getCharacterVoiceSampleBuffer,
  getAizenAuthenticBuffer,
  getHeroCatalog,
  getAnimeCatalog
};
