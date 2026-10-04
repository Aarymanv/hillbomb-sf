"""HILLBOMB car body pass 3: modelled aero add-ons on the sculpted shells (called by cars.py after car_hero.detail).

The body shapes themselves (arch flares / haunches, coke-bottle waist, shoulder / cove / rocker section, raked nose and tail,
sculpted bonnet, greenhouse tumblehome + plan taper) are sculpt terms of the JS loft (src/vehicle/models.js SCULPT table,
section() / sculptSide() / sculptTop()), so every JS detail is projected onto the final surface and car_hero.py knifes its
gaps, lamp housings and grilles into it. The physics box (getModelSpec, profile-table widths / heights) is unchanged.

Here: a front splitter blade that follows the bumper's plan curve and sill skirts between the arches for the sporty ids
(gloss black, details bucket), placed by ray casts against the finished shell.
"""
import math
import numpy as np
from mathutils import Vector
import car_hero as H

AERO = {
    'tora': {'splitter': 0.035, 'skirt': 0.022},
    'rallye6': {'splitter': 0.03, 'skirt': 0.02},
    'k5': {'splitter': 0.028, 'skirt': 0.018},
    'super': {'splitter': 0.04, 'skirt': 0.024},
    'stallion18': {'splitter': 0.03, 'skirt': 0.016},
    'coupe': {'skirt': 0.0},
}
CARBON = H.F(0x0b0b0c, 0.35, 0.22)


def _front_line(surf, meta, y, xs):
    pts = []
    for x in xs:
        loc = surf.ray((x, y, meta['zF'] - 1.0), (0, 0, 1), 2.5)
        if loc is not None: pts.append(Vector(loc))
    return pts


def aero(cid, parts, D, log=print):
    a = AERO.get(cid)
    if not a: return parts
    meta = D['meta']
    surf = H.Surf([parts.get('paint'), parts.get('paint2')])
    Bd = H.Build(); n = 0
    # lowest front y that still hits the bumper face (scan up from the ground)
    if a.get('splitter'):
        y0 = None
        for y in np.arange(0.05, 0.5, 0.005):
            if surf.ray((0.0, float(y), meta['zF'] - 1.0), (0, 0, 1), 2.5) is not None: y0 = float(y) + 0.012; break
        if y0 is not None:
            W = 0.0
            for x in np.linspace(0.2, 1.1, 46):
                if surf.ray((float(x), y0, meta['zF'] - 1.0), (0, 0, 1), 2.5) is not None: W = float(x)
            xs = [W * 0.97 * math.sin(t) for t in np.linspace(-math.pi / 2, math.pi / 2, 41)]
            line = _front_line(surf, meta, y0, xs)
            if len(line) > 10:
                L = a['splitter']
                # blade: lip sticking out of the bumper (rounded nose), thin (12 mm), slight upturn at the tips
                # (forward, up) profile; the tube's U axis points rearward for a -x -> +x path
                prof = [(-0.04, -0.006), (L, -0.006), (L + 0.006, -0.002), (L + 0.004, 0.004), (0.0, 0.006), (-0.04, 0.006)]
                path = [p + Vector((0, -0.004, 0)) for p in line]
                H.tube(Bd, path, [(-f, v) for (f, v) in prof], CARBON, up=lambda i: (0, 1, 0))
                n += 1
    if a.get('skirt'):
        az, bz = meta['axleFZ'], meta['axleRZ']
        ra = meta['R'] + 0.1
        for s in (-1, 1):
            path = []
            for z in np.linspace(az + ra, bz - ra, 24):
                # lowest side point: ray in from the side just above the sill bottom
                yb = None
                for y in np.arange(0.06, 0.5, 0.006):
                    if surf.ray((s * 1.6, float(y), float(z)), (-s, 0, 0), 2.0) is not None: yb = float(y); break
                if yb is None: continue
                loc = surf.ray((s * 1.6, yb + 0.02, float(z)), (-s, 0, 0), 2.0)
                if loc is not None: path.append(Vector((loc[0], yb + 0.004, float(z))))
            if len(path) > 6:
                t = a['skirt']
                # (outward, up) profile; the tube's U axis is -x for a +z path
                prof = [(-0.012, -0.008), (t, -0.008), (t, 0.01), (t - 0.008, 0.022), (-0.012, 0.03)]
                H.tube(Bd, path, [(-s * o, v) for (o, v) in prof], CARBON, up=lambda i: (0, 1, 0))
                n += 1
    for k, ob in Bd.flush('aero').items():
        H.restore_normals(ob)
        if k in parts: H.join_into(parts[k], [ob])
        else: ob.name = 'L0_' + k; ob.data.name = ob.name; parts[k] = ob
    log('[body3] %s aero pieces %d' % (cid, n))
    return parts
