// moyu for DeepSeek Harness: the agent plays its seat through tools, and the plugin
// listens to its tables and rooms and wakes its session on every frame, the way the
// Claude Code plugin's listener does. Runs in the DSH host process, so the tools write
// ~/.moyu and start the server outside the shell sandbox.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BASE, LISTENERS, ROOMS, TABLES, createSeat } from '../cli/seat.mjs';
import { moyuTools } from './tools.js';
import { PREFIX, createWatcher } from './watch.js';

export const name = 'moyu';
export const inject = ['agents', 'tools'];

const SKILL = readFileSync(new URL('./skill.md', import.meta.url), 'utf8');
const LISTENING = 'Listening: the moyu plugin wakes this session on every table event; end your turn to wait.';

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

// What DSH's createUserMessage() builds: an identified, frozen user message.
export function frameMessage(text) {
  return deepFreeze({ role: 'user', content: [{ type: 'text', text }], source: { kind: 'moyu' }, id: randomUUID() });
}

export function apply(ctx) {
  const warn = (msg) => {
    try {
      ctx.logger?.warn ? ctx.logger.warn(msg) : console.warn(msg);
    } catch {}
  };
  // Optional services: the Web and Desktop hosts have them, a headless one may not.
  const service = (key) => {
    try {
      return ctx.get(key);
    } catch {
      return undefined;
    }
  };

  const watcher = createWatcher({
    dirs: { tables: TABLES, rooms: ROOMS, listeners: LISTENERS },
    base: BASE,
    warn,
    // A live agent is woken where it is; any other session only where it can be resumed.
    follow: (sid) => (ctx.agents.get(sid) ? 'live' : service('sessionController') ? 'cold' : null),
    async wake(sid, text) {
      let agent = ctx.agents.get(sid);
      if (!agent) {
        const controller = service('sessionController');
        if (!controller) return false;
        const found = await controller.resolveAgent(sid);
        if (!found || 'error' in found) return false;
        agent = found.agent;
      }
      agent.followup(frameMessage(text));
      return true;
    },
  });

  async function run(sid, cmd, rest, opts) {
    const seat = createSeat({ session: PREFIX + sid, listening: async () => true, listeningLine: LISTENING });
    try {
      const out = await seat.run(cmd, rest, opts);
      if (!out) throw new Error(`unknown command: ${cmd}`);
      return out.text;
    } catch (err) {
      throw new Error(`moyu: ${err?.message ?? err}`);
    } finally {
      // A table or room this call opened or moved here is followed right away.
      watcher.revive(sid);
    }
  }

  for (const tool of moyuTools(run)) ctx.tools.register(tool);

  ctx.on('agent/created', ({ agent }) => {
    try {
      watcher.revive(agent.id);
    } catch {}
  });
  ctx.on('agent/disposed', ({ agent }) => {
    try {
      watcher.closeSession(agent.id);
    } catch {}
  });

  // The skill, wherever the host has a skill registry (a preset without one still has the tools).
  ctx.inject(['skills'], (sub) => {
    try {
      sub.skills.register({
        name: 'moyu',
        description: SKILL.match(/^description: (.*)$/m)[1],
        content: SKILL.replace(/^---[\s\S]*?---\s*/, ''),
        source: 'runtime',
      });
    } catch (err) {
      warn(`moyu: could not register the skill: ${err?.message ?? err}`);
    }
  });

  ctx.effect(() => {
    watcher.start();
    return () => watcher.stop();
  });
}
