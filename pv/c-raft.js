// The PV's third part (story.js PARTS.raft): the raft at dusk. It opens on the laptop on its
// side table at the cut's frame, the session the desk at dusk left (cubicle/screen.js: the
// build crawling, Clawd away), and pulls straight back to your seat. While the build runs, the
// fishing boats along the horizon light their lanterns one by one. Clawd peeks at its hole
// card, doubles on 11, you call and stand on 19, and its king makes 21 on the score's
// LIT, the camera low over both hands: the build is done (story.js) and the whole horizon
// lights behind it, the camera easing back to the seat. Then Clawd waves
// the laptop over: it lifts off its table and floats to you, the camera goes into it, and you
// ask for the deploy there (story.js ASKS.raft); the Yacht part picks up on the same frame, the
// laptop still in the air. Times here are the part's own.
import { sessionScreen, cutShot } from './cubicle/screen.js';
const L = (zh, en) => ({ 'zh-CN': zh, en });
const HUD = { mode: 'bubble', bubble: 1.25 }; // only Clawd's lines on screen, big enough to read in the film
const LIT = 12500; // the build is done (story.js), in this part's time
const OVER = LIT + 1900; // the laptop sets off
const CUT = cutShot('laptop', 240);
export default {
  game: 'blackjack',
  seats: { you: L('你', 'You'), opp: 'Clawd' },
  first: 'opp',
  hands: [{ you: ['10S', '9H'], opp: ['6D', '5C'], draws: ['KH'] }],
  hud: 'none',
  bgm: 'off', // the room's sound and the game's only: the PV's own score plays over the cut (pv/score/)
  cam: CUT,
  screens: { laptop: sessionScreen('raft') },
  beats: [
    // out of the laptop, straight back to the seat, the sea and the boats behind Clawd
    { cam: 'seat', ms: 3000, ease: 'inOut', alongside: true },
    { scene: 'boatsProgress', tween: [0, 1], ms: LIT - 200, ease: 'sine', alongside: true },
    { at: 2700, hud: HUD },
    { at: 3000, avatar: 'hideCard' },
    { at: 4300, who: 'opp', act: 'double', say: L('11，加倍。', '11. Double.'), mood: 'smug', after: 0 },
    { at: 6400, who: 'you', act: 'call', after: 0 },
    // low over both hands for the turn-over, about 2 s after your stand (pinned back from
    // horizonLit), then back to the seat for its cheer and the laptop
    { at: 8800, cam: 'cards', ms: 1400, ease: 'inOut', alongside: true },
    { at: LIT - 2050, who: 'you', act: 'stand', after: 0, alongside: true },
    // the hands turn over: its king makes 21, and the horizon lights
    { at: LIT, scene: 'boatsDone', avatar: 'cheer' },
    { at: LIT + 300, say: L('打好了，我也赢了。', 'Built. And I won.'), mood: 'happy', alongside: true },
    { at: LIT + 600, cam: 'seat', ms: 1600, ease: 'inOut', alongside: true },
    // it waves the laptop over: off its table and through the air to you, and into it
    { at: OVER - 300, avatar: 'wave' },
    { at: OVER, scene: 'laptop', tween: [0, 1], ms: 1700, ease: 'inOut', alongside: true },
    { at: OVER + 1500, hud: 'none' },
    { at: OVER + 1700, cam: CUT, ms: 1600, ease: 'inOut', alongside: true },
  ],
  tail: 20600 - (OVER + 1700), // you type the deploy into it (story.js), to the part's end
};
