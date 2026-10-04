// Post-processing: scene + ambient occlusion (N8AO, half res + bilateral upsample) -> contact shadows -> wet-surface reflections (SSR, rain only) -> depth of field
// (photo mode only) -> bloom -> grade (vignette, speed blur, contrast, split tone, lens rain drops) -> ACES output ->
// photo finishing (filters, grain, letterbox; photo mode only) -> SMAA.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { N8AOPass } from 'n8ao';
import { HB_WET, HB_NOISE_GLSL, HB_SUN, HB_SUNCOL, HB_KEY } from './fog.js';


const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uVignette: { value: 0.32 }, uSpeed: { value: 0 }, uSat: { value: 1.1 }, uContrast: { value: 1.06 },
    uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 1, 1) }, uTime: { value: 0 }, uDamage: { value: 0 },
    uShadowTint: { value: new THREE.Color(0.93, 0.98, 1.06) }, uHighTint: { value: new THREE.Color(1.05, 1.0, 0.94) }, uGrain: { value: 0.025 },
    uDrops: { value: 0 }, uDropT: { value: 0 }, uAspect: { value: 16 / 9 }, uToe: { value: 0 },
    // atmosphere (AtmosPass fills these; folded into the grade so it costs no extra full-screen pass)
    uAtmosOn: { value: 0 }, tDepthA: { value: null }, tRays: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uViewInv: { value: new THREE.Matrix4() },
    uSun: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uFogCol: { value: new THREE.Color() },
    uSunUv: { value: new THREE.Vector2() }, uRays: { value: 0 }, uGlare: { value: 0 }, uMist: { value: 0 }, uMistBase: { value: 0 }, uMistH: { value: 14 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVignette, uSpeed, uSat, uContrast, uFlash, uTime, uDamage, uGrain, uDrops, uDropT, uAspect, uToe; uniform float uAtmosOn;
  uniform sampler2D tDepthA, tRays; uniform mat4 uProjInv, uViewInv; uniform vec3 uSun, uCam, uSunCol, uFogCol;
  uniform vec2 uSunUv; uniform float uRays, uGlare, uMist, uMistBase, uMistH;
  vec3 hbAtmos(vec3 col, vec2 vUv){
          if (uMist > 0.0) {
            // ground mist: a layer ~uMistH thick lying on the ground
            float d = texture2D(tDepthA, vUv).r;
            vec4 p = uProjInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vec3 wp = (uViewInv * vec4(p.xyz / p.w, 1.0)).xyz;
            vec3 dir = normalize(wp - uCam);
            float dist = d >= 0.99999 ? 2500.0 : min(length(wp - uCam), 2500.0);
            wp = uCam + dir * dist;
            // the ray's last stretch runs through the layer lying on the ground it hits: path length ~ H / |dir.y|
            // (valleys below the camera's ground level count as ground too; tree tops / roofs above it thin out)
            float endK = exp(-max(wp.y - min(wp.y, uMistBase), 0.0) / uMistH);
            float len = min(dist, uMistH * 1.5 / max(abs(dir.y), 0.08));
            float m = (1.0 - exp(-uMist * 0.006 * len * endK)) * (1.0 - 0.7 * smoothstep(900.0, 2500.0, dist));
            m *= exp(-max(uMistBase - wp.y, 0.0) / 30.0);   // the valley far below a hilltop is not inside the camera's mist
            float mu = dot(dir, uSun);
            vec3 mc = uFogCol * 1.05 + uSunCol * (pow(max(mu, 0.0), 6.0) * 0.8 + 0.06);
            col = mix(col, mc, m * smoothstep(0.5, 8.0, dist));
          }
          col += texture2D(tRays, vUv).rgb * uRays;                       // light shafts
          if (uGlare > 0.0) {
            // sun glare: soft core + anamorphic streak + ghosts along the sun -> centre axis
            float vis = 0.0;                                             // how much of the disc is open sky
            for (int j = 0; j < 5; j++) { vec2 o = vec2(j == 1 ? 0.012 : j == 2 ? -0.012 : 0.0, j == 3 ? 0.02 : j == 4 ? -0.02 : 0.0); vis += step(0.99999, texture2D(tDepthA, clamp(uSunUv + o, 0.0, 1.0)).r); }
            vis *= 0.2;
            vec2 q = (vUv - uSunUv) * vec2(uAspect, 1.0); float rr = length(q);
            float g = exp(-rr * 12.0) * 0.3 + exp(-rr * 3.0) * 0.05 + exp(-abs(q.y) * 110.0) * exp(-abs(q.x) * 2.6) * 0.18;
            vec2 ax = vec2(0.5) - uSunUv;
            for (int i = 1; i <= 3; i++) {
              vec2 c = (uSunUv + ax * float(i) * 1.1 - vUv) * vec2(uAspect, 1.0);
              float s = 0.03 + 0.03 * float(i);
              g += smoothstep(s, s * 0.7, length(c)) * (i == 2 ? 0.05 : 0.03);
            }
            col += uSunCol * g * uGlare * vis;
          }
    return col;
  }
 uniform vec3 uFlashCol, uShadowTint, uHighTint; varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  // rain drops sitting on the lens: each cell may hold a drop that beads up, lingers and evaporates; a drop is a tiny
  // inverted lens (refracts the scene) with a darker rim
  vec2 lensDrops(vec2 uv, out float mask){
    vec2 offs = vec2(0.0); mask = 0.0;
    for (int L = 0; L < 2; L++) {
      float sc = L == 0 ? 8.0 : 14.0;
      vec2 g = vec2(uv.x * uAspect, uv.y) * sc; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
      float hh = h(id + float(L) * 17.3);
      if (hh > uDrops * 0.45) continue;
      float life = fract(uDropT * (0.035 + 0.06 * h(id + 2.2)) + hh * 7.0);
      float amt = smoothstep(0.0, 0.04, life) * (1.0 - smoothstep(0.55, 1.0, life));
      vec2 c = (vec2(h(id + 3.1), h(id + 5.7)) - 0.5) * 0.55;
      float r = (0.08 + 0.16 * h(id + 9.1)) * (L == 0 ? 1.0 : 0.8);
      vec2 d = f - c; d.y *= 1.15;
      float q = length(d) / r;
      if (q < 1.0) {
        float bulge = sqrt(1.0 - q * q);
        float edge = smoothstep(1.0, 0.6, q);                       // out of focus: soft rim
        offs += -d / sc * vec2(1.0 / uAspect, 1.0) * (0.6 + 0.5 * bulge) * amt * edge;
        mask = max(mask, amt * edge);
      }
    }
    return offs;
  }
  void main(){
    vec2 c = vUv - 0.5;
    vec2 uv = vUv; float dm = 0.0;
    if (uDrops > 0.01) { vec2 o = lensDrops(vUv, dm); uv = vUv + o; }
    vec3 col = texture2D(tDiffuse, uv).rgb;
    if (uAtmosOn > 0.5) col = hbAtmos(col, vUv);
    if (uSpeed > 0.01) {
      vec3 acc = col; float w = 1.0;
      float edge = smoothstep(0.12, 0.62, length(c));
      for (int i = 1; i < 9; i++) { float t = float(i) / 9.0; acc += texture2D(tDiffuse, 0.5 + c * (1.0 - t * 0.075 * uSpeed * edge)).rgb; w += 1.0; }
      col = acc / w;
    }
    if (dm > 0.0) col = mix(col, texture2D(tDiffuse, uv + vec2(0.0015, 0.002)).rgb * 0.5 + col * 0.5, dm * 0.6);   // drops blur a little
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(l), col, uSat);
    // split toning in linear HDR: cool shadows, warm highlights
    float hl = smoothstep(0.05, 1.2, l);
    col *= mix(uShadowTint, uHighTint, hl);
    col = max((col - 0.18) * uContrast + 0.18, 0.0);
    col *= l / (l + uToe);                                   // toe: deep blacks (wet night)
    float v = smoothstep(0.9, 0.22, length(c * vec2(1.0, 0.82)));
    col *= mix(1.0, v, uVignette);
    col = mix(col, uFlashCol, uFlash);
    col = mix(col, vec3(0.45, 0.0, 0.0), uDamage * smoothstep(0.3, 0.75, length(c)) * 0.6);
    col += (h(vUv * 1024.0 + fract(uTime * 7.13)) - 0.5) * uGrain * (0.3 + l);
    gl_FragColor = vec4(col, 1.0);
  }`,
};

// photo finishing (after tone mapping, display-referred): colour looks, extra vignette, grain, letterbox
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null }, uMat: { value: new THREE.Matrix3() }, uLift: { value: new THREE.Vector3() }, uGamma: { value: new THREE.Vector3(1, 1, 1) },
    uGain: { value: new THREE.Vector3(1, 1, 1) }, uMix: { value: 1 }, uGrain: { value: 0 }, uVig: { value: 0 }, uBars: { value: 0 }, uBarsX: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 16 / 9 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform mat3 uMat; uniform vec3 uLift, uGamma, uGain; uniform float uMix, uGrain, uVig, uBars, uBarsX, uTime, uAspect; varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main(){
    vec4 src = texture2D(tDiffuse, vUv);
    vec3 c = clamp(uMat * src.rgb, 0.0, 1.0);
    c = pow(max(c * uGain + uLift * (1.0 - c), 0.0), 1.0 / uGamma);
    c = mix(src.rgb, c, uMix);
    vec2 q = vUv - 0.5;
    c *= mix(1.0, smoothstep(0.95, 0.25, length(q * vec2(1.0, 0.85))), uVig);
    float g = h(vUv * vec2(1731.0, 977.0) + fract(uTime * 11.7)) + h(vUv * vec2(613.0, 1409.0) - fract(uTime * 5.3)) - 1.0;
    c += g * uGrain * (0.35 + 0.65 * (1.0 - abs(dot(c, vec3(0.333)) * 2.0 - 1.0)));
    c *= step(uBars, vUv.y) * step(vUv.y, 1.0 - uBars) * step(uBarsX, vUv.x) * step(vUv.x, 1.0 - uBarsX);
    gl_FragColor = vec4(c, src.a);
  }`,
};

// ---------------------------------------------------------------- wet-surface screen-space reflections
// Rain only. For up-facing pixels (normal reconstructed from depth), march the reflected view ray through the depth
// buffer at half resolution; puddles (same field as the material) reflect sharply, damp asphalt gives long vertical
// streaks (anisotropic blur along screen Y) -> streetlights, neon and headlights smeared across the wet road.
// Screen-space contact shadows (sun / moon): a short depth-buffer march toward the key light from every lit pixel
// catches what the shadow maps are too coarse for (kerbs, tyres on the road, poles, window recesses, props, people).
// The forward renderer has no separate direct-light buffer, so the pass darkens the frame by the key light's share of
// the pixel's lighting (HB_KEY.w: sun vs sky, from environment.js) times N.L (normals from depth).
class ContactShadowPass extends Pass {
  constructor(camera, getDepth) {
    super();
    this.camera = camera; this.getDepth = getDepth; this.needsSwap = true;
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() },
        uL: { value: new THREE.Vector3() }, uW: { value: 0 }, uRes: { value: new THREE.Vector2() } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse, tDepth; uniform mat4 uProj, uProjInv; uniform vec3 uL; uniform float uW; uniform vec2 uRes; varying vec2 vUv;
        vec3 vpos(vec2 uv, float d){ vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          float d = texture2D(tDepth, vUv).r;
          if (d >= 0.99999 || uW < 0.01) { gl_FragColor = c; return; }
          vec3 P = vpos(vUv, d);
          vec3 px = vpos(vUv + vec2(1.0 / uRes.x, 0.0), texture2D(tDepth, vUv + vec2(1.0 / uRes.x, 0.0)).r) - P;
          vec3 py = vpos(vUv + vec2(0.0, 1.0 / uRes.y), texture2D(tDepth, vUv + vec2(0.0, 1.0 / uRes.y)).r) - P;
          vec3 N = normalize(cross(px, py));
          float ndl = dot(N, uL);
          float dist = -P.z;
          if (ndl < 0.04 || dist > 220.0) { gl_FragColor = c; return; }
          float len = 0.5 + dist * 0.012, th = 0.25 + dist * 0.006;
          float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          vec3 O = P + N * (0.02 + dist * 0.0012);
          float occ = 0.0;
          for (int i = 0; i < 12; i++) {
            float t = len * (float(i) + jit) / 12.0;
            vec3 R = O + uL * t;
            vec4 q = uProj * vec4(R, 1.0); vec2 uv = q.xy / q.w * 0.5 + 0.5;
            if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
            float sd = texture2D(tDepth, uv).r;
            if (sd >= 0.99999) continue;
            float sz = vpos(uv, sd).z;
            float dz = sz - R.z;                                  // > 0: the surface there is in front of the ray point
            if (dz > 0.01 && dz < th) { occ = 1.0 - float(i) / 14.0; break; }
          }
          float k = occ * uW * smoothstep(0.04, 0.3, ndl) * (1.0 - smoothstep(120.0, 220.0, dist)) * 0.8;
          gl_FragColor = vec4(c.rgb * (1.0 - k), c.a);
        }`,
      depthTest: false, depthWrite: false,
    }));
  }
  render(renderer, writeBuffer, readBuffer) {
    const U = this.quad.material.uniforms, cam = this.camera;
    U.tDiffuse.value = readBuffer.texture; U.tDepth.value = this.getDepth(readBuffer);
    U.uProj.value.copy(cam.projectionMatrix); U.uProjInv.value.copy(cam.projectionMatrixInverse);
    U.uL.value.set(HB_KEY.x, HB_KEY.y, HB_KEY.z).transformDirection(cam.matrixWorldInverse);
    U.uW.value = HB_KEY.w; U.uRes.value.set(readBuffer.width, readBuffer.height);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(renderer);
  }
  dispose() { this.quad.dispose(); }
}

class WetReflectionPass extends Pass {
  constructor(camera, getDepth, getGloss) {
    super();
    this.camera = camera; this.getDepth = getDepth; this.getGloss = getGloss; this.needsSwap = true;
    const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rtT = new THREE.WebGLRenderTarget(4, 4, rtOpts); this.rtA = new THREE.WebGLRenderTarget(4, 4, rtOpts); this.rtB = new THREE.WebGLRenderTarget(4, 4, rtOpts);
    this.trace = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tDepth: { value: null }, tGloss: { value: null }, uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() },
        uView: { value: new THREE.Matrix4() }, uViewInv: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2() }, uWet: { value: HB_WET }, uGloss: { value: 1 },
        // Chinatown street mirror (streetmirror.js): planar reflection of the hero street run under the camera
        tMirror: { value: null }, uMirMat: { value: new THREE.Matrix4() }, uMirOn: { value: 0 }, uMirPlane: { value: new THREE.Vector4(0, 1, 0, 0) },
        uMirBox: { value: new THREE.Vector4() }, uMirExt: { value: new THREE.Vector2() } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tColor, tDepth, tGloss; uniform mat4 uProj, uProjInv, uView, uViewInv; uniform vec2 uRes; uniform vec4 uWet; uniform float uGloss; varying vec2 vUv;
        uniform sampler2D tMirror; uniform mat4 uMirMat; uniform float uMirOn; uniform vec4 uMirPlane, uMirBox; uniform vec2 uMirExt;
        ${HB_NOISE_GLSL}
        vec3 viewPos(vec2 uv){ float d = texture2D(tDepth, uv).r; vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
        void main(){
          float d0 = texture2D(tDepth, vUv).r;
          if (d0 >= 0.99999) { gl_FragColor = vec4(0.0); return; }
          vec3 p0 = viewPos(vUv);
          float vd = -p0.z;                                    // near field only: far away the depth buffer is too
          if (vd > 260.0) { gl_FragColor = vec4(0.0); return; }  // coarse (self-hits) and the reflections are tiny
          vec2 px = 1.0 / uRes;
          vec3 pr = viewPos(vUv + vec2(px.x, 0.0)), pl = viewPos(vUv - vec2(px.x, 0.0)), pu = viewPos(vUv + vec2(0.0, px.y)), pd = viewPos(vUv - vec2(0.0, px.y));
          vec3 dx = abs(pr.z - p0.z) < abs(p0.z - pl.z) ? pr - p0 : p0 - pl;
          vec3 dy = abs(pu.z - p0.z) < abs(p0.z - pd.z) ? pu - p0 : p0 - pd;
          vec3 nV = normalize(cross(dx, dy));
          if (dot(nV, p0) > 0.0) nV = -nV;                 // face the camera
          vec3 nW = (uViewInv * vec4(nV, 0.0)).xyz;
          float up = smoothstep(0.86, 0.97, nW.y);
          vec3 wp = (uViewInv * vec4(p0, 1.0)).xyz;
          float gl = (1.0 - texture2D(tGloss, vUv).a) * uGloss;   // gloss G-buffer (fog.js): car paint, glass, polished stone
          bool road = up > 0.0 && wp.y >= 0.3 && uWet.x > 0.04;                  // the sea has its own planar reflection
          if (!road && gl < 0.06) { gl_FragColor = vec4(0.0); return; }
          vec3 V = normalize(p0);
          float pud = 0.0, F, k, blurA;
          vec4 mir = vec4(0.0);
          if (road) {
            // standing water from the lit pass itself (gloss G-buffer: puddles are roughness ~0.03, the damp film on
            // asphalt ~0.3-0.5), so the mirror follows the ruts / gutters / dips the surface shaders put the water in
            // (road 3) standing water only: puddles are roughness 0.025 (gloss 0.996), the damp film >= 0.07 (gloss <= 0.988), so
            // the old 0.8..0.97 ramp counted the glossiest film as half-puddle and blurred real puddles at their soft rims
            pud = smoothstep(0.989, 0.994, gl);
            float film = smoothstep(0.05, 0.75, gl);
            // ripple / micro-roughness jitter of the normal
            // (both fade out with distance: at grazing angles one pixel spans many ripple rings / jitter cells, which
            // would alias into grey speckle down the street)
            // (road 2, 10/2) no per-pixel hash jitter of the normal any more (it was the pixel 'sparkle' / red dots: every
            // pixel reflected a slightly different spot, at half res). The rough film is the roughness-driven anisotropic
            // blur below; ripples stay, only inside standing water near the camera
            vec2 rp = hbRipple(wp.xz, uWet.y, uWet.z) * uWet.z * 0.35 * pud * (1.0 - smoothstep(6.0, 22.0, vd));
            nV = normalize((uView * vec4(normalize(vec3(rp.x, 1.0, rp.y)), 0.0)).xyz);
            F = 0.02 + 0.98 * pow(1.0 - max(dot(-V, nV), 0.0), 5.0);
            // wet asphalt: a streaked sheen where the film is, a sharp mirror only in standing water
            k = uWet.x * up * mix(0.14 + 0.42 * film, 1.0, pud) * min(1.0, F * 2.2 + 0.12);
            blurA = mix(mix(0.75, 0.5, film), 0.02, pud);         // roughness -> streak length (puddles mirror-sharp: the composite takes the unblurred trace below 0.03)
            if (uMirOn > 0.0) {      // hero street mirror: inside the run's carriageway, near its plane
              float pdist = dot(uMirPlane.xyz, wp) + uMirPlane.w;
              vec2 rel = wp.xz - uMirBox.xy; float al = dot(rel, uMirBox.zw), lat = abs(rel.x * uMirBox.w - rel.y * uMirBox.z);
              if (abs(pdist) < 0.55 && abs(al) < uMirExt.x && lat < uMirExt.y) {
                vec4 mc = uMirMat * vec4(wp, 1.0); vec2 muv = mc.xy / mc.w + rp * 0.004;     // (flicker: the animated rain ripples barely move the mirror lookup)
                float mz = uMirOn * (1.0 - smoothstep(uMirExt.y - 0.6, uMirExt.y, lat)) * (1.0 - smoothstep(0.3, 0.55, abs(pdist))) * (1.0 - smoothstep(uMirExt.x - 20.0, uMirExt.x, abs(al)));
                // the hero street is soaked: a stronger, more mirror-like sheen than the generic damp film
                // puddles: world-space patches (same field as the darkening decal, world/landmarks/v2/ct_street.js):
                // standing water = mirror-sharp and strong, the broken asphalt between = a softer, weaker sheen
                vec2 pq = wp.xz * 0.21; vec2 pi = floor(pq), pf = fract(pq); pf = pf * pf * (3.0 - 2.0 * pf);
                float pn = mix(mix(hbH21(pi), hbH21(pi + vec2(1.0, 0.0)), pf.x), mix(hbH21(pi + vec2(0.0, 1.0)), hbH21(pi + vec2(1.0)), pf.x), pf.y);
                float ctPud = smoothstep(0.55, 0.72, pn) * (1.0 - smoothstep(35.0, 90.0, vd));
                k = mix(k, uWet.x * up * min(1.0, F * 2.2 + mix(0.5, 0.95, ctPud)), 0.9 * mz);
                blurA = mix(blurA, mix(0.45, 0.03, ctPud), 0.85 * mz);   // long streaks on the asphalt, mirror-sharp puddles
                if (muv.x > 0.002 && muv.y > 0.002 && muv.x < 0.998 && muv.y < 0.998) {
                  mir = texture2D(tMirror, muv);
                  mir.a = clamp(mir.a, 0.0, 1.0) * mz;
                }
              }
            }
          } else {
            // lacquer / glass: dielectric Fresnel on the depth-reconstructed normal, beaded with rain (slight jitter)
            nV = normalize(nV + (vec3(hbH21(vUv * 913.0 + uWet.y), hbH21(vUv * 577.0 - uWet.y), 0.5) - 0.5) * 0.02 * uWet.z);
            F = 0.04 + 0.96 * pow(1.0 - max(dot(-V, nV), 0.0), 5.0);
            k = gl * min(1.0, F * 1.6 + 0.08) * 0.9;
            blurA = 0.06;
          }
          vec3 R = reflect(V, nV);
          if (R.z > 0.25) { gl_FragColor = vec4(0.0); return; }
          float t = 0.2 + vd * 0.003, jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * (1.0 - smoothstep(8.0, 30.0, vd)) * (1.0 - mir.a);   // static interleaved-gradient jitter (no time term: still camera = still image)   // no jitter over the mirror: the hit / miss edge would flicker between SSR and mirror   // coherent far away (no speckle)
          vec3 hitCol = vec3(0.0); float hit = 0.0; float tPrev = 0.0;
          for (int i = 0; i < 56; i++) {
            tPrev = t; t *= 1.12; float tt = t * (1.0 + jit * 0.1);
            vec3 q = p0 + R * tt;
            vec4 cq = uProj * vec4(q, 1.0); vec2 uv = cq.xy / cq.w * 0.5 + 0.5;
            if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
            vec3 sv = viewPos(uv);
            float dz = sv.z - q.z;                       // > 0: the ray went behind the depth surface
            // a flat water film can't see itself: on the road, a 'hit' on ground at the same level is a self-hit of the
            // grazing ray (depth precision), which would speckle the street grey far away. Keep marching.
            if (road && dz > 0.0 && (uViewInv * vec4(sv, 1.0)).y - wp.y < 0.12 + 0.015 * tt) continue;
            if (dz > 0.0 && dz < 0.8 + tt * 0.06) {
              // binary refinement between the last miss and this hit -> crisp mirror edges
              float a = tPrev, b = tt;
              for (int k = 0; k < 5; k++) {
                float m = 0.5 * (a + b); vec3 qm = p0 + R * m; vec4 cm = uProj * vec4(qm, 1.0); vec2 um = cm.xy / cm.w * 0.5 + 0.5;
                if (viewPos(um).z - qm.z > 0.0) { b = m; uv = um; } else a = m;
              }
              vec2 e = smoothstep(0.0, 0.06, uv) * smoothstep(1.0, 0.94, uv);
              hitCol = texture2D(tColor, uv).rgb; hit = e.x * e.y * (1.0 - smoothstep(70.0, 260.0, b));
              break;
            }
          }
          k *= 1.0 - smoothstep(150.0, 260.0, vd);
          vec3 rc = min(mix(mir.rgb * mir.a, hitCol, hit), vec3(40.0));
          // (road 2) rough wet film: lights / neon / lit glass carry the streaks, dim diffuse surfaces (lit sidewalks,
          // facades, the grey rain sky) fade to a faint veil instead of a milky sheet; standing water mirrors everything
          if (road) { float Lr = dot(rc, vec3(0.3, 0.59, 0.11)); rc *= mix(1.0, 1.6 * Lr / (Lr + 0.4), smoothstep(0.08, 0.35, blurA)); }
          // screen-space hits win (cars, near facades: correct occlusion, no floating cars); the mirror fills the misses
          gl_FragColor = vec4(rc * k, max(blurA, 0.02));   // a > 0 = reflective pixel (blur mask), a = roughness
        }`,
      depthTest: false, depthWrite: false,
    }));
    // roughness-driven anisotropic blur (road 2, 10/2): the trace's alpha is the roughness (0 = not reflective). Wet asphalt
    // stretches every reflection along screen Y (microfacets at grazing angles), so the vertical kernel is long (up to
    // ~11 % of the screen height for the rough film, a few px for puddles) and the horizontal one short. Masked gather:
    // only reflective pixels contribute and the weights renormalise, so no reflection bleeds onto cars / kerbs / walls.
    // Runs at half resolution; the composite takes the full-res trace where the surface is mirror-smooth.
    this.blur = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() }, uLen: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uDir; uniform float uLen; varying vec2 vUv;
        void main(){ vec4 c0 = texture2D(tSrc, vUv); float r = c0.a;
          if (r <= 0.004) { gl_FragColor = vec4(0.0); return; }
          float len = uLen * r;                        // kernel half-length in target pixels
          vec3 acc = c0.rgb; float w = 1.0;
          for (int i = 1; i <= 10; i++) { float fi = float(i) / 10.0; float wi = exp(-fi * fi * 2.6);
            vec4 a = texture2D(tSrc, vUv + uDir * fi * len), b = texture2D(tSrc, vUv - uDir * fi * len);
            float ma = step(0.004, a.a) * wi, mb = step(0.004, b.a) * wi;
            acc += a.rgb * ma + b.rgb * mb; w += ma + mb; }
          gl_FragColor = vec4(acc / w, r); }`,
      depthTest: false, depthWrite: false,
    }));
    this.comp = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tRefl: { value: null }, tSharp: { value: null }, tGloss: { value: null }, uDebug: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse, tRefl, tSharp, tGloss; uniform float uDebug; varying vec2 vUv;
        void main(){ vec4 c = texture2D(tDiffuse, vUv); vec4 sh = texture2D(tSharp, vUv); vec3 bl = texture2D(tRefl, vUv).rgb;
          // mirror-smooth water: the full-res trace; rough film: the blurred (streaked) one
          vec3 r = sh.a <= 0.004 ? vec3(0.0) : mix(sh.rgb, bl, smoothstep(0.03, 0.14, sh.a));
          gl_FragColor = vec4(uDebug > 1.5 ? vec3(1.0 - texture2D(tGloss, vUv).a) : uDebug > 0.5 ? r * 4.0 : c.rgb + r, c.a); }`,
      depthTest: false, depthWrite: false,
    }));
  }
  setSize(w, h) {
    const d = this.fullRes ? 1 : 2, tw = Math.max(2, Math.round(w / d)), th = Math.max(2, Math.round(h / d));
    this.rtT.setSize(tw, th);
    const hw = Math.max(2, Math.round(w / 2)), hh = Math.max(2, Math.round(h / 2)); this.rtA.setSize(hw, hh); this.rtB.setSize(hw, hh);
    this.full = new THREE.Vector2(w, h);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.preTrace?.(renderer);
    const depth = this.getDepth(readBuffer);
    const cam = this.camera, U = this.trace.material.uniforms;
    U.tColor.value = readBuffer.texture; U.tDepth.value = depth; U.tGloss.value = this.getGloss(readBuffer);
    U.uProj.value.copy(cam.projectionMatrix); U.uProjInv.value.copy(cam.projectionMatrixInverse);
    U.uView.value.copy(cam.matrixWorldInverse); U.uViewInv.value.copy(cam.matrixWorld);
    U.uRes.value.set(readBuffer.width, readBuffer.height);
    renderer.setRenderTarget(this.rtT); this.trace.render(renderer);
    // streaks: two long vertical passes (the 2nd fills the 1st one's tap gaps), then a short horizontal one
    const B = this.blur.material.uniforms, H = this.rtA.height, Wd = this.rtA.width;
    B.tSrc.value = this.rtT.texture; B.uDir.value.set(0, 1 / H); B.uLen.value = H * 0.11; renderer.setRenderTarget(this.rtA); this.blur.render(renderer);
    B.tSrc.value = this.rtA.texture; B.uDir.value.set(0, 1 / H); B.uLen.value = H * 0.03; renderer.setRenderTarget(this.rtB); this.blur.render(renderer);
    B.tSrc.value = this.rtB.texture; B.uDir.value.set(1 / Wd, 0); B.uLen.value = H * 0.012; renderer.setRenderTarget(this.rtA); this.blur.render(renderer);
    const C = this.comp.material.uniforms; C.tDiffuse.value = readBuffer.texture; C.tRefl.value = this.rtA.texture; C.tSharp.value = this.rtT.texture; C.tGloss.value = U.tGloss.value;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.comp.render(renderer);
  }
  dispose() { this.rtT.dispose(); this.rtA.dispose(); this.rtB.dispose(); this.trace.dispose(); this.blur.dispose(); this.comp.dispose(); }
}

// ---------------------------------------------------------------- atmosphere: god rays, sun glare, ground mist
// Screen-space light shafts (GPU Gems 3 ch. 13): bright sky pixels near the sun -> quarter-res mask -> two radial
// blur passes toward the sun's screen position -> added in the sun's haze colour, so canopies, towers and cloud gaps
// cast shafts through the air. The sun itself gets a soft glare, an anamorphic streak and faint ghosts while it is on
// screen. Ground mist: a thin exponential layer above the ground level under the camera (parks, hills, mornings), lit
// by the sun's forward-scatter lobe. Driven by fog.js HB_SUN (0 at night) and api.atmosParams.
const FSQ_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const smooth01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
class AtmosPass extends Pass {
  constructor(camera, getDepth, fogColor) {
    super();
    this.camera = camera; this.getDepth = getDepth; this.fogColor = fogColor; this.needsSwap = false; this.grade = null;
    this.rays = 0; this.mist = 0; this.mistBase = 0; this.mistH = 14; this.glare = 1;
    const o = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rtA = new THREE.WebGLRenderTarget(4, 4, o); this.rtB = new THREE.WebGLRenderTarget(4, 4, o);
    this.sunUv = new THREE.Vector2(); this._v = new THREE.Vector4();
    const common = () => ({ uProjInv: { value: new THREE.Matrix4() }, uViewInv: { value: new THREE.Matrix4() }, uSun: { value: new THREE.Vector3() } });
    this.mask = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tDepth: { value: null }, ...common() },
      vertexShader: FSQ_VS,
      fragmentShader: `uniform sampler2D tColor, tDepth; uniform mat4 uProjInv, uViewInv; uniform vec3 uSun; varying vec2 vUv;
        void main(){
          float d = texture2D(tDepth, vUv).r;
          vec4 p = uProjInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0); vec3 dir = normalize((uViewInv * vec4(p.xyz / p.w, 0.0)).xyz);
          float sky = smoothstep(0.9995, 0.99999, d);
          float mu = max(dot(dir, uSun), 0.0);
          vec3 c = min(texture2D(tColor, vUv).rgb, vec3(2.5));
          gl_FragColor = vec4(c * sky * (pow(mu, 16.0) * 0.55 + pow(mu, 4.0) * 0.08), sky);
        }`,
      depthTest: false, depthWrite: false,
    }));
    this.radial = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uSunUv: { value: new THREE.Vector2() }, uStep: { value: 1 } },
      vertexShader: FSQ_VS,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uSunUv; uniform float uStep; varying vec2 vUv;
        void main(){
          vec2 dv = (uSunUv - vUv) * uStep / 28.0; vec2 uv = vUv; vec4 acc = vec4(0.0); float w = 1.0, ws = 0.0;
          for (int i = 0; i < 28; i++) { acc += texture2D(tSrc, uv) * w; ws += w; w *= 0.955; uv += dv; }
          gl_FragColor = acc / ws;
        }`,
      depthTest: false, depthWrite: false,
    }));
  }
  setSize(w, h) { const q = (n) => Math.max(2, Math.round(n / 4)); this.rtA.setSize(q(w), q(h)); this.rtB.setSize(q(w), q(h)); this.aspect = w / Math.max(1, h); }
  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera, depth = this.getDepth(readBuffer), sun = HB_SUN;
    const v = this._v.set(cam.position.x + sun.x * 1e4, cam.position.y + sun.y * 1e4, cam.position.z + sun.z * 1e4, 1).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
    this.sunUv.set(v.x / v.w * 0.5 + 0.5, v.y / v.w * 0.5 + 0.5);
    const off = v.w > 0 ? Math.max(Math.abs(this.sunUv.x - 0.5), Math.abs(this.sunUv.y - 0.5)) : 9;
    // visibility of the sun disc itself (sky at its screen position) gates the glare
    const rayK = this.rays * sun.w * (1 - smooth01(0.7, 1.4, off));
    const set = (U) => { U.uProjInv.value.copy(cam.projectionMatrixInverse); U.uViewInv.value.copy(cam.matrixWorld); U.uSun.value.set(sun.x, sun.y, sun.z); };
    if (rayK > 0.002) {
      const M = this.mask.material.uniforms; set(M); M.tColor.value = readBuffer.texture; M.tDepth.value = depth;
      renderer.setRenderTarget(this.rtA); this.mask.render(renderer);
      const R = this.radial.material.uniforms; R.uSunUv.value.copy(this.sunUv);
      R.tSrc.value = this.rtA.texture; R.uStep.value = 0.9; renderer.setRenderTarget(this.rtB); this.radial.render(renderer);
      R.tSrc.value = this.rtB.texture; R.uStep.value = 0.25; renderer.setRenderTarget(this.rtA); this.radial.render(renderer);
    }
    const C = this.grade.uniforms; set(C);
    C.tDepthA.value = depth; C.tRays.value = this.rtA.texture;
    C.uCam.value.copy(cam.position); C.uSunUv.value.copy(this.sunUv); C.uSunCol.value.copy(HB_SUNCOL); C.uFogCol.value.copy(this.fogColor());
    C.uRays.value = rayK > 0.002 ? rayK : 0;
    C.uGlare.value = this.glare * sun.w * (1 - smooth01(0.45, 0.62, off));
    C.uMist.value = this.mist; C.uMistBase.value = this.mistBase; C.uMistH.value = this.mistH;
  }
  dispose() { this.rtA.dispose(); this.rtB.dispose(); this.mask.dispose(); this.radial.dispose(); }
}

// ---------------------------------------------------------------- bokeh depth of field (photo mode)
class BokehPass extends Pass {
  constructor(camera, getDepth) {
    super();
    this.camera = camera; this.getDepth = getDepth; this.needsSwap = true; this.enabled = false;
    this.focus = 10; this.fstop = 2.8; this.maxBlur = 1;
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uNear: { value: 0.25 }, uFar: { value: 9000 }, uFocus: { value: 10 }, uScale: { value: 10 }, uMax: { value: 24 }, uRes: { value: new THREE.Vector2() } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse, tDepth; uniform float uNear, uFar, uFocus, uScale, uMax; uniform vec2 uRes; varying vec2 vUv;
        float lin(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
        float coc(float z){ return clamp(uScale * abs(1.0 - uFocus / z), 0.0, uMax); }   // blur radius in pixels
        void main(){
          float z0 = lin(texture2D(tDepth, vUv).r); float c0 = coc(z0);
          vec3 acc = texture2D(tDiffuse, vUv).rgb; float wsum = 1.0;
          const int N = 72; const float GA = 2.39996323;
          for (int i = 1; i < N; i++) {
            float fi = float(i); float r = sqrt(fi / float(N)) * uMax;
            vec2 o = vec2(cos(fi * GA), sin(fi * GA)) * r;
            vec2 uv = vUv + o / uRes;
            float z = lin(texture2D(tDepth, uv).r); float c = coc(z);
            // background can't bleed over a sharper foreground
            if (z > z0) c = min(c, c0 * 1.6 + 0.5);
            float w = smoothstep(r - 1.0, r + 0.5, c);
            vec3 s = texture2D(tDiffuse, uv).rgb;
            float lum = dot(s, vec3(0.2126, 0.7152, 0.0722));
            w *= 1.0 + smoothstep(1.5, 8.0, lum) * 2.0;              // bright highlights -> bokeh discs
            acc += s * w; wsum += w;
          }
          vec3 blurred = acc / wsum;
          gl_FragColor = vec4(mix(texture2D(tDiffuse, vUv).rgb, blurred, smoothstep(0.4, 1.5, c0 + 0.6)), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    }));
  }
  render(renderer, writeBuffer, readBuffer) {
    const U = this.quad.material.uniforms, cam = this.camera;
    U.tDiffuse.value = readBuffer.texture; U.tDepth.value = this.getDepth(readBuffer);
    U.uNear.value = cam.near; U.uFar.value = cam.far; U.uFocus.value = Math.max(0.3, this.focus);
    // thin-lens circle of confusion on a full-frame (36 x 24 mm) sensor whose vertical FOV matches the camera:
    // radius_px(z) = f^2 / (N (s - f)) * |1 - s / z| * H_px / 24mm / 2, times an artistic strength (default 2.5)
    const H = readBuffer.height, f = 0.012 / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), s = Math.max(f * 1.5, this.focus);
    U.uScale.value = Math.min(90, (f * f) / (this.fstop * (s - f)) * H / 0.024 / 2 * 2.5 * this.maxBlur);
    U.uMax.value = Math.min(28 * H / 1080 + 4, 40);
    U.uRes.value.set(readBuffer.width, readBuffer.height);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(renderer);
  }
  dispose() { this.quad.dispose(); }
}

export function createPost(renderer, scene, camera, quality) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const W = Math.max(2, size.x), H = Math.max(2, size.y);
  const useAO = quality.ao !== false && quality.name !== 'low';
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: useAO ? 0 : quality.msaa });
  if (!useAO && !quality.msaa) rt.depthTexture = new THREE.DepthTexture(W, H, THREE.UnsignedIntType);
  const composer = new EffectComposer(renderer, rt);
  let ao = null;
  if (useAO) {
    ao = new N8AOPass(scene, camera, W, H);
    ao.configuration.gammaCorrection = false;
    ao.configuration.aoRadius = 4.0;
    ao.configuration.distanceFalloff = 1.5;
    ao.configuration.intensity = 2.6;
    // half-res AO with depth-aware (bilateral) upsampling; 'High' = 64 samples + denoise at half res on high
    ao.configuration.halfRes = true;
    ao.configuration.depthAwareUpsampling = true;
    // transparency-aware mode re-renders the whole scene twice more every frame (and re-renders the shadow map each
    // time); water and particles don't need it
    ao.autoDetectTransparency = false;
    ao.configuration.transparencyAware = false;
    ao.setQualityMode(quality.name === 'high' ? 'High' : 'Medium');
    composer.addPass(ao);
  } else composer.addPass(new RenderPass(scene, camera));
  const getDepth = (readBuffer) => ao ? ao.beautyRenderTarget.depthTexture : (readBuffer.depthTexture || rt.depthTexture || null);
  const hasDepth = !!ao || !!rt.depthTexture;
  const contact = hasDepth && quality.name !== 'low' ? new ContactShadowPass(camera, getDepth) : null;
  if (contact) composer.addPass(contact);
  const wet = hasDepth ? new WetReflectionPass(camera, getDepth, (rb) => ao ? ao.beautyRenderTarget.texture : rb.texture) : null;
  if (wet) wet.fullRes = quality.name === 'high' || quality.name === 'ultra';     // mirror-sharp wet streets on high (the streak blur always runs at half res)
  if (wet) { wet.enabled = false; composer.addPass(wet); }
  const dof = hasDepth ? new BokehPass(camera, getDepth) : null;
  if (dof) composer.addPass(dof);
  const atmos = hasDepth ? new AtmosPass(camera, getDepth, () => scene.fog?.color || new THREE.Color(0.6, 0.65, 0.7)) : null;
  if (atmos) { atmos.enabled = false; composer.addPass(atmos); }
  const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.42, 0.6, 0.9);
  // anti-flicker: soft knee + firefly clamp on the bright pass. Sub-pixel glints (wet specular, lit rain drops, distant
  // lanterns) sampled at bloom resolution popped across the hard 0.9 threshold and, through the wide mips, made the
  // whole screen pulse by 6-8 / 255 frame to frame while driving at night.
  bloom.highPassUniforms.smoothWidth.value = 0.45;
  bloom.materialHighPassFilter.fragmentShader = bloom.materialHighPassFilter.fragmentShader.replace(
    'gl_FragColor = mix( outputColor, texel, alpha );',
    'vec4 o = mix( outputColor, texel, alpha ); o.rgb *= min( 1.0, 1.6 / max( v, 1e-4 ) ); gl_FragColor = o;')
    // (regression fix 9/30) saturated lights (red lanterns, neon, signals) have a low luminance and never crossed the
    // threshold: the brightest channel counts too
    .replace('float v = luminance( texel.xyz );', 'float v = max( luminance( texel.xyz ), 0.8 * max( texel.r, max( texel.g, texel.b ) ) );');
  bloom.materialHighPassFilter.needsUpdate = true;
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  if (atmos) atmos.grade = grade;
  const output = new OutputPass();
  composer.addPass(output);
  const finish = new ShaderPass(FinishShader);
  finish.enabled = false;
  composer.addPass(finish);
  let smaa = null;
  if (useAO || !quality.msaa) { smaa = new SMAAPass(W, H); composer.addPass(smaa); }
  // (look-dev) AgX: filmic highlight roll-off that desaturates toward white (clouds, sun-lit stucco, lamps) instead of
  // ACES' hue skew / clipped saturated highlights; environment.js adds the saturation back in the grade
  // (regression fix 9/30) back to ACES day and night: AgX washed lanterns / neon to salmon, lifted the night blacks into a
  // muddy veil and flattened the day (the user's reference shots are the ACES look). ?tm=agx = the look-dev AgX A/B.
  renderer.toneMapping = /[?&]tm=agx/.test(location.search) ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const after = [];
  const api = {
    composer, bloom, grade, ao, wet, dof, finish, atmos, contact, mirror: null,
    // weather.js sets these: { rays 0..1, glare 0..1, mist 0..1, mistBase (ground y under the camera), mistH (m) }
    atmosParams: { rays: 0.9, glare: 0.8, mist: 0, mistBase: 0, mistH: 14 },
    wetEnabled: quality.name !== 'low', nightRain: 0, glossSSR: false,
    setSize(w, h) { composer.setSize(Math.max(2, w), Math.max(2, h)); grade.uniforms.uAspect.value = w / Math.max(1, h); finish.uniforms.uAspect.value = w / Math.max(1, h); },
    // rain drops on the lens (weather.js): amount 0..1, time s
    setLensDrops(amount, t) { grade.uniforms.uDrops.value = amount; grade.uniforms.uDropT.value = t; },
    // fn(renderer) runs right after the frame is composited (same task: the canvas can still be read, e.g. photo capture)
    onAfterRender(fn) { after.push(fn); return () => { const i = after.indexOf(fn); if (i >= 0) after.splice(i, 1); }; },
    render(dt) {
      grade.uniforms.uTime.value += dt; finish.uniforms.uTime.value += dt;
      // dry weather: the pass still runs for glossy pixels only (car lacquer, glass), at a lower weight since their
      // env-map reflection already carries the sky
      if (wet) { const wetOn = HB_WET.x > 0.04; wet.enabled = api.wetEnabled && (wetOn || api.glossSSR); wet.trace.material.uniforms.uGloss.value = wetOn ? 1 : 0.6; }
      // Chinatown wet-street mirror (streetmirror.js, set by main.js): rendered before the composer, sampled by the wet pass
      // (drawn inside the wet pass, i.e. after the main scene render: a scene render ahead of the main one this frame broke
      // the photogrammetry tiles' near-block mask right after moving)
      if (wet) wet.preTrace = () => { const T = wet.trace.material.uniforms, m = api.mirror, on = m ? m.render(camera, dt) : false;
        T.uMirOn.value = on ? m.U.uMirOn.value : 0;
        if (on) { T.tMirror.value = m.U.tMirror.value; T.uMirMat.value.copy(m.U.uMirMat.value); T.uMirPlane.value.copy(m.U.uMirPlane.value); T.uMirBox.value.copy(m.U.uMirBox.value); T.uMirExt.value.copy(m.U.uMirExt.value); } };
      // wet-night grade (weather.js sets nightRain = wetness * night): deep cool blacks, warm sodium / lantern highlights
      const nr = Math.min(1, Math.max(0, api.nightRain || 0)), gu = grade.uniforms;
      gu.uShadowTint.value.setRGB(0.96 - 0.08 * nr, 0.99 - 0.02 * nr, 1.03 + 0.08 * nr);   // (look-dev: milder cool shadows now the sky IBL itself fills them blue)
      gu.uHighTint.value.setRGB(1.05 + 0.07 * nr, 1.0, 0.94 - 0.08 * nr);
      gu.uToe.value = 0.012 * nr;
      if (atmos) {
        const A = api.atmosParams; Object.assign(atmos, A);
        atmos.enabled = quality.name !== 'low' && (HB_SUN.w > 0.02 || A.mist > 0.002);
        grade.uniforms.uAtmosOn.value = atmos.enabled ? 1 : 0;
      }
      composer.render(dt);
      if (after.length) for (const fn of after.slice()) fn(renderer);
    },
  };
  grade.uniforms.uAspect.value = W / H;
  return api;
}
