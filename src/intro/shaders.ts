// ─────────────────────────────────────────────────────────────
//  GLSL: every shader used by the intro lives here
// ─────────────────────────────────────────────────────────────

export const noiseChunk = /* glsl */ `
float hash31(vec3 p){
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise3(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
        mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
        mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}
float fbm3(vec3 p){
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise3(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}
`;

// Shared lighting / fog block for all "golden metal" fragment shaders
export const commonFrag = /* glsl */ `
uniform float uTime;
uniform vec4 uCore;
uniform vec4 uMono[10];
uniform float uExposure;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uCharge;

vec3 envColor(vec3 R){
  float y = R.y;
  vec3 horizon = vec3(1.0, 0.5, 0.1) * 0.28;
  vec3 zenith  = vec3(0.10, 0.045, 0.010);
  vec3 c = mix(horizon, zenith, smoothstep(0.0, 0.85, y));
  c = mix(c, vec3(0.07, 0.03, 0.006), 1.0 - smoothstep(-0.5, 0.0, y));
  c += vec3(1.0, 0.86, 0.52) * 1.3 * pow(max(dot(R, normalize(vec3(0.45, 0.65, -0.6))), 0.0), 26.0);
  c += vec3(1.0, 0.55, 0.18) * 0.8 * pow(max(dot(R, normalize(vec3(-0.75, 0.35, 0.35))), 0.0), 14.0);
  c += vec3(1.0, 0.75, 0.35) * 0.5 * pow(max(dot(R, normalize(vec3(0.1, 0.25, 0.95))), 0.0), 12.0);
  float strip = smoothstep(0.93, 1.0, sin(R.x * 4.0 + R.z * 3.0 + R.y * 2.0) * 0.5 + 0.5);
  c += vec3(1.0, 0.82, 0.5) * 0.8 * strip * smoothstep(-0.1, 0.5, y);
  return c;
}

vec3 goldShade(vec3 N, vec3 V, vec3 wpos, float seed){
  vec3 R = reflect(-V, N);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  vec3 F0 = vec3(1.0, 0.74, 0.30);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0) * 0.3;
  vec3 col = envColor(R) * F * 0.7;
  col *= 0.7 + 0.6 * fract(seed * 7.31);

  vec3 Lc = uCore.xyz - wpos;
  float dl = length(Lc);
  vec3 L = Lc / max(dl, 0.001);
  float att = uCore.w / (1.0 + dl * dl * 0.0025);
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(R, L), 0.0), 22.0);
  col += (F0 * diff * 0.5 + vec3(1.0, 0.85, 0.55) * spec * 1.6) * att;

  col += F0 * vec3(0.5, 0.3, 0.1) * 0.05 * (0.5 + 0.5 * N.y);
  return col;
}

vec3 pools(vec3 wpos){
  vec3 g = vec3(0.0);
  for (int i = 0; i < 10; i++) {
    vec3 d = wpos - uMono[i].xyz;
    float dd = dot(d.xz, d.xz) + d.y * d.y * 0.18;
    g += uMono[i].w * exp(-dd / 85.0);
  }
  return g * vec3(1.0, 0.62, 0.18) * 1.3;
}

vec3 applyFog(vec3 col, vec3 wpos){
  float d = length(wpos - cameraPosition);
  float f = 1.0 - exp(-d * d * uFogDensity * uFogDensity);
  float hf = exp(-max(wpos.y, 0.0) * 0.025);
  f = clamp(f * (0.55 + 0.45 * hf), 0.0, 1.0);
  return mix(col, uFogColor, f);
}
`;

// ───────────────────────── terrain / pillars / monoliths
export const goldVert = /* glsl */ `
attribute vec3 aBary;
attribute float aSeed;
#if defined(TERRAIN) || defined(PILLAR)
attribute vec4 aCenter;
uniform vec2 uWaveC;
uniform float uWaveR;
uniform float uWaveW;
uniform float uShockR;
uniform float uShockW;
uniform float uShockAmp;
#endif

varying vec3 vWPos;
varying vec3 vBary;
varying float vBuild;
varying float vSeed;
varying float vLocalY;
varying float vH;
varying vec3 vLocal;

vec3 rotAxis(vec3 v, vec3 k, float a){
  float c = cos(a);
  float s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}

void main(){
  vec3 p = position;
  float build = 1.0;
  float localY = position.y;
  float H = 1.0;

  #if defined(TERRAIN) || defined(PILLAR)
    float d = length(aCenter.xz - uWaveC);
    float t = clamp((uWaveR - d) / uWaveW, 0.0, 1.0);
    build = 1.0 - pow(1.0 - t, 3.0);
    #ifdef PILLAR
      localY = position.y - aCenter.y;
      H = aCenter.w;
      p.y = aCenter.y + (p.y - aCenter.y) * build;
    #else
      p = aCenter.xyz + (p - aCenter.xyz) * build;
      p.y -= (1.0 - build) * 3.0;
      float sd = length(aCenter.xz);
      float sh = exp(-pow((sd - uShockR) / uShockW, 2.0)) * uShockAmp;
      vec3 k = normalize(vec3(sin(aSeed * 37.0), 0.3, cos(aSeed * 37.0)));
      vec3 c = aCenter.xyz + vec3(0.0, sh * (0.35 + aSeed), 0.0);
      p = c + rotAxis(p - aCenter.xyz, k, sh * (aSeed - 0.5) * 0.7);
    #endif
  #endif

  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWPos = wp.xyz;
  vBary = aBary;
  vBuild = build;
  vSeed = aSeed;
  vLocalY = localY;
  vH = H;
  vLocal = position;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const goldFrag = /* glsl */ `
varying vec3 vWPos;
varying vec3 vBary;
varying float vBuild;
varying float vSeed;
varying float vLocalY;
varying float vH;
varying vec3 vLocal;
uniform float uGrow;
uniform float uHeight;

${commonFrag}

void main(){
  #ifdef MONO
    float cut = uGrow * (uHeight + 3.0) - 1.5;
    if (vLocal.y > cut) discard;
  #endif

  vec3 N = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
  vec3 V = normalize(cameraPosition - vWPos);
  if (dot(N, V) < 0.0) N = -N;
  float ndv = clamp(dot(N, V), 0.0, 1.0);

  vec3 col = goldShade(N, V, vWPos, vSeed);
  col += pools(vWPos) * vec3(0.4, 0.36, 0.32);

  float dist = length(vWPos.xz);
  float pulse = pow(0.5 + 0.5 * sin(dist * 0.07 - uTime * 1.8), 8.0);
  float eI = 1.0 + pulse * 2.2;
  vec3 edgeCol = vec3(1.0, 0.74, 0.26);

  #ifdef TERRAIN
    eI += (1.0 - vBuild) * 9.0;
    eI *= 1.0 + uCharge * 0.8;
  #endif

  #ifdef PILLAR
    float hn = clamp(vLocalY / max(vH, 1.0), 0.0, 1.0);
    col += vec3(1.0, 0.6, 0.16) * (pow(1.0 - hn, 3.0) * 0.6 + pow(hn, 3.0) * 0.35) * (0.2 + 0.4 * fract(vSeed * 5.1));
    eI += (1.0 - vBuild) * 6.0;
  #endif

  #ifdef MONO
    float hn = clamp(vLocal.y / uHeight, 0.0, 1.0);
    float rim = pow(1.0 - ndv, 1.6);
    vec3 glow = vec3(1.0, 0.62, 0.18) * (pow(1.0 - hn, 2.0) * 1.0 + smoothstep(0.5, 1.0, hn) * 0.6);
    col += glow * (0.15 + 0.7 * rim + 0.3 * fract(vSeed * 5.1)) * (0.7 + 0.9 * uCharge);
    float band = smoothstep(cut - 1.8, cut, vLocal.y);
    col += vec3(1.0, 0.86, 0.55) * band * 6.0;
    eI = 2.6 + pulse * 2.5 + uCharge * 3.0 + band * 6.0;
  #endif

  vec3 bw = fwidth(vBary);
  vec3 bl = smoothstep(vec3(0.0), bw * 1.4 + 1e-4, vBary);
  float line = 1.0 - min(bl.x, min(bl.y, bl.z));
  vec3 bh = smoothstep(vec3(0.0), bw * 7.0 + 1e-4, vBary);
  float halo = 1.0 - min(bh.x, min(bh.y, bh.z));
  halo *= halo;
  float pxs = max(bw.x, max(bw.y, bw.z));
  float lodFade = 1.0 - smoothstep(0.05, 0.22, pxs);

  col += edgeCol * (line * eI + halo * eI * 0.12) * (0.12 + 0.88 * lodFade);

  col *= uExposure;
  col = applyFog(col, vWPos);
  gl_FragColor = vec4(col, 1.0);
}
`;

// ───────────────────────── video placeholder screens
export const screenVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWPos;
varying vec3 vLocal;
void main(){
  vUv = uv;
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const screenFrag = /* glsl */ `
varying vec2 vUv;
varying vec3 vWPos;
varying vec3 vLocal;
uniform sampler2D uMap;
uniform float uPower;
uniform float uGrow;
uniform float uHeight;
uniform float uSeed;

${noiseChunk}
${commonFrag}

void main(){
  float cut = uGrow * (uHeight + 3.0) - 1.5;
  if (vLocal.y > cut) discard;

  float p = uPower;
  vec2 uv = vUv;

  // glitchy horizontal jitter during power-on
  float gl = (1.0 - smoothstep(0.55, 0.95, p)) * step(0.5, fract(sin(floor(uv.y * 40.0) + floor(uTime * 12.0)) * 43758.5))
           * (hash31(vec3(floor(uv.y * 40.0), floor(uTime * 12.0), uSeed)) - 0.5) * 0.08;
  uv.x += gl * step(0.02, p);

  vec3 tex = texture2D(uMap, uv).rgb;

  // slow "video-like" motion beneath the static placeholder
  float flow = 0.5 + 0.5 * sin(uv.x * 5.0 + uv.y * 3.0 + uTime * 0.8 + uSeed * 9.0);
  float flow2 = 0.5 + 0.5 * sin(uv.y * 9.0 - uTime * 1.3 + uv.x * 2.0);
  vec3 motion = vec3(1.0, 0.55, 0.14) * (flow * flow2) * 0.16;

  vec3 col = tex * 1.9 + motion;

  // scanlines + travelling glare
  col *= 0.9 + 0.1 * sin(uv.y * 520.0);
  float glare = smoothstep(0.0, 0.5, sin((uv.x * 0.9 + uv.y * 1.1) * 3.2 - uTime * 0.7)) * 0.08;
  col += vec3(1.0, 0.8, 0.45) * glare;

  float vy = abs(vUv.y - 0.5) * 2.0;
  float openY = mix(0.012, 1.0, smoothstep(0.22, 0.78, p));
  float m = (1.0 - smoothstep(openY - 0.012, openY, vy)) * smoothstep(0.0, 0.15, p);
  float hline = (1.0 - smoothstep(0.0, 0.03, vy)) * smoothstep(0.0, 0.2, p) * (1.0 - smoothstep(0.55, 0.85, p));

  vec3 dark = vec3(0.02, 0.012, 0.004);
  col = mix(dark, col, m * smoothstep(0.25, 0.7, p));
  col += vec3(1.0, 0.88, 0.55) * hline * 5.0;
  col += vec3(1.0, 0.8, 0.45) * exp(-pow((p - 0.28) * 7.0, 2.0)) * 1.2 * m;

  vec2 fw = fwidth(vUv);
  vec2 e = smoothstep(vec2(0.0), fw * 1.6 + 1e-4, min(vUv, 1.0 - vUv));
  float border = 1.0 - min(e.x, e.y);
  col += vec3(1.0, 0.78, 0.3) * border * 3.0 * smoothstep(0.0, 0.25, p);

  col *= uExposure;
  col = applyFog(col, vWPos);
  gl_FragColor = vec4(col, 1.0);
}
`;

// ───────────────────────── sky
export const skyVert = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const skyFrag = /* glsl */ `
varying vec3 vDir;
uniform float uTime;
uniform vec3 uFogColor;
uniform vec3 uCoreDir;
uniform float uCoreGlow;
uniform float uSkyAmt;
uniform float uExposure;
${noiseChunk}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 hor = uFogColor * 1.15;
  vec3 mid = vec3(0.07, 0.03, 0.005);
  vec3 top = vec3(0.008, 0.004, 0.001);
  vec3 col = mix(hor, mid, smoothstep(0.0, 0.22, h));
  col = mix(col, top, smoothstep(0.12, 0.75, h));
  col = mix(col, uFogColor, 1.0 - smoothstep(-0.02, 0.02, h));

  vec3 q = vec3(d.x * 5.0, h * 9.0 - uTime * 0.35, d.z * 5.0);
  float n = fbm3(q + vec3(0.0, fbm3(q * 0.7 + uTime * 0.1) * 1.5, 0.0));
  float flame = smoothstep(0.33, 0.9, n) * exp(-max(h, 0.0) * 6.5);
  col += vec3(1.0, 0.48, 0.09) * flame * 0.55;

  float cg = pow(max(dot(d, uCoreDir), 0.0), 22.0);
  col += vec3(1.0, 0.6, 0.2) * cg * uCoreGlow;

  col *= uSkyAmt * uExposure;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ───────────────────────── energy core
export const orbVert = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main(){
  vP = position;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

export const orbFrag = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
uniform float uTime;
uniform float uIntensity;
${noiseChunk}
void main(){
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float n = fbm3(vP * 3.2 + vec3(0.0, uTime * 0.9, uTime * 0.4));
  vec3 hot = vec3(1.0, 0.96, 0.82);
  vec3 warm = vec3(1.0, 0.52, 0.10);
  vec3 c = mix(hot, warm, pow(f, 1.1)) * (2.2 + 3.5 * n) * uIntensity;
  gl_FragColor = vec4(c, 1.0);
}
`;

// ───────────────────────── vertical beam of light
export const beamFrag = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
uniform float uTime;
uniform float uAmt;
${noiseChunk}
void main(){
  float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.4);
  float vert = smoothstep(0.0, 0.04, vUv.y) * pow(1.0 - vUv.y, 1.25);
  float a = vUv.x * 6.2831853;
  float streak = 0.5 + 0.7 * fbm3(vec3(cos(a) * 2.5, sin(a) * 2.5, vUv.y * 3.0 - uTime * 0.8));
  vec3 c = mix(vec3(1.0, 0.55, 0.14), vec3(1.0, 0.9, 0.6), edge) * edge * vert * streak * uAmt * 3.2;
  gl_FragColor = vec4(c, 1.0);
}
`;

// ───────────────────────── blast shell + ground ring
export const shellFrag = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
uniform float uTime;
uniform float uAmt;
${noiseChunk}
void main(){
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float n = fbm3(vP * 4.0 + uTime * 0.6);
  float a = (pow(f, 2.2) * 1.8 + 0.12) * (0.6 + 0.8 * n) * uAmt;
  vec3 c = mix(vec3(1.0, 0.5, 0.1), vec3(1.0, 0.92, 0.7), pow(f, 3.0));
  gl_FragColor = vec4(c * a, 1.0);
}
`;

export const ringVert = /* glsl */ `
varying vec2 vP;
void main(){
  vP = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const ringFrag = /* glsl */ `
varying vec2 vP;
uniform float uAmt;
uniform float uTime;
${noiseChunk}
void main(){
  float r = length(vP);
  float ring = exp(-pow((r - 0.9) / 0.045, 2.0));
  float tail = smoothstep(0.9, 0.3, r) * 0.18 * smoothstep(1.0, 0.88, r);
  float ang = atan(vP.y, vP.x);
  float n = 0.6 + 0.8 * vnoise3(vec3(cos(ang) * 3.0, sin(ang) * 3.0, uTime * 0.8));
  float a = (ring * 3.0 + tail) * n * uAmt * step(r, 1.0);
  gl_FragColor = vec4(vec3(1.0, 0.7, 0.28) * a, 1.0);
}
`;

// ───────────────────────── ambient embers
export const emberVert = /* glsl */ `
attribute vec4 aRnd;
uniform float uTime;
uniform float uResY;
varying float vA;
void main(){
  float s = aRnd.w;
  vec3 p;
  p.x = aRnd.x * 190.0 + sin(uTime * 0.25 + s * 40.0) * 4.0;
  p.z = aRnd.z * 190.0 + cos(uTime * 0.21 + s * 33.0) * 4.0;
  float h = 45.0;
  float y = mod((aRnd.y * 0.5 + 0.5) * h + uTime * (0.5 + s * 1.4), h);
  p.y = y - 3.0;
  vA = smoothstep(0.0, 4.0, y) * (1.0 - smoothstep(h - 12.0, h, y)) * (0.45 + 0.55 * sin(uTime * (2.0 + s * 5.0) + s * 60.0));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  float size = 0.12 + s * 0.3;
  gl_PointSize = clamp(size * projectionMatrix[1][1] * uResY * 0.5 / max(gl_Position.w, 0.1), 1.0, 36.0);
}
`;

export const pointFrag = /* glsl */ `
varying float vA;
uniform float uAmt;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  a *= a;
  gl_FragColor = vec4(vec3(1.0, 0.7, 0.28) * a * vA * uAmt * 2.2, 1.0);
}
`;

// ───────────────────────── energy inflow into the core
export const inflowVert = /* glsl */ `
attribute vec4 aRnd;
uniform float uTime;
uniform float uResY;
uniform float uCharge;
uniform vec3 uCorePos;
varying float vA;
void main(){
  float s = aRnd.w;
  float u = fract(uTime * (0.12 + s * 0.16) + s * 7.0);
  float r0 = 10.0 + aRnd.x * 55.0;
  float r = r0 * pow(1.0 - u, 1.6) + 0.4;
  float ang = aRnd.y * 6.2832 + u * 5.5;
  float hgt = aRnd.z * 7.0 * (1.0 - u);
  vec3 p = uCorePos + vec3(cos(ang) * r, hgt, sin(ang) * r);
  vA = uCharge * smoothstep(0.0, 0.1, u) * (1.0 - smoothstep(0.85, 1.0, u)) * 1.4;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  float size = 0.15 + s * 0.3;
  gl_PointSize = clamp(size * projectionMatrix[1][1] * uResY * 0.5 / max(gl_Position.w, 0.1), 1.0, 30.0);
}
`;

// ───────────────────────── explosion sparks
export const blastVert = /* glsl */ `
attribute vec4 aDir;
attribute vec2 aLife;
uniform float uBT;
uniform float uResY;
uniform vec3 uCorePos;
varying float vA;
varying float vHeat;
void main(){
  if (uBT < 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vA = 0.0;
    vHeat = 0.0;
    return;
  }
  float k = 1.6;
  float tt = uBT;
  float dist = aDir.w * (1.0 - exp(-k * tt)) / k;
  vec3 p = uCorePos + aDir.xyz * dist;
  p.y -= 0.3 * (1.5 + aLife.y * 2.0) * tt * tt;
  float l = clamp(tt / aLife.x, 0.0, 1.0);
  vA = pow(1.0 - l, 2.5) * smoothstep(0.0, 0.03, tt);
  vHeat = 1.0 - smoothstep(0.0, 0.6, l);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  float size = (0.25 + aLife.y * 0.6) * (1.0 - l * 0.7);
  gl_PointSize = clamp(size * projectionMatrix[1][1] * uResY * 0.5 / max(gl_Position.w, 0.1), 1.0, 22.0);
}
`;

export const blastFrag = /* glsl */ `
varying float vA;
varying float vHeat;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  a *= a;
  vec3 c = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.95, 0.8), vHeat);
  gl_FragColor = vec4(c * a * vA * 1.1, 1.0);
}
`;

// ───────────────────────── explosion shards (flying gold debris)
export const shardVert = /* glsl */ `
attribute vec4 aDir;
attribute vec4 aSpin;
uniform float uBT;
uniform vec3 uCorePos;
varying vec3 vWPos;
vec3 rotAxis(vec3 v, vec3 k, float a){
  float c = cos(a);
  float s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}
void main(){
  if (uBT < 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vWPos = vec3(0.0);
    return;
  }
  float k = 1.4;
  float dist = aDir.w * (1.0 - exp(-k * uBT)) / k;
  vec3 center = uCorePos + aDir.xyz * dist;
  center.y -= 0.6 * uBT * uBT;
  float sc = aSpin.w * (1.0 - smoothstep(4.0, 7.5, uBT)) * smoothstep(0.0, 0.1, uBT);
  vec3 lp = rotAxis(position * sc, normalize(aSpin.xyz), uBT * (1.5 + aSpin.w * 3.0));
  vec4 wp = vec4(center + lp, 1.0);
  vWPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const shardFrag = /* glsl */ `
varying vec3 vWPos;
uniform float uBT;
${commonFrag}
void main(){
  vec3 N = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
  vec3 V = normalize(cameraPosition - vWPos);
  if (dot(N, V) < 0.0) N = -N;
  vec3 col = goldShade(N, V, vWPos, fract(dot(N, vec3(3.1, 7.7, 1.3))));
  col += vec3(1.0, 0.6, 0.2) * exp(-uBT * 1.3) * 2.4;
  col *= 1.3;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ───────────────────────── logo particles (camera-space)
export const logoPtsVert = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aTarget;
attribute float aSeed;
uniform float uForm;
uniform float uTime;
uniform float uScale;
uniform float uResY;
varying float vTw;
varying float vE;
void main(){
  float f = clamp((uForm - aSeed * 0.45) / 0.55, 0.0, 1.0);
  float e = f * f * (3.0 - 2.0 * f);
  vec3 target = vec3(aTarget.xy * uScale, aTarget.z);
  vec3 p = mix(aStart, target, e);
  float arc = sin(e * 3.14159);
  p += vec3(sin(aSeed * 40.0 + uTime * 1.7), cos(aSeed * 31.0 + uTime * 1.4), sin(aSeed * 23.0 + uTime)) * arc * 1.2;
  p += vec3(sin(aSeed * 90.0 + uTime * 2.0), cos(aSeed * 70.0 + uTime * 2.3), 0.0) * 0.015 * e;
  vTw = 0.5 + 0.5 * sin(uTime * 4.0 + aSeed * 100.0);
  vE = e;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = (0.035 + aSeed * 0.05) * mix(2.2, 1.0, e);
  gl_PointSize = clamp(size * projectionMatrix[1][1] * uResY * 0.5 / max(-mv.z, 0.1), 1.0, 18.0);
}
`;

export const logoPtsFrag = /* glsl */ `
varying float vTw;
varying float vE;
uniform float uAmt;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  a *= a;
  vec3 c = mix(vec3(1.0, 0.5, 0.12), vec3(1.0, 0.93, 0.72), 0.35 + 0.65 * vTw);
  gl_FragColor = vec4(c * a * uAmt * mix(2.4, 1.6, vE), 1.0);
}
`;

// ───────────────────────── final grade pass
export const finalVert = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const finalFrag = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uFlash;
uniform float uFade;
uniform float uAspect;
uniform float uAberr;
uniform float uStreak;
varying vec2 vUv;

float h12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 aces(vec3 x){
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
void main(){
  vec2 c = vUv - 0.5;
  vec2 ca = c * vec2(uAspect, 1.0);
  float r2 = dot(ca, ca);
  float ab = uAberr * (0.003 + r2 * 0.016);

  vec3 col;
  col.r = texture2D(tDiffuse, vUv + c * ab * 2.0).r;
  col.g = texture2D(tDiffuse, vUv).g;
  col.b = texture2D(tDiffuse, vUv - c * ab * 2.0).b;

  // anamorphic horizontal streak from the hottest highlights
  vec3 st = vec3(0.0);
  for (int i = -14; i <= 14; i++) {
    float fi = float(i);
    float w = exp(-abs(fi) * 0.22);
    vec3 s = texture2D(tDiffuse, vUv + vec2(fi * 0.010, 0.0)).rgb;
    st += max(s - vec3(1.6), vec3(0.0)) * w;
  }
  col += st * vec3(1.0, 0.62, 0.28) * 0.07 * uStreak;

  col += uFlash * vec3(1.0, 0.88, 0.62) * (1.3 - length(c) * 0.9);

  vec3 m = aces(col * 0.88);
  m = pow(m, vec3(0.95, 1.0, 1.09));

  float v = smoothstep(0.30, 1.0, length(ca * 1.25));
  m *= 1.0 - 0.6 * v;

  float g = h12(vUv * 1500.0 + fract(uTime) * 91.0) - 0.5;
  m += g * 0.02;

  m *= uFade;
  m = pow(max(m, 0.0), vec3(1.0 / 2.2));
  gl_FragColor = vec4(m, 1.0);
}
`;
