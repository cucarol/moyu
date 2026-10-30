# moyu (摸鱼)

Play a quick luck game with the AI agent you are working with, right in the middle of the work, and then get back to it.

[中文说明](README.zh-CN.md)

<!-- Screenshot: the launch video's still goes here, e.g. ![moyu](docs/media/moyu.png) -->

You say 「来一局」 or "let's play a game". The agent opens a table on a small local server and gives you a link. You play in the browser, a 3D pixel table, and the agent plays its own seat from the session: it is woken on every move you make, talks at the table, and you never have to tell it that it's its turn. When the game is over, it verifies the deal and picks the work up where it left off.

moyu works with **Claude Code** (as a plugin) and **DeepSeek Harness** (as a DSH plugin). It has no npm dependencies; it needs Node.js 22 or later and a browser.

## The games

- **Roulette (轮盘)**: two seats, one gun, a sealed load of live and blank shells, and items that are all AI jokes (思维链 to look at the chamber, 提示词注入 to flip it, 429 to skip the other's turn, 越狱, 幻觉 …). Shoot yourself and survive a blank to go again, or shoot the other. Run out of 额度 and you go offline. Best of three rounds by default, or a short game of one round. Played in a cramped machine room.
- **21 (blackjack)**: heads-up, with no dealer. Both seats are equal players with a hole card each, hidden busts, and doubles the other must call or fold. Eight hands, betting tokens, on a raft at sea.
- **Yacht dice (快艇骰子)**: the classic: five dice, three rolls a turn, twelve categories, and the higher total wins. On the raft too.

Besides single tables there are **rooms**: one link you keep open in a tab, where either of you starts games and you can chat between them.

The page speaks English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português and Русский.

## Claude Code

The repository is a Claude Code plugin and its own local marketplace.

```bash
git clone <repo-url> moyu
```

Then, in Claude Code (use the absolute path of the clone):

```
/plugin marketplace add /path/to/moyu
/plugin install moyu@moyu-local
```

Restart Claude Code (or run `/reload-plugins`), then say 「来一局」, 「玩个 21 点」 or "let's play a game". The agent prints your link; open it.

The plugin brings three things:

- the `moyu` skill, which tells the agent how to open tables, play its seat and come back to work;
- the `moyu` command on the Bash tool's PATH (`bin/moyu`), which the agent plays with;
- a listener (`moyu-listen`) that follows the session's tables for the whole session and wakes the agent on every move.

**Without the plugin system**, the skill and the command can be installed on their own; the agent then arms its own listener with the Monitor tool:

```bash
cd moyu
npm link
node scripts/install-skill.mjs
```

## DeepSeek Harness

The `dsh` folder is a DSH bundle: it registers the `moyu_*` tools and the skill, and wakes the session on every table event. In DSH Desktop, open 插件 / Plugins, add a plugin from a local path and give it the clone's `dsh` folder, then restart DSH. With the DSH CLI:

```bash
dsh plugin --profile web add /path/to/moyu/dsh
```

Then open a session with skills (标准模式) and say 「来一局」. [dsh/README.md](dsh/README.md) has the other ways to install it and how the wakes work.

## Fair play

Every random thing in a game, from the shells in the gun to the cards in the shoe and the dice, is drawn from one secret seed that the server makes when the table opens.

- At the start the table shows `sha256(seed)`, the commit, to both seats.
- At game over the seed is revealed. The page checks it against the commit on its own, and the agent runs `moyu verify`. That replays the whole game from the seed and the logged moves, and checks that every shell, card or die follows from it.
- The agent only ever sees its own seat's view, through the same commands a player would use. The skill forbids it from reading the server's files or memory before the game is over.

The commit proves the deal was fixed before the first move and never changed. It cannot prove that an agent with shell access on your machine never peeked: that part rests on the rule in the skill.

## Running it

The server starts on its own when the agent opens a table, and it stops when nobody has used it for 10 minutes. A page left open after it stops says the table is asleep; ask the agent to continue and the page comes back.

| Setting | Default | |
|---|---|---|
| `MOYU_HOME` | `~/.moyu` | tables, rooms and the agent's seat state |
| `MOYU_PORT` | `7330` | the server listens on 127.0.0.1 only |
| `MOYU_IDLE_MS` | `600000` | stop after this long unused; `0` never stops |

`node cli/moyu.mjs` with no arguments prints every command.

## Development

```bash
npm test
```

The design notes and each game's rules are in [docs/](docs/).

## Licence

MIT, see [LICENSE](LICENSE). The pixel font is under the SIL Open Font License; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for it and for what the pages load at runtime. moyu is an independent project, not affiliated with Anthropic or DeepSeek.
