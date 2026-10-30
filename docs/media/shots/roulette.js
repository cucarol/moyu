// The README's roulette shot: the machine room from your seat mid-game, both hands of items
// on the table, Clawd peeking with its 思维链 and pleased with what it saw.
//   node scripts/director/render.mjs docs/media/shots/roulette.js --lang zh-CN --size 1600x900 --duration 4000 --every 15 --no-sound --no-mp4
const L = (zh, en) => ({ 'zh-CN': zh, en });
export default {
  game: 'roulette',
  rules: 'short',
  seats: { you: L('你', 'You'), opp: 'Clawd' },
  start: {
    turn: 'opp',
    hp: { you: 3, opp: 2 },
    items: { you: ['refuse', 'limit', 'cache', 'jailbreak'], opp: ['cot', 'temp', 'mirage'] },
    shells: 'LBLB',
  },
  hud: 'full',
  bgm: 'off',
  beats: [{ who: 'opp', use: 'cot', say: L('嗯……这发我看过了。', 'Hm. I know this one.'), mood: 'smug', after: 2000 }],
  tail: 1000,
};
