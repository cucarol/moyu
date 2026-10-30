# The cut: the parts (render.sh) end to end. Most cuts are a 0.2 s crossfade (the two sides show
# the same frame on the same screen, only the scenes' grades differ). Machine room to dusk is a
# hard cut into a shrink: the room's last half second (its render runs that much past its PARTS
# dur) scales down from the whole frame into the game's window on dusk's laptop (WIN, where dusk's
# opening frame shows it), over dusk's first frames. The end card screened over the last END s.
# The sound: each part's own (the rooms and the games where they play, Clawd's voice), with
# the score's two stems over the whole cut (pv/score/render.mjs: the music, the effects), the
# lot brought to LUFS.
#   python pv/cut/join.py zh|en
import subprocess, sys, os, glob, json
from PIL import Image
L = sys.argv[1] if len(sys.argv) > 1 else 'zh'
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
O = os.path.join(ROOT, 'renders', 'pv-cut2')
FPS = 30
# (part, its mp4, length, the crossfade into it) in film order: story.js PARTS
PARTS = [('noon', 'cubicle', 11.0, None), ('machine', 'b-machine', 18.6, 0.2), ('dusk', 'cubicle', 6.25, 0),
         ('raft', 'c-raft', 20.6, 0.2), ('yacht', 'd-night', 25.2, 0.2)]
SHRINK = 0.5  # the machine room into the window, s
WIN = (147, 151, 858, 483)  # the window's picture in dusk's opening frame: x, y, w, h (frame pixels)
END = 5.0  # the end card, over the last of the yacht part
BLUR = {'yacht'}  # rendered at 60 fps for motion blur (render.sh)
SCORE = os.path.join(ROOT, 'renders', 'pv-score')
MUSIC, SFX = 5.0, 0.0  # the score's stems against the parts' sound, dB
LUFS = -14


def shrink():
    """dusk's first SHRINK s with the machine room's last SHRINK s shrinking into the window; a
    folder of frames"""
    mf = sorted(glob.glob(os.path.join(O, f'machine-{L}', 'frames', '*.png')))
    df = sorted(glob.glob(os.path.join(O, f'dusk-{L}', 'frames', '*.png')))
    n = round(SHRINK * FPS)
    out = os.path.join(O, f'dusk-{L}', 'shrink')
    os.makedirs(out, exist_ok=True)
    for i in range(n):
        k = i / n
        e = 4 * k ** 3 if k < 0.5 else 1 - (-2 * k + 2) ** 3 / 2
        x, y, w, h = WIN
        box = (round(x * e), round(y * e), round(1920 + (w - 1920) * e), round(1080 + (h - 1080) * e))
        base = Image.open(df[i]).convert('RGB')
        m = Image.open(mf[len(mf) - n + i]).convert('RGB').resize(box[2:], Image.LANCZOS)
        # the last few frames give way to the window's own picture under it
        a = min(1, (n - 1 - i) / 3)
        layer = base.crop((box[0], box[1], box[0] + box[2], box[1] + box[3]))
        base.paste(Image.blend(layer, m, a), box[:2])
        base.save(os.path.join(out, f'{i:05d}.png'))
    return out, n


sdir, sn = shrink()
ins, f = [], []
for i, (p, name, d, _) in enumerate(PARTS):
    ins += ['-i', os.path.join(O, f'{p}-{L}', f'{name}.mp4')]
    # a part rendered at 60 fps (render.sh: the yacht) has each pair of frames blended into one:
    # motion blur, a 180 degree shutter
    blur = 'tmix=frames=2,' if p in BLUR else ''
    f.append(f'[{i}:v]{blur}fps={FPS},scale=1920:1080,setsar=1,trim=0:{d},setpts=PTS-STARTPTS,format=yuv420p,settb=1/{FPS}[w{i}]')
ins += ['-i', os.path.join(O, f'end-{L}', 'endcard.mp4')]
e = len(PARTS)
ins += ['-framerate', str(FPS), '-i', os.path.join(sdir, '%05d.png')]
# dusk: the shrink, then the rest of its render
dk = [p for p, *_ in PARTS].index('dusk')
f.append(f'[{e + 1}:v]setsar=1,format=yuv420p,settb=1/{FPS}[sh]')
f.append(f'[w{dk}]trim=start_frame={sn},setpts=PTS-STARTPTS[dr]')
f.append(f'[sh][dr]concat=n=2:v=1:a=0,settb=1/{FPS}[v{dk}]')
for i in range(e):
    if i != dk:
        f.append(f'[w{i}]null[v{i}]')
y = e - 1
dy = PARTS[y][2]
# the end card screened over the yacht part's end
f.append(f'[v{y}]split[y0][y9]')
f.append(f'[y9]trim={dy - END}:{dy},setpts=PTS-STARTPTS,format=gbrp[y2]')
f.append(f'[{e}:v]fps={FPS},scale=1920:1080,setsar=1,trim=0:{END},setpts=PTS-STARTPTS,format=gbrp[ec]')
f.append('[y2][ec]blend=all_mode=screen,format=yuv420p[y2e]')
f.append(f'[y0]trim=0:{dy - END},setpts=PTS-STARTPTS[y1]')
f.append(f'[y1][y2e]concat=n=2:v=1:a=0,settb=1/{FPS}[vy]')
# the cuts, and where each part starts on the cut's clock
starts, cur, length = [0.0], 'v0', PARTS[0][2]
for i in range(1, e):
    nxt = 'vy' if i == y else f'v{i}'
    x = PARTS[i][3]
    off = length - x
    starts.append(off)
    if x:
        f.append(f'[{cur}][{nxt}]xfade=transition=fade:duration={x}:offset={off:.3f}[x{i}]')
    else:
        f.append(f'[{cur}][{nxt}]concat=n=2:v=1:a=0,settb=1/{FPS}[x{i}]')
    cur, length = f'x{i}', off + PARTS[i][2]
f.append(f'[{cur}]fade=t=out:st={length - 1:.3f}:d=1[v]')

# the sound: each part's own (the desk's: Clawd's voice), laid at its start (the machine room's
# runs on under the shrink), and the score's stems
a, mix = [], []
for i, (p, name, d, _) in enumerate(PARTS):
    ms = int(round(starts[i] * 1000))
    ad = d + (SHRINK if p == 'machine' else 0)
    a.append(f'[{i}:a]aresample=48000,atrim=0:{ad},asetpts=PTS-STARTPTS,adelay={ms}|{ms}[a{i}]')
    mix.append(f'[a{i}]')
k = len(PARTS)
for j, (stem, db) in enumerate([('music', MUSIC), ('sfx', SFX)]):
    a.append(f'[{k + j}:a]aresample=48000,volume={db}dB[s{j}]')
    mix.append(f'[s{j}]')
a.append(f'anullsrc=r=48000:cl=stereo,atrim=0:{length:.3f}[sil]')
a.append(f"[sil]{''.join(mix)}amix=inputs={len(mix) + 1}:normalize=0:duration=first[a]")
ains = [x for p, name, *_ in PARTS for x in ('-i', os.path.join(O, f'{p}-{L}', f'{name}.mp4'))]
ains += ['-i', os.path.join(SCORE, 'music.wav'), '-i', os.path.join(SCORE, 'sfx.wav')]
wav = os.path.join(O, f'moyu-pv-{L}-mix.wav')
subprocess.run(['ffmpeg', '-v', 'error', '-y', *ains, '-filter_complex', ';'.join(a), '-map', '[a]', '-c:a', 'pcm_f32le', wav], check=True)
# brought to LUFS: measured, then one gain for the whole, a limiter catching the few peaks
# that go over (the live round)
r = subprocess.run(['ffmpeg', '-hide_banner', '-i', wav, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], capture_output=True, text=True)
m = json.loads(r.stderr[r.stderr.rindex('{'):r.stderr.rindex('}') + 1])
gain = LUFS - float(m['input_i']) + 1.0  # (the limiter takes a little back)
norm = f'volume={gain:.2f}dB,alimiter=limit=0.75:attack=3:release=80:level=false,afade=t=out:st={length - 1:.3f}:d=1'
out = os.path.join(O, f'moyu-pv-{L}.mp4')
subprocess.run(['ffmpeg', '-v', 'error', '-y', *ins, '-i', wav, '-filter_complex', ';'.join(f) + f';[{e + 2}:a]{norm}[a]', '-map', '[v]', '-map', '[a]',
                '-c:v', 'h264_nvenc', '-preset', 'p7', '-tune', 'hq', '-rc', 'vbr', '-cq', '17', '-b:v', '0', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-b:a', '256k', out], check=True)
print(f"sound as mixed {m['input_i']} LUFS, true peak {m['input_tp']} dBTP")
prev = os.path.join(O, f'moyu-pv-{L}-preview.mp4')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', out, '-vf', 'scale=1280:-2', '-c:v', 'h264_nvenc', '-preset', 'p7', '-rc', 'vbr', '-cq', '24', '-b:v', '0', '-c:a', 'aac', '-b:a', '160k', prev], check=True)
print(out, f'{length:.2f} s')
print('cuts at', ', '.join(f'{s:.2f}' for s in starts[1:]))
