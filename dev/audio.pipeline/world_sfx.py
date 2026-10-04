# World sound pass (10/1): district beds, road surfaces, Muni / cable car one-shots, footsteps.
# All sources Freesound CC0 (verified by fs.py get). Writes public/assets/audio/{amb,loops,sfx}/... and fragments/world_fragment.json
import numpy as np, json, os, loopkit as lk
SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(HERE, '..', '..', 'public', 'assets', 'audio')
M = json.load(open(os.path.join(HERE, 'fragments', 'freesound_meta.json'), encoding='utf8'))
out = []

def src(sid, mono=True):
    return lk.load(os.path.join(HERE, 'src', f'{sid}.mp3'), SR, mono=mono)
def credit(sid):
    m = M[str(sid)]
    return [dict(site='freesound', id=sid, page=m['url'], file=m['hq'], title=m['title'], author=m['author'], license='CC0 1.0')]
def mom_max(x): return lk.short_term_max(x if x.ndim == 1 else x.mean(axis=1), SR, win=0.4)
def emit_shot(key, variant, x, rel, kbps, notes, sid, target=-16.0):
    y = lk.gain_db(x, target - mom_max(x))
    if lk.peak_db(y) > -1: y = lk.gain_db(y, -1 - lk.peak_db(y))
    path = os.path.join(PUB, *rel.split('/')); lk.encode(y, path, SR, kbps)
    d = lk.load(path, SR, mono=False)
    out.append(dict(key=key, variant=variant, file=rel, kind='shot', channels=1 if d.ndim == 1 else 2, duration=round(len(d) / SR, 3),
                    lufs=round(mom_max(d), 2), peak=round(lk.peak_db(d), 2), sources=credit(sid), notes=notes))
    print(rel, out[-1]['lufs'], out[-1]['peak'], out[-1]['duration'], os.path.getsize(path))
def limit(x, ceil_db):
    # vectorised look-ahead peak limiter: per-sample needed gain, 6 ms running minimum, 6 ms smoothing (both channels linked)
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    a = np.abs(x) if x.ndim == 1 else np.abs(x).max(axis=1)
    need = np.minimum(1.0, 10 ** (ceil_db / 20) / np.maximum(a, 1e-9))
    w = int(0.006 * SR)
    g = uniform_filter1d(minimum_filter1d(need, 2 * w + 1), 2 * w + 1)
    g = np.minimum(g, minimum_filter1d(need, 3))  # never let a sample through above the ceiling
    return x * (g if x.ndim == 1 else g[:, None])
def emit_loop(key, x, rel, kbps, notes, sid, L_s, xf_s=2.0, target=-20.0):
    L, xf = int(L_s * SR), int(xf_s * SR)
    loop = lk.xfade_loop(x[:L + xf], L, xf)
    loop = lk.highpass(loop, 30) if loop.ndim == 1 else np.stack([lk.highpass(loop[:, c], 30) for c in range(loop.shape[1])], 1)
    g = target - lk.lufs(loop if loop.ndim == 1 else loop.mean(axis=1), SR)
    loop = limit(lk.gain_db(loop, g), -3.5)
    pad, P = lk.padded(loop, SR)
    path = os.path.join(PUB, *rel.split('/')); lk.encode(pad, path, SR, kbps)
    d = lk.load(path, SR, mono=False)
    out.append(dict(key=key, variant=0, file=rel, kind='loop', channels=1 if d.ndim == 1 else 2, duration=round(len(d) / SR, 3),
                    loopStart=round(P / SR, 4), loopEnd=round((P + L) / SR, 4), lufs=round(lk.lufs(loop if loop.ndim == 1 else loop.mean(axis=1), SR), 2),
                    peak=round(lk.peak_db(loop), 2), sources=credit(sid), notes=notes))
    print(rel, out[-1]['lufs'], out[-1]['peak'], out[-1]['duration'], os.path.getsize(path))

def onsets(x, min_gap=0.28, thr_db=-30):
    # step onsets: 10 ms energy envelope, rising edges above the median by 12 dB
    hp = lk.highpass(x, 120)
    h = int(0.005 * SR); n = len(hp) // h
    e = 10 * np.log10(np.array([np.mean(hp[i * h:(i + 1) * h] ** 2) for i in range(n)]) + 1e-12)
    med = np.median(e); top = e.max()
    res, last = [], -9
    for i in range(2, n - 1):
        t = i * h / SR
        if e[i] > max(med + 12, top + thr_db) and e[i] - e[i - 2] > 8 and t - last > min_gap:
            res.append(t); last = t
    return res
def cut_steps(x, ts, n, length=0.32):
    seg = []
    for t in ts:
        a = int(max(0, t - 0.01) * SR); y = x[a:a + int(length * SR)]
        if len(y) < int(length * SR): continue
        pk = np.abs(y).max()
        seg.append((pk, y))
    seg.sort(key=lambda s: -s[0])
    pick = [s[1] for s in seg[2:2 + n]] if len(seg) > n + 3 else [s[1] for s in seg[:n]]  # skip the two hardest scuffs
    res = []
    for y in pick:
        y = y * np.exp(-np.maximum(0, np.arange(len(y)) / SR - 0.12) / 0.05)
        res.append(lk.fade(lk.highpass(y, 90), 0.002, 0.03))
    return res

# ---- Chinatown / night market bed: people talking, walking, cooking, light traffic (40 s from 285 s)
x = src(718917, mono=False)
emit_loop('amb_night_market', x[int(285 * SR):int(327 * SR)], 'amb/amb_night_market.mp3', 96,
          'night market at the street side (crowd, chatter, cooking, light traffic) | 285-325 s, 2 s equal-power loop seam', 718917, 40)
# ---- indoor walla (museum gallery: soft voices, steps) for landmark interiors
x = src(563379, mono=False)
emit_loop('amb_indoor_walla', x[:int(34 * SR)], 'amb/amb_indoor_walla.mp3', 80,
          'museum gallery, soft walla + distant steps | 0-32 s, 2 s loop seam', 563379, 32)
# ---- cobblestone / brick roll (Lombard's red brick): steady 10 s from 6 s
x = src(591078)
emit_loop('road_cobble', x[int(6 * SR):int(18 * SR)], 'loops/road_cobble.mp3', 96,
          'car rolling on cobblestones, tyre + body rattle | 6-16 s, 1.5 s loop seam', 591078, 10, xf_s=1.5)
# ---- Muni streetcar on Market (real F-line PCC car at 5th St), whole 21 s pass
x = src(237501, mono=False)
x = lk.fade(x[:int(21.2 * SR)], 0.5, 1.5)
emit_shot('muni_tram', 0, np.stack([lk.highpass(x[:, c], 40) for c in range(2)], 1), 'amb/muni_tram.mp3', 96,
          'F-line streetcar passing on Market St at 5th (San Francisco) | full pass, 0.5 s / 1.5 s fades', 237501, target=-16)
# ---- cable car pulling away (grip + cable clatter, bell), 8-28 s
x = src(238230, mono=False)
x = lk.fade(x[int(8 * SR):int(28 * SR)], 0.8, 2.0)
emit_shot('cablecar_go', 0, np.stack([lk.highpass(x[:, c], 40) for c in range(2)], 1), 'amb/cablecar_go.mp3', 96,
          'San Francisco cable car leaving a stop: grip, cable slot clatter | 8-28 s', 238230, target=-16)
# ---- footsteps: hard soles on concrete (459964) and on a wooden floor in a hall (155858)
x = src(459964)
for i, y in enumerate(cut_steps(x, onsets(x), 6)):
    emit_shot('foot_concrete', i, y, f'sfx/foot_concrete_{i + 1}.mp3', 64, 'single footstep, 0.32 s gated', 459964, target=-18)
x = src(155858)
ts = [t for t in onsets(x) if t < 50]
for i, y in enumerate(cut_steps(x, ts, 6)):
    emit_shot('foot_hall', i, y, f'sfx/foot_hall_{i + 1}.mp3', 64, 'single footstep in a factory hall (wood/concrete), 0.32 s gated', 155858, target=-18)

json.dump(out, open(os.path.join(HERE, 'fragments', 'world_fragment.json'), 'w', encoding='utf8'), indent=1)
print('total bytes', sum(os.path.getsize(os.path.join(PUB, *o['file'].split('/'))) for o in out))
