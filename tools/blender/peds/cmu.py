# CMU Graphics Lab motion capture (mocap.cs.cmu.edu, free for any use incl. commercial products) ASF/AMC reader + FK.
# Frames: CMU world (Y up, the subject's rest pose faces +Z with its left side at +X). length unit = 1/0.45 inch.
# fk(frame) -> {bone: (G, p0, p1)}: G = world rotation of the bone relative to the ASF rest pose (Quaternion),
# p0 / p1 = world positions (metres) of the bone's start / end joint. 'root' p0 = p1 = pelvis.
import math
from mathutils import Quaternion, Matrix, Vector, Euler

INCH = 0.0254


def _rot(order, angles):
    """dof rotation: rotate about each axis in listed order (first listed applied first) -> M = ...Rz Ry Rx"""
    m = Matrix.Identity(3)
    for ax, a in zip(order, angles):
        m = Matrix.Rotation(math.radians(a), 3, ax.upper()) @ m
    return m


class Skeleton:
    def __init__(self, path):
        self.bones = {}; self.children = {}; self.root_order = []; self.scale = 1.0
        lines = [l.strip() for l in open(path)]
        sec = None; cur = None; i = 0
        while i < len(lines):
            l = lines[i]; i += 1
            if not l or l.startswith('#'): continue
            if l.startswith(':'):
                sec = l.split()[0][1:]
                if sec == 'units': pass
                continue
            t = l.split()
            if sec == 'units' and t[0] == 'length': self.scale = INCH / float(t[1])
            elif sec == 'root' and t[0] == 'order': self.root_order = [x.lower() for x in t[1:]]
            elif sec == 'bonedata':
                if t[0] == 'begin': cur = {'dof': [], 'axis': Matrix.Identity(3)}
                elif t[0] == 'end': self.bones[cur['name']] = cur; cur = None
                elif t[0] == 'name': cur['name'] = t[1]
                elif t[0] == 'direction': cur['dir'] = Vector([float(x) for x in t[1:4]]).normalized()
                elif t[0] == 'length': cur['len'] = float(t[1]) * self.scale
                elif t[0] == 'axis': cur['axis'] = _rot(t[4].lower(), [float(x) for x in t[1:4]])
                elif t[0] == 'dof': cur['dof'] = [x.lower() for x in t[1:]]
            elif sec == 'hierarchy':
                if t[0] in ('begin', 'end'): continue
                self.children[t[0]] = t[1:]
        self.parent = {c: p for p, cs in self.children.items() for c in cs}
        self.order = []
        st = ['root']
        while st:
            b = st.pop(0); self.order.append(b); st = self.children.get(b, []) + st

    def fk(self, fr):
        out = {}
        r = fr.get('root', [0] * 6)
        vals = dict(zip(self.root_order, r))
        pos = Vector((vals.get('tx', 0), vals.get('ty', 0), vals.get('tz', 0))) * self.scale
        G = _rot([o[1] for o in self.root_order if o.startswith('r')], [vals[o] for o in self.root_order if o.startswith('r')])
        out['root'] = (G, pos, pos)
        for b in self.order[1:]:
            B = self.bones[b]; Gp, _, pend = out[self.parent[b]]
            v = fr.get(b)
            M = _rot([d[1] for d in B['dof']], v) if v else Matrix.Identity(3)
            C = B['axis']
            Gb = Gp @ C @ M @ C.transposed()
            out[b] = (Gb, pend, pend + Gb @ (B['dir'] * B['len']))
        return {k: (g.to_quaternion(), p0, p1) for k, (g, p0, p1) in out.items()}

    def rest(self):
        return self.fk({})


def read_amc(path):
    frames = []; cur = None
    for l in open(path):
        l = l.strip()
        if not l or l[0] in '#:': continue
        t = l.split()
        if len(t) == 1 and t[0].isdigit():
            cur = {}; frames.append(cur)
        elif cur is not None:
            cur[t[0]] = [float(x) for x in t[1:]]
    return frames
