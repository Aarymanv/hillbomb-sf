# Extra ped clips appended to public/assets/peds/clips.bin/json (idempotent: earlier extras are replaced):
#  * Rocketbox mocap (MIT) for getting in / out of a car seat: sit_down_chair_left/right, sit_stand_up_chair_left/right,
#    try_door_outwards, crouch_in/out (tools/peds_src/anim, see fetch_rocketbox.py; f_ + m_ versions)
#  * CMU Graphics Lab mocap (mocap.cs.cmu.edu, free for any use) retargeted to the shared 34-bone Bip01 skeleton:
#    getting up from the back / front (subject 140), falls (90_16 dive, 90_18 rug-pull fall on the back), jump (105_39).
# Retarget: world rotation of a target bone = G_src(t) * S * R_rest, where G_src is the source bone's world rotation
# relative to its ASF rest pose (T-pose), R_rest the Bip01 rest world rotation and S the swing that turns the Bip01 rest
# bone direction onto the source rest bone direction (both rests are T-poses, S only fixes small angle differences).
# usage: tools/.venv-blender/Scripts/python.exe tools/blender/peds/build_clips_extra.py
import os, sys, json, math, struct
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Quaternion, Vector, Matrix
from common import SRC, OUT, BONES, BI, parents, import_fbx
from build_clips import sample, turn_onto
from cmu import Skeleton, read_amc

ANIM = os.path.join(SRC, 'anim')
CMU = os.path.join(SRC, 'cmu')
RB = ['sit_down_chair_left', 'sit_down_chair_right', 'sit_stand_up_chair_left', 'sit_stand_up_chair_right',
      'try_door_outwards', 'crouch_in', 'crouch_out']
# name: (file, t0, t1, align 'start'|'end', mode 'abs' (pelvis over the floor) | 'feet' (pelvis over the lowest foot, in place))
CM = {
    'getup_back': ('140_09', 0.85, 4.9, 'end', 'abs'),
    'getup_front': ('140_01', 1.15, 4.9, 'end', 'abs'),
    'getup_back2': ('140_08', 1.4, 5.6, 'end', 'abs'),
    'fall_back': ('90_18', 0.5, 2.1, 'start', 'abs'),
    'fall_dive': ('90_16', 2.85, 4.6, 'start', 'abs'),
    'jump_up': ('105_39', 1.12, 1.72, 'start', 'feet'),
    'jump_air': ('105_39', 1.45, 1.78, 'start', 'feet'),
    'jump_land': ('105_39', 1.78, 2.55, 'start', 'feet'),
}
MAP = {'Bip01 Pelvis': 'root', 'Bip01 Spine': 'lowerback', 'Bip01 Spine1': 'upperback', 'Bip01 Spine2': 'thorax',
       'Bip01 Neck': 'lowerneck', 'Bip01 Head': 'head'}
for s, c in (('L', 'l'), ('R', 'r')):
    MAP.update({f'Bip01 {s} Clavicle': c + 'clavicle', f'Bip01 {s} UpperArm': c + 'humerus', f'Bip01 {s} Forearm': c + 'radius',
                f'Bip01 {s} Hand': c + 'hand', f'Bip01 {s} Thigh': c + 'femur', f'Bip01 {s} Calf': c + 'tibia',
                f'Bip01 {s} Foot': c + 'foot', f'Bip01 {s} Toe0': c + 'toes'})
# target bone direction = towards this child joint (bones without one keep S = identity)
CHILD = {'Bip01 Spine': 'Bip01 Spine1', 'Bip01 Spine1': 'Bip01 Spine2', 'Bip01 Spine2': 'Bip01 Neck', 'Bip01 Neck': 'Bip01 Head'}
for s in 'LR':
    CHILD.update({f'Bip01 {s} Clavicle': f'Bip01 {s} UpperArm', f'Bip01 {s} UpperArm': f'Bip01 {s} Forearm',
                  f'Bip01 {s} Forearm': f'Bip01 {s} Hand', f'Bip01 {s} Hand': f'Bip01 {s} Finger2',
                  f'Bip01 {s} Thigh': f'Bip01 {s} Calf', f'Bip01 {s} Calf': f'Bip01 {s} Foot', f'Bip01 {s} Foot': f'Bip01 {s} Toe0'})
QY = Quaternion((0, 1, 0), math.pi)       # CMU (faces +Z, left +X) -> game (faces -Z, left -X)


def rb_clip(name, par):
    """Rocketbox non-loco clip (same conventions as build_clips.build, 15 fps)."""
    frames, _, _, fps = sample(os.path.join(ANIM, name + '.fbx'))
    L, R = frames[0][BI['Bip01 L Thigh']][1], frames[0][BI['Bip01 R Thigh']][1]
    lat = L - R; lat.y = 0
    qfix = turn_onto(lat, Vector((-1, 0, 0)))
    p0 = frames[0][0][1].copy()
    out = []
    for W in frames:
        pr, pp = W[0]
        rows = [(qfix @ pr).normalized()] + [(W[par[i]][0].inverted() @ W[i][0]).normalized() for i in range(1, len(BONES))]
        out.append((qfix @ (pp - Vector((p0.x, 0, p0.z))), rows))
    out = out[::2]
    return out, fps / 2


def cmu_clip(file, t0, t1, align, mode, rest, par, hip0):
    sk = Skeleton(os.path.join(CMU, file.split('_')[0] + '.asf'))
    amc = read_amc(os.path.join(CMU, file + '.amc'))
    src_rest = sk.rest()
    # swing per target bone: Bip01 rest bone dir -> CMU rest bone dir (game frame)
    S = {}
    for n, b in MAP.items():
        if n in CHILD:
            dt = rest[BI[CHILD[n]]][1] - rest[BI[n]][1]
            g, p0, p1 = src_rest[b]
            ds = QY @ (p1 - p0)
            S[n] = dt.normalized().rotation_difference(ds.normalized()) if ds.length > 1e-6 else Quaternion()
        else: S[n] = Quaternion()
    k0, k1 = int(t0 * 120), min(len(amc) - 1, int(t1 * 120))
    idx = [k0 + i * 4 for i in range((k1 - k0) // 4 + 1)]           # 30 fps
    fk = [sk.fk(amc[k]) for k in idx]
    feet = ('lfoot', 'rfoot', 'ltoes', 'rtoes')
    ref = fk[0] if align == 'start' else fk[-1]
    ground = min(ref[b][2].y for b in feet) - 0.02         # floor = under the standing feet (toe / foot tip joints)
    lat = QY @ (ref['lfemur'][1] - ref['rfemur'][1]); lat.y = 0
    qfix = turn_onto(lat, Vector((-1, 0, 0)))
    pref = QY @ ref['root'][1]
    stand = ref['root'][1].y - min(ref[b][2].y for b in feet)
    sc = hip0 / stand
    out = []
    for f in fk:
        Wt = [None] * len(BONES)
        for i, n in enumerate(BONES):
            if n in MAP:
                G = QY @ f[MAP[n]][0] @ QY.inverted()
                Wt[i] = (qfix @ G @ S[n] @ rest[i][0]).normalized()
            else:
                Wt[i] = Wt[par[i]] @ (rest[par[i]][0].inverted() @ rest[i][0])
        rows = [Wt[0]] + [(Wt[par[i]].inverted() @ Wt[i]).normalized() for i in range(1, len(BONES))]
        p = QY @ f['root'][1]
        if mode == 'feet':
            pos = Vector((0, (f['root'][1].y - min(f[b][2].y for b in feet)) * sc, 0))
        else:
            d = qfix @ (p - Vector((pref.x, 0, pref.z)))
            pos = Vector((d.x * sc, (f['root'][1].y - ground) * sc, d.z * sc))
        out.append((pos, rows))
    return out, 30.0


def meta(out):
    # facing change over the clip (rad, + = turned left) and pelvis start / end (clip units)
    q = out[-1][1][0] @ out[0][1][0].inverted()
    f = q @ Vector((0, 0, -1))
    return {'turn': round(math.atan2(-f.x, -f.z), 4), 'p0': [round(c, 4) for c in out[0][0]], 'p1': [round(c, 4) for c in out[-1][0]]}


def pack(out, blob):
    off = len(blob)
    for i in range(len(BONES)):
        for k in range(1, len(out)):
            if out[k][1][i].dot(out[k - 1][1][i]) < 0: out[k][1][i].negate()
    for pos, rows in out:
        vals = [int(round(max(-32.767, min(32.767, c)) * 1000)) for c in (pos.x, pos.y, pos.z)]
        for q in rows: vals += [int(round(c * 32767)) for c in (q.x, q.y, q.z, q.w)]
        blob += struct.pack('<%dh' % len(vals), *vals)
    return off


def build():
    js = json.load(open(os.path.join(OUT, 'clips.json')))
    blob = bytearray(open(os.path.join(OUT, 'clips.bin'), 'rb').read())
    # drop earlier extras (they sit at the end of the blob)
    extra = [n for n, c in js['clips'].items() if c.get('x')]
    if extra:
        cut = min(js['clips'][n]['off'] for n in extra)
        blob = blob[:cut]
        for n in extra: del js['clips'][n]
    arm = import_fbx(os.path.join(ANIM, 'm_idle_neutral_01.fbx'))
    par = parents(arm)
    _, _, rest, _ = sample(os.path.join(ANIM, 'm_idle_neutral_01.fbx'))
    for s in 'LR':
        d = rest[BI[f'Bip01 {s} Forearm']][1] - rest[BI[f'Bip01 {s} UpperArm']][1]
        print('rest', s, 'upper arm dir', tuple(round(x, 2) for x in d.normalized()))
    for g in 'fm':
        for n in RB:
            fn = f'{g}_{n}'
            if not os.path.exists(os.path.join(ANIM, fn + '.fbx')): continue
            out, fps = rb_clip(fn, par)
            off = pack(out, blob)
            js['clips'][fn] = {'g': g, 'fps': fps, 'loop': False, 'frames': len(out), 'dur': len(out) / fps, 'off': off, 'x': 1, **meta(out)}
            print(fn, len(out), 'frames', '%.2fs' % (len(out) / fps), meta(out))
    for n, (file, t0, t1, align, mode) in CM.items():
        out, fps = cmu_clip(file, t0, t1, align, mode, rest, par, js['hip0']['m'])
        off = pack(out, blob)
        js['clips']['m_' + n] = {'g': 'm', 'fps': fps, 'loop': False, 'frames': len(out), 'dur': len(out) / fps, 'off': off, 'x': 1, 'src': 'cmu ' + file, **meta(out)}
        print('m_' + n, len(out), 'frames', '%.2fs' % (len(out) / fps), 'pelvis0', tuple(round(c, 2) for c in out[0][0]), 'pelvis1', tuple(round(c, 2) for c in out[-1][0]))
    with open(os.path.join(OUT, 'clips.bin'), 'wb') as f: f.write(blob)
    with open(os.path.join(OUT, 'clips.json'), 'w') as f: json.dump(js, f, indent=0)
    print('clips', len(js['clips']), 'bytes', len(blob))


if __name__ == '__main__':
    build()
