// Every avatar state on buttons, to look at them without playing: add ?avatar-review
// to the page (a preview or a real table). [ and ] step through the states, P plays
// them all in turn. With a room, the aim states move the room's gun as the game would;
// in a room without cards, chips and a cup, the casino states get stand-ins.
import * as THREE from 'three';
import { STATES, MOODS } from './core.js';

const ITEM_IDS = ['cot', 'mirage', 'compact', 'inject', 'temp', 'limit', 'refuse', 'cache', 'jailbreak'];
const EMOJIS = ['😂', '😤', '😏', '😱', '🙏', '😭', '👍', '🐟', '❤️'];
const AIM = { aimYou: ['opp', 'you'], aimSelf: ['opp', 'opp'], aimedAt: ['you', 'opp'], watching: ['you', 'you'] };
const CASINO = /^(think(Hand|Call|Keep|Pad)|peekCard|drawCard|stand|double|call|fold|noticeDouble|reveal|bust|natural|winPot|losePot|push|rollDice|scoreBox|yacht|noticeDice)$/;

// Plain boxes where a casino room would have its things; the cup can be shaken.
function standIns(opp) {
  const scene = opp.group.parent;
  const lambert = (color) => new THREE.MeshLambertMaterial({ color });
  const add = (mesh, name, lift = 0) => {
    mesh.position.copy(opp.propAt(name)).add(new THREE.Vector3(0, lift, 0));
    scene.add(mesh);
    return mesh;
  };
  const cards = new THREE.Group();
  for (const x of [-0.035, 0.035]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.004, 0.085), lambert(0xe8e2d0));
    c.position.x = x;
    cards.add(c);
  }
  add(cards, 'cards');
  for (const [name, n] of [['chips', 6], ['pot', 3]]) {
    const g = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const chip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.008, 10), lambert(i % 2 ? 0xc9a24a : 0x8a1a22));
      chip.position.y = i * 0.009;
      g.add(chip);
    }
    add(g, name);
  }
  add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.085), lambert(0x2a3a8a)), 'deck');
  add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.18), lambert(0x1a3020)), 'tray', -0.01);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.004, 0.14), lambert(0xe8e2d0)), 'pad', -0.005);
  const cup = add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.032, 0.1, 10), lambert(0x5a2a18)), 'tray', 0.05);
  cup.position.x += 0.2;
  cup.userData.grips = { a: new THREE.Vector3(0.04, 0, 0), b: new THREE.Vector3(0, 0.05, 0) };
  opp.setProps({ cards, chips: opp.propAt('chips'), pot: opp.propAt('pot'), cup });
  return { cup, cupRest: cup.position.clone() };
}

export function reviewAvatar(opp, room = null) {
  if (!new URLSearchParams(location.search).has('avatar-review')) return;
  const box = document.createElement('section');
  box.className = 'window avatar-review';
  box.style.cssText = 'position:fixed;right:12px;top:64px;bottom:auto;left:auto;transform:none;width:auto;max-height:80vh;overflow:auto;pointer-events:auto;z-index:20;padding:8px';
  box.innerHTML = `<div class="window-title">${opp.name} · 形象状态</div>`;
  const opts = document.createElement('div');
  opts.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin:6px 0';
  const select = (list, label) => {
    const s = document.createElement('select');
    s.title = label;
    for (const v of list) s.append(new Option(v, v));
    opts.append(s);
    return s;
  };
  const item = select(ITEM_IDS, 'item');
  const emoji = select(EMOJIS, 'emoji');
  const live = select(['live', 'blank'], 'fire');
  const hp = select(['4', '2', '1'], '额度');
  const outcome = select(['plain', 'big', 'zero'], 'pot / score');
  const mood = select(['no mood', ...MOODS], 'mood (emote, talking)');
  const glanceAt = select(['crt', 'camera', 'deck', 'chips', 'pot'], 'glance at');
  box.append(opts);

  const names = Object.keys(STATES);
  let at = -1;
  let aimed = false;
  let props = null;
  const buttons = names.map((name, i) => {
    const b = document.createElement('button');
    b.className = 'pixbtn';
    b.style.cssText = 'display:block;width:100%;text-align:left;margin:2px 0';
    b.textContent = `${STATES[name].loop ? '◆' : '▸'} ${name}`;
    b.title = STATES[name].desc;
    b.onclick = () => show(i);
    box.append(b);
    return b;
  });
  document.querySelector('.hud').append(box);
  window.avatarReview = { opp, show: (name) => show(names.indexOf(name)) }; // for poking at it from the console

  // the stand-in cup: up to where the avatar holds it, shaken, poured, put back
  function shakeCup(ms) {
    const { cup, cupRest } = props;
    const hold = opp.anchors.holdCup;
    const pour = opp.propAt('tray').add(new THREE.Vector3(0, 0.12, 0));
    const t0 = performance.now();
    (function step() {
      const k = (performance.now() - t0) / ms;
      if (k < 0.2) cup.position.lerpVectors(cupRest, hold, k / 0.2);
      else if (k < 0.75) cup.position.copy(hold).add(new THREE.Vector3(0, Math.sin(k * 120) * 0.03, 0));
      else if (k < 0.9) {
        cup.position.lerpVectors(hold, pour, (k - 0.75) / 0.15);
        cup.rotation.z = ((k - 0.75) / 0.15) * 1.8;
      } else cup.position.lerpVectors(pour, cupRest, (k - 0.9) / 0.1);
      if (k < 1) requestAnimationFrame(step);
      else {
        cup.position.copy(cupRest);
        cup.rotation.z = 0;
      }
    })();
  }

  // the blips the voice would send (web/play/audio.js speak), one per character
  function fakeVoice(text) {
    const chars = [...text].filter((c) => c.trim());
    chars.forEach((c, i) => {
      const loud = /[！!？?]/.test(c) ? 1 : 0.3 + Math.random() * 0.7;
      setTimeout(() => opp.blip?.({ i, at: i * 97, dur: 78, loud, last: i === chars.length - 1 }), i * 97);
    });
  }

  async function show(i) {
    at = i;
    buttons.forEach((b, j) => (b.style.outline = j === i ? '2px solid currentColor' : ''));
    const name = names[i];
    if (CASINO.test(name) && !props && !Object.keys(opp.props).length) props = standIns(opp);
    const points = { plain: 12, big: 30, zero: 0 }[outcome.value];
    const detail = {
      hp: Number(hp.value), item: item.value, emoji: emoji.value, mood: MOODS.includes(mood.value) ? mood.value : undefined, at: glanceAt.value, live: live.value === 'live', damage: 1, text: '这一发我赌是空的！你敢不敢？', gun: room?.gun,
      big: outcome.value === 'big', zero: outcome.value === 'zero', points, kept: [0, 2], rollNo: 2, yacht: name === 'noticeDice' && outcome.value === 'big',
    };
    if (room?.aim && AIM[name]) {
      opp.setState(name, detail);
      await room.aim(...AIM[name]);
      aimed = true;
      return;
    }
    if (room?.aim && name === 'fire') {
      if (!aimed) await room.aim('opp', 'you');
      aimed = true;
      opp.setState('fire', detail);
      return room.fire(detail.live);
    }
    if (room?.hit && name === 'hit') room.hit('opp');
    if (name === 'rollDice' && props) shakeCup(STATES.rollDice.ms);
    if (name === 'talking') fakeVoice(detail.text);
    if (STATES[name].loop) {
      opp.setState(name, detail);
      if (aimed && room) {
        aimed = false;
        room.lower();
      }
    } else await opp.setState(name, detail);
  }

  let playing = false;
  async function playAll() {
    playing = !playing;
    for (let i = 0; playing && i < names.length; i++) {
      await show(i);
      await new Promise((r) => setTimeout(r, STATES[names[i]].loop ? 2200 : 400));
    }
    playing = false;
  }
  window.addEventListener('keydown', (e) => {
    if (document.activeElement?.tagName === 'INPUT') return;
    if (e.key === ']') show((at + 1) % names.length);
    else if (e.key === '[') show((at - 1 + names.length) % names.length);
    else if (e.key === 'p' || e.key === 'P') playAll();
  });
}
