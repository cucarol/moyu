# Director mode

A game played from a script instead of a server: roulette in the machine room, 21 and Yacht
on the raft. The script fixes the luck (shells, cards, dice) and every move, and on top of
the game it directs: lines and moods, the camera, the avatar, the HUD, the light, pictures
on the scene's screens, the scene's own hooks, and the scene's speed (bullet time). The
renderer then films it frame by frame, with its sound.

The game itself is never faked. Each move goes through a scripted copy of the server's game
(`web/play/director/{roulette,blackjack,yacht}.js`), which throws on anything the rules
don't allow; `test/director.test.mjs` checks each copy against the server's game. Each state
it makes goes into the page's own queue, exactly as a WebSocket message would, so the room,
the HUD and the avatar play it as they play a real game.

**Every time in a script is in milliseconds.**

## Quick start

Open a script in the browser (the moyu server serving `web/`, or any static server on it):

```
/play/?director=sample              web/play/director/scripts/sample.js
/play/?director=blackjack&lang=en   the same, in English
```

Render it to frames, a WAV and an mp4 (no server needed: the renderer serves `web/` itself):

```bash
node scripts/director/render.mjs sample --lang en
```

## Samples

| Script | Game | What it shows |
|---|---|---|
| `sample.js` | roulette | a whole short game's last load, lines in two languages, camera moves |
| `crt.js` | roulette | an HTML page on the left CRT, a push-in until its glass fills the frame, the pull-out, an avatar cue |
| `blackjack.js` | 21 | two hands; a canvas drawn each frame on the laptop, a camera path into it, a scene hook eased by a tween, the HUD off and on, an avatar cue |
| `yacht.js` | Yacht | a game opened part way, dusk going to night over 6 s |
| `bullet.js` | Yacht | bullet time: the dice stopped in mid-air, the camera round them and the agent, then they land |
| `../examples/frame.html` | (page) | a plain HTML page through the renderer: an iframe, CSS animation, Web Audio |

## The script

A script is an ES module whose default export is an object:

```js
export default {
  game: 'yacht',            // 'roulette' (default), 'blackjack', 'yacht'
  lang: 'en',               // the page's language, unless the URL or --lang says otherwise
  seats: { opp: 'Clawd' }, // names; each may be per language: { 'zh-CN': '小摸', en: 'Momo' }
  hud: 'full',              // 'full' | 'bubble' | 'none' | { mode, keep: [css selectors], bubble: scale }
  cam: 'table',             // the shot it opens on (default: the seat)
  light: 'night',           // the raft: 'dusk' (default) | 'night' | 0..1
  bgm: 'scene',             // rendering: 'scene' | a track name | 'off'
  ambience: 1,              // rendering: the ambience's level, 0..1
  sound: true,              // rendering: false films it silent
  screens: { crt: { html: 'page.html' } }, // pictures up from the start (Screens)
  crt: { html: 'page.html' },              // the same as screens.crt
  pv: { glow(k) { … } },    // the script's own scene hooks (Scene hooks)
  // ...the game's own setup (below)
  beats: [ … ],
  tail: 1500,               // ms held after the last beat
};
```

Paths in a script (an image, an HTML page) are relative to the script's own file.

### Each game's setup

**Roulette** (`docs/roulette.md` has the rules):

```js
rules: 'short',             // 'short' (the last round alone) | 'bo3'
first: 'opp',
start: {                    // a game joined part way (all optional)
  stage: 1, wins: { you: 0, opp: 0 }, round: 0,
  turn: 'opp', hp: { you: 2, opp: 1 },
  items: { you: ['jailbreak', 'cot'], opp: ['temp', 'mirage'] },
  shells: 'LBL',            // the shells left, chamber first ('L' live, 'B' blank)
  fired: 'BL',              // and those already out of the gun
  double: 'opp',            // who has 温度拉满 up
},
loads: [                    // each later load: its shells and what each seat is dealt
  { shells: 'LLBB', deal: { you: ['cot'], opp: ['cache'] } },
],
```

**21** (`docs/blackjack.md`):

```js
first: 'opp',
start: { round: 1, stacks: { you: 100, opp: 100 } },
hands: [
  // each seat's [up, hole], then the draws in play order (either seat's hits and doubles)
  { you: ['10S', '8H'], opp: ['6D', '5C'], draws: ['KH', '2C'] },
  // or the raw deck in draw order: first's up, other's up, first's hole, other's hole, draws
  { deck: ['QS', '7H', '9D', '9C', '8S'] },
],
```

**Yacht** (`docs/yacht.md`):

```js
first: 'you',
start: { sheets: { you: { ones: 3, … }, opp: { … } } },  // boxes already filled
turns: [[6, 2, 6, 4, 6], [2, 3, 4, 1, 6]],                // each turn's first roll, in order
```

When the script's cards, loads or turns run out, the game waits there (the table idles);
end on a beat that leaves it somewhere worth looking at.

## Beats

`beats` run in order. A beat may do several things at once; everything in one beat starts
together.

### Timing

| Key | |
|---|---|
| `after: ms` | wait this long first (a move waits 900 by default for the agent, 500 for you) |
| `at: ms` | and not before this time since the script started (film time) |
| `ms: ms` | how long the beat's camera move, light change, tween or look takes |
| `to: ms` | or until this time since the start, instead of `ms` |
| `wait: ms` | wait this long after it |
| `alongside: true` | don't wait for this beat: the next beats go on while it plays out |
| `hold: ms` | how long a line alone stays up (default: by its length) |

A beat with nothing but a camera move, light change or tween waits for it to finish, unless
`alongside`. A beat with a line or a move waits until the page has played it out.

### Moves

| Game | Moves |
|---|---|
| roulette | `{ who, use: item \| slot, pick, makes }` · `{ who, shoot: 'self' \| 'other', aim: ms }` |
| 21 | `{ who, act: 'hit' \| 'stand' \| 'double' \| 'call' \| 'fold', press: ms }` |
| Yacht | `{ who, keep: [die indexes], roll: [new dice] }` · `{ who, score: category }` |

`who` is `'opp'` (the agent, default) or `'you'`. Your moves are played the way a hand at the
page would: roulette's `aim` holds the gun on its target that long first; 21 and Yacht
point at the shoe, bell, chips, dice or score box for `press` ms (0 skips it). Roulette's
`pick` (越狱's choice) and `makes` (幻觉's two items) are as in `docs/roulette.md`; a bust
in 21 still ends with a stand. Yacht categories:
`ones twos threes fours fives sixes choice four house small large yacht`.

### Lines

| Key | |
|---|---|
| `say: 'text'` or `say: { 'zh-CN': '…', en: '…' }` | a line (the agent's bubble, or your chat) |
| `emote: '😭'` | an emote (an emoji alone in `say` does the same) |
| `mood` | the face it says it with: `happy smug flat angry wide sad squint shut sleep` |
| `who` | who says it (default the agent) |

A line and a move can share a beat: the agent says it as it moves. A per-language line falls
back to the language without its region (`zh`), then `en`, then the first one given.

### Camera

| Key | |
|---|---|
| `cam: shot` | move to a shot over `ms` (0 cuts); `'seat'` goes back to the seat |
| `cam: [shot, shot, …]` | one continuous move through each in turn, on a smooth curve |
| `via: [shots]` | pass through these on the way to `cam` |
| `from: shot` | start here instead of where the camera is |
| `ease` | `linear in out inOut sine expoIn expoOut expoInOut`, or a bezier `[x1, y1, x2, y2]` |
| `orbit: { center, radius, height, from, to, fov, look }` | round a point: `center` a point `[x, y, z]` or a shot's name (its `at`); `from`/`to` in degrees (0 looks from your side, positive goes round to the right); `radius`, `height` in metres |
| `look: [x, y]` | move the seat's view as a pointer at (-1..1, -1..1) would |

Moves run on film time, so they go on while the scene is slowed or stopped.

A shot is a name, `'seat'`, a pose `{ pos, at, fov, near, roll, breath }` (metres and
degrees; `near` raised cuts away what stands in front; `breath` 0..1 keeps the seat's slow
breathing), or a screen shot `{ screen: name, fit: 'cover' | 'contain' | k, fov }`: square onto
that screen's glass, `cover` filling the frame edge to edge (a 4:3 screen in a 16:9 frame
loses its top and bottom: keep what matters in the middle), `contain` all of it showing,
a number the glass's height over the frame's.

| Scene | Named shots |
|---|---|
| all | `agent` `face` `low` `wide` `tall` (portrait framing) |
| roulette | `gun` `table` `crt` (the left CRT, filling the frame) `crtNear` (a step back from it) |
| 21 | `table` `cards` `hand` `shoe` `laptop` |
| Yacht | `table` `tray` `dice` `air` (the dice where they are as the move starts, in flight too) `laptop` |

### Avatar, HUD, light

| Key | |
|---|---|
| `avatar: state, detail: {…}` | put the agent in any state (`web/play/avatar/core.js` STATES; `docs/avatar.md`), e.g. `{ avatar: 'thinking' }`, `{ avatar: 'emote', detail: { emoji: '😭' } }`. A state the avatar doesn't draw falls back to a nearby one. |
| `hud: mode` | change the HUD from here on (as the script's `hud`) |
| `light: 'dusk' \| 'night' \| 0..1` | the raft's light, crossfading over `ms` with `ease` |

Night on the raft: the afterglow gone, a blue-black sky and fog, the sea and island dark,
the raft's string lights, lantern and table lamp carrying the table. It changes light, fog
and the sky's colour only; layers that should come with the night (stars, boats' lights)
follow it through `scene.casino.onNight(fn)`, called with 0 (dusk) to 1 (night) now and on
every change. A page without a script stays at dusk.

### Screens

| Key | |
|---|---|
| `screen: { name, image \| draw \| html, size, crisp, fade, scan }` | put a picture on a named screen |
| `screen: { name, off: true }` | take it down (the screen's own picture comes back) |
| `crt: spec` / `crt: null` | the same for `'crt'` |

| Spec | |
|---|---|
| `image: 'file.png'` | a picture, covering the screen |
| `draw: (ctx, { t, w, h, lang }) => {}` | a canvas drawn every frame (`t`: ms since it went up, on the scene's clock) |
| `html: 'page.html?x=1'` | a same-origin page, in an iframe on the page's clock and sound; its address gets `lang=<the film's language>` unless it has one |
| `size: [w, h]` | its size in CSS pixels (default 640 × 480); match the glass's shape |
| `crisp: 'auto' \| true \| false` | see below |
| `fade: [a, b]` | `auto`'s crossfade, by the share of the frame the glass covers (default 0.3 to 0.75) |
| `scan: false` | no scanlines on the sharp copy |

An image or canvas goes onto the glass as a texture, so in the room it is lit, hazed and
dithered like everything else, and hidden by what stands in front. The room is drawn at a
few hundred rows, so as the glass fills the frame (a push-in) the same picture fades in on
top, sharp: a copy laid exactly over the glass in page pixels, every frame, with scanlines.
`crisp: true` shows the copy always, `false` never. An HTML page can only be the copy, so
nothing in the room covers it.

| Screen | Scene | Glass |
|---|---|---|
| `crt` | roulette | the left CRT; 4:3 (640 × 480). Pushed in with `cover` in a 16:9 frame, rows 60 to 420 of 480 show: keep what matters there |
| `laptop` | 21, Yacht | a laptop beside the felt; 1.61:1 (640 × 400). A stand-in for now; the raft's own takes its place when the scene lists one. |

**The screen interface**, for whoever builds a screen into a scene: the scene (the object a
game's `mount` builds, or its room) lists its screens as `screens: { <name>: mesh }`, where
`mesh` is a `THREE.Mesh` with a `PlaneGeometry` (width and height are the glass's, in metres;
the glass faces the mesh's local +z, its top is local +y) and a `MeshBasicMaterial`. The
director swaps `material.map` (and sets `material.color` white) while it shows its picture
and puts both back after. While it does, `mesh.userData.custom` is true: the owner should
stop drawing into its own texture. A name the scene lists replaces the stand-in of that name.

### Scene hooks

| Key | |
|---|---|
| `scene: name, args: […]` | call a hook once: `name(...args)` |
| `scene: name, tween: [a, b], ms, ease, args` | call it every frame over `ms` with a value eased from a to b: `name(v, ...args)` |

Hooks are looked up in the scene's `pv` registry (`scene.pv`, then the room's `pv`), then the
script's own `pv`. A script's hook is called with `this` = `{ THREE, stage, scene, casino,
room, opp }`, one object for the whole run, so it can keep what it builds on it:

```js
pv: {
  glow(k) {
    if (!this.light) {
      this.light = new this.THREE.PointLight(0xffa050, 0, 2.2);
      this.light.position.set(0, 1.3, 0);
      this.stage.scene.add(this.light);
    }
    this.light.intensity = k;
  },
},
beats: [{ scene: 'glow', tween: [0, 5], ms: 1200, ease: 'sine' }],
```

### Bullet time

| Key | |
|---|---|
| `timeScale: k` | the scene's speed: 1 normal, 0.2 slow, 0 stopped |
| `ms` | ramp to it over this long |
| `for: ms` | hold it this long after the ramp, then go back to 1 |
| `back: ms` | the ramp back to 1 |
| `duck: 0..1` | the sound's level while slowed, coming back with it |

```js
{ who: 'opp', keep: [], roll: [6, 6, 6, 6, 6], alongside: true },
{ after: 700, timeScale: 0, ms: 120, for: 3150, back: 600, duck: 0.25 },
{ after: 140, orbit: { center: 'air', radius: 0.6, height: 0.06, from: -60, to: 45 }, ms: 3100 },
```

Two clocks: **scene time** runs the game's animations, dice and cards in flight, the
avatar, particles, the sea and sky, CSS animations, `performance.now`, `Date`, page timers
and `requestAnimationFrame`, and slows with `timeScale`. **Film time** runs the director:
beats' timing, camera moves, light changes and tweens; it never slows. Sound runs on film
time: a sound already playing plays on at its own speed, a sound the scene starts while
slowed starts when the scene gets there; `duck` lowers the whole mix meanwhile. The
music is sequenced note by note on the page's timers, so it stops with a stopped scene:
in `bullet.js` the freeze goes near silent (-60 dB against -30 before it), the last notes
ringing out ducked, and the music picks up again as the scene does. Bullet time is the
renderer's: a page in a browser plays the beat at normal speed.

## Rendering

```bash
node scripts/director/render.mjs <script> [options]
node scripts/director/render.mjs --page <file.html> [options]
```

`<script>` is a name in `web/play/director/scripts/` or a path to a script file anywhere.
`--page` films any local HTML page (it and its folder are served, same-origin iframes
included) on the same clock: its CSS animations, timers, `requestAnimationFrame`, Web Audio
and `<audio>` all step with the frames. A page can hold the start until it's ready with
`window.__vtReady = false` … `= true`.

| Option | |
|---|---|
| `--size 1920x1080` | the frame |
| `--fps 30` | |
| `--scale 1` | 2 or 3: the page laid out that many times smaller, its type bigger (like a phone's) |
| `--lang zh-CN \| en` | the page's language (else the script's `lang`, else the browser's) |
| `--from ms` | start this far in (earlier frames still play, unseen) |
| `--duration ms` | stop after this long (a page needs one: default 5000) |
| `--live` | roulette's live (stream) layout |
| `--frames N --every K` | stop after N frames; keep every Kth (stills for a contact sheet) |
| `--out dir` | default `renders/<name>-<w>x<h>[-lang]/` (not committed) |
| `--gl vulkan \| angle` | the WebGL backend (vulkan is faster here; angle the fallback) |
| `--no-mp4` `--no-sound` | |
| `--max-secs 300` | the longest sound it holds |

Out: `frames/`, `sound.wav` (the page's sound under exactly those frames), `<name>.mp4` (both
muxed, x264 crf 14 and AAC), `timeline.json` (each beat's time and frame).

```bash
node scripts/director/render.mjs sample --lang zh-CN
node scripts/director/render.mjs crt --lang en --size 1080x1920
node scripts/director/render.mjs bullet --from 3000 --duration 6000
node scripts/director/render.mjs --page web/play/director/examples/frame.html --duration 4000
node scripts/director/render.mjs ./my-shot.js --every 10 --no-mp4 --out renders/check
```

The renderer runs headless Chrome muted, one at a time on the GPU.

## Minimal examples

```js
// roulette: it shoots you with the one live shell
export default {
  start: { turn: 'opp', hp: { you: 1, opp: 1 }, shells: 'L' },
  beats: [{ say: '再见。', mood: 'smug' }, { who: 'opp', shoot: 'other' }],
};
```

```js
// 21: you stand on 20, it hits 17 into a bust (and stands: a bust doesn't end the turn)
export default {
  game: 'blackjack',
  first: 'you',
  hands: [{ you: ['KS', 'QH'], opp: ['9D', '8C'], draws: ['7S'] }],
  beats: [{ who: 'you', act: 'stand' }, { who: 'opp', act: 'hit', mood: 'sad' }, { who: 'opp', act: 'stand' }],
};
```

```js
// Yacht: five of a kind on the first roll
export default {
  game: 'yacht',
  first: 'you',
  turns: [[4, 4, 4, 4, 4], [1, 2, 3, 4, 6]],
  beats: [{ cam: 'tray', ms: 1000 }, { who: 'you', score: 'yacht' }],
};
```

## Limits

- `<video>` in a page isn't stepped with the clock or captured.
- `timeScale` works only in the renderer.
- Cross-origin iframes don't share the clock.
