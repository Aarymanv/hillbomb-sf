# Merge engine sprites + pass-bys (mine) + SFX/ambience/UI fragment + music fragment into
# public/assets/audio/manifest.json and the "Audio" section of public/assets/ASSET_LICENSES.md.
import json, os, re, datetime
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'assets')
AUD = os.path.join(ROOT, 'audio')
SCR = os.path.dirname(HERE)
meta = json.load(open(os.path.join(HERE, 'fragments', 'freesound_meta.json'), encoding='utf8'))

def fs_credit(sid):
    m = meta[str(sid)]
    return dict(site='freesound', id=int(sid), page=m['url'], file=m['hq'], title=m['title'], author=m['author'], license='CC0 1.0')

sounds, credits = {}, []
def credit(file, srcs, what):
    for s in srcs:
        c = dict(s); c["source_file"] = c.pop("file", None); credits.append(dict(file=file, what=what, **c))

# ---- engines
eng = json.load(open(os.path.join(HERE, 'fragments', 'engines_manifest.json')))
engines = {}
for fam, e in eng.items():
    srcs = [fs_credit(s) for s in e['sources']]
    engines[fam] = dict(file=e['file'], cyl=e['cyl'], loops=[{k: l[k] for k in ('id', 'load', 'F', 'start', 'end', 'src')} for l in e['loops']], src=srcs)
    credit(e['file'], srcs, f'engine loops ({fam})')

# ---- pass-bys
pb = json.load(open(os.path.join(HERE, 'fragments', 'passby_manifest.json')))
for key, vs in pb.items():
    sounds[key] = dict(kind='shot', variants=[dict(file=v['file'], peak=v['peak']) for v in vs])
    for v in vs: credit(v['file'], v['src'], 'traffic pass-by')

# ---- SFX / ambience / UI fragment
fp = os.path.join(HERE, 'fragments', 'sfx_fragment.json')
if os.path.exists(fp):
    frag = json.load(open(fp, encoding='utf8'))
    for nm in ('extra_fragment.json', 'world_fragment.json'):
        ep = os.path.join(HERE, 'fragments', nm)
        if os.path.exists(ep):
            extra = json.load(open(ep, encoding='utf8')); have = {x['file'] for x in frag}
            frag += [x for x in extra if x['file'] not in have]
    groups = {}
    for it in frag:
        key = it['key']
        if it['file'].startswith('ui/') and not key.startswith('ui_'): key = 'ui_' + key
        if not os.path.exists(os.path.join(AUD, it['file'].replace('/', os.sep))):
            print('missing file, skipped:', it['file']); continue
        bad = [s for s in it.get('sources', []) if 'CC0' not in str(s.get('license', ''))]
        if bad: print('NON-CC0 source, skipped:', it['file'], bad); continue
        groups.setdefault(key, []).append(it)
    for key, items in groups.items():
        items.sort(key=lambda i: i.get('variant', 0))
        kind = items[0].get('kind', 'shot')
        if kind == 'loop':
            i = items[0]
            sounds[key] = dict(kind='loop', file=i['file'], loopStart=i['loopStart'], loopEnd=i['loopEnd'], lufs=i.get('lufs'))
        else:
            sounds[key] = dict(kind='shot', variants=[dict(file=i['file'], lufs=i.get('lufs'), **({'gain': i['gain']} if i.get('gain') else {})) for i in items])
        for i in items: credit(i['file'], i.get('sources', []), key)
else:
    print('no sfx fragment yet')

# ---- music fragment
music = dict(stations=[])
mp = os.path.join(HERE, 'fragments', 'music_fragment.json')
if os.path.exists(mp):
    mf = json.load(open(mp, encoding='utf8'))
    for st in mf.get('stations', []):
        tracks = []
        for t in st.get('tracks', []):
            if not os.path.exists(os.path.join(AUD, t['file'].replace('/', os.sep))): print('missing track', t['file']); continue
            if any('CC0' not in str(s.get('license', '')) for s in t.get('sources', [])): print('NON-CC0 track skipped', t['file']); continue
            tracks.append(dict(file=t['file'], title=t['title'], artist=t['artist'], duration=t['duration'], lufs=t.get('lufs', -16)))
            credit(t['file'], t.get('sources', []), f"radio track ({st['name']})")
        if tracks:
            ident = st.get('ident') if st.get('ident') and os.path.exists(os.path.join(AUD, st['ident'].replace('/', os.sep))) else None
            music['stations'].append(dict(id=st['id'], name=st['name'], genre=st.get('genre', ''), ident=ident, tracks=tracks))
    for idn in mf.get('idents', []):
        if os.path.exists(os.path.join(AUD, idn['file'].replace('/', os.sep))): credit(idn['file'], idn.get('sources', []), 'station ident')
else:
    print('no music fragment yet')

total = 0
for dp, dn, fn in os.walk(AUD):
    for f in fn:
        if f.endswith(('.mp3', '.m4a')): total += os.path.getsize(os.path.join(dp, f))
man = dict(version=1, generated=datetime.date.today().isoformat(),
           note='Every file in this folder is a processed (trimmed, looped, loudness-normalised, re-encoded) derivative of a CC0 1.0 (public domain) recording. Sources per file in "credits".',
           totalBytes=total, sounds=sounds, engines=engines, music=music, credits=credits)
json.dump(man, open(os.path.join(AUD, 'manifest.json'), 'w', encoding='utf8'), indent=1, ensure_ascii=False)
print('manifest: %d sounds, %d engine families, %d stations, %d credits, %.2f MB audio' % (len(sounds), len(engines), len(music['stations']), len(credits), total / 1e6))

# ---- licences markdown section
lines = ['## Audio (public/assets/audio)', '',
         'All audio files are processed derivatives (trimmed, looped, loudness-normalised, re-encoded) of recordings released under **CC0 1.0 / public domain**. '
         'Sources: Freesound.org (only sounds whose page states "Creative Commons 0"), Kenney.nl (CC0) and OpenGameArt.org (items listing CC0). '
         'Machine-readable list with per-file source URLs: `audio/manifest.json` → `credits`.', '']
seen = {}
for c in credits:
    k = c.get('page') or c.get('file')
    seen.setdefault(k, dict(c, files=[]))['files'].append(c['file'])
for k, c in seen.items():
    files = ', '.join(sorted(set(f'`audio/{f}`' for f in c['files'])))
    lines.append(f"* {files}: **{c.get('title','')}** by {c.get('author','')} ({c.get('site','')}, {c.get('license','CC0 1.0')}), {c.get('page','')}")
md_path = os.path.join(ROOT, 'ASSET_LICENSES.md')
md = open(md_path, encoding='utf8').read()
sec = '\n'.join(lines) + '\n'
m = re.search(r'\n## Audio \(public/assets/audio\).*?(?=\n## |\Z)', md, flags=re.S)  # replace only the Audio section, keep later ones
md = (md[:m.start()] + '\n' + sec + md[m.end():]) if m else md.rstrip() + '\n\n' + sec
open(md_path, 'w', encoding='utf8').write(md)
print('licences section: %d source entries' % len(seen))
