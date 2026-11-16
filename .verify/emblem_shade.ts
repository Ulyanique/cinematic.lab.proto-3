// Flat-shaded emulation of the emblem's metal shader (polishedFrag) so the
// tone/legibility can be judged without a GPU. Not pixel-accurate — it takes
// the per-face normal and evaluates the same lighting terms per triangle.
import * as THREE from "three";
import fs from "node:fs";
import { buildCompassEmblem } from "../src/intro/logo3d";
import { CameraRig } from "../src/intro/camera";
import { buildMonoliths } from "../src/intro/world";
import { CORE_Y, TL } from "../src/intro/config";
import { goldFrag, goldVert } from "../src/intro/shaders";

const mat = new THREE.ShaderMaterial({ vertexShader: goldVert, fragmentShader: goldFrag, uniforms: { uTime:{value:0}, uExposure:{value:0.66}, uSweep:{value:0}, uGlow:{value:1}, uSpan:{value:2}, uForm:{value:1} } });
const U: any = { uTime:{value:0}, uCore:{value:new THREE.Vector4(0,CORE_Y,0,1)}, uCorePos:{value:new THREE.Vector3()}, uMono:{value:Array.from({length:10},()=>new THREE.Vector4())}, uExposure:{value:1}, uFogColor:{value:new THREE.Color()}, uFogDensity:{value:0.006}, uCharge:{value:0}, uWaveC:{value:new THREE.Vector2()}, uWaveR:{value:0}, uWaveW:{value:40}, uShockR:{value:0}, uShockW:{value:1}, uShockAmp:{value:0}, uResY:{value:1080}, uBT:{value:-1} };
const monos = buildMonoliths(U, 4);
const rig = new CameraRig(monos.map(m => ({ x: m.base.x, z: m.base.z, r: 6 })));
const pose = rig.sample(TL.END);
const W = 900, H = 506;
const cam = new THREE.PerspectiveCamera(pose.fov, W / H, 0.1, 2000);
cam.position.copy(pose.pos); cam.up.set(0, 1, 0); cam.lookAt(pose.target); cam.rotateZ(pose.roll);
cam.updateMatrixWorld(true); cam.updateProjectionMatrix();

const em = buildCompassEmblem(mat);
em.group.position.set(0, CORE_Y + 0.35, 0);
em.group.scale.setScalar(0.94);
em.group.lookAt(pose.pos); em.group.rotateY(0.1); em.group.rotateX(0.04);
em.group.updateMatrixWorld(true);

const L1 = new THREE.Vector3(-0.45, 0.75, 0.55).normalize();
const L2 = new THREE.Vector3(0.85, -0.2, 0.45).normalize();
const L3 = new THREE.Vector3(0.0, 0.15, -1.0).normalize();
const envColor = (R: THREE.Vector3) => {
  const y = R.y;
  const s = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const horizon = [0.3, 0.15, 0.03], zenith = [0.09, 0.04, 0.009], below = [0.07, 0.03, 0.006];
  const k = s(0, 0.85, y), k2 = 1 - s(-0.5, 0, y);
  const c = [0, 0, 0];
  for (let i = 0; i < 3; i++) c[i] = (horizon[i] * (1 - k) + zenith[i] * k) * (1 - k2) + below[i] * k2;
  const add = (dir: number[], amp: number, pw: number, col: number[]) => {
    const d = Math.max(0, R.x * dir[0] + R.y * dir[1] + R.z * dir[2]);
    const v = amp * Math.pow(d, pw);
    for (let i = 0; i < 3; i++) c[i] += col[i] * v;
  };
  const n1 = new THREE.Vector3(0.45, 0.65, -0.6).normalize();
  const n2 = new THREE.Vector3(-0.75, 0.35, 0.35).normalize();
  const n3 = new THREE.Vector3(0.1, 0.25, 0.95).normalize();
  add(n1.toArray(), 1.35, 26, [1, 0.86, 0.52]);
  add(n2.toArray(), 0.85, 14, [1, 0.55, 0.18]);
  add(n3.toArray(), 0.5, 12, [1, 0.75, 0.35]);
  const stripRaw = Math.sin(R.x * 4 + R.z * 3 + R.y * 2) * 0.5 + 0.5;
  const strip = s(0.93, 1.0, stripRaw) * s(-0.1, 0.5, y);
  for (let i = 0; i < 3; i++) c[i] += [1, 0.82, 0.5][i] * 0.75 * strip;
  return c;
};

const rgb = new Float32Array(W * H * 3);
for (let i = 0; i < W * H; i++) { rgb[i*3] = 0.012; rgb[i*3+1] = 0.008; rgb[i*3+2] = 0.005; }
const depth = new Float32Array(W * H).fill(Infinity);
let tris = 0, drawn = 0, culled = 0, oob = 0;
const view = cam.matrixWorldInverse, proj = cam.projectionMatrix;
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3(), V = new THREE.Vector3(), R = new THREE.Vector3();
em.group.traverse((o) => {
  const m = o as THREE.Mesh;
  if (!m.isMesh) return;
  const g = m.geometry as THREE.BufferGeometry;
  const pos = g.getAttribute("position");
  const idx = g.getIndex();
  const n = idx ? idx.count : pos.count;
  const mw = m.matrixWorld;
  tris += (idx ? idx.count : pos.count) / 3;
  // positions below are already in world space, so only view+proj here
  const mvp = new THREE.Matrix4().multiplyMatrices(proj, view);
  const mv = view;
  for (let t = 0; t + 2 < n; t += 3) {
    const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
    a.fromBufferAttribute(pos, i0).applyMatrix4(mw);
    b.fromBufferAttribute(pos, i1).applyMatrix4(mw);
    c.fromBufferAttribute(pos, i2).applyMatrix4(mw);
    nrm.copy(e1.subVectors(b, a)).cross(e2.subVectors(c, a)).normalize();
    V.copy(cam.position).sub(a).add(cam.position).sub(b).add(cam.position).sub(c).normalize();
    let N = nrm.clone();
    if (N.dot(V) < 0) N.negate();
    R.copy(V).negate().reflect(N).normalize();
    const ndv = Math.max(0, Math.min(1, N.dot(V)));
    const F0 = [1, 0.77, 0.34];
    const fr = Math.pow(1 - ndv, 5);
    const F = F0.map(v => v + (1 - v) * fr);
    const env = envColor(R);
    const col = env.map((v, i) => v * F[i] * 1.05);
    const d1 = Math.max(0, N.dot(L1));
    const s1 = Math.pow(Math.max(0, R.dot(L1)), 46);
    const s2 = Math.pow(Math.max(0, R.dot(L2)), 20);
    const s3 = Math.pow(Math.max(0, R.dot(L3)), 30);
    const spec = [1, 0.9, 0.68].map((v, i) => v * s1 * 1.75);
    const spec2 = [1, 0.6, 0.22].map(v => v * (s2 * 0.6 + d1 * 0.26));
    const spec3 = [1, 0.45, 0.15].map(v => v * s3 * 0.55);
    const rim = Math.pow(1 - ndv, 2.4) * (0.16 + 0.4 * 1.0);
    for (let i = 0; i < 3; i++) col[i] += spec[i] + spec2[i] + spec3[i] + [1, 0.68, 0.28][i] * rim;
    for (let i = 0; i < 3; i++) col[i] = col[i] / (1 + col[i] * 0.34) * (1 + (0.66 - 1) * 0.35);
    const ca = a.clone().applyMatrix4(mvp), cb = b.clone().applyMatrix4(mvp), cc = c.clone().applyMatrix4(mvp);
    const cw = [a.clone().applyMatrix4(mv).z, b.clone().applyMatrix4(mv).z, c.clone().applyMatrix4(mv).z].map(z => -z);
    if (cw[0] < 0.2 || cw[1] < 0.2 || cw[2] < 0.2) { culled++; continue; }
    drawn++;
    const sx = (v: THREE.Vector3) => (v.x * 0.5 + 0.5) * W, sy = (v: THREE.Vector3) => (1 - (v.y * 0.5 + 0.5)) * H;
    const x0 = sx(ca), y0 = sy(ca), x1 = sx(cb), y1 = sy(cb), x2 = sx(cc), y2 = sy(cc);
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (maxX < minX || maxY < minY) { oob++; continue; }
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const wa = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / area;
      const wb = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / area;
      const wc = 1 - wa - wb;
      if (wa < 0 || wb < 0 || wc < 0) continue;
      const z = 1 / (wa / cw[0] + wb / cw[1] + wc / cw[2]);
      const id = y * W + x;
      if (z >= depth[id]) continue;
      depth[id] = z;
      rgb[id*3] = col[0]; rgb[id*3+1] = col[1]; rgb[id*3+2] = col[2];
    }
  }
});
const buf = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H * 3; i++) buf[i] = Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, rgb[i]), 1 / 2.2) * 255)));
fs.writeFileSync("/tmp/tool/emblem_shade.ppm", Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), buf]));
console.log("wrote emblem_shade.ppm", { tris, drawn, culled, oob, sampleDepth: depth.find(v => v < 100) });
