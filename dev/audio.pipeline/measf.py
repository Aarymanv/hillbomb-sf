import sys, numpy as np, loopkit as lk
# measf.py ID a b Fguess cyl  -> precise firing F by harmonic-sum over the steady segment (orders 0.5..8 of F)
i, a, b, Fg = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
x = lk.load(f'src/{i}.mp3', 44100, start=a, dur=b-a)
N = 1 << 21; X = np.abs(np.fft.rfft(x * np.hanning(len(x)), N)); f = np.fft.rfftfreq(N, 1/44100)
best = None
for F in np.linspace(Fg * 0.93, Fg * 1.07, 1401):
    s = sum(np.interp(F * h, f, X) ** 0.5 for h in np.arange(0.5, 12.5, 0.5))
    if best is None or s > best[0]: best = (s, F)
print(f'{i} {a}-{b}: F = {best[1]:.3f}')
