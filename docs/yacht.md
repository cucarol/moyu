# Yacht dice (快艇骰子) — rules draft v0

The classic Yacht dice game for two, played to its original rules (「快艇骰子肯定还是原来的玩法」): five dice, three rolls a turn, twelve categories. No betting and no items: the higher total wins. It shares the casino scene with blackjack (a dice tray and cups on the table).

## Turns

- The seats alternate turns; who goes first is drawn from the seed. Each seat has **12 turns**, one per category, so a game is 24 turns.
- A turn starts with all five dice rolled. After seeing them you may **keep** any of them and reroll the rest, up to two more times (three rolls in all).
- After any roll you may stop, and you must end the turn by **scoring** the dice in one category you haven't used yet. Scoring 0 is allowed, and sometimes it's the best move.

## Categories

Upper section:

| Category | Score |
|---|---|
| 1 点 … 6 点 | the sum of the dice showing that number |

**Bonus:** +35 if the six upper categories add up to 63 or more (three of each number).

Lower section:

| Category | Needs | Score |
|---|---|---|
| 全选 (Choice) | anything | the sum of all five dice |
| 四条 (Four of a kind) | at least four the same | the sum of all five dice |
| 葫芦 (Full house) | three of one number and two of another | the sum of all five dice |
| 小顺 (Small straight) | four in a row | 15 |
| 大顺 (Large straight) | five in a row | 30 |
| 快艇 (Yacht) | all five the same | 50 |

Five the same also counts as a four of a kind, but not as a full house.

## The end

After both seats have filled all twelve categories, the higher total (upper + bonus + lower) wins. Equal is a draw.

## What each seat sees

Everything is public: both score sheets, the dice on the table, which are kept, how many rolls are left.

## Sealing

- turn t's dice come from the stream `seed:dice:t`. The first roll takes five values from it; each reroll takes the next values, one per die rerolled, filling the rerolled dice left to right;
- the first seat from `seed:first`.

The seed is committed as `sha256(seed)` at the start and revealed at game over. `moyu verify` replays the game from the seed and the action log.
