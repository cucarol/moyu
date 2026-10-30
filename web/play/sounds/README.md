# Sounds: sources and licences

Every effect and ambience on the table is synthesized at runtime with the Web Audio API in
`web/play/audio.js`: oscillators, filtered noise, a generated reverb impulse. The music
tracks play from `bgm/`, loops of their own notes rendered on Surge XT
(`scripts/sound/bgm.py`, below), with their Web Audio versions as the fallback. There are
no samples or recordings. The sound design, the music and the code are the project's own;
the one third-party piece is the pinyin library the agent's voice loads (see The agent's
voice below). `CREDITS.md` lists what made what.

| Source | Licence |
|---|---|
| `web/play/audio.js` (all effects, the beds, the tracks' synth versions) | the project's own code |
| `bgm/*.ogg` (the tracks, rendered on Surge XT factory patches) | the project's own music |

If a recorded asset is ever added here, list it in this table and in `CREDITS.md` with its
URL, author and licence (CC0, or CC-BY with its credit line; nothing ripped from games).

## Auditioning

`index.html` in this folder is a sound board: every effect as a button, the roulette bed
with a tension slider, and an offline render that reports each sound's peak and RMS level,
so levels can be balanced without listening. Open it from a running moyu server at
`/web/play/sounds/index.html`.

## What plays when (roulette)

- Bed (`VIBES.roulette`): mains hum at 50 Hz and up, a lamp-circuit buzz, server fans
  breathing, a faint CRT whine, under its music, the Wired (`TRACKS.wired`). Tension (a
  seat on its last 额度, the gun on its last shells) stirs the fans and strains the racks'
  power, a high whine of two close tones beating, and brings up the music's own tension.
  It fades out while the tab is hidden.
- `round`, `lay`, `load` (shells seated, then the pump), `deal`.
- `use` + item: one shared activation chirp, then each item's own tail.
- `aim` (the pump racks), `blank` (a dry click; the bed holds its breath), `shot`,
  `hit` (static burst, rack alarm, fans spin up; for you also a muffle and ringing ears),
  `refused`, `spend` (the shell bounces), `skip` (429).
- `win`, `lose` (everything powers down), `over`, `quit`.
- `chat`, `emote`, `turn` (your move), and HUD `hover`, `point`, `click`, `send`, `throw`.

## What plays when (the raft: 21 and Yacht)

21 and Yacht sounds play the moment they're called, unlike roulette's, which are offset to
land with the room's animations. The hook names were agreed with Art & UI on card-bcpydqqf.

- Bed (`VIBES.raft` = `VIBES.blackjack` = `VIBES.yacht`): the music is Lantern
  (`TRACKS.lantern`, below). Tension (a big pot, a double waiting on a call, a close game
  in the last hands or turns) busies its hats, opens its pad and brings in a few high notes.
- Under it, on the ambience level, the sea around the raft (`RAFT_LEVEL`): a low wash far
  off on either side; water lapping at the raft's left, right and far edges, each swelling
  on its own clock every 3.5-7.5 s and slapping and blubbing a little against the logs
  (`lap`); and sparse things: a low groan of wood or rope every 18-40 s (`creak`), the float
  plopping softly every 14-35 s at the back right (`plop`), the cat beside it
  purring for a few breaths every 45-100 s (`purr`), a far gull every 50-100 s (`gull`).
  Each is placed where the scene says its source is (`placeSound`, below).
- The game's own sounds (cards, chips, dice, and the casino `win`/`lose`/`over`) play about
  3 dB softer and a little duller on the raft, to sit in its calm.
- 21: `shuffle`, `card`, `flip`, `chips {amount}`, `stand`, `fold`, `reveal`, `natural`,
  `bust {who}`, `push`, `sweep {toYou, pot}` (a pot of 600k or more coming your way adds
  `bigwin`).
- Yacht: `rattle {dur}`, `roll {count}`, `keep`, `unkeep`, `score {points}` (0 is a
  scratch-out), `yacht`, `bonus`.
- `win`, `lose`, `over` have casino versions (`VIBE_SFX`) that `sfx()` prefers while the
  raft is the vibe.

## The agent's voice

Every line the agent says (the HUD's `say()`, so every game) babbles in animalese:
`speak(text, { voice, mood, onBlip })` in `audio.js`. The voice itself is **dididudu**, a tool
of the author's CUCAI kit (`CUCAI/kit/tools/dididudu/`, which also renders
lines to WAV + JSON for video): moyu ships a copy of its module, `web/play/dididudu.js`.
Change the voice there, never in the copy, then bring the copy up to date with
`node scripts/sync-dididudu.mjs` (`--check` says whether it is). It began as a live Web
Audio port of the user's `na-ai-ne/tools/ep02/animalese.py`. Each Han character is one blip: its pinyin final picks the vowel (three formants on a
buzzy pulse, gliding through diphthongs), its tone shapes the pitch, its initial adds a
tick or hiss. Latin words babble one blip per vowel group (letters spelled when a word has
no vowels), with a lift on the next to last group; accented letters lose their accents and
Cyrillic is transliterated first, so German, French, Spanish, Portuguese and Russian babble
as Latin. Kana babble one blip a mora (っ a catch, ー holds the last blip, ん a short nasal),
hangul one a syllable from its code point (its final nasal or clipped); Japanese and Korean
skip less widely, Japanese a touch quicker. Every game language's lines babble with no
silent stretch. Digits are said as their Chinese readings; punctuation pauses, ！ lifts the last blip,
？ makes it rise. A run of third tones is said as second tones up to its last, and a third
tone mid-phrase as a half third (low, falling); an -n or -ng syllable ends on a nasal's
murmur, darkening. The last syllable before each punctuation mark is drawn out. Each line's
randomness (pitch skips, lengths, consonants) comes from its text, so a line always babbles
the same way. The line's mood (the avatar's face: `happy smug flat angry wide sad squint
shut sleep`, `MOODS`) sets its pitch, pace, loudness, how widely it skips, its fall and how
each phrase ends (happy and wide lift, smug drawls down, flat hardly moves, sad sinks).
Emoji-only lines stay silent. Lines are cut at about 6 s; a new line cuts the old one off.
The chat chime is skipped when a line is spoken.

Voices (`VOICES`): the tool's `ds`, `cuca`, `boss`, and `clawd`: a small creature's
chatter after the little villagers of cosy life-sims, quick and high, each blip holding its
vowel and cut off clean with a little chirp up into it, its pitch skipping widely, a faint
beating second pulse left from its first, creepy-cute version. An avatar can carry its own as
`opp.voice` (a name or an object of the fields), and `opp.blip(b)` gets each blip's onset
for the mouth (agreed with Avatar on card-dtxsw9dv).

| Source | Licence |
|---|---|
| dididudu (`CUCAI/kit/tools/dididudu/`, from `na-ai-ne/tools/ep02/animalese.py`; the user's CUCAI kit) | the user's own code |
| [pinyin-pro](https://github.com/zh-lx/pinyin-pro) 3.29.4, its ESM build in `web/play/vendor/pinyin-pro/` (fetched from jsDelivr 2026-10-31, hashes checked) | MIT |

The voice has its own on/off and volume in ⚙ (说话声, 说话音量).

## The music: tracks and the ⚙ picker

Each scene's music is a track in `TRACKS`, played in its bed's music slot: `lantern` (the
raft's), a slow lofi beat at 72 bpm (dusty electric piano down Dbmaj9, Cm7, Fm9, Abmaj9
over a warm pad, a round bass, soft kick and a laid-back rim, deeply swung hats, a wobbly
tape, the whole of it swelling and easing once a bar like a boat on the swell, and now
and then a little two-bar tune on a soft flute-like lead; tension brings busier hats, opens
the pad and adds a few high notes); `wired` (the machine room's), a slow lofi beat at 68 bpm in the
Wired: a dark detuned drone humming under it all, its left and right breathing apart, a
dusty electric piano down Dm9, Cm9, Bbmaj9 and back up to Cm9 on a wobbly tape, a round
bass, soft kick and snapped rim, swung hats, and now and then a ping "from the Wired" on
the chord's notes or a moment of a modem talking, in an echo bouncing left and right;
tension brings a heartbeat, ghost hats, a bass pulse in eighths and opens the drone and
the tape. Every track is lofi; the room's own sounds stay in the ambience. `lounge` is shelved (in `SHELVED`,
off the ⚙ list) until it has a scene of its own: a slow brushed trio at 66 bpm looping ii-V-I-vi in D flat (FM electric
piano, upright bass, brushes, soft ride) behind a dark lowpass, whose tension walks the
bass on every beat, busies the ride and brushes and brings in a low pad.
No track carries vinyl crackle or dust: it read as something ticking or burning.
⚙ 音乐 picks 跟随场景 (each scene its own, the default), one track for every scene,
or 关 (no music; the ambience stays). A change crossfades over a couple of seconds. The
scene works out the game's tension (0 to 1) and hands it to whichever track plays, so
the mood follows the game on any track; the turn cue is the scene's.

The launch PV's score (`pv/score/`) plays these same voices, which `SCORE_KIT` exports.

### The tracks from files

The Wired plays only from `audio.js` (its Surge XT loops went with the drone-only track,
2026-10-31). Each voice of Lantern plays either from the synth version here or from its Surge XT
version, layer by layer, as `bgm/choice.js` says (`"synth"` or `"loop"`). The Surge XT
version is the synth's own notes (its random choices made once, with a fixed seed) played
on the same patches and levels as the PV score's v2, in two seamless loops of the same
length in `bgm/`: `<track>.ogg`, the bed, and `<track>-tense.ogg`, what tension brings in
(sixteenth hats, more pushes, the high notes). They hold only the voices marked `"loop"` (a layer with none gets no
file); the synth plays the rest alongside, Lantern's beat started on the loops' so they
stay in step. They start together and loop together; tension sets the second's level
(`LOOPS` in `audio.js`). All of it goes through the music bus, so ⚙ 收音机放音乐 works as
before. Each loop voice is as loud as the synth's own, one by one
(`scripts/sound/bgm-trims.json`, from `compare.py levels`), so any mix of the two keeps
its balance. With every voice `"synth"` nothing is fetched; if the files can't be fetched
or decoded (Safari before Vorbis support, a missing file), the synth plays every voice.

| track | bed | tense |
|---|---|---|
| lantern | keys, bass, kick, rim, hat, pad and lead (synth only) | keys (the extra pushes), hat (the sixteenths), top (the high notes) |

```bash
.venv-audio/Scripts/python -I scripts/sound/bgm.py       # bgm/*.ogg, renders/bgm/voices/
.venv-audio/Scripts/python -I scripts/sound/compare.py levels   # bgm-trims.json
.venv-audio/Scripts/python -I scripts/sound/bgm.py       # again, with the trims
```

The tools (Surge XT, DawDreamer) are fetched, not committed: see `pv/score/README.md`.
`compare.py bgm` writes `renders/sound/bgm-<track>.wav`, the synth version then the loops,
calm and then tense. `scripts/sound/sfx.py` makes `renders/sound/sfx-compare.wav`, a few of
the most heard effects next to a Surge XT take on each, for comparing only: the game keeps
its own effects. `scripts/sound/clips.py` puts all of it, voice by voice and effect by
effect, on one listening page: `renders/listen/index.html`.

## ⚙ levels

声音 / 音量 is the master. 环境音 turns down each game's ambience apart from its music:
roulette's hum, buzz, fans and CRT whine; the sea around the raft. 收音机放音乐 (off by
default) plays each scene's music out of a small speaker in the scene instead of straight:
band-limited (330 Hz to 3.3 kHz, a honk at 1.6 kHz), a little driven, a breath of static
and a touch of the space around it, placed where the speaker is: the radio on the raft's
side table, the left CRT in the machine room. Each track's radio makeup (`WIRED_RADIO`,
`LANTERN_RADIO`) keeps it as loud out of the radio as straight, within a decibel. 说话声 / 说话音量 is the agent's voice. All are
remembered in localStorage.

## Where sounds come from

A scene can say where its sound sources are: `build()` returns them as `sound` (or
`casino.sound`), world-space points such as `{ water: [...], radio, float }`, and
`main.js` and `room.js` hand them to `placeSound(camera, places)`. Each becomes a pan and
a distance from the seat (`soundPlaces()` shows them); a bed's panners and the radio follow
them, and fall back to fixed pans when a scene gives none.

## Adding a game's vibe

Add a function to `VIBES` in `audio.js` keyed by the game id and the scene's `sound` name
(`main.js` and `room.js` call `setVibe(game)`; games of one scene share its bed, which
keeps playing between them); it builds its bed into `E.bedBus`, its ambience through
`ambGain()`, and its music with `musicSlot(E, out, ownTrack)`, and returns
`{ react(kind, t), mood(view), stop() }`. A new track goes in `TRACKS`: `(E, to)` playing
through `musicBus()` with its own radio makeup, measured with radio on and off (so the
radio option works at the same level), and returning `{ setTension(x), stop() }`,
with its name under `ui.settings.tracks` in every language. A vibe can also replace any effect for its game
through `VIBE_SFX`.
