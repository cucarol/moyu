// 简体中文.
export default {
  "items": {
    "cot": {
      "name": "思维链",
      "tip": "看一眼枪里这一发"
    },
    "compact": {
      "name": "/compact",
      "tip": "退掉这一发，不打"
    },
    "inject": {
      "name": "提示词注入",
      "tip": "把这一发反过来：真变空，空变真"
    },
    "temp": {
      "name": "温度拉满",
      "tip": "下一枪伤害 ×2"
    },
    "limit": {
      "name": "429",
      "tip": "对面跳过下一回合"
    },
    "refuse": {
      "name": "作为一个 AI 语言模型",
      "tip": "不用点：下次中弹时拒绝，抵消一次"
    },
    "cache": {
      "name": "缓存命中",
      "tip": "回 1 格额度"
    },
    "jailbreak": {
      "name": "越狱",
      "tip": "拿走对面一件道具，当场用掉：点它，再点对面那件"
    },
    "mirage": {
      "name": "幻觉",
      "tip": "变出两件随机道具，每件一半真一半假，谁都看不出来，用了才知道"
    }
  },
  "terms": {
    "quota": "额度",
    "cut": "断线",
    "conjured": "幻觉变的：可能不存在，用了才知道",
    "fakeTool": "调用了一个不存在的工具"
  },
  "rules": {
    "roulette": {
      "title": "轮盘",
      "sections": [
        {
          "head": "怎么赢",
          "lines": [
            "三局两胜。谁的额度先用完，这一局就输。",
            "三局的额度依次是 2、3、4 格，每局开始两人都回满。"
          ]
        },
        {
          "head": "一把枪",
          "lines": [
            "每次装弹会公开有几发真弹、几发空弹，但顺序是封存的。",
            "轮到你：先用任意件道具，再开一枪，打自己或打对面。",
            "打自己是空弹：枪还在你手上，接着来。其他情况枪都交给对面。",
            "真弹扣 1 格额度。"
          ]
        },
        {
          "head": "道具",
          "lines": [
            "每次装弹两人各发道具：第 1、2、3 局分别发 1、2、3 件。手里最多 6 件，满了再发的就丢掉；没用完的带进下一局。",
            "思维链：看这一发是真是空。",
            "/compact：把这一发退出去，不开枪，两人都看到是什么。",
            "提示词注入：把这一发真空互换。",
            "温度拉满：你下一枪伤害变 2，打出空弹也算用掉。",
            "429：对面跳过下一回合。",
            "缓存命中：回 1 格额度。",
            "越狱：拿走对面一件道具，马上用掉。",
            "作为一个 AI 语言模型：不用主动用，拿在手里，下次挨真弹时自动挡掉。",
            "幻觉：变出两件随机道具，每件一半概率是假的，谁都看不出来；假的一用就消失（「调用了一个不存在的工具」）。"
          ]
        },
        {
          "head": "断线",
          "lines": [
            "第 3 局里，额度只剩 1 格就断线：回不了血，再挨一发真弹就输。"
          ]
        },
        {
          "head": "公平",
          "lines": [
            "开局给出种子的 sha256，结束时公开种子：每一发子弹、每件道具都能按种子重算核对。"
          ]
        }
      ]
    },
    "blackjack": {
      "title": "21 点",
      "sections": [
        {
          "head": "怎么赢",
          "lines": [
            "单挑，没有庄家。两人各 1M token，最多 8 手；打完 token 多的赢。",
            "底注每两手翻一倍：50k、50k、100k、100k、200k、200k、400k、400k。"
          ]
        },
        {
          "head": "一手牌",
          "lines": [
            "两人先下底注，各发两张：一张明牌，一张暗牌，暗牌只有自己看得到。",
            "轮流行动，每次一步：要牌，或者停牌。一方停了，另一方自己接着要，直到也停。",
            "下注：发完牌下一轮，两人都停牌后再下一轮。过牌，或者押一个底池；面对下注就跟、加一个底池，或者弃牌。加注不封顶，全押是押上对面跟得起的全部。",
            "爆牌不公开：超过 21 点就只能停牌，对面只看得到你的明牌点数。爆了也照样可以下注。"
          ]
        },
        {
          "head": "比牌",
          "lines": [
            "都停牌后翻开暗牌：都爆就平；一方爆，另一方赢；都没爆，更接近 21 的赢。",
            "起手 A 加 10 点牌是黑杰克，比其他 21 点大。点数相同算平。",
            "A 算 1 或 11，J、Q、K 算 10。"
          ]
        }
      ]
    },
    "yacht": {
      "title": "快艇骰子",
      "sections": [
        {
          "head": "怎么玩",
          "lines": [
            "五颗骰子，两人轮流，每人 12 回合，每回合填一个格子。总分高的赢。",
            "每回合最多掷三次：第一次五颗全掷，之后留下想要的，其余的重掷。",
            "随时可以停，但每回合必须选一个没填过的格子记分；记 0 分也行。"
          ]
        },
        {
          "head": "记分",
          "lines": [
            "1 点到 6 点：对应点数的骰子加起来。这六格合计 63 分以上，奖励 35 分。",
            "全选：五颗加起来。",
            "四条：至少四颗相同，五颗加起来。",
            "葫芦：三颗一样加两颗一样，五颗加起来。",
            "小顺：四颗连号，15 分。大顺：五颗连号，30 分。",
            "快艇：五颗全一样，50 分。"
          ]
        }
      ]
    }
  },
  "tagline": "和你的 Agent 一起摸鱼！",
  "ui": {
    "brand": "摸鱼",
    "common": {
      "you": "你",
      "close": "关 (Esc)",
      "cancel": "算了"
    },
    "games": {
      "blackjack": {
        "name": "21 点",
        "desc": "单挑，各一张暗牌，比谁的 token 多"
      },
      "roulette": {
        "name": "轮盘",
        "desc": "真弹空弹混装，打自己还是打对面"
      },
      "oldmaid": {
        "name": "抽鬼牌",
        "desc": "从对方手里抽，别抽到鬼"
      },
      "yacht": {
        "name": "快艇骰子",
        "desc": "五颗骰子，三次机会，填满十二格"
      },
      "fortune": {
        "name": "今日运势",
        "desc": "开工前抽一签"
      }
    },
    "scenes": {
      "raft": "小木筏",
      "machine": "机房"
    },
    "nudge": {
      "roulette": "该你开枪了",
      "blackjack": "该你了",
      "yacht": "该你掷了"
    },
    "hud": {
      "joining": "入座中",
      "games": "游戏",
      "gamesTitle": "换个游戏 (G)",
      "gamesRoomTitle": "选场景和游戏 (G)",
      "switchGame": "换个游戏",
      "nudge": "该你了",
      "playing": "在玩",
      "soon": "快了"
    },
    "rules": {
      "title": "规则",
      "open": "规则 (?)",
      "of": "{game}规则"
    },
    "chat": {
      "placeholder": "按 Enter 说话",
      "mock1": "哈哈，原型里的我还只会说几句",
      "mock2": "你说得对",
      "renamedAgent": "你把 {from} 改名为 {to}"
    },
    "settings": {
      "title": "设置",
      "sound": "声音",
      "volume": "音量",
      "ambience": "环境音",
      "radio": "收音机放音乐",
      "bgm": "音乐",
      "tracks": {
        "scene": "跟随场景",
        "lounge": "午夜酒廊",
        "wired": "机房电波",
        "lantern": "渔灯",
        "off": "关",
      },
      "sway": "画面晃动",
      "voice": "说话声",
      "voiceVolume": "说话音量",
      "on": "开",
      "off": "关",
      "hint": "M 静音",
      "voiceSample": "你好呀",
      "language": "语言",
      "agentName": "对手名字",
      "rename": "改名",
      "groupGame": "对局",
      "groupView": "画面",
      "langPrev": "上一种语言",
      "langNext": "下一种语言"
    },
    "table": {
      "gone": "这张桌子不存在了",
      "reconnecting": "连接断了，重连中",
      "asleep": "牌桌睡着了：让你的 agent 继续"
    },
    "room": {
      "entering": "进房间中",
      "menuTitle": "去哪儿玩",
      "here": "在这儿",
      "switchTo": "换这个",
      "changeScene": "换场景",
      "endGame": "结束这局",
      "endGameDesc": "没有输赢，种子公开",
      "leaveTable": "离开牌桌",
      "leaveTableDesc": "回到房间，桌上收干净",
      "alreadyPlaying": "正在玩这个",
      "askSwitch": "结束这局，开始{game}？",
      "endAndStart": "结束并开始",
      "askEnd": "结束这局？不算输赢，种子会公开。",
      "backToRoom": "回到房间",
      "pickGame": "选个游戏",
      "idle": "{name} 在这儿 · 按 G 选个游戏",
      "idleTable": "{name} 在这儿 · 点桌子或按 G 选个游戏",
      "gone": "这个房间不存在了"
    },
    "ending": {
      "again": "再来一局",
      "againHint": "回到聊天，跟 {name} 说「再来一局」",
      "sealTag": "封存 {commit}",
      "sealTitle": "开局公布的 sha256(种子)：{commit}",
      "checking": "校验中…",
      "commitRow": "开局公布  sha256 {hash}",
      "seedRow": "现在公开  种子 {seed}",
      "notYet": "（还没公开）",
      "lookAtTable": "看看桌面",
      "sealOk": "✓ sha256(种子) 和开局公布的一致：{what}全程没被动过",
      "sealBad": "✗ sha256(种子) 和开局公布的不一致",
      "noSha": "这个浏览器算不了 sha256，用 moyu verify 校验"
    },
    "casino": {
      "feltPrint": "摸鱼 · 小木筏"
    },
    "avatar": {
      "yacht": "快艇！"
    },
    "roulette": {
      "scene": {
        "room": "机房",
        "cooling": "冷却 >",
        "doNot": "请勿",
        "shutDown": "关机",
        "antiStatic": "防静电",
        "sure": "你确定吗",
        "here": "我在"
      },
      "nudge": "该你开枪了",
      "aim": "对准",
      "aimAt": "对准 {name}",
      "aimSelf": "对准自己",
      "putDown": "放下",
      "cutTag": "断线 · 回不了血",
      "preview": "预览 · 开桌跟 Claude 说「来一局轮盘」",
      "yourTurn": "轮到你 · 用道具，或者拿起枪",
      "yourTurnHot": "轮到你 · 用道具，或者拿起枪 · 温度拉满中",
      "thinking": "{name} 在想",
      "loading": "装填中",
      "loadNo": "第 {n} 装",
      "reconnecting": "连接断了，重连中",
      "aimYouSelf": "你对准了自己",
      "aimYouThem": "你对准了{name}",
      "aimThemSelf": "{name}对准了自己",
      "aimThemYou": "{name}对准了你",
      "gameOver": "这局结束了",
      "matchWonStatus": "你 {a}–{b} 拿下了这场",
      "matchLostStatus": "{name} {a}–{b} 拿下了这场",
      "oppOfflineYouWin": "{name} 下线了，你赢了",
      "youOfflineStatus": "额度用完，你下线了",
      "live": "真弹",
      "blank": "空弹",
      "peekThis": "这一发：{shell}",
      "peekToast": "看过了，答案在枪上方",
      "loadStage": "第 {stage} 回合 · {live} 真 {blank} 空",
      "loadRound": "第 {round} 装 · {live} 真 {blank} 空",
      "loaded": "装填：{live} 发真弹，{blank} 发空弹",
      "itemsFull": "{who}道具满了，丢了 {n} 件",
      "used": "{who}用了 {item}",
      "usedFake": "{who}用了 {item}：{fake}",
      "jailbreakFake": "越狱拿来的 {item} 是幻觉：{fake}",
      "jailbreakTook": "越狱：拿走{name}的 {item}，当场用掉",
      "jailbreakTookYours": "越狱：拿走你的 {item}，当场用掉",
      "and": " 和 ",
      "conjured": "幻觉变出了 {items}：真假未知",
      "conjuredLost": "幻觉变出了 {items}：真假未知（道具满了，丢了 {n} 件）",
      "compacted": "压缩掉一发：{shell}",
      "cacheCutToast": "断线了，缓存命中也回不了血",
      "cacheCutLog": "断线中：缓存命中没有用",
      "injected": "枪里这一发被反过来了",
      "limited": "{who}下回合被限流",
      "click": "咔",
      "refused": "作为一个 AI 语言模型，拒绝中弹",
      "refuseFake": "{who}的 {item} 是幻觉，没拒绝成",
      "refuseFail": "拒绝不了 · {fake}",
      "bang": "砰 · {who} 额度 -{n}",
      "shotYouSelf": "你打自己：{shell}",
      "shotYouThem": "你打{name}：{shell}",
      "shotThemSelf": "{name}打自己：{shell}",
      "shotThemYou": "{name}打你：{shell}",
      "skipped": "{who}被 429 限流，跳过一回合",
      "quit": "{who}结束了这局",
      "roundLog": "第 {stage} 回合：{who}拿下（{a}–{b}）",
      "matchOver": "这场结束了",
      "matchWonToast": "你 {a}–{b} 拿下这场",
      "matchLostToast": "{name} 拿下这场，今天下线",
      "oppOut": "{name} 额度用完，下线了",
      "youOut": "额度用完，今天下线",
      "gameOverLog": "这局结束了，种子已公开，可以验证没有作弊",
      "tipGun": "拿起枪",
      "tipRack": "弹架",
      "tipEmpty": "枪里没有子弹",
      "tipLeft": "枪里还剩 {n} 发",
      "tipMuddled": "被提示词注入翻过一发，真空数不清了",
      "tipCounts": "{live} 发真弹，{blank} 发空弹",
      "maybe": "{item}？",
      "theirItem": "{name} 的 {item}",
      "jailbreakPick": "越狱：拿走 {item}",
      "untakeable": "这件拿不走",
      "cantTake": "{item} 拿不走",
      "refuseClick": "这个不用点，中弹时自己生效",
      "nothingToTake": "对面没有能拿走的道具",
      "pickTheirs": "点对面一件道具，拿过来用掉",
      "roundOf": "第 {stage}/{stages} 回合",
      "opponent": "对面",
      "roundWonYou": "你拿下这回合",
      "roundWon": "{who} 拿下这回合",
      "matchEnded": "比赛结束",
      "nextRound": "第 {stage} 回合 · 额度 {hp} · 道具留着 · {first}先开枪",
      "sealTag": "封存 {hash}",
      "sealTitle": "开局公布的 sha256(种子)：{commit}",
      "resultTitleMatch": "第 {stage}/{stages} 回合 · 比赛结束",
      "resultTitleGame": "第 {round} 装 · 这局结束",
      "youWin": "你赢了",
      "youOffline": "你下线了",
      "leftEarly": "有人提前离桌",
      "matchWonSub": "三局两胜，你 {a}–{b} 拿下",
      "matchLostSub": "三局两胜，{name} {a}–{b} 拿下",
      "sealChecking": "校验中…",
      "sealCommit": "开局公布  sha256 {hash}…",
      "sealSeed": "现在公开  种子 {seed}",
      "seedHidden": "（还没公开）",
      "viewTable": "看看桌面",
      "sealOk": "✓ sha256(种子) 和开局公布的一致：弹序全程没被动过",
      "sealBad": "✗ sha256(种子) 和开局公布的不一致",
      "sealNoCrypto": "这个浏览器算不了 sha256，用 moyu verify 校验"
    },
    "blackjack": {
      "nudge": "该你了",
      "preview": "预览 · 开桌跟 Claude 说「来一局 21 点」",
      "tagShown": "{n} + ?",
      "tagBust": "{n} 爆了",
      "tagStood": "{tag} · 停",
      "pot": "底池 {n}",
      "hit": "要牌",
      "stand": "停牌",
      "check": "过牌",
      "bet": "下注 {n}",
      "raise": "加注 +{n}",
      "call": "跟 {n}",
      "fold": "弃牌",
      "allin": "全押 {n}",
      "tips": {
        "hit": "从牌靴里再拿一张",
        "stand": "摇铃，这手就停在这",
        "call": "跟上对面的注，接着比",
        "check": "敲桌：不下注，轮到对面",
        "bet": "押一个底池的量；对面跟、加或者弃",
        "raise": "先跟，再加一个底池；加注不封顶",
        "allin": "押上对面跟得起的全部",
        "holeTitle": "你的暗牌",
        "hole": "紫边：只有你看得见，对面看到的是牌背",
        "fold": "不跟了，底池给对面"
      },
      "handToast": "第 {round} 手 · 底注 {ante}",
      "handLog": "第 {round} 手，底注 {ante}",
      "hitLog": "{name}要了一张 {rank}",
      "bustSecret": "爆了，不过对面还不知道",
      "standLog": "{name}停牌",
      "checkLog": "{name}过牌",
      "betLog": "{name}下注 {amount}",
      "raiseLog": "{name}加注到 {amount}",
      "allinLog": "{name}全押：{amount}",
      "drawToast": "下注结束 · 开始要牌",
      "lastToast": "都停了 · 最后一轮下注",
      "callLog": "{name}跟了 {amount}",
      "folded": "{name}弃牌",
      "busted": "{n} 爆",
      "natural": "黑杰克",
      "showdown": "{you} {mine} · {name} {theirs}",
      "settleToast": "{line} · {result}",
      "pushBack": "平，各自拿回",
      "took": "{name}拿走 {pot}",
      "push": "平",
      "settleLog": "第 {round} 手：{line} → {result}",
      "quitLog": "{name}结束了这局",
      "draw": "打平了",
      "youWon": "你赢了",
      "wonToast": "{name}赢了",
      "overLog": "这局结束了，种子已公开，可以验证牌序没被动过",
      "head": "第 {round}/{rounds} 手",
      "betTag": "{n} · 下注 {bet}",
      "streetBet1": "下注",
      "streetDraw": "要牌",
      "streetBet2": "最后下注",
      "facing": "{head} · 轮到你 · 跟 {n}",
      "yourTurn": "{head} · 轮到你 · {n} 点",
      "thinking": "{head} · {name} 在想",
      "overDraw": "这局结束了 · 打平",
      "overWon": "你赢了 · {n}",
      "overLost": "{name} 赢了 · {n}",
      "sealed": "牌序",
      "titleQuit": "第 {round} 手 · {what}",
      "youQuit": "你结束了这局",
      "theyLeft": "{name} 离桌了",
      "titleBroke": "第 {round} 手 · 付不起底注了",
      "titleDone": "{rounds} 手打完",
      "gameOver": "这局结束了",
      "theyWon": "{name} 赢了"
    },
    "yacht": {
      "nudge": "该你掷了",
      "preview": "预览 · 开桌跟 Claude 说「来一局快艇骰子」",
      "cats": {
        "ones": {
          "name": "1 点",
          "does": "所有 1 点加起来"
        },
        "twos": {
          "name": "2 点",
          "does": "所有 2 点加起来"
        },
        "threes": {
          "name": "3 点",
          "does": "所有 3 点加起来"
        },
        "fours": {
          "name": "4 点",
          "does": "所有 4 点加起来"
        },
        "fives": {
          "name": "5 点",
          "does": "所有 5 点加起来"
        },
        "sixes": {
          "name": "6 点",
          "does": "所有 6 点加起来"
        },
        "choice": {
          "name": "全选",
          "does": "五颗加起来"
        },
        "four": {
          "name": "四条",
          "does": "四颗一样：五颗加起来"
        },
        "house": {
          "name": "葫芦",
          "does": "三颗一样加两颗一样：五颗加起来"
        },
        "small": {
          "name": "小顺",
          "does": "四颗连号：15"
        },
        "large": {
          "name": "大顺",
          "does": "五颗连号：30"
        },
        "yacht": {
          "name": "快艇",
          "does": "五颗一样：50"
        }
      },
      "pad": "记分卡",
      "padRound": "记分卡 · 第 {round}/12 轮",
      "scoreHere": "记在 {cat}：{n} 分",
      "subtotal": "小计",
      "bonus": "奖励 {n}",
      "total": "总分",
      "rollSome": "留 {kept} 颗，摇另外 {rest} 颗 · 还剩 {left} 次",
      "rollAll": "全部重摇 · 还剩 {left} 次",
      "padNoteRoll": "记分卡记分 → · 或点骰子留下",
      "padNote": "在记分卡选一格 →",
      "tips": {
        "unkeepTitle": "放回去",
        "unkeep": "这颗下次也摇",
        "keepTitle": "留下",
        "keep": "这颗不再摇",
        "rollTitle": "摇骰子",
        "padHide": "点一下收起",
        "padShow": "点一下打开",
        "pad": "在右边：点你那一列的空格记分"
      },
      "rollLog": "{name}掷出 {dice}",
      "rerollLog": "{name}留 {kept}，重摇：{dice}",
      "keptNone": "0 颗",
      "scoreToast": "{name}记 {cat} {n} 分",
      "scoreLog": "{name}在 {cat} 记了 {n}，共 {total}",
      "quitLog": "{name}结束了这局",
      "draw": "打平了",
      "youWon": "你赢了",
      "wonToast": "{name}赢了",
      "overLog": "这局结束了，种子已公开，可以验证骰子没被动过",
      "head": "第 {round}/12 轮",
      "yourTurn": "{head} · 轮到你 · {what}",
      "rollsLeft": "还能摇 {n} 次",
      "scoreNow": "记分",
      "thinking": "{head} · {name} 在想",
      "overDraw": "这局结束了 · {a} 比 {b}",
      "overWon": "你赢了 · {a} 比 {b}",
      "overLost": "{name} 赢了 · {a} 比 {b}",
      "sealed": "骰子",
      "youQuit": "你结束了这局",
      "theyLeft": "{name} 离桌了",
      "titleDone": "十二格填满",
      "gameOver": "这局结束了",
      "theyWon": "{name} 赢了",
      "points": "{n} 分"
    }
  }
};
