# The launch PV's score

The music and sound effects of the launch PV, made to the cut (the picture leads). It is
played by the game's own synth voices (`SCORE_KIT` in `web/play/audio.js`): the two tracks
of the game's rooms, the Wired (the machine room) and Lantern (the raft), arranged to the
picture, and the film's effects. Nothing is sampled, and every render comes out the same.

```bash
node pv/score/render.mjs     # about a minute
python pv/cut/join.py zh     # the cut, with the score mixed in
```

A muted headless Chrome plays `score.js` into an OfflineAudioContext with a seeded
`Math.random`. It writes two stems to `renders/pv-score/` (not committed), 32-bit float,
exactly as long as the cut: `music.wav` and `sfx.wav`. `pv/cut/join.py` lays them over the
parts' own sound (each room's ambience, the games' sounds, Clawd's voice: the parts render
with the game's music off), sets their levels (`MUSIC`, `SFX`), and brings the whole to
-14 LUFS with one gain and a limiter.

## The clock

`map.js` holds where the cut's moments fall (seconds of the cut, from each part's start and
its own beat times) and lays each track's bars on them:

- **The Wired at 72 bpm**: the live round on a downbeat, and four bars back its first
  downbeat as Clawd goes into the noon screen (9.99 s). The tests pass on beat three.
- **Lantern at 70.6 bpm**: six bars from the lit horizon (47.95 s) to the dice freezing in
  the air (68.35 s), both downbeats; four bars back its first, on Clawd's dive into the
  dusk screen (34.35 s). After the freeze its bars go on from the landing (70.85 s), three
  of them to the cut's end.

## What plays where

- **The desk at noon** is dry: a faint office air. The hook lands with a fat pop and a
  pixel blip, the face with a smaller one, then the sigh: a breath out and a note going
  flat. The keys, Enter, Claude's card, Clawd's hop, spring, pop through the glass and soft
  landing, and a rush rising as it goes into the screen.
- **The Wired** swells in backwards and lands as Clawd is in: a sparse first bar (keys,
  drone, bass, kick), the glitch's bits over it, then the groove and its pings. The heat
  brings its heartbeat, ghost hats and the pulse; it holds its breath for a beat, and the
  live round lands on the downbeat with a crash. A bar with no drums for ??? and 😭, the
  drums back, and the tests passing ring up the chord's notes over a crash. As the room
  shrinks into the dusk desk's window it goes small and boxy, and stops dead when the
  window closes.
- **The desk at dusk** is dry again: 打个包 typed, Clawd out and back in.
- **Lantern** swells in backwards on the dive, heard from inside the screen, opening as
  the camera pulls out onto the raft; drums from its second bar; a beat of air, then its
  tune and a crash as the horizon lights; a bar without drums for the laptop and the
  deploy; night, busier, a few high notes; a riser on Eb9 as Clawd throws all five (the
  bass walking up, the rim to sixteenths, the keys climbing).
- **The freeze**: everything stops with the dice in the air but the chord, hanging and
  sagging a little; the landing's chord swells in backwards and Abmaj9 drops as they land,
  the stars twinkle, the tune up high, a bell on the word, two blips for the end card's
  lines, and the last chord rings out.

## v2 and the old score

The score before this one (96 bpm, made before the picture: `score.js`, `map.js`,
`render.*`, `beatmap.json`) is in `pv/archive/score-v1/`. Its Surge XT version, v2, is
kept here because the game's sound scripts (`scripts/sound/`) use its patches, levels and
tools; its commands below need the old score back in place to run.

## v2: the same notes on Surge XT

v2 keeps v1's composition, arrangement and timing note for note and plays it on
[Surge XT](https://surge-synthesizer.github.io/) factory patches instead of the game's Web
Audio voices. The game's own sounds in the score (the dice in the cup, the card snap)
stay v1's. Nothing in v2 is sampled or recorded.

```bash
node pv/score/render.mjs          # v1, and every note it plays: v2/events.json
node pv/score/render.mjs --solo   # each part alone: v2/v1-levels.json, renders/pv-score/solo/
.venv-audio/Scripts/python -I pv/score/v2/render.py
```

`v2/render.py` plays each note on its part's patch in DawDreamer, one at a time (with v1's
level, pan, length and, for the slow ones, its fade-in), then mixes as v1 does: each part
as loud as v1's alone, the Wired's dotted-eighth echo on the drone and pings, the keys'
lowpass opening for the theme, Surge XT Effects' Reverb 2 for the space, the music's mids
dipping at the hits, the same stem compressors (with Web Audio's soft knee, makeup gain and
6 ms lookahead), the stems as loud against each other as v1's, the same arc, then -14 LUFS
under the same limiter. It writes the same files as v1 to `renders/pv-score-v2/` (and
`stem-game.wav`), each part alone as it sits in the mix into `voices/`, and
`v2/voices.json`, each part's level, which the game's music uses (`scripts/sound/bgm.py`).
`--reuse` mixes again from the parts it kept without playing them again. A render takes
about five minutes.

### Either version, part by part

`v2/choice.json` says, for every part, which version plays it: `"v2"` (Surge XT) or `"v1"`
(the game's own voice). A v1 part is v1's own render of it alone (`render.mjs --solo`,
which plays every other part into a sink so the random draws, and so the notes, are the
full render's: the parts alone add up to the full render to -126 dB), with its own room
and its dip at the hits, dropped into its stem in v2's place before the stem compressors.
Everything after that is the same: compressors, stem balance, arc, -14 LUFS, the limiter.
Both versions place every note at the same sample from `events.json`, so a mixed render
stays in time (onsets measured within a few ms, from the patches' attacks). With every
part `"v1"` the result matches v1's own mix (0.99 correlation; v1's is 6 ms later, Web
Audio's compressor lookahead). `--choice file` mixes from another choice file.

### Listening, part by part

`.venv-audio/Scripts/python -I scripts/sound/clips.py` writes `renders/listen/index.html`,
a page (in Chinese, works opened from disk) with every part alone in both versions side
by side, the game's music voice by voice and every sound effect, each with a 好用 mark and
a note that the page keeps and copies out. See `scripts/sound/clips.py` for what it needs.

| part | Surge XT patch | how |
|---|---|---|
| keys | Keys/Soft Suitcase, with Keys/DX EP 10 dB under it | the tine gives the suitcase definition; v1's lowpass, half as high again |
| lead | Keys/DX EP, with Plucks/Pure Square 9 dB under it | as v1 doubled its electric piano with a square |
| arp (the green wave, the lanterns) | Plucks/Light 1 | panned as v1 |
| bass | Basses/Fingered | lowpassed at 900 Hz |
| pad | Pads/MKS-70 Warm Pad | v1's slow fade-ins |
| drone (the Wired) | Pads/Moody Statement | v1's fades and opening filter (three times as high: the patch is darker) |
| ping | Plucks/Bell 1 | into the Wired's echo, as v1 |
| glint | Plucks/Magic Music Box | panned as v1 |
| shimmer | Plucks/Fantasy Bell; Pads/Sparkly for the freeze's slow ones | |
| ding (the button) | Plucks/Square Pop | |
| kick, rim, hat | Altenberg/Drums/Kick Lo-Fi, Cybersoda/Drums/Snap, Emu/Drums/Hat Closed | the hat with a little more air |
| crash, boom | Emu/Drums/T8 Cymbal; Malfunction/Drums/Tom Floor with filtered air under it | |
| swell, toss, riser | FX/Radio Noise through v1's filter sweeps; Polysynths/Uni Saw FB, one held note read faster and faster to climb three octaves | |

Samples were weighed for the piano and the drums and not used: the score's keys are an
electric piano, not an acoustic one, and Surge's drum patches already sit in the game's
synthetic style.

### The tools (fetched, not committed)

- **DawDreamer 0.9.0** (GPL-3.0) in a Python 3.12 virtualenv at `.venv-audio/`
  (gitignored):

  ```bash
  python -m venv .venv-audio
  .venv-audio/Scripts/pip install dawdreamer==0.9.0 scipy soundfile
  ```

- **Surge XT 1.3.4** (GPL-3.0), the portable Windows zip
  `surge-xt-win64-1.3.4-portable-install.zip` from
  https://github.com/surge-synthesizer/releases-xt/releases/tag/1.3.4, unzipped into
  `local/audio-src/surge-xt/` (gitignored), so that
  `local/audio-src/surge-xt/Surge Synth Team/Surge XT.vst3` exists. Nothing is installed:
  the scripts load the VST3s by path. A patch goes in as the plugin's saved state
  (`scripts/sound/surgestate.py`), since DawDreamer can't load an `.fxp` into Surge.

The renders are ours to use: they are what Surge XT played, and no Surge code or patch
file is shipped.

### Before and after

`.venv-audio/Scripts/python -I scripts/sound/compare.py score` writes
`renders/sound/score-ab.wav`: tests pass, the horizon lit, and the freeze into the land,
each v1 then v2 (with `score-ab.txt`, what plays when).
