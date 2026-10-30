// The README's Yacht shot: the raft from your seat late in a close game, three sixes kept
// and two more rolled: a yacht, and Clawd can't believe it.
//   node scripts/director/render.mjs docs/media/shots/yacht.js --lang zh-CN --size 1600x900 --duration 9000 --every 15 --no-sound --no-mp4
export default {
  game: 'yacht',
  seats: { opp: 'Clawd' },
  first: 'you',
  hud: 'full',
  bgm: 'off',
  start: {
    sheets: {
      you: { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, choice: 22, four: 0, house: 25, small: 15 },
      opp: { ones: 2, twos: 8, threes: 9, fours: 16, fives: 15, sixes: 24, choice: 26, four: 24, house: 0, small: 15 },
    },
  },
  turns: [[6, 2, 6, 4, 6]],
  beats: [
    { who: 'you', keep: [0, 2, 4], roll: [6, 6], after: 600 },
    { say: { 'zh-CN': '……快艇？', en: '...a yacht?' }, mood: 'wide', after: 2000 },
  ],
  tail: 1000,
};
