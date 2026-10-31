// The README's 21 shot: the raft from your seat, the first hand dealt, Clawd betting the pot on 11.
//   node scripts/director/render.mjs docs/media/shots/blackjack.js --lang zh-CN --size 1600x900 --duration 7000 --every 15 --no-sound --no-mp4
export default {
  game: 'blackjack',
  seats: { opp: 'Clawd' },
  first: 'opp',
  hud: 'full',
  bgm: 'off',
  hands: [{ you: ['10S', '8H'], opp: ['6D', '5C'], draws: ['KH'] }],
  beats: [
    { say: { 'zh-CN': '这把我押一个底池。', en: 'Pot. Your move.' }, mood: 'smug', after: 300 },
    { who: 'opp', act: 'bet', after: 1800 },
  ],
  tail: 1000,
};
