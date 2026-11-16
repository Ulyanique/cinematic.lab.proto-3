// Software rasteriser (z-buffer, flat shading) for verifying the emblem + a top view of the choreography.
import * as THREE from "three";
import { buildCompassEmblem } from "../src/intro/logo3d";
import { buildMonoliths } from "../src/intro/world";
import { CameraRig } from "../src/intro/camera";
import { polishedFrag, polishedVert } from "../src/intro/shaders";
import { CORE_Y, MONO_COUNT, TL } from "../src/intro/config";
import fs from "node:fs";

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

const mat = new THREE.ShaderMaterial({
  vertexShader: polishedVert,
  fragmentShader: polishedFrag,
  uniforms: { ...U, uForm: { value: 1 }, uSweep: { value: 0 }, uGlow: { value: 1 }, uSpan: { value: 2 } },
});

function writePPM(path: string, w: number, h: number, rgb: Float32Array) {
  const buf = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    buf[i * 3] = Math.max(0, Math.min(255, Math.round(rgb[i * 3] * 255)));
    buf[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(rgb[i * 3 + 1] * 255)));
    buf[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(rgb[i * 3 + 2] * 255)));
  }
  fs.writeFileSync(path, Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), buf]));
}

/** crude flat-shaded z-buffer rasteriser, orthographic along `dir` */
function raster(group: THREE.Object3D, w: number, h: number, dir: THREE.Vector3, up: THREE.Vector3, label: string) {
  const rgb = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    rgb[i * 3] = 0.02;
    rgb[i * 3 + 1] = 0.015;
    rgb[i * 3 + 2] = 0.012;
  }
  const zbuf = new Float32Array(w * h).fill(Infinity);
  group.updateMatrixWorld(true);
  const view = new THREE.Matrix4().lookAt(dir.clone(), new THREE.Vector3(0, 0, 0), up);
  const inv = view.clone().invert();
  const pts: THREE.Vector3[] = [];
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry as THREE.BufferGeometry;
    const pos = g.getAttribute("position");
    if (!pos) return;
    const idx = g.getIndex();
    const n = idx ? idx.count : pos.count;
    const proj = (i: number) => {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(view);
      return v;
    };
    for (let t = 0; t + 2 < n; t += 3) {
      const i0 = idx ? idx.getX(t) : t;
      const i1 = idx ? idx.getX(t + 1) : t + 1;
      const i2 = idx ? idx.getX(t + 2) : t + 2;
      const a = proj(i0);
      const b = proj(i1);
      const c = proj(i2);
      // orthographic: x,y in world units, depth = z (view space, camera looks -z)
      const nx = (b.y - a.y) * (c.z - a.z) - (c.y - a.y) * (b.z - a.z);
      const ny = (c.x - a.x) * (b.z - a.z) - (b.x - a.x) * (c.z - a.z);
      const nz = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
      const nl = Math.hypot(nx, ny, nz) || 1;
      const nrm = new THREE.Vector3(nx / nl, ny / nl, nz / nl);
      const L = new THREE.Vector3(-0.45, 0.75, 0.55).normalize();
      const shade = Math.max(0, nrm.dot(L)) * 0.85 + 0.18 + 0.25 * Math.pow(1 - Math.abs(nrm.z), 2);
      const col = [1.0 * shade, 0.72 * shade, 0.28 * shade];
      const S = w / 6.2;
      const sx = (v: THREE.Vector3) => w / 2 + v.x * S;
      const sy = (v: THREE.Vector3) => h / 2 - v.y * S;
      const x0 = sx(a), y0 = sy(a), x1 = sx(b), y1 = sy(b), x2 = sx(c), y2 = sy(c);
      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)));
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(area) < 1e-9) continue;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          const wa = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / area;
          const wb = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / area;
          const wc = 1 - wa - wb;
          if (wa < 0 || wb < 0 || wc < 0) continue;
          const z = wa * a.z + wb * b.z + wc * c.z;
          const id = y * w + x;
          if (z < zbuf[id]) {
            zbuf[id] = z;
            rgb[id * 3] = col[0];
            rgb[id * 3 + 1] = col[1];
            rgb[id * 3 + 2] = col[2];
          }
        }
      }
    }
  });
  writePPM(`/tmp/tool/${label}.ppm`, w, h, rgb);
  console.log("wrote", label);
  pts.length = 0;
  void inv;
}

const emblem = buildCompassEmblem(mat);
raster(emblem.group, 700, 700, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), "emblem_front");
raster(emblem.group, 700, 700, new THREE.Vector3(0.6, 0.25, 1), new THREE.Vector3(0, 1, 0), "emblem_3q");

// ── top view of the choreography
{
  const monos = buildMonoliths(U, 4);
  const rig = new CameraRig(monos.map((m) => ({ x: m.base.x, z: m.base.z, r: 7.5 })));
  const w = 800;
  const h = 800;
  const rgb = new Float32Array(w * h * 3).fill(0.03);
  const S = 3.2; // px per unit
  const px = (x: number) => w / 2 + x * S;
  const py = (z: number) => h / 2 - z * S;
  const dot = (x: number, y: number, r: number, c: number[]) => {
    for (let yy = Math.floor(y - r); yy <= y + r; yy++)
      for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        if ((xx - x) ** 2 + (yy - y) ** 2 > r * r) continue;
        const i = (yy * w + xx) * 3;
        rgb[i] = c[0];
        rgb[i + 1] = c[1];
        rgb[i + 2] = c[2];
      }
  };
  // crystals
  monos.forEach((m, i) => {
    dot(px(m.base.x), py(m.base.z), 5.5 * S, [0.9, 0.55, 0.15]);
    void i;
  });
  // camera path
  let prev: THREE.Vector3 | null = null;
  const marks: [number, number[]][] = [];
  for (let t = 0; t <= TL.END; t += 0.05) {
    const p = rig.sample(t);
    if (prev) {
      const steps = Math.ceil(p.pos.distanceTo(prev) * S);
      for (let s = 0; s <= steps; s++) {
        const x = px(prev.x + (p.pos.x - prev.x) * (s / steps));
        const y = py(prev.z + (p.pos.z - prev.z) * (s / steps));
        const c = t < 12 ? [0.35, 0.65, 1] : t < 23 ? [0.5, 1, 0.6] : t < 28 ? [1, 0.85, 0.2] : [1, 0.3, 0.3];
        dot(x, y, 1.1, c);
      }
    }
    prev = p.pos.clone();
    if (Math.abs(t % 4) < 0.051) marks.push([t, [px(p.pos.x), py(p.pos.z)]]);
  }
  marks.forEach(([t, m]) => dot(m[0], m[1], 4, [1, 1, 1]));
  writePPM("/tmp/tool/path_top.ppm", w, h, rgb);
  console.log("wrote path_top (blue flew-in, green orbit, yellow converge, red finale)", marks.map(([t]) => t).join(","));
}
