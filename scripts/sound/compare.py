#!/usr/bin/env python
"""Before and after, for listening: the PV score v1 against v2, and each scene's music,
the synth's against the Surge XT loops the game now plays.

    .venv-audio/Scripts/python -I scripts/sound/compare.py [score|bgm|levels]...

score: renders/sound/score-ab.wav, three moments of the score, each v1 then v2
    (v1 from renders/pv-score-v1/, v2 from renders/pv-score-v2/).
levels: renders each voice of each track's synth version alone in muted headless Chrome
    (listen.mjs: the bed's voices calm, the tension layer's at full tension) into
    renders/sound/bgm/synth/, and writes scripts/sound/bgm-trims.json: how far to turn each
    voice of the loops (bgm.py's voices/) to be as loud in the game as the synth's. Run
    bgm.py again after it.
bgm: renders both versions as the game plays them, and writes renders/sound/bgm-<track>.wav,
    the synth's then the loops', calm and then tense, with their loudness.
Each WAV comes with a .txt of what plays when.
"""
import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from surgekit import RATE, lufs, sounding, wav  # noqa: E402

OUT = os.path.join(ROOT, 'renders', 'sound')
TRACKS = ['lantern']  # (the tracks with a Surge XT version)
AFTER = {'lantern': 1.7}  # audio.js LANTERN_LEVEL
GAIN = {'lantern': 0.333}  # audio.js LOOPS gain (tensed is 1)
SECS = 90
SETTLE = 6  # s: the synth's tension takes a while to come in


def read(path):
    x, rate = sf.read(path, always_2d=True)
    assert rate == RATE, path
    return x.T


def fade(x, secs=0.4):
    k = int(secs * RATE)
    w = np.linspace(0, 1, k)
    x = x.copy()
    x[:, :k] *= w
    x[:, -k:] *= w[::-1]
    return x


def assemble(name, pieces, note, level=None):
    """pieces: (label, audio); a short gap after each, a longer one after each pair. With
    level, the whole file is brought to that loudness (LUFS), the pieces kept as they are
    against each other."""
    if level is not None:
        k = 10 ** ((level - lufs(np.concatenate([x for _, x in pieces], axis=1))) / 20)
        k = min(k, 10 ** (-1 / 20) / max(np.abs(x).max() for _, x in pieces))
        pieces = [(label, x * k) for label, x in pieces]
        note += f' Turned up {20 * np.log10(k):.1f} dB from the game\'s level, all together.'
    clip, lines, t = [], [], 0.0
    for i, (label, x) in enumerate(pieces):
        lines.append(f'{t:6.2f} s  {label}  ({lufs(x):.1f} LUFS)')
        clip.append(x)
        t += x.shape[1] / RATE
        pause = 0.8 if i % 2 == 0 else 2.0
        clip.append(np.zeros((2, int(pause * RATE))))
        t += pause
    out = np.concatenate(clip, axis=1)
    path = os.path.join(OUT, name)
    wav(path, out)
    with open(path[:-4] + '.txt', 'w', encoding='utf8') as f:
        f.write(note + '\n' + '\n'.join(lines) + '\n')
    print(f'{name}: {out.shape[1] / RATE:.1f} s, {lufs(out):.1f} LUFS, peak {20 * np.log10(np.abs(out).max()):.1f} dBFS')
    print('\n'.join(lines))


def score():
    v1 = read(os.path.join(ROOT, 'renders', 'pv-score-v1', 'score.wav'))
    v2 = read(os.path.join(ROOT, 'renders', 'pv-score-v2', 'score.wav'))
    with open(os.path.join(ROOT, 'pv', 'score', 'beatmap.json'), encoding='utf8') as f:
        m = json.load(f)['markers']
    # (from, to) around each moment: the bar before it, the hit, the ring
    moments = [('testsPass', m['testsPass'] - 2.5, m['testsPass'] + 5),
               ('horizonLit', m['horizonLit'] - 2.5, m['horizonLit'] + 5),
               ('freeze into land', m['riser'], m['title'] + 2.5)]
    pieces = []
    for label, a, b in moments:
        for v, x in (('v1', v1), ('v2', v2)):
            pieces.append((f'{label} {v} ({a:.1f}-{b:.1f} s of the score)', fade(x[:, int(a * RATE):int(b * RATE)], 0.15)))
    assemble('score-ab.wav', pieces, 'The PV score: each moment v1 (the game\'s Web Audio voices), then v2 (Surge XT). Both mixes at -14 LUFS.')


def listen(jobs, out):
    path = os.path.join(OUT, 'jobs.json')
    with open(path, 'w', encoding='utf8') as f:
        json.dump(jobs, f)
    subprocess.run(['node', os.path.join(HERE, 'listen.mjs'), path, out], check=True)


def voices():
    """(track, layer, voice) for every voice choice.js names."""
    with open(os.path.join(ROOT, 'web', 'play', 'sounds', 'bgm', 'choice.js'), encoding='utf8') as f:
        text = f.read()
    text = text[text.rindex('export default') + len('export default'):]
    pick = json.loads(text[:text.rindex('}') + 1])
    return [(t, layer, v) for t in TRACKS for layer in ('bed', 'tense') for v in pick[t][layer]]


def levels():
    out = os.path.join(OUT, 'bgm', 'synth')
    listen([{'id': f'{t}-{layer}-{v}', 'track': t, 'synth': True, 'voices': [f'{layer}.{v}'],
             'tension': 0 if layer == 'bed' else 1, 'secs': SECS + SETTLE} for t, layer, v in voices()], out)
    trims = {}
    print('voice                 synth   loops  trim   (LUFS while it sounds)')
    for t, layer, v in voices():
        old = sounding(read(os.path.join(out, f'{t}-{layer}-{v}.wav'))[:, SETTLE * RATE:])
        new = sounding(read(os.path.join(ROOT, 'renders', 'bgm', 'voices', f'{t}-{layer}-{v}.wav')) * GAIN[t] * AFTER[t])
        trims[f'{t}.{layer}.{v}'] = round(old - new, 1)
        print(f'{t + "." + layer + "." + v:20s} {old:6.1f}  {new:6.1f}  {old - new:+5.1f}')
    with open(os.path.join(HERE, 'bgm-trims.json'), 'w', encoding='utf8', newline='\n') as f:
        f.write('{\n' + ',\n'.join(f'  "{k}": {v}' for k, v in trims.items()) + '\n}\n')
    print('wrote scripts/sound/bgm-trims.json: run bgm.py again')


def bgm():
    out = os.path.join(OUT, 'bgm')
    listen([{'id': f'{t}-{v}-{x}', 'track': t, 'synth': v == 'synth', 'tension': x, 'secs': 30}
            for t in TRACKS for v in ('synth', 'loops') for x in (0, 1)], out)
    for t in TRACKS:
        get = lambda v, x, a, b: fade(read(os.path.join(out, f'{t}-{v}-{x}.wav'))[:, int(a * RATE):int(b * RATE)])
        pieces = [('calm, the synth', get('synth', 0, 4, 24)), ('calm, the loops', get('loops', 0, 4, 24)),
                  ('tense, the synth', get('synth', 1, 4, 19)), ('tense, the loops', get('loops', 1, 4, 19))]
        assemble(f'bgm-{t}.wav', pieces, f'{t}: the synth version (Web Audio), then the Surge XT loops the game plays now; calm, then at full tension.', -18)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for what in sys.argv[1:] or ['score', 'bgm']:
        {'score': score, 'bgm': bgm, 'levels': levels}[what]()
