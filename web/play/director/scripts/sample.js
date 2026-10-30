// The sample: a short game joined at its last load, 小摸 on its last 额度. Its 幻觉 makes
// a 提示词注入 that was never there, it goes 温度拉满 anyway, and your 作为一个 AI 语言模型
// eats the shot; you 越狱 its /compact to throw out the blank and take it with the last live.
export default {
  game: 'roulette',
  rules: 'short',
  seats: { you: { 'zh-CN': '你', en: 'You' }, opp: { 'zh-CN': '小摸', en: 'Momo' } },
  start: {
    turn: 'opp',
    hp: { you: 2, opp: 1 },
    items: { you: ['jailbreak', 'cot', 'refuse'], opp: ['temp', 'mirage', 'cache'] },
    shells: 'LBL',
    fired: 'BL',
  },
  beats: [
    { say: { 'zh-CN': '只剩一格额度了。', en: 'One bar of quota left.' }, mood: 'flat', after: 400 },
    { who: 'opp', use: 'mirage', makes: ['inject:fake', 'compact:real'], say: { 'zh-CN': '幻觉，启动。', en: 'Hallucination: on.' }, mood: 'smug' },
    { who: 'opp', use: 'inject', mood: 'wide' },
    { say: { 'zh-CN': '……这个工具不存在？', en: '...that tool never existed?' }, mood: 'wide' },
    { who: 'opp', use: 'temp', say: { 'zh-CN': '那就温度拉满。', en: 'Then temperature to max.' }, mood: 'angry' },
    { cam: 'agent', ms: 700, after: 300 },
    { who: 'opp', shoot: 'other', after: 600 },
    { cam: 'seat', ms: 600 },
    { who: 'you', use: 'jailbreak', pick: 'compact', after: 800 },
    { who: 'you', shoot: 'other', aim: 1100 },
    { say: { 'zh-CN': '……下一局。', en: '...next game.' }, mood: 'sad', after: 900 },
  ],
  tail: 2500,
};
