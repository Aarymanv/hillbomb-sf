# quick look at a source: channels, duration, 1 s loudness profile (dB RMS) and the steadiest windows of a given length
# usage: python scan.py src/ID.mp3 [window_s]
import sys, numpy as np, loopkit as lk
SR = 44100
x = lk.load(sys.argv[1], SR, mono=False)
win = float(sys.argv[2]) if len(sys.argv) > 2 else 40
m = x.mean(axis=1) if x.ndim == 2 else x
n = len(m) // SR
prof = np.array([10 * np.log10(np.mean(m[i * SR:(i + 1) * SR] ** 2) + 1e-12) for i in range(n)])
print('ch', 1 if x.ndim == 1 else x.shape[1], 'dur', round(len(m) / SR, 1), 'lufs', round(lk.lufs(m, SR), 1), 'peak', round(lk.peak_db(m), 1))
print('profile (1 s dB):', ' '.join(f'{v:.0f}' for v in prof[: 400]))
w = int(win)
if n > w:
    sc = [(np.std(prof[i:i + w]) + 0.3 * (prof[i:i + w].max() - np.median(prof[i:i + w])), i) for i in range(0, n - w)]
    sc.sort()
    print('steadiest', w, 's windows (score, start):', [(round(a, 2), b) for a, b in sc[:5]])
