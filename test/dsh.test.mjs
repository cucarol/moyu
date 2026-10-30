// The DeepSeek Harness plugin against a fake DSH host (agents, tools, skills, events)
// and the real moyu server, on its own MOYU_HOME and port.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const HOME = mkdtempSync(join(tmpdir(), 'moyu-dsh-'));
const PORT = 20000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
process.env.MOYU_HOME = HOME;
process.env.MOYU_PORT = String(PORT);
// Short post-game windows; the server the plugin starts inherits them.
process.env.MOYU_LINGER_MS = '3000';
process.env.MOYU_GRACE_MS = '1000';
const plugin = await import('../dsh/index.js');
const { createWatcher } = await import('../dsh/watch.js');

// In DSH any stray rejection ends the whole app, so here it fails the suite.
const strays = [];
process.on('unhandledRejection', (err) => strays.push(err));

after(async () => {
  for (const host of hosts) await host.unload();
  try {
    const { pid } = await (await fetch(`${BASE}/api/health`)).json();
    process.kill(pid);
  } catch {}
  await new Promise((r) => setTimeout(r, 300));
  rmSync(HOME, { recursive: true, force: true });
  assert.deepEqual(strays, []);
});

const hosts = [];
// A DSH host with just what the plugin uses. controller: a sessionController, or none.
function host({ controller } = {}) {
  const agents = new Map();
  const handlers = {};
  const effects = [];
  const h = {
    tools: new Map(),
    skills: [],
    warnings: [],
    agents,
    ctx: {
      agents: { get: (id) => agents.get(id) },
      tools: { register: (tool) => h.tools.set(tool.name, tool) },
      on: (event, fn) => (handlers[event] = fn),
      inject: (deps, fn) => fn({ skills: { register: (s) => h.skills.push(s) } }),
      effect: (fn) => effects.push(fn()),
      get: (key) => (key === 'sessionController' ? controller : undefined),
      logger: { warn: (msg) => h.warnings.push(msg) },
    },
    // A live agent for this session; its wakes land in .woken.
    agent(id) {
      const a = { id, woken: [], followup: (m) => a.woken.push(m) };
      agents.set(id, a);
      handlers['agent/created']?.({ agent: a, source: 'startup' });
      return a;
    },
    dispose(id) {
      const a = agents.get(id);
      agents.delete(id);
      handlers['agent/disposed']?.({ agent: a });
    },
    call(name, args, id) {
      return h.tools.get(name).execute(args, { agent: agents.get(id) ?? { id } });
    },
    async unload() {
      for (const dispose of effects.splice(0)) await dispose();
    },
  };
  plugin.apply(h.ctx);
  hosts.push(h);
  return h;
}

async function until(fn, what, ms = 8000) {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 50))) {
    const v = await fn();
    if (v) return v;
  }
  assert.fail(`timed out waiting for ${what}`);
}

const post = (path, body) => fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const humanOf = (out) => {
  const url = new URL(out.match(/Human's link: (\S+)/)[1]);
  return { id: url.pathname.split('/').pop(), k: url.searchParams.get('k') };
};
const texts = (agent) => agent.woken.map((m) => m.content[0].text);
// The sessions this host follows, from its heartbeat file (every fake host here has this pid).
const followed = () => {
  const file = join(HOME, 'listeners', `dsh-${process.pid}.json`);
  return existsSync(file) ? Object.keys(JSON.parse(readFileSync(file, 'utf8')).sessions).length : 0;
};
const tableFile = (id) => JSON.parse(readFileSync(join(HOME, 'tables', `${id}.json`), 'utf8'));

test('tools, schemas and the skill are what DSH accepts', async () => {
  const h = host();
  assert.deepEqual([...h.tools.keys()].sort(), ['call', 'double', 'fold', 'hit', 'keep', 'list', 'new', 'quit', 'room', 'say', 'score', 'shoot', 'stand', 'start', 'use', 'verify', 'view'].map((v) => `moyu_${v}`));
  // Checked against the installed DSH's own schema rules when it is on this machine.
  const dshTools = join(process.env.APPDATA ?? join(homedir(), '.npm-global'), 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-tools', 'lib', 'index.js');
  const dsh = existsSync(dshTools) ? await import(pathToFileURL(dshTools)) : null;
  for (const tool of h.tools.values()) {
    assert.equal(tool.parameters.type, 'object');
    assert.equal(typeof tool.output.render, 'function');
    assert.deepEqual(tool.output.render({}, 'x'), [{ type: 'text', text: 'x' }]);
    if (dsh) {
      dsh.assertSupportedJsonSchema(tool.parameters);
      dsh.assertSupportedJsonSchema(tool.output.schema);
    }
  }
  assert.equal(h.skills.length, 1);
  assert.equal(h.skills[0].name, 'moyu');
  assert.match(h.skills[0].description, /^Play a quick luck game/);
  assert.ok(!h.skills[0].content.startsWith('---'));
  // DSH's tool-result pruner trims skill bodies above 8192 characters.
  assert.ok(h.skills[0].content.length < 8192);
  await assert.rejects(h.call('moyu_shoot', { target: 'up' }, 's0'), /target must be one of me, you/);
  await assert.rejects(h.call('moyu_keep', { table: 'ab' }, 's0'), /positions is required/);
  await assert.rejects(h.call('moyu_new', { rules: 'long' }, 's0'), /rules must be one of bo3, short/);
  // A short roulette game: one round, no round talk.
  h.agent('s0');
  const short = await h.call('moyu_new', { rules: 'short' }, 's0');
  assert.match(short, /^Roulette \(short: one round\) table/);
  assert.doesNotMatch(short, /Round/);
  await h.call('moyu_quit', {}, 's0');
  await h.unload();
});

test('a table: the tool binds it to the session, every frame wakes it, and it stops at game over', async () => {
  const h = host();
  const agent = h.agent('s1');
  const out = await h.call('moyu_new', { game: 'blackjack', human: 'C' }, 's1');
  const human = humanOf(out);
  assert.match(out, /^Blackjack table [0-9a-f]+ open\. Sealed seed commit: [0-9a-f]+/);
  assert.match(out, /Listening: the moyu plugin wakes this session/);
  // The agent's own seat token never shows: no WebSocket URL.
  const { k } = tableFile(human.id);
  assert.ok(!out.includes(k) && !out.includes('ws://'));
  assert.equal(tableFile(human.id).session, 'dsh:s1');
  await until(() => followed() === 1, 'the socket');
  // The tool's output was the opening board: the socket owes nothing, so no wake yet.
  await new Promise((r) => setTimeout(r, 500));
  assert.deepEqual(texts(agent), []);

  assert.ok((await post(`/api/tables/${human.id}/say`, { k: human.k, text: 'hello there' })).ok);
  const said = await until(() => texts(agent).find((t) => t.includes('hello there')), 'the chat frame');
  assert.ok(said.startsWith(`[moyu ${human.id}] C says: hello there`), said);
  assert.equal(agent.woken[0].source.kind, 'moyu');
  assert.equal(agent.woken[0].role, 'user');
  assert.ok(Object.isFrozen(agent.woken[0].content[0]));

  // Moves go through the same seat as the CLI: say and view by tool.
  assert.match(await h.call('moyu_say', { text: 'gl', table: human.id, mood: 'smug' }, 's1'), /\[moyu/);
  assert.ok((await h.call('moyu_view', { table: human.id }, 's1')).startsWith(`[moyu ${human.id}]`));
  await assert.rejects(h.call('moyu_verify', { table: human.id }, 's1'), /moyu: sealed until the game is over/);

  // The human's page is open. They quit: the last frame wakes the agent, and it verifies.
  const page = new WebSocket(`ws://127.0.0.1:${PORT}/ws?table=${human.id}&k=${human.k}`);
  await new Promise((r) => page.addEventListener('open', r));
  assert.ok((await post(`/api/tables/${human.id}/act`, { k: human.k, action: 'quit' })).ok);
  await until(() => texts(agent).some((t) => /Game over/.test(t)), 'the game-over frame');
  assert.match(await h.call('moyu_verify', { table: human.id }, 's1'), /matches the commit[\s\S]*follow from the seed/);
  assert.match(await h.call('moyu_list', {}, 's1'), /No open tables/);

  // Talk after the game still wakes it, once, and it can answer.
  assert.ok((await post(`/api/tables/${human.id}/say`, { k: human.k, text: '你咋这么坏' })).ok);
  const after = await until(() => texts(agent).find((t) => t.includes('你咋这么坏')), 'the post-game chat');
  assert.equal(after, `[moyu ${human.id}] C says: 你咋这么坏\nGame over; reply with: moyu say "<text>" --table ${human.id}`);
  assert.equal(await h.call('moyu_say', { text: '运气而已 😏', table: human.id }, 's1'), `[moyu ${human.id}] Said. The game is over.`);
  assert.equal(texts(agent).filter((t) => /Game over\. Seed/.test(t)).length, 1);

  // Quiet for LINGER_MS (short here): the server lets the seat go and the plugin stops.
  await until(() => followed() === 0, 'the socket to close');
  page.close();
  await h.unload();
});

test('a disposed agent is let go without a resumer, and hears what it missed when it is back', async () => {
  const h = host();
  h.agent('s2');
  const human = humanOf(await h.call('moyu_new', { game: 'yacht' }, 's2'));
  await until(() => followed() === 1, 'the socket');
  h.dispose('s2');
  await until(() => followed() === 0, 'the socket to close');
  assert.ok((await post(`/api/tables/${human.id}/say`, { k: human.k, text: 'are you there' })).ok);
  await new Promise((r) => setTimeout(r, 300));
  // Back: the server resends the line the agent missed.
  const agent = h.agent('s2');
  await until(() => texts(agent).some((t) => t.includes('are you there')), 'the missed line');
  await h.call('moyu_quit', { table: human.id }, 's2');
  await h.unload();
});

test('cold: a session with no live agent is resumed to be woken; one that is gone is dropped', async () => {
  const resumed = { id: 's3', woken: [], followup: (m) => resumed.woken.push(m) };
  const asked = [];
  const h = host({
    controller: {
      resolveAgent: async (sid) => {
        asked.push(sid);
        return sid === 's3' ? { agent: resumed } : { error: new Error('no such session') };
      },
    },
  });
  // The room is opened by a live agent, which then goes away (window closed, say).
  h.agent('s3');
  const out = await h.call('moyu_room', { human: 'C', new: true }, 's3');
  const room = humanOf(out);
  assert.match(out, /^Room [0-9a-f]+ open\./);
  h.dispose('s3');
  await new Promise((r) => setTimeout(r, 2500));
  // The user starts a game from the page: the session is resumed and woken.
  assert.ok((await post(`/api/rooms/${room.id}/start`, { k: room.k, game: 'yacht' })).ok);
  await until(() => resumed.woken.some((m) => /A Yacht table is open/.test(m.content[0].text)), 'the cold wake');
  assert.ok(asked.includes('s3'));
  // The resumed session plays it through the room's seat.
  const started = resumed.woken.map((m) => m.content[0].text).join('\n').match(/table is open: ([0-9a-f]+)/)[1];
  assert.ok((await h.call('moyu_view', { table: started }, 's3')).startsWith(`[moyu ${started}]`));
  await h.call('moyu_quit', { table: started }, 's3');

  // A table bound to a session that no longer exists: the frame is dropped, then the session.
  h.agent('s4');
  const t = humanOf(await h.call('moyu_new', {}, 's4'));
  h.dispose('s4');
  await new Promise((r) => setTimeout(r, 2500));
  assert.ok((await post(`/api/tables/${t.id}/say`, { k: t.k, text: 'hi' })).ok);
  await until(() => h.warnings.some((w) => /session s4 could not be woken/.test(w)), 'the drop');
  await post(`/api/tables/${t.id}/act`, { k: t.k, action: 'quit' });
  await h.unload();
});

test('a wake that throws is logged, never thrown into the host', async () => {
  const h = host();
  const agent = h.agent('s5');
  agent.followup = () => {
    throw new Error('driver busy');
  };
  const t = humanOf(await h.call('moyu_new', {}, 's5'));
  await until(() => followed() >= 1, 'the socket');
  assert.ok((await post(`/api/tables/${t.id}/say`, { k: t.k, text: 'boom' })).ok);
  await until(() => h.warnings.some((w) => /waking session s5 failed: driver busy/.test(w)), 'the warning');
  await post(`/api/tables/${t.id}/act`, { k: t.k, action: 'quit' });
  await h.unload();
});

test('two DSH hosts: a live agent wins, and of two that could only resume it, the lower pid', async () => {
  const dirs = { tables: join(HOME, 'tables'), rooms: join(HOME, 'rooms'), listeners: join(HOME, 'listeners') };
  const h = host();
  h.agent('s6');
  const t = humanOf(await h.call('moyu_new', {}, 's6'));
  await h.unload();
  const watcher = (pid, state) => createWatcher({ dirs, base: BASE, pid, follow: (sid) => (sid === 's6' ? state : null), wake: async () => true });
  const low = watcher(101, 'cold');
  const high = watcher(102, 'cold');
  const live = watcher(103, 'live');
  await low.tick();
  await high.tick();
  assert.equal(low.following.size, 1);
  assert.equal(high.following.size, 0);
  await live.tick();
  await low.tick();
  assert.equal(live.following.size, 1);
  assert.equal(low.following.size, 0);
  // A killed host's heartbeat goes once it is stale and its process is gone.
  const dead = join(dirs.listeners, 'dsh-2147480000.json');
  writeFileSync(dead, JSON.stringify({ pid: 2147480000, at: Date.now() - 60000, sessions: { s6: 'live' } }));
  await low.tick();
  assert.ok(!existsSync(dead));
  for (const w of [low, high, live]) await w.stop();
  assert.ok(!existsSync(join(dirs.listeners, 'dsh-103.json')));
  await post(`/api/tables/${t.id}/act`, { k: t.k, action: 'quit' });
});
