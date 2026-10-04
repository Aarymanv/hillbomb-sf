"""Re-bake everything: projection check, rooms atlas, shops atlas, contact sheet.

Run: tools/.venv-blender/Scripts/python tools/blender/bake_all.py [--samples 192]
(GPU/OptiX is used automatically when present; ~4-6 min on an RTX 5070 Ti laptop.)
"""
import os, sys, subprocess, time
HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable
samples = sys.argv[sys.argv.index('--samples') + 1] if '--samples' in sys.argv else '192'
t0 = time.time()
for script, extra in (('verify_projection.py', []), ('rooms.py', ['--samples', samples]),
                      ('shops.py', ['--samples', samples]), ('preview.py', [])):
    t = time.time()
    r = subprocess.run([PY, os.path.join(HERE, script)] + extra)
    print('[bake_all] %s exit=%d %.0fs' % (script, r.returncode, time.time() - t), flush=True)
    if r.returncode:
        sys.exit(r.returncode)
print('[bake_all] done in %.0fs' % (time.time() - t0))
