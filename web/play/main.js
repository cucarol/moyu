// The 3D table page: fits the pixel type to the display, builds the game's scene, then
// mounts the game on its table. At /t/<table>?k=<seat token> it is a seat at a real
// table of any game; at /web/play.html?game=... it is a preview. A room (/r/<room>) runs
// the same scenes and games in place: room.js.
import { createStage, layer } from './stage.js';
import { createHud } from './hud.js';
import { setVibe, placeSound } from './audio.js';
import { fitType } from './fit.js';
import { SCENES, sceneOf } from './scenes.js';

fitType();
await document.fonts.load('12px FusionPixel');

const GAMES = ['roulette', 'blackjack', 'yacht'];
const params = new URLSearchParams(location.search);
const table = location.pathname.match(/^\/t\/([0-9a-f]+)/)?.[1] ?? null;
// ?director=<script>: a scripted game, no server (web/play/director/); the script names its game
const director = params.get('director');
// A real table says which game it is; a preview takes ?game=.
async function gameOf() {
  if (director) {
    const g = (await import('./director/index.js').then((d) => d.load(director)).catch(() => null))?.game;
    return GAMES.includes(g) ? g : 'roulette';
  }
  if (!table) return GAMES.includes(params.get('game')) ? params.get('game') : 'roulette';
  const r = await fetch(`/api/tables/${table}/view?k=${params.get('k')}`).then((x) => x.json()).catch(() => null);
  return GAMES.includes(r?.view?.game) ? r.view.game : 'roulette';
}
const game = await gameOf();
// The HUD takes on each game's vibe through CSS keyed on this.
document.body.dataset.game = game;
setVibe(game);
document.body.dataset.scene = sceneOf(game);
const def = SCENES[sceneOf(game)];
const stage = createStage(document.querySelector('#view'), def.options);
const scene = def.build(layer(stage));
// ?pv: the scene in reach of a page console, to try the launch video's hooks (scene.pv)
if (params.has('pv')) window.__pv = { scene, stage };
placeSound(stage.camera, scene.casino?.sound ?? scene.sound); // sound: where its sources are
const mod = await import(`./${game}.js`);
mod.mount(layer(stage), { scene, createHud, table, k: params.get('k'), director });
