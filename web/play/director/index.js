// Director mode (?director=<script>): a game played from a script, with no server. The
// script's moves go through a scripted stand-in for the server's game (roulette.js,
// blackjack.js, yacht.js here, each checked against the server's in
// test/director.test.mjs), and each state it makes goes into the page's own queue, as a
// WebSocket message would, so the room, the HUD and the avatar play it exactly as they
// play a real game. On top of the game the script moves the camera, cues the avatar,
// puts its own pictures on the scene's screens, calls the scene's hooks, changes the light,
// slows the scene's time, and times everything.
//
// A script is a module in scripts/ (?director=sample loads scripts/sample.js) whose default
// export is { game, lang, seats, hud, cam, light, bgm, ambience, sound, screens, pv, beats, tail,
// ...the game's own setup }. The whole format, every option: docs/director.md.
//
// Rendering (scripts/director/render.mjs) loads the page with &render=1: the director then
// waits for the renderer's start() instead of starting by itself, and says when it's done.
// The page's own sound plays into an offline context the clock steps along with the
// frames (sound() below), and the renderer takes it as a WAV.
import { renderSound, duckAll as duck } from '../audio.js';
import { lang } from '../i18n.js';
import { THREE } from '../stage.js';
import { ScriptedRoulette } from './roulette.js';
import { ScriptedBlackjack } from './blackjack.js';
import { ScriptedYacht } from './yacht.js';
import { createCamera, easeOf, film } from './camera.js';
import { screensOf, createScreens } from './screens.js';

const ENGINES = { roulette: ScriptedRoulette, blackjack: ScriptedBlackjack, yacht: ScriptedYacht };
const render = new URLSearchParams(location.search).get('render') === '1';
// the director's own timing is the film's: it goes on while a script has the scene slowed
const wait = film.wait;

// A text in the page's language: a plain string, or { 'zh-CN': '…', en: '…' } (falling back
// to the language without its region, then English, then the first given).
export const loc = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? (x[lang] ?? x[lang.split('-')[0]] ?? x.en ?? Object.values(x)[0]) : x);

// What the renderer reads: waiting (ready for start()), done, and when each beat began.
const D = (window.__director = { waiting: false, done: false, error: null, marks: [], start: null });

function fail(err) {
  D.error = String(err?.message ?? err);
  D.done = true;
  console.error('[director]', err);
  const box = document.createElement('pre');
  box.className = 'director-error';
  box.textContent = `director: ${D.error}`;
  Object.assign(box.style, { position: 'fixed', left: '12px', bottom: '12px', zIndex: 99, color: '#ff6b7a', background: '#000c', padding: '8px', font: '14px monospace', whiteSpace: 'pre-wrap' });
  document.body.append(box);
}

// ---- the sound, for a render ----
// The renderer's clock (scripts/director/clock.js) keeps one OfflineAudioContext for the
// page, moved on in step with the frames; the page's own sound plays into it at the levels
// the script asks for, and the renderer takes it as a WAV (__vt.sound.wav).
async function sound(opts) {
  const ctx = window.__vt?.sound?.ctx;
  if (ctx) await renderSound(ctx, opts);
}

// ---- the HUD ----
// 'full' (the page's own), 'bubble' (the agent's bubble and the toasts) or 'none'; or
// { mode, keep: [selectors], bubble: k } to keep more of it showing (e.g. Yacht's score card,
// '.pad') or draw the agent's bubble k times its size (a film's frame wants it bigger).
let hudCss = null;
function hudMode(hud = 'full') {
  const { mode = 'full', keep = [], bubble = 1 } = typeof hud === 'string' ? { mode: hud } : hud;
  if (!['full', 'bubble', 'none'].includes(mode)) throw new Error(`hud: full, bubble or none, not ${mode}`);
  hudCss ??= document.head.appendChild(document.createElement('style'));
  const not = (list) => (list.length ? list.map((s) => `:not(${s})`).join('') : '*');
  hudCss.textContent =
    mode === 'full'
      ? ''
      : mode === 'none'
        ? `.hud > ${not(keep)}, .rising { visibility: hidden !important; }`
        : `.hud > ${not(['#opp-bubble', '#toast', '.live-roulette', ...keep])}, .live-roulette > :not(.live-toasts):not(.live-banner) { visibility: hidden !important; }`;
  // scaled from its top left, so its tail stays on the agent's mouth
  if (bubble !== 1) hudCss.textContent += ` #opp-bubble { scale: ${bubble}; transform-origin: 0 0; white-space: nowrap; max-width: none; }`;
}

// The view follows the pointer on a real page; here a pointer that isn't there moves it.
function lookAt([x, y]) {
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: ((x + 1) / 2) * innerWidth, clientY: ((y + 1) / 2) * innerHeight }));
}

const EMOJI_ONLY = /^\p{Extended_Pictographic}[\p{Extended_Pictographic}‍️]*$/u;
// Your line, as you'd send it: an emoji from its button (it flies up from the bar), words
// typed into the chat box. The page logs it as it sends; the state brings it to the table.
function youSay(text) {
  const button = EMOJI_ONLY.test(text) && [...document.querySelectorAll('.emote')].find((b) => b.title === text);
  if (button) return button.click();
  const input = document.querySelector('#say');
  const form = document.querySelector('#say-form');
  if (!input || !form) return;
  input.value = text;
  form.requestSubmit();
}

const scriptUrl = (name) => (/[/.]/.test(name) ? new URL(name, location.href).href : new URL(`./scripts/${name}.js`, import.meta.url).href);
export async function load(name) {
  return (await import(scriptUrl(name))).default;
}

// The time a line stays up, as the bubble and the avatar's talking layer reckon it.
const readMs = (text) => Math.min(4000, 600 + [...text].length * 120);

export async function run(name, ctx) {
  const { stage, room, opp, push, idle, before } = ctx;
  try {
    const script = await load(name);
    const game = script.game ?? 'roulette';
    if (game !== ctx.game) throw new Error(`the script plays ${game}, the page ${ctx.game}`);
    const Engine = ENGINES[game];
    const seats = script.seats && { you: loc(script.seats.you), opp: loc(script.seats.opp) };
    const engine = new Engine({ ...script, seats });
    hudMode(script.hud);
    if (render && script.sound !== false) await sound({ bgm: script.bgm, ambience: script.ambience });
    const screenMeshes = screensOf(stage, ctx);
    const cam = createCamera(stage, room, opp, game, screenMeshes);
    const screens = createScreens(stage, screenMeshes, scriptUrl(name));
    // scene hooks: what the scene offers (scene.pv, room.pv, each called as its owner's
    // method) and the script's own, called with this = { THREE, stage, scene, casino, room,
    // opp } (one object for the run, so a hook can keep what it made on it)
    const self = { THREE, stage, scene: ctx.scene, casino: ctx.casino, room, opp };
    const hooks = {};
    for (const reg of [ctx.scene?.pv, room?.pv]) for (const k of Object.keys(reg ?? {})) hooks[k] = (...a) => reg[k](...a);
    for (const [k, f] of Object.entries(script.pv ?? {})) hooks[k] = (...a) => f.apply(self, a);
    if (script.cam) await cam.move(script.cam);
    if (script.light) await setLight(ctx, script.light, 0);
    for (const [n, spec] of Object.entries({ ...(script.crt && { crt: script.crt }), ...script.screens })) screens.show(n, spec);
    // the table as the script opens it, laid out at once like a page joining a game
    push(engine.state());
    await idle();
    if (render) {
      D.waiting = true;
      await new Promise((r) => (D.start = r));
      D.waiting = false;
    } else await wait(800);
    const t0 = film.now();
    D.t0 = t0;
    const now = () => film.now() - t0;
    for (const [i, b] of (script.beats ?? []).entries()) {
      const isMove = Engine.isMove(b);
      const who = b.who ?? 'opp';
      const line = b.say !== undefined ? loc(b.say) : b.emote;
      const after = b.after ?? (isMove ? (who === 'opp' ? 900 : 500) : 0);
      if (after) await wait(after);
      if (b.at !== undefined && now() < b.at) await wait(b.at - now());
      D.marks.push({ beat: i, t: Math.round(now()) });
      // what runs alongside the beat's line or move, or on its own until it's done
      const along = [];
      const own = !isMove && line === undefined && !b.alongside;
      const ms = b.ms ?? (b.to !== undefined ? Math.max(0, b.to - now()) : 0);
      if (b.timeScale !== undefined) timeScale(b);
      if (b.cam !== undefined || b.orbit) along.push(cam.move(b.cam, { ms, ease: b.ease, from: b.from, via: b.via, orbit: b.orbit }));
      if (b.look) {
        lookAt(b.look);
        if (ms && b.cam === undefined) along.push(wait(ms));
      }
      if (b.hud !== undefined) hudMode(b.hud);
      if (b.avatar) opp.setState?.(b.avatar, b.detail ?? {});
      if (b.light !== undefined) along.push(setLight(ctx, b.light, ms, b.ease));
      if (b.crt !== undefined) b.crt ? screens.show('crt', b.crt) : screens.hide('crt');
      if (b.screen !== undefined) b.screen.off ? screens.hide(b.screen.name) : screens.show(b.screen.name, b.screen);
      if (b.scene !== undefined) {
        const fn = hooks[b.scene];
        if (typeof fn !== 'function') throw new Error(`no scene hook '${b.scene}'; this scene has ${Object.keys(hooks).join(', ') || 'none'}`);
        if (b.tween) along.push(tween(stage, ms, b.ease, (k) => fn(b.tween[0] + (b.tween[1] - b.tween[0]) * k, ...(b.args ?? []))));
        else fn(...(b.args ?? []));
      }
      if (own) await Promise.all(along);
      if (line !== undefined) {
        if (who === 'you') youSay(line);
        engine.say(who, line, b.mood);
      }
      if (isMove) {
        await before?.(b);
        engine.move(b);
      }
      if (line !== undefined || isMove) {
        push(engine.state());
        // alongside: the next beats go on while the room plays it out (a roll to freeze mid-air)
        if (!b.alongside) {
          await idle();
          // a line alone is given time to be read
          if (!isMove && line !== undefined) await wait(b.hold ?? (EMOJI_ONLY.test(line) ? 1200 : readMs(line)));
        }
      }
      if (b.wait) await wait(b.wait);
    }
    await wait(script.tail ?? 1500);
    D.length = Math.round(now());
    D.done = true;
  } catch (err) {
    fail(err);
  }
}

// A value eased from 0 to 1 over ms of film time, handed to fn every frame.
function tween(stage, ms, ease, fn) {
  const e = easeOf(ease ?? 'linear');
  const t0 = film.now();
  fn(e(ms ? 0 : 1));
  if (!ms) return Promise.resolve();
  return new Promise((done) => {
    const stop = stage.onFrame(() => {
      const k = Math.min(1, (film.now() - t0) / ms);
      fn(e(k));
      if (k >= 1) {
        stop();
        done();
      }
    });
  });
}

// The scene's speed (bullet time): { timeScale: k, ms (easing to it), for (held this long,
// then back to 1 over back ms), duck (the sound's level meanwhile, 0 to 1) }. The renderer's
// clock only: a page in a browser plays on at its own speed.
function timeScale(b) {
  const vt = window.__vt;
  if (!vt?.setScale) return console.warn('[director] timeScale: only when rendering');
  vt.setScale(b.timeScale, b.ms ?? 0);
  if (b.duck !== undefined) duck(b.timeScale < 1 ? b.duck : 1, (b.ms ?? 300) / 1000);
  if (b.for !== undefined)
    vt.film.setTimeout(() => {
      vt.setScale(1, b.back ?? 0);
      if (b.duck !== undefined) duck(1, (b.back ?? 300) / 1000);
    }, (b.ms ?? 0) + b.for);
}

// The raft's light (casino.js): 'dusk' or 'night', crossfading over ms.
async function setLight(ctx, light, ms, ease) {
  const set = ctx.casino?.setLight;
  if (!set) throw new Error(`light: only the raft (21 and Yacht) has a light to change`);
  await set(light, ms, ease && easeOf(ease));
}
