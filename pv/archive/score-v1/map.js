// The PV score's clock: one tempo, bars of four beats, and where the picture's moments
// fall. Shared by the score (score.js, in the browser) and its renderer (render.mjs, in
// Node), which writes it out as beatmap.json for cutting the picture.
export const BPM = 96;
export const BEAT = 60 / BPM; // 0.625 s
export const BAR = 4 * BEAT; // 2.5 s
export const BARS = 32;
export const LENGTH = BARS * BAR; // 80 s
export const RATE = 48000;
// bar counts from 0 here; the beat map counts bars and beats from 1, as an editor does
export const at = (bar, beat = 0) => bar * BAR + beat * BEAT;

export const SECTIONS = [
  { name: 'terminal', from: 0, to: 3 },
  { name: 'machineRoom', from: 3, to: 12 },
  { name: 'raft', from: 12, to: 19 },
  { name: 'night', from: 19, to: 25 },
  { name: 'drop', from: 25, to: 29 },
  { name: 'endCard', from: 29, to: 32 },
];

export const MARKERS = {
  ask: at(1, 2), // Clawd's 来一局？ goes in the gap here
  liveShot: at(8),
  testsPass: at(11),
  horizonLit: at(18),
  riser: at(23),
  yachtFreeze: at(24),
  yachtLand: at(25),
  title: at(27),
  end: at(31, 2), // the button
};

const ms = (t) => Math.round(t * 1000) / 1000;
export function beatMap() {
  return {
    bpm: BPM,
    beatsPerBar: 4,
    sampleRate: RATE,
    duration: LENGTH,
    note: 'Times in seconds from the start of score.wav. Bars and beats count from 1.',
    markers: Object.fromEntries(Object.entries(MARKERS).map(([k, t]) => [k, ms(t)])),
    sections: SECTIONS.map((s) => ({ name: s.name, start: ms(at(s.from)), end: ms(at(s.to)), bars: [s.from + 1, s.to] })),
    bars: Array.from({ length: BARS }, (_, i) => ({ bar: i + 1, time: ms(at(i)) })),
    beats: Array.from({ length: BARS * 4 }, (_, i) => ({ bar: Math.floor(i / 4) + 1, beat: (i % 4) + 1, time: ms(i * BEAT) })),
  };
}
