// The README's 21 shot: the raft from your seat, the first hand dealt, Clawd doubling on 11.
//   node scripts/director/render.mjs docs/media/shots/blackjack.js --lang zh-CN --size 1600x900 --duration 7000 --every 15 --no-sound --no-mp4
export default {
  game: 'blackjack',
  seats: { opp: 'Clawd' },
  first: 'opp',
  hud: 'full',
  bgm: 'off',
  hands: [{ you: ['10S', '8H'], opp: ['6D', '5C'], draws: ['KH'] }],
  beats: [
    { say: { 'zh-CN': '这把我加倍。', en: "I'll double this one." }, mood: 'smug', after: 300 },
    { who: 'opp', act: 'double', after: 1800 },
  ],
  tail: 1000,
};
