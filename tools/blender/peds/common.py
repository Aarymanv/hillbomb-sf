# Shared helpers for the pedestrian pipeline (Rocketbox -> HILLBOMB). Run with tools/.venv-blender python (bpy module).
# GAME SPACE: metres, +X right, +Y up, -Z forward (character faces -Z), feet at y = 0.
# Blender world (after FBX import): Z up, the Rocketbox biped faces -Y, its left side is +X.
#   game = C @ blender  with  C = [[-1,0,0],[0,0,1],[0,1,0]]  (proper rotation, C == C^-1)
import os
import bpy
from mathutils import Matrix, Vector, Quaternion

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SRC = os.path.join(ROOT, 'tools', 'peds_src')
OUT = os.path.join(ROOT, 'public', 'assets', 'peds')
C3 = Matrix(((-1, 0, 0), (0, 0, 1), (0, 1, 0)))

# shared reduced skeleton (34 bones). Order: parents before children. Face / eye / jaw bones fold into the head,
# finger tips into their middle segment, ring + pinky into the middle finger (Finger2), nubs into their parent.
SIDES = ('L', 'R')
BONES = ['Bip01 Pelvis', 'Bip01 Spine', 'Bip01 Spine1', 'Bip01 Spine2', 'Bip01 Neck', 'Bip01 Head']
for s in SIDES:
    BONES += [f'Bip01 {s} Clavicle', f'Bip01 {s} UpperArm', f'Bip01 {s} Forearm', f'Bip01 {s} Hand',
              f'Bip01 {s} Finger0', f'Bip01 {s} Finger01', f'Bip01 {s} Finger1', f'Bip01 {s} Finger11',
              f'Bip01 {s} Finger2', f'Bip01 {s} Finger21']
for s in SIDES:
    BONES += [f'Bip01 {s} Thigh', f'Bip01 {s} Calf', f'Bip01 {s} Foot', f'Bip01 {s} Toe0']
BI = {n: i for i, n in enumerate(BONES)}
FOLD = {}
for s in SIDES:
    FOLD[f'Bip01 {s} Finger02'] = f'Bip01 {s} Finger01'
    FOLD[f'Bip01 {s} Finger12'] = f'Bip01 {s} Finger11'
    FOLD[f'Bip01 {s} Finger22'] = f'Bip01 {s} Finger21'
    for k in ('3', '4'):
        FOLD[f'Bip01 {s} Finger{k}'] = f'Bip01 {s} Finger2'
        FOLD[f'Bip01 {s} Finger{k}1'] = f'Bip01 {s} Finger21'
        FOLD[f'Bip01 {s} Finger{k}2'] = f'Bip01 {s} Finger21'


def reduced(bone):
    """reduced-skeleton name for any Bip01 bone (walks up the parent chain)."""
    b = bone
    while b is not None:
        if b.name in BI: return b.name
        if b.name in FOLD: return FOLD[b.name]
        b = b.parent
    return BONES[0]


def parents(arm):
    out = []
    for n in BONES:
        b = arm.data.bones[n].parent
        while b is not None and b.name not in BI: b = b.parent
        out.append(BI[b.name] if b is not None else -1)
    return out


def to_game(m4):
    """Blender world 4x4 (may carry the 0.01 FBX scale) -> (Quaternion, Vector) in game space."""
    r = m4.to_3x3().normalized()
    rg = C3 @ r @ C3
    return rg.to_quaternion().normalized(), C3 @ m4.to_translation()


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_fbx(path):
    clear()
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False, ignore_leaf_bones=False)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    return arm
