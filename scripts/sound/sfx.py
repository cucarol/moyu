#!/usr/bin/env python
"""A Surge XT take on some of the game's most heard sounds, for comparing only: the game
keeps its own (web/play/audio.js SFX). Each is the same gesture, the same length and the
same loudness as the game's, played on Surge XT factory patches.

    node scripts/sound/listen.mjs scripts/sound/sfx-jobs.json renders/sound/old
    .venv-audio/Scripts/python -I scripts/sound/sfx.py

Writes renders/sound/sfx-compare.wav (each sound the game's, then Surge's, then the next),
renders/sound/sfx-compare.txt (what plays when) and each Surge take alone, as loud as the
game's, into renders/sound/sfx/<id>.wav (for the listening page, clips.py).
"""
import json
import os
import sys

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from surgekit import RATE, Bank, filt, lufs, sweep, wav  # noqa: E402

OUT = os.path.join(ROOT, 'renders', 'sound')
with open(os.path.join(HERE, 'sfx-jobs.json'), encoding='utf8') as f:
    JOBS = json.load(f)


def blank_buf(secs):
    return np.zeros((2, int(secs * RATE)))


def lay(out, x, t, gain=1.0):
    i = int(round(t * RATE))
    m = min(x.shape[1], out.shape[1] - i)
    out[:, i:i + m] += x[:, :m] * gain


def tone(bank, patch, m, gate, tail=0.6):
    return bank[patch].play([(m, 0, gate)], gate + tail)


def noise(bank, secs):
    return bank['FX/Radio Noise'].play([(60, 0, secs)], secs + 0.05)


def env(x, points):
    tt = np.arange(x.shape[1]) / RATE
    ts, vs = zip(*points)
    return x * np.interp(tt, ts, vs, right=0)


# Each takes the bank and returns its sound, starting at 0.05 s as the game's do.
def click(bank):
    out = blank_buf(0.6)
    lay(out, tone(bank, 'Plucks/Square Pop', 88, 0.04, 0.3), 0.05)
    lay(out, tone(bank, 'Plucks/Square Pop', 93, 0.03, 0.3), 0.085, 0.55)
    return out


def blank(bank):
    out = blank_buf(1.2)
    lay(out, tone(bank, 'Cybersoda/Drums/Snap', 79, 0.03, 0.3), 0.05)
    lay(out, tone(bank, 'Emu/Drums/Hat Closed', 60, 0.03, 0.2), 0.05, 0.6)
    lay(out, tone(bank, 'Plucks/Bell 1', 102, 0.04, 0.5), 0.05, 0.15)
    return out


def shot(bank):
    out = blank_buf(2.0)
    lay(out, tone(bank, 'Luna/Drums/Big Kick', 36, 0.4, 1.2), 0.05)
    lay(out, tone(bank, 'Malfunction/Drums/Tom Floor', 36, 0.4, 1.2), 0.05, 0.7)
    air = sweep(noise(bank, 0.7), 'lowpass', lambda s: 7000 * (250 / 7000) ** min(1, s / 0.6))
    lay(out, env(air, [(0, 0), (0.001, 1), (0.6, 0)]), 0.05, 4)
    crack = filt(noise(bank, 0.06), 'highpass', 2500)
    lay(out, env(crack, [(0, 0), (0.001, 1), (0.04, 0)]), 0.05, 3)
    return np.tanh(out * 3) / 3  # driven, as the game's is


def use_cache(bank):
    out = blank_buf(1.8)
    for i, m in enumerate([86, 93, 98]):  # the item family's chirp
        lay(out, tone(bank, 'Plucks/Square Pop', m, 0.022, 0.2), 0.05 + i * 0.025, 0.6)
    t = 0.15
    lay(out, tone(bank, 'Plucks/Square Pop', 83, 0.07, 0.3), t)
    lay(out, tone(bank, 'Plucks/Square Pop', 88, 0.3, 0.5), t + 0.07)
    for i, m in enumerate([91, 96, 100]):
        lay(out, tone(bank, 'Plucks/Magic Music Box', m, 0.4, 1.0), t + 0.12 + i * 0.05, 0.6)
    lay(out, tone(bank, 'Pads/MKS-70 Warm Pad', 57, 0.5, 0.6), t, 0.5)
    return out


def card(bank):
    out = blank_buf(0.8)
    lay(out, tone(bank, 'Malfunction/Drums/Brush', 72, 0.07, 0.3), 0.05)
    lay(out, tone(bank, 'Malfunction/Drums/Tom Floor', 55, 0.03, 0.2), 0.14, 0.4)
    return out


def roll(bank, rng=np.random.default_rng(5)):
    out = blank_buf(1.6)
    for d in range(5):  # each die bounces three to five times, closing up and quieting
        t = 0.05 + rng.uniform(0, 0.08)
        gap, k = rng.uniform(0.09, 0.14), 1.0
        for i in range(3 + int(rng.integers(3))):
            lay(out, tone(bank, 'Vospi/Drums/Nice Clicks Perc', int(rng.integers(64, 76)), 0.03, 0.2), t, k)
            t += gap
            gap *= 0.62
            k *= 0.6
    felt = filt(noise(bank, 0.45), 'lowpass', 2000)
    lay(out, env(felt, [(0, 0), (0.16, 1), (0.4, 0)]), 0.05, 0.8)
    return out


def win(bank):
    out = blank_buf(3.2)
    for i, m in enumerate([74, 78, 81, 86, 90]):
        lay(out, tone(bank, 'Plucks/Pure Square', m, 0.35, 0.6), 0.05 + i * 0.11)
    for m in [62, 69, 73, 78]:
        lay(out, tone(bank, 'Pads/MKS-70 Warm Pad', m, 2.0, 0.8), 0.55, 0.6)
    return out


MAKE = {'click': click, 'blank': blank, 'shot': shot, 'use': use_cache, 'card': card, 'roll': roll, 'win': win}


def main():
    bank = Bank(OUT)
    os.makedirs(os.path.join(OUT, 'sfx'), exist_ok=True)
    clip, lines, t = [], [], 0.0
    gap, between = 0.5, 1.2
    for job in JOBS:
        old, rate = sf.read(os.path.join(OUT, 'old', f"{job['id']}.wav"), always_2d=True)
        old = old.T
        new = MAKE[job['sfx']](bank)
        new = new + bank.reverb(new * 0.25) * 0.5
        new = new[:, :old.shape[1]] if new.shape[1] > old.shape[1] else np.pad(new, ((0, 0), (0, old.shape[1] - new.shape[1])))
        gain = lufs(old) - lufs(new)
        new *= 10 ** (gain / 20)
        wav(os.path.join(OUT, 'sfx', f"{job['id']}.wav"), new)
        for label, x in (('game', old), ('surge', new)):
            lines.append(f"{t:6.2f} s  {job['sfx']:6s} {label}")
            clip.append(x)
            t += x.shape[1] / RATE
            pause = gap if label == 'game' else between
            clip.append(np.zeros((2, int(pause * RATE))))
            t += pause
    out = np.concatenate(clip, axis=1)
    # -16 LUFS, or lower if the loudest peak would pass -1 dBFS
    out *= min(10 ** ((-16 - lufs(out)) / 20), 10 ** (-1 / 20) / np.abs(out).max())
    wav(os.path.join(OUT, 'sfx-compare.wav'), out)
    with open(os.path.join(OUT, 'sfx-compare.txt'), 'w', encoding='utf8') as f:
        f.write('Each sound the game\'s own, then a Surge XT take on it (the game keeps its own).\n' + '\n'.join(lines) + '\n')
    print('\n'.join(lines))
    print(f'sfx-compare.wav {out.shape[1] / RATE:.1f} s, {lufs(out):.1f} LUFS, peak {20 * np.log10(np.abs(out).max()):.1f} dBFS')
    os.remove(os.path.join(OUT, 'patch.state'))


if __name__ == '__main__':
    main()
