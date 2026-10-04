# Shared audio processing helpers for HILLBOMB assets (decode, loudness, loops, one-shots, encode, analysis).
import subprocess, os, json, math
import numpy as np
from scipy import signal

SR = 44100

def load(path, sr=SR, mono=True, start=None, dur=None):
    cmd = ['ffmpeg', '-v', 'error']
    if start is not None: cmd += ['-ss', str(start)]
    if dur is not None: cmd += ['-t', str(dur)]
    cmd += ['-i', path, '-f', 'f32le', '-acodec', 'pcm_f32le', '-ar', str(sr), '-ac', '1' if mono else '2', '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    if not mono: x = x.reshape(-1, 2)
    return x

def _kw(sr):
    # BS.1770 K-weighting (pre-filter shelf + RLB high-pass), coefficients re-derived for sr
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    K = math.tan(math.pi * f0 / sr); Vh = 10 ** (G / 20); Vb = Vh ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    b1 = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0]
    a1 = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    f0, Q = 38.13547087602444, 0.5003270373238773
    K = math.tan(math.pi * f0 / sr)
    b2 = [1, -2, 1]
    a2 = [1, 2 * (K * K - 1) / (1 + K / Q + K * K), (1 - K / Q + K * K) / (1 + K / Q + K * K)]
    return (b1, a1), (b2, a2)

def lufs(x, sr=SR, gated=True):
    """integrated loudness (BS.1770-4). x: mono (n,) or stereo (n,2)"""
    X = x if x.ndim == 2 else x[:, None]
    (b1, a1), (b2, a2) = _kw(sr)
    Y = signal.lfilter(b2, a2, signal.lfilter(b1, a1, X, axis=0), axis=0)
    blk, hop = int(0.4 * sr), int(0.1 * sr)
    if len(Y) < blk:
        z = np.mean(np.sum(Y ** 2, axis=1) if False else Y ** 2, axis=0).sum()
        return -0.691 + 10 * math.log10(max(z, 1e-12))
    zs = []
    for i in range(0, len(Y) - blk + 1, hop):
        zs.append(np.mean(Y[i:i + blk] ** 2, axis=0).sum())
    zs = np.array(zs)
    l = -0.691 + 10 * np.log10(np.maximum(zs, 1e-12))
    if not gated: return float(-0.691 + 10 * np.log10(max(zs.mean(), 1e-12)))
    zs1 = zs[l > -70]
    if not len(zs1): return -70.0
    rel = -0.691 + 10 * math.log10(zs1.mean()) - 10
    zs2 = zs[(l > -70) & (l > rel)]
    return float(-0.691 + 10 * math.log10(max(zs2.mean(), 1e-12)))

def short_term_max(x, sr=SR, win=3.0):
    X = x if x.ndim == 2 else x[:, None]
    (b1, a1), (b2, a2) = _kw(sr)
    Y = signal.lfilter(b2, a2, signal.lfilter(b1, a1, X, axis=0), axis=0)
    blk, hop = int(win * sr), int(0.1 * sr)
    best = -120
    for i in range(0, max(1, len(Y) - blk + 1), hop):
        z = np.mean(Y[i:i + blk] ** 2, axis=0).sum()
        best = max(best, -0.691 + 10 * math.log10(max(z, 1e-12)))
    return best

def peak_db(x):
    p = float(np.max(np.abs(x))) if len(x) else 0
    return 20 * math.log10(p) if p > 1e-9 else -120

def gain_db(x, db): return x * (10 ** (db / 20))

def normalize(x, sr=SR, target=-18.0, ceiling=-1.0, mode='lufs'):
    if mode == 'lufs':
        g = target - lufs(x, sr)
    else:
        g = target - peak_db(x)
    y = gain_db(x, g)
    over = peak_db(y) - ceiling
    if over > 0: y = gain_db(y, -over)
    return y

def highpass(x, f, sr=SR, order=2):
    sos = signal.butter(order, f, 'highpass', fs=sr, output='sos'); return signal.sosfiltfilt(sos, x, axis=0)
def lowpass(x, f, sr=SR, order=2):
    sos = signal.butter(order, f, 'lowpass', fs=sr, output='sos'); return signal.sosfiltfilt(sos, x, axis=0)

def fade(x, fin=0.002, fout=0.01, sr=SR):
    y = x.copy(); n1, n2 = int(fin * sr), int(fout * sr)
    if n1 > 0: y[:n1] *= (np.linspace(0, 1, n1) ** 2)[:, None] if y.ndim == 2 else np.linspace(0, 1, n1) ** 2
    if n2 > 0: y[-n2:] *= (np.linspace(1, 0, n2) ** 2)[:, None] if y.ndim == 2 else np.linspace(1, 0, n2) ** 2
    return y

def trim(x, sr=SR, thresh_db=-50, pre=0.005, post=0.05):
    env = np.abs(x if x.ndim == 1 else x.max(axis=1))
    thr = 10 ** (thresh_db / 20) * max(1e-9, env.max())
    idx = np.where(env > thr)[0]
    if not len(idx): return x
    a = max(0, idx[0] - int(pre * sr)); b = min(len(x), idx[-1] + int(post * sr))
    return x[a:b]

def xfade_loop(seg, L, xf):
    """seg has >= L + xf samples; returns a periodic loop of length L (end flows into start)"""
    assert len(seg) >= L + xf, (len(seg), L, xf)
    out = seg[:L].copy()
    t = np.linspace(0, 1, xf)
    fi, fo = np.sin(t * np.pi / 2), np.cos(t * np.pi / 2)  # equal power (uncorrelated material)
    if seg.ndim == 2: fi, fo = fi[:, None], fo[:, None]
    out[:xf] = seg[L:L + xf] * fo + seg[:xf] * fi
    return out

def xfade_loop_linear(seg, L, xf):
    """same but linear (for correlated, phase-aligned material like engine cycles)"""
    out = seg[:L].copy(); t = np.linspace(0, 1, xf)
    if seg.ndim == 2: t = t[:, None]
    out[:xf] = seg[L:L + xf] * (1 - t) + seg[:xf] * t
    return out

def padded(loop, sr=SR, pad=0.25):
    """[tail][loop][head]: any window of len(loop) inside is seamless, so decoder priming offsets don't matter"""
    P = min(int(pad * sr), len(loop))
    return np.concatenate([loop[-P:], loop, loop[:P]]), P

def encode(x, path, sr=SR, kbps=96, fmt=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    ch = 1 if x.ndim == 1 else x.shape[1]
    fmt = fmt or os.path.splitext(path)[1][1:]
    data = np.clip(x, -1, 1).astype(np.float32).tobytes()
    cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(sr), '-ac', str(ch), '-i', '-']
    if fmt == 'mp3': cmd += ['-c:a', 'libmp3lame', '-b:a', f'{kbps}k', '-ar', str(sr)]
    elif fmt == 'm4a': cmd += ['-c:a', 'aac', '-b:a', f'{kbps}k', '-movflags', '+faststart']
    else: raise ValueError(fmt)
    cmd += [path]
    subprocess.run(cmd, input=data, check=True)
    return os.path.getsize(path)

def clicks(x, sr=SR, k=8.0):
    """count sample-to-sample jumps that are k x larger than the local median jump (discontinuities)"""
    d = np.abs(np.diff(x if x.ndim == 1 else x[:, 0]))
    med = signal.medfilt(d, 101) + 1e-6
    return int(np.sum(d > k * med * 4 + 0.05))

def spectrogram_png(x, path, sr=SR, title='', fmax=8000, nfft=4096):
    import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
    y = x if x.ndim == 1 else x.mean(axis=1)
    f, t, S = signal.spectrogram(y, sr, nperseg=nfft, noverlap=nfft * 3 // 4)
    plt.figure(figsize=(12, 4.5)); plt.pcolormesh(t, f, 10 * np.log10(S + 1e-12), shading='auto', vmin=-110, vmax=-20, cmap='magma')
    plt.ylim(0, fmax); plt.title(title); plt.xlabel('s'); plt.ylabel('Hz'); plt.colorbar(); plt.tight_layout(); plt.savefig(path, dpi=80); plt.close()

def f0_track(x, sr=SR, fmin=20, fmax=600, hop=0.05, win=0.2):
    """autocorrelation f0 track (for engine firing frequency). returns times, f0, clarity"""
    n, h = int(win * sr), int(hop * sr)
    ts, fs, cs = [], [], []
    lo, hi = int(sr / fmax), int(sr / fmin)
    w = np.hanning(n)
    for i in range(0, len(x) - n, h):
        s = x[i:i + n] * w
        s = s - s.mean()
        F = np.fft.rfft(s, 2 * n)
        ac = np.fft.irfft(np.abs(F) ** 2)[:n]
        if ac[0] <= 0: ts.append(i / sr); fs.append(0); cs.append(0); continue
        ac = ac / ac[0]
        seg = ac[lo:hi]
        k = int(np.argmax(seg)) + lo
        # parabolic interpolation
        if 1 <= k < len(ac) - 1:
            a, b, c = ac[k - 1], ac[k], ac[k + 1]
            p = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0
        else: p = 0
        ts.append((i + n / 2) / sr); fs.append(sr / (k + p)); cs.append(float(ac[k]))
    return np.array(ts), np.array(fs), np.array(cs)
