// Which version plays each voice of the game's music, track by track and layer by layer
// (bed: what plays calm; tense: what tension brings in): "loop" for Surge XT, from the
// loops in this folder, or "synth" for audio.js's own Web Audio voices. The loops hold
// only the voices marked "loop" here: scripts/sound/bgm.py reads this file, so run it
// again after a change. (Kept as plain JSON after the export line, for bgm.py.)
// All "synth" since 2026-10-30: the user prefers the game's own voices, and the two
// families don't blend within a track.
export default {
  "lantern": {
    "bed": { "keys": "synth", "bass": "synth", "kick": "synth", "rim": "synth", "hat": "synth", "pad": "synth", "lead": "synth" },
    "tense": { "keys": "synth", "hat": "synth", "top": "synth" }
  }
};
