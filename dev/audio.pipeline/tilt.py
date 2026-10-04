import numpy as np, json, loopkit as lk
def ltas(loop, sr=44100):
    z = np.tile(loop, max(2, int(2 * sr / len(loop))))
    f, P = __import__('scipy.signal', fromlist=['welch']).welch(z, sr, nperseg=4096)
    return f, P
def tilt(loop, sr=44100, lo=150, hi=8000):
    f, P = ltas(loop, sr)
    # octave-band energies
    edges = lo * 2 ** np.arange(0, np.log2(hi / lo) + 1e-9, 0.5)
    c, e = [], []
    for a, b in zip(edges[:-1], edges[1:]):
        m = (f >= a) & (f < b); c.append(np.log2(np.sqrt(a * b))); e.append(10 * np.log10(P[m].sum() + 1e-20))
    k, _ = np.polyfit(c, e, 1)
    return k, np.array(e)
if __name__ == '__main__':
    import sys
    for fam in sys.argv[1:]:
        info = json.load(open(f'fam/{fam}/info.json')); L = np.load(f'fam/{fam}/loops.npz')
        for i, l in enumerate(info['loops']):
            x = L[f'arr_{i}']; k, e = tilt(x)
            print(f"{fam:7s} {l['id']:>10} F {l['F']:6.1f} lufs {lk.lufs(np.tile(x, 4)):6.1f} tilt {k:6.2f} dB/oct  bands " + ' '.join(f'{v - e.max():4.0f}' for v in e))
