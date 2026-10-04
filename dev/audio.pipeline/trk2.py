import sys, json, numpy as np, loopkit as lk, eng
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from scipy import signal
# usage: trk2.py ID seed_t seed_spacing firing_mult t0 t1 fmax [tol] [H]
i, st, ss, mult, t0, t1, fmax = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]), float(sys.argv[6]), float(sys.argv[7])
tol = float(sys.argv[8]) if len(sys.argv) > 8 else 0.035
H = int(sys.argv[9]) if len(sys.argv) > 9 else 14
x = lk.load(f'src/{i}.mp3', 44100)
seg = x[int(t0*44100):int(t1*44100)]
tt, s = eng.track_comb(seg, 44100, st - t0, ss, H=H, tol=tol)
tt = tt + t0; F = s * mult
json.dump({'t': tt.tolist(), 'f': F.tolist()}, open(f'tracks/trk_{i}_{t0:.0f}.json', 'w'))
f, t, S = signal.spectrogram(seg, 44100, nperseg=8192, noverlap=8192-441)
plt.figure(figsize=(14, 5)); plt.pcolormesh(t + t0, f, 10*np.log10(S+1e-14), shading='auto', vmin=-100, vmax=-35, cmap='magma')
for h in (1, 2, 3): plt.plot(tt, s*h, 'c-', lw=0.7, alpha=0.6)
plt.ylim(0, fmax); plt.title(f'{i} comb track, spacing x1..3; firing = spacing x {mult}'); plt.tight_layout(); plt.savefig(f'tracks/trk_{i}_{t0:.0f}.png', dpi=70)
print('firing Hz range', F.min().round(1), F.max().round(1), ' peak at t', tt[np.argmax(F)].round(2))
