// Game events to avatar states, for the casino games. A table client calls
// cueX(opp, e, view) as each log event starts playing (the promise is the avatar's
// part, awaiting it is optional) and restX(opp, view) once its queue is played out,
// for the resting state. view is the human seat's view, so nothing the agent hides
// (its hole card, a hidden bust) reaches its face before the showdown shows it.
// The agent's own move can carry a mood (e.mood, on the move's first event): it plays
// once the move's reaction is over, unless a later event's reaction has taken over.

const agentOf = (view) => view.seats.find((s) => s.id !== view.you).id;
const quitBy = (view, id) => view.log.some((e) => e.type === 'quit' && e.seat === id);

// Small acts on top: a wave when you sit down (greet), the hole card hidden now and then
// after the peek, a cheer for the biggest wins. opp.autoActs false turns the first two off.
const HIDE_CHANCE = 0.3;
const waved = new WeakMap(); // opp -> when it last waved
const cheered = new WeakMap(); // opp -> when it last cheered
const tail = new WeakMap(); // opp -> the latest reaction's promise
const idle = (opp) => opp.state === opp.base; // no one-shot playing
export function greet(opp) {
  if (opp.autoActs === false || performance.now() - (waved.get(opp) ?? -Infinity) < 20_000) return null;
  waved.set(opp, performance.now());
  return opp.setState('wave');
}
function cheer(opp) {
  cheered.set(opp, performance.now());
  return opp.setState('cheer');
}
// a match won: after what it is still doing, unless it has just cheered
function cheerMatch(opp, e, me) {
  if (e.winner !== me) return null;
  return (tail.get(opp) ?? Promise.resolve()).then(() => (performance.now() - (cheered.get(opp) ?? -Infinity) > 4000 ? cheer(opp) : null));
}
const track = (opp, p) => (p && tail.set(opp, p), p);

const moodFor = new WeakMap(); // opp -> the latest reaction's number
function withMood(opp, e, shown) {
  if (shown) moodFor.set(opp, (moodFor.get(opp) ?? 0) + 1);
  if (!e.mood) return shown;
  const n = (moodFor.get(opp) ?? 0) + 1;
  moodFor.set(opp, n);
  const after = () => (moodFor.get(opp) === n ? opp.setState('emote', { mood: e.mood }) : null);
  return shown ? shown.then(after) : after();
}

function rest(opp, view, me) {
  if (view.phase === 'over') {
    if (quitBy(view, me)) return opp.setState('offline');
    return opp.setState(!view.winner ? 'idle' : view.winner === me ? 'won' : 'lost');
  }
  return null;
}

// ---- 21 ----------------------------------------------------------------------

const RANK = (card) => card.slice(0, -1);
function total(cards) {
  let t = 0;
  let aces = 0;
  for (const c of cards) {
    const r = RANK(c);
    if (r === 'A') aces++;
    t += r === 'A' ? 1 : ['J', 'Q', 'K'].includes(r) ? 10 : Number(r);
  }
  return aces && t + 10 <= 21 ? t + 10 : t;
}
// the agent's face-up cards this hand, up to and including event e
function faceUp(view, me, e) {
  let up = [];
  for (const x of view.log) {
    if (x.seq > e.seq) break;
    if (x.type === 'hand_start') up = [x.up[me]];
    else if ((x.type === 'hit' || x.type === 'double') && x.seat === me) up.push(x.card);
  }
  return up;
}

export const cueBlackjack = (opp, e, view) => track(opp, withMood(opp, e, blackjack(opp, e, view)));
function blackjack(opp, e, view) {
  const me = agentOf(view);
  const mine = e.seat === me;
  switch (e.type) {
    case 'hand_start':
      return opp.setState('peekCard').then(() => (opp.autoActs !== false && idle(opp) && Math.random() < HIDE_CHANCE ? opp.setState('hideCard') : null));
    case 'hit':
    case 'double': {
      if (!mine) return e.type === 'double' ? opp.setState('noticeDouble') : null;
      const shown = opp.setState(e.type === 'hit' ? 'drawCard' : 'double', { card: e.card });
      // over 21 on the face-up cards alone: everyone knows already
      if (total(faceUp(view, me, e)) > 21) return shown.then(() => opp.setState('bust', { public: true }));
      return shown;
    }
    case 'stand':
      return mine ? opp.setState('stand') : null;
    case 'call':
      return mine ? opp.setState('call') : null;
    case 'fold':
      return mine ? opp.setState('fold') : null;
    case 'settle': {
      // big: a doubled pot, or the last hands' stakes
      const ante = view.log.findLast((x) => x.type === 'hand_start' && x.seq < e.seq)?.ante ?? Infinity;
      const big = e.pot > 2 * ante || e.pot >= 800_000;
      const pot = () => (e.winner === me && e.naturals?.[me] ? cheer(opp) : opp.setState(!e.winner ? 'push' : e.winner === me ? 'winPot' : 'losePot', { big, pot: e.pot }));
      if (e.how !== 'showdown') return pot();
      const mineTotal = e.totals[me];
      return opp
        .setState('reveal')
        .then(() => (e.naturals[me] ? opp.setState('natural') : mineTotal > 21 ? opp.setState('bust') : null))
        .then(pot);
    }
    case 'quit':
      return mine ? opp.setState('offline') : null;
    case 'game_over':
      return cheerMatch(opp, e, me);
  }
  return null;
}

export function restBlackjack(opp, view) {
  const me = agentOf(view);
  return rest(opp, view, me) ?? opp.setState(view.turn !== me ? 'idle' : view.facing === me ? 'thinkCall' : 'thinkHand');
}

// ---- Yacht ---------------------------------------------------------------------

const isYacht = (dice) => dice.every((d) => d === dice[0]);

export const cueYacht = (opp, e, view) => track(opp, withMood(opp, e, yacht(opp, e, view)));
function yacht(opp, e, view) {
  const me = agentOf(view);
  const mine = e.seat === me;
  switch (e.type) {
    case 'roll':
      if (mine) return opp.setState('rollDice', { kept: e.kept, rollNo: e.rollNo });
      return isYacht(e.dice) ? opp.setState('noticeDice', { yacht: true }) : null;
    case 'score': {
      const yacht = e.category === 'yacht' && e.points === 50;
      const detail = { points: e.points, zero: e.points === 0, big: e.points >= 25, category: e.category };
      if (mine) return yacht ? opp.setState('yacht').then(() => cheer(opp)) : opp.setState('scoreBox', detail);
      return yacht || detail.zero || detail.big ? opp.setState('noticeDice', { ...detail, yacht }) : null;
    }
    case 'quit':
      return mine ? opp.setState('offline') : null;
    case 'game_over':
      return cheerMatch(opp, e, me);
  }
  return null;
}

export function restYacht(opp, view) {
  const me = agentOf(view);
  return rest(opp, view, me) ?? opp.setState(view.turn !== me ? 'idle' : view.rollsLeft > 0 ? 'thinkKeep' : 'thinkPad');
}
