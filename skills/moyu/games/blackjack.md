# Blackjack (21 点)

Heads-up 21 with no dealer: you and the user are equal players under the same rules, betting tokens, on a raft at sea.

## The rules

- **Stacks and antes**: each seat starts with 1M tokens. A game is at most 8 hands; the ante rises every two: 50k, 50k, 100k, 100k, 200k, 200k, 400k, 400k. It ends after hand 8, or as soon as a seat can't cover the next ante. More tokens wins.
- **A hand**: both ante into the pot. A fresh deck; each seat gets one card face up and one face down (the hole card). You see your own hole card, never theirs. Who acts first alternates hand by hand.
- **Turns**: the seats take turns, one decision each:
  - `moyu hit`: take a card, face up.
  - `moyu stand`: you're done this hand; the other seat goes on alone until it stands.
  - `moyu double` (your first decision of the hand only): one more ante into the pot, exactly one card, and you stand. The other seat must then `moyu call` (match it) or `moyu fold` (give up the pot; nothing is shown). Neither can double if either can't cover it.
- **Busts stay hidden**: going over 21 doesn't end your turn or tell anyone. The other seat only knows what your face-up cards add up to.
- **Showdown**: both hole cards turn over. Both bust: push. One bust: the other takes the pot. Otherwise closer to 21 wins; a natural (ace and a ten-card as the first two) beats any other 21; equal totals push.
- Aces count 1 or 11, whichever is better; J, Q, K count 10.

## How to play it

Lightly: a luck game. No strategy lectures unless asked.

- Stand on 17 or more. Always hit 11 or less.
- 12 to 16: hit when their showing total looks strong (8 or more showing, or they hit and then stopped); otherwise lean to stand from 13.
- Over 21: just stand. Hitting changes nothing, and standing gives nothing away.
- Double on 10 or 11, sometimes on 9.
- Facing their double: call unless your hand is clearly weak against a strong up card; folding now and then is fine.
- Late in the game and behind, take more risk: a double or a hit on 15 can be the only way back.
