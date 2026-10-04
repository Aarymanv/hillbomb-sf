# Pack engine families: tilt-correct (zero-phase circular EQ keeps loops seamless), loudness-normalise,
# write sprite mp3 [pad][loop][pad]... and a JSON block for the audio manifest.
import numpy as np, json, os, sys, math
import loopkit as lk
from tilt import tilt

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'assets', 'audio', 'engines')
SR = 44100
PAD = 0.12
TARGET_LUFS = -20.0
# per family tilt target: (F_lo, tilt_lo, F_hi, tilt_hi) interpolated in log F; None = no tilt correction
TILT = {
    'flat4': None,
    'v10': (110, -5.5, 320, -4.0),
    'v8': (60, -7.5, 470, -4.0),
    'diesel': (20, -3.5, 70, -4.5),
    'bus': (30, -3.0, 70, -4.5),
}
# extra fixed EQ per family: list of (f_lo, f_hi, dB) band gains applied circularly (smooth edges)
EQ = {
    'v8': [(1500, 20000, -1.5)],
    'v10': [],
    'flat4': [],
    'diesel': [(25, 60, -2)],
    'bus': [],
}

def circ_eq(x, gain_fn):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X * gain_fn(f), len(x))

def tilt_gain(delta_db_oct, pivot=400.0, lo=120.0, cap=10.0):
    def g(f):
        oct_ = np.log2(np.maximum(f, lo) / pivot)
        db = np.clip(delta_db_oct * oct_, -cap, cap)
        db[f < 40] = db[f < 40] * (f[f < 40] / 40)
        return 10 ** (db / 20)
    return g

def band_gain(bands):
    def g(f):
        db = np.zeros_like(f)
        for a, b, v in bands:
            w = 1 / (1 + np.exp(-(np.log2(np.maximum(f, 1) / a)) * 8)) * (1 / (1 + np.exp((np.log2(np.maximum(f, 1) / b)) * 8)))
            db += v * w
        return 10 ** (db / 20)
    return g

def pack(fam):
    info = json.load(open(f'fam/{fam}/info.json')); L = np.load(f'fam/{fam}/loops.npz')
    loops, meta = [], []
    for i, l in enumerate(info['loops']):
        x = L[f'arr_{i}'].copy()
        x -= x.mean()
        k0, _ = tilt(x)
        T = TILT.get(fam)
        corr = 0.0
        if T:
            u = np.clip((math.log(l['F']) - math.log(T[0])) / (math.log(T[2]) - math.log(T[0])), 0, 1)
            target = T[1] + (T[3] - T[1]) * u
            corr = float(np.clip(target - k0, -5, 5))
            x = circ_eq(x, tilt_gain(corr))
        if EQ.get(fam): x = circ_eq(x, band_gain(EQ[fam]))
        k1, _ = tilt(x)
        orig = lk.lufs(np.tile(L[f'arr_{i}'], 4))
        g = TARGET_LUFS - lk.lufs(np.tile(x, 4))
        x = x * 10 ** (g / 20)
        pk = np.abs(x).max()
        if pk > 0.89: x *= 0.89 / pk
        loops.append(x)
        meta.append(dict(id=l['id'], load=l['load'], F=l['F'], dur=round(len(x) / SR, 5), srcLufs=round(orig, 1), tilt=round(k1, 2), tiltCorr=round(corr, 2), src=l['src']))
    # sprite
    P = int(PAD * SR); parts = []; pos = 0
    for x, m in zip(loops, meta):
        seg = np.concatenate([x[-P:], x, x[:P]])
        m['start'] = round((pos + P) / SR, 6); m['end'] = round((pos + P + len(x)) / SR, 6)
        parts.append(seg); pos += len(seg)
    sprite = np.concatenate(parts)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'{fam}.mp3')
    size = lk.encode(sprite, path, SR, kbps=128)
    # verify decode length / offset (encoder priming) against the sprite
    dec = lk.load(path, SR)
    c = np.correlate(dec[:SR], sprite[:SR // 2], 'valid'); off = int(np.argmax(c))
    print(f'{fam}: {len(meta)} loops, {len(sprite)/SR:.2f}s, {size/1024:.0f} KB, decode offset {off} samples')
    for m in meta: print('   ', m)
    return dict(file=f'engines/{fam}.mp3', cyl=info['cyl'], loops=meta, sources=info['sources'], bytes=size)

if __name__ == '__main__':
    fams = sys.argv[1:] or ['flat4', 'v10', 'v8', 'diesel', 'bus']
    out = {}
    if os.path.exists(os.path.join('fragments','engines_manifest.json')): out = json.load(open(os.path.join('fragments','engines_manifest.json')))
    for f in fams: out[f] = pack(f)
    json.dump(out, open(os.path.join('fragments','engines_manifest.json'), 'w'), indent=1)
