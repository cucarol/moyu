// The page's words in the player's language. Each language is a module in i18n/;
// English is the base, and a key a language lacks falls back to it.
// Choice order: ?lang= in the address, the one picked on the page, the browser's.
import en from './i18n/en.js';

export const LANGS = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
  ko: '한국어',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  'pt-BR': 'Português',
  ru: 'Русский',
};
const KEY = 'moyu.lang';

// A browser tag to one of ours: zh-HK reads Traditional, any pt reads pt-BR, en-GB reads en.
function match(tag) {
  if (!tag) return null;
  const t = String(tag).toLowerCase();
  const hit = Object.keys(LANGS).find((id) => id.toLowerCase() === t);
  if (hit) return hit;
  if (t.startsWith('zh')) return /hant|tw|hk|mo/.test(t) ? 'zh-TW' : 'zh-CN';
  if (t.startsWith('pt')) return 'pt-BR';
  return Object.keys(LANGS).find((id) => id === t.split('-')[0]) ?? null;
}

function stored() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export const lang = [new URLSearchParams(location.search).get('lang'), stored(), ...(navigator.languages ?? [navigator.language])].map(match).find(Boolean) ?? 'en';
document.documentElement.lang = lang;
// The pixel font in this language's build: the shared CJK characters are drawn its way
// (kanji, hanja, traditional forms). zh_hans covers Simplified, Latin and Cyrillic. Only
// this one file loads; the pages wait on document.fonts.load before drawing text.
const FONT = { ja: 'ja', ko: 'ko', 'zh-TW': 'zh_hant' }[lang] ?? 'zh_hans';
document.fonts.add(new FontFace('FusionPixel', `url(/web/play/fonts/fusion-pixel-12px-${FONT}.woff2) format('woff2')`, { display: 'block' }));

function merge(base, over) {
  if (!over || typeof base !== 'object' || Array.isArray(base)) return over ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = merge(base[k], v);
  return out;
}

// a language not shipped yet reads English rather than breaking the page
const dict = lang === 'en' ? en : merge(en, (await import(`./i18n/${lang}.js`).catch(() => null))?.default);

// t('ui.chat.send') or t('ui.score', { a: 1, b: 2 }) for 'Score {a}–{b}'. A missing key
// shows the key itself, so it is easy to spot.
export function t(key, vars) {
  let s = key.split('.').reduce((o, k) => o?.[k], dict);
  if (typeof s !== 'string') return key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

export const items = dict.items; // id -> { name, tip }
export const rules = dict.rules; // game -> { title, sections: [{ head, lines }] }

// Pick a language on the page: remembered for next time, applied by a reload.
export function setLang(id) {
  if (!LANGS[id]) return;
  try {
    localStorage.setItem(KEY, id);
  } catch {}
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  location.replace(url);
}
