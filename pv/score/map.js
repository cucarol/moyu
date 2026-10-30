// The PV score's clock: where the cut's moments fall, in seconds of the cut (pv/cut/join.py:
// each part's start is the one before's start plus its length, less the crossfade). The
// picture leads; the music's bars are laid so its downbeats land on the moments that matter.
export const RATE = 48000;
export const LENGTH = 81.05; // the cut

// where each part starts on the cut
const NOON = 0, MACHINE = 10.8, DUSK = 29.4, RAFT = 35.45, YACHT = 55.85;

// the desk at noon (cubicle.js B.noon, story.js ASKS.noon)
export const NOON_AT = {
  hook: NOON + 0.12,
  type: [NOON + 2.1, NOON + 3.2], enter: NOON + 3.45, card: NOON + 4.3,
  rod: NOON + 5.2, hop: NOON + 5.9, jump: NOON + 6.35, out: NOON + 6.7, land: NOON + 7.2,
  dive: NOON + 9.35, in: NOON + 9.9,
};
// the machine room (b-machine.js): the glitch into the room's tube, its turn of roulette, the
// tests passing, the room shrinking into the dusk desk's window
export const MACHINE_AT = {
  glitch: [MACHINE + 0.35, MACHINE + 0.8],
  think: MACHINE + 3.7, blank: MACHINE + 5.1, heat: MACHINE + 8.8,
  bang: MACHINE + 12.52, // (measured in its sound)
  pass: MACHINE + 17.5,
  shrink: [DUSK, DUSK + 0.5],
};
// the desk at dusk: the window closing, you asking 打个包, Clawd out again and into the screen
export const DUSK_AT = {
  close: [DUSK + 0.85, DUSK + 1.0],
  type: [DUSK + 1.3, DUSK + 1.75], enter: DUSK + 1.9, card: DUSK + 2.5,
  hop: DUSK + 2.3, jump: DUSK + 2.6, out: DUSK + 2.9, land: DUSK + 3.35,
  dive: DUSK + 5.0, in: DUSK + 5.5,
};
// the raft at dusk into night (c-raft.js, d-night.js)
export const RAFT_AT = {
  lit: RAFT + 12.5, // its 21, the horizon lit
  float: RAFT + 14.4, // the laptop sets off to you
  type: [RAFT + 18.3, RAFT + 18.9], enter: RAFT + 19.05, card: RAFT + 19.7, // 部署上线
  night: YACHT,
  roll: YACHT + 5.6, again: YACHT + 8.2,
  freeze: YACHT + 12.5, land: YACHT + 15.0, title: YACHT + 20.0,
  card2: YACHT + 20.2, // the end card
};

// The Wired, at 72: its bar 3.33 s, laid so the live round lands on a downbeat; four bars
// back that puts its first downbeat on Clawd going into the noon screen.
export const WIRED_BPM = 72;
export const WIRED_BAR = (4 * 60) / WIRED_BPM;
export const WIRED_ONE = MACHINE_AT.bang - 4 * WIRED_BAR; // 9.99
// Lantern, at 70.6: six bars from the lit horizon to the dice freezing in the air, both on
// downbeats; four back is its first, on Clawd's dive into the dusk screen; and after the
// freeze the bars go on from the landing, three of them to the cut's end.
export const LANTERN_BAR = (RAFT_AT.freeze - RAFT_AT.lit) / 6; // 3.4 s
export const LANTERN_BPM = (4 * 60) / LANTERN_BAR;
export const LANTERN_ONE = RAFT_AT.lit - 4 * LANTERN_BAR; // 34.35
