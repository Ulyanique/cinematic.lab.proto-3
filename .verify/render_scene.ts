// Software preview of the actual scene geometry through the actual camera rig.
// Flat-shaded + fake fog. Not the real look — only composition / framing.
import * as THREE from "three";
import fs from "node:fs";
import { buildArmillary, buildMonoliths, buildPillars, buildTerrain } from "../src/intro/world";
import { buildCompassEmblem } from "../src/intro/logo3d";
import { CameraRig } from "../src/intro/camera";
import { polishedFrag, polishedVert } from "../src/intro/shaders";
import { CORE_Y, TL } from "../src/intro/config";
import { groundHeight } from "../src/intro/math";

const U: Record<string, THREE.IUniform> = {
  uTime: { value: 0 },
  uCore: { value: new THREE.Vector4(0, CORE_Y, 0, 1) },
  uCorePos: { value: new THREE.Vector3(0, CORE_Y, 0) },
  uMono: { value: Array.from({ length: 10 }, () => new THREE.Vector4()) },
  uExposure: { value: 1 },
  uFogColor: { value: new THREE.Color(0.15, 0.06, 0.01) },
  uFogDensity: { value: 0.0058 },
  uCharge: { value: 0 },
  uWaveC: { value: new THREE.Vector2() },
  uWaveR: { value: 999 },
  uWaveW: { value: 40 },
  uShockR: { value: -1000 },
  uShockW: { value: 8 },
  uShockAmp: { value: 0 },
  uResY: { value: 1080 },
  uBT: { value: -1 },
};

const mat = new THREE.ShaderMaterial({
  vertexShader: polishedVert,
  fragmentShader: polishedFrag,
  uniforms: { ...U, uForm: { value: 1 }, uSweep: { value: 0 }, uGlow: { value: 1 }, uSpan: { value: 2 } },
});

const W = 900;
const H = 506; // ~16:9

function writePPM(path: string, w: number, h: number, rgb: Float32Array) {
  const buf = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    buf[i * 3] = Math.max(0, Math.min(255, Math.round(Math.pow(rgb[i * 3], 1 / 2.2) * 255)));
    buf[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(Math.pow(rgb[i * 3 + 1], 1 / 2.2) * 255)));
    buf[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(Math.pow(rgb[i * 3 + 2], 1 / 2.2) * 255)));
  }
  fs.writeFileSync(path, Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), buf]));
}

interface Item {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  color: [number, number, number];
  glow: number;
  label: string;
}

function collect(obj: THREE.Object3D, color: [number, number, number], glow = 0, out: Item[] = []) {
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    out.push({ geometry: m.geometry as THREE.BufferGeometry, matrix: m.matrixWorld.clone(), color, glow });
  });
  return out;
}

function renderScene(scene: THREE.Object3D, cam: THREE.PerspectiveCamera, label: string, fog = 0.0058) {
  scene.updateMatrixWorld(true);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const view = cam.matrixWorldInverse;
  const proj = cam.projectionMatrix;
  const rgb = new Float32Array(W * H * 3);
  const depth = new Float32Array(W * H).fill(Infinity);

  // sky gradient background
  for (let y = 0; y < H; y++) {
    const v = 1 - y / H;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const glow = Math.max(0, 1 - Math.abs(v - 0.47) * 3.2) * 0.22;
      rgb[i] = 0.05 + glow;
      rgb[i + 1] = 0.028 + glow * 0.55;
      rgb[i + 2] = 0.012 + glow * 0.2;
    }
  }

  if (label === "scene_14") {
    const dbg = root.children.filter((c) => c.type === "Group").slice(0, 3);
    dbg.forEach((g) => console.log("group", g.name || g.type, "pos", g.position.toArray().map((n) => n.toFixed(1)), "mw", g.matrixWorld.elements.slice(12, 15).map((n) => n.toFixed(1))));
  }
  const items: Item[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    let color: [number, number, number] = [0.35, 0.25, 0.12];
    let glow = 0;
    if (m.userData.color) color = m.userData.color as [number, number, number];
    if (m.userData.glow) glow = 1;
    let vis = true;
    for (let o: THREE.Object3D | null = m; o; o = o.parent) if (!o.visible) vis = false;
    if (!vis) return;
    items.push({ geometry: m.geometry as THREE.BufferGeometry, matrix: m.matrixWorld.clone(), color, glow, label: (m.userData.label as string) ?? m.parent?.name ?? "?" });
  });

  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const p = new THREE.Vector3();
  const L = new THREE.Vector3(-0.4, 0.8, 0.5).normalize();

  const coverage = new Map<string, number>();
  for (const it of items) {
    const geo = it.geometry;
    const pos = geo.getAttribute("position");
    if (!pos) continue;
    const idx = geo.getIndex();
    const n = idx ? idx.count : pos.count;
    const mv = new THREE.Matrix4().multiplyMatrices(view, it.matrix);
    const mvp = new THREE.Matrix4().multiplyMatrices(proj, mv);
    for (let t = 0; t + 2 < n; t += 3) {
      const i0 = idx ? idx.getX(t) : t;
      const i1 = idx ? idx.getX(t + 1) : t + 1;
      const i2 = idx ? idx.getX(t + 2) : t + 2;
      const a = new THREE.Vector3().fromBufferAttribute(pos, i0);
      const b = new THREE.Vector3().fromBufferAttribute(pos, i1);
      const c = new THREE.Vector3().fromBufferAttribute(pos, i2);
      // world normal for shading
      v0.copy(a).applyMatrix4(it.matrix);
      v1.copy(b).applyMatrix4(it.matrix);
      v2.copy(c).applyMatrix4(it.matrix);
      const nrm = v1.clone().sub(v0).cross(v2.clone().sub(v0)).normalize();
      const ndl = Math.abs(nrm.dot(L));
      const shade = 0.16 + 0.9 * ndl;

      // clip: skip triangles fully behind the camera
      const ca = a.clone().applyMatrix4(mvp);
      const cb = b.clone().applyMatrix4(mvp);
      const cc = c.clone().applyMatrix4(mvp);
      const cw = [a.clone().applyMatrix4(mv).z, b.clone().applyMatrix4(mv).z, c.clone().applyMatrix4(mv).z].map((z) => -z);
      if (cw[0] < 0.2 || cw[1] < 0.2 || cw[2] < 0.2) continue;

      const sx = (v: THREE.Vector3) => (v.x * 0.5 + 0.5) * W;
      const sy = (v: THREE.Vector3) => (1 - (v.y * 0.5 + 0.5)) * H;
      const x0 = sx(ca), y0 = sy(ca), x1 = sx(cb), y1 = sy(cb), x2 = sx(cc), y2 = sy(cc);
      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
      if (maxX < minX || maxY < minY) continue;
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(area) < 1e-9) continue;

      // fog per triangle centroid
      p.copy(v0).add(v1).add(v2).multiplyScalar(1 / 3);
      const dist = p.distanceTo(cam.position);
      const f = 1 - Math.exp(-dist * dist * fog * fog);

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          const wa = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / area;
          const wb = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / area;
          const wc = 1 - wa - wb;
          if (wa < 0 || wb < 0 || wc < 0) continue;
          const z = 1 / (wa / cw[0] + wb / cw[1] + wc / cw[2]);
          const id = y * W + x;
          if (z >= depth[id]) continue;
          depth[id] = z;
          coverage.set(it.label, (coverage.get(it.label) ?? 0) + 1);
          const col = it.color;
          const g = it.glow;
          const r = (col[0] * shade + g * 0.6) * (1 - f) + 0.15 * f;
          const gg = (col[1] * shade + g * 0.5) * (1 - f) + 0.06 * f;
          const bb = (col[2] * shade + g * 0.3) * (1 - f) + 0.011 * f;
          rgb[id * 3] = r;
          rgb[id * 3 + 1] = gg;
          rgb[id * 3 + 2] = bb;
        }
      }
    }
  }
  if (label === "scene_14") console.log("coverage", [...coverage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}:${(v / (W * H) * 100).toFixed(0)}%`).join(" "));
  writePPM(`/tmp/tool/${label}.ppm`, W, H, rgb);
  console.log("wrote", label);
}

const root = new THREE.Group();
root.add(buildTerrain(U));
root.add(buildPillars(U));
const monos = buildMonoliths(U, 4);
for (const m of monos) {
  m.goldMat.uniforms.uGrow.value = 1;
  const body = m.group.children[0] as THREE.Mesh;
  const palette: [number, number, number][] = [
    [0.9, 0.2, 0.2], [0.9, 0.5, 0.1], [0.8, 0.8, 0.1], [0.3, 0.8, 0.2], [0.1, 0.8, 0.5],
    [0.1, 0.7, 0.9], [0.2, 0.4, 0.95], [0.6, 0.3, 0.95], [0.95, 0.3, 0.9], [1.0, 1.0, 1.0],
  ];
  body.userData.color = palette[monos.indexOf(m) % 10];
  body.userData.label = `mono${monos.indexOf(m)}`;
  const screen = m.group.children[1] as THREE.Mesh;
  screen.userData.color = [0.02, 0.02, 0.02];
  screen.userData.label = `screen${monos.indexOf(m)}`;
  root.add(m.group);
}
const armM = new THREE.ShaderMaterial({
  vertexShader: polishedVert,
  fragmentShader: polishedFrag,
  uniforms: { ...U, uForm: { value: 1 }, uSweep: { value: 0 }, uGlow: { value: 1 }, uSpan: { value: 2 } },
});
const arm = buildArmillary(armM);
root.add(arm.group);
const emblem = buildCompassEmblem(mat);
emblem.group.position.set(0, CORE_Y + 0.35, 0);
emblem.group.scale.setScalar(1.08);
root.add(emblem.group);
emblem.group.visible = false;

const rig = new CameraRig(monos.map((m) => ({ x: m.base.x, z: m.base.z, r: 6 })));
const cam = new THREE.PerspectiveCamera(40, W / H, 0.1, 2000);

// per-item colors
root.traverse((o) => {
  const m = o as THREE.Mesh;
  if (m.isMesh && m.userData.color) (m as any).__color = m.userData.color;
});
for (const t of [2, 6, 10, 11.4, 14, 18, 22, 26, 28.2]) {
  const pose = rig.sample(t);
  cam.position.copy(pose.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(pose.target);
  cam.rotateZ(pose.roll);
  cam.fov = pose.fov;
  renderScene(root, cam, `scene_${String(t).replace(".", "p")}`);
}
// final logo frame
emblem.group.visible = true;
arm.group.visible = false;
monos.forEach((m) => (m.group.visible = false));
{
  const pose = rig.sample(TL.END);
  emblem.group.lookAt(pose.pos);
  emblem.group.updateMatrixWorld(true);
  cam.position.copy(pose.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(pose.target);
  cam.rotateZ(pose.roll);
  cam.fov = pose.fov;
  renderScene(root, cam, "scene_logo", 0.0258);
}
void groundHeight;
