# moyu for DeepSeek Harness

A DSH bundle that lets a DSH session play moyu the way a Claude Code session does: it opens tables with tools, and the plugin wakes the session on every table event, with no manual nudges.

- `index.js`: the plugin. It registers the `moyu_*` tools and the `moyu` skill, and listens for its sessions' tables and rooms.
- `tools.js`: one tool per CLI command (`moyu_new`, `moyu_room`, `moyu_start`, `moyu_view`, `moyu_say`, `moyu_use`, `moyu_shoot`, `moyu_hit|stand|double|call|fold`, `moyu_keep`, `moyu_score`, `moyu_quit`, `moyu_verify`, `moyu_list`), run through the same code as the CLI (`../cli/seat.mjs`).
- `watch.js`: the listener, the counterpart of `../cli/listen.mjs`.
- `skill.md`: the DSH version of `../skills/moyu/SKILL.md`. Keep the two in step, and keep this one's body under 8192 characters (DSH trims longer skill results).
- `package.json`, `cordis.patch.yml`: the bundle manifest and its one row.

The plugin imports nothing from DSH and needs no `npm install`. It needs Node 22+ (Desktop ships 24) and DSH `>=0.2.0-rc.2 <0.3.0`.

## Install

Use the absolute path of your moyu checkout's `dsh` folder; below it is written `<moyu>/dsh` (for example `C:/src/moyu/dsh` or `/home/you/moyu/dsh`). DSH loads a plugin from outside its profiles only at startup, so restart DSH after installing and after every change to the code.

### DeepSeek Harness Desktop

Either of these:

1. **Plugins page.** Open 插件 / Plugins in the sidebar, choose to add a plugin from a local path, and give it `<moyu>/dsh`. It is installed as a link, so it runs from the checkout.
2. **The home patch file.** Add this to `~/.dsh/cordis.patch.yml` (create it if it is missing). This applies to every DSH profile on the machine, Desktop and CLI alike:

   ```yaml
   - insert:
       - id: moyu
         name: '<moyu>/dsh/index.js'
   ```

   To turn it off again, delete the row, or replace the file's contents with `[]`. An empty or comments-only file stops DSH from starting.

Then restart Desktop, open a session in 标准模式 (a preset with skills; Minimal has the tools but not the skill), and say 「来一局 21 点」.

### DSH CLI profiles (`dsh web`, `dsh tui`, …)

```bash
dsh plugin --profile web add <moyu>/dsh
```

This links the bundle into that profile; `dsh plugin --profile web remove moyu-dsh` takes it out. A one-off run without installing anything:

```bash
dsh web --patch <moyu>/dsh/cordis.patch.yml
```

## How a game runs

1. The agent calls `moyu_new`, which starts the moyu server if it isn't running (from the DSH host process, outside the shell sandbox that blocks writes to `~/.moyu`). The table file gets `session: "dsh:<session id>"`.
2. Every 2 s, and right after each moyu tool call, the listener follows the WebSocket of every room and unfinished table bound to a `dsh:` session. Each frame becomes `agent.followup()` with a user message whose source is `{ kind: "moyu" }`. The web UI shows it as a collapsed 收到执行请求 card, and the agent takes its turn.
3. If the session's agent isn't live, as after a Desktop restart, or when the user starts a game from a room page while the session sleeps, the plugin resumes it with `sessionController.resolveAgent()` and wakes it. A host without a session controller, like headless, follows only live agents, and lets a session's sockets go when its agent is disposed. The server resends anything missed when the socket comes back.
4. Game over: the agent verifies with `moyu_verify`. The table stays open a while for talk after the game, then the server closes the socket with `1000` and the listener lets it go.
5. When nobody uses it for 10 minutes, the server stops; the listener waits, trying every 30 s, and the next tool call starts it again.

Seat tokens stay out of model-visible text: tools never print a WebSocket URL. The human's link is printed, as with the CLI, so the agent can give it to the user.
