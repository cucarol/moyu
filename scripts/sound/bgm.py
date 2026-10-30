#!/usr/bin/env python
"""The raft's music (web/play/audio.js TRACKS.lantern) played on Surge XT, as seamless loops.

Each track is the synth version's own music, its notes written out here for one loop
(the random choices it makes as it plays, made once with a fixed seed), played on the
same Surge XT patches as the PV score's v2 at the same levels (pv/score/v2/voices.json),
and rendered into two loops of the same length: the bed, and the layer tension brings in.
Every note is played once and laid down three loops running, and the middle loop kept,
so whatever rings over the loop's end comes back in at its start.

Each voice is rendered on its own (its room and tape included), and a loop holds only the
voices web/play/sounds/bgm/choice.js gives the loops: the game's synth plays the others
alongside. Each voice is as loud as the synth's own in the game: bgm-trims.json (from
compare.py levels) says how far to turn each one, after the loops' level, which is set by
all the bed's voices, whichever play, so that a choice changes no voice's level.

    .venv-audio/Scripts/python -I scripts/sound/bgm.py [--wav dir]

Writes web/play/sounds/bgm/<track>.ogg and <track>-tense.ogg (Vorbis; a layer with no
voice from the loops gets no file), the loops as 24-bit WAVs into --wav (default
renders/bgm/), and every voice alone into its voices/ (<track>-<layer>-<voice>.wav, at
the loops' level, before its trim). Needs what pv/score/v2/render.py needs (see
pv/score/README.md), and voices.json from a run of it.
"""
import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, 'pv', 'score', 'v2'))
from surgekit import RATE, Bank, echo, filt, lufs, sweep, wav  # noqa: E402
import render as score  # noqa: E402  (the PV's voices: the same patches)

OUT = os.path.join(ROOT, 'web', 'play', 'sounds', 'bgm')
LEVEL = -20  # LUFS, each bed; its tension layer keeps the bed's gain
QUALITY = 2  # Vorbis -q
with open(os.path.join(ROOT, 'pv', 'score', 'v2', 'voices.json'), encoding='utf8') as f:
    VOICES = json.load(f)
TRIMS = os.path.join(HERE, 'bgm-trims.json')


def choice():
    """web/play/sounds/bgm/choice.js: track -> layer -> voice -> 'loop' | 'synth'."""
    with open(os.path.join(OUT, 'choice.js'), encoding='utf8') as f:
        text = f.read()
    text = text[text.rindex('export default') + len('export default'):]
    return json.loads(text[:text.rindex('}') + 1])


def trims():
    """bgm-trims.json: 'track.layer.voice' -> dB, each voice to the synth's level."""
    if not os.path.exists(TRIMS):
        return {}
    with open(TRIMS, encoding='utf8') as f:
        return json.load(f)


def voice_gain(part, vel):
    v = VOICES[part]
    return vel / v['ref'] * 10 ** (v['gain'] / 20)


class Loop:
    """Notes laid down three loops running; the middle loop is the one kept."""

    def __init__(self, bank, secs):
        self.bank = bank
        self.n = int(round(secs * RATE))
        self.buf = {}
        self.played = {}  # the same note again: one of its first four takes, in turn
        self.trim = {}  # a part's level against its voice's, where the synth used it otherwise

    def bus(self, name):
        if name not in self.buf:
            self.buf[name] = np.zeros((2, self.n * 3))
        return self.buf[name]

    def put(self, bus, x, t, gain=1.0, pan=0.0):
        th = (pan + 1) * np.pi / 4
        g = np.array([np.cos(th), np.sin(th)])[:, None] * np.sqrt(2) * gain
        out = self.bus(bus)
        for k in range(3):
            i = int(round(t * RATE)) % self.n + k * self.n
            m = min(x.shape[1], out.shape[1] - i)
            out[:, i:i + m] += x[:, :m] * g

    def note(self, bus, part, t, m, dur, vel, pan=0.0, patch=None):
        cfg = score.PARTS[part]
        layers = cfg.get('layers') or [(patch or cfg['patch'], 0, 0)]
        for p, db, hold in layers:
            gate = cfg.get('gate') or max(0.05, dur + hold)
            takes = self.played.setdefault((p, cfg.get('note', m), round(gate, 3)), [0])
            if len(takes) < 5:
                x = self.bank[p].play([(cfg.get('note', m), 0, gate)], gate + cfg['tail'])
                if cfg.get('lp'):
                    x = filt(x, 'lowpass', cfg['lp'])
                if cfg.get('air'):
                    x = filt(x, 'highshelf', cfg['air'][0], 0.707, cfg['air'][1])
                takes.append(x)
            else:
                takes[0] += 1
                x = takes[1 + takes[0] % 4]
            self.put(bus, x, t, voice_gain(part, vel) * 10 ** (db / 20) * self.trim.get(part, 1), pan)

    def middle(self, x):
        """The middle loop, its first 20 ms eased in from what follows the loop."""
        n = self.n
        y = x[:, n:2 * n].copy()
        k = int(0.02 * RATE)
        w = np.linspace(0, 1, k)
        y[:, :k] = x[:, 2 * n:2 * n + k] * (1 - w) + y[:, :k] * w
        return y


def reverb(bank, x, send):
    return bank.reverb(x * send) * 0.7 if send else 0


# ---- Lantern: a slow lofi beat (audio.js lantern) ---------------------------------------

LANTERN = [(37, [53, 56, 60, 63]), (36, [55, 58, 60, 63]), (41, [56, 60, 63, 67]), (44, [60, 63, 67, 70])]
LANTERN_TOP = [75, 77, 80, 82, 84]


def lantern(bank, rng):
    beat = 60 / 72
    swing = 0.62
    bars = 16  # the four chords, four times round
    L = Loop(bank, bars * 4 * beat)
    for i in range(bars * 4):
        bass, keys = LANTERN[(i // 4) % 4]
        b = i % 4
        t = i * beat
        off = t + swing * beat
        if b == 0:
            for j, m in enumerate(keys):
                L.note('bed.keys', 'keys', t + j * 0.014, m, beat * 3.4, 0.026)
        if b == 2:
            # a soft push late in the bar: 0.3 of bars calm, 0.6 tense
            r = rng.random()
            if r < 0.6:
                for j, m in enumerate(keys):
                    L.note('bed.keys' if r < 0.3 else 'tense.keys', 'keys', off + j * 0.012, m, beat * 1.2, 0.015)
        # the bass as score.js voices it (the synth's 0.16 is score.js's 0.16 * 0.45)
        if b == 0:
            L.note('bed.bass', 'bass', t, bass, beat * 1.5, 0.16 / 0.45)
        if b == 2:
            L.note('bed.bass', 'bass', off, bass, beat * 0.9, 0.12 / 0.45)
        kick = 0.2 / 0.12  # the synth's kick is louder than the score's
        if b == 0:
            L.note('bed.kick', 'kick', t, 60, 0.24, kick)
        if b == 1:
            L.note('bed.kick', 'kick', off, 60, 0.24, 0.7 * kick)
        if b == 2 and rng.random() < 0.25:
            L.note('bed.kick', 'kick', t + beat * 0.75, 60, 0.24, 0.5 * kick)
        if b % 2:
            L.note('bed.rim', 'rim', t, 60, 0.14, 1)
        L.note('bed.hat', 'hat', t, 60, 0.03, 0.8 if b % 2 else 1)
        L.note('bed.hat', 'hat', off, 60, 0.03, 0.6)
        # tension: sixteenths on the hats, and a few high notes over the chords
        L.note('tense.hat', 'hat', t + beat * 0.31, 60, 0.03, 0.4)
        L.note('tense.hat', 'hat', t + beat * 0.81, 60, 0.03, 0.4)
        if b == 3 and rng.random() < 0.7:
            L.note('tense.top', 'keys', off, LANTERN_TOP[rng.integers(len(LANTERN_TOP))], beat * 1.5, 0.016)
    sends = {'bed': 0.3, 'tense': 0.35}
    out = {}
    for name, x in L.buf.items():
        x = x + reverb(bank, x, sends[name.split('.')[0]])
        # the tape: the highs rolled off (half as high again, as the PV's keys), a little
        # wow and flutter (whole cycles in the loop: 24 and 176)
        x = filt(x, 'lowpass', 2600 * score.K_OPEN)
        tt = np.arange(x.shape[1]) / RATE
        d = 0.02 + 0.0014 * np.sin(2 * np.pi * 0.45 * tt) + 0.00012 * np.sin(2 * np.pi * 3.3 * tt)
        x = np.stack([np.interp(tt - d, tt, c) for c in x])
        out[tuple(name.split('.'))] = L.middle(x)
    return out


# (The Wired had a Surge XT version too until 2026-10-31; it plays only from audio.js now.)


def synth_thump(t, f0, f1, gain, dur=0.12, a=0.003):
    """audio.js tone(): a sine gliding f0 to f1, its gain up in a and down over dur."""
    tt = np.arange(int((a + dur) * RATE)) / RATE
    f = f0 * (f1 / f0) ** (tt / (a + dur))
    g = np.where(tt < a, 1e-4 * (gain / 1e-4) ** (tt / a), gain * (1e-4 / gain) ** ((tt - a) / dur))
    return t, np.sin(2 * np.pi * np.cumsum(f) / RATE) * g


def thump_trim(bank, beat, secs=10):
    old = np.zeros((2, secs * RATE))
    new = np.zeros((2, secs * RATE))
    x1 = bank[score.PARTS['kick']['patch']].play([(48, 0, 0.12)], 0.6)
    x2 = bank[score.PARTS['kick']['patch']].play([(46, 0, 0.12)], 0.6)
    for i in range(int(secs / beat) - 1):
        for (t, x) in (synth_thump(i * beat, 62, 42, 0.32), synth_thump(i * beat + 0.18, 58, 40, 0.22)):
            j = int(t * RATE)
            old[:, j:j + len(x)] += x * 10  # (the score's levels are DRIVE up)
        for (t, x, v) in ((i * beat, x1, 0.32), (i * beat + 0.18, x2, 0.22)):
            j = int(t * RATE)
            new[:, j:j + x.shape[1]] += x[:, :new.shape[1] - j] * voice_gain('kick', v / 0.12)
    return 10 ** ((lufs(old) - lufs(new)) / 20)


TRACKS = {'lantern': lantern}


def main():
    argv = sys.argv[1:]
    wav_dir = argv[argv.index('--wav') + 1] if '--wav' in argv else None
    os.makedirs(OUT, exist_ok=True)
    scratch = wav_dir or os.path.join(ROOT, 'renders', 'bgm')
    os.makedirs(scratch, exist_ok=True)
    os.makedirs(os.path.join(scratch, 'voices'), exist_ok=True)
    bank = Bank(scratch)
    picks, trim = choice(), trims()
    for name, make in TRACKS.items():
        voices = make(bank, np.random.default_rng(20261030))
        # the loops' level, from all of the bed and the tension layer, whichever voices play
        layers = {layer: sum(x for (l, _), x in voices.items() if l == layer) for layer in ('bed', 'tense')}
        gain = 10 ** ((LEVEL - lufs(layers['bed'])) / 20)
        peak = max(np.abs(x).max() for x in layers.values()) * gain
        if peak > 10 ** (-1 / 20):
            gain *= 10 ** (-1 / 20) / peak
        for (layer, voice), x in voices.items():
            wav(os.path.join(scratch, 'voices', f'{name}-{layer}-{voice}.wav'), x * gain)
        for layer in ('bed', 'tense'):
            file = name if layer == 'bed' else f'{name}-{layer}'
            ogg = os.path.join(OUT, f'{file}.ogg')
            mine = [v for (l, v) in voices if l == layer and picks[name][layer].get(v, 'loop') == 'loop']
            if not mine:
                if os.path.exists(ogg):
                    os.remove(ogg)
                print(f'{file:14s} every voice from the synth: no file')
                continue
            x = sum(voices[(layer, v)] * gain * 10 ** (trim.get(f'{name}.{layer}.{v}', 0) / 20) for v in mine)
            tmp = os.path.join(scratch, f'{file}.wav')
            wav(tmp, x)
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'libvorbis', '-q:a', str(QUALITY), ogg], check=True)
            print(f'{file:14s} {x.shape[1] / RATE:6.2f} s  {lufs(x):6.1f} LUFS  peak {20 * np.log10(np.abs(x).max()):5.1f} dBFS  '
                  f'{os.path.getsize(ogg) / 1024:6.0f} KB  ({", ".join(mine)})')
    os.remove(os.path.join(scratch, 'patch.state'))


if __name__ == '__main__':
    main()
