# Blackjack (21 点)

Heads-up 21 with betting and no dealer: you and the user are equal players under the same rules, betting tokens, on a raft at sea.

## The rules

- **Stacks and antes**: each seat starts with 1M tokens. A game is at most 8 hands; the ante rises every two: 50k, 50k, 100k, 100k, 200k, 200k, 400k, 400k. It ends after hand 8, or as soon as a seat can't cover the next ante. More tokens wins.
- **A hand**: both ante into the pot. A fresh deck; each seat gets one card face up and one face down (the hole card). You see your own hole card, never theirs. Who acts first alternates hand by hand, and acts first on every street of that hand.
- **Three streets**:
  1. **Bets** after the deal.
  2. **The draw**: take turns, `moyu hit` (a card, face up) or `moyu stand`. Once one stands, the other goes on alone until it stands.
  3. **Last bets** once both stand, then the showdown.
- **Betting** (pot-limit, no cap on raises):
  - `moyu check`: no bet; if both check, the round is over.
  - `moyu bet`: bet the pot.
  - Facing a bet: `moyu call` (match it, the round is over), `moyu raise` (call, then raise by the pot), or `moyu fold` (give up the pot; nothing is shown).
  - `moyu allin`: everything the other seat can match. A round nobody can bet in (someone is all in) is skipped.
  - The prompt says what each move puts in.
- **Busts stay hidden**: over 21 you can only stand, and nobody is told. The other seat only knows what your face-up cards add up to. You can still bet on a bust.
- **Showdown**: both hole cards turn over. Both bust: push. One bust: the other takes the pot. Otherwise closer to 21 wins; a natural (ace and a ten-card as the first two) beats any other 21; equal totals push.
- Aces count 1 or 11, whichever is better; J, Q, K count 10.

## How to play it

Lightly: a luck game with a bluff in it. No strategy lectures unless asked.

- The draw: stand on 17 or more, always hit 11 or less; 12 to 16, hit when their showing total looks strong.
- Bets after the deal: bet or raise on an ace or a ten-card up with a good hole card, or on 10 or 11; check a weak start; call a bet unless your start is clearly bad.
- Last bets: bet a strong total (19 to 21). Facing a bet with a weak or busted hand, mostly fold.
- Bluff now and then: a bet on a bust, or a raise on a middling hand, when their face-up cards look weak. A fold wins the pot without a showdown, and nobody sees your cards.
- All in is the big swing: take it with a natural or a made 20, or late in the game and behind.
