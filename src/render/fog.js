// "Karl the Fog": replaces three's fog chunks with an analytic exponential HEIGHT fog + a thin global haze, plus a
// second, much denser and lower "bank" layer (rolling marine-layer fog that pours in from the west and leaves the bridge
// towers poking out). Uses THREE.Fog's uniforms as carriers: fog.near = sea-level fog density, fog.far = floor(haze*1e6)
// + heightFalloff. A NEGATIVE fog.near means "mirror mode" (planar water reflection pass: the camera is mirrored below
// the water, so the fog integral is evaluated along the true bounced path camera -> water -> object).
//
// It also injects the global WEATHER terms into every lit built-in material (no per-material work):
//   hbWet = { x: wetness 0..1, y: time s, z: rain 0..1, w: puddle amount 0..1 }
//   hbFog = { x: bank density, y: bank height falloff, z: bank front (world x; fog covers x < front), w: advection (m) }
// Both are plain {x,y,z,w} objects shared by reference across every material's uniforms, so writing to them updates
// every program at its next draw. Materials that define HB_PUDDLES also get puddles + rain ripples on up-facing surfaces;
// HB_NO_WET opts a material out.
import * as THREE from 'three';
import { HB_LAMPXF, HB_LAMPTEX, LAMPMAP_GLSL } from './lampmap.js';

export const HB_WET = { x: 0, y: 0, z: 0, w: 0 };
export const HB_FOG = { x: 0, y: 0.03, z: -1e9, w: 0 };
// sun for aerial perspective: xyz = direction to the sun (world), w = forward-scatter strength (0 at night);
// HB_SUNCOL = in-scattered sun colour (linear), HB_AIR = { x: blue-hour/Rayleigh tint strength }
export const HB_SUN = { x: 0, y: 1, z: 0, w: 0 };
export const HB_SUNCOL = new THREE.Color(1, 0.8, 0.6);
// key light for the screen-space contact shadows (post.js): xyz = direction to the sun / moon (world), w = its share of the lighting
export const HB_KEY = { x: 0, y: 1, z: 0, w: 0 };
// cloud shadows on the ground (environment.js): A = (coverage, tile size m, wind offset x, z), B = (shadow altitude m,
// stratus blend, strength, 0); the texture is the sky's cloud noise (sky.js makeCloudNoise)
export const HB_CLOUD_A = { x: 0, y: 1, z: 0, w: 0 };
export const HB_CLOUD_B = { x: 1800, y: 0, z: 0, w: 0 };
export const HB_CLOUD_TEX = { value: null };

// shared GLSL: value noise + puddle / ripple helpers (prefixed hb* to avoid clashes with material code)
export const HB_NOISE_GLSL = `
float hbH21( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float hbVN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hbH21( i ), hbH21( i + vec2( 1.0, 0.0 ) ), f.x ), mix( hbH21( i + vec2( 0.0, 1.0 ) ), hbH21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
// puddle field on world xz (0..1); amount 0..1 grows the puddles
float hbPuddle( vec2 p, float amount ) {
  float n = hbVN( p * 0.21 ) * 0.62 + hbVN( p * 0.67 + 7.1 ) * 0.28 + hbVN( p * 2.3 + 3.7 ) * 0.1;
  float th = 0.78 - amount * 0.34;
  return smoothstep( th, th + 0.05, n );
}
// rain ripples: expanding rings in a jittered 0.9 m grid (2 layers); returns a world-xz normal tilt
vec2 hbRipple( vec2 p, float t, float rain ) {
  vec2 acc = vec2( 0.0 );
  for ( int L = 0; L < 2; L ++ ) {
    vec2 q = p * ( L == 0 ? 3.1 : 4.7 ) + float( L ) * 3.1;
    vec2 c = floor( q ), f = fract( q );
    float h = hbH21( c + float( L ) * 17.0 );
    float ph = fract( t * ( 0.9 + h * 0.6 ) + h * 9.0 );
    vec2 o = vec2( hbH21( c + 3.3 ), hbH21( c + 7.7 ) ) * 0.6 + 0.2;
    vec2 d = f - o; float r = length( d );
    float ring = ph * 0.45;
    float w = sin( ( r - ring ) * 42.0 ) * smoothstep( 0.07, 0.0, abs( r - ring ) ) * ( 1.0 - ph ) * step( h, rain * 0.9 + 0.1 );
    acc += d / max( r, 1e-3 ) * w;
  }
  return acc * 0.35;
}
`;

let patched = false;
export function patchFogChunks() {
  if (patched) return; patched = true;
  const C = THREE.ShaderChunk;
  // register the shared weather uniforms on every built-in material that uses fog
  for (const lib of Object.values(THREE.ShaderLib)) {
    if (lib?.uniforms?.fogColor) { lib.uniforms.hbWet = { value: HB_WET }; lib.uniforms.hbFog = { value: HB_FOG }; lib.uniforms.hbSun = { value: HB_SUN }; lib.uniforms.hbSunCol = { value: HB_SUNCOL }; }
    if (lib?.uniforms?.fogColor && lib.uniforms.ambientLightColor) { lib.uniforms.hbLampXf = { value: HB_LAMPXF }; lib.uniforms.hbLampTex = HB_LAMPTEX; }
    if (lib?.uniforms?.fogColor) { lib.uniforms.hbCloudA = { value: HB_CLOUD_A }; lib.uniforms.hbCloudB = { value: HB_CLOUD_B }; lib.uniforms.hbCloudTex = HB_CLOUD_TEX; }
  }
  // the lamp map is a render-target texture: UniformsUtils.clone refuses to copy those (null + warning), so the one
  // shared uniform object is handed to every material as is
  const U = THREE.UniformsUtils, clone0 = U.clone;
  U.clone = (u) => {
    if (!u || (u.hbLampTex !== HB_LAMPTEX && u.hbCloudTex !== HB_CLOUD_TEX)) return clone0(u);
    const L = u.hbLampTex, Cl = u.hbCloudTex; delete u.hbLampTex; delete u.hbCloudTex;
    const o = clone0(u);
    if (L) { u.hbLampTex = L; o.hbLampTex = L; }
    if (Cl) { u.hbCloudTex = Cl; o.hbCloudTex = Cl; }
    return o;
  };
  // HDR safety: clamp every lit material's output and scrub NaNs, so one over-bright light or bad pixel can't
  // overflow the half-float target (Inf -> NaN -> a black screen after bloom / AO)
  C.opaque_fragment = C.opaque_fragment.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
    'outgoingLight = clamp( outgoingLight, 0.0, 256.0 ); if ( any( isnan( outgoingLight ) ) ) outgoingLight = vec3( 0.0 );\ngl_FragColor = vec4( outgoingLight, diffuseColor.a );' +
    // gloss G-buffer in the (otherwise unused) alpha of opaque lit pixels: a = 1 - gloss. post.js WetReflectionPass
    // reads it so car paint, glass and shop windows get screen-space reflections too (not in the water mirror pass,
    // which uses its alpha as coverage)
    `
#if defined( OPAQUE ) && defined( STANDARD ) && defined( HB_FOG_PARS ) && ! defined( FOG_EXP2 )
if ( fogNear >= 0.0 ) {
  float hbGl = 1.0 - smoothstep( 0.05, 0.42, roughnessFactor );
  #ifdef USE_CLEARCOAT
  hbGl = max( hbGl, material.clearcoat * ( 1.0 - smoothstep( 0.05, 0.42, material.clearcoatRoughness ) ) );
  #endif
  gl_FragColor.a = 1.0 - 0.996 * hbGl;
}
#endif`);
  C.fog_pars_vertex = `#ifdef USE_FOG
varying float vFogDepth;
varying vec3 vFogRay;
#endif`;
  C.fog_vertex = `#ifdef USE_FOG
vFogDepth = - mvPosition.z;
vFogRay = transpose(mat3(viewMatrix)) * mvPosition.xyz;
#endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
#define HB_FOG_PARS
uniform vec3 fogColor;
varying float vFogDepth;
varying vec3 vFogRay;
uniform vec4 hbWet;
uniform vec4 hbFog;
uniform vec4 hbSun;
uniform vec3 hbSunCol;
uniform vec4 hbLampXf;
uniform sampler2D hbLampTex;
uniform vec4 hbCloudA, hbCloudB;
uniform sampler2D hbCloudTex;
// cumulus / stratus shadow on the ground: the cloud field where the sun ray through this point crosses the deck
float hbCloudShadow( vec3 wp ) {
  if ( hbCloudB.z < 0.01 || hbCloudA.x < 0.005 ) return 1.0;
  float t = ( hbCloudB.x - wp.y ) / max( hbSun.y, 0.06 );
  vec2 p = wp.xz + hbSun.xz * t;
  vec4 a = texture2D( hbCloudTex, ( p + hbCloudA.zw ) / hbCloudA.y );
  float s = mix( a.r, a.g * 0.7 + a.r * 0.3, hbCloudB.y );
  float d = smoothstep( 1.0 - hbCloudA.x - 0.02, 1.0 - hbCloudA.x + 0.22, s );
  return 1.0 - d * hbCloudB.z;
}
float hbSpecOcc = 1.0;
#ifdef FOG_EXP2
uniform float fogDensity;
#else
uniform float fogNear;
uniform float fogFar;
#endif
${HB_NOISE_GLSL}
// fog along a straight segment of length L from height h0 to h1 through density rho * exp(-f * y)
float hbFogSeg( float rho, float f, float h0, float h1, float L ) {
  float k = f * ( h1 - h0 );
  float base = rho * exp( - f * max( h0, - 5.0 ) );
  return abs( k ) > 1e-4 ? base * L * ( 1.0 - exp( - k ) ) / k : base * L;
}
// same, but for the planar-reflection pass: camera mirrored below the water (bounced path camera -> y=0 -> object)
float hbFogPath( float rho, float f, float camY, float objY, float L, bool mirror ) {
  if ( ! mirror ) return hbFogSeg( rho, f, camY, objY, L );
  float c = max( - camY, 0.0 ), o = max( objY, 0.0 );
  float L1 = L * c / max( c + o, 1e-3 );
  return hbFogSeg( rho, f, c, 0.0, L1 ) + hbFogSeg( rho, f, 0.0, o, L - L1 );
}
// marine-layer SLAB (hbFog.y > 1 = top height in m): density rho below top - 90 m, ramping to 0 at the top
float hbSlabG( float y, float top ) { float a = top - 90.0; return y <= a ? y : ( y < top ? a + ( y - a ) - ( y - a ) * ( y - a ) / 180.0 : a + 45.0 ); }
float hbSlabSeg( float rho, float top, float h0, float h1, float L ) {
  float dh = h1 - h0;
  float avg = abs( dh ) > 0.5 ? ( hbSlabG( h1, top ) - hbSlabG( h0, top ) ) / dh : clamp( ( top - h0 ) / 90.0, 0.0, 1.0 );
  return rho * L * max( avg, 0.0 );
}
float hbSlabPath( float rho, float top, float camY, float objY, float L, bool mirror ) {
  if ( ! mirror ) return hbSlabSeg( rho, top, camY, objY, L );
  float c = max( - camY, 0.0 ), o = max( objY, 0.0 );
  float L1 = L * c / max( c + o, 1e-3 );
  return hbSlabSeg( rho, top, c, 0.0, L1 ) + hbSlabSeg( rho, top, 0.0, o, L - L1 );
}
// horizontal coverage of the marine-layer bank at world xz (rolling edges from advected noise)
float hbBankCover( vec2 p ) {
  vec2 q = p + vec2( - hbFog.w, hbFog.w * 0.25 );
  float n = hbVN( q * 0.0016 ) * 0.65 + hbVN( q * 0.0051 + 3.1 ) * 0.35;
  float edge = hbFog.z - p.x + ( n - 0.5 ) * 900.0;
  return smoothstep( - 250.0, 350.0, edge ) * ( 0.55 + 0.45 * smoothstep( 0.25, 0.7, n ) );
}
#endif`;
  C.fog_fragment = `#ifdef USE_FOG
#ifdef FOG_EXP2
float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
#else
float fogDist = length( vFogRay );
bool fogMirror = fogNear < 0.0;
float fogHaze = floor( fogFar ) * 1e-6;
float fogFall = fract( fogFar );
float fogCamY = cameraPosition.y, fogObjY = cameraPosition.y + vFogRay.y;
float fogAmt = hbFogPath( abs( fogNear ), fogFall, fogCamY, fogObjY, fogDist, fogMirror ) + fogHaze * fogDist;
if ( hbFog.x > 0.0 ) {
  vec2 fogEnd = cameraPosition.xz + vFogRay.xz;
  float cov = 0.5 * ( hbBankCover( cameraPosition.xz ) + hbBankCover( fogEnd ) );
  if ( hbFog.y > 1.0 ) {
    // billowing top: +-70 m of slow advected noise around the mean top
    vec2 q = ( cameraPosition.xz + fogEnd ) * 0.5 + vec2( - hbFog.w, hbFog.w * 0.3 );
    float top = hbFog.y + ( hbVN( q * 0.0023 ) - 0.5 ) * 140.0 + ( hbVN( q * 0.011 + 5.3 ) - 0.5 ) * 40.0;
    fogAmt += cov * hbSlabPath( hbFog.x, top, fogCamY, fogObjY, fogDist, fogMirror );
  } else fogAmt += cov * hbFogPath( hbFog.x, hbFog.y, fogCamY, fogObjY, fogDist, fogMirror );
}
float fogFactor = 1.0 - exp( - max( fogAmt, 0.0 ) );
#endif
// aerial perspective: the haze glows with forward-scattered sunlight around the sun (Mie lobe, warm at low sun) and
// the far distance shifts slightly toward the sky's blue-grey (not in the water mirror pass: its ray is folded)
vec3 hbFogC = fogColor;
#ifndef FOG_EXP2
if ( hbSun.w > 0.0 && ! fogMirror ) {
  float hbMu = dot( vFogRay / max( fogDist, 1e-3 ), hbSun.xyz );
  float hbMie = pow( max( hbMu, 0.0 ), 10.0 ) * 0.9 + pow( max( hbMu, 0.0 ), 2.0 ) * 0.22 - 0.1 * max( - hbMu, 0.0 );
  hbFogC = max( hbFogC + hbSunCol * hbMie * hbSun.w * smoothstep( 40.0, 900.0, fogDist ), 0.0 );
}
#endif
gl_FragColor.rgb = mix( gl_FragColor.rgb, hbFogC, fogFactor );
#endif`;

  // ---- wet surfaces (rain): darker porous albedo, glossier, puddles + ripples where the material opts in
  const WET_PHYSICAL = `#if defined( HB_FOG_PARS ) && ! defined( HB_NO_WET )
if ( hbWet.x > 0.002 ) {
  vec3 hbP = cameraPosition + vFogRay;
  vec3 hbNg = normalize( ( vec4( nonPerturbedNormal, 0.0 ) * viewMatrix ).xyz );
  float hbUp = smoothstep( 0.3, 0.92, hbNg.y );
  float hbPor = smoothstep( 0.25, 0.75, roughnessFactor ) * ( 1.0 - metalnessFactor );
  // vertical surfaces dry in streaks; up-facing ones get the full soak
  float hbSide = mix( 0.35 + 0.35 * hbVN( vec2( hbP.x + hbP.z, hbP.y * 0.35 ) * 1.3 ), 1.0, hbUp );
  float hbK = hbWet.x * hbSide;
  diffuseColor.rgb *= 1.0 - hbK * 0.68 * hbPor;   // (look-dev 0.5 -> 0.68: soaked asphalt / concrete read dark, the light is in the sheen)
  // paved surfaces (materials with puddles) hold a water film; everything else only gets a sheen. A material can set
  // HB_WET_GLOSS (0..1) itself, e.g. the terrain (grass and soil soak water up, they barely shine)
  #if defined( HB_PUDDLES )
  float hbGloss = 1.0;
  #elif defined( HB_WET_GLOSS )
  float hbGloss = float( HB_WET_GLOSS );
  #else
  float hbGloss = 0.55;
  #endif
  #ifdef HB_GUTTER
  // asphalt holds a damp, patchy satin sheen rather than a mirror film; the standing water is in the ruts, gutters, dips
  // (look-dev r2: 0.22-0.44 -> 0.07-0.21: the gloss G-buffer read ~0 on the damp film, so SSR only lit the puddles and the
  // street went flat grey; a soaked road is a blurred mirror, streaked by post.js)
  float hbDamp = 0.07 + 0.14 * hbVN( hbP.xz * 0.23 + 1.7 );
  diffuseColor.rgb *= 1.0 - 0.45 * hbK * hbUp;   // (look-dev) soaked roadway: near-black asphalt, the street reads through its reflections
  roughnessFactor = mix( roughnessFactor, min( roughnessFactor, hbDamp ), hbK * mix( 0.5, 1.0, hbUp ) );
  #else
  roughnessFactor = mix( roughnessFactor, roughnessFactor * 0.22 + 0.05, hbK * mix( 0.5, 1.0, hbUp ) * hbGloss );
  #endif
  // water fills the pores: the micro normal flattens (also keeps the glossy surface from sparkling)
  normal = normalize( mix( normal, nonPerturbedNormal, hbK * 0.55 * hbUp ) );
  #ifdef HB_PUDDLES
  {
    float hbPud = hbPuddle( hbP.xz, hbWet.w ) * hbUp * smoothstep( 0.35, 0.8, hbWet.x );
    #ifdef HB_GUTTER     // defined only by the road shader text itself (render/roadwear.js ROAD_FRAG_PARS), with hbGutter
    hbPud = hbPuddle( hbP.xz * 1.3 + 17.0, hbWet.w * 0.55 ) * hbUp * smoothstep( 0.35, 0.8, hbWet.x );   // fewer open-road puddles
    hbPud = max( hbPud, hbGutter * hbUp * smoothstep( 0.3, 0.9, hbWet.x ) * ( 0.55 + 0.45 * hbVN( hbP.xz * 0.9 ) ) );
    #endif
    diffuseColor.rgb *= 1.0 - hbPud * 0.45;
    roughnessFactor = mix( roughnessFactor, 0.025, hbPud );
    if ( hbPud > 0.01 ) {
      vec2 hbRp = hbRipple( hbP.xz, hbWet.y, hbWet.z ) * hbWet.z;
      vec3 hbUpV = normalize( ( viewMatrix * vec4( hbRp.x, 1.0, hbRp.y, 0.0 ) ).xyz );
      normal = normalize( mix( normal, hbUpV, hbPud ) );
    }
  }
  #endif
  // specular horizon occlusion: a grazing reflection off wet ground mostly hits buildings / terrain, not open sky
  // (the screen-space pass in post.js adds what is actually on screen: lights, facades, cars)
  {
    vec3 hbV = normalize( cameraPosition - hbP );
    vec3 hbNw = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
    vec3 hbR = reflect( - hbV, hbNw );
    hbSpecOcc = mix( 1.0, smoothstep( 0.0, 0.6, hbR.y ), 0.97 * hbK * ( 0.4 + 0.6 * hbUp ) );   // (look-dev r2: 0.85 -> 0.97: the glossier film mirrored the grey rain sky; SSR carries the lights)
  }
}
#endif
`;
  const WET_LAMBERT = `#if defined( HB_FOG_PARS ) && ! defined( HB_NO_WET )
if ( hbWet.x > 0.002 ) {
  vec3 hbNg = normalize( ( vec4( nonPerturbedNormal, 0.0 ) * viewMatrix ).xyz );
  diffuseColor.rgb *= 1.0 - hbWet.x * 0.35 * mix( 0.4, 1.0, smoothstep( 0.3, 0.92, hbNg.y ) );
}
#endif
`;
  C.lights_physical_fragment = WET_PHYSICAL + C.lights_physical_fragment;
  C.lights_fragment_end = LAMPMAP_GLSL + `#if defined( RE_IndirectSpecular ) && defined( HB_FOG_PARS )
radiance *= hbSpecOcc;
#endif
` + C.lights_fragment_end;
  C.lights_lambert_fragment = WET_LAMBERT + C.lights_lambert_fragment;
}

export class HeightFog extends THREE.Fog {
  constructor(color) { super(color, 0.004, 0.02); this.density = 0.004; this.falloff = 0.02; this.haze = 0.00012; this.mirror = false; this.pack(); }
  set(density, falloff, haze) { this.density = density; this.falloff = Math.min(0.999, Math.max(0.0005, falloff)); this.haze = haze; this.pack(); }
  pack() { this.near = this.mirror ? -Math.max(1e-7, this.density) : this.density; this.far = Math.floor(this.haze * 1e6) + this.falloff; }
  // planar reflection pass: evaluate the fog along the bounced path
  setMirror(on) { this.mirror = on; this.pack(); }
  // fog amount (0..1) for a ray from the camera, CPU mirror of the shader (used for culling / sky blending)
  amount(camY, dy, dist) {
    const seg = (rho, f, h0, h1, L) => { const k = f * (h1 - h0), base = rho * Math.exp(-f * Math.max(h0, -5)); return Math.abs(k) > 1e-4 ? base * L * (1 - Math.exp(-k)) / k : base * L; };
    let a = seg(this.density, this.falloff, camY, camY + dy, dist) + this.haze * dist;
    if (HB_FOG.x > 0 && HB_FOG.y > 1) {
      const top = HB_FOG.y, A = top - 90, G = y => y <= A ? y : y < top ? A + (y - A) - (y - A) ** 2 / 180 : A + 45;
      const avg = Math.abs(dy) > 0.5 ? (G(camY + dy) - G(camY)) / dy : Math.min(1, Math.max(0, (top - camY) / 90));
      a += 0.6 * HB_FOG.x * dist * Math.max(avg, 0);
    } else if (HB_FOG.x > 0) a += 0.6 * seg(HB_FOG.x, HB_FOG.y, camY, camY + dy, dist);
    return 1 - Math.exp(-a);
  }
}
