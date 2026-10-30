// Roulette's own HUD pieces on top of the shared HUD (the shells left are on the table,
// in the rack beside the gun): the seal tag, a match's round and score under the game's name, the banner between
// rounds, and the result panel at the end with an in-browser check that the revealed
// seed matches the commit shown at the start.
import { againRow } from './ending.js';
import { t } from './i18n.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Each seat's 额度 and items are on the table itself (the racks and the item tiles, with
// their hover hints), so there are no seat cards up here.
export function createTableHud() {
  const hud = document.querySelector('.hud');

  // ---- the seal tag beside the game's name ----
  const sealTag = el('span', 'seal');
  document.querySelector('.brand').append(sealTag);

  // ---- a match: which round, and the rounds each seat has taken, under the name ----
  const match = el('div', 'match');
  match.hidden = true;
  document.querySelector('.brand').append(match);
  const dots = (n, of) => Array.from({ length: of }, (_, i) => el('i', `win ${i < n ? 'on' : 'off'}`));

  // ---- the banner between rounds ----
  const banner = el('section', 'round-banner');
  banner.hidden = true;
  hud.append(banner);

  // ---- the result panel ----
  const result = el('section', 'window result');
  result.hidden = true;
  hud.append(result);
  let resultFor = null;

  return {
    // v: the latest view. A match shows the round and the rounds each seat has taken; a
    // single game shows the load and each seat's 额度 left.
    match(v, names) {
      if (!v) return (match.hidden = true);
      match.hidden = false;
      if (v.rules !== 'bo3') {
        const opp = v.seats.find((s) => s.id !== v.you);
        const me = v.seats.find((s) => s.id === v.you);
        const row = (who, s) => {
          const r = el('span', 'match-seat');
          r.append(el('span', 'match-name', who), ...dots(Math.max(0, s.hp), v.maxHp ?? 4));
          return r;
        };
        match.replaceChildren(...(v.round ? [el('span', 'match-round', t('ui.roulette.loadNo', { n: v.round }))] : []), row(t('ui.common.you'), me), row(names[opp.id] ?? t('ui.roulette.opponent'), opp));
        return;
      }
      const need = Math.ceil(v.stages / 2);
      const opp = v.seats.find((s) => s.id !== v.you).id;
      const row = (who, id) => {
        const r = el('span', 'match-seat');
        r.append(el('span', 'match-name', who), ...dots(v.wins[id], need));
        return r;
      };
      match.replaceChildren(el('span', 'match-round', t('ui.roulette.roundOf', { stage: v.stage, stages: v.stages })), row(t('ui.common.you'), v.you), row(names[opp] ?? t('ui.roulette.opponent'), opp));
    },
    // A round is over: who took it, the score, and what the next one brings. Resolves
    // when it has been up long enough to read.
    async banner({ stage, stages, won, who, wins, you, opp, names, last, next }) {
      banner.className = `round-banner ${won ? 'won' : 'lost'}`;
      const score = el('div', 'banner-score');
      for (const [name, id] of [[t('ui.common.you'), you], [names[opp] ?? t('ui.roulette.opponent'), opp]]) {
        const r = el('span', 'match-seat');
        r.append(el('span', 'match-name', name), ...dots(wins[id], Math.ceil(stages / 2)));
        score.append(r);
      }
      banner.replaceChildren(
        el('div', 'banner-kicker', t('ui.roulette.roundOf', { stage, stages })),
        el('div', 'banner-big', won ? t('ui.roulette.roundWonYou') : t('ui.roulette.roundWon', { who })),
        score,
        el('div', 'banner-next', last ? t('ui.roulette.matchEnded') : t('ui.roulette.nextRound', { stage: stage + 1, hp: next.hp, first: next.first })),
      );
      banner.hidden = false;
      await new Promise((r) => setTimeout(r, last ? 1800 : 2800));
      banner.hidden = true;
    },
    seal(commit) {
      sealTag.textContent = commit ? t('ui.roulette.sealTag', { hash: commit.slice(0, 8) }) : '';
      sealTag.title = commit ? t('ui.roulette.sealTitle', { commit }) : '';
    },
    // The ending: who won, both seats' 额度, the seal check, and how to play again.
    async result(v, names) {
      if (resultFor === v.commit) return;
      resultFor = v.commit;
      const you = v.seats.find((s) => s.id === v.you);
      const opp = v.seats.find((s) => s.id !== v.you);
      const won = v.winner === v.you;
      result.className = `window result ${!v.winner ? 'draw' : won ? 'won' : 'lost'}`;
      result.replaceChildren();
      const title = el('div', 'window-title');
      const x = el('button', 'x', '×');
      x.onclick = () => (result.hidden = true);
      const bo3 = v.rules === 'bo3';
      const maxHp = v.maxHp ?? 4;
      title.append(el('span', '', bo3 ? t('ui.roulette.resultTitleMatch', { stage: v.stage, stages: v.stages }) : t('ui.roulette.resultTitleGame', { round: v.round })), x);
      const big = el('div', 'result-big', !v.winner ? t('ui.roulette.gameOver') : won ? t('ui.roulette.youWin') : t('ui.roulette.youOffline'));
      const sub = el('div', 'result-sub', !v.winner ? t('ui.roulette.leftEarly') : bo3 ? (won ? t('ui.roulette.matchWonSub', { a: v.wins[you.id], b: v.wins[opp.id] }) : t('ui.roulette.matchLostSub', { name: names[opp.id], a: v.wins[opp.id], b: v.wins[you.id] })) : won ? t('ui.roulette.oppOut', { name: names[opp.id] }) : t('ui.roulette.youOut'));
      const seats = el('div', 'result-seats');
      for (const [who, s] of [[t('ui.common.you'), you], [names[opp.id], opp]]) {
        const row = el('div', 'result-seat');
        const hp = el('span', 'seat-hp');
        for (let i = 0; i < maxHp; i++) hp.append(el('i', `cell ${i < s.hp ? 'on' : 'off'}`));
        row.append(el('span', 'result-name', who));
        if (bo3) {
          const d = el('span', 'match-seat');
          d.append(...dots(v.wins[s.id], Math.ceil(v.stages / 2)));
          row.append(d);
        }
        row.append(hp, el('span', 'seat-hpnum', `${s.hp}/${maxHp}`));
        seats.append(row);
      }
      const seal = el('div', 'result-seal');
      const check = el('div', 'seal-check pending', t('ui.roulette.sealChecking'));
      seal.append(
        el('div', 'seal-row', t('ui.roulette.sealCommit', { hash: v.commit.slice(0, 16) })),
        el('div', 'seal-row', t('ui.roulette.sealSeed', { seed: v.seed ? `${v.seed.slice(0, 16)}…` : t('ui.roulette.seedHidden') })),
        check,
      );
      const close = el('button', 'pixbtn', t('ui.roulette.viewTable'));
      close.onclick = () => (result.hidden = true);
      const actions = el('div', 'result-actions');
      actions.append(close);
      result.append(title, big, sub, seats, seal, againRow(names[opp.id]), actions);
      result.hidden = false;
      if (!v.seed) return;
      try {
        const ok = (await sha256Hex(v.seed)) === v.commit;
        check.className = `seal-check ${ok ? 'ok' : 'bad'}`;
        check.textContent = ok ? t('ui.roulette.sealOk') : t('ui.roulette.sealBad');
      } catch {
        check.className = 'seal-check bad';
        check.textContent = t('ui.roulette.sealNoCrypto');
      }
    },
  };
}
