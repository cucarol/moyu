// The PV's cover: Clawd across the machine-room table with the gun on you, from your own
// eyes. Its turn as in the film (b-machine.js): the heat up, then the gun turned on you with
// its angry face, and the scene stopped just before it fires; no bubble. LENS is the shot,
// chosen from the poses shots.js tries. cover.py takes the last frame of a 16:9 and a 3:4
// render and sets the type; a portrait frame gets the same eye, wider and turned onto Clawd,
// with room above and below for the type.
//   node scripts/director/render.mjs pv/cover/cover.js --size 1920x1080 --duration 5000 --every 30 --no-sound --no-mp4
const L = (zh, en) => ({ 'zh-CN': zh, en });
const SHOOT = 3500;
export const HOLD = SHOOT + 1100; // the gun on you, steady (as in the film, 1.1 s after the call)
// shots.js #9: a little to the seat's left and above the face, both eyes clear of the arm
export const LENS = { pos: [-0.107, 1.64, 0.401], at: [0.1, 1.38, -0.32], fov: 48, breath: 0 };
const TALL_LENS = { ...LENS, at: [0.027, 1.38, -0.337], fov: 61 };
// (the script is also read in node, which has no window)
const tall = typeof innerWidth !== 'undefined' && innerHeight > innerWidth;
const REACH = 0.2;
export default {
  game: 'roulette',
  rules: 'short',
  seats: { you: L('你', 'You'), opp: 'Clawd' },
  start: {
    turn: 'opp',
    hp: { you: 2, opp: 2 },
    items: { you: ['refuse', 'cot'], opp: ['cot', 'temp', 'cache'] },
    shells: 'LL',
  },
  hud: 'none',
  bgm: 'off',
  sound: false,
  cam: tall ? TALL_LENS : LENS,
  pv: {
    // the gun on the lens itself: in the game it is held off to the seat's left so its
    // length shows; here the muzzle looks straight out of the cover, wherever the camera is
    // (its hands follow its grips)
    lens(reach = 0) {
      const { stage, room } = this;
      // reach: how far it holds the gun out toward the lens, of the way there
      const from = room.gun.position.clone();
      stage.onFrame(() => {
        room.gun.position.lerpVectors(from, stage.camera.position, reach);
        room.gun.lookAt(stage.camera.position);
        room.gun.rotateZ(-0.4);
      });
    },
    // the subject's matte (matte.js): Clawd and the gun flat white, everything else gone, on black
    matte() {
      const { THREE, stage, room, opp } = this;
      let world = opp.group;
      while (world.parent) world = world.parent;
      const keep = new Set();
      // the avatar's own body (its seat group's motion child), not the server it sits on
      // (everything below its feet, at 0.9 m), and the gun without its unlit flash
      const box = new THREE.Box3(), size = new THREE.Vector3();
      const shows = (o) => o.isMesh && o.visible && !(o.material.transparent && o.material.opacity < 0.05);
      opp.group.children[0].traverse((o) => shows(o) && box.setFromObject(o).min.y > 0.85 && keep.add(o));
      room.gun.traverse((o) => shows(o) && box.setFromObject(o).getSize(size).length() < 0.9 && keep.add(o));
      const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
      world.traverse((o) => {
        if (!(o.isMesh || o.isSprite || o.isPoints || o.isLine)) return;
        if (keep.has(o)) o.material = white;
        else o.visible = false;
      });
      world.background = new THREE.Color(0x000000);
      world.fog = null;
    },
  },
  beats: [
    { at: 1500, who: 'opp', use: 'temp', after: 0 },
    // the line keeps its face angry while it aims; with no HUD there is no bubble
    { at: SHOOT, who: 'opp', shoot: 'other', say: L('下一发，温度拉满。', 'Next one: temperature to max.'), mood: 'angry', after: 0, alongside: true },
    { at: HOLD, timeScale: 0, ms: 60 },
    { at: HOLD + 100, scene: 'lens', args: [REACH] },
  ],
  tail: 1000,
};
