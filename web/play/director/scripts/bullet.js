// A sample of bullet time: the agent throws all five dice from the cup at its chest; the
// scene stops with them in the air, the camera goes round them and the agent behind them on
// the film's clock, then the scene runs again and they land: a yacht. docs/director.md has
// the format.
export default {
  game: 'yacht',
  seats: { opp: 'Clawd' },
  first: 'opp',
  hud: 'bubble',
  start: {
    sheets: {
      you: { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, choice: 22, four: 0, house: 25, small: 15, large: 30 },
      opp: { ones: 2, twos: 8, threes: 9, fours: 16, fives: 15, sixes: 24, choice: 26, four: 24, house: 0, small: 15, large: 30 },
    },
  },
  turns: [[1, 3, 3, 5, 6]],
  beats: [
    { say: { 'zh-CN': '全部重掷。', en: 'All five again.' }, mood: 'smug' },
    // the throw goes on while the next beats run
    { who: 'opp', keep: [], roll: [6, 6, 6, 6, 6], alongside: true },
    // the dice leave the cup 640 ms into the throw: the scene slows to a stop as they spread
    { after: 700, timeScale: 0, ms: 120, for: 3150, back: 600, duck: 0.25 },
    // round them (where they hang once stopped) on the film's clock, the agent behind them
    { after: 140, orbit: { center: 'air', radius: 0.6, height: 0.06, from: -60, to: 45, fov: 34 }, ms: 3100, ease: 'inOut' },
    { cam: 'tray', ms: 900, ease: 'out' },
    { wait: 600 },
    { say: { 'zh-CN': '……', en: '...' }, mood: 'shocked' },
    { who: 'opp', score: 'yacht' },
  ],
  tail: 2000,
};
