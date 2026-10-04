# Freesound helper: CC0-filtered search, per-sound license verification, hq preview download.
# Usage:
#   python fs.py search "query words" [pages]      -> prints id | user | dur | sr | downloads | rating | title
#   python fs.py verify ID [ID...]                  -> fetches sound page, prints license + description
#   python fs.py get ID [ID...]                     -> verifies CC0, downloads hq preview to src/ID.mp3, records meta in meta.json
import sys, re, os, json, html, time, urllib.request, urllib.parse, urllib.error

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'}
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache'); os.makedirs(CACHE, exist_ok=True)
SRC = os.path.join(HERE, 'src'); os.makedirs(SRC, exist_ok=True)
META = os.path.join(HERE, 'meta.json')

def fetch(url, binary=False, cache=True):
    key = re.sub(r'[^A-Za-z0-9]+', '_', url)[-180:]
    p = os.path.join(CACHE, key)
    if cache and os.path.exists(p) and not binary:
        return open(p, encoding='utf8').read()
    for attempt in range(8):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
            break
        except urllib.error.HTTPError as e:
            if attempt == 7 or e.code not in (429, 500, 502, 503, 504): raise
            time.sleep(12 * (attempt + 1))
        except Exception as e:
            if attempt == 7: raise
            time.sleep(3)
    time.sleep(0.8)
    if binary: return data
    t = data.decode('utf8', 'replace')
    open(p, 'w', encoding='utf8').write(t)
    return t

def search(q, pages=1, extra=''):
    out = []
    for page in range(1, pages + 1):
        url = 'https://freesound.org/search/?' + urllib.parse.urlencode({'q': q, 'f': 'license:"Creative Commons 0"' + extra, 'page': page})
        h = fetch(url)
        for m in re.finditer(r'<div\s+class="bw-player"(.*?)tabindex="0">', h, re.S):
            b = m.group(1)
            g = lambda k: (re.search(k + r'="([^"]*)"', b) or [None, ''])[1]
            out.append(dict(id=int(g('data-sound-id')), user=g('data-username'), title=html.unescape(g('data-title')),
                            dur=float(g('data-duration') or 0), sr=g('data-samplerate'), dl=int(g('data-num-downloads') or 0),
                            mp3=g('data-mp3')))
    return out

def page(sid, user=None):
    url = f'https://freesound.org/s/{sid}/'
    h = fetch(url)
    lic = 'CC0' if re.search(r'href="https?://creativecommons\.org/publicdomain/zero/1\.0/?"[^>]*>\s*Creative Commons 0', h) else None
    if not lic:
        m = re.search(r'href="(https?://creativecommons\.org/licenses/[^"]+)"', h)
        lic = 'OTHER:' + (m.group(1) if m else '?')
    title = html.unescape((re.search(r'og:audio:title" content="([^"]*)"', h) or [None, ''])[1])
    artist = html.unescape((re.search(r'og:audio:artist" content="([^"]*)"', h) or [None, ''])[1])
    hq = (re.search(r'data-static-file-url="([^"]+-hq\.mp3)"', h) or [None, ''])[1]
    canon = (re.search(r'data-sound-page-url="([^"]+)"', h) or [None, url])[1]
    d = re.search(r'<div id="soundDescriptionSection"[^>]*>(.*?)</div>', h, re.S)
    desc = re.sub(r'<[^>]+>', ' ', d.group(1)) if d else ''
    desc = html.unescape(re.sub(r'\s+', ' ', desc)).strip()
    tags = re.findall(r'/browse/tags/([^/"]+)/', h)
    info = {}
    for k in ['Type', 'Duration', 'File size', 'Sample rate', 'Bit depth', 'Channels']:
        mm = re.search(r'<dt[^>]*>\s*' + k + r'\s*</dt>\s*<dd[^>]*>(.*?)</dd>', h, re.S)
        if mm: info[k] = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', mm.group(1))).strip()
    rate = re.search(r'aria-label="Average rating of ([0-9.]+)"', h)
    return dict(id=sid, title=title, author=artist, license=lic, hq=hq, url=canon, desc=desc[:600], tags=sorted(set(tags))[:25], info=info,
                rating=float(rate.group(1)) if rate else None)

def load_meta():
    return json.load(open(META, encoding='utf8')) if os.path.exists(META) else {}

def get(sid):
    p = page(sid)
    if p['license'] != 'CC0':
        print('SKIP (not CC0)', sid, p['license']); return None
    dst = os.path.join(SRC, f'{sid}.mp3')
    if not os.path.exists(dst):
        data = fetch(p['hq'], binary=True, cache=False)
        open(dst, 'wb').write(data)
    M = load_meta(); M[str(sid)] = p; json.dump(M, open(META, 'w', encoding='utf8'), indent=1)
    print('OK', sid, p['author'], '|', p['title'], '|', os.path.getsize(dst), 'bytes')
    return p

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'search':
        q = sys.argv[2]; pages = int(sys.argv[3]) if len(sys.argv) > 3 else 1
        for r in search(q, pages):
            print(f"{r['id']:>7} | {r['user'][:18]:18} | {r['dur']:7.1f}s | {r['sr'][:5]:5} | dl {r['dl']:>6} | {r['title'][:80]}")
    elif cmd == 'verify':
        for sid in sys.argv[2:]:
            p = page(int(sid))
            print(f"== {sid} [{p['license']}] {p['author']} | {p['title']} | {p['info']} | rating {p['rating']}\n   tags: {' '.join(p['tags'])}\n   {p['desc'][:500]}\n")
    elif cmd == 'get':
        for sid in sys.argv[2:]:
            try: get(int(sid))
            except Exception as e: print('ERR', sid, e)
