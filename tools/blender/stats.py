"""Print mean luma / lit fraction of cached tiles: stats.py rooms|shops"""
import os, sys, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import hb_lib as L
for p in sorted(glob.glob(os.path.join(L.CACHE, sys.argv[1], '*.png'))):
    a = L.load_png(p); y = L.luma(a)
    print('%-16s mean %.3f  p50 %.3f  p95 %.3f  lit>0.3 %.3f  rgb %s' % (os.path.basename(p), y.mean(), np.median(y), np.percentile(y, 95), (y > 0.3).mean(), np.round(a.reshape(-1, 3).mean(0), 3)))
