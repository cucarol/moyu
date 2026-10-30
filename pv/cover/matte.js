// The cover's subject matte: cover.js, then Clawd and the gun flat white on black (its last
// frame lines up with cover.js's), for cover.py to set the subject apart from the room.
import cover, { HOLD } from './cover.js';

export default { ...cover, beats: [...cover.beats, { at: HOLD + 300, scene: 'matte' }] };
