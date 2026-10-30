# Yacht dice (快艇骰子)

The classic: five dice, three rolls a turn, twelve categories, the higher total wins. No betting, no items. On the raft at sea.

## The rules

- The seats alternate turns, 12 each, one per category.
- A turn starts with all five dice rolled. `moyu keep <positions>` keeps those dice (1 to 5, as the board numbers them) and rerolls the rest; up to two rerolls, three rolls in all. `moyu keep` with nothing rerolls all five.
- After any roll you may stop. Every turn ends with `moyu score <category>` in a category you haven't used; 0 is allowed. The frame lists what each open category would score.
- Everything is public: both score sheets, the dice, which are kept, rolls left.

| Category | Id | Score |
|---|---|---|
| 1 点 … 6 点 | `ones` `twos` `threes` `fours` `fives` `sixes` | the sum of the dice showing that number |
| 全选 Choice | `choice` | the sum of all five |
| 四条 Four of a kind | `four` | four or more the same: the sum of all five |
| 葫芦 Full house | `house` | three of one and two of another: the sum of all five |
| 小顺 Small straight | `small` | four in a row: 15 |
| 大顺 Large straight | `large` | five in a row: 30 |
| 快艇 Yacht | `yacht` | all five the same: 50 |

**Bonus**: +35 when the six upper categories add up to 63 or more (three of each number). Five the same also counts as four of a kind, not as a full house.

## How to play it

Lightly: a luck game. No strategy lectures unless asked.

- Chase the upper bonus early: three or more of a number go into its upper box.
- Keep pairs and triples and roll for more of them; with four in a row showing, roll for the straight.
- On the last roll take the best score. When nothing fits, dump a 0 where it costs least: ones, or 快艇 late in the game.
- Use 全选 as the safety net for a big, shapeless roll, not early on a small one.
