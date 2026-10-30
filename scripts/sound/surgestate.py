"""Surge XT patches (.fxp) as VST3 plugin state, so DawDreamer can load them.

DawDreamer's load_preset doesn't read Surge's .fxp files. Surge's own plugin state is the
patch data without the .fxp header, and the VST3 wrapper (JUCE) stores that state as an
XML document with JUCE's base64 inside. This builds that document from a patch.
"""

TABLE = '.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+'
FXP_HEADER = 60  # CcnK, size, FPCh, version, fxID, fxVersion, numPrograms, name[28], chunk size


def juce_b64(data: bytes) -> str:
    n = int.from_bytes(data, 'little')
    chars = ((len(data) * 8) + 5) // 6
    return f'{len(data)}.' + ''.join(TABLE[(n >> (6 * i)) & 63] for i in range(chars))


def juce_unb64(text: str) -> bytes:
    size, body = text.split('.', 1)
    n = 0
    for i, c in enumerate(body):
        n |= TABLE.index(c) << (6 * i)
    return n.to_bytes(int(size), 'little')


def state_from_fxp(fxp: bytes) -> bytes:
    assert fxp[:4] == b'CcnK' and fxp[16:20] == b'cjs3', 'not a Surge patch'
    patch = fxp[FXP_HEADER:]
    xml = ('<?xml version="1.0" encoding="UTF-8"?> <VST3PluginState><IComponent>'
           + juce_b64(patch) + '</IComponent></VST3PluginState>').encode()
    # the wrapper's header: a magic and the XML's length, then the XML and a NUL
    return b'VC2!' + len(xml).to_bytes(4, 'little') + xml + b'\0'
