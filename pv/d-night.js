// The PV's fourth part (story.js PARTS.yacht): the raft going from the last of the dusk to
// night. It opens on the laptop at the cut's frame, still floating where the raft part left it
// before your seat (pv-raft.js laptop), the deploy you just asked for crawling on it
// (cubicle/screen.js), and pulls out as the laptop floats back to its table, while the light
// goes and the stars come out with the deploy. Clawd's last roll comes up with no six at all,
// so it throws all five again on the score's riser; the scene stops with them in the air at
// FREEZE, the camera goes round them and on down onto the tray in one move, and they land five
// sixes at LAND, as the deploy goes live (story.js). A school of glowing fish rises and
// swims into "moyu" on the night sea while the camera climbs to look straight down on it,
// the word made at TITLE. The end card goes over its last part, from just after the word.
// Times here are the part's own.
import { sessionScreen, cutShot } from './cubicle/screen.js';
const L = (zh, en) => ({ 'zh-CN': zh, en });
const HUD = { mode: 'bubble', bubble: 1.25 }; // only Clawd's lines on screen, big enough to read in the film
const FREEZE = 12500; // yachtFreeze, in this part's time
const LAND = 15000; // yachtLand
const CUT = cutShot('laptop', 240);
const TITLE = 20000; // title: the word is made
export default {
  game: 'yacht',
  seats: { you: L('你', 'You'), opp: 'Clawd' },
  first: 'opp',
  start: {
    sheets: {
      you: { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, choice: 22, four: 0, house: 25, small: 15, large: 30 },
      opp: { ones: 2, twos: 8, threes: 9, fours: 16, fives: 15, sixes: 24, choice: 26, four: 24, house: 0, small: 15, large: 30 },
    },
  },
  turns: [[1, 3, 3, 5, 6]],
  hud: 'none',
  bgm: 'off', // the room's sound and the game's only: the PV's own score plays over the cut (pv/score/)
  cam: CUT,
  light: 0.55, // the last of the dusk: the desk is already in the dark
  screens: { laptop: sessionScreen('yacht') },
  beats: [
    // the laptop where the raft part left it, in the air, and the camera on its cut's frame
    { scene: 'laptop', args: [1] },
    { cam: CUT },
    // back to the seat as it floats home
    { cam: 'seat', ms: 3000, ease: 'inOut', alongside: true },
    { light: 'night', ms: 9000, ease: 'inOut', alongside: true },
    { scene: 'starsProgress', tween: [0, 1], ms: LAND - 200, ease: 'sine', alongside: true },
    { at: 1000, scene: 'laptop', tween: [1, 0], ms: 1900, ease: 'inOut', alongside: true },
    { at: 2700, hud: HUD },
    { at: 2900, say: L('最后一局！', 'Last one!'), mood: 'happy' },
    { at: 4100, say: L('就差一个快艇。', 'Just the yacht left.'), mood: 'flat' },
    { at: 5600, who: 'opp', keep: [], roll: [2, 3, 5, 1, 2], after: 0 },
    { at: 8200, say: L('……全部重掷。', '…all five again.'), mood: 'smug' },
    { at: 10200, cam: 'seat', ms: 1500, ease: 'inOut', alongside: true }, // on Clawd and its cup, so the throw stays in frame
    // the throw: the dice leave the cup 640 ms in; the scene stops with them in the air
    { at: FREEZE - 700, who: 'opp', keep: [], roll: [6, 6, 6, 6, 6], alongside: true, hud: 'none' },
    { at: FREEZE - 60, timeScale: 0, ms: 120, for: LAND - FREEZE - 900, back: 500, duck: 0.25 },
    // round the dice in the air and on down onto the tray as they land, one move
    // from the seat it spirals in on them and keeps going round to the right, then down onto the
    // tray from that side: one way all along, never doubling back
    { at: FREEZE + 80, orbit: { center: 'air', radius: 0.6, height: 0.06, to: 50, fov: 34 }, cam: 'trayRight', ms: LAND + 200 - FREEZE - 80, ease: 'sine', alongside: true },
    // five sixes: Clawd cheers, a twinkle runs across the stars, the fish rise
    // it cheers as they come down, arms up, before the camera is over the tray: its pour and its
    // thinking over the dice (clawd.js rollDice, thinkKeep) both stretch an arm into that shot
    { at: LAND - 250, avatar: 'cheer' },
    { at: LAND + 150, scene: 'starsDone' },
    { at: LAND + 400, cam: 'wide', ms: 1100, ease: 'inOut', alongside: true },
    { at: TITLE - 3800, scene: 'fishSchool' },
    // up and over to look straight down on the word (screen up = toward the horizon, -z)
    { at: TITLE - 3500, cam: [{ pos: [0.6, 4.5, 2.2], at: [0, 0.4, -4] }, { pos: [0, 10.5, -5.95], at: [0, 0, -6.05], fov: 40 }], ms: 3700, ease: 'inOut', alongside: true },
    { at: LAND + 1600, who: 'opp', score: 'yacht', alongside: true },
  ],
  tail: TITLE + 200 + 5000 - (LAND + 1600), // the end card from just after the word (pv/endcard.html END)
};
