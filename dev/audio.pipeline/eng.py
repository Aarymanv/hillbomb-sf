# Engine sample pipeline: ridge-track an engine order through a sweep, de-chirp windows to constant pitch,
# cut cycle-aligned seamless loops, and pack them into a per-family sprite.
import numpy as np, json, os, math
from scipy import signal
import loopkit as lk

SR = 44100

def stft_mag(x, sr, nper=8192, hop=220):
    f, t, Z = signal.stft(x, sr, nperseg=nper, noverlap=nper - hop, boundary=None, padded=False)
    return f, t, np.abs(Z)

def track(x, sr, seed_t, seed_f, t0=None, t1=None, tol=0.05, nper=8192, hop=220, smooth=9):
    """Follow a spectral ridge forwards and backwards from (seed_t, seed_f). Returns (t, f) arrays (absolute t)."""
    f, t, M = stft_mag(x, sr, nper, hop)
    t = t  # centre times
    df = f[1] - f[0]
    k0 = int(np.argmin(np.abs(t - seed_t)))
    out = np.zeros(len(t))
    def peak_near(k, fc):
        lo, hi = int(max(1, fc * (1 - tol) / df)), int(min(len(f) - 2, fc * (1 + tol) / df + 1))
        if hi <= lo: return fc, 0
        j = lo + int(np.argmax(M[lo:hi, k]))
        a, b, c = np.log(M[j - 1, k] + 1e-12), np.log(M[j, k] + 1e-12), np.log(M[j + 1, k] + 1e-12)
        p = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0
        return (j + p) * df, M[j, k]
    fc, _ = peak_near(k0, seed_f); out[k0] = fc
    for direction in (1, -1):
        fc = out[k0]; slope = 0.0; k = k0 + direction
        while 0 <= k < len(t):
            pred = fc + slope
            fn, _ = peak_near(k, pred)
            slope = 0.8 * slope + 0.2 * (fn - fc)
            fc = fn; out[k] = fc; k += direction
    if smooth > 1:
        out = signal.savgol_filter(out, smooth * 2 + 1, 2)
    sel = np.ones(len(t), bool)
    if t0 is not None: sel &= t >= t0
    if t1 is not None: sel &= t <= t1
    return t[sel], out[sel]

def dechirp(x, sr, tt, ff, a, b, F):
    """segment x[a..b] seconds whose instantaneous pitch follows (tt, ff) -> resampled so pitch is constant F"""
    up = 4
    seg = x[int(a * sr) - 64: int(b * sr) + 64]
    su = signal.resample_poly(seg, up, 1)
    srr = sr * up
    base = a - 64 / sr
    # output time grid; dt_in/dt_out = F / f(t_in)  -> integrate
    tin = a; outs = []
    n_out = int((b - a) * sr * 1.6)
    ts = np.empty(n_out)
    for n in range(n_out):
        ts[n] = tin
        fi = np.interp(tin, tt, ff)
        tin += (F / fi) / sr
        if tin >= b: ts = ts[:n + 1]; break
    idx = (ts - base) * srr
    y = np.interp(idx, np.arange(len(su)), su)
    return y

def cycle_loop(y, sr, F, cyl, target_len=0.8, xf_cycles=3):
    """cut a loop of an integer number of engine cycles (720 deg = cyl firings) out of constant-pitch y"""
    cycle = sr * cyl / F  # samples per 720-degree cycle
    n = max(1, int(round(target_len * sr / cycle)))
    # need L + xf samples
    xf = int(min(cycle * xf_cycles, 0.08 * sr))
    while n > 1 and n * cycle + xf > len(y) - 10: n -= 1
    L = int(round(n * cycle))
    if L + xf > len(y): raise ValueError('segment too short')
    off = (len(y) - L - xf) // 2
    seg = y[off: off + L + xf]
    t = np.linspace(0, 1, xf); w = 0.5 - 0.5 * np.cos(np.pi * t)
    out = seg[:L].copy()
    out[:xf] = seg[L:L + xf] * (1 - w) + seg[:xf] * w
    return out, n, L / sr

def crossings(tt, ff, F, rising=True):
    res = []
    for i in range(len(ff) - 1):
        if rising and ff[i] < F <= ff[i + 1]: res.append(tt[i] + (F - ff[i]) / (ff[i + 1] - ff[i]) * (tt[i + 1] - tt[i]))
        if not rising and ff[i] > F >= ff[i + 1]: res.append(tt[i] + (F - ff[i]) / (ff[i + 1] - ff[i]) * (tt[i + 1] - tt[i]))
    return res

def extract(x, sr, tt, ff, F, cyl, when, win=1.0, loop_len=0.8, a=None, b=None):
    """window of `win` seconds centred at time `when`, de-chirped to F, looped"""
    a = when - win / 2 if a is None else a; b = when + win / 2 if b is None else b
    a = max(a, tt[0] + 0.01); b = min(b, tt[-1] - 0.01)
    y = dechirp(x, sr, tt, ff, a, b, F)
    return cycle_loop(y, sr, F, cyl, loop_len)

def check_pitch(loop, sr, F, cyl):
    """measure firing frequency in a (tiled) loop via harmonic-sum spectrum around F"""
    z = np.tile(loop, 4)
    spec = np.abs(np.fft.rfft(z * np.hanning(len(z)), 1 << 20)); fr = np.fft.rfftfreq(1 << 20, 1 / sr)
    cands = np.linspace(F * 0.9, F * 1.1, 401); best, bf = -1, F
    for c in cands:
        s = sum(np.interp(c * h, fr, spec) for h in range(1, 6))
        if s > best: best, bf = s, c
    return bf

def track_comb(x, sr, seed_t, seed_s, H=14, tol=0.035, nper=8192, hop=441, smooth=7, fmaxh=4000):
    """harmonic-comb tracker for the order spacing s (Hz) through a sweep. Returns (t, s)."""
    f, t, M = stft_mag(x, sr, nper, hop)
    M = np.sqrt(M)
    df = f[1] - f[0]
    k0 = int(np.argmin(np.abs(t - seed_t)))
    out = np.zeros(len(t))
    def score(k, s):
        hs = np.arange(1, H + 1) * s
        hs = hs[hs < fmaxh]
        return np.interp(hs / df, np.arange(len(f)), M[:, k]).sum() / len(hs) ** 0.5
    def best(k, sc):
        cands = np.linspace(sc * (1 - tol), sc * (1 + tol), 121)
        v = [score(k, c) for c in cands]
        return cands[int(np.argmax(v))]
    # refine seed with a wider search
    cands = np.linspace(seed_s * 0.9, seed_s * 1.1, 241)
    out[k0] = cands[int(np.argmax([score(k0, c) for c in cands]))]
    for d in (1, -1):
        sc = out[k0]; sl = 0.0; k = k0 + d
        while 0 <= k < len(t):
            sn = best(k, sc + sl)
            sl = 0.7 * sl + 0.3 * (sn - sc)
            sc = sn; out[k] = sc; k += d
    if smooth > 1: out = signal.savgol_filter(out, smooth * 2 + 1, 2)
    return t, out
