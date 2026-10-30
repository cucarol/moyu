// Vendored from the CUCAI kit (CUCAI/kit/tools/dididudu/dididudu.js) by scripts/sync-dididudu.mjs:
// edit it there, then sync. Not by hand here.
// dididudu: a character's babble voice, animalese after the little villagers of cosy
// life-sims. Text in; a run of short pitched blips out, one per syllable, with each blip's
// time, length and loudness (for a mouth, captions). The source of truth is
// CUCAI/kit/tools/dididudu/dididudu.js; projects that ship keep a copy
// (moyu: web/play/dididudu.js, made by its scripts/sync-dididudu.mjs).
//
// Works on any AudioContext: the speakers in a page, an OfflineAudioContext a renderer
// steps, or node-web-audio-api's in Node (cli.mjs renders WAV + JSON that way).
//
//   import { loadPinyin, speak, babble, render, VOICES } from './dididudu.js';
//   await loadPinyin(new URL('pinyin-pro/dist/index.mjs', import.meta.url).href);
//   speak(ctx, '等打包的时候', { voice: 'clawd', mood: 'happy', onBlip: (b) => mouth(b) });
//   const { samples, blips } = await render('Hello there', { voice: 'ds' });
//
// How it reads: each Han character is one blip, its pinyin final picking the vowel (a
// buzzy pulse through three formants, gliding through diphthongs), its tone shaping the
// pitch, its initial adding a tick or a hiss. Latin words babble one blip per vowel group
// (accents folded away, Cyrillic transliterated first), kana one per mora, hangul one per
// syllable, digits as their Chinese readings. Punctuation gives pauses; ！ lifts the last
// blip and ？ makes it rise. The script is read from the characters, so any language mix
// works in one line. A line's randomness comes from its text (and a seed), so it always
// babbles the same way.
//
// Started as a port of the user's own CUCAI tool na-ai-ne/tools/ep02/animalese.py to live
// Web Audio for moyu (2026-10), which grew the moods, Clawd's voice and the languages.

// Pinyin comes from pinyin-pro (MIT, 3.29.4), handed in with setPinyin(lib) or fetched
// with loadPinyin(url). Until it arrives (or if it never does) characters get a vowel and
// tone hashed from their code point: still babble, just not their own.
let pinyinLib = null;
let pinyinLoading = null;
/** Hand the voice pinyin-pro's module (its exports: pinyin()). */
export function setPinyin(lib) {
  pinyinLib = lib?.pinyin ? lib : null;
  return pinyinLib;
}
export const hasPinyin = () => !!pinyinLib;
/** Import pinyin-pro from url once; resolves to it, or null if it can't be had. */
export function loadPinyin(url) {
  pinyinLoading ??= import(url)
    .then(setPinyin)
    .catch(() => null);
  return pinyinLoading;
}

// vowel formants (Hz), adult-female-ish; each voice scales them (m: a nasal's murmur,
// where an -n or -ng syllable ends)
const VOW = {
  a: [850, 1220, 2810], o: [570, 840, 2410], e: [540, 1100, 2500],
  i: [310, 2790, 3310], u: [370, 950, 2670], v: [300, 2100, 2700],
  r: [500, 1400, 1700], m: [260, 1050, 2450],
};
// pinyin final -> vowel path
const FIN = {
  a: 'a', o: 'o', e: 'e', i: 'i', u: 'u', v: 'v', er: 'r',
  ai: 'ai', ei: 'ei', ao: 'au', ou: 'ou', an: 'a', en: 'e',
  ang: 'a', eng: 'e', ong: 'ou', ia: 'ia', ie: 'ie', iao: 'iau',
  iu: 'iu', iou: 'iu', ian: 'ie', in: 'i', iang: 'ia', ing: 'i',
  iong: 'iu', ua: 'ua', uo: 'uo', uai: 'uai', ui: 'ui', uei: 'ui',
  uan: 'ua', un: 'ue', uen: 'ue', uang: 'ua', ueng: 'ue',
  ve: 've', ue: 've', van: 've', vn: 'v',
};
const PLOS = new Set(['b', 'd', 'g', 'p', 't', 'k']);
const FRIC = new Set(['f', 'h', 'x', 's', 'sh']);
const AFFR = new Set(['j', 'q', 'z', 'c', 'zh', 'ch']);
const NASAL = new Set(['m', 'n', 'l', 'r']);
const PAUSE = { '，': 0.12, ',': 0.12, '、': 0.1, '；': 0.16, ';': 0.16, '：': 0.12, ':': 0.12, '。': 0.2, '.': 0.2, '！': 0.2, '!': 0.2, '？': 0.2, '?': 0.2, '…': 0.17, ' ': 0.06, '\u3000': 0.06, '・': 0.06, '¿': 0.1, '¡': 0.1, '\n': 0.2 };

// f0 Hz, formant scale, blip s, gap s, jitter semitones, phrase fall st, tone glide st,
// brightness; hold (0 to 1): how far a blip holds its vowel and cuts off rather than dying
// away like a pluck; chirp: the semitones each blip slides up into its pitch at the start;
// uncanny: a second pulse a third of a semitone sharp, its share. ds, cuca and boss are
// the first tool's voices as tuned for 那 AI 呢 ep02.
export const VOICES = {
  ds: { f0: 430, fs: 1.18, dur: 0.085, gap: 0.022, jit: 1.6, fall: -2.5, tone: 3.0, bright: 0.9, hold: 0, chirp: 0, uncanny: 0 },
  cuca: { f0: 560, fs: 1.32, dur: 0.07, gap: 0.016, jit: 2.4, fall: -1.0, tone: 3.5, bright: 1.0, hold: 0, chirp: 0, uncanny: 0 },
  boss: { f0: 170, fs: 0.98, dur: 0.06, gap: 0.01, jit: 0.8, fall: -1.5, tone: 2.0, bright: 0.7, hold: 0, chirp: 0, uncanny: 0 },
  // Clawd (moyu's agent): a small creature's chatter, quick and high, each blip holding
  // its vowel and cut off clean with a little chirp up into it, its pitch skipping widely
  // from blip to blip; a faint second pulse keeps a little of its old uncanny beat
  clawd: { f0: 520, fs: 1.3, dur: 0.066, gap: 0.013, jit: 2.6, fall: -2.0, tone: 3.2, bright: 1.0, uncanny: 0.1, hold: 0.7, chirp: 1.5 },
};
/**
 * A voice from a VOICES name, or a plain object of its fields over a preset's
 * ({ like: 'ds', f0: 300 }; clawd when like is left out).
 */
export function voiceOf(voice = 'clawd') {
  if (typeof voice === 'string') {
    if (!VOICES[voice]) throw new Error(`dididudu: no voice "${voice}" (${Object.keys(VOICES).join(', ')})`);
    return VOICES[voice];
  }
  const { like = 'clawd', ...fields } = voice;
  return { ...voiceOf(like), ...fields };
}

// How a mood says a line (a character's faces): pitch st, pace (blip length x), loudness
// x, range (the pitch's spread x), fall (st added to the voice's fall over the line), end
// (st the last blip before each pause glides by), drawl (that blip's length x, more),
// bright (+)
export const MOODS = {
  happy: { pitch: 2, pace: 0.92, loud: 1.05, range: 1.25, fall: 1.5, end: 2, bright: 0.1 },
  wide: { pitch: 4, pace: 0.95, loud: 1.1, range: 1.5, fall: 2, end: 3, bright: 0.1 },
  smug: { pitch: -1, pace: 1.1, range: 0.9, fall: -1, end: -3, drawl: 1.6 },
  angry: { pitch: 1, pace: 0.86, loud: 1.25, range: 0.7, fall: -1.5, end: -2, bright: 0.25 },
  flat: { pitch: -1.5, pace: 1.05, loud: 0.85, range: 0.35, fall: 1 },
  sad: { pitch: -3, pace: 1.25, loud: 0.8, range: 0.6, fall: -2, end: -2, bright: -0.2 },
  squint: { pitch: -1, pace: 1.15, loud: 0.9, range: 0.7, fall: 1, end: 2 },
  shut: { pitch: -0.5, pace: 1.1, loud: 0.85, range: 0.8, end: -1 },
  sleep: { pitch: -3, pace: 1.4, loud: 0.6, range: 0.4, fall: -1, end: -2, bright: -0.3 },
};
const CALM = { pitch: 0, pace: 1, loud: 1, range: 1, fall: 0, end: 0, drawl: 1, bright: 0 };

// A line's own dice, from its text (and a seed, for another take): the same line always
// babbles the same way (renders, and music cut to a line, need that).
function seeded(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let x = Math.imul(h ^ (h >>> 15), 1 | h);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const HAN = /[一-鿿]/;
const LATIN = /[A-Za-z]/;
// digits read the Chinese way: [final, initial, tone]
const DIGITS = ['ing,l,2', 'i,,1', 'er,,4', 'an,s,1', 'i,s,4', 'u,,3', 'iu,l,4', 'i,q,1', 'a,b,1', 'iu,j,3'].map((d) => d.split(','));
const HASH_FINALS = ['a', 'o', 'e', 'i', 'u', 'ai', 'ei', 'ao', 'ou', 'ia', 'ie', 'ua', 'uo', 'an', 'ing'];
const HASH_INITIALS = ['', 'b', 'd', 'g', 'm', 'n', 'l', 's', 'sh', 'h', 'j', 'z'];

// Other scripts. Accented Latin letters lose their accents and Cyrillic becomes Latin
// letters, both then babbling as Latin words (é -> e, ß -> ss, я -> ya).
const CYR = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', і: 'i', ї: 'yi', є: 'ye', ґ: 'g',
};
const LIGATURES = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ł: 'l', þ: 'th', ð: 'd' };
function plainLatin(c) {
  const l = c.toLowerCase();
  if (CYR[l] !== undefined) return CYR[l];
  if (LIGATURES[l]) return LIGATURES[l];
  return /[\u00C0-\u024F\u1E00-\u1EFF]/.test(c) ? c.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : c;
}
// Kana, one blip a mora: hiragana (katakana is read as hiragana) -> [initial, vowel path]
const KANA = new Map();
const KANA_ROWS = { '': 'あいうえお', k: 'かきくけこ', g: 'がぎぐげご', s: 'さしすせそ', z: 'ざじずぜぞ', t: 'たちつてと', d: 'だぢづでど', n: 'なにぬねの', h: 'はひふへほ', b: 'ばびぶべぼ', p: 'ぱぴぷぺぽ', m: 'まみむめも', r: 'らりるれろ' };
for (const [ini, row] of Object.entries(KANA_ROWS)) [...row].forEach((k, i) => KANA.set(k, [ini, 'aiueo'[i]]));
for (const [k, ini] of [['し', 'sh'], ['じ', 'j'], ['ち', 'ch'], ['つ', 'c'], ['ぢ', 'j'], ['づ', 'z'], ['ふ', 'f']]) KANA.get(k)[0] = ini;
for (const [k, ini, path] of [['や', '', 'ia'], ['ゆ', '', 'iu'], ['よ', '', 'io'], ['わ', '', 'ua'], ['を', '', 'o'], ['ゔ', 'f', 'u']]) KANA.set(k, [ini, path]);
// the small ones change the mora before: き + ゃ = kya
const SMALL_KANA = { ゃ: 'ia', ゅ: 'iu', ょ: 'io', ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o', ゎ: 'ua' };
const KANA_RE = /[\u3041-\u3096\u30A1-\u30F6]/;
const hiragana = (c) => (c >= '\u30A1' ? String.fromCharCode(c.charCodeAt(0) - 0x60) : c);
// Hangul, one blip a syllable, from its code point: the initial gives the onset, the
// medial the vowel; a nasal final ends it on the nasal, any other clips it a little
const KO_INI = ['g', 'k', 'n', 'd', 't', 'r', 'm', 'b', 'p', 's', 's', '', 'j', 'j', 'ch', 'k', 't', 'p', 'h'];
const KO_MED = ['a', 'e', 'ia', 'ie', 'o', 'e', 'io', 'ie', 'o', 'ua', 'ue', 'ue', 'io', 'u', 'uo', 'ue', 'ui', 'iu', 'e', 'ei', 'i'];
const KO_NASAL = new Set([4, 5, 6, 10, 16, 21]); // ㄴ ㄵ ㄶ ㄻ ㅁ ㅇ
// the letters on their own (ㅋㅋㅋ): consonants with an e, vowels as themselves
const KO_JAMO = 'g k g n n n d t r r r r r r r r m b p b s s - j j ch k t p h'.split(' ').map((x) => (x === '-' ? '' : x));

const pathOf = (fin) => FIN[fin] ?? (VOW[fin?.[0]] ? fin[0] : 'e');
function latinOnset(cons) {
  if (/(sh|th)$/.test(cons)) return 'sh';
  if (/ch$/.test(cons)) return 'ch';
  if (/ph$/.test(cons)) return 'f';
  const c = cons.slice(-1);
  if (PLOS.has(c)) return c;
  if ('cq'.includes(c) && c) return 'k';
  if ('fhsxzv'.includes(c) && c) return FRIC.has(c) ? c : 's';
  if (c === 'j') return 'j';
  if (NASAL.has(c)) return c;
  return '';
}

// Text -> syllables { path, ini, tone, nasal, mark, src } and pauses { pause }; src: the
// [from, to) code points of the text it was read from; rnd: the line's dice.
function syllables(text, rnd = Math.random) {
  const chars = [];
  const from = []; // each read character's code point in text
  [...text].forEach((c, k) => {
    for (const x of plainLatin(c)) {
      chars.push(x);
      from.push(k);
    }
  });
  const han = chars.filter((c) => HAN.test(c)).join('');
  let py = null;
  if (pinyinLib && han) {
    const o = { type: 'array', v: true };
    py = {
      fin: pinyinLib.pinyin(han, { ...o, pattern: 'final', toneType: 'none' }),
      ini: pinyinLib.pinyin(han, { ...o, pattern: 'initial' }),
      tone: pinyinLib.pinyin(han, { ...o, pattern: 'num' }),
    };
  }
  const out = [];
  let h = 0;
  const lastSyl = () => [...out].reverse().find((s) => s.path);
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const src = [from[i], from[i] + 1];
    if (HAN.test(c)) {
      const fin = py ? py.fin[h] : HASH_FINALS[c.codePointAt(0) % HASH_FINALS.length];
      const nasal = /n$|ng$/.test(fin ?? '');
      if (py) out.push({ path: pathOf(fin), ini: py.ini[h] ?? '', tone: Number(py.tone[h]) || 5, nasal, han: true, src });
      else {
        const k = c.codePointAt(0);
        out.push({ path: pathOf(fin), ini: HASH_INITIALS[(k >> 4) % HASH_INITIALS.length], tone: 1 + (k % 5), nasal, han: true, src });
      }
      h++;
    } else if (LATIN.test(c)) {
      // a word: one blip per vowel group, its leading consonants as the onset
      let j = i;
      while (j < chars.length && /[A-Za-z']/.test(chars[j])) j++;
      const word = chars.slice(i, j).join('').toLowerCase().replace(/'/g, '');
      const wsrc = [from[i], from[j - 1] + 1];
      const groups = [...word.matchAll(/([^aeiouy]*)([aeiouy]+)/g)];
      if (groups.length) {
        groups.forEach(([, cons, vow], g) => {
          // (a word ending on n, m or ng: its last blip ends on the nasal; the stress on
          // the next to last vowel group, as Spanish, Portuguese and Russian have it and
          // German and English mostly do in two)
          const nasal = g === groups.length - 1 && /(n|m|ng)$/.test(word);
          const stress = groups.length > 1 && g === groups.length - 2;
          out.push({ path: vow.replace(/y/g, 'i').replace(/(.)\1+/g, '$1').slice(0, 3), ini: latinOnset(cons), tone: rnd() < 0.5 ? 5 : 1, nasal, stress, src: wsrc });
        });
      } else {
        // no vowels (HTTP, ctx): spell it, one blip a letter
        for (const l of word) out.push({ path: 'ei', ini: latinOnset(l), tone: 1, src: wsrc });
      }
      i = j - 1;
    } else if (KANA_RE.test(c)) {
      const k = hiragana(c);
      const prev = out[out.length - 1];
      if (SMALL_KANA[k]) {
        if (prev?.path) {
          prev.path = SMALL_KANA[k];
          prev.src = [prev.src[0], src[1]];
        } else out.push({ path: SMALL_KANA[k], ini: '', tone: 5, lang: 'ja', src });
      } else if (k === 'っ') out.push({ pause: 0.05 }); // a doubled consonant: a catch
      else if (k === 'ん') out.push({ path: 'e', ini: 'n', tone: 5, nasal: true, short: true, lang: 'ja', src });
      else {
        const [ini, path] = KANA.get(k) ?? ['', 'a'];
        out.push({ path, ini, tone: 5, lang: 'ja', src });
      }
    } else if ('ー～〜'.includes(c)) {
      // a long vowel: the last blip held longer
      const s = lastSyl();
      if (s) s.long = (s.long ?? 1) + 0.6;
    } else if (c >= '\uAC00' && c <= '\uD7A3') {
      const k = c.charCodeAt(0) - 0xac00;
      const fin = k % 28;
      out.push({ path: KO_MED[Math.floor(k / 28) % 21], ini: KO_INI[Math.floor(k / 588)], tone: 5, nasal: KO_NASAL.has(fin), clip: fin > 0 && !KO_NASAL.has(fin), lang: 'ko', src });
    } else if (c >= '\u3131' && c <= '\u3163') {
      const k = c.charCodeAt(0) - 0x3131;
      out.push(k < 30 ? { path: 'e', ini: KO_JAMO[k], tone: 5, short: true, lang: 'ko', src } : { path: KO_MED[k - 30], ini: '', tone: 5, lang: 'ko', src });
    } else if (/[0-9]/.test(c)) {
      const [fin, ini, tone] = DIGITS[Number(c)];
      out.push({ path: pathOf(fin), ini, tone: Number(tone), src });
    } else if ('！!'.includes(c)) {
      const s = lastSyl();
      if (s) s.mark = '!';
      out.push({ pause: PAUSE[c] });
    } else if ('？?'.includes(c)) {
      const s = lastSyl();
      if (s) s.mark = '?';
      out.push({ pause: PAUSE[c] });
    } else if (PAUSE[c] !== undefined) out.push({ pause: PAUSE[c] });
  }
  // third tones: in a run of them, all but the last are said as second tones (pinyin-pro
  // already turns 一 and 不); a third tone with more to come in the phrase is a half third,
  // low and falling, not dipping and rising again
  for (let i = 0; i < out.length; i++) {
    const s = out[i];
    if (!s.han || s.tone !== 3) continue;
    const next = out[i + 1];
    if (next?.han && next.tone === 3) s.tone = 2;
    else if (next?.path) s.tone = 6;
  }
  // the last syllable before each punctuation mark (not a space between words), and the
  // line's last, end a phrase
  for (let i = 0; i < out.length; i++) {
    if (!out[i].path) continue;
    const j = out.findIndex((x, k) => k > i && (x.path || x.pause >= 0.1));
    if (j < 0 || !out[j].path) out[i].final = true;
  }
  return out;
}

/** For checking: a line's syllables as the voice reads them (no pauses: .path set). */
export const readLine = (text) => syllables(text);

const waves = new WeakMap(); // ctx -> bright -> PeriodicWave
function pulse(ctx, bright) {
  if (!waves.has(ctx)) waves.set(ctx, new Map());
  const m = waves.get(ctx);
  if (!m.has(bright)) {
    // harmonics falling as 1/k^(1.25 - 0.35 bright), up to about 7 kHz at the voices' pitch
    const n = 14;
    const real = new Float32Array(n + 1);
    const imag = new Float32Array(n + 1);
    for (let k = 1; k <= n; k++) imag[k] = 1 / k ** (1.25 - 0.35 * bright);
    m.set(bright, ctx.createPeriodicWave(real, imag));
  }
  return m.get(bright);
}

// the consonants' noise: 3 s of it per context, from fixed dice so renders repeat
const noises = new WeakMap();
function noiseOf(ctx) {
  if (!noises.has(ctx)) {
    const b = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = b.getChannelData(0);
    const rnd = seeded('dididudu noise');
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
    noises.set(ctx, b);
  }
  return noises.get(ctx);
}
// a burst of filtered noise from `from` s into the noise
function hiss(E, t, { type, f, dur, a, gain, to, from }) {
  const { ctx } = E;
  const src = ctx.createBufferSource();
  src.buffer = E.noise ?? noiseOf(ctx);
  src.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.Q.value = 1;
  flt.frequency.setValueAtTime(f, t);
  const g = ctx.createGain();
  // (silent until t: a new gain starts at 1, and noise let through before its envelope
  // clicks)
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  src.connect(flt).connect(g).connect(to);
  src.start(t, from);
  src.stop(t + a + dur + 0.05);
}

// a consonant's hiss before the vowel (s), and whether it ticks on it
const leadOf = (ini) => (FRIC.has(ini) ? 0.018 : AFFR.has(ini) ? 0.01 : 0);
const ticks = (ini) => PLOS.has(ini) || AFFR.has(ini);

// One blip at t: pitch curve f0s over dur, formants along the vowel path (ending on a
// nasal's murmur, darker, if nasal), an onset; froms: where in the noise its consonant's
// hiss and tick start (the line's dice).
function blip(E, t, { dur, f0s, path, ini, loud, nasal, froms }, v) {
  const { ctx } = E;
  const out = ctx.createGain();
  out.connect(E.out);
  // consonant: a hiss before the vowel, or a soft tick on it
  let at = t;
  let k = 0;
  const lead = leadOf(ini);
  if (lead) {
    hiss(E, at, { type: 'highpass', f: 4200, dur: lead, a: 0.002, gain: 0.05 * loud, to: out, from: froms[k++] });
    at += lead;
  }
  if (ticks(ini)) hiss(E, at, { type: 'lowpass', f: 3500, dur: 0.004, a: 0.0005, gain: 0.08 * loud, to: out, from: froms[k++] });
  // the vowel: formants in parallel, sliding along the path
  const voiced = ctx.createGain();
  const N = 48;
  const env = new Float32Array(N);
  const hold = v.hold ?? 0;
  const rise = 0.006 - 0.002 * hold;
  // (a held blip has more in it: as loud as a plucked one, measured)
  const norm = 0.405 / ((1 - hold) * 0.405 + hold * 0.65);
  for (let i = 0; i < N; i++) {
    const s = (i / (N - 1)) * dur;
    // dying away like a pluck, or holding the vowel (sagging a little) to be cut off
    let e = (1 - hold) * Math.exp((-2.2 * s) / dur) + hold * (1 - (0.3 * s) / dur);
    if (s < rise) e *= s / rise;
    if (NASAL.has(ini) && s < 0.012) e *= 0.3 + (0.7 * s) / 0.012;
    if (s > dur - 0.012) e *= Math.max(0, (dur - s) / 0.012);
    env[i] = e * loud * norm;
  }
  voiced.gain.value = 0;
  voiced.gain.setValueCurveAtTime(env, at, dur);
  if (nasal) {
    // a nasal's close: the highs going as the mouth shuts
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(7000, at + dur * 0.55);
    lp.frequency.exponentialRampToValueAtTime(800, at + dur);
    voiced.connect(lp).connect(out);
  } else voiced.connect(out);
  // the source: the pulse, and for an uncanny voice a second one slightly sharp
  const src = ctx.createGain();
  for (const [detune, amt] of [[0, 1], ...(v.uncanny ? [[33, v.uncanny]] : [])]) {
    const o = ctx.createOscillator();
    o.setPeriodicWave(pulse(ctx, v.bright));
    o.frequency.value = f0s[0];
    o.frequency.setValueCurveAtTime(f0s, at, dur);
    o.detune.value = detune;
    const og = ctx.createGain();
    og.gain.value = amt;
    o.connect(og).connect(src);
    o.start(at);
    o.stop(at + dur + 0.02);
  }
  const steps = [...path].filter((p) => VOW[p] && p !== 'm');
  if (!steps.length) steps.push('e');
  // (a nasal's vowel takes the first 60% of the blip, then slides to the murmur)
  const span = nasal ? 0.6 : 1;
  [1, 0.7, 0.35].forEach((g, fi) => {
    const fq = (p) => VOW[p][fi] * v.fs;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = fq(steps[0]) / [90, 120, 180][fi];
    f.frequency.setValueAtTime(fq(steps[0]), at);
    steps.slice(1).forEach((p, i) => f.frequency.linearRampToValueAtTime(fq(p), at + (dur * span * (i + 1)) / steps.length));
    if (nasal) {
      f.frequency.setValueAtTime(fq(steps[steps.length - 1]), at + dur * span);
      f.frequency.linearRampToValueAtTime(fq('m'), at + dur);
    }
    const fg = ctx.createGain();
    fg.gain.value = g * 0.6;
    src.connect(f).connect(fg).connect(voiced);
  });
}

/**
 * How a line will be said, without saying it: { blips, secs, notes, voice }. Each blip
 * { i, at, dur, loud (0 to 1), text (what of the line it says), last } in seconds from the
 * line's start; secs its length. voice: a VOICES name or an object (voiceOf). opts: mood
 * (one of MOODS), seed (another take of the same line), maxSecs (no blips after this).
 * The line's dice come from its text and seed, so it always comes out the same.
 */
export function layout(text, voice = 'clawd', opts = {}) {
  const { maxSecs = Infinity, mood, seed } = typeof opts === 'number' ? { maxSecs: opts } : opts;
  const v = voiceOf(voice);
  const m = { ...CALM, ...MOODS[mood] };
  const rnd = seeded(seed === undefined || seed === null ? text : `${seed}\u0000${text}`);
  const r = (a, b) => a + rnd() * (b - a);
  const syl = syllables(text, rnd);
  const cps = [...text];
  const n = Math.max(1, syl.filter((s) => s.path).length);
  const vm = { ...v, bright: Math.round((v.bright + m.bright) * 20) / 20 };
  const blips = [];
  const notes = [];
  let at = 0.03;
  let hi = 0;
  for (const s of syl) {
    if (at > maxSecs) break;
    if (s.pause !== undefined) {
      at += s.pause;
      continue;
    }
    // a phrase's last syllable is drawn out, and glides by the mood's end
    const marked = s.mark ? 1.35 : s.final ? 1.45 * m.drawl : 1;
    // each language's lilt: Japanese even and a touch quicker, Japanese and Korean
    // flattish, a lift on a European word's stressed vowel group
    const lilt = { ja: { pace: 0.9, jit: 0.5 }, ko: { pace: 1, jit: 0.6 } }[s.lang] ?? { pace: 1, jit: 1 };
    const held = (s.long ?? 1) * (s.short ? 0.6 : 1) * (s.clip ? 0.8 : 1) * (s.stress ? 1.1 : 1);
    const dur = v.dur * m.pace * marked * lilt.pace * held * r(0.9, 1.1);
    let st = m.pitch + ((v.fall + m.fall) * hi) / n + r(-v.jit, v.jit) * m.range * lilt.jit;
    if (s.stress) st += 1.5;
    if (s.mark === '!') st += 3;
    const g = v.tone * (0.6 + 0.4 * m.range);
    const glide = {
      1: () => 0.3 * g,
      2: (x) => -0.4 * g + 0.9 * g * x,
      3: (x) => -0.5 * g * Math.sin(Math.PI * x),
      4: (x) => 0.6 * g - 1.1 * g * x,
      5: () => 0,
      6: (x) => -0.3 * g - 0.5 * g * x, // a half third
    }[s.tone] ?? (() => 0);
    const end = s.final && !s.mark ? m.end : 0;
    const chirp = v.chirp ?? 0;
    const f0s = new Float32Array(16);
    for (let i = 0; i < 16; i++) {
      const x = i / 15;
      const into = -chirp * Math.max(0, 1 - x / 0.2);
      f0s[i] = v.f0 * 2 ** ((st + glide(x) + into + end * x + (s.mark === '?' ? 5 * x ** 1.5 : 0)) / 12);
    }
    const loud = (s.mark === '!' ? 1.25 : 1) * (s.stress ? 1.1 : 1) * r(0.85, 1) * m.loud;
    const froms = [];
    if (leadOf(s.ini)) froms.push(rnd() * 2);
    if (ticks(s.ini)) froms.push(rnd() * 2);
    const len = leadOf(s.ini) + dur;
    notes.push({ at, dur, f0s, path: s.path, ini: s.ini, loud, nasal: s.nasal, froms });
    blips.push({ i: blips.length, at, dur: len, loud: Math.min(1, loud / 1.25), text: cps.slice(...s.src).join('') });
    at += len + v.gap * m.pace;
    hi++;
  }
  if (blips.length) blips[blips.length - 1].last = true;
  return { blips, secs: at + 0.05, notes, voice: vm };
}

/**
 * Say a line from t (s, on E.ctx's clock) into E.out: E is { ctx, out } (noise: an
 * AudioBuffer of noise for the consonants instead of the voice's own). voice and opts as
 * layout's. Returns layout's { blips, secs }, in seconds from t.
 */
export function babble(E, t, text, voice, opts = {}) {
  const { blips, secs, notes, voice: v } = layout(text, voice, opts);
  for (const note of notes) blip(E, t + note.at, note, v);
  return { blips, secs };
}

/**
 * Say a line now on a live AudioContext, into `to` (ctx.destination when left out).
 * opts: voice, mood, seed, maxSecs, onBlip(blip) at each blip's onset (for a mouth).
 * Returns { blips, secs, stop() }; stop() fades the line out quickly, without a click.
 */
export function speak(ctx, text, { voice = 'clawd', to = ctx.destination, onBlip, ...opts } = {}) {
  const out = ctx.createGain();
  out.connect(to);
  const t = ctx.currentTime + 0.02;
  const { blips, secs } = babble({ ctx, out }, t, text, voice, opts);
  const timers = onBlip ? blips.map((b) => setTimeout(() => onBlip(b), (t - ctx.currentTime + b.at) * 1000)) : [];
  return {
    blips,
    secs,
    stop() {
      timers.forEach(clearTimeout);
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.012);
      setTimeout(() => out.disconnect(), 200);
    },
  };
}

/**
 * Render a line offline: resolves to { samples (Float32Array, mono), sampleRate, blips,
 * secs }. opts: voice, mood, seed, maxSecs, sampleRate (48000), gain (1), and
 * OfflineAudioContext (the global one when left out; node-web-audio-api's in Node).
 */
export async function render(text, { sampleRate = 48000, gain = 1, OfflineAudioContext = globalThis.OfflineAudioContext, ...opts } = {}) {
  if (!OfflineAudioContext) throw new Error('dididudu: render needs an OfflineAudioContext');
  const { voice = 'clawd' } = opts;
  const len = Math.ceil((layout(text, voice, opts).secs + 0.1) * sampleRate);
  const ctx = new OfflineAudioContext(1, len, sampleRate);
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(ctx.destination);
  const { blips, secs } = babble({ ctx, out }, 0, text, voice, opts);
  const buf = await ctx.startRendering();
  return { samples: buf.getChannelData(0), sampleRate, blips, secs };
}
