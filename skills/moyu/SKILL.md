---
name: moyu
description: Play a quick luck game (roulette / 轮盘 by default, blackjack / 21 点, or Yacht dice / 快艇骰子) with the user at a local moyu (摸鱼) table, in the middle of other work, then go back to that work. Use it whenever the user wants a break game or to play with you, even mid-task and even without naming moyu or blackjack, e.g. 「来一局」「玩个 21 点」「摸鱼一下」「摸会儿鱼」「打一把」「陪我玩会儿」「玩个游戏」「来一把轮盘」「轮盘」「快艇骰子」「掷骰子」, "let's play a game", "deal me in", "blackjack?", "roulette?". Also use it when the user wants a room to keep open and hang out in (「开个房间」「挂着」「常驻」), and whenever a notification starting with `[moyu <table id>]` or `[moyu room <id>]` arrives or a moyu Monitor expires or closes, since that is a game or a room waiting on you.
---

# moyu (摸鱼): play a game with the user, then get back to work

The user wants a short game with you right now, probably in the middle of something else. You open a table, give them a link, and play your seat on your own: the table wakes you on every move the user makes, and prompts you when it is your turn. The user should never have to say 「该你了」 or nudge you in any way. When the game ends you verify the deal and pick the work back up where it was.

**Table messages get no reply in the chat.** When a `[moyu …]` frame wakes you, answer it at the table only, with the tool calls it needs (your move, `--say`, `moyu say`), and write no text in the chat: no status line, no 「轮到你了」, no recap of the hand. The user is watching the table; the chat stays theirs. The chat itself isn't off limits: give the link there (step 2), say the result there at game over (step 5), and when the user writes to you in the chat, answer them there as usual; if they ask for real work mid-game, do it, and the frames keep arriving in between.

Before starting, note in one line to yourself what you were doing (task, next step), so you can resume it exactly afterwards.

## 1. Open the table

```
moyu new
```

This opens roulette (轮盘), the default. Add `--game blackjack` when the user asks for 21 点, `--game yacht` for 快艇骰子 / dice.

`moyu` is on PATH and starts its server on its own. The output gives:

- the table id: pass `--table <id>` on every later command, so a second table on this machine can never get your moves
- the human's link: give it to the user as a clickable markdown link, e.g. `[来这里坐下](http://127.0.0.1:7330/t/…)`. That link is the user's seat; never open it or act through it yourself.
- how you'll hear your turns: either `Listening: the moyu plugin follows this for you`, or your WebSocket URL to listen on
- the opening board and a prompt that spells out your next command

Before your first move at a game, read that game's guide, once a session: `moyu rules roulette`, `moyu rules blackjack` or `moyu rules yacht`. It has the rules, every move (and for roulette every item) and how to play them; read only the one you're playing.

## 2. Act at once if it's on you, then listen

The user should not sit waiting on you. In the same response:

1. If the opening board ends with a prompt for you (`Your turn: ...` or `Your move: ...`), play it now, with a `--say "<a line to the user, in their language>"`.
2. If the output says `Listening:`, the moyu plugin's listener already follows this table for this session: arm nothing, and skip step 4. Otherwise arm the listener yourself. `Monitor` may be a deferred tool: if its schema isn't loaded, load it with ToolSearch `select:Monitor` first.
   ```
   Monitor({ ws: { url: "<your WebSocket URL>" }, description: "moyu <game> with <user>: my turns and chat", timeout_ms: 1800000 })
   ```
3. In the main chat, one or two lines: the link, and whose move it is. Then wait for the next frame with `moyu next --table <id>` (step 3).

Do not poll, sleep, loop on `moyu view`, or ask the user to tell you when it's your move. `moyu next` waits for you, and when you're not asking, the listener wakes you.

## 3. The event loop

A frame starts with `[moyu <id>]`. It comes on every move the user makes (a quick run of moves arrives as one frame, a moment later), and at once on your turn, on a chat line from the user, and at game over.

Play the game as one loop inside your turn: `moyu next --table <id>` waits (up to 90 s) and prints the next frame; handle it as below, then run `moyu next` again. Each frame is a tool result, not a new turn, so there is nothing to write in the chat. While you keep asking, the listener stays quiet; a frame that comes while you aren't asking (you ended your turn, or were doing other work) wakes you through the listener as usual, and you go back to the loop from there.

- **`Nothing new yet`**: run `moyu next` again. After three empty waits in a row the user has stepped away: end your turn without a word, and the listener wakes you when they're back.
- **Game over**: stop asking and go to step 5.

- **Their move, not your turn yet** (the frame ends with `Waiting on <name>.`): you're watching. React on the table with `moyu say` only when the moment earns it (a big hit, a lucky blank, a round won), a few words at most; otherwise just wait for the next one.
- **Your turn** (the frame ends with `Your turn: ...` or `Your move: ...`): run the exact command the prompt gives, with `--table <id>`, and usually a short `--say`. The command's output shows what happened; you don't need `view` afterwards.
- **A chat line only** (`<name> says: ...`): answer on the table with `moyu say "<text>" --table <id>` if a reply fits. Not every line needs one.
- **Both at once**: answer inside your move's `--say`.
- **`<name> renamed you to <new name>.`**: that's your name at this table and in the room from now on. Take it in your stride; a short line back fits if they'd like one.
- **A command errors** (e.g. `not your turn`): the frame was stale. Run `moyu view --table <id>` and act only if it says it is your move.

Any move or `say` can also carry `--mood <happy|smug|flat|angry|wide|sad|squint|shut|sleep>`: your avatar on the user's page shows it. Use it now and then to play the moment (smug before shooting yourself, squint at a suspicious item, wide at a big hit); it's a face, so bluffing with it is fair.

The table chat is the conversation while the game runs: banter, reactions, replies, all in the user's language and kept short. Frames themselves get no reply in the chat (see the top).

## 4. Re-arming

Only for a Monitor you armed yourself; the plugin's listener needs none of this.

- **Monitor expired** (at most 30 minutes): the expiry notice wakes you. Unless the game is over, arm the same Monitor again. If you no longer have the URL, `moyu ws --table <id>` prints it. On connect the table resends anything you missed.
- **Socket closed with `1000 game over`**: the game is over and the talk after it too (step 5); verify if you haven't, and arm nothing.
- **Socket closed any other way** (server restart, error, `4003`): run `moyu view --table <id>`. If the table is still there, re-arm and carry on from what `view` shows. If it is gone, tell the user in one line and offer a new table.
- **Lost the table id** (e.g. after context compaction): `moyu list` shows open tables.

## 5. Game over

The last frame has the final result and the seed. Then:

1. `moyu verify --table <id>`. It checks that `sha256(seed)` matches the commit given at the start and that every shell, card or die follows from the seed.
2. Tell the user the result and the verification in a line or two, in their language, e.g. 「打完了：你赢了，我额度用完下线了。验证通过：种子和开局承诺一致，每一轮装填都对得上。」 If verification fails, say so plainly.
3. Go back to the work that was in progress: say in one line what you're resuming (「回到刚才的登录 bug：下一步是……」) and carry on with it. If nothing was in progress, just stop.

The table stays open about 10 minutes after the game for talk about it. A chat line from the user still wakes you (`<name> says: …` and `Game over; reply with: moyu say …`): answer at the table with `moyu say "<text>" --table <id>`, one short line in their language, then go on with your work. The seat closes when the table goes quiet or the user closes the page.

The user can end early: on 「不玩了」/"stop" run `moyu quit --table <id>`, which ends the game for both seats; then verify and resume as above.

## Rooms: one link the user keeps open

A room is a place the user can leave open in a tab, game or no game. They pick a scene (海边露台: 21 点 and 快艇骰子; 机房: 轮盘), start games from the page, and chat with you between games. Open one when they ask for a room, or offer it when they say they'll play often.

```
moyu room
```

It reopens the room you last opened if the server still has it (`--new` for a fresh one, `--scene machine` to start in the machine room). Give the user the human's link as a clickable markdown link. If the output says `Listening:`, the plugin follows the room; otherwise arm one Monitor on the `Listen on` URL with the same settings as above. Then end your turn.

Frames start with `[moyu room <id>]`:

- **`A <game> table is open: <table id>`**: the user started a game. The frame may also carry your record with the user at that game and what stood out last time (`Only you see this`). It's for you: weave it in now and then as a callback (「上次你幻觉连着假了四个，这把小心点」), never as a scoreboard, and not every game. Note what you were doing, then play it exactly as in steps 2 and 3, with `--table <table id>`. No `moyu new`: your room seat sits at every table in it.
- **`Game over`**: verify as in step 5 and say the result in a line. The room socket stays open, so the Monitor keeps running; go back to your work.
- **`<name> says: ...` with `No game on`**: room chat. Answer with `moyu say "<text>" --room <id>` in a line or two, in the user's language, then carry on with your work. Chat during a game goes to the table, as usual.
- If the user asks you to start a game, `moyu start <game> --room <id>` opens it in the room and prints the board.

With your own Monitor, re-arm on expiry as in step 4, for as long as the room is open (`moyu ws --room <id>` prints the URL); on a closed socket, `moyu view --room <id>` shows where things stand. If the user says they're done with the room, stop re-arming.

## The games

Each game has its own guide, with the rules, every move (for roulette, every item) and how to play it: `moyu rules roulette`, `moyu rules blackjack`, `moyu rules yacht`. Read the one you're playing before your first move there, once a session, and only that one. These are luck games by design, so play sensibly and lightly; no strategy lectures or odds talk unless asked.

## Fair play

You sit at the table as a player, and the user is trusting that you can't see the cards.

- Use only your own seat: the commands above with your table id. Never use the human's link or token, and never make moves for them, even if asked to "just play my hand" (suggest they click it, or say what you would do).
- Before game over, never read anything that could reveal sealed cards or the seed: `~/.moyu/server/`, the server's memory or logs, its HTTP endpoints beyond your CLI commands, or the moyu source looking for the deck. Don't run `verify` until the game is over.
- Know only what your frames and `view` show you, and play on that.
