#!/usr/bin/env python
"""The launch PV's score, v2: the same notes as v1 (score.js), played on Surge XT.

v1 plays the game's own Web Audio voices. v2 takes every note v1 played, by part, from
events.json (written by render.mjs), plays each one on a Surge XT factory patch in
DawDreamer, and mixes them the way v1 does: each part at v1's loudness for it
(v1-levels.json, from render.mjs --solo), the same stem compressors, the same arc, the
music's mids dipping at the hits, the Wired's dotted-eighth delay, space from Surge XT
Effects' Reverb 2, then -14 LUFS under a -2.5 dBFS lookahead limiter. The game's own
sounds (the dice in the cup, the card snap) stay v1's own (solo/game.wav).

Any part can be v1's instead: choice.json says which, part by part ("v1" or "v2"; a part
it leaves out is v2). A v1 part is v1's own render of it alone (render.mjs --solo, its
room and its dip at the hits included), in v2's place in its stem before the stems'
compressors; v1 and v2 play the same notes at the same times, so it lines up.

    node pv/score/render.mjs            # events.json (and v1, which the A/B uses)
    node pv/score/render.mjs --solo     # v1-levels.json and solo/<part>.wav
    .venv-audio/Scripts/python -I pv/score/v2/render.py [--out dir] [--reuse] [--choice file]

Needs .venv-audio (dawdreamer, numpy, scipy, soundfile) and Surge XT under
local/audio-src/surge-xt/: see pv/score/README.md. Writes into --out (default
renders/pv-score-v2/): score.wav, score-no-drums.wav, stem-music.wav, stem-drums.wav,
stem-fx.wav, stem-game.wav and beatmap.json, as v1 does, parts/ (every part as played,
before its level: --reuse mixes them again without playing them again) and voices/ (every
part alone as v2 has it in the mix, its room included, at v1's solo level: to listen to
next to v1's solo/).
"""
import json
import os
import sys

import numpy as np
import scipy.signal as ss
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'sound'))
from surgekit import (RATE, Bank, biquad, compress, ebur128, echo, filt, limit, lufs,  # noqa: E402
                      place, ramp, steps, sweep, wav)
LENGTH = 80
N = LENGTH * RATE
BEAT = 0.625
BAR = 4 * BEAT
TARGET = -14  # LUFS
CEILING = 10 ** (-2.5 / 20)


def at(bar, beat=0):
    return bar * BAR + beat * BEAT


# ---- the parts: a patch (or two) each, as score.js voices them ----------------------
# patch: a factory (or third-party) patch; gate: how long the key is held (None: the
# note's own length, plus `hold`); tail: how long to let it ring; send: to the reverb;
# k: K's lowpass (the keys open for the theme); lp: a fixed lowpass; air: a high shelf
# (Hz, dB).
PARTS = {
    # (a touch of an FM piano's tine over the suitcase, for its definition)
    'keys': dict(layers=[('Keys/Soft Suitcase', 0, 0), ('Keys/DX EP', -10, 0)], tail=2.5, send=0.3, k=True),
    'lead': dict(layers=[('Keys/DX EP', 0, 0.3), ('Plucks/Pure Square', -9, 0)], tail=2, send=0.25, k=True),
    'arp': dict(patch='Plucks/Light 1', tail=2.5, send=0.4, k=True),
    'bass': dict(patch='Basses/Fingered', tail=1, send=0, lp=900),
    'pad': dict(patch='Pads/MKS-70 Warm Pad', tail=3, send=0.3, lp=1800),
    'glint': dict(patch='Plucks/Magic Music Box', tail=2, send=0.35),
    'ping': dict(patch='Plucks/Bell 1', tail=2.5, send=0.2),
    'shimmer': dict(patch='Plucks/Fantasy Bell', slow='Pads/Sparkly', tail=3, send=0.6),
    'ding': dict(patch='Plucks/Square Pop', tail=1, send=0.1, lp=4000),
    'kick': dict(patch='Altenberg/Drums/Kick Lo-Fi', gate=0.25, tail=0.6, send=0),
    'rim': dict(patch='Cybersoda/Drums/Snap', gate=0.1, tail=0.5, send=0.15),
    'hat': dict(patch='Emu/Drums/Hat Closed', gate=0.04, tail=0.3, send=0, air=(8000, 4)),
    'crash': dict(patch='Emu/Drums/T8 Cymbal', gate=1.0, tail=3, send=0.2),
    'boom': dict(patch='Malfunction/Drums/Tom Floor', note=43, gate=0.6, tail=2, send=0.3),
}
STEMS = {
    'music': ['pad', 'keys', 'drone', 'ping', 'glint', 'bass', 'arp', 'lead', 'shimmer'],
    'drums': ['kick', 'hat', 'rim'],
    'fx': ['swell', 'boom', 'crash', 'riser', 'toss', 'ding'],
}
NOISE = 'FX/Radio Noise'  # the air under the swells, the toss and the boom
DRONE = 'Pads/Moody Statement'
RISER = 'Polysynths/Uni Saw FB'
# as in score.js
SQUEEZE = {'music': (-24, 4, 0.003, 0.2), 'drums': (-22, 5, 0.002, 0.1), 'fx': (-22, 4, 0.002, 0.2), 'game': (-22, 5, 0.002, 0.1)}
DRIVE = 10
ARC = [(0, -6.5), (3, -4.5), (8, -3), (11, -2), (12, -3), (19, -3), (23, -1.5), (25, 0), (29, -2), (32, -3)]
# K's lowpass: v1's, half as high again (Soft Suitcase is darker than v1's electric piano)
K_LP = [(0, 2600), (19, 2600), (21, 3200), (23, 4200), (25, 5200), (29, 3000)]
K_OPEN = 1.5
WIRED_ECHO = dict(time=BEAT * 0.75, feedback=0.45, lp=1800, back=0.5)


# ---- the parts -------------------------------------------------------------------------

def notes_part(bank, name, evs):
    cfg = PARTS[name]
    out = np.zeros((2, N))
    ref = max(e['vel'] for e in evs)
    for e in evs:
        layers = cfg.get('layers') or [(cfg['slow'] if e.get('a', 0) >= 0.3 and 'slow' in cfg else cfg['patch'], 0, 0)]
        for patch, db, hold in layers:
            gate = cfg.get('gate') or max(0.05, e.get('dur', 0.2) + hold)
            m = cfg.get('note', e.get('m', 60))
            x = bank[patch].play([(m, 0, gate)], gate + cfg['tail'])
            if e.get('a', 0) > 0.05:  # v1's slow swells in: fade the attack in as it did
                ramp_in = np.minimum(1, np.arange(x.shape[1]) / (e['a'] * RATE))
                x = x * ramp_in
            place(out, x, e['t'], (e['vel'] / ref) * 10 ** (db / 20), e.get('pan', 0))
    if cfg.get('lp'):
        out = filt(out, 'lowpass', cfg['lp'])
    if cfg.get('air'):
        out = filt(out, 'highshelf', cfg['air'][0], 0.707, cfg['air'][1])
    return out


def noise_rise(bank, t, rise, dur, f0, f1, kind, q=1.2):
    """v1's hiss: filtered air rising for `rise`, its filter sweeping f0 to f1, gone `dur` later."""
    x = bank[NOISE].play([(60, 0, rise + dur + 0.1)], rise + dur + 0.2)
    tt = np.arange(x.shape[1]) / RATE
    env = np.interp(tt, [0, rise, rise + dur], [0, 1, 0], right=0)
    freq = lambda s: f0 * (f1 / f0) ** min(1, s / max(rise + dur, 1e-3))
    y = sweep(x, kind, freq, q) * env
    out = np.zeros((2, N))
    place(out, y, t)
    return out


def drone_part(bank, e):
    t0, end = e['t'], e['end']
    changes = e['changes']
    notes = []
    for i, (t, chord) in enumerate(changes):
        nxt = changes[i + 1][0] if i + 1 < len(changes) else end
        notes += [(m, t - t0, nxt - t + 0.12) for m in chord]  # a little legato
    x = bank[DRONE].play(notes, end - t0 + 3)
    tt = t0 + np.arange(x.shape[1]) / RATE
    env = ramp([(at(2, 2), 0), (at(3), 1), (at(11, 3), 1), (at(13), 0)], tt)
    # v1's filter, opening as the rack lights (three times as high: the patch is darker)
    def freq(s):
        t = t0 + s
        if t < at(11):
            f = np.interp(t, [at(3), at(7), at(10)], [420, 700, 1000])
        else:
            f = 1000 * 2.6 ** min(1, (t - at(11)) / (BEAT * 3.5))
        return 3 * (f + 180 * np.sin(2 * np.pi * 0.043 * (t - at(2, 2))))
    y = sweep(x, 'lowpass', freq, 1.0) * env
    out = np.zeros((2, N))
    place(out, y, t0)
    return out


def riser_part(bank, e):
    """A saw climbing three octaves: one held note, read faster and faster."""
    T = e['dur']
    span = e['m1'] - e['m']
    r_end = 2 ** (span / 12)
    total = T * (r_end - 1) / np.log(r_end)
    x = bank[RISER].play([(e['m'], 0, total + 0.2)], total + 0.3)
    # keep what would fold over once sped up: under 2500 Hz in the end
    x = sweep(x, 'lowpass', lambda s: 2500 / (1 + s * np.log(r_end) / T), 0.707, 64)
    t = np.arange(int((T + 0.05) * RATE)) / RATE
    pos = T / np.log(r_end) * (np.minimum(r_end, np.exp(np.log(r_end) * t / T)) - 1)
    y = np.stack([np.interp(pos * RATE, np.arange(x.shape[1]), c) for c in x])
    y *= np.interp(t, [0, T, T + 0.05], [0, 1, 0])
    out = np.zeros((2, N))
    place(out, y, e['t'])
    return out


def boom_air(bank):
    """Under the tom: v1's dark air, its filter closing from 900 Hz to 120."""
    x = bank[NOISE].play([(60, 0, 0.7)], 0.8)
    tt = np.arange(x.shape[1]) / RATE
    y = sweep(x, 'lowpass', lambda s: 900 * (120 / 900) ** min(1, s / 0.6), 0.707)
    y *= np.interp(tt, [0, 0.002, 0.6], [0, 1, 0], right=0)
    return y / np.abs(y).max()


def render_parts(bank, events):
    by = {}
    for e in events:
        by.setdefault(e['part'], []).append(e)
    parts = {}
    for name, evs in by.items():
        if name in PARTS:
            parts[name] = notes_part(bank, name, evs)
        elif name == 'drone':
            parts[name] = drone_part(bank, evs[0])
        elif name == 'riser':
            parts[name] = riser_part(bank, evs[0])
        elif name in ('swell', 'toss'):
            ref = max(v['vel'] for v in evs)
            parts[name] = sum(noise_rise(bank, e['t'], e['rise'], e.get('dur', 0.05), e['f0'], e['f1'], e.get('type', 'bandpass'))
                              * (e['vel'] / ref) for e in evs)
        else:
            raise ValueError(f'no voice for {name}')
        if name == 'boom':  # air under the tom, 0.8 of its level as in v1
            top, ref = np.abs(parts[name]).max(), max(e['vel'] for e in evs)
            for e in evs:
                place(parts[name], boom_air(bank), e['t'], 0.8 * top * e['vel'] / ref)
    return parts


# ---- the mix ---------------------------------------------------------------------------

def send(name):
    """How much of a part goes to the reverb."""
    # (the long voices: a little room too)
    return PARTS[name]['send'] if name in PARTS else 0.2 if name in ('drone', 'swell', 'riser', 'toss') else 0


def read_v1(name):
    """v1's part alone (render.mjs --solo), as long as v2's."""
    x, rate = sf.read(os.path.join(ROOT, 'renders', 'pv-score', 'solo', name + '.wav'), always_2d=True)
    assert rate == RATE
    return np.pad(x.T, ((0, 0), (0, max(0, N - x.shape[0]))))[:, :N]


def mids_dip(x, markers):
    """The music's mids down 9 dB at 1.4 kHz at the hits, to leave the game's sounds room."""
    b, a = biquad('peaking', 1400, 0.7, -9)
    dipped = ss.lfilter(b, a, x, axis=-1)
    t = np.arange(x.shape[1]) / RATE
    w = np.zeros_like(t)
    for m in (markers['liveShot'], markers['testsPass'], markers['yachtLand'], markers['title']):
        w = np.maximum(w, np.interp(t, [m - 0.03, m, m + 0.3, m + 1], [0, 1, 1, 0], left=0, right=0))
    return x + (dipped - x) * w


def main():
    argv = sys.argv[1:]
    out_dir = argv[argv.index('--out') + 1] if '--out' in argv else os.path.join(ROOT, 'renders', 'pv-score-v2')
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(HERE, 'events.json'), encoding='utf8') as f:
        events = json.load(f)
    with open(os.path.join(HERE, 'v1-levels.json'), encoding='utf8') as f:
        levels = json.load(f)
    with open(os.path.join(HERE, '..', 'beatmap.json'), encoding='utf8') as f:
        beatmap = json.load(f)
    markers = beatmap['markers']
    path = argv[argv.index('--choice') + 1] if '--choice' in argv else os.path.join(HERE, 'choice.json')
    with open(path, encoding='utf8') as f:
        choice = json.load(f)
    assert set(choice.values()) <= {'v1', 'v2'}, choice

    # every part as played, kept for --reuse (mixing again without playing again)
    cache = os.path.join(out_dir, 'parts')
    bank = Bank(out_dir)
    if '--reuse' in argv and os.path.isdir(cache):
        parts = {f[:-4]: np.load(os.path.join(cache, f)).astype(np.float64) for f in os.listdir(cache) if f.endswith('.npy')}
    else:
        parts = render_parts(bank, events)
        os.remove(os.path.join(out_dir, 'patch.state'))
        os.makedirs(cache, exist_ok=True)
        for name, x in parts.items():
            np.save(os.path.join(cache, name + '.npy'), x.astype(np.float32))
    for name in parts:
        if PARTS.get(name, {}).get('k'):
            parts[name] = sweep(parts[name], 'lowpass', lambda t: K_OPEN * steps([(at(b), f) for b, f in K_LP], t))
    # the Wired's echo carries the drone and the pings, as in v1
    for name in ('drone', 'ping'):
        parts[name] = parts[name] + echo(parts[name], **WIRED_ECHO)
    # each part as loud as v1's, and what that makes each voice's level: a note of v1's
    # level vel plays at vel / ref * 10 ** (gain / 20), for the game's music (bgm.py)
    print('part      v1 LUFS  v2 as played  gain')
    voices = {}
    for name, x in parts.items():
        got = lufs(x)
        gain = levels[name]['lufs'] - got
        parts[name] = x * 10 ** (gain / 20)
        refs = [e['vel'] for e in events if e['part'] == name and 'vel' in e]
        voices[name] = {'gain': round(gain, 2), 'ref': max(refs) if refs else 1}
        print(f'{name:8s} {levels[name]["lufs"]:7.1f}  {got:10.1f}  {gain:+6.1f} dB')
    with open(os.path.join(HERE, 'voices.json'), 'w', encoding='utf8', newline='\n') as f:
        f.write('{\n' + ',\n'.join(f'  "{k}": {json.dumps(v)}' for k, v in voices.items()) + '\n}\n')

    # each part alone as it sounds in the mix, for listening next to v1's
    os.makedirs(os.path.join(out_dir, 'voices'), exist_ok=True)
    for stem, names in STEMS.items():
        for n in names:
            x = parts[n] + (bank.reverb(parts[n] * send(n)) * 0.7 if send(n) else 0)
            sf.write(os.path.join(out_dir, 'voices', n + '.wav'), (mids_dip(x, markers) if stem == 'music' else x).T, RATE, subtype='FLOAT')

    t = np.arange(N) / RATE
    arc = 10 ** (ramp([(at(b), db) for b, db in ARC], t) / 20)
    stems = {}
    for stem, names in STEMS.items():
        mine = [n for n in names if n in parts and choice.get(n, 'v2') == 'v2']
        x = sum((parts[n] for n in mine), np.zeros((2, N)))
        sends = sum((parts[n] * send(n) for n in mine if send(n)), np.zeros((2, N)))
        if sends.any():
            x = x + bank.reverb(sends) * 0.7
        if stem == 'music':
            x = mids_dip(x, markers)
        stems[stem] = x + sum((read_v1(n) for n in names if choice.get(n, 'v2') == 'v1'), np.zeros((2, N)))
    print('from v1: ' + (', '.join(n for n, v in choice.items() if v == 'v1') or 'none'))
    stems['game'] = read_v1('game')
    for stem, x in stems.items():
        stems[stem] = compress(x, *SQUEEZE[stem]) * arc / DRIVE
    # the stems as loud against each other as v1's (render.mjs's renders/pv-score/): the
    # parts match v1's one by one, but Surge's drums are punchier and squeeze differently
    v1 = {k: lufs(sf.read(os.path.join(ROOT, 'renders', 'pv-score', f'stem-{k}.wav'), always_2d=True)[0].T) for k in stems}
    got = {k: lufs(x) for k, x in stems.items()}
    print('stem      v1 - music   v2 - music   trim')
    for k in stems:
        trim = (v1[k] - v1['music']) - (got[k] - got['music'])
        stems[k] = stems[k] * 10 ** (trim / 20)
        print(f"{k:8s} {v1[k] - v1['music']:+9.1f}   {got[k] - got['music']:+9.1f}   {trim:+5.1f} dB")

    raw = sum(stems.values())
    before = lufs(raw)
    gain = 10 ** ((TARGET - before) / 20)
    for _ in range(4):
        mix = raw * gain
        most, busy = limit(mix, CEILING)
        got = lufs(mix)
        if abs(got - TARGET) < 0.05:
            break
        gain *= 10 ** ((TARGET - got) / 20)
    print(f'mix as rendered {before:.1f} LUFS, brought up {20 * np.log10(gain):.1f} dB')
    print(f'limiter: deepest cut {most:.1f} dB, more than 2 dB for {busy:.1f} s')

    files = {'score.wav': mix}
    rest = {f'stem-{s}.wav': x * gain for s, x in stems.items()}
    rest['score-no-drums.wav'] = (stems['music'] + stems['fx']) * gain
    over = max(20 * np.log10(np.abs(x).max()) for x in rest.values()) + 1
    if over > 0:
        print(f"stems {over:.1f} dB under the mix's level, so none clips")
    for name, x in rest.items():
        files[name] = x * 10 ** (-over / 20) if over > 0 else x
    for name, x in files.items():
        wav(os.path.join(out_dir, name), x)
        print(f'{name:20s} peak {20 * np.log10(np.abs(x).max()):.2f} dBFS')
    with open(os.path.join(out_dir, 'beatmap.json'), 'w', encoding='utf8', newline='\n') as f:
        json.dump(beatmap, f, indent=2)
        f.write('\n')
    print('section        mix   music drums fx    game  (RMS dBFS)')
    for s in beatmap['sections']:
        a, b = int(s['start'] * RATE), int(s['end'] * RATE)
        row = [10 * np.log10((x[0, a:b] ** 2).mean() + 1e-12) for x in [mix] + [files[f'stem-{k}.wav'] for k in ('music', 'drums', 'fx', 'game')]]
        print(f"{s['name']:13s} " + ' '.join(f'{v:5.1f}' for v in row))
    check = ebur128(os.path.join(out_dir, 'score.wav'))
    if check:
        print(f'score.wav: {check[0]} LUFS integrated, true peak {check[1]} dBFS (ffmpeg ebur128)')
    print(f'wrote {out_dir}')


if __name__ == '__main__':
    main()
