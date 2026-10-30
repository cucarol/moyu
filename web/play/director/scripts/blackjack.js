// A sample 21 game: two hands on the raft. The agent doubles on 11 and you call; then
// you stand on 19 and it hits into a bust. Along the way: a canvas drawn every frame on the
// laptop's screen, a camera path through the cards into that screen, the agent's think pose,
// and a scene hook of the script's own (a warm light over the felt) eased up and down.
// docs/director.md has the format.

// the laptop's picture: the agent's odds of busting, counting up (t: ms on the scene's clock)
function odds(ctx, { t, w, h, lang }) {
  const zh = lang === 'zh-CN';
  ctx.fillStyle = '#071410';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#7dffc0';
  ctx.font = `bold 34px ${zh ? 'sans-serif' : 'monospace'}`;
  ctx.fillText(zh ? '爆牌概率' : 'BUST ODDS', 36, 84);
  const k = Math.min(1, t / 2400);
  const pct = Math.round(62 * (1 - Math.pow(1 - k, 3)));
  ctx.font = 'bold 120px monospace';
  ctx.fillText(`${pct}%`, 36, 214);
  ctx.strokeStyle = '#7dffc0';
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 250, w - 72, 40);
  ctx.fillRect(42, 256, (w - 84) * (pct / 100), 28);
  ctx.font = '24px monospace';
  ctx.fillStyle = '#4fae84';
  ctx.fillText(zh ? '手牌 16 · 你亮 Q' : 'hand 16 · you show Q', 36, 340);
  if (Math.floor(t / 500) % 2) ctx.fillRect(36, 356, 14, 24);
}

export default {
  game: 'blackjack',
  seats: { opp: 'Clawd' },
  first: 'opp',
  hud: 'full',
  hands: [
    // each seat's [up, hole], then the draws in play order
    { you: ['10S', '8H'], opp: ['6D', '5C'], draws: ['KH', '2C'] },
    { you: ['QS', '9D'], opp: ['7H', '9C'], draws: ['8S'] },
  ],
  // a scene hook of the script's own; this is { THREE, stage, scene, casino, room, opp }
  pv: {
    glow(k) {
      if (!this.glow) {
        this.glow = new this.THREE.PointLight(0xffa050, 0, 2.2, 1.6);
        this.glow.position.set(0, 1.3, -0.05);
        this.stage.scene.add(this.glow);
      }
      this.glow.intensity = k;
    },
  },
  beats: [
    { say: { 'zh-CN': '这把我加倍。', en: "I'll double this one." }, mood: 'smug', after: 600 },
    { who: 'opp', act: 'double' },
    { scene: 'glow', tween: [0, 5], ms: 1200, ease: 'sine', alongside: true },
    { who: 'you', act: 'call' },
    { who: 'you', act: 'hit' },
    { who: 'you', act: 'stand' },
    { scene: 'glow', tween: [5, 0], ms: 1500, ease: 'sine', alongside: true },
    { cam: 'cards', ms: 1600, ease: 'sine' },
    { cam: 'seat', ms: 1200, after: 800 },
    { who: 'you', act: 'stand' },
    { avatar: 'thinkHand', after: 200 },
    // the odds go up on the laptop beside the felt (a stand-in until the raft has its own),
    // and one continuous shot goes over the cards and into it until its glass fills the frame
    { screen: { name: 'laptop', draw: odds, size: [640, 400] }, alongside: true },
    { cam: ['cards', 'laptop'], ms: 3200, ease: 'inOut', after: 300, hud: 'none' },
    { wait: 1800 },
    { cam: 'seat', ms: 1600, ease: 'inOut' },
    { who: 'opp', act: 'hit', mood: 'nervous', hud: 'full' },
    { who: 'opp', act: 'stand' },
    { say: '😭', after: 400 },
  ],
  tail: 2000,
};
