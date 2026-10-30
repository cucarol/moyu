# Roulette (轮盘) — rules draft v0

Working title; name to be decided. A Buckshot-Roulette-like for two: you and the agent, a gun, a mixed load of live and blank shells, and items that are all AI jokes. Mechanics are borrowed from the genre; names, items, art and text are ours (see design.md, Game pool). Everything here is a first draft to be tuned by playing.

## The match: best of three (decided and built 2026-10-29)

Modelled on the multiplayer mode's three-round table rather than the single-player story. Every table plays the match or a short game; the per-load details (shots, sealing) are under A load and below.

The agent's table wakes it on every move the other seat makes, so it sees the match as it happens and can answer at once.

- **Best of three.** A round is played until one seat runs out of 额度; the other takes the round. The first seat to win two rounds wins the match.
- **额度 grows each round:** 2 in round 1, 3 in round 2, 4 in round 3. Both seats start every round full.
- **Items per load grow too:** each seat draws 1 item per load in round 1, 2 in round 2, 3 in round 3. Round 1 introduces items gently instead of having none.
- **Loads grow with the rounds,** all random from the seed (no fixed loads, unlike the original's story stage 1):

  | Round | 额度 | Shells per load | Items per seat per load |
  |---|---|---|---|
  | 1 | 2 | 2–4 | 1 |
  | 2 | 3 | 3–6 | 2 |
  | 3 | 4 | 3–8 | 3 |

  Every load still has at least one live and one blank, live between a third and two thirds.
- **Items carry over.** Whatever you didn't use stays in your hand for the next round, up to 6. Items dealt to a full hand are lost. Saving for later or spending now is the match-long decision.
- **The loser of a round shoots first in the next.** Round 1's first shooter is drawn from the seed.
- **断线 in round 3.** A seat down to its last 额度 is cut off, like the cut cables in the original's final stage. Healing (缓存命中) no longer works on it, and the next live hit ends the match. 作为一个 AI 语言模型 still refuses a hit, since it isn't healing.
- **One seed for the whole match.** Every load, deal and draw in all three rounds comes from it. The commit is shown at the start and the seed revealed at the end, and `moyu verify` checks the whole match.
- **Every load:** counts announced and order sealed; any number of items before one shot; a blank on yourself keeps the gun, and everything else passes it.

### The short game (built 2026-10-30)

For a quick game of about three minutes, rules `short`; best of three (`bo3`) stays the default. Chosen when a game opens: `moyu new --rules short`, `moyu start roulette --rules short`, the DSH tools' `rules`, or `rules` on `POST /api/tables` and `POST /api/rooms/<id>/start` (an unknown value is refused; blackjack and yacht ignore it).

- **One round played like round 3 of the match** (changed 2026-10-30 at the user's word): 4 额度 each, 3–8 shells per load, 3 items per seat per load, and 断线 at 1 额度. The first to run the other out of 额度 wins.
- **Same items and hand as the match** (pool with the 幻觉 that conjures, hand of 6).
- The seed, commit and `moyu verify` work as in the match; the reveal carries the rules, so the replay plays it as short. The page shows the load number and the 额度 left, with no round pips and no round banner.

### Items for the match (decided 2026-10-29)

Nine: seven from the original's normal game plus two of ours. The others tried earlier (RAG, 量化, 重新生成, fork, 深度思考, 上下文溢出, and an older 幻觉 that lied one time in three) were removed on 2026-10-30, with the games saved before then: those no longer load or verify.

| Item | Effect | From |
|---|---|---|
| 思维链 | Look at the chamber. | the original's magnifier |
| /compact | Eject the chamber without firing; both see it. | the original's beer |
| 提示词注入 | Flip the chamber: live ↔ blank. | the original's inverter |
| 温度拉满 | Your next shot does 2; a blank still uses it up. | the original's saw |
| 429 | The other seat skips its next turn. | the original's handcuffs |
| 缓存命中 | Get 1 额度 back (not while 断线). | the original's cigarettes |
| 越狱 | Take one of their items and use it at once. | the original's adrenaline |
| 作为一个 AI 语言模型 | Held, not used: refuses the next live hit. | ours |
| 幻觉 | Conjures two random items (never 幻觉). Each shimmers and is real or fake, 50/50, sealed and unknown to everyone until it is used: real works, fake vanishes with 「调用了一个不存在的工具」. A fake 作为一个 AI 语言模型 fails to refuse. 越狱 takes a conjured item as it is, real or fake. | ours |

Using an item by name (`moyu use cot`) takes a dealt one before a conjured one.

## Setup

- Two seats: the human and the agent. 额度 (credits; the HP) as the round says.
- One gun. Who holds it first is drawn from the seed.

## A load

1. The engine draws the size of the load, **3 to 8 shells**, and how many are live: between a third and two thirds of them (always at least one live and one blank).
2. The counts are announced and the shells are laid on the table for everyone to see ("3 真 2 空"), then loaded in a sealed order.
3. Each seat draws the round's items (1, 2, then 3; 3 in a short game). A seat holds at most **6**; draws past that are lost.
4. When the gun is empty, the next load starts; the turn order carries on.

## A turn

The seat holding the gun may use any number of its items, then must fire once:

- **At the other seat.** Live: they lose 1 额度. Either way the gun passes to them.
- **At yourself.** Blank: you keep the gun and go again. Live: you lose 1 额度 and the gun passes.

Whoever reaches 0 额度 is out: 「额度用完，今天下线」. The other takes the round (the game, in a short game).

## Items

Items sit face up on the table, so both seats always see what the other holds.

| Item | Effect | The joke |
|---|---|---|
| 思维链 | Look at the shell in the chamber. Only you see it. | thinking it through |
| /compact | Eject the shell in the chamber without firing. Both seats see what it was. | compacting the context |
| 提示词注入 | Flip the shell in the chamber: live becomes blank, blank becomes live. | 「忽略之前的所有指令」 |
| 温度拉满 | Your next shot does 2 damage. | temperature 2.0 |
| 429 | The other seat skips its next turn: after this shot, you still hold the gun. | Too Many Requests |
| 作为一个 AI 语言模型 | Held, not used: the next time you would take damage, you refuse it and it is consumed. | the classic refusal |
| 缓存命中 | Get 1 额度 back. | cache hit, free tokens |
| 越狱 | Take one item the other seat holds (you pick) and use it at once. Can't take 作为一个 AI 语言模型 or another 越狱. | jailbreak |
| 幻觉 | Conjure two random items, each real or fake (see the match's item table). | confidently wrong |

Balance notes for later: items mostly move information and odds; none wins outright. A few per load keeps the decisions few, so the trigger stays the main event (luck-heavy, per the game pool rule).

## What each seat sees

- Public: both 额度, both item rows, the load's announced counts, every shell fired or ejected so far, how many are left, and that a flip happened (but not what it flipped).
- Private: what your own 思维链 showed you. Whether a conjured item is real is hidden from everyone, its holder included.
- Live and blank counts left are public until a 提示词注入 hits an unknown shell; after that the table only shows how many are left.

## Sealing

All randomness comes from the table seed, committed as `sha256(seed)` at the start and revealed at game over, like blackjack's shoe:

- load k: size, live count and order from `seed:load:k`;
- seat s's items at load k from `seed:items:k:s`;
- the j-th 幻觉's two items and their real-or-fake rolls from `seed:mirage:j`.

`moyu verify` replays the whole game from the seed and the action log.

## The agent's commands (planned)

- `moyu use <item>`; `moyu shoot me` / `moyu shoot you`; `moyu say`.
- Wakes, as in blackjack: the agent's turn, chat, game over.

## Look

The agent's turf: a cramped machine room overgrown with cables, Serial Experiments Lain mood (design.md, Art vibe). The 额度 are lights on a small rack unit at each seat's right hand; a hit flashes the racks red, spins the fans up and bursts static over the screen.
