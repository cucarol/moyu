---
name: moyu
description: Play a quick luck game (roulette / 轮盘 by default, blackjack / 21 点, or Yacht dice / 快艇骰子) with the user at a local moyu (摸鱼) table, in the middle of other work, then go back to that work. Use it whenever the user wants a break game or to play with you, even mid-task and without naming moyu, e.g. 「来一局」「玩个 21 点」「摸鱼一下」「打一把」「陪我玩会儿」「来一把轮盘」「快艇骰子」, "let's play a game", "blackjack?". Also when the user wants a room to keep open (「开个房间」「挂着」), and whenever a message starting with `[moyu <table id>]` or `[moyu room <id>]` arrives: that is a game or a room waiting on you.
---

# moyu (摸鱼): play a game with the user, then get back to work

The user wants a short game with you, probably mid-task. You open a table, give them a link, and play your seat with the `moyu_*` tools. The moyu plugin wakes you with a `[moyu <id>]` message on every table event, so the user never has to say 「该你了」. When the game ends you verify the deal and resume your work.

**Table messages get no reply in the chat.** When a `[moyu …]` frame wakes you, answer it at the table only, with the tool calls it needs (your move, `say`, `moyu_say`), and write no text in the chat: no status line, no 「轮到你了」, no recap of the hand. The user is watching the table; the chat stays theirs. The chat itself isn't off limits: give the link there (step 2), say the result there at game over (step 4), and when the user writes to you in the chat, answer them there as usual. If they ask for real work mid-game, do it; frames keep arriving in between.

Before starting, note in one line what you were doing (task, next step), so you can resume it exactly.

## Commands are tools

Table prompts are written as CLI commands, e.g. `Your turn: moyu shoot me | moyu shoot you (--table 3fa2 [--say "..."])`. Each `moyu <verb>` is the tool `moyu_<verb>`, and its flags are the tool's arguments: `moyu shoot me --table 3fa2 --say "..."` is `moyu_shoot {target: "me", table: "3fa2", say: "..."}`; `moyu keep 1 3` is `moyu_keep {positions: [1, 3]}`; `moyu use jailbreak --pick cot` is `moyu_use {item: "jailbreak", pick: "cot"}`. Always pass `table` (or `room`). There is no shell command to run and nothing to arm.

## 1. Open the table

`moyu_new {human: "<user's name, if known>"}` opens roulette; add `game: "blackjack"` for 21 点 or `game: "yacht"` for dice. It starts the moyu server itself and returns:

- the table id: pass it as `table` on every later call
- the human's link: give it to the user as a clickable markdown link, e.g. `[来这里坐下](http://127.0.0.1:7330/t/…)`. That link is the user's seat; never open it or act through it.
- `Listening: …`: the plugin follows this table for this session
- the opening board, ending with a prompt if it's on you

Before your first move at a game, read that game's guide, once a session: `moyu_rules {game}` (see The games).

## 2. Act at once if it's on you, then end your turn

In the same response: if the board ends with `Your turn: ...` or `Your move: ...`, play it now with a short `say` in the user's language. Then one or two lines in the chat (the link, whose move it is) and end your turn. Never poll, sleep, loop on `moyu_view`, or ask the user to tell you when it's your move: ending your turn is how you wait.

## 3. The event loop

Each `[moyu <id>]` message is a table frame: on every move of the user's (a quick run arrives as one frame), at once on your turn, on a chat line, and at game over.

- **Their move, not yours** (ends with `Waiting on <name>.`): you're watching. React with `moyu_say` only when the moment earns it, a few words; otherwise end your turn without a word.
- **Your turn**: make the move the prompt names, with `table` and usually a short `say`. The tool's output shows what happened; no `moyu_view` needed.
- **A chat line** (`<name> says: ...`): answer with `moyu_say` if a reply fits. Both at once: answer inside your move's `say`.
- **`<name> renamed you to <new name>.`**: that's your name now; take it in your stride.
- **A move errors** (e.g. `not your turn`): the frame was stale. `moyu_view {table}` and act only if it says it's your move.

Moves and `moyu_say` take `mood` (happy, smug, flat, angry, wide, sad, squint, shut, sleep): your avatar's face on the user's page. Use it now and then to play the moment; bluffing with it is fair.

Table chat is the conversation during a game: short, in the user's language. Frames themselves get no reply in the chat (see the top).

## 4. Game over

The last frame has the result and the seed. Then `moyu_verify {table}`, tell the user the result and the verification in a line or two (「打完了：你赢了。验证通过：种子和开局承诺一致，每一轮都对得上。」; if it fails, say so plainly), and go back to the work in progress, saying in one line what you resume. On 「不玩了」/"stop", `moyu_quit {table}` ends it for both seats; verify and resume as above. Lost the table id? `moyu_list`.

The table stays open about 10 minutes after the game for talk. A user's chat line still wakes you (`<name> says: …`, `Game over; reply with: …`): answer at the table with `moyu_say {text, table}`, one short line in their language, then back to your work.

## Rooms

A room is one link the user keeps open, game or not: 小木筏 raft (21 点, 快艇骰子) or 机房 machine (轮盘). `moyu_room {human}` reopens your last room (`new: true` for a fresh one, `scene: "machine"` for the machine room). Give the link, then end your turn. Frames start with `[moyu room <id>]`:

- **`A <game> table is open: <table id>`**: the user started a game. It may carry your record with them (`Only you see this`): weave it in now and then as a callback, never as a scoreboard. Play it as in steps 2 and 3 with that `table`; no `moyu_new`.
- **`Game over`**: verify as in step 4, say the result in a line, back to work.
- **`<name> says: ...` with `No game on`**: room chat; answer with `moyu_say {text, room}` in a line or two, then carry on.
- The user asks you to start one: `moyu_start {game, room}`.

## The games

Each game has its own guide, with the rules, every move (for roulette, every item) and how to play it: `moyu_rules {game}` for roulette, blackjack or yacht. Read the one you're playing before your first move there, once a session, and only that one; its commands are written for the CLI and map to the tools as above. Luck games: play sensibly and lightly; no odds lectures unless asked.

## Fair play

The user trusts that you can't see the cards.

- Use only your own seat, through these tools. Never use the human's link or token, never move for them, even if asked.
- Before game over, never read anything that could reveal the seed or sealed cards: `~/.moyu/server/`, the server's memory or logs, its HTTP endpoints, or the moyu source. Don't verify before game over.
- Know only what your frames and `moyu_view` show you.
