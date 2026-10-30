// A sample of the machine room's left CRT: a terminal page on its glass, the camera
// pushing in from the seat until the glass fills the frame, holding while it types, and
// pulling back out. The agent glances at it first. docs/director.md has the format.
export default {
  game: 'roulette',
  rules: 'short',
  seats: { opp: 'Clawd' },
  start: { turn: 'opp', hp: { you: 2, opp: 2 }, items: { you: ['cot'], opp: ['cache'] }, shells: 'LB' },
  hud: 'bubble',
  // ../examples/terminal.html, relative to this script; it runs on the page's clock
  crt: { html: '../examples/terminal.html', size: [640, 480] },
  beats: [
    { avatar: 'thinking', after: 300 },
    { say: { 'zh-CN': '看那台屏幕。', en: 'Look at that screen.' }, mood: 'smug' },
    // a three-quarter view of the set on the way, then square on, the glass filling the frame
    { cam: 'crt', via: ['crtNear'], ms: 2600, ease: 'inOut' },
    { wait: 2600 },
    { cam: 'seat', ms: 2200, ease: 'inOut' },
    { who: 'opp', shoot: 'other' },
  ],
  tail: 1500,
};
