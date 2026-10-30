// The page's clock for frame-by-frame rendering (render.mjs injects this into every frame
// before any of the page's own scripts). Time stops: performance.now, Date, timers,
// requestAnimationFrame and CSS animations all run on a virtual clock that only moves when
// the renderer calls __vt.step(ms), and Math.random is seeded. So every frame is the same on
// every render, however slow the machine draws it.
//
// Same-origin iframes share the top page's clock: their timers, frames and animations are
// the top's, in one order. And the sound: with window.__vtSound set (the renderer sets it),
// every AudioContext any frame makes is one OfflineAudioContext the clock moves on in step,
// so sound lands on the frame it belongs to; <audio> elements play into it too (not
// <video>). __vt.sound.wav(from, to) hands the renderer what played between two clock times.
//
// Two times: the film's (__vt.now, what the renderer steps, the sound runs on) and the
// scene's (what the page sees: performance.now, Date, its timers, frames and animations).
// They run together until a script slows the scene (__vt.setScale(k, rampMs): bullet time,
// a freeze at 0); the director's camera and its own timing stay on the film's time
// (__vt.film.now, __vt.film.setTimeout).
(() => {
  // ---- an iframe: the top page's clock does it all ----
  let top = null;
  try {
    top = window !== window.top && window.top.__vt ? window.top.__vt : null;
  } catch {}
  if (top) {
    const mine = new Set();
    performance.now = () => top.sceneNow;
    const RealDate = Date;
    window.Date = class extends RealDate {
      constructor(...a) {
        super(...(a.length ? a : [top.dateNow()]));
      }
      static now() {
        return top.dateNow();
      }
    };
    Math.random = top.random;
    window.setTimeout = (fn, ms, ...args) => {
      const id = top.add(fn, ms, args, false);
      mine.add(id);
      return id;
    };
    window.setInterval = (fn, ms, ...args) => {
      const id = top.add(fn, ms, args, true);
      mine.add(id);
      return id;
    };
    window.clearTimeout = window.clearInterval = (id) => (mine.delete(id), top.clear(id));
    window.requestAnimationFrame = (fn) => top.raf(fn);
    window.cancelAnimationFrame = (id) => top.cancelRaf(id);
    top.docs.add(document);
    // gone with its frame: its timers stop, its animations stop counting
    addEventListener('pagehide', () => {
      for (const id of mine) top.clear(id);
      top.docs.delete(document);
    });
    if (top.sound) top.sound.patch(window);
    window.__vt = top;
    return;
  }

  let now = 0; // the film's ms since the page began
  let scene = 0; // the scene's: as now, unless slowed
  // the scene's speed: k now, easing linearly to `to` by the film's time `until`
  let scale = { k: 1, from: 1, to: 1, t0: 0, until: 0 };
  const scaleAt = (w) => (w >= scale.until ? scale.to : scale.from + (scale.to - scale.from) * ((w - scale.t0) / (scale.until - scale.t0)));
  const dateBase = Date.UTC(2026, 9, 30, 12, 0, 0);
  const realNow = performance.now.bind(performance);

  // a seeded random (mulberry32)
  let seed = 0x6d6f7975;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = random;

  performance.now = () => scene;
  // the CRTs' clocks too: a Date made without a time is the virtual one
  const RealDate = Date;
  window.Date = class extends RealDate {
    constructor(...a) {
      super(...(a.length ? a : [dateBase + scene]));
    }
    static now() {
      return dateBase + scene;
    }
  };

  // timers, fired in order of when they're due (then of when they were set); the page's
  // run on the scene's time, the director's (film) on the film's
  const timers = new Map();
  let nextId = 1;
  let seq = 0;
  const add = (fn, ms, args, every, film = false) => {
    const id = nextId++;
    const d = Math.max(0, Number(ms) || 0);
    timers.set(id, { at: (film ? now : scene) + d, film, seq: seq++, fn, args, every: every ? Math.max(1, d) : 0 });
    return id;
  };
  const clear = (id) => void timers.delete(id);
  window.setTimeout = (fn, ms, ...args) => add(fn, ms, args, false);
  window.setInterval = (fn, ms, ...args) => add(fn, ms, args, true);
  window.clearTimeout = window.clearInterval = clear;

  let rafs = new Map();
  let frameId = 1;
  const raf = (fn) => {
    const id = frameId++;
    rafs.set(id, fn);
    return id;
  };
  const cancelRaf = (id) => void rafs.delete(id);
  window.requestAnimationFrame = raf;
  window.cancelAnimationFrame = cancelRaf;

  // Let promises and anything they started settle: a real task, not a timer (no clamping).
  const channel = new MessageChannel();
  const waiting = [];
  channel.port1.onmessage = () => waiting.shift()?.();
  const settle = () => new Promise((r) => (waiting.push(r), channel.port2.postMessage(0)));

  const call = (fn, args) => {
    try {
      typeof fn === 'function' ? fn(...args) : (0, eval)(String(fn));
    } catch (err) {
      console.error(err);
    }
  };

  // CSS animations and transitions, the iframes' too: each held still and set to its age
  const docs = new Set([document]);
  const born = new WeakMap();
  function syncAnimations() {
    for (const doc of docs) {
      let list;
      try {
        list = doc.getAnimations();
      } catch {
        docs.delete(doc);
        continue;
      }
      for (const a of list) {
        if (!born.has(a)) {
          born.set(a, scene);
          a.pause();
        }
        a.currentTime = scene - born.get(a);
      }
    }
  }

  // ---- the sound: one offline context for every frame, moved on with the clock ----
  const RATE = 48000;
  const QUANTUM = 128 / RATE;
  function createSound({ maxSecs = 300 } = {}) {
    const ctx = new OfflineAudioContext(2, Math.round(RATE * maxSecs), RATE);
    ctx.suspend(QUANTUM);
    const done = ctx.startRendering();
    const at = (vt) => QUANTUM + vt / 1000; // the context's time for a clock time
    let open = true;
    const sync = async (vt) => {
      const t = Math.floor(at(vt) / QUANTUM) * QUANTUM;
      if (!open || t <= ctx.currentTime + 1e-9 || t >= maxSecs) return;
      const reached = ctx.suspend(t);
      ctx.resume();
      await reached;
    };
    // what a page gets for new AudioContext(): this context, with the clock in charge of
    // running it (resume, suspend and close do nothing)
    const proxy = new Proxy(ctx, {
      get(target, key) {
        if (key === 'resume' || key === 'suspend' || key === 'close') return () => Promise.resolve();
        if (key === 'state') return 'running';
        if (key === 'baseLatency' || key === 'outputLatency') return 0;
        const v = Reflect.get(target, key, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
      set(target, key, value) {
        return Reflect.set(target, key, value, target);
      },
    });
    function patch(win) {
      const Ctx = function () {
        return proxy;
      };
      win.AudioContext = win.webkitAudioContext = Ctx;
      // <audio>: its file decoded and played into the context from the moment play() is called
      const buffers = new Map();
      const playing = new WeakMap();
      const A = win.HTMLAudioElement?.prototype;
      if (!A) return;
      const realPlay = A.play;
      A.play = function () {
        const el = this;
        const src = el.currentSrc || el.src;
        if (!src) return realPlay.call(el);
        playing.get(el)?.stop();
        const start = ctx.currentTime;
        const offset = el.currentTime || 0;
        (buffers.get(src) ?? buffers.set(src, fetch(src).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b))).get(src)).then((buf) => {
          const node = ctx.createBufferSource();
          node.buffer = buf;
          node.loop = el.loop;
          node.playbackRate.value = el.playbackRate;
          const gain = ctx.createGain();
          gain.gain.value = el.muted ? 0 : el.volume;
          node.connect(gain).connect(ctx.destination);
          node.start(Math.max(start, ctx.currentTime), offset);
          playing.set(el, { stop: () => node.stop() });
        });
        el.muted = true; // the element itself stays quiet: the context has its sound
        return Promise.resolve();
      };
      const realPause = A.pause;
      A.pause = function () {
        playing.get(this)?.stop();
        playing.delete(this);
        return realPause.call(this);
      };
    }
    // the sound between two clock times, as 16-bit stereo WAV in base64 pieces small enough
    // to hand over CDP; it finishes the context, so it is the last thing asked
    async function wav(from, to) {
      open = false;
      ctx.resume();
      const buf = await done;
      const a = Math.max(0, Math.round(at(from) * RATE));
      const n = Math.max(0, Math.min(buf.length - a, Math.round(((to - from) / 1000) * RATE)));
      const L = buf.getChannelData(0).subarray(a, a + n);
      const R = buf.getChannelData(1).subarray(a, a + n);
      const out = new DataView(new ArrayBuffer(44 + n * 4));
      const str = (o, x) => [...x].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
      str(0, 'RIFF');
      out.setUint32(4, 36 + n * 4, true);
      str(8, 'WAVEfmt ');
      out.setUint32(16, 16, true);
      out.setUint16(20, 1, true);
      out.setUint16(22, 2, true);
      out.setUint32(24, RATE, true);
      out.setUint32(28, RATE * 4, true);
      out.setUint16(32, 4, true);
      out.setUint16(34, 16, true);
      str(36, 'data');
      out.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) {
        out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
        out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
      }
      const bytes = new Uint8Array(out.buffer);
      const pieces = [];
      for (let i = 0; i < bytes.length; i += 3 << 20) {
        let bin = '';
        const part = bytes.subarray(i, i + (3 << 20));
        for (let j = 0; j < part.length; j += 0x8000) bin += String.fromCharCode(...part.subarray(j, j + 0x8000));
        pieces.push(btoa(bin));
      }
      return pieces;
    }
    return { ctx, sync, patch, wav, RATE };
  }
  const sound = window.__vtSound ? createSound(window.__vtSound) : null;
  if (sound) sound.patch(window);

  window.__vt = {
    get now() {
      return now;
    },
    dateNow: () => dateBase + scene,
    random,
    add,
    clear,
    raf,
    cancelRaf,
    docs,
    sound,
    get sceneNow() {
      return scene;
    },
    // the scene's speed: k (0 freezes it) at once, or easing to it over rampMs of film time
    setScale(k, rampMs = 0) {
      const cur = scaleAt(now);
      scale = rampMs > 0 ? { from: cur, to: k, t0: now, until: now + rampMs } : { from: k, to: k, t0: now, until: now };
    },
    get scale() {
      return scaleAt(now);
    },
    // the director's timing, on the film's time whatever the scene does
    film: {
      get now() {
        return now;
      },
      setTimeout: (fn, ms, ...args) => add(fn, ms, args, false, true),
      clearTimeout: clear,
    },
    // move the clock on by ms of film time: due timers in order, then one animation frame
    // (unless frames is false: while the page loads, so how long loading takes changes
    // nothing). While the scene's speed eases, the step is cut into short pieces, each at
    // one speed.
    async step(ms, frames = true) {
      const until = now + ms;
      while (now < until || ms === 0) {
        const ramping = now < scale.until;
        const b = ramping ? Math.min(until, scale.until, now + 4) : until;
        const k = scaleAt((now + b) / 2);
        const s0 = scene;
        const w0 = now;
        // the film time each timer comes due in this piece
        const dueAt = (t) => (t.film ? t.at : k > 0 ? w0 + (t.at - s0) / k : Infinity);
        for (;;) {
          let due = null;
          let dueId = 0;
          let dueW = 0;
          for (const [id, t] of timers) {
            const w = dueAt(t);
            if (w <= b && (!due || w < dueW || (w === dueW && t.seq < due.seq))) (due = t), (dueId = id), (dueW = w);
          }
          if (!due) break;
          now = Math.max(now, dueW);
          scene = Math.max(scene, s0 + (now - w0) * k);
          if (sound) await sound.sync(now);
          if (due.every) {
            due.at += due.every;
            due.seq = seq++;
          } else timers.delete(dueId);
          call(due.fn, due.args);
          await settle();
        }
        now = b;
        scene = s0 + (b - w0) * k;
        if (ms === 0) break;
      }
      if (!frames) return now;
      if (sound) await sound.sync(now);
      const run = rafs;
      rafs = new Map();
      for (const fn of run.values()) call(fn, [scene]);
      await settle();
      syncAnimations();
      return now;
    },
    realNow,
  };
})();
