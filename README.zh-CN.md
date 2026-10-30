# moyu（摸鱼）

干活干到一半，和正在一起干活的 AI agent 来一局，玩完接着干。

[English](README.md)

<!-- 截图：宣传片的定帧放这里，例如 ![moyu](docs/media/moyu.png) -->

你说「来一局」，agent 在本机起一个小服务器、开一张桌，把链接给你。你在浏览器里玩（3D 像素牌桌），agent 在会话里玩它自己那一座：你每动一步它都会被叫醒，会在桌上聊天，你不用提醒它「该你了」。一局结束，它验证发牌，然后回到刚才的活儿。

moyu 支持 **Claude Code**（插件）和 **DeepSeek Harness**（DSH 插件）。不需要 npm 依赖，只要 Node.js 22 以上和一个浏览器。

## 三个游戏

- **轮盘**：两个人一把枪，一组封存的真弹和空弹，道具全是 AI 梗（思维链看膛里那发、提示词注入把它翻面、429 让对面跳过一回合、越狱、幻觉……）。打自己是空弹就再来，或者打对面。额度用完就下线。默认三局两胜，也可以开只有一回合的短局。场景是一间挤满线缆的机房。
- **21 点**：一对一，没有庄家。两边都是平等的玩家，各有一张底牌，爆了对面看不见，加注要对面跟或弃。最多八手，筹码是 token，在海上的木筏上。
- **快艇骰子**：经典玩法，五颗骰子、每回合掷三次、十二个格子，总分高的赢。也在木筏上。

除了单张桌子，还有**房间**：一个一直开着的标签页，两边都可以开局，局与局之间可以聊天。

页面支持 English、简体中文、繁體中文、日本語、한국어、Español、Français、Deutsch、Português、Русский。

## Claude Code

仓库本身就是一个 Claude Code 插件，也是它自己的本地插件市场。

```bash
git clone <repo-url> moyu
```

然后在 Claude Code 里（用 clone 下来的绝对路径）：

```
/plugin marketplace add /path/to/moyu
/plugin install moyu@moyu-local
```

重启 Claude Code（或运行 `/reload-plugins`），说「来一局」「玩个 21 点」就行。agent 会给你一个链接，点开就能玩。

插件带来三样东西：

- `moyu` 技能：告诉 agent 怎么开桌、怎么玩自己那一座、玩完怎么回去干活；
- Bash 工具 PATH 上的 `moyu` 命令（`bin/moyu`），agent 用它下棋；
- 一个监听器（`moyu-listen`），整个会话里跟着这个会话的牌桌，你每动一步就叫醒 agent。

**不用插件系统**也可以单独装技能和命令，这时 agent 会用 Monitor 工具自己监听：

```bash
cd moyu
npm link
node scripts/install-skill.mjs
```

## DeepSeek Harness

`dsh` 文件夹是一个 DSH 插件包：注册 `moyu_*` 工具和技能，桌上一有动静就叫醒会话。DSH Desktop 里打开「插件」，从本地路径添加插件，选 clone 下来的 `dsh` 文件夹，然后重启 DSH。用 DSH 命令行的话：

```bash
dsh plugin --profile web add /path/to/moyu/dsh
```

然后开一个带技能的会话（标准模式），说「来一局」。其他安装方式和叫醒的原理见 [dsh/README.md](dsh/README.md)。

## 公平

一局里所有随机的东西，枪里的子弹、牌靴里的牌、骰子，都来自开桌时服务器生成的一个秘密种子。

- 开局时，桌上向两边公布 `sha256(种子)`，也就是承诺。
- 结束时公开种子。页面自己核对它和承诺是否一致，agent 运行 `moyu verify`：用种子和记录下来的每一步把整局重放一遍，确认每发子弹、每张牌、每颗骰子都由种子决定。
- agent 只能看到自己那一座的视角，用的是和玩家一样的命令。技能规定它在一局结束前不许读服务器的文件或内存。

承诺能证明牌在第一步之前就定好了、中途没被改过；但它证明不了一个在你机器上有 shell 权限的 agent 从没偷看过，这一点靠的是技能里的规定。

## 运行

agent 开桌时服务器会自己启动，10 分钟没人用就自己停。停了以后还开着的页面会显示「牌桌睡着了」，让 agent 继续，页面就会回来。

| 设置 | 默认 | |
|---|---|---|
| `MOYU_HOME` | `~/.moyu` | 牌桌、房间和 agent 的座位状态 |
| `MOYU_PORT` | `7330` | 只监听 127.0.0.1 |
| `MOYU_IDLE_MS` | `600000` | 闲置多久后停止；`0` 表示永不停止 |

`node cli/moyu.mjs` 不带参数会列出所有命令。

## 开发

```bash
npm test
```

设计笔记和每个游戏的规则在 [docs/](docs/)。

## 许可

MIT，见 [LICENSE](LICENSE)。像素字体使用 SIL Open Font License，它和页面运行时加载的库见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。moyu 是独立项目，和 Anthropic、DeepSeek 没有关联。
