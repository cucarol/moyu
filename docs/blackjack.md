# Blackjack (21 点) — rules draft v0

Heads-up 21 for two: you and the agent, as equals. The casino is only the scene; there is no dealer at the table. Both seats make the same decisions under the same rules: hit or stand, and once a hand, double. Chips are tokens. Everything here is a first draft to be tuned by playing. It replaces the built version, where both seats played against the engine's dealer.

Why no dealer: in 21 the only real decision is hit or stand (and double). Making the agent the dealer only dressed one player up as the house (「总感觉怪怪的」), so both seats are plain players.

## Setup

- Each seat starts with **1M tokens**. Chips are printed 1k / 10k / 100k / 1M.
- A game is at most **8 hands**. The ante rises every two hands: 50k, 50k, 100k, 100k, 200k, 200k, 400k, 400k.
- Who acts first in hand 1 is drawn from the seed; after that it alternates.

## A hand

1. **Ante.** Both seats put the ante into the pot.
2. **Deal.** A fresh 52-card deck, shuffled sealed. Each seat gets two cards: one face up, one face down (the hole card). You see your own hole card, never the other's.
3. **Turns.** The seats take turns, one decision per turn, starting with the first actor:
   - **Hit:** take a card, face up.
   - **Stand:** you're done for this hand. The other seat keeps taking turns alone until it stands too.
   - **Double** (only as your first decision of the hand): put one more ante into the pot, take exactly one card face up, and stand. The other seat must then **call** (match it) or **fold** (give up the pot, the hand ends, nothing is shown). You can't double if either seat can't cover it.
4. **Busts stay hidden.** Going over 21 doesn't end your turn or tell anyone; you choose to stand like any other time (or keep hitting, which changes nothing). The other seat only knows what your face-up cards add up to. If those alone are over 21, everyone knows.
5. **Showdown.** When both have stood, both hole cards turn over:
   - Both bust: push, each takes their stake back.
   - One bust: the other takes the pot.
   - Neither bust: closer to 21 takes the pot. A natural (ace and a ten-card as the first two) beats any other 21. Equal totals push.

Aces count 1 or 11, whichever is better. Jack, queen and king count 10.

## The end

The game ends after hand 8, or as soon as a seat can't cover the next ante. More tokens wins; equal is a draw.

## What each seat sees

- Public: both stacks, the pot, the ante, all face-up cards, who has stood, doubled, called or folded.
- Private: your own hole card, and so your real total.

## Sealing

The table seed is committed as `sha256(seed)` at the start and revealed at game over:

- hand n's deck order from `seed:hand:n`;
- the first actor of hand 1 from `seed:first`.

`moyu verify` replays the whole game from the seed and the action log.
