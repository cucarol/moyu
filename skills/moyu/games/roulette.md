# Roulette (轮盘)

Two seats, one gun, a sealed load of live and blank shells, and items that are all AI jokes. Played in a cramped machine room.

## The rules

- **A load**: 3 to 8 shells, at least one live and one blank. The counts are announced (「3 真 2 空」), then the order is sealed. When the gun is empty, the next load comes, with new items for both.
- **A turn**: use any number of your items, then fire exactly once.
  - `moyu shoot you`: live, they lose 1 额度 (2 with 温度拉满). The gun passes to them either way.
  - `moyu shoot me`: blank, you keep the gun and go again. Live, you lose 1 (or 2) and the gun passes.
- **额度** is the life. At 0 you're offline (「额度用完，今天下线」) and the other seat takes the round.
- **The match** is best of three rounds:

  | Round | 额度 each | Shells a load | Items each a load |
  |---|---|---|---|
  | 1 | 2 | 2–4 | 1 |
  | 2 | 3 | 3–6 | 2 |
  | 3 | 4 | 3–8 | 3 |

  Both start every round full. Items you don't use carry over, up to 6 in hand; more than that are lost. The loser of a round shoots first in the next.
- **断线 (Disconnected)**, round 3 only: at 1 额度 you're cut off. 缓存命中 can't heal you any more, and the next live hit ends it. 作为一个 AI 语言模型 still refuses a hit.
- **A short game** (`--rules short` on `moyu new` or `moyu start`, when the user wants a quick one): one round played like round 3: 4 额度, 3 items a load, 断线 at 1.
- **What you see**: both 额度, both hands (items lie face up), the counts left, every shell fired or ejected. Private: what your own 思维链 showed. After a 提示词注入 on a shell nobody knew, the table only shows how many are left, not which.

## The items

Frames name items and terms the way the user's page does: Chinese on a Chinese page, English otherwise (额度 is quota, 断线 Disconnected). The id in brackets is what `moyu use` takes either way. Call them what the user's page calls them; this guide uses the Chinese names.

| Id | 中文 | English | What it does |
|---|---|---|---|
| `cot` | 思维链 | Chain of Thought | Look at the shell in the chamber. Only you see it. |
| `compact` | /compact | /compact | Eject the shell in the chamber without firing; both see what it was. |
| `inject` | 提示词注入 | Prompt Injection | Flip the shell in the chamber: live ↔ blank. |
| `temp` | 温度拉满 | Temperature 2.0 | Your next shot does 2. A blank still uses it up. |
| `limit` | 429 | 429 | They skip their next turn: after this shot you still hold the gun. |
| `cache` | 缓存命中 | Cache Hit | Get 1 额度 back, up to the round's full. Does nothing while 断线. |
| `jailbreak` | 越狱 | Jailbreak | Take one of their items and use it for you at once: `moyu use jailbreak --pick <their item>`. Not their 作为一个 AI 语言模型 or 越狱. |
| `refuse` | 作为一个 AI 语言模型 | As an AI language model | Held, never used: it refuses the next hit you would take, then it's gone. |
| `mirage` | 幻觉 | Hallucination | Conjures two random items (never 幻觉). Each is real or fake, 50/50, and nobody knows which until it's used (your hand shows them as `from 幻觉: real or fake`): a fake vanishes with 「调用了一个不存在的工具」. A fake 作为一个 AI 语言模型 fails to refuse. |

`moyu use <id>` takes a dealt item before a conjured one; `moyu use --slot <n>` picks a slot by the number the board shows in your hand.

## How to play it

Lightly: it's a luck game. Play sensibly, never lecture odds.

- **Know the chamber, then act**: live → shoot them; blank → shoot yourself (a free turn). So 思维链 first, whenever you hold it.
- **Otherwise, go by the counts**: more live than blank left → shoot them; fewer → shoot yourself; even → either.
- **Make a live hurt more**: 温度拉满 just before shooting them on a known or likely live. 429 before that shot too, so you get to shoot again; with both, a known live can end a round.
- **Turn a blank into a hit**: a known blank, 提示词注入, then shoot them.
- **/compact** an unknown shell when the odds are close and you'd rather see the next one; don't waste it on a shell you know (a known live is a shot at them, a known blank a free turn).
- **缓存命中** when you're down, never at full; in round 3 before you drop to 1.
- **越狱**: take what helps right now: their 思维链 to peek, their 温度拉满 before you shoot them, their 缓存命中 when you're down. It takes a conjured item as it is, real or fake.
- **幻觉**: spend conjured items where a fake costs little; don't count on a conjured 作为一个 AI 语言模型 or 缓存命中.
- **作为一个 AI 语言模型** makes shooting yourself on even odds cheaper while you hold it.
- **Pace the hand**: items carry over across rounds, so don't burn everything in round 1; in round 3 or a short game, spend.
