// Headless (no WebGL) exercise of the intro's scene construction + camera rig.
// Bundled with esbuild and run in Node with minimal DOM stubs.
import * as THREE from "three";
import { buildArmillary, buildMonoliths, buildPillars, buildTerrain } from "../src/intro/world";
import { buildCompassEmblem } from "../src/intro/logo3d";
import { CameraRig } from "../src/intro/camera";
import { polishedFrag, polishedVert } from "../src/intro/shaders";
import { CORE_Y, MONO_COUNT, TL } from "../src/intro/config";
import { groundHeight, wrapAngle } from "../src/intro/math";

const U: Record<string, THREE.IUniform> = {
  uTime: { value: 0 },
  uCore: { value: new THREE.Vector4(0, CORE_Y, 0, 0.5) },
  uCorePos: { value: new THREE.Vector3(0, CORE_Y, 0) },
  uMono: { value: Array.from({ length: 10 }, () => new THREE.Vector4()) },
  uExposure: { value: 1 },
  uFogColor: { value: new THREE.Color(0.2, 0.1, 0.02) },
  uFogDensity: { value: 0.006 },
  uCharge: { value: 0 },
  uWaveC: { value: new THREE.Vector2() },
  uWaveR: { value: 0 },
  uWaveW: { value: 40 },
  uShockR: { value: 0 },
  uShockW: { value: 1 },
  uShockAmp: { value: 0 },
  uResY: { value: 1080 },
  uBT: { value: -1 },
};

const t0 = Date.now();
const terrain = buildTerrain(U);
console.log("terrain verts", terrain.geometry.getAttribute("position").count, `${Date.now() - t0}ms`);

const pillars = buildPillars(U);
console.log("pillar verts", pillars.geometry.getAttribute("position").count);

const monos = buildMonoliths(U, 4);
console.log("monoliths", monos.length);
monos.forEach((m, i) => {
  const g = m.group.children[0] as THREE.Mesh;
  g.geometry.computeBoundingBox();
  const bb = g.geometry.boundingBox!;
  console.log(
    `  #${i} angle=${m.angle.toFixed(2)} h=${m.height.toFixed(1)} tris=${g.geometry.getAttribute("position").count / 3} ` +
      `bbox=(${bb.min.x.toFixed(1)},${bb.min.y.toFixed(1)},${bb.min.z.toFixed(1)})..(${bb.max.x.toFixed(1)},${bb.max.y.toFixed(1)},${bb.max.z.toFixed(1)})`
  );
});

const mat = new THREE.ShaderMaterial({
  vertexShader: polishedVert,
  fragmentShader: polishedFrag,
  uniforms: { ...U, uForm: { value: 1 }, uSweep: { value: 0 }, uGlow: { value: 1 }, uSpan: { value: 2 } },
});

const emblem = buildCompassEmblem(mat);
emblem.group.updateMatrixWorld(true);
const ebox = new THREE.Box3().setFromObject(emblem.group);
const size = ebox.getSize(new THREE.Vector3());
console.log("emblem size", size.toArray().map((n) => n.toFixed(2)), "meshes", emblem.group.children.length);
const samples = emblem.sampleSurface(500, 3);
let nan = 0;
for (let i = 0; i < samples.length; i++) if (!Number.isFinite(samples[i])) nan++;
console.log("emblem samples", samples.length / 3, "NaN:", nan);
console.log(
  "sample bbox",
  [Math.min(...Array.from({ length: 500 }, (_, i) => samples[i * 3])), Math.max(...Array.from({ length: 500 }, (_, i) => samples[i * 3]))]
    .map((n) => n.toFixed(2)),
  [Math.min(...Array.from({ length: 500 }, (_, i) => samples[i * 3 + 1])), Math.max(...Array.from({ length: 500 }, (_, i) => samples[i * 3 + 1]))]
    .map((n) => n.toFixed(2))
);

const arm = buildArmillary(mat);
console.log("armillary rings", arm.rings.length);

// ── camera path audit
const rig = new CameraRig(monos.map((m) => ({ x: m.base.x, z: m.base.z, r: 7.5 })));
let minClear = Infinity;
let minClearAt = 0;
let maxSpeed = 0;
let maxSpeedAt = 0;
let belowGround = 0;
const prev = new THREE.Vector3();
for (let t = 0; t <= TL.END; t += 1 / 60) {
  const p = rig.sample(t);
  if (!Number.isFinite(p.pos.x + p.pos.y + p.pos.z + p.fov + p.roll)) {
    console.log("NaN at", t);
    break;
  }
  if (p.pos.y < groundHeight(p.pos.x, p.pos.z) + 1.5) belowGround++;
  for (const m of monos) {
    const d = Math.hypot(p.pos.x - m.base.x, p.pos.z - m.base.z);
    if (d < minClear) {
      minClear = d;
      minClearAt = t;
    }
  }
  if (t > 0) {
    const sp = p.pos.distanceTo(prev) * 60;
    if (sp > maxSpeed) {
      maxSpeed = sp;
      maxSpeedAt = t;
    }
  }
  prev.copy(p.pos);
}
console.log("camera: min crystal clearance", minClear.toFixed(2), "at", minClearAt.toFixed(2), "s");
console.log("camera: max speed", maxSpeed.toFixed(1), "units/s at", maxSpeedAt.toFixed(2), "s");
console.log("camera: frames below ground", belowGround);

for (const t of [0, 3, 6, 9, 11.4, 14, 18, 22, 26, 28, 30, 34]) {
  const p = rig.sample(t);
  console.log(
    `t=${t.toString().padStart(4)} pos=(${p.pos.x.toFixed(1)}, ${p.pos.y.toFixed(1)}, ${p.pos.z.toFixed(1)}) r=${Math.hypot(p.pos.x, p.pos.z).toFixed(1)} fov=${p.fov.toFixed(0)} roll=${p.roll.toFixed(3)}`
  );
}

// how many crystals are "in frame" at each moment (sanity for the reveal schedule)
const halfH = (fov: number, aspect: number) => (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * aspect) * 180) / Math.PI;
for (const t of [8, 11, 14, 18, 22, 26]) {
  const p = rig.sample(t);
  const ang = Math.atan2(p.pos.x, p.pos.z);
  const half = halfH(p.fov, 16 / 9) / 2;
  const vis = monos.filter((m) => Math.abs((wrapAngle(m.angle - (ang + Math.PI)) * 180) / Math.PI) < half + 10);
  console.log(`t=${t} fovH≈${(half * 2).toFixed(0)}° crystals in frame: ${vis.length}`);
}
