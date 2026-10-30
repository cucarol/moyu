// The end of a game: who won, where each seat finished, the seal checked in the browser
// (sha256 of the revealed seed against the commit shown from the start), and how to play
// again. Roulette has its own in roulette-hud.js; the later games share this one.
import { t } from './i18n.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// The commit beside the game's name, from the first state on.
export function sealTag(commit) {
  let tag = document.querySelector('.brand .seal');
  if (!tag) {
    tag = el('span', 'seal');
    document.querySelector('.brand').append(tag);
  }
  tag.textContent = commit ? t('ui.ending.sealTag', { commit: commit.slice(0, 8) }) : '';
  tag.title = commit ? t('ui.ending.sealTitle', { commit }) : '';
}

let shownFor = null;

// How to play again: in a room, buttons (set by room.js); on a plain table, a word to the agent.
let again = null;
export function setAgain(fn) {
  again = fn;
}
export function againRow(opp) {
  if (again) return again();
  const row = el('div', 'result-again');
  row.append(el('span', 'key', t('ui.ending.again')), el('span', '', t('ui.ending.againHint', { name: opp })));
  return row;
}

// v: the final view. outcome: 'won' | 'lost' | 'draw'. rows: [[name, value]] for each seat.
// what: what the seed sealed (牌序, 骰子). opp: the agent's name.
export async function showEnding({ v, outcome, title, big, sub, rows, what, opp }) {
  if (shownFor === v.commit) return;
  shownFor = v.commit;
  const panel = el('section', `window result ${outcome}`);
  document.querySelector('.hud').append(panel);
  const head = el('div', 'window-title');
  const x = el('button', 'x', '×');
  x.onclick = () => (panel.hidden = true);
  head.append(el('span', '', title), x);
  const seats = el('div', 'result-seats');
  for (const [name, value] of rows) {
    const row = el('div', 'result-seat');
    row.append(el('span', 'result-name', name), el('span', 'result-value', value));
    seats.append(row);
  }
  const check = el('div', 'seal-check pending', t('ui.ending.checking'));
  const seal = el('div', 'result-seal');
  seal.append(
    el('div', 'seal-row', t('ui.ending.commitRow', { hash: `${v.commit.slice(0, 16)}…` })),
    el('div', 'seal-row', t('ui.ending.seedRow', { seed: v.seed ? `${v.seed.slice(0, 16)}…` : t('ui.ending.notYet') })),
    check,
  );
  const close = el('button', 'pixbtn', t('ui.ending.lookAtTable'));
  close.onclick = () => (panel.hidden = true);
  const actions = el('div', 'result-actions');
  actions.append(close);
  panel.append(head, el('div', 'result-big', big), el('div', 'result-sub', sub), seats, seal, againRow(opp), actions);
  if (!v.seed) return check.remove();
  try {
    const ok = (await sha256Hex(v.seed)) === v.commit;
    check.className = `seal-check ${ok ? 'ok' : 'bad'}`;
    check.textContent = ok ? t('ui.ending.sealOk', { what }) : t('ui.ending.sealBad');
  } catch {
    check.className = 'seal-check bad';
    check.textContent = t('ui.ending.noSha');
  }
}
