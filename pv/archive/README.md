# PV archive

Designs the PV turned down, kept for reference; nothing in the live build loads them.

- `work-portal/`: 2026-10-31, the work shots as a little 3D world seen through the game screens (portal.js drew a world behind a pane of glass, and needed a `stage.setView` hook since removed from stage.js). Replaced by the cubicle (`pv/cubicle/`).
- The desk as the rebuilt Code tab in Anthropic Sans (2026-10-30, `desk.html`, with `pv/app-ui-extract.py`): stylised real, then animated motion design, its shots also on the CRT and raft laptop. Replaced by the cubicle and its pixel UI on every screen. Removed before the open-source release (it was built on the app's own font); git history has it.
- `terminal.html`: the first opener, a terminal. Replaced by the desk, then the cubicle.
- The desk at night (`cubicle.js ?shot=night`: its light, its shout 等部署的时候 / 最后一局！): 2026-10-31, cut from the film when 21 and Yacht became one stretch on the raft, the laptop floating over for the deploy. It was three table rows in the then-uncommitted cubicle code, so they are kept here: `LIGHT.night = { hemi: [0x2c3550, 0x0c0b12, 0.04], sun: [0x5a78d8, 1.6], dir: [-0.25, -0.12, -0.96], screen: 0.8, fill: [0xd8c8f0, 0.42], bg: 0x05060a, lofi: 0.2 }`; `ASKS.night = { text: ['部署上线', 'ship it'], type: [1.4, 2.1], send: 2.3, reply: ['好，开始部署。', 'Deploying now.'], card: 3.1, job: 'deploy' }`; its beats as dusk's, 8.2 s, clock 21:47.
- `tube-off.js`: 2026-10-31, machine room → dusk as a CRT going off like an old tube and the desk's laptop waking the same way. Replaced by the game shrinking into a window on the dusk laptop (pv/cut/join.py).
- `score-v1/`: 2026-10-31, the PV score made before the picture (96 bpm, the cut fitted to its beat map). Replaced by `pv/score/`, the Wired and Lantern arranged to the finished cut; its Surge XT v2 stays in `pv/score/v2/` for the game's sound scripts.
