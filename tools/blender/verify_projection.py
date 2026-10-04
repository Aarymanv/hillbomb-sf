"""Verify the interior-mapping camera against the facade-shader contract.

1. Projects the 8 room-box corners with bpy_extras world_to_camera_view and
   compares with  uv = 0.5 + 0.5 * p.xy * C / (C - p.z)  (C = D = 1).
2. Renders small emissive markers at known room points with Cycles (so the
   pixel-aspect handling of the actual renderer is checked too) and compares the
   measured centroids with the formula.

Run: tools/.venv-blender/Scripts/python tools/blender/verify_projection.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import numpy as np
import hb_lib as L


def run(W, H, Dm, rx, ry, label):
    L.reset_factory()
    L.setup_render(rx, ry, samples=16, look='None')
    bpy.context.scene.view_settings.view_transform = 'Standard'
    bpy.context.scene.cycles.use_denoising = False
    L.setup_im_camera(W, H, Dm, rx, ry)
    worst = L.verify_projection(W, H, Dm, rx, ry, label)
    # marker render
    w = bpy.context.scene.world or bpy.data.worlds.new('w')
    bpy.context.scene.world = w
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
    em = L.M('marker', (1, 1, 1), emit=(1, 1, 1), emit_strength=50.0)
    pts = [(-0.5, 0.5, -0.5), (0.5, -0.5, -1.0), (0.9, 0.9, -1.0), (-0.9, -0.9, -0.25), (0.0, 0.0, -1.0), (0.7, -0.3, -0.75)]
    rad = 0.012 * W
    for i, (x, y, z) in enumerate(pts):
        mb = L.MB()
        X, Z, Y = x * W / 2, H / 2 + y * H / 2, -z * Dm
        mb.sphere(X, Y, Z, rad, sz=H / W, seg=24, rings=12)  # squash so it stays round on screen
        mb.obj('mk%d' % i, em, smooth=True)
    path = os.path.join(L.CACHE, 'verify_%s.png' % label)
    L.render_to(path)
    img = L.load_png(path)
    lum = L.luma(img)
    wr = 0.0
    for (x, y, z) in pts:
        u = 0.5 + 0.5 * x / (1 - z); v = 0.5 + 0.5 * y / (1 - z)
        px, py = u * rx, (1 - v) * ry
        r = 20
        x0, x1 = int(max(0, px - r)), int(min(rx, px + r)); y0, y1 = int(max(0, py - r)), int(min(ry, py + r))
        win = lum[y0:y1, x0:x1]
        m = win > 0.5
        if m.sum() == 0:
            print('   marker', (x, y, z), 'NOT FOUND'); wr = 99; continue
        ys, xs = np.nonzero(m)
        cx = xs.mean() + x0 + 0.5; cy = ys.mean() + y0 + 0.5
        e = max(abs(cx - px), abs(cy - py))
        wr = max(wr, e)
        print('   marker p=(%5.2f,%5.2f,%5.2f) expected px=(%.2f, %.2f) rendered=(%.2f, %.2f) err=%.2f px' % (x, y, z, px, py, cx, cy, e))
    print(f'[verify] {label}: corner error {worst:.4f} px, rendered marker error {wr:.2f} px')
    return worst, wr


if __name__ == '__main__':
    a = run(4.0, 3.0, 4.0, 512, 512, 'room_4x3x4_512')
    b = run(8.0, 4.0, 8.0, 1024, 512, 'shop_8x4x8_1024x512')
    ok = a[0] < 1 and b[0] < 1 and a[1] < 1 and b[1] < 1
    print('[verify] PASS' if ok else '[verify] FAIL')
