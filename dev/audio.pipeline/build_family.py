# build_family.py SPEC.json -> fam/<name>/loops.npz + fam/<name>/info.json + preview renders
import sys, json, os, numpy as np, loopkit as lk, eng
spec = json.load(open(sys.argv[1]))
name, cyl = spec['name'], spec['cyl']
os.makedirs(f'fam/{name}', exist_ok=True)
loops, info = [], []
cache = {}
for L in spec['loops']:
    sid = str(L['src'])
    if sid not in cache: cache[sid] = lk.load(f'src/{sid}.mp3', 44100)
    x = cache[sid]
    if 'track' in L:
        tr = json.load(open(f"tracks/{L['track']}.json")); tt, ff = np.array(tr['t']), np.array(tr['f'])
        sel = (tt >= L['range'][0]) & (tt <= L['range'][1]); tt, ff = tt[sel], ff[sel]
        F = L['F']
        if L.get('mode') == 'median':
            when = (L['range'][0] + L['range'][1]) / 2; F = float(np.median(ff))
        else:
            cr = eng.crossings(tt, ff, F, rising=L['load'] != 'off')
            if not cr: print('no crossing', L); continue
            when = cr[0]
        y = eng.dechirp(x, 44100, tt, ff, when - L.get('win', 1.0) / 2, when + L.get('win', 1.0) / 2, F)
    else:  # steady segment with measured F
        F = L['F']; a, b = L['seg']; y = x[int(a * 44100):int(b * 44100)]; when = a
    y = lk.highpass(y, spec.get('hp', 25))
    loop, n, dur = eng.cycle_loop(y, 44100, F, L.get('cyl', cyl), L.get('len', 0.8))
    Fm = eng.check_pitch(loop, 44100, F, cyl)
    rpm = F * 120 / cyl
    loops.append(loop)
    info.append(dict(id=f"{L['load']}_{int(round(rpm))}", load=L['load'], F=round(float(F), 3), Fmeasured=round(float(Fm), 2), rpm=round(rpm), cycles=n, dur=round(dur, 4),
                     src=int(sid), t=round(float(when), 3), rms=float(np.sqrt(np.mean(loop ** 2)))))
    print(f"{info[-1]['id']:>10} F {F:7.2f} meas {Fm:7.2f} cycles {n:3d} dur {dur:.3f} t {when:6.2f} rms {info[-1]['rms']:.4f}")
np.savez(f'fam/{name}/loops.npz', *loops)
json.dump({'name': name, 'cyl': cyl, 'loops': info, 'sources': sorted({int(l['src']) for l in spec['loops']})}, open(f'fam/{name}/info.json', 'w'), indent=1)
# preview: each loop tiled 3x, concatenated with a gap, spectrogram
prev = np.concatenate([np.concatenate([np.tile(l, max(2, int(1.5 / (len(l) / 44100)))), np.zeros(4410)]) for l in loops])
lk.spectrogram_png(prev / (np.abs(prev).max() + 1e-9), f'fam/fam_{name}.png', 44100, title=name, fmax=3000)
