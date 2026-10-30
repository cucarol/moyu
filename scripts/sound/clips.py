#!/usr/bin/env python
"""The listening page: every sound of both versions apart, one clip each, grouped by what
it does, for the user to mark the ones worth keeping. A is the game's own synthesis (v1,
Web Audio), B is Surge XT (v2).

    .venv-audio/Scripts/python -I scripts/sound/clips.py

1. The PV score, each part alone: A from renders/pv-score/solo/ (render.mjs --solo), B
   from renders/pv-score-v2/voices/ (pv/score/v2/render.py). The same notes, cut at the
   part's busiest stretch (a second stretch from another section for keys, lead and bass).
2. The game's music, by scene, layer and voice: A from renders/sound/bgm/synth/
   (compare.py levels), B from renders/bgm/voices/ (bgm.py, with bgm-trims.json). The
   synth plays its own random notes, so each version is cut at its own busiest stretch.
3. The game's sound effects: every one, rendered here (listen.mjs, into
   renders/sound/sfx-game/), with the Surge XT takes from renders/sound/sfx/ (sfx.py).

Each pair is brought to the same loudness (-20 LUFS while it sounds, under -1 dBFS), and
written as Ogg Vorbis into renders/listen/clips/, with renders/listen/index.html (from
listen-page.html), which works opened from disk. --page writes just the page again, from
the clips already there (renders/listen/clips.json).
"""
import json
import os
import shutil
import subprocess
import sys

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from surgekit import RATE, sounding, wav  # noqa: E402

OUT = os.path.join(ROOT, 'renders', 'listen')
LEVEL = -20
QUALITY = 5  # Vorbis -q (about 160 kb/s)

# ---- what's what -----------------------------------------------------------------------
# category, its parts: (id, Chinese name)
SCORE = [
    ('和声', [('keys', '电钢琴和弦'), ('pad', '铺底长音'), ('drone', '低沉的持续音')]),
    ('旋律', [('lead', '主旋律'), ('arp', '琶音')]),
    ('低音', [('bass', '贝斯')]),
    ('点缀', [('ping', '远处的叮'), ('glint', '星光闪音'), ('shimmer', '高处的微光铃'), ('ding', '收尾的叮')]),
    ('鼓', [('kick', '底鼓'), ('rim', '军鼓／响指'), ('hat', '踩镲'), ('crash', '镲片'), ('boom', '嗵鼓重击')]),
    ('过渡', [('swell', '气声渐强'), ('riser', '上升音'), ('toss', '甩出去的风声')]),
]
SECOND = ('keys', 'lead', 'bass')  # a second stretch, from another section
SLOW = ('drone', 'pad', 'swell', 'riser')  # a longer clip: they take a while
SECTIONS = {'terminal': '终端', 'machineRoom': '机房', 'raft': '木筏', 'night': '夜晚', 'drop': '高潮', 'endCard': '片尾'}
BGM = [
    ('lantern', '木筏 · Lantern', [
        ('bed', '平静底层', [('和声', [('keys', '电钢琴和弦')]), ('低音', [('bass', '贝斯')]),
                         ('鼓', [('kick', '底鼓'), ('rim', '军鼓边击'), ('hat', '踩镲')])]),
        ('tense', '张力层（越紧张越响）', [('和声', [('keys', '多出来的推和弦')]), ('旋律', [('top', '高音点缀')]),
                                ('鼓', [('hat', '十六分踩镲')])]),
    ]),
]
BGM_SECS = 8
SETTLE = 6  # compare.py's: the synth's tension takes a while to come in
ITEMS = [('cot', '思维链'), ('mirage', '幻觉'), ('compact', '/compact'), ('inject', '提示词注入'), ('temp', '温度拉满'),
         ('limit', '429'), ('cache', '缓存命中'), ('jailbreak', '越狱')]
# category, its sounds: (id, Chinese name, the call: (name, args, vibe))
SFX = [
    ('界面', [('hover', '鼠标悬停'), ('point', '指向'), ('click', '点击'), ('tick', '滴答'), ('send', '发送'),
            ('chat', '聊天提示'), ('emote', '表情'), ('throw', '扔东西'), ('turn', '轮到你了'), ('quit', '离开')]),
    ('轮盘：装弹与开枪', [('round', '新的一轮'), ('lay', '子弹摆上桌'), ('load', '装弹'), ('deal', '发道具'), ('aim', '举枪'),
                  ('blank', '空包弹'), ('shot', '实弹'), ('hit:you', '你中弹'), ('hit:opp', '对手中弹'), ('refused', '被拒绝'),
                  ('spend', '花掉'), ('conjure', '幻觉道具出现'), ('fake', '幻觉道具落空'), ('skip', '跳过回合')]),
    ('轮盘：道具', [(f'use:{i}', f'使用道具：{n}') for i, n in ITEMS]),
    ('轮盘：结局', [('roundWin', '赢下一局'), ('roundLose', '输掉一局'), ('win', '胜利'), ('lose', '失败'), ('over', '游戏结束')]),
    ('21 点', [('shuffle', '洗牌'), ('card', '发牌'), ('flip', '翻牌'), ('chips', '下注筹码'), ('stand', '停牌'), ('fold', '弃牌'),
              ('reveal', '亮牌'), ('natural', '天生 21 点'), ('bust:you', '你爆牌'), ('bust:opp', '庄家爆牌'), ('push', '平局'),
              ('sweep:you', '赢下底池'), ('sweep:big', '赢下大底池'), ('sweep:opp', '输掉底池'), ('bigwin', '大赢')]),
    ('快艇骰子', [('rattle', '摇骰盅'), ('roll', '掷骰子'), ('keep', '留下骰子'), ('unkeep', '放回骰子'), ('score', '记分'),
              ('score:0', '记零分'), ('yacht', '快艇（五个一样）'), ('bonus', '奖励分')]),
    ('21 点和骰子的结局', [('casino:win', '胜利'), ('casino:lose', '失败'), ('casino:over', '游戏结束')]),
]
# as the sound board calls them (web/play/sounds/index.html)
OPTS = {'lay': {'count': 6, 'gap': 0.09}, 'load': {'count': 6, 'gap': 0.11}, 'deal': {'slot': 1},
        'hit:you': {'who': 'you'}, 'hit:opp': {'who': 'opp'}, 'chips': {'amount': 200000},
        'bust:you': {'who': 'you'}, 'bust:opp': {'who': 'opp'}, 'sweep:you': {'toYou': True, 'pot': 400000},
        'sweep:big': {'toYou': True, 'pot': 1200000}, 'sweep:opp': {'toYou': False, 'pot': 400000},
        'roll': {'count': 5}, 'rattle': {'dur': 0.6}, 'score': {'points': 24}, 'score:0': {'points': 0}}
# the Surge XT takes (sfx.py): sound -> its id there
SURGE_SFX = {'click': 'sfx-click', 'blank': 'sfx-blank', 'shot': 'sfx-shot', 'use:cache': 'sfx-use',
             'card': 'sfx-card', 'roll': 'sfx-roll', 'win': 'sfx-win'}
SFX_SECS = 4


def read(path):
    x, rate = sf.read(path, always_2d=True)
    assert rate == RATE, path
    return x.T


def cut(x, a, secs):
    i = max(0, int(a * RATE))
    y = x[:, i:i + int(secs * RATE)].copy()
    k = int(0.02 * RATE)
    if i > 0:
        y[:, :k] *= np.linspace(0, 1, k)
    k = min(int(0.3 * RATE), y.shape[1])
    y[:, -k:] *= np.linspace(1, 0, k)
    return y


def busiest(x, secs, step=0.5):
    """Where the secs-long stretch with the most in it starts."""
    e = np.concatenate([[0], np.cumsum((x ** 2).sum(0))])
    n = int(secs * RATE)
    starts = np.arange(0, max(1, x.shape[1] - n), int(step * RATE))
    return starts[np.argmax(e[starts + n] - e[starts])] / RATE


def trim_tail(x):
    """An effect up to where it has died away, and a breath after."""
    a = np.abs(x).max(0)
    loud = np.nonzero(a > a.max() * 10 ** (-60 / 20))[0]
    return x[:, :min(x.shape[1], loud[-1] + int(0.25 * RATE))] if len(loud) else x


class Clips:
    def __init__(self):
        if os.path.isdir(os.path.join(OUT, 'clips')):
            shutil.rmtree(os.path.join(OUT, 'clips'))
        os.makedirs(os.path.join(OUT, 'clips'))
        self.n = 0

    def pair(self, id, clips):
        """clips: version -> audio (None where it has none). Both to LEVEL, under -1 dBFS
        together, and written; returns version -> its file, relative to the page."""
        have = {v: x for v, x in clips.items() if x is not None}
        gains = {v: 10 ** ((LEVEL - sounding(x)) / 20) for v, x in have.items()}
        peak = max(np.abs(x).max() * gains[v] for v, x in have.items())
        k = min(1, 10 ** (-1 / 20) / peak)
        files = {}
        for v, x in have.items():
            name = id.replace(':', '-').replace('.', '-') + f'-{v}'
            tmp = os.path.join(OUT, 'clips', name + '.wav')
            wav(tmp, x * gains[v] * k)
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'libvorbis', '-q:a', str(QUALITY),
                            os.path.join(OUT, 'clips', name + '.ogg')], check=True)
            os.remove(tmp)
            files[v] = f'clips/{name}.ogg'
            self.n += 1
        return files


def score(clips):
    with open(os.path.join(ROOT, 'pv', 'score', 'v2', 'events.json'), encoding='utf8') as f:
        events = json.load(f)
    with open(os.path.join(ROOT, 'pv', 'score', 'beatmap.json'), encoding='utf8') as f:
        sections = json.load(f)['sections']
    section = lambda t: next((s['name'] for s in sections if s['start'] <= t < s['end']), sections[-1]['name'])
    groups = []
    for title, parts in SCORE:
        items = []
        for part, zh in parts:
            evs = [e for e in events if e['part'] == part]
            on = sorted(t for e in evs for t in ([c[0] for c in e['changes']] if 'changes' in e else [e['t']]))
            secs = 8 if part in SLOW else 6
            # a stretch starting just before a note, with the most notes in it
            cands = sorted({max(0.0, t - 0.4) for t in on})
            busy = {s: sum(s <= t < s + secs for t in on) for s in cands}
            a, b = read(os.path.join(ROOT, 'renders', 'pv-score', 'solo', part + '.wav')), \
                read(os.path.join(ROOT, 'renders', 'pv-score-v2', 'voices', part + '.wav'))
            first = max(cands, key=lambda s: (busy[s], -s))
            picks = [first]
            if part in SECOND:
                other = [s for s in cands if section(s + secs / 2) != section(first + secs / 2) and abs(s - first) >= 8
                         and busy[s] >= 0.4 * busy[first]]
                if other:
                    picks.append(max(other, key=lambda s: (busy[s], -s)))
            for i, s in enumerate(picks):
                id = f'score.{part}' + (f'.{i + 1}' if i else '')
                where = f'{SECTIONS[section(s + secs / 2)]}段，{s:.1f}–{s + secs:.1f} 秒'
                items.append({'id': id, 'en': part, 'zh': zh + (f'（第二段）' if i else ''), 'where': where,
                              'clips': clips.pair(id, {'A': cut(a, s, secs), 'B': cut(b, s, secs)})})
        groups.append({'title': title, 'items': items})
    return {'title': '一、PV 配乐：每个声部单独听', 'note': '同一段音符，A 和 B 在同一个位置截取，各约 6 秒（慢起的声音 8 秒）。',
            'parts': [{'groups': groups}]}


def bgm(clips):
    with open(os.path.join(HERE, 'bgm-trims.json'), encoding='utf8') as f:
        trims = json.load(f)
    parts = []
    for track, title, layers in BGM:
        for layer, ltitle, cats in layers:
            groups = []
            for cat, voices in cats:
                items = []
                for voice, zh in voices:
                    key = f'{track}-{layer}-{voice}'
                    a = read(os.path.join(ROOT, 'renders', 'sound', 'bgm', 'synth', key + '.wav'))[:, SETTLE * RATE:]
                    b = read(os.path.join(ROOT, 'renders', 'bgm', 'voices', key + '.wav')) * 10 ** (trims.get(f'{track}.{layer}.{voice}', 0) / 20)
                    id = f'bgm.{track}.{layer}.{voice}'
                    items.append({'id': id, 'en': voice, 'zh': zh, 'clips': clips.pair(id, {
                        'A': cut(a, busiest(a, BGM_SECS), BGM_SECS), 'B': cut(b, busiest(b, BGM_SECS), BGM_SECS)})})
                groups.append({'title': cat, 'items': items})
            parts.append({'title': f'{title}：{ltitle}', 'groups': groups})
    return {'title': '二、游戏里的背景音乐：按场景、按层、按声部',
            'note': '合成版每次演奏的音符是随机的，所以 A 和 B 各自截取最热闹的约 8 秒，音符不完全一样。张力层的声部是在最紧张时录的。',
            'parts': parts}


def sfx(clips):
    out = os.path.join(ROOT, 'renders', 'sound', 'sfx-game')
    jobs = []
    for _, sounds in SFX:
        for key, _ in sounds:
            name, _, arg = key.partition(':')
            job = {'id': key.replace(':', '-'), 'secs': SFX_SECS}
            if name == 'casino':
                job.update(sfx=arg, vibe='yacht')
            elif name == 'use':
                job.update(sfx='use', args={'item': arg})
            else:
                job.update(sfx=name, args=OPTS.get(key, OPTS.get(name, {})))
            jobs.append(job)
    path = os.path.join(ROOT, 'renders', 'sound', 'sfx-game-jobs.json')
    with open(path, 'w', encoding='utf8') as f:
        json.dump(jobs, f)
    subprocess.run(['node', os.path.join(HERE, 'listen.mjs'), path, out], check=True)
    groups = []
    for title, sounds in SFX:
        items = []
        for key, zh in sounds:
            a = trim_tail(read(os.path.join(out, key.replace(':', '-') + '.wav')))
            b = None
            if key in SURGE_SFX:
                b = read(os.path.join(ROOT, 'renders', 'sound', 'sfx', SURGE_SFX[key] + '.wav'))
            id = f'sfx.{key}'
            items.append({'id': id, 'en': key, 'zh': zh, 'clips': clips.pair(id, {'A': a, 'B': b})})
        groups.append({'title': title, 'items': items})
    return {'title': '三、游戏音效：每个一条', 'note': '游戏里所有的音效（A）。其中 7 个有 Surge XT 版本（B），放在旁边；其余只有 A。每条都调到差不多的响度，所以原本很轻的声音（比如鼠标悬停）这里会比游戏里响。',
            'parts': [{'groups': groups}]}


def main():
    saved = os.path.join(OUT, 'clips.json')
    if '--page' in sys.argv:
        with open(saved, encoding='utf8') as f:
            sections = json.load(f)
    else:
        clips = Clips()
        sections = [score(clips), bgm(clips), sfx(clips)]
        with open(saved, 'w', encoding='utf8') as f:
            json.dump(sections, f, ensure_ascii=False)
    with open(os.path.join(HERE, 'listen-page.html'), encoding='utf8') as f:
        page = f.read()
    data = json.dumps({'sections': sections}, ensure_ascii=False)
    page = page.replace('/*DATA*/null', data.replace('</', '<\\/'))
    with open(os.path.join(OUT, 'index.html'), 'w', encoding='utf8', newline='\n') as f:
        f.write(page)
    for sec in sections:
        n = sum(len(item['clips']) for part in sec['parts'] for g in part['groups'] for item in g['items'])
        print(f"{sec['title']}: {n} clips")
    size = sum(os.path.getsize(os.path.join(OUT, 'clips', f)) for f in os.listdir(os.path.join(OUT, 'clips')))
    print(f'{size / 1e6:.1f} MB of clips: {os.path.join(OUT, "index.html")}')


if __name__ == '__main__':
    main()
