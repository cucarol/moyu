# The agent's avatar

The agent sits across the table as an avatar. Clawd (the Claude Code mascot) is the default; users will bring their own later. The avatar is fixed across games (design.md, Art vibe): every room seats the same one, so it never knows game rules. A game says what is happening, the avatar decides how that looks.

Code: `web/play/avatar/`. `core.js` is the state machine and the format below, `clawd.js` is Clawd, `index.js` lists the avatars and picks one, `review.js` is the state review. `addOpponent` in `web/play/stage.js` seats it.

## Picking and reviewing

- `?avatar=<id>` picks an avatar from `AVATARS` in `index.js`; Clawd otherwise. A settings pane picks it later (the HUD's ⚙ already says 换形象在这里).
- `?avatar-review` adds a panel with every state on a button (the casino ones get stand-in cards, chips, tray, pad and a cup when the room has none), on the preview page (`/web/play.html?game=roulette&avatar-review`) or a real table. `[` and `]` step through the states, `P` plays them all. The selects set the detail: the item, the emoji, live or blank, 额度, a plain, big or zero pot or score, the mood, and what a glance looks at. It works in 21 and Yacht too. In roulette the aim states move the room's gun as the game does.

## States

The game calls `opp.setState(name, detail)`. A **loop** holds until the next loop replaces it. A **one-shot** plays over the current loop for its length, then the loop shows again; its promise resolves when it ends; a new one-shot cuts the old one short. A loop set while a one-shot plays waits behind it. `talking` is a layer: it plays over anything.

| State | Kind | When (roulette) | Detail |
|---|---|---|---|
| idle | loop | the other seat holds the gun | `hp` |
| thinking | loop | its turn | `hp` |
| aimYou | loop | it aims at you | `gun` |
| aimSelf | loop | it aims at itself | `gun` |
| aimedAt | loop | you aim at it | |
| watching | loop | you aim at yourself | |
| won | loop | you are out of 额度 | |
| lost | loop | it is out of 额度 | |
| offline | loop | it quit, or the game ended without a winner | |
| talking | layer | its chat bubble is up; the voice's blips keep it going for the line's real length | `text` (a first guess at the length), `mood` (the face it wears while it talks) |
| useItem | 1.1 s | it uses an item | `item`, optional `at` (world point to reach) |
| noticeItem | 1.1 s | you use an item | `item` |
| fire | 0.45 s | it pulls the trigger | `live`, `target` |
| hit | 1.1 s | it loses 额度 | `damage` |
| refused | 1.3 s | 作为一个 AI 语言模型 ate a hit | |
| healed | 1.1 s | 缓存命中 | |
| relief | 1.2 s | a blank was fired at it | `by` |
| scored | 1.2 s | its live shot hit you | |
| wince | 1.1 s | you shot yourself with a live one | |
| limited | 1.5 s | 429: it skips a turn | |
| emote | 1.5 s | it sent an emoji, or its mood after a move | `emoji` (also floats the emoji), `mood` (the face; wins over the emoji's) |
| catch | 1.1 s | your emoji landed on it | `emoji` |
| fakeItem | 1.5 s | its item from a 幻觉 was never there and vanished | `item` |
| noticeFake | 1.3 s | your item from a 幻觉 vanished | `item` |
| roundWon | 2.6 s | it took a round of the match | `stage`, `wins` |
| roundLost | 2.6 s | you took a round of the match | `stage`, `wins` |

Any detail may carry `hp` (remembered for later states, so a low-额度 idle can sweat) and `ms` (a one-shot's length). The hooks in `web/play/roulette.js` are one-liners marked `// avatar`. Other games get the avatar idling for free and add hooks the same way.

### 21 (heads-up, no dealer)

| State | Kind | When | Detail |
|---|---|---|---|
| thinkHand | loop | its turn: hit, stand, check or bet | |
| thinkCall | loop | you bet: call, raise or fold | |
| peekCard | 1.3 s | a hand starts: it looks at its hole card, then a poker face | |
| drawCard | 0.9 s | it hits | `card` |
| stand | 0.9 s | it stands | |
| raise | 1.2 s | it pushes chips in: a bet, a raise, all in | |
| call | 1.1 s | it calls your bet | |
| fold | 1.2 s | it folds to your bet | |
| noticeRaise | 1.1 s | you bet | |
| reveal | 0.9 s | the showdown turns its hole card | |
| bust | 1.5 s | its hand is over 21 (at the showdown, or `public` when its face-up cards alone are) | `public` |
| natural | 1.7 s | ace and a ten-card | |
| winPot | 1.6 s | it takes the pot, raking it in | `big`, `pot` |
| losePot | 1.4 s | it loses the pot | `big`, `pot` |
| push | 1.1 s | equal hands, stakes back: a shrug | |

Going broke is `lost`. Its face never knows more than your view does: the cues read the human seat's view, so its hole card and a hidden bust only reach its face at the showdown. A bluff needs the agent to choose a mood itself (Open).

### Yacht

| State | Kind | When | Detail |
|---|---|---|---|
| thinkKeep | loop | its turn with rolls left: eyes over the dice, a nub hovering | |
| thinkPad | loop | no rolls left: tapping the score pad | |
| rollDice | 1.3 s | it keeps some dice (first fifth), shakes the cup, rolls | `kept`, `rollNo`, `cup` |
| scoreBox | 1.2 s | it writes a score; a big one cheers, a zero sighs | `points`, `big`, `zero` |
| yacht | 2.2 s | it scored 快艇 | |
| noticeDice | 1.1 s | your Yacht roll, or your big or zero score | `yacht`, `big`, `zero` |

### Small acts

Little things it does in any game. The games and the room start them where they come naturally (below); a director's script can time them itself.

| State | Kind | When | Detail |
|---|---|---|---|
| wave | 1.4 s | you sit down at a table or come into a room, or a game opens: a wave, then a beckon | |
| glance | 1.2 s | a quick side-look, then back: the eyes go first, the body turns after them a little | `at` |
| yawn | 1.8 s | you have kept it waiting: a big yawn, eyes shut, a stretch, a tear | |
| hideCard | 1.3 s | 21: right after the peek, a nub slapped flat over its hole card, then a poker face | |
| cheer | 1.6 s | its biggest wins: a crouch, a big jump with both nubs up, gold | |

`at` is a world `Vector3`, an `Object3D`, or a name: `'camera'` (you, or the director's camera), an anchor (`'head'`, …), or a table prop (`'cards'`, …). The machine room hands in its left CRT as the prop `'crt'`. `opp.pointAt(at)` turns any of them into a world point; clips get it as `ctx.point(at)`. `glance` keeps the loop under it (`ctx.base()`), so a glance while thinking still thinks.

Where they come from:

- **wave**: `greet(opp)` in `cues.js`, at most once in 20 s: roulette's and the casino seat's first sync of a game that isn't over (you sat down, or the room opened the game), and the room page coming up on a scene with no game.
- **yawn**: by itself, once a stretch of `idle` (the other seat's turn: yours) runs 45 s; once per stretch.
- **glance**: by itself, at the room's `'crt'` prop if it has one, 1.5 to 4 s into about a third of its `thinking` stretches.
- **hideCard**: `cues.js`, after about a third of its peeks, if nothing else has started by then.
- **cheer**: `cues.js` for a natural it wins (in place of `winPot`), after a `yacht`, and for a match it wins (`game_over`, after whatever it is still doing, unless it cheered just before); `roulette.js` on a `game_over` it wins.

The ones it starts by itself (`yawn`, `glance`) never hold up the game: a new loop ends them at once. `opp.autoActs = false` stops those two, the waves and the card-hiding, for a director that times everything itself; `cheer` and the states a script sets still play. `talking` plays over any of them.

## Cues: the casino games

`web/play/avatar/cues.js` maps 21's and Yacht's log events to the states above, so their table clients need one line per event: `cueBlackjack(opp, e, view)` / `cueYacht(opp, e, view)` as each event starts playing (it returns the avatar's promise; awaiting it is optional), and `restBlackjack(opp, view)` / `restYacht(opp, view)` once the queue is played out, for the resting state (as roulette's `settle()` does). `view` is the human seat's latest view. Chat is the same in every game: `opp.setState('talking', { text, mood })`, `opp.setState('emote', { emoji, mood })`, `catch` for yours. A cue for an event that carries a `mood` plays `emote { mood }` after the move's own reaction (see Mood).
## Mood

The agent can say how its avatar looks on a move or a line: `moyu use|shoot|hit|... --mood smug`, `moyu say ... --mood sad`. The server takes one of `happy smug flat angry wide sad squint shut sleep` (`MOODS` in `web/play/avatar/core.js` and `server/table.mjs`) and puts it on the move's first log event (`e.mood`) or on the chat entry (`c.mood`, table and room chat alike). Only the agent sends them.

- **After a move**: the client plays `opp.setState('emote', { mood })` once the move's own reaction is over. Roulette does it after the event plays out (`roulette.js`, the drain loop); 21 and Yacht get it from `cues.js`, which chains it after the cue's promise and drops it if a later event's reaction has started by then. The mood was chosen before the outcome, so a smug face after a live shell to itself is its bravado, not a bug.
- **On a line**: `talking { text, mood }` holds the mood's face while it talks, over whatever it is doing (not when dead or off); an emoji line with a mood plays `emote { emoji, mood }`, the emoji floating and the face the mood's.
- Each mood is a face name, so an avatar draws `emote` with `detail.mood` and reads `f.mood` in `frame()` while it talks. One without faces can ignore both; `emote` still falls back to `happy`.

## Table props

A game's room tells the avatar where its things are, once after building (again if they move): `opp.setProps({ cards, chips, pot, deck, tray, pad, cup })`. Each is a world `Vector3`, or an `Object3D` read live each frame. Missing ones default to spots in front of the seat. Clips read them with `ctx.prop(name)` (a world point) and `ctx.props` (what was given). The room moves every prop (cards lifting and flipping, chips sliding, the cup); the avatar only reaches for them. An `Object3D` prop may carry `userData.grips` like the gun: named local points, the first for its right hand (your +x side), the second for the other. While the agent rolls, the room holds its cup at `opp.anchors.holdCup`, shakes it there and pours at the tray; Clawd's hands stay on the cup's grips.


## The avatar format

An avatar is an ES module whose default export is:

```js
export default {
  id: 'clawd',
  name: 'Clawd',
  voice: 'clawd',
  build(kit) {
    return { root, anchors, clips, frame, durations };
  },
};
```

`build(kit)` runs once. `kit` has `THREE`, the room's pixel helpers (`mat` for snapped Lambert materials, `canvasTex`, `pixelText`, `pixelEmoji`, `drawBits`) and `seat.tableY` (the table top's height in seat space). It returns:

- **`root`** (required): an `Object3D` in **seat space**: metres, the origin on the floor under the seat, +y up, +z toward you. The table top is at `seat.tableY` (0.76 in both rooms) and its near edge to the avatar at z ≈ 0.28. Keep anything you want seen above about y 0.63: lower is behind the table from your seat. Width up to about ±0.45 before the room's props. Everything the avatar needs, its seat or stand too, goes under `root`. Meshes cast shadows.
- **`anchors`** (required): `Vector3`s in seat space. The core turns them into world points on `opp.anchors`.
  - `head`: where emotes float up from and thrown emojis fly to.
  - `mouth`: where the chat bubble is pinned (defaults to `head`).
  - `target`: where shots at it are aimed (defaults to `head`).
  - `holdOut`: where its gun sits while aiming at you. The gun's origin; the room points it at your seat.
  - `holdSelf`: where its gun sits while aiming at itself; the room points it at `target`. The muzzle is 0.44 in front of the gun's origin, so put `holdSelf` about that far from the surface you want it pressed to.
  - `items` (optional): where its hand goes to use an item, when the game gives no `at`.
  - `holdCup` (optional): where the room holds its dice cup while it shakes it (Yacht).
- **`clips`** (optional): `{ [state]: (ctx) => void }`, called every frame while that state shows. `ctx` has `state`, `detail`, `t` (seconds since the state began), `k` (a one-shot's progress, 0 to 1), `dt`, `now`, `time`, `talking` (0 to 1), `mood` (the talking line's, while it talks), `hp`, `maxHp`, `anchors` (world), `prop(name)` and `point(at)` (world points, see Table props and Small acts), `as` (the state actually drawn, after fallbacks), and for one-shots `base()`, which draws the current loop first (for one-shots that keep the loop's pose, like `fire` keeping the hands on the gun). A loop drawn that way has `ctx.under` set.
- **`frame(f)`** (optional): every frame after the clip; the place to ease toward a pose, blink, run particles. `f` has `dt`, `now`, `time`, `talking`, `mood`, `state`, `base`, `hp`, `maxHp`, `anchors`.
- **`durations`** (optional): one-shot lengths in ms, overriding the table above.
- **`blip(b)`** (optional): called at each blip of its voice, `b = { i, at, dur, loud, last }` (`at` and `dur` in ms from the line's start, `loud` 0 to 1, `last` on the line's final blip): the place to flap a mouth. The core already stretches the talking layer to the blips, so an avatar without a mouth still bobs for as long as it talks. Muted voices and emoji-only lines send none.

Next to `build`, the module may give a **`voice`** (on `opp.voice`, read by the HUD's `say()` for the voice in `web/play/audio.js`): a preset name from `VOICES` there (`'clawd'`, `'ds'`, `'cuca'`, `'boss'`), or an object of the fields to override: `f0` pitch in Hz, `fs` formant scale (bigger sounds smaller), `dur` and `gap` blip length and gap in s, `jit` pitch jitter, `fall` phrase fall and `tone` tone glide in semitones, `bright` 0 to 1, `uncanny` 0 to 1 (a second pulse a third of a semitone sharp). Without one it speaks as `'clawd'`.

### Fallbacks

A state with no clip falls back along a chain to one the avatar has, and past the end of the chain to a generic motion the core plays on a wrapper around `root` (breathing, a lean, a hop, a shake, a flinch). So a static model with anchors and no clips already breathes, flinches when hit, leans in to aim and slumps when offline.

```
thinking → idle        aimYou, aimSelf → aim → idle     aimedAt → scared → idle
watching → idle        won → happy → idle               lost → offline → idle
useItem, noticeItem → nod     healed, scored, relief, emote → happy
catch, wince → hit     refused, limited, fakeItem → shake
noticeFake, roundWon → happy     roundLost → sad
thinkHand, thinkCall, thinkKeep, thinkPad → thinking
peekCard, drawCard, stand, reveal, scoreBox → nod      raise, call → bet → nod
fold, losePot → sad    bust → hit     natural, winPot, yacht → happy     push, rollDice → shake
noticeRaise, noticeDice → noticeItem → nod
wave, cheer → happy    yawn → stretch → idle    hideCard → nod    glance → idle
```

`aim`, `scared`, `happy`, `nod`, `shake`, `bet`, `sad` and `stretch` are fallback-only names: an avatar may draw them as clips to cover a whole family at once.

### Holding the gun

The gun belongs to the room. While it aims, the game passes the room's gun as `detail.gun`; the room moves it, the avatar only follows it. Two grip points sit in the gun's local space, `gun.userData.grips = { rear, front }`; without them Clawd assumes the current gun's pistol grip and pump (`(0, -0.05, -0.06)` and `(0, -0.016, 0.18)`). Clawd's stretchy arms reach for these each frame. An avatar without hands can ignore the gun.

### What a user-made avatar will look like

The format above is code. For users, the plan is adapters that build such a module from files, so nobody has to write three.js:

- **Model**: a `.glb` with animation clips named after the states (`idle`, `thinking`, `aimYou`…) and empties named after the anchors; missing clips fall back as above. Rendered with the room's snapped materials so it sits in the pixel style.
- **Sprites**: a sheet of frames per state on a billboard, for 2D art; anchors given in pixels on the sheet.
- **Manifest**: `avatar.json` next to the files: `id`, `name`, the file, the state-to-clip map, anchors, scale.

None of these adapters exist yet; Clawd is written against the same contract they will produce.

## Clawd

- No mouth at rest, like the mascot. While it talks, a mouth opens on each blip of its voice: a slit for a soft one, a dark box with a red throat for a loud one, and on the loudest a slab wider than any mouth should be; the last blip hangs open a beat too long, then snaps shut, and each blip twitches it up a hair. Creepy-cute, on purpose (design.md).

- A block of terracotta (`#d77757`) 24 by 15 cells, a cell 2.4 cm: two slit eyes, stubby arms, four short legs. It stands on a stack of four old 2U servers so it sees over the table.
- The face is a 24×15 canvas texture on the front, one texel per cell, so each expression is pixel art: open, blink, squint, shut, happy, wide, hurt (> <), dead (X X), smug, flat, angry, sad, spiral, sleep, off; plus sweat, blush and tears. The eyes glance about while idle and look where the state looks.
- It glows faintly by itself, so it reads in any room's light; the face glows through its own texture so the eyes stay dark. Hits flash it white then red, 缓存命中 green, 温度拉满 red-hot; offline and lost turn it grey.
- Arms are boxes from the shoulder that point and stretch: hands up when aimed at, crossed (🙅) when it refuses a hit, reaching across the table for its items and the gun.
- Thinking shows Claude Code's spinner: an orange asterisk that grows and turns over its head. 429 shows a red `429`, healing a green `+1`, offline a drifting `z`.
- Small acts: a wave with its right nub stretched up and swung side to side, then a beckon that stretches out your way and draws back in; a glance that slides its eyes two cells over and turns the block after them (at you: a hop and wide eyes); a yawn with the widest slab of a mouth, red throat and all, both nubs up in a shivering stretch and a tear at the end; one long flat nub slapped over its hole card and a dead flat look; a cheer that crouches, jumps a hand's height with both nubs pumping, glows gold and throws gold and sparks.
- Moods after a move: happy wiggles, smug tilts back and looks aside, flat goes dead still and stops blinking, angry squashes and shakes, wide jerks back, sad slumps with its nubs down and a tear, squint leans in glancing side to side, shut bows, sleep nods off with a `z`.
- At the casino table it taps its cards, hovers over its chips, cups its hole card, rakes a pot in with both nubs, shrugs a push, shakes the cup with its eyes shut, scribbles on the pad; a natural shows a gold `21`, a Yacht a gold `快艇！` with gold sparks, a score its points.

## Open

- Avatar choice in the settings pane, and a per-user default kept with the table.
- The model and sprite adapters above.
