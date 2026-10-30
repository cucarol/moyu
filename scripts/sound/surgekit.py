"""Playing notes on Surge XT in DawDreamer, and the signal work around it, for the PV
score's v2 (pv/score/v2/render.py) and the game's music and sounds (bgm.py, sfx.py).

Surge XT and DawDreamer are fetched, not committed: see pv/score/README.md.
"""
import os
import re
import subprocess

import numpy as np
import scipy.signal as ss
import soundfile as sf
import dawdreamer as daw

from surgestate import state_from_fxp

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SURGE = os.path.join(ROOT, 'local', 'audio-src', 'surge-xt', 'Surge Synth Team')
PATCHES = os.path.join(SURGE, 'SurgeXTData')
RATE = 48000


# ---- Surge ---------------------------------------------------------------------------

def patch_path(name):
    for base in ('patches_factory', 'patches_3rdparty'):
        p = os.path.join(PATCHES, base, *name.split('/')) + '.fxp'
        if os.path.exists(p):
            return p
    raise FileNotFoundError(name)


class Surge:
    """One Surge XT instance on one patch, playing a note at a time."""

    def __init__(self, engine, name, scratch):
        self.engine = engine
        self.proc = engine.make_plugin_processor(f'p{abs(hash(name))}', os.path.join(SURGE, 'Surge XT.vst3'))
        state = os.path.join(scratch, 'patch.state')
        with open(patch_path(name), 'rb') as f, open(state, 'wb') as g:
            g.write(state_from_fxp(f.read()))
        self.proc.load_state(state)
        self.play([], 0.5)  # let the patch settle

    def play(self, notes, secs):
        """notes: (midi, start, length); returns (2, secs * RATE)."""
        self.proc.clear_midi()
        for m, t, d in notes:
            self.proc.add_midi_note(int(round(m)), 100, t, d)
        self.engine.load_graph([(self.proc, [])])
        self.engine.render(secs)
        return np.array(self.proc.get_audio(), dtype=np.float64)[:, :int(round(secs * RATE))]


class Bank:
    def __init__(self, scratch):
        self.engine = daw.RenderEngine(RATE, 512)
        self.scratch = scratch
        self.synths = {}

    def __getitem__(self, name):
        if name not in self.synths:
            self.synths[name] = Surge(self.engine, name, self.scratch)
        return self.synths[name]

    def reverb(self, x, decay=0.55, size=0.5):
        """Surge XT Effects' Reverb 2, wet only."""
        self.verbs = getattr(self, 'verbs', 0) + 1
        name = f'verb{self.verbs}'
        play = self.engine.make_playback_processor(name + 'in', x.astype(np.float32))
        fx = self.engine.make_plugin_processor(name, os.path.join(SURGE, 'Surge XT Effects.vst3'))
        fx.set_parameter(12, 0.35)  # FX Type: Reverb 2
        self.engine.load_graph([(play, []), (fx, [name + 'in'])])
        self.engine.render(0.05)
        fx.set_parameter(0, 0.35)  # pre-delay
        fx.set_parameter(1, size)
        fx.set_parameter(2, decay)
        fx.set_parameter(7, 0.45)  # HF damping: no fizz
        fx.set_parameter(9, 1.0)  # all wet
        self.engine.render(x.shape[1] / RATE)
        return np.array(fx.get_audio(), dtype=np.float64)[:, :x.shape[1]]


# ---- signal helpers ------------------------------------------------------------------

def biquad(kind, f, q=0.707, gain_db=0.0):
    w = 2 * np.pi * min(f, RATE * 0.45) / RATE
    cw, alpha = np.cos(w), np.sin(w) / (2 * q)
    if kind == 'lowpass':
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == 'highpass':
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == 'bandpass':
        b = [alpha, 0, -alpha]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == 'peaking':
        A = 10 ** (gain_db / 40)
        b = [1 + alpha * A, -2 * cw, 1 - alpha * A]
        a = [1 + alpha / A, -2 * cw, 1 - alpha / A]
    elif kind == 'highshelf':
        A = 10 ** (gain_db / 40)
        r = 2 * np.sqrt(A) * alpha
        b = [A * ((A + 1) + (A - 1) * cw + r), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - r)]
        a = [(A + 1) - (A - 1) * cw + r, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - r]
    b, a = np.array(b) / a[0], np.array(a) / a[0]
    return b, a


def filt(x, kind, f, q=0.707, gain_db=0.0):
    b, a = biquad(kind, f, q, gain_db)
    return ss.lfilter(b, a, x, axis=-1)


def sweep(x, kind, freq, q=0.707, block=128):
    """A filter whose cutoff follows freq(t seconds), a block at a time."""
    y = np.empty_like(x)
    zi = np.zeros((x.shape[0], 2))
    for s in range(0, x.shape[1], block):
        b, a = biquad(kind, freq((s + block / 2) / RATE), q)
        y[:, s:s + block], zi = ss.lfilter(b, a, x[:, s:s + block], axis=-1, zi=zi)
    return y


def ramp(points, t):
    """Linear ramps between (time, value) points, held at the ends."""
    ts, vs = zip(*points)
    return np.interp(t, ts, vs)


def steps(points, t):
    ts, vs = zip(*points)
    return vs[max(0, np.searchsorted(ts, t, side='right') - 1)]


def place(out, x, t, gain=1.0, pan=0.0):
    i = int(round(t * RATE))
    n = min(x.shape[1], out.shape[1] - i)
    if n <= 0:
        return
    th = (pan + 1) * np.pi / 4
    out[0, i:i + n] += x[0, :n] * gain * np.cos(th) * np.sqrt(2)
    out[1, i:i + n] += x[1, :n] * gain * np.sin(th) * np.sqrt(2)


def echo(x, time, feedback, lp, back):
    """The Wired's delay: a feedback echo, darker each time round (as score.js wires it)."""
    d = int(round(time * RATE))
    b, a = biquad('lowpass', lp)
    zi = np.zeros((2, 2))
    line = np.zeros_like(x)
    prev = np.zeros((2, d))
    for s in range(0, x.shape[1], d):
        n = min(d, x.shape[1] - s)
        line[:, s:s + n] = prev[:, :n]
        dark, zi = ss.lfilter(b, a, line[:, s:s + n], axis=-1, zi=zi)
        prev = np.zeros((2, d))
        prev[:, :n] = x[:, s:s + n] + feedback * dark
    return line * back


# ---- loudness (ITU-R BS.1770-4), dynamics ----------------------------------------------

def lufs(x, gate=None):
    """Integrated loudness (BS.1770). With gate (dB), only the blocks within that much of
    the loudest count: how loud a sparse voice is while it sounds."""
    k = ss.lfilter([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585], x, axis=-1)
    k = ss.lfilter([1, -2, 1], [1, -1.99004745483398, 0.99007225036621], k, axis=-1)
    size, step = int(0.4 * RATE), int(0.1 * RATE)
    p = np.concatenate([[0], np.cumsum((k ** 2).sum(0))])
    starts = np.arange(0, k.shape[1] - size + 1, step)
    z = (p[starts + size] - p[starts]) / size
    loud = lambda v: -0.691 + 10 * np.log10(np.maximum(v, 1e-20))
    z = z[loud(z) > -70]
    if not len(z):
        return -70.0
    rel = loud(z.mean()) - 10 if gate is None else loud(z.max()) - gate
    return float(loud(z[loud(z) > rel].mean()))


def sounding(x, gate=15):
    """lufs(x, gate) for a voice too quiet for BS.1770's -70 LUFS floor: measured at full
    scale, then brought back (and a sound shorter than its 0.4 s blocks given room)."""
    top = np.abs(x).max()
    x = np.pad(x, ((0, 0), (0, max(0, int(0.5 * RATE) - x.shape[1]))))
    return lufs(x / top, gate) + 20 * np.log10(top) if top > 0 else -200.0


def compress(x, threshold, ratio, attack, release, knee=8.0, block=16, ahead=0.006):
    """A Web Audio style compressor: soft knee, its automatic makeup gain, and its 6 ms
    lookahead (here the gain moves early instead of the sound late)."""
    def curve(db):
        over = db - threshold
        return np.where(over < -knee / 2, 0.0,
                        np.where(over > knee / 2, over * (1 / ratio - 1),
                                 (1 / ratio - 1) * (over + knee / 2) ** 2 / (2 * knee)))
    makeup = -0.6 * float(curve(np.array(0.0)))
    n = x.shape[1] // block * block
    peak = np.abs(x[:, :n]).max(0).reshape(-1, block).max(1)
    want = curve(20 * np.log10(np.maximum(peak, 1e-9)))  # dB, <= 0
    ka = np.exp(-block / (attack * RATE))
    kr = np.exp(-block / (release * RATE))
    g, gr = 0.0, np.empty_like(want)
    for i, w in enumerate(want.tolist()):
        g = w + (g - w) * (ka if w < g else kr)
        gr[i] = g
    gain = np.repeat(10 ** ((gr + makeup) / 20), block)
    gain = np.concatenate([gain, np.full(x.shape[1] - n, gain[-1])])
    k = int(ahead * RATE)
    gain = np.concatenate([gain[k:], np.full(k, gain[-1])])
    return x * gain


def limit(x, ceiling=10 ** (-2.5 / 20)):
    """Every sample under the ceiling: the needed gain's minimum over the next 5 ms,
    averaged over 5 ms, released over 80 ms (as render.mjs)."""
    from scipy.ndimage import minimum_filter1d
    L = int(round(0.005 * RATE))
    need = np.minimum(1, ceiling / np.maximum(np.abs(x).max(0), 1e-9))
    ahead = minimum_filter1d(need, L, origin=-(L // 2), mode='nearest')
    c = np.concatenate([np.full(L, 1.0), ahead])
    avg = (np.cumsum(c)[L:] - np.cumsum(c)[:-L]) / L
    rel = 1 - np.exp(-1 / (0.08 * RATE))
    g, out, most, busy = 1.0, np.empty_like(avg), 1.0, 0
    for i, a in enumerate(avg.tolist()):
        g = min(a, g + (1 - g) * rel)
        out[i] = g
    x *= out
    return 20 * np.log10(out.min()), float((out < 0.8).sum() / RATE)


def wav(path, x):
    sf.write(path, x.T.astype(np.float32), RATE, subtype='PCM_24')


def ebur128(path):
    try:
        p = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                           capture_output=True, text=True)
    except FileNotFoundError:
        return None
    tail = p.stderr[p.stderr.rfind('Summary:'):]
    i = re.search(r'I:\s+(-?[\d.]+) LUFS', tail)
    tp = re.search(r'Peak:\s+(-?[\d.]+) dBFS', tail)
    return (float(i.group(1)), float(tp.group(1))) if i else None


def rms(x):
    return float(np.sqrt((x ** 2).mean()))
