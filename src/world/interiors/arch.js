// Architectural helpers shared by the buildings: thick walls with openings (outer face + reveals), windows with
// frames / sashes / glazing, exterior trims. A wall is described in its own 2D (u along the wall, v = height):
//   W = { axis: 'z' | 'x', out, inn, u0, u1 }   out/inn = plane coordinates of the outer / inner faces
// For axis 'z' the wall lies in a plane of constant z (u = x); for axis 'x' in a plane of constant x (u = z).
// The outward normal points from inn toward out.

// map (u, v, w) with w = plane coordinate into a local point
const P = (W, u, v, w) => (W.axis === 'z' ? [u, v, w] : [w, v, u]);

// outer face of a wall band (v0..v1) with holes; state (colour, pattern) must be set by the caller
export function outerFace(k, W, v0, v1, holes, sub = 0) {
  const dirOut = Math.sign(W.out - W.inn);
  if (W.axis === 'z') k.wallZ(W.out, W.u0, W.u1, v0, v1, dirOut, holes.map(h => [h[0], h[1], h[2], h[3]]), sub);
  else k.wallX(W.out, W.u0, W.u1, v0, v1, dirOut, holes.map(h => [h[0], h[1], h[2], h[3]]), sub);
}
// inner face of a wall for one room slice (u range and v range), normal pointing inward
export function innerFace(k, W, u0, u1, v0, v1, holes, sub = 0.6) {
  const dirIn = Math.sign(W.inn - W.out);
  const hs = holes.filter(h => h[1] > u0 && h[0] < u1 && h[3] > v0 && h[2] < v1).map(h => [h[0], h[1], h[2], h[3]]);
  if (W.axis === 'z') k.wallZ(W.inn, u0, u1, v0, v1, dirIn, hs, sub);
  else k.wallX(W.inn, u0, u1, v0, v1, dirIn, hs, sub);
}
// the four inner sides of an opening between the outer and inner faces
export function reveal(k, W, h, { bottom = true } = {}) {
  const [u0, u1, v0, v1] = h, a = W.out, b = W.inn;
  const s = Math.sign(W.out - W.inn) * (W.axis === 'z' ? -1 : 1);
  // faces must point into the opening
  const q = (p0, p1, p2, p3) => (s > 0 ? k.quad(p0, p1, p2, p3) : k.quad(p3, p2, p1, p0));
  q(P(W, u0, v1, a), P(W, u1, v1, a), P(W, u1, v1, b), P(W, u0, v1, b));        // head (faces down)
  if (bottom) q(P(W, u1, v0, a), P(W, u0, v0, a), P(W, u0, v0, b), P(W, u1, v0, b)); // sill (faces up)
  q(P(W, u0, v0, a), P(W, u0, v1, a), P(W, u0, v1, b), P(W, u0, v0, b));        // side at u0 (faces +u)
  q(P(W, u1, v1, a), P(W, u1, v0, a), P(W, u1, v0, b), P(W, u1, v1, b));        // side at u1 (faces -u)
}
// box in wall space: u0..u1, v0..v1, w0..w1 (w = plane coordinate)
export function wbox(k, W, u0, u1, v0, v1, w0, w1, faces = 63) {
  const lo = Math.min(w0, w1), hi = Math.max(w0, w1);
  if (W.axis === 'z') k.box(Math.min(u0, u1), v0, lo, Math.max(u0, u1), v1, hi, faces);
  else k.box(lo, v0, Math.min(u0, u1), hi, v1, Math.max(u0, u1), faces);
}
// glazing + sash frame + muntins inside an opening; frame colour set by `frame`, outer trim by `trim`
// o: { frame, trim, rows, cols, sill, cap, glassAt (0..1 between out and inn), trimW, kind: 'sash'|'shop'|'fixed' }
export function windowUnit(k, W, h, o = {}) {
  const [u0, u1, v0, v1] = h;
  const out = W.out, inn = W.inn, dOut = Math.sign(out - inn);
  const gw = out + (inn - out) * (o.glassAt ?? 0.45);
  const fr = o.frame ?? 0xf2ede2, fw = o.frameW ?? 0.06;
  const save = k.save();
  // frame around the glass
  k.c(fr, 0.45);
  const t0 = gw - 0.035, t1 = gw + 0.035;
  wbox(k, W, u0, u1, v1 - fw, v1, t0, t1); wbox(k, W, u0, u1, v0, v0 + fw, t0, t1);
  wbox(k, W, u0, u0 + fw, v0, v1, t0, t1); wbox(k, W, u1 - fw, u1, v0, v1, t0, t1);
  // muntins / meeting rail
  const rows = o.rows ?? 2, cols = o.cols ?? 1;
  for (let r = 1; r < rows; r++) { const v = v0 + (v1 - v0) * r / rows; wbox(k, W, u0, u1, v - (o.rail ?? 0.03), v + (o.rail ?? 0.03), t0 - 0.01, t1 + 0.01); }
  for (let c = 1; c < cols; c++) { const u = u0 + (u1 - u0) * c / cols; wbox(k, W, u - 0.02, u + 0.02, v0, v1, t0, t1); }
  // glass pane
  k.bucket('glass');
  if (W.axis === 'z') k.quad([u0, v0, gw], [u1, v0, gw], [u1, v1, gw], [u0, v1, gw]);
  else k.quad([gw, v0, u0], [gw, v0, u1], [gw, v1, u1], [gw, v1, u0]);
  k.restore(save);
  // outer trim: casing, sill, head cap
  if (o.trim !== null && o.trim !== undefined) {
    const tw = o.trimW ?? 0.12, prj = dOut * 0.06;
    k.c(o.trim, 0.55);
    wbox(k, W, u0 - tw, u0, v0, v1 + tw, out, out + prj); wbox(k, W, u1, u1 + tw, v0, v1 + tw, out, out + prj);
    wbox(k, W, u0 - tw, u1 + tw, v1, v1 + tw, out, out + prj);
    if (o.cap !== false) wbox(k, W, u0 - tw - 0.06, u1 + tw + 0.06, v1 + tw, v1 + tw + 0.07, out, out + dOut * 0.14);
    if (o.sill !== false) wbox(k, W, u0 - tw - 0.03, u1 + tw + 0.03, v0 - 0.07, v0, out - dOut * 0.02, out + dOut * 0.12);
    k.restore(save);
  }
}
