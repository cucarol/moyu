# Third-party notices and credits

moyu's own code, art and sound are under the MIT licence in `LICENSE`. The third-party works below keep their own licences, with their notices and licence texts kept here or next to them.

## Shipped in this repository

| What | Where | Author | Licence |
|---|---|---|---|
| Fusion Pixel Font, 12px proportional, release 2026.10.25 ([source](https://github.com/TakWolf/fusion-pixel-font)) | `web/play/fonts/*.woff2` | TakWolf | SIL Open Font License 1.1, full text in `web/play/fonts/OFL.txt` |
| Glyphs merged into it: Ark Pixel Font, Cubic 11, Galmuri | (inside the font files) | TakWolf; ACh-K; Lee Minseo | SIL Open Font License 1.1, full texts in `web/play/fonts/LICENSES/` |
| [pinyin-pro](https://github.com/zh-lx/pinyin-pro) 3.29.4, its unmodified ESM build (the agent's voice reads Chinese by its pinyin) | `web/play/vendor/pinyin-pro/` | zh-lx | MIT, text in `web/play/vendor/pinyin-pro/LICENSE` and below |

The fonts are unmodified release builds; `web/play/fonts/SOURCES.md` says which build each page language loads. The OFL lets fonts be bundled and redistributed with any software, as long as the fonts themselves stay under the OFL and are not sold on their own.

## Loaded at runtime, not shipped

The pages import this from jsDelivr when they open; no copy of it is in the repository. Its licence text follows at the end of this file.

| What | Version | Licence |
|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) | 0.170.0 | MIT |

## Made in code, or made with tools that are not shipped

- Every sound effect, the ambience and the agent's voice are synthesized at runtime with the Web Audio API (`web/play/audio.js`, `web/play/dididudu.js`); there are no recordings or sample files. See `web/play/sounds/README.md` and `web/play/sounds/CREDITS.md`.
- The music loops in `web/play/sounds/bgm/*.ogg` are the project's own tracks, rendered from its own notes on factory patches of [Surge XT](https://surge-synthesizer.github.io/) (GPL-3.0) through [DawDreamer](https://github.com/DBraun/DawDreamer) (GPL-3.0) by `scripts/sound/bgm.py`. Neither tool is in the repository; the scripts fetch them when someone renders.
- The sound scripts can fetch CC0 instrument samples (VSCO-2 CE, VCSL; `scripts/sound/samples.json`) into the ignored `local/` folder for comparison renders. None are in the repository or in the shipped music.
- `web/play/dididudu.js` is a copy of a tool from the author's own CUCAI kit, shipped here under this repository's MIT licence.
- Every 3D model, texture, icon and the avatar are drawn by code in `web/play/`; there are no downloaded models or images. `web/icon.svg` is the project's own.

## Names and inspirations

- The agent's default avatar is a pixel rendition of Clawd, the Claude Code mascot. Claude, Claude Code and Clawd belong to Anthropic; DeepSeek belongs to DeepSeek. moyu is an independent project, not affiliated with or endorsed by either.
- Roulette takes its genre mechanics (a sealed mix of live and blank shells, shooting yourself or the other) from games like Buckshot Roulette. Its items, names, art, sound and code are moyu's own.
- Blackjack (21) and Yacht dice are traditional games.

## Licence texts

### three.js

```
The MIT License

Copyright © 2010-2024 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### pinyin-pro

```
MIT License

Copyright (c) 2022-present zh-lx

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
