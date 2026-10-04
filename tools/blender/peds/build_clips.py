# Rocketbox mocap -> public/assets/peds/clips.bin + clips.json (shared 34-bone skeleton, game space, 30 fps).
# Per frame: pelvis position (game space, in place) + local rotation quaternion of every bone (pelvis = world).
# Locomotion clips are cut to one clean gait cycle, made in-place (the root motion becomes `speed`), turned to walk
# along -Z, and phase-aligned (`phase0` = cycle fraction of the left heel strike) so walk/run clips blend in sync.
# usage: tools/.venv-blender/Scripts/python.exe tools/blender/peds/build_clips.py
import os, sys, json, math, struct
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Quaternion, Vector, Matrix
from common import SRC, OUT, BONES, BI, parents, to_game, import_fbx

ANIM = os.path.join(SRC, 'anim')
LOCO = ('walk_', 'run_')


def sample(path):
    arm = import_fbx(path)
    sc = bpy.context.scene
    act = arm.animation_data.action
    f0, f1 = int(round(act.frame_range[0])), int(round(act.frame_range[1]))
    par = parents(arm)
    frames = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        W = [to_game(arm.matrix_world @ arm.pose.bones[n].matrix) for n in BONES]
        frames.append(W)
    rest = [to_game(arm.matrix_world @ arm.data.bones[n].matrix_local) for n in BONES]
    return frames, par, rest, sc.render.fps / sc.render.fps_base


def turn_onto(v, t):
    v = Vector((v.x, 0, v.z))
    if v.length < 1e-5: return Quaternion()
    v.normalize()
    if v.dot(t) < -0.9999: return Quaternion((0, 1, 0), math.pi)
    return v.rotation_difference(t)


def pose_dist(a, b, par):
    d = 0
    for i in range(1, len(BONES)):
        qa = a[par[i]][0].inverted() @ a[i][0]; qb = b[par[i]][0].inverted() @ b[i][0]
        d += 1 - abs(qa.dot(qb))
    return d + abs(a[0][1].y - b[0][1].y) * 2


def build():
    os.makedirs(OUT, exist_ok=True)
    files = sorted(f for f in os.listdir(ANIM) if f.endswith('.fbx'))
    if len(sys.argv) > 1 and sys.argv[-1] == '--quick': files = [f for f in files if 'walk_neutral_01' in f]
    blob = bytearray(); meta = {}
    hip0 = {}
    for fn in files:
        name = fn[:-4]
        frames, par, rest, fps = sample(os.path.join(ANIM, fn))
        g = name[0]
        hip0.setdefault(g, rest[0][1].y)
        n = len(frames)
        loco = any(k in name for k in LOCO)
        info = {'g': g, 'fps': fps, 'loop': True}
        if loco:
            # one clean cycle: the frame (past half the clip) whose pose best matches frame 0
            best, be = 1e9, n - 1
            for e in range(max(8, n // 2), n):
                d = pose_dist(frames[0], frames[e], par)
                if d < best - 1e-6 or (d < best * 1.15 and e > be): best, be = min(best, d), e
            frames = frames[:be + 1]; n = be + 1        # frames[be] ~ frames[0]; drop it on export (n-1 unique)
            disp = frames[-1][0][1] - frames[0][0][1]; disp.y = 0
            dur = (n - 1) / fps
            info['speed'] = disp.length / dur
            qfix = turn_onto(disp, Vector((0, 0, -1)))   # heading of the motion -> -Z
            info['loopErr'] = round(best, 4)
        else:
            L, R = frames[0][BI['Bip01 L Thigh']][1], frames[0][BI['Bip01 R Thigh']][1]
            lat = L - R; lat.y = 0                       # left - right should point to -X
            qfix = turn_onto(lat, Vector((-1, 0, 0)))
        p0 = frames[0][0][1].copy()
        out = []
        m = n - 1 if loco else n
        for k in range(m):
            W = frames[k]
            pr, pp = W[0]
            pos = qfix @ (pp - Vector((p0.x, 0, p0.z)))
            if loco:  # in place: remove the linear drift of the cycle
                drift = qfix @ ((frames[-1][0][1] - frames[0][0][1]) * (k / (n - 1)))
                pos -= Vector((drift.x, 0, drift.z))
            rows = [(qfix @ pr).normalized()]
            for i in range(1, len(BONES)):
                rows.append((W[par[i]][0].inverted() @ W[i][0]).normalized())
            out.append((pos, rows))
        if loco:  # centre the in-place cycle; phase0 = most-forward left-foot frame (heel strike)
            cx = sum(o[0].x for o in out) / m; cz = sum(o[0].z for o in out) / m
            for o in out: o[0].x -= cx; o[0].z -= cz
            lf = BI['Bip01 L Foot']
            zs = []
            for k in range(m):
                W = frames[k]
                drift = (frames[-1][0][1] - frames[0][0][1]) * (k / (n - 1))
                zs.append((qfix @ (W[lf][1] - drift)).z)
            info['phase0'] = zs.index(min(zs)) / m
        # sign continuity of quaternions per bone (for linear blending / nlerp between frames)
        for i in range(len(BONES)):
            for k in range(1, m):
                if out[k][1][i].dot(out[k - 1][1][i]) < 0: out[k][1][i].negate()
        if not loco:  # gestures / idles: 15 fps is plenty (sampled with interpolation), at most 24 s
            out = out[::2][:24 * 15]; m = len(out); info['fps'] = fps / 2
        info['frames'] = m; info['dur'] = m / info['fps']; info['off'] = len(blob)
        for pos, rows in out:
            vals = [int(round(max(-32.767, min(32.767, c)) * 1000)) for c in (pos.x, pos.y, pos.z)]
            for q in rows: vals += [int(round(c * 32767)) for c in (q.x, q.y, q.z, q.w)]
            blob += struct.pack('<%dh' % len(vals), *vals)
        meta[name] = info
        print(name, m, 'frames', '%.2fs' % info['dur'], ('speed %.2f phase0 %.2f err %.3f' % (info['speed'], info['phase0'], info['loopErr'])) if loco else '')
    js = {'fps': 30, 'bones': BONES, 'parents': parents_cache, 'stride': 3 + 4 * len(BONES), 'hip0': hip0, 'clips': meta}
    with open(os.path.join(OUT, 'clips.bin'), 'wb') as f: f.write(blob)
    with open(os.path.join(OUT, 'clips.json'), 'w') as f: json.dump(js, f, indent=0)
    print('clips', len(meta), 'bytes', len(blob))


parents_cache = None
if __name__ == '__main__':
    arm = import_fbx(os.path.join(ANIM, 'm_idle_neutral_01.fbx'))
    parents_cache = parents(arm)
    build()
