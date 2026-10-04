import os
import numpy as np, json, loopkit as lk
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'assets', 'audio')
SR = 44100
picks = [('passby', 237337, 8.2), ('passby', 237338, 19.1), ('passby', 553259, 3.9), ('passby', 128124, 5.3), ('passby', 441881, 29.7), ('passby', 180324, 42.3), ('passby', 180324, 63.0), ('passby_wet', 462862, 2.5)]
M = json.load(open(os.path.join('fragments','freesound_meta.json'), encoding='utf8'))
res = {}
count = {}
for key, sid, pk in picks:
    x = lk.load(f'src/{sid}.mp3', SR)
    # refine peak within +-0.6 s
    a0, b0 = int((pk - 0.6) * SR), int((pk + 0.6) * SR)
    env = np.convolve(x[a0:b0] ** 2, np.ones(2205) / 2205, 'same')
    p = (a0 + int(np.argmax(env))) / SR
    pre, post = 2.8, 2.2
    a, b = max(0, int((p - pre) * SR)), min(len(x), int((p + post) * SR))
    y = x[a:b]; peak_t = p - a / SR
    y = lk.highpass(y, 35)
    y = lk.fade(y, 0.35, 0.45)
    core = y[int((peak_t - 0.6) * SR): int((peak_t + 0.6) * SR)]
    g = -15 - lk.lufs(core, SR, gated=False)
    y = y * 10 ** (g / 20)
    if np.abs(y).max() > 0.89: y *= 0.89 / np.abs(y).max()
    count[key] = count.get(key, 0) + 1
    f = f'sfx/{key}_{count[key]}.mp3'
    size = lk.encode(y, os.path.join(OUT, *f.split('/')), SR, 96)
    m = M[str(sid)]
    res.setdefault(key, []).append(dict(file=f, peak=round(peak_t, 3), dur=round(len(y) / SR, 3), lufsCore=-15, src=[dict(site='freesound', id=sid, page=m['url'], file=m['hq'], title=m['title'], author=m['author'], license='CC0 1.0')]))
    print(key, sid, f, f'peak@{peak_t:.2f}s', size, 'bytes')
json.dump(res, open(os.path.join('fragments','passby_manifest.json'), 'w'), indent=1)
