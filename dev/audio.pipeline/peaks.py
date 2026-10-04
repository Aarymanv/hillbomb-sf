import sys, numpy as np, loopkit as lk
from scipy import signal
i = sys.argv[1]
for ts in sys.argv[2:]:
    t = float(ts); x = lk.load(f'src/{i}.mp3', 44100, start=max(0,t-0.25), dur=0.5)
    X = np.abs(np.fft.rfft(x * np.hanning(len(x)), 1 << 17)); f = np.fft.rfftfreq(1 << 17, 1/44100)
    sel = (f > 15) & (f < 900); Xs = X[sel]; fs = f[sel]
    pk, pr = signal.find_peaks(20*np.log10(Xs+1e-9), prominence=6, distance=int(8/(f[1]-f[0])))
    order = np.argsort(-Xs[pk])[:10]
    print(t, ' '.join(f'{fs[pk[o]]:.1f}({20*np.log10(Xs[pk[o]]/Xs.max()):.0f})' for o in sorted(order, key=lambda o: fs[pk[o]])))
