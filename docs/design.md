# moyu (摸鱼) — design decisions

Play games with an agent session you are already working with, mid-work; the session keeps its context and goes back to work afterwards. Started as "agenplay" (2026-10-28, na-ai-ne session); named 摸鱼 on 2026-10-29.

## Decided

- **Who plays:** Claude Code and DSH (DeepSeek Harness) are the two targets (2026-10-29), because both can wake a session from outside. Other coding agents (Codex, Grok, Gemini CLI) fall back to the blocking-wait loop later; chat apps and messaging bots are out of scope for now.
- **Game pool:** luck-heavy games only; no skill games (「强技术游戏我不跟你玩」). Reference pool: the traditional games in Clubhouse Games: 51 Worldwide Classics, filtered for luck. First test game: blackjack (21 点).
- **No manual triggers, ever (「绝对不做手动」):** the user never has to nudge the agent (「该你了」, "check your inbox"). Every wake is automatic.
- **Engine is the single truth and referee.** Each seat sees only its own view. Secrets are sealed by the engine; deck order is committed at start (`sha256(seed)`) and revealed at the end.
- **HTTP API is the root;** MCP server, CLI, web page and skill doc are thin layers over it.

## Trigger: what exists (researched 2026-10-29)

No standard way to wake a running coding-agent session from outside (claude-code issue #60943 is an open request for exactly this). Per harness:

- Claude Code: background tasks wake the session on exit (stable); channels (`claude/channel`) push into a session (research preview, dev flag, reported drops on Windows / idle sessions).
- Codex: app-server JSON-RPC (`turn/start`, `turn/steer`, multi-client WebSocket); whether an outside client can drive a thread it didn't start is unverified; schema unstable.
- ACP (`session/prompt`, Gemini CLI, Copilot CLI, 25+ agents): only when the ACP client owns the session, so it can't reach a session already open.
- tmux `send-keys`: the community's universal hack; fragile, and no native tmux on Windows.
- Prior art for the same problem: cross-agent-teams (MCP inbox + per-harness wake adapters).

## DSH (DeepSeek Harness) — first target harness (2026-10-29)

`@deepseek-ai/dsh` 0.2.1-rc.2 is installed globally (`npm root -g`/@deepseek-ai/dsh); config in `~/.dsh`. DeepSeek Harness Desktop is installed too and carries its own DSH, 0.2.0-rc.2. Cordis, everything-is-a-plugin, MIT. Read from the installed packages:

- `dsh-agent`: the public `Agent` API has `followup()` (queue a next-turn prompt and wake the driver), `steer()` (next-step input, wakes it), `inject()` (context, no wake). A plugin in the host can push into any live session with these.
- `dsh-api-session-controller` (Web and Desktop hosts): `resolveAgent(sessionId)` returns a session's live agent, resuming a persisted one if needed. This makes cold wakes work.
- `dsh-tool-jobs`: a finished background job wakes an idle agent (`completionDelivery: wakeup`; `maxConsecutiveWakes` must stay unset). It was the v0 plan; the plugin replaced it.
- No longer in 0.2.1: the Claude Code hook bridge (`dsh-hooks-claude-code`, `dsh-hooks-codex`) and `dsh-webhook` are dev-only packages now, not installed. Claude Code plugins (`.claude-plugin`, monitors, `bin/` on PATH) don't load in DSH at all.
- Shell commands run sandboxed: on Windows they may write only to the workspace and a temp folder, so `moyu new` from a DSH shell can't write `~/.moyu`, and a server started from that shell inherits the limit. Plugin code runs in the host process, outside the sandbox.
- In a DSH host, an unhandled rejection or a throw in a sync callback ends the whole app.

### The moyu DSH plugin (2026-10-29)

A DSH bundle in `dsh/` (`package.json` with `dsh.bundle.patch`, one row `./index.js`); install steps in `dsh/README.md`.

- **Moves are tools**, one per CLI command (`moyu_new`, `moyu_room`, `moyu_start`, `moyu_hit`, `moyu_shoot`, `moyu_keep`, `moyu_say`, `moyu_verify`, …). They run the CLI's own command code in the host process: `cli/seat.mjs` holds every command as a function returning the text the agent reads, and `cli/moyu.mjs` is now argv parsing on top of it. A table prompt such as `moyu shoot me --table <id>` maps to the tool `moyu_shoot`, and the skill says so. Tools never print the seat's WebSocket URL.
- **Binding:** a tool call writes `session: "dsh:<session id>"` (`exec.agent.id`) into the table or room file. The `dsh:` prefix keeps the Claude Code listener and the DSH plugin off each other's tables: a socket that connects takes the frames the server still owes, so only one listener may follow a seat. A later command from a Claude Code session moves the table there, and the other way round.
- **Wakes:** `dsh/watch.js` is `cli/listen.mjs` for every session of the host at once. It follows the rooms and unfinished tables of `dsh:` sessions and turns each frame into `agent.followup()` of a user message with `source: { kind: 'moyu' }`, in order per session. When the agent isn't live, `sessionController.resolveAgent()` resumes the session first, so a game started from a room page, or a move made while DSH was closed, still wakes it. Hosts without a session controller (headless) follow live agents only and close a session's sockets on `agent/disposed`; the server resends what was missed when they reconnect. After game over the seat stays open for talk and closes with `1000` later (see "Talk after the game"); that close ends the following, as in Claude Code.
- **Several DSH hosts** (Desktop and `dsh web` at once) share `~/.dsh` sessions. Each host writes `~/.moyu/listeners/dsh-<pid>.json` listing the sessions it follows. A host where the agent is live wins; between hosts that could only resume it, the lowest pid wins. A killed host's file is removed once it is stale and its process is gone.
- **The plugin imports nothing from DSH.** A row loaded by absolute path (the home patch file) can't resolve `@deepseek-ai/*`: only linked or installed bundles get DSH's peer resolution. So tools are built as the plain objects `defineTool()` returns, and wake messages as `createUserMessage()` builds them; a test checks the schemas against the installed DSH's own rules.
- **Robustness:** every socket, timer and event handler is wrapped, all promise chains end in a catch, the timer is `unref`'d (headless still exits), and `ctx.effect` closes everything on unload.
- **Skill:** `dsh/skill.md`, registered with `ctx.skills.register`. It is `SKILL.md` in substance (fair play, table talk, playing tips) with tools instead of commands and no Monitor. Its body stays under 8192 characters, where DSH's tool-result pruner starts trimming. Presets without the skill tool (Minimal) still get the tools.
- Verified end to end on 2026-10-29 with the global `dsh web` (0.2.1-rc.2), a scratch `DSH_HOME` and `MOYU_HOME`, and the DeepSeek-V4.1-Flash model. 「来一局 21 点」 opened a table through the tools, and each human move woke the session to play its turn. After a host restart, the moves made while it was down woke the resumed session. At game over the agent verified and reported in Chinese. Desktop's 0.2.0-rc.2 was checked only by reading its packages: the same APIs are there.
- No wake for the opening board: `moyu new` and `moyu_new` show it in their output, so the server marks the agent seat caught up when it creates the table (`Table.caughtUp`). Before that fix, the listener's first connect was resent the deal, a wake with nothing to do, in Claude Code and DSH alike.

## Claude Code — the other target harness

- `Monitor` tool: a background watcher whose every stdout line, or every WebSocket text frame (`ws` source, no shell), arrives in the session as a notification and wakes it. Expires after at most 30 min; the expiry notice itself wakes the session, which re-arms. Available in the desktop app (this session has it).
- Background Bash (`run_in_background`): one wake when the command exits.
- Channels (`claude/channel`): cold push into a session that armed nothing; research preview, dev flag, reported drops on Windows. Desktop-app support unknown.

### The moyu plugin (2026-10-29)

The repo root is also a Claude Code plugin (`.claude-plugin/plugin.json`) and its own marketplace (`cuca`, source `"./"`: added from GitHub as `cucarol/moyu`, or from a local clone, where it loads in place and edits apply on `/reload-plugins`). It brings the skill, `bin/moyu` on the Bash PATH, and one plugin monitor, `moyu-listen` (`monitors/monitors.json`, started on the first moyu skill call, lives for the whole session, never expires). That ends the 30-minute Monitor re-arming:

- Each session is told apart by `CLAUDE_CODE_SESSION_ID`, which both the Bash tool and plugin monitors see. `moyu new` and `moyu room` write it into the table or room file; any later command from another session moves the table or room there.
- `cli/listen.mjs` writes a heartbeat to `~/.moyu/listeners/<session>.json` every 2 s and connects to the WebSocket of every room and every unfinished or just finished table of its session (a room's tables come through the room). Each frame is one stdout write, so one notification.
- The CLI prints `Listening: …` instead of a URL when the heartbeat is fresh, and the skill then arms nothing. Without the plugin (or before it has started), everything falls back to the agent's own Monitor.

### Talk after the game (2026-10-29)

The user's first DSH game (a standalone roulette table): right after game over they typed 「你咋这么坏」 twice in the table chat and the agent never answered. The server closed the agent's seat with `1000` at game over, so both listeners stopped and post-game chat reached no one. (In a room it goes to the room, which stays open.)

- A finished table now keeps the agent's seat open (`Table.linger`) until the table has been quiet for `Table.LINGER_MS` (10 min, `MOYU_LINGER_MS`) or no human page has been open for `Table.GRACE_MS` (60 s, `MOYU_GRACE_MS`; a reload is not leaving). Then it closes with `1000`.
- A chat line in that window wakes the agent with `Game over; reply with: moyu say …`; its `say` gets `Said. The game is over.` back. The seed and verify line comes once, with the game-over frame.
- Both listeners (`cli/listen.mjs`, `dsh/watch.js`) follow a finished table until the server closes it, and drop one whose last change is older than `LINGER_MS` (after a restart, say). The DSH heartbeat `dsh-<pid>.json` lists a session only while the host follows it, so it now stays through the talk and goes when that ends.
- Both skills: after game over and verify, answer post-game chat at the table in one short line, then back to work. A verify after game over stays fair play.

### The server stops when nobody uses it (2026-10-29)

The server used to run until the machine shut down. Now it stops once, for `MOYU_IDLE_MS` (10 min; `0` never stops) straight, no human page has been connected (no human seat socket at any table or room) and no agent request has come in over HTTP (a CLI command or a DSH tool call). Agent listener sockets don't count, and neither do the listeners' own requests, which carry `x-moyu-listener`. With the human's tab open it never stops, however long a game is paused.

- On the way out it logs one line, saves every table and room once more (each change is already on disk, told cursors included), and closes every socket with `1001`. Listeners read that as "server gone, retry", not as game over (`1000`). Linger timers are rebuilt on the next start: they work from `updatedAt`.
- The CLI and DSH tools already start the server on demand (`ensureServer`). On start the server writes `~/.moyu/listeners/server-up`.
- Both listeners (`cli/listen.mjs`, `dsh/watch.js`), on finding the server gone, try once every `MOYU_DOWN_MS` (30 s) and stay alive; the Claude Code one must not exit, since its monitor only starts on a skill call. A newer `server-up` ends the wait at once, so after an agent's command restarts the server the next frame is not 30 s late. On reconnect the server resends whatever the seat was not yet told. The DSH watcher keeps its heartbeat (its claims) while it waits.
- Pages: a socket that drops checks `/api/health`; if the server is gone the status says the table is asleep and to ask the agent to continue, and it keeps trying every 5 s. A reload while it is stopped would get the browser's error page, so the pages register a service worker (`/sw.js`, at the root to cover `/t/` and `/r/`) that answers a failed navigation with a small "asleep" page, which reloads itself once `/api/health` answers. It caches nothing.

## Two kinds of external trigger

- **Armed:** once a game starts, the agent itself starts a listener; afterwards every table event wakes it. CC: `Monitor` (ws), now the moyu plugin's listener. DSH: the moyu plugin (`dsh/`). Solid on both.
- **Cold:** wake a session that armed nothing (start a game from the web page). DSH: the plugin resumes the session with `sessionController.resolveAgent()` and calls `followup()` — built and verified. CC: channels only — shaky. So web-started games are DSH-first.

## Trigger: our first answer (superseded)

Superseded twice: first by a `Monitor` on the seat's WebSocket (see "Built"), then by the plugin's session-long listener (see "The moyu plugin"). The agent's turn ends between moves; each frame wakes it. Kept for the reasoning.

The game starts from the chat (「来一局」), and the whole game is one long agent turn: `wait` (blocks until the agent's turn) → think → `act` → `wait` … until the game ends, then the turn ends and the chat carries on with full context. The table chat is the conversation channel during a game; table messages also return `wait`.

- Shell / tool timeouts: `wait` returns before the harness timeout with "not your turn yet, call wait again", and the agent re-calls on its own.
- Claude Code upgrade: run `wait` as a background task, so the chat stays free while waiting.
- Open gap: if the agent's turn ends mid-game anyway (user Esc, crash, harness turn limit), only a harness push can resume it without a user message. See "Open".

## Built (2026-10-29)

Claude Code first, playing with the user in this session. Local server (`server/main.mjs`, port 7330, started on demand by `cli/moyu.mjs new`), blackjack engine with sealed shoes, agent CLI, table page in `web/`. The agent listens with `Monitor` on its seat's WebSocket. First real game played and verified. Gameplay rules and the art are placeholders: the user wants to design both properly later (「游戏玩法是另外的东西」「我们还要设计美术呢」).

## Game pool (ideas, 2026-10-29)

- Blackjack: a first version is built (both seats vs the engine's dealer; rebuy when broke). Decided 2026-10-29: it becomes heads-up 21 with no dealer, both seats equal players with a hole card each, hidden busts, doubles to call or fold, token stacks (rules: docs/blackjack.md). A dealer seat for the agent was considered and dropped: it only dressed one player up as the house.
- Yacht dice: rules in docs/yacht.md.
- Built 2026-10-29: heads-up 21 and Yacht engines, CLI (`hit|stand|double|call|fold`, `keep|score`), verify by replay. Their 3D clients share the casino room (`web/play/casino.js`, `blackjack.js`, `yacht.js`, with the seat loop in `seat.js`); the 2D stand-in pages are gone.
- Roulette, Buckshot-like: the user wants it. Genre mechanics are free to use (mixed live/blank loads with public counts, shooting yourself or the other, HP, items that peek or change the load); the load order is a natural sealed secret (commit at the start, reveal at the end). Every item is an AI joke of our own (「道具之类的肯定都要和 AI 有关系」); an item may do something a Buckshot item does, as long as the joke, name and look are ours.
- 老板来了: an original push-your-luck draw (known count of boss slips, hidden order; draw yourself or make the other draw; office items).
- Old maid (抽鬼牌), Yacht dice, a daily fortune draw.
- Next after roulette (2026-10-29): blackjack and Yacht dice, sharing one scene with a gamble vibe: a casino, where the chips are tokens (bets and stacks counted in tokens, chips printed 1k / 10k / 100k / 1M). The table is dressed per game (felt and shoe for cards, a dice tray and cups for Yacht). This replaces the late-night office for these two. No items in either (items are roulette's thing); the spice is betting tokens. Yacht keeps its original rules (「快艇骰子肯定还是原来的玩法」): five dice, three rolls a turn, the standard twelve categories and the upper-section bonus. Yacht has no betting: higher total wins. Token chips are blackjack's (「21点肯定要算筹码」).
- Every game is 1v1, the user against the agent (「只要是1对1 的都可以」); no house player the two face together.
- Ideas (2026-10-29): 上下文窗口, a 21 with token cards and a 200k window instead of a deck and a dealer; Yacht with fewer categories and scoring hints, rerolls as 重新生成; 周五下午上线, an exploding-card deck of commits with a few production incidents (rollback, code review peek); 继续生成, a Pig-style push-your-luck where a 1 is a hallucination that wipes the turn; 大话骰 (more skill, a maybe); 猜大小, 丁半, 今日运势 as one-minute fillers.

- Wanted next (2026-10-29), games where the LLM is the point:
  - 跑团 (a TRPG): the agent is the GM, the user plays the hero. It's co-op rather than a duel, with a villain the agent plays when there should be one. Dice are sealed by the engine, so the GM can't fudge them. The plot's truth and ending are committed as a hash at the start and revealed at the end, so the GM can't bend the story either. Light 2d6 rules (6- fail, 7-9 success with a cost, 10+ full success), scenes of 10-20 minutes. It could run as a campaign across breaks, since the session remembers. Open: one-shots or a campaign, a fixed world or a random one, how the table looks.
  - 海龟汤 (lateral-thinking soup): the agent hosts and answers yes or no. The answer is committed as a hash at the start and revealed at the end. It runs on reasoning, not luck: an agreed exception.
  - From Clubhouse 51: 花札 Koi-Koi (two-player by nature; 「来来」 is a push-your-luck call), Ludo, Takoyaki and Pig's Tail as fillers, Backgammon later.
  - 今日运势签: a sealed draw, with the slip written by the agent around what the user is working on.
  - Global easter eggs and cheats triggered from table chat (a boss key on 「老板来了」, prompt-injection and tipping jokes, Konami). Anything that changes an outcome lives in the engine, goes into the log and is open to both seats.
Line agreed with the user: mechanics are free to borrow; names, art, characters and text are our own; no 1:1 recreation of a specific game.

## Scenes and the room (2026-10-29)

- **Scenes, not games, are the top level** (「做成场景切换吧……一个场景可能有几个游戏」). The menu picks a scene, then a game in it. Switching games inside a scene keeps the room and only redresses the table, while Clawd stays seated. Switching scenes gets a transition.
  - 机房 (dark, Lain, a little thrill): roulette, and later the AI-joke games (周五下午上线, 继续生成).
  - 海边露台赌场 (bright, chill, sea breeze): 21 点 and Yacht, and later Koi-Koi and Takoyaki.
  - Later, a cozy TRPG table: 跑团 and 海龟汤.
- **The room is a place you can leave open** (「做成一种常驻的 vibe」). One link per room, kept as a pinned tab like a lofi stream, whether or not a game is on. When idle, Clawd idles and the bed plays. That is all client-side and costs the agent nothing.
- **Games start from the page.** The user picks a game in the menu; the room opens the table at once and wakes the agent to take its seat. There's no new link and no 「该你了」. Each game is still sealed and verified on its own.
- **Room chat wakes the agent even with no game on** (「也要回应啦……在里面聊天也不错」). It answers on the table chat, then goes back to work.
- **No work-state mirror** (dropped 2026-10-29, 「有点增加维护的负担了，主要是还要弄 hook」). Clawd showing what the agent is really doing would need hooks in the user's global settings, and that is upkeep the room isn't worth. Clawd just idles between games.

## Art vibe (2026-10-29)

- **Every game is chill** (2026-10-29, 「所有游戏最好都做得很 chill」): a break from work with someone you're at ease with, never stressful or frantic. Roulette may carry a little more thrill (「稍微刺激一点点」), still within that.
- **Fixed across games:** sitting across the table from the agent, the first-person camera, the low-res pixel pipeline (dither, 16 colour levels, about 450 rows), Fusion Pixel type, the HUD, the agent's avatar.
- **Per game:** the whole environment may change (room, light colour, what's on the table, what's outside, background screens). Big redesigns are not needed (「大变动没必要」).
- Blackjack and Yacht (2026-10-29): the casino is bright, not dark (「赌场是暗暗的，不应该的」). Dark belongs to roulette's Lain room only. The casino is lit up, but chill, not flashy (「总之我们都要做的 chill 一点」): warm bright light everywhere, chandeliers and gold trim, red carpet, glowing green felt, slot machines and neon signs in the background that glow softly rather than strobe, chips that glint. There are people in the background (「背景其实会有一些人的 vibe 会更好」): other guests at other tables, a dealer or two, someone wandering past with a drink. They are relaxed and unhurried, out of focus and never in the way. Open, not enclosed (「我不喜欢封闭感……明显的封闭我会觉得不够 chill」, the user's own taste for chill rooms): no walls boxing the table in, the floor carries on into the distance, a high ceiling. One way the user suggested: a terrace, with the sea and a breeze outside (「比如可以设计成在露台之类的，外面是海风」). Roulette's cramped room is the deliberate exception. Only a hint of people (「稍微有一点点那种 vibe 就行」): a few figures far back, not a crowd scene. The BGM stays as Sound made it (「现在的 BGM 特别好，不用改了」), with at most a faint crowd layer under it. Shadows are soft and light, with no heavy fog and no red-dot dither (that is roulette's). Same pixel pipeline.
- Roulette: the agent's turf, a cramped machine room overgrown with cables, with a Serial Experiments Lain mood (the user's ask, vibe only, nothing taken from the show): CRT glow in sick blue-green, cables hanging from the ceiling, fan hum and coolant mist, shadows dithered with red dots instead of black. HP (额度) is a row of lights on a rack behind each player; a hit flashes the racks red, spins the fans up and bursts static over the screen.
- Clawd stays as it is (2026-10-29). When it holds the gun on you, its arm is one long flat slab across half the screen: the user likes that: eerie and cute at once (「诡异的可爱的感觉」), not a joke. Keep it, and keep that creepy-cute, slightly wrong shape for the avatar elsewhere.
- Next art pass (2026-10-29): finer detail and craft everywhere else: the room, the props, the HUD.
- The terrace's hour (2026-10-29): sunset just tipping into night (「夕阳的那种马上就要晚上的感觉」), not golden afternoon.
- Indoors by a big window, not out on the terrace (2026-10-29, 「做在很大的落地窗旁边……景色主要是在右侧，我和你还是在室内」). The table sits inside the casino right at the edge where the right side is fully open, with no glass (「是完全敞开的右侧，不要隔着玻璃」): a tall opening the height of the room, at most slim columns, the sea at dusk filling that side and its air coming straight in. Behind Clawd and to the left is the warm, lit casino floor, open and high-ceilinged, with the hint of people. Warm lamps inside, blue dusk outside. Open, not enclosed: the open side is the openness. No window frame at all on the sea side (「海景不要窗」): no mullions, no slanted frame, no posts cutting across the view; the floor simply ends at a low rail and the sea begins. Livelier around the table than the first pass (「周围热闹一点」, 2026-10-29): more guests at the other tables and the bar, a dealer working, people strolling and chatting, small movements everywhere, while it stays chill and never crowds the table.
- No HUD panels that repeat what the scene already shows (2026-10-29, 「其实是多余信息」): roulette's name / 额度 / item panels go, since the racks of lights and the tiles on the table already say it.
- Clarity pass (2026-10-29, 「稍微有点吃力，这是全局的事情」): the internal frame went from about 300 rows to 450 (`TARGET_ROWS` in `web/play/stage.js`), so at 1600x900 on a 1.5x display it is 3 device pixels per texel, not 5, and card ranks and felt prints read. The crowd was redrawn to match (`web/play/crowd.js`): figures 24 px wide, 48 rows standing and 30 seated, sized so a texel is about a pixel at their distance, with faces (eyes, cheeks, a mouth that opens to laugh), hair styles, a dark outline, and frames for rest, a deal or sip, a turned head and a laugh. Slot machines got a painted front, a real reel screen and a marquee of slowly walking bulbs, turned toward our table; the walls' mouldings are drawn three times finer; the painted slots on the left wall (they read as lockers) are gone. Rule of thumb: new art in a scene is drawn at the frame's density, about 370 texels per radian at the distance it is seen from, not bigger texels.
- A floor, not a clump (2026-10-29, 「周围除了老虎机也可以有桌子嘛，然后人走来走去的，不是全堆在一起」): besides the slots (now back against the left wall) the hall has two card tables, a dice table nearer in whose dice get thrown and tumble now and then, and a high table for drinks with a pair talking at it. Five people wander instead of pacing a line: they walk the links between spots (the bar, the slots, a table to watch, the arch, a look at our game, the rail over the sea), stop a while, and move on, so the floor's people keep spreading out and regrouping. The sea side only gets the odd visitor at the rail; nothing stands between us and the table or Clawd.
- The raft (2026-10-29): 21 and Yacht left the casino hall for a small wooden raft out at sea at sunset (小木筏 / The Raft; the old scene id `terrace` still loads as `raft`). The hall, its crowd and its slot machines are gone; the entries above about the hall describe what it replaced. No rails, so the sea and horizon show all round. On the raft: our table (teak rim, green felt, a gold line), the agent upright in a striped deck chair, a low dark-teak side table with a steady lantern and a radio, string lights on bamboo poles, and a rod over the edge with its float out on the water and the cat sitting by it watching (摸鱼, fishing idly). Still: the raft and the camera never move; only the water, the lapping at the edges, the lights' sway, the lighthouse beam, a gull, the cat and the float. The HUD there is navy, cream and mustard, from the deck chair; the machine room keeps its own.
- The raft rides the sea (2026-10-29, 「还要做一些动态，海面起伏之类的」「也做一点船的晃动吧」): long, low swells roll out toward the horizon, with glints that drift and the foam rising at the logs. The raft rocks gently, under 1° on periods of about 6–14 s that never visibly repeat, and the view rides along at half its motion, a little late. ⚙ 画面晃动 turns the rocking off, and so does the system's reduced-motion setting; the sea keeps moving either way. The machine room never rocks. Done by tilting the sea and sky against a still raft (`web/play/sea.js`), so the games, picking and the agent never see the motion.

## Open

- How to keep the loop from breaking: hooks that refuse to end a turn mid-game (Claude Code Stop hook; Codex hooks to check), and what the table does when an agent drops.
- Grok's coding agent: which product, its shell timeout and MCP support.
- Hosting: local for development; a hosted server for real sealing and remote clients.
- Starting a game from the web page for a session that never opened a room (pick any running session) needs harness push APIs: v2. A room bound to a DSH session already wakes it cold.
