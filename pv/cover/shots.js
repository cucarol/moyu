// For choosing the cover's shot: cover.js with the scene stopped and the camera trying poses
// round a point between the muzzle and the face, one every POSE ms, from the left of the seat
// (where the barrel points) to its right, low to high, near to far. Render it every 3 frames
// and each pose is one frame, in the order of CANDIDATES.
import cover, { HOLD } from './cover.js';

const POSE = 100;
const MID = [0.1, 1.38, -0.32];
export const CANDIDATES = [];
for (const d of [0.75, 1.0, 1.3])
  for (const h of [-0.08, 0.1, 0.26])
    for (const a of [-28, -16, -5, 6]) {
      const r = (a * Math.PI) / 180;
      CANDIDATES.push({ pos: [MID[0] + Math.sin(r) * d, MID[1] + h, MID[2] + Math.cos(r) * d], at: MID, fov: 46 - d * 8, breath: 0 });
    }
export default {
  ...cover,
  beats: [...cover.beats, ...CANDIDATES.map((cam, i) => ({ at: HOLD + 300 + i * POSE, cam, ms: 0 }))],
  tail: 300 + CANDIDATES.length * POSE + 200,
};
