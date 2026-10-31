// The avatars the page knows, and which one sits across from you: ?avatar=<id> picks
// one, Clawd by default. A settings pane picks it later (docs/avatar.md).
import { createAvatar } from './core.js';
import clawd from './clawd.js';

export { STATES } from './core.js';
export const AVATARS = { clawd };

export function seatAvatar(stage, opts) {
  const id = new URLSearchParams(location.search).get('avatar');
  return createAvatar(stage, AVATARS[id] ?? clawd, opts);
}
