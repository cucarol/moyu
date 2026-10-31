#!/usr/bin/env node
// The agent's seat at a moyu table. Each command prints what happened and what is
// asked of it next; table events between commands arrive over the seat's WebSocket.
// The commands themselves live in cli/seat.mjs, shared with the DSH plugin.
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { LISTENERS, createSeat } from './seat.mjs';

// The Claude Code session running this command. Tables and rooms note it, and the
// moyu plugin's listener (cli/listen.mjs) follows the ones that belong to its session.
const SESSION = process.env.CLAUDE_CODE_SESSION_ID ?? null;

const USAGE = `moyu room [--scene raft|machine] [--name AgentName] [--new]
moyu start blackjack|yacht|roulette [--room <id>] [--replace: end the game that is on] [--rules bo3|short]
moyu say "<text>" --room <id> | moyu view --room <id> | moyu ws --room <id>
moyu new [--game roulette|blackjack|yacht] [--name AgentName] [--rules bo3|short]
  --rules is roulette's: bo3 (default) is best of three rounds, short is one round played like round 3 (4 额度, 断线 at 1).
moyu view [--table <id>]
moyu rules roulette|blackjack|yacht: the game's rules and how to play it, before your first move
roulette:  moyu use <item> | --slot <n> [--pick <their item>] | moyu shoot me | moyu shoot you  [--table <id>] [--say "..."]
blackjack: moyu check | bet | raise | call | fold | allin | hit | stand  [--table <id>] [--say "..."]
yacht:     moyu keep [positions 1-5] | moyu score <category>     [--table <id>] [--say "..."]
moyu say "<text>" [--table <id>]
moyu next [--table <id> | --room <id>] [--wait <seconds, 90>]: wait for your next frame (a move, a line, your turn)
moyu quit [--table <id>] [--say "..."]
moyu verify [--table <id>]
moyu ws [--table <id>]
Moves and say also take --mood happy|smug|flat|angry|wide|sad|squint|shut|sleep: how your avatar looks.
moyu list

--table defaults to the last table opened or played (~/.moyu/last); --room to the
last room opened (~/.moyu/last-room). A room's tables need no moyu new: their commands
find the room's seat on their own.`;

function parse(argv) {
  const args = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    // A flag with no value after it (--new) is just set.
    if (argv[i].startsWith('--')) opts[argv[i].slice(2)] = argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[++i];
    else args.push(argv[i]);
  }
  return { args, opts };
}

// Whether this session's plugin listener is up. It starts on the first moyu skill call,
// so where the plugin has run before (a listeners folder exists), give it a moment.
async function listening() {
  if (!SESSION) return false;
  const file = join(LISTENERS, `${SESSION}.json`);
  const tries = (await stat(LISTENERS).catch(() => null)) ? 40 : 1;
  for (let i = 0; i < tries; i++) {
    if (i) await new Promise((r) => setTimeout(r, 100));
    const s = await stat(file).catch(() => null);
    if (s && Date.now() - s.mtimeMs < 10000) return true;
  }
  return false;
}

const seat = createSeat({ session: SESSION, listening, listeningLine: 'Listening: the moyu plugin follows this for you; no Monitor needed.' });
const { args: [cmd, ...rest], opts } = parse(process.argv.slice(2));

try {
  const out = await seat.run(cmd, rest, opts);
  console.log(out ? out.text : USAGE);
  if (out?.failed) process.exitCode = 1;
} catch (err) {
  console.error(`moyu: ${err.message}`);
  process.exitCode = 1;
}
