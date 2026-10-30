#!/usr/bin/env python
"""Sampled instruments for the game's music, fetched from the web the first time they're
used and checked by their sha256 (samples.json: where each file is, pinned to one commit,
and its hash). All CC0. They land in local/audio-src/samples/<set>/ (gitignored); nothing
sampled is committed but what a render makes of them.

    .venv-audio/Scripts/python -I scripts/sound/samples.py            # every set, here or not
    .venv-audio/Scripts/python -I scripts/sound/samples.py get piano  # fetch these now

    from samples import folder, load
    load('piano', 'Player_dyn1_rr1_010.wav')   # (2, n) float at 48 kHz

A proxy is taken from HTTPS_PROXY. The files are only read as audio.
"""
import hashlib
import json
import os
import sys
import urllib.parse
import urllib.request

import numpy as np
import scipy.signal as ss
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
with open(os.path.join(HERE, 'samples.json'), encoding='utf8') as f:
    SETS = json.load(f)
CACHE = os.path.join(ROOT, 'local', 'audio-src', 'samples')
RATE = 48000


def url(name, f):
    s = SETS[name]
    return s['url'] if 'url' in s else s['base'] + urllib.parse.quote(f"{s['dir']}/{f}")


def folder(name):
    """The set's folder, every file in it present and checked."""
    d = os.path.join(CACHE, name)
    for f, sha in SETS[name]['files'].items():
        p = os.path.join(d, f)
        if os.path.exists(p):
            continue
        os.makedirs(d, exist_ok=True)
        print(f'fetching {name}/{f}', file=sys.stderr, flush=True)
        req = urllib.request.Request(url(name, f), headers={'User-Agent': 'moyu samples.py'})
        b = urllib.request.urlopen(req, timeout=120).read()
        if hashlib.sha256(b).hexdigest() != sha:
            raise IOError(f'{name}/{f}: not the file samples.json names ({url(name, f)})')
        with open(p + '.tmp', 'wb') as out:
            out.write(b)
        os.replace(p + '.tmp', p)
    return d


_loaded = {}


def load(name, f=None):
    """One file of a set as (2, n) float at 48 kHz (the only file when f is None)."""
    if f is None:
        (f,) = SETS[name]['files']
    key = (name, f)
    if key not in _loaded:
        x, rate = sf.read(os.path.join(folder(name), f), always_2d=True)
        x = x.T
        if x.shape[0] == 1:
            x = np.vstack([x, x])
        if rate != RATE:
            g = np.gcd(RATE, rate)
            x = ss.resample_poly(x, RATE // g, rate // g, axis=1)
        _loaded[key] = x
    return _loaded[key]


if __name__ == '__main__':
    if sys.argv[1:2] == ['get']:
        for name in (SETS if sys.argv[2:] == ['all'] else sys.argv[2:]):
            folder(name)
    for name, s in SETS.items():
        here = all(os.path.exists(os.path.join(CACHE, name, f)) for f in s['files'])
        print(f"{'here' if here else '    '}  {name:12s} {len(s['files']):3d} files  {s['title']}  ({s['license']}, {s['page']})")
