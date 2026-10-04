import numpy as np, json, os, loopkit as lk
SR = 44100
PUB = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'assets', 'audio')
M = json.load(open(os.path.join('fragments','freesound_meta.json'), encoding='utf8'))
def mom_max(x): return lk.short_term_max(x, SR, win=0.4)
def limit(x, reduce_db, att=0.0015, rel=0.06):
    # look-ahead peak limiter: gain envelope from the peak envelope, lowered by reduce_db at the loudest peaks
    thr = np.abs(x).max() * 10 ** (-reduce_db / 20)
    need = np.minimum(1.0, thr / np.maximum(np.abs(x), 1e-9))
    la = int(att * SR); need = np.minimum.accumulate(np.r_[need[la:], np.ones(la)][::-1])[::-1] if False else need
    g = np.ones_like(x); cur = 1.0; ka = np.exp(-1 / (att * SR)); kr = np.exp(-1 / (rel * SR))
    # backward pass for attack (look-ahead), forward pass for release
    tmp = np.empty_like(x); cur = 1.0
    for i in range(len(x) - 1, -1, -1): cur = min(need[i], ka * cur + (1 - ka) * need[i]) if need[i] < cur else ka * cur + (1 - ka) * need[i]; tmp[i] = min(cur, need[i]) if need[i] < 1 else cur
    cur = 1.0
    for i in range(len(x)): cur = tmp[i] if tmp[i] < cur else kr * cur + (1 - kr) * tmp[i]; g[i] = cur
    return x * g
def norm(x, target, ceiling):
    g = target - mom_max(x); y = lk.gain_db(x, g)
    if lk.peak_db(y) > ceiling: y = lk.gain_db(y, ceiling - lk.peak_db(y))
    return y
out = []
def emit(key, variant, x, rel, kbps, notes, sid):
    path = os.path.join(PUB, *rel.split('/'))
    lk.encode(x, path, SR, kbps)
    d = lk.load(path, SR)
    m = M[str(sid)]
    out.append(dict(key=key, variant=variant, file=rel, kind='shot', channels=1, duration=round(len(d) / SR, 4), lufs=round(mom_max(d), 2), peak=round(lk.peak_db(d), 2),
                    sources=[dict(site='freesound', id=sid, page=m['url'], file=m['hq'], title=m['title'], author=m['author'], license='CC0 1.0')], notes=notes))
    print(out[-1]['file'], out[-1]['lufs'], out[-1]['peak'], out[-1]['duration'], os.path.getsize(path))
# purchase: cash-register ka-ching (0.08-1.25 s)
x = lk.load('src/184438.mp3', SR); x = lk.highpass(x[int(0.08 * SR):int(1.25 * SR)], 80)
x = lk.fade(x, 0.002, 0.08); emit('purchase', 0, norm(x, -20, -3), 'ui/purchase.mp3', 80, 'cash register ka-ching; loudness = max momentary (400 ms)', 184438)
# backfire_4: single pop at 3.98 s, gated short and dry like backfire_2/3
x = lk.load('src/675723.mp3', SR); a = int(3.96 * SR); y = x[a:a + int(0.35 * SR)].copy()
y *= np.exp(-np.maximum(0, np.arange(len(y)) / SR - 0.03) / 0.07); y = lk.highpass(y, 40)
y = lk.fade(limit(y, 3.0), 0.001, 0.02); emit('backfire', 4, norm(y, -16, -1), 'sfx/backfire_4.mp3', 96, 'car backfire @3.98 s, 0.35 s exponential gate (tau 70 ms)', 675723)
# impact_car_heavy_3: metal collision with rubble tail (0-2.2 s)
x = lk.load('src/386798.mp3', SR); x = lk.highpass(x[:int(2.2 * SR)], 35)
x = lk.fade(limit(x, 6.0), 0.001, 0.3); emit('impact_car_heavy', 3, norm(x, -16, -1), 'sfx/impact_car_heavy_3.mp3', 96, 'metal collision + rubble, 0-2.2 s', 386798)
json.dump(out, open(os.path.join('fragments','extra_fragment.json'), 'w', encoding='utf8'), indent=1)
