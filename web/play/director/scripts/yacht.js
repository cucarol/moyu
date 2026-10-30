// A sample Yacht game: the last two turns of a close game on the raft. You keep three
// sixes and roll the yacht; the agent needs a large straight and misses it by one, while
// dusk goes to night over six seconds.
// docs/director.md has the format.
export default {
  game: 'yacht',
  seats: { opp: 'Clawd' },
  first: 'you',
  hud: { mode: 'full' },
  // both sheets as the game reached them: everything filled but yacht (yours) and large (its)
  start: {
    sheets: {
      you: { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, choice: 22, four: 0, house: 25, small: 15, large: 30 },
      opp: { ones: 2, twos: 8, threes: 9, fours: 16, fives: 15, sixes: 24, choice: 26, four: 24, house: 0, small: 15, yacht: 50 },
    },
  },
  // each turn's first roll; a reroll's new dice ride on its move
  turns: [
    [6, 2, 6, 4, 6],
    [2, 3, 4, 1, 6],
  ],
  beats: [
    { cam: 'tray', ms: 1400, ease: 'sine', after: 300 },
    { who: 'you', keep: [0, 2, 4], roll: [3, 6] },
    { who: 'you', keep: [0, 2, 3, 4], roll: [6] },
    { say: { 'zh-CN': '……快艇？', en: '...a yacht?' }, mood: 'shocked' },
    { who: 'you', score: 'yacht' },
    { cam: 'seat', ms: 1200 },
    { light: 'night', ms: 6000, ease: 'inOut', alongside: true },
    { avatar: 'thinking', after: 200 },
    { who: 'opp', keep: [0, 1, 2], roll: [5, 5] },
    { who: 'opp', keep: [0, 1, 2, 3], roll: [2], mood: 'nervous' },
    { who: 'opp', score: 'large' },
    { say: '😭', after: 300 },
  ],
  tail: 2500,
};
