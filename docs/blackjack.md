# Blackjack (21 点)

Heads-up 21 for two: you and the agent, as equals, with poker-style betting. The casino is only the scene; there is no dealer at the table. Both seats make the same decisions under the same rules. Chips are tokens.

Why no dealer: in 21 the only real decision is hit or stand. Making the agent the dealer only dressed one player up as the house (「总感觉怪怪的」), so both seats are plain players.

Why betting: with only hit, stand and a double, a hand was mostly the cards' doing (the user: 「其实可以做的更赌博一点」). Two betting rounds with hidden busts make room for a bluff and a fold, and all in makes any hand a swing.

## Setup

- Each seat starts with **1M tokens**. Chips are printed 1k / 10k / 100k / 1M.
- A game is at most **8 hands**. The ante rises every two hands: 50k, 50k, 100k, 100k, 200k, 200k, 400k, 400k.
- Who acts first in hand 1 is drawn from the seed; after that it alternates. The first actor of a hand acts first on each of its streets.

## A hand

1. **Ante.** Both seats put the ante into the pot.
2. **Deal.** A fresh 52-card deck, shuffled sealed. Each seat gets two cards: one face up, one face down (the hole card). You see your own hole card, never the other's.
3. **Bets.** A betting round (below).
4. **The draw.** The seats take turns, one decision per turn:
   - **Hit:** take a card, face up.
   - **Stand:** you're done drawing. The other seat keeps taking turns alone until it stands too.
   Over 21 you can only stand. Nobody is told: the other seat only knows what your face-up cards add up to. If those alone are over 21, everyone knows.
5. **Last bets.** Another betting round.
6. **Showdown.** Both hole cards turn over:
   - Both bust: push, each takes their stake back.
   - One bust: the other takes the pot.
   - Neither bust: closer to 21 takes the pot. A natural (ace and a ten-card as the first two) beats any other 21. Equal totals push.

Aces count 1 or 11, whichever is better. Jack, queen and king count 10.

## Betting

Pot-limit, with no cap on the number of raises:

- **Check:** no bet. Two checks close the round.
- **Bet:** the size of the pot.
- Facing a bet: **call** (match it; the round closes), **raise** (call, then add the pot as it stands after the call), or **fold** (the other seat takes the pot; the hand ends and nothing is shown).
- **All in:** everything the other seat can still match. No bet is ever bigger than that, so there are no side pots. When a raise the size of the pot would be all in or more, all in is the only raise.
- A betting round in which a seat has nothing left (all in) is skipped; the draw still happens.

## The end

The game ends after hand 8, or as soon as a seat can't cover the next ante. More tokens wins; equal is a draw.

## What each seat sees

- Public: both stacks, the pot, the ante, all face-up cards, every bet, who has stood, called or folded.
- Private: your own hole card, and so your real total.

## Sealing

The table seed is committed as `sha256(seed)` at the start and revealed at game over:

- hand n's deck order from `seed:hand:n`;
- the first actor of hand 1 from `seed:first`.

`moyu verify` replays the whole game from the seed and the action log.
