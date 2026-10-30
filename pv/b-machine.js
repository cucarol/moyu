// The PV's second part (story.js PARTS.machine): the machine room after lunch. It opens on
// the small CRT on top at the right at the cut's frame, the session the desk at noon left (cubicle/screen.js: the
// same picture, the tests crawling, Clawd away from its input box); the picture tears and
// coarsens into the room's own green tube, and the camera pulls out to the seat. Clawd plays its
// turn: it thinks its way to the chamber (思维链), takes the blank on itself, turns the heat up and
// fires the live round at you on the score's liveShot (film 20 s), and your 作为一个 AI 语言模型
// eats it; the camera eases back to the whole room. Meanwhile the tests fill the racks with green
// LEDs; they pass at PASS (story.js: the test job's end), a green wave runs through the room and
// Clawd cheers. The last half second shrinks into a window on the desk at dusk (pv/cut/join.py).
// Times here are the part's own.
import { sessionScreen, cutShot } from './cubicle/screen.js';
const L = (zh, en) => ({ 'zh-CN': zh, en });
const HUD = { mode: 'bubble', bubble: 1.25 }; // only Clawd's lines on screen, big enough to read in the film
// a line on its own holds for the Chinese line's read time (director readMs), so the longer
// English one keeps the same beats
const PASS = 17500; // the tests pass (story.js), in this part's time
const GLITCH = [0.35, 0.8]; // the session tearing into the room's tube, then the screen is the room's
// the small CRT on top at the right; its glass is 288 texels tall; the near plane just short of it
// cuts the tube's glow off the glass
const CUT = { ...cutShot('crtTop', 288), near: 0.16 };
const NEAR = { screen: 'crtTop', fit: 0.45, fov: 40 }; // a step back from it: the whole glass, the tube round it
export default {
  game: 'roulette',
  rules: 'short',
  seats: { you: L('你', 'You'), opp: 'Clawd' },
  start: {
    turn: 'opp',
    hp: { you: 2, opp: 2 },
    items: { you: ['refuse', 'cot'], opp: ['cot', 'temp', 'cache'] },
    shells: 'BLL',
    fired: 'B',
  },
  hud: 'none',
  bgm: 'off', // the room's sound and the game's only: the PV's own score plays over the cut (pv/score/)
  cam: CUT,
  screens: { crtTop: sessionScreen('machine', { H: 288, glitch: GLITCH }) },
  beats: [
    // out of the glass to the seat, the desk easing back out with it
    { cam: 'seat', via: [NEAR], ms: 2600, ease: 'inOut', alongside: true },
    { at: GLITCH[1] * 1000 + 30, screen: { name: 'crtTop', off: true } },
    { scene: 'rackProgress', tween: [0.08, 1], ms: PASS - 200, ease: 'linear', alongside: true },
    { at: 2300, hud: HUD },
    // its blank on itself plays out for about 3.6 s and the live one 1.7 s after its beat
    // starts, so the beats are pinned back from liveShot (12.5 s here)
    { at: 1900, say: L('三分钟，够打一局。', 'Three minutes. One round.'), mood: 'happy', hold: 1680 },
    { at: 3700, who: 'opp', use: 'cot', say: L('让我想想……', 'Let me think…'), mood: 'squint', after: 0 },
    { at: 5100, who: 'opp', shoot: 'self', say: L('空的～', 'Blank~'), mood: 'smug', after: 0 },
    { at: 8800, who: 'opp', use: 'temp', say: L('下一发，温度拉满。', 'Next shot: max temperature.'), mood: 'angry', after: 0 },
    { at: 10800, who: 'opp', shoot: 'other', after: 0 },
    { say: L('？？？', '???'), mood: 'wide', after: 200, hold: 700 },
    // back to the whole room, slowly enough to carry on through the wait
    { cam: 'wide', ms: 5000, ease: 'inOut', alongside: true },
    { emote: '😭', after: 300, hold: 900 },
    { say: L('……测试快好了。', '…tests are almost done.'), mood: 'flat', after: 100, hold: 1560 },
    // all pass: the wave, Clawd cheering
    { at: PASS, scene: 'rackWave', avatar: 'cheer' },
    { at: PASS + 200, hud: 'none' },
  ],
  tail: 1400, // the wave through the room; its last 0.5 s shrinks into the dusk desk's window
};
