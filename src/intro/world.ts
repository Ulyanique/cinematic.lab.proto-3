import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { goldFrag, goldVert, screenFrag, screenVert } from "./shaders";
import { groundHeight, mulberry32 } from "./math";
import { CORE_Y, GATE_DIR, GATE_GAP, MONO_COUNT, RING_R, VIDEO_CLIPS, VIDEO_SOURCES } from "./config";

export type Uniforms = Record<string, THREE.IUniform>;

export interface Monolith {
  group: THREE.Group;
  angle: number;
  height: number;
  /** base centre in world space (screen side) */
  base: THREE.Vector3;
  goldMat: THREE.ShaderMaterial;
  screenMat: THREE.ShaderMaterial;
  video: HTMLVideoElement | null;
  videoStarted: boolean;
  /** time (s) at which this crystal starts growing */
  riseAt: number;
}

// ───────────────────────── terrain: jittered low-poly golden field
export function buildTerrain(U: Uniforms) {
  const rng = mulberry32(7);
  const N = 120;
  const SIZE = 290;
  const step = (SIZE * 2) / N;
  const gx: number[] = [];
  const gz: number[] = [];
  const gy: number[] = [];
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const edge = i === 0 || j === 0 || i === N || j === N;
      const jx = edge ? 0 : (rng() - 0.5) * step * 0.7;
      const jz = edge ? 0 : (rng() - 0.5) * step * 0.7;
      const x = -SIZE + i * step + jx;
      const z = -SIZE + j * step + jz;
      gx.push(x);
      gz.push(z);
      gy.push(groundHeight(x, z));
    }
  }
  const tris = N * N * 2;
  const pos = new Float32Array(tris * 9);
  const bary = new Float32Array(tris * 9);
  const cen = new Float32Array(tris * 12);
  const seed = new Float32Array(tris * 3);
  let o = 0;
  let t = 0;
  const push = (a: number, b: number, c: number) => {
    const ids = [a, b, c];
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const id of ids) {
      cx += gx[id] / 3;
      cy += gy[id] / 3;
      cz += gz[id] / 3;
    }
    const s = rng();
    for (let v = 0; v < 3; v++) {
      const id = ids[v];
      pos[o] = gx[id];
      pos[o + 1] = gy[id];
      pos[o + 2] = gz[id];
      bary[o] = v === 0 ? 1 : 0;
      bary[o + 1] = v === 1 ? 1 : 0;
      bary[o + 2] = v === 2 ? 1 : 0;
      cen[t * 4] = cx;
      cen[t * 4 + 1] = cy;
      cen[t * 4 + 2] = cz;
      cen[t * 4 + 3] = 0;
      seed[t] = s;
      o += 3;
      t++;
    }
  };
  const W = N + 1;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * W + i;
      const b = a + 1;
      const d = a + W;
      const c = d + 1;
      if (rng() > 0.5) {
        push(a, d, b);
        push(b, d, c);
      } else {
        push(a, d, c);
        push(a, c, b);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aBary", new THREE.BufferAttribute(bary, 3));
  geo.setAttribute("aCenter", new THREE.BufferAttribute(cen, 4));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: goldVert,
    fragmentShader: goldFrag,
    uniforms: { ...U, uGrow: { value: 1 }, uHeight: { value: 1 } },
    defines: { TERRAIN: "" },
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

// ───────────────────────── background pillar clusters
interface PillarSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  yaw: number;
}

export function buildPillars(U: Uniforms) {
  const rng = mulberry32(99);
  const specs: PillarSpec[] = [];

  // hero pillars flanking the entry corridor
  const heroes: [number, number, number, number][] = [
    [-30, 128, 11, 78],
    [34, 100, 10, 70],
    [-36, 72, 9, 52],
    [40, 64, 8, 44],
    [-52, 168, 14, 96],
    [58, 150, 12, 88],
    [-64, 96, 10, 58],
    [66, 112, 9, 62],
  ];
  for (const [x, z, w, h] of heroes) {
    specs.push({ x, z, w, d: w * 0.8, h, yaw: (rng() - 0.5) * 0.4 });
    specs.push({ x: x + w * 0.9, z: z + 3, w: w * 0.55, d: w * 0.5, h: h * 0.58, yaw: rng() });
  }

  // scattered clusters, kept clear of the corridor and of the crystal ring
  let tries = 0;
  while (specs.length < 96 && tries < 900) {
    tries++;
    const ang = rng() * Math.PI * 2;
    const r = 62 + Math.pow(rng(), 0.8) * 120;
    const cx = Math.sin(ang) * r;
    const cz = Math.cos(ang) * r;
    if (cz > 0 && Math.abs(cx) < 26) continue;
    const n = 2 + Math.floor(rng() * 3);
    const baseH = 10 + rng() * 26 + r * 0.12;
    for (let k = 0; k < n; k++) {
      specs.push({
        x: cx + (rng() - 0.5) * 12,
        z: cz + (rng() - 0.5) * 12,
        w: 3 + rng() * 6,
        d: 3 + rng() * 6,
        h: baseH * (0.45 + rng() * 0.8),
        yaw: rng() * Math.PI,
      });
    }
  }

  const pos: number[] = [];
  const bary: number[] = [];
  const cen: number[] = [];
  const seed: number[] = [];

  const quad = (q: THREE.Vector3[], base: THREE.Vector3, h: number) => {
    const s = rng();
    const b = [
      [1, 1, 0],
      [0, 1, 0],
      [0, 1, 1],
      [1, 0, 1],
      [0, 1, 1],
      [0, 0, 1],
    ];
    const order = [0, 1, 2, 0, 2, 3];
    for (let i = 0; i < 6; i++) {
      const p = q[order[i]];
      pos.push(p.x, p.y, p.z);
      bary.push(b[i][0], b[i][1], b[i][2]);
      cen.push(base.x, base.y, base.z, h);
      seed.push(s);
    }
  };

  for (const s of specs) {
    const gy = groundHeight(s.x, s.z) - 5;
    const base = new THREE.Vector3(s.x, gy, s.z);
    const cs = Math.cos(s.yaw);
    const sn = Math.sin(s.yaw);
    const corner = (sx: number, sz: number, y: number) =>
      new THREE.Vector3(s.x + (sx * s.w * cs - sz * s.d * sn) / 2, y, s.z + (sx * s.w * sn + sz * s.d * cs) / 2);
    const signs: [number, number][] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    const total = s.h + 5;
    const bs = signs.map(([a, b]) => corner(a, b, gy));
    const ts = signs.map(([a, b]) => corner(a * 0.94, b * 0.94, gy + total * (0.93 + rng() * 0.12)));
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      quad([bs[i], bs[j], ts[j], ts[i]], base, total);
    }
    quad([ts[0], ts[1], ts[2], ts[3]], base, total);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aBary", new THREE.Float32BufferAttribute(bary, 3));
  geo.setAttribute("aCenter", new THREE.Float32BufferAttribute(cen, 4));
  geo.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: goldVert,
    fragmentShader: goldFrag,
    uniforms: { ...U, uGrow: { value: 1 }, uHeight: { value: 1 } },
    defines: { PILLAR: "" },
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

// ───────────────────────── barycentric edges with coplanar diagonals hidden
function withBary(geo: THREE.BufferGeometry, rng: () => number) {
  const pos = geo.getAttribute("position");
  const tc = pos.count / 3;
  const key = (i: number) =>
    `${Math.round(pos.getX(i) * 400)},${Math.round(pos.getY(i) * 400)},${Math.round(pos.getZ(i) * 400)}`;
  const normals: THREE.Vector3[] = [];
  const edges = new Map<string, number[]>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ek = (k1: string, k2: string) => (k1 < k2 ? k1 + "|" + k2 : k2 + "|" + k1);
  for (let t = 0; t < tc; t++) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    normals.push(b.clone().sub(a).cross(c.clone().sub(a)).normalize());
    const k = [key(t * 3), key(t * 3 + 1), key(t * 3 + 2)];
    for (let e = 0; e < 3; e++) {
      const id = ek(k[(e + 1) % 3], k[(e + 2) % 3]);
      const list = edges.get(id);
      if (list) list.push(t);
      else edges.set(id, [t]);
    }
  }
  const bary = new Float32Array(pos.count * 3);
  const seed = new Float32Array(pos.count);
  for (let t = 0; t < tc; t++) {
    const k = [key(t * 3), key(t * 3 + 1), key(t * 3 + 2)];
    const hidden = [false, false, false];
    for (let e = 0; e < 3; e++) {
      const list = edges.get(ek(k[(e + 1) % 3], k[(e + 2) % 3]))!;
      for (const o of list) if (o !== t && normals[o].dot(normals[t]) > 0.999) hidden[e] = true;
    }
    const s = rng();
    for (let v = 0; v < 3; v++) {
      for (let j = 0; j < 3; j++) bary[(t * 3 + v) * 3 + j] = j === v || hidden[j] ? 1 : 0;
      seed[t * 3 + v] = s;
    }
  }
  geo.setAttribute("aBary", new THREE.BufferAttribute(bary, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  geo.deleteAttribute("normal");
  geo.deleteAttribute("uv");
  return geo;
}

// ───────────────────────── crystal monoliths
interface MonoBuild {
  geo: THREE.BufferGeometry;
  quad: THREE.Vector3[]; // FBL, FBR, FTR, FTL
  H: number;
}

function buildMonolithGeometry(rng: () => number, H: number, W: number): MonoBuild {
  const D = W * (0.6 + rng() * 0.3);
  const zf = D * 0.45;
  const b = -(0.03 + rng() * 0.05);
  const yt = H * (0.7 + rng() * 0.08);
  const yL = yt * (0.9 + rng() * 0.12);
  const yR = yt * (0.9 + rng() * 0.12);
  const sk = (rng() - 0.5) * W * 0.25;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  const FBL = V(-W * (0.5 + rng() * 0.08), 0, zf);
  const FBR = V(W * (0.5 + rng() * 0.08), 0, zf);
  const FTL = V(-W * (0.4 + rng() * 0.06) + sk, yL, zf + b * yL);
  const FTR = V(W * (0.38 + rng() * 0.06) + sk, yR, zf + b * yR);

  const pts: THREE.Vector3[] = [
    FBL,
    FBR,
    FTL,
    FTR,
    V(-W * 0.58, 0, -D * 0.9),
    V(W * 0.58, 0, -D * 0.8),
    V(-W * 0.3 + sk, yL * 0.96, -D * 0.5),
    V(W * 0.28 + sk, yR * 0.97, -D * 0.45),
    V(-W * 0.62, yt * 0.45, zf * 0.15),
    V(W * 0.6, yt * 0.4, -D * 0.1),
    V(-W * 0.2 + (rng() - 0.5) * W * 0.3, H, zf + b * H - D * 0.35),
    V(W * 0.15 + (rng() - 0.5) * W * 0.3, H * (0.88 + rng() * 0.06), zf + b * H - D * 0.8),
  ];
  const main = new ConvexGeometry(pts);
  const parts: THREE.BufferGeometry[] = [main];

  // small crystal splinters around the base
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const side = rng() > 0.5 ? 1 : -1;
    const cx = side * W * (0.65 + rng() * 0.6);
    const cz = -D * 0.9 + rng() * (zf + D * 0.5);
    const h = 2 + rng() * 5.5;
    const r = 0.5 + rng() * 0.9;
    const cp: THREE.Vector3[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + rng() * 0.5;
      const rr = r * (0.7 + rng() * 0.5);
      cp.push(V(Math.cos(a) * rr, 0, Math.sin(a) * rr));
      cp.push(V(Math.cos(a + 0.3) * rr * 0.8, h * 0.7, Math.sin(a + 0.3) * rr * 0.8));
    }
    cp.push(V((rng() - 0.5) * r, h, (rng() - 0.5) * r));
    const g = new ConvexGeometry(cp);
    g.rotateZ((rng() - 0.5) * 0.5);
    g.rotateX((rng() - 0.5) * 0.5);
    g.translate(cx, -0.3, cz);
    parts.push(g);
  }
  for (const p of parts) {
    p.deleteAttribute("normal");
    if (p.getAttribute("uv")) p.deleteAttribute("uv");
  }
  const merged = mergeGeometries(parts, false)!;
  return { geo: withBary(merged, rng), quad: [FBL, FBR, FTR, FTL], H };
}

/** The video plate: the flat front facet, shrunk and pushed slightly proud of the crystal.
 *  It is deliberately NOT a rectangle — the clip is masked by a faceted,
 *  chamfered outline so the placeholder reads as part of the monolith. */
const SCREEN_SHAPES: [number, number][][] = [
  // 0 — chamfered crown, heavy left shoulder
  [[0.03, 0.0], [0.97, 0.0], [0.97, 0.7], [0.64, 1.0], [0.24, 0.9], [0.03, 0.58]],
  // 1 — tilted blade
  [[0.06, 0.12], [0.95, 0.0], [0.99, 0.6], [0.6, 1.0], [0.16, 0.86]],
  // 2 — sheared wedge
  [[0.0, 0.05], [0.91, 0.0], [1.0, 0.52], [0.7, 1.0], [0.1, 0.78]],
];

function buildScreenGeometry(quad: THREE.Vector3[], variant: number) {
  const [bl, br, tr, tl] = quad;
  const n = br.clone().sub(bl).cross(tl.clone().sub(bl)).normalize();
  const shape = SCREEN_SHAPES[variant % SCREEN_SHAPES.length];
  const inset = 0.82;
  // bilinear-ish frame of the front facet
  const ex = br.clone().sub(bl).multiplyScalar(inset);
  const ey = tl.clone().sub(bl).multiplyScalar(inset);
  const origin = bl.clone().lerp(br, 0.5).lerp(tl.clone().lerp(tr, 0.5), 0.5);
  const at = (u: number, v: number) =>
    origin.clone().addScaledVector(ex, u - 0.5).addScaledVector(ey, v - 0.5).addScaledVector(n, 0.16);
  const pts = shape.map(([u, v]) => at(u, v));
  const cu = shape.reduce((a, p) => a + p[0], 0) / shape.length;
  const cv = shape.reduce((a, p) => a + p[1], 0) / shape.length;
  const centre = at(cu, cv);
  const arr: number[] = [centre.x, centre.y, centre.z];
  const uvs: number[] = [cu, cv];
  pts.forEach((p) => {
    arr.push(p.x, p.y, p.z);
  });
  shape.forEach(([u, v]) => uvs.push(u, v));
  const idx: number[] = [];
  for (let k = 0; k < pts.length; k++) idx.push(0, 1 + k, 1 + ((k + 1) % pts.length));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const w = Math.abs(br.x - bl.x) + Math.abs(tr.x - tl.x) + Math.abs(br.z - bl.z) + Math.abs(tr.z - tl.z);
  const h = bl.distanceTo(tl) + br.distanceTo(tr);
  return { geo, aspect: (w * 0.5) / (h * 0.5) };
}

/** Procedural "video slate" used until a real clip is wired in. */
function makePlaceholderTexture(index: number, aspect: number, title?: string) {
  const w = 420;
  const h = Math.round(Math.min(900, Math.max(420, w / Math.max(aspect, 0.4))));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const rng = mulberry32(1000 + index * 13);

  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#22140a");
  bg.addColorStop(0.5, "#4a2d0b");
  bg.addColorStop(1, "#120a03");
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  // faceted low-poly texture
  const cols = 6;
  const rows = Math.round((cols * h) / w);
  const px: [number, number][][] = [];
  for (let j = 0; j <= rows; j++) {
    px[j] = [];
    for (let i = 0; i <= cols; i++) {
      px[j][i] = [
        (i / cols) * w + (rng() - 0.5) * (w / cols) * 0.6,
        (j / rows) * h + (rng() - 0.5) * (h / rows) * 0.6,
      ];
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = px[j][i];
      const b = px[j][i + 1];
      const d = px[j + 1][i];
      const e = px[j + 1][i + 1];
      for (const tri of [
        [a, b, d],
        [b, e, d],
      ]) {
        g.beginPath();
        g.moveTo(tri[0][0], tri[0][1]);
        g.lineTo(tri[1][0], tri[1][1]);
        g.lineTo(tri[2][0], tri[2][1]);
        g.closePath();
        g.fillStyle = `rgba(255,${150 + Math.floor(rng() * 70)},${40 + Math.floor(rng() * 50)},${0.02 + rng() * 0.13})`;
        g.fill();
        g.strokeStyle = "rgba(255,190,80,0.15)";
        g.lineWidth = 1;
        g.stroke();
      }
    }
  }

  const vg = g.createRadialGradient(w / 2, h / 2, h * 0.1, w / 2, h / 2, h * 0.7);
  vg.addColorStop(0, "rgba(255,170,60,0.22)");
  vg.addColorStop(1, "rgba(0,0,0,0.6)");
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);

  // play glyph
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.15;
  g.strokeStyle = "rgba(255,214,130,0.9)";
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = "rgba(255,214,130,0.3)";
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(cx, cy, R * 1.3, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgba(255,226,160,0.95)";
  g.beginPath();
  g.moveTo(cx - R * 0.26, cy - R * 0.4);
  g.lineTo(cx + R * 0.48, cy);
  g.lineTo(cx - R * 0.26, cy + R * 0.4);
  g.closePath();
  g.fill();

  // corner brackets
  g.strokeStyle = "rgba(255,206,110,0.85)";
  g.lineWidth = 2.5;
  const m = Math.round(w * 0.055);
  const L = Math.round(w * 0.1);
  const br = (x: number, y: number, sx: number, sy: number) => {
    g.beginPath();
    g.moveTo(x, y + sy * L);
    g.lineTo(x, y);
    g.lineTo(x + sx * L, y);
    g.stroke();
  };
  br(m, m, 1, 1);
  br(w - m, m, -1, 1);
  br(m, h - m, 1, -1);
  br(w - m, h - m, -1, -1);

  const unit = w / 420;
  // labels
  g.fillStyle = "rgba(255,226,170,0.92)";
  g.font = `300 ${Math.round(19 * unit)}px 'Helvetica Neue', Arial, sans-serif`;
  g.textAlign = "left";
  g.fillText(title ? title.toUpperCase().slice(0, 22) : "VIDEO", m + 6 * unit, m + 46 * unit);
  g.font = `200 ${Math.round(96 * unit)}px 'Helvetica Neue', Arial, sans-serif`;
  g.fillStyle = "rgba(255,214,140,0.9)";
  g.fillText(String(index + 1).padStart(2, "0"), m + 2 * unit, h - m - 44 * unit);
  g.font = `300 ${Math.round(15 * unit)}px 'Helvetica Neue', Arial, sans-serif`;
  g.fillStyle = "rgba(255,226,170,0.65)";
  g.fillText("AWAITING CLIP", m + 6 * unit, h - m - 24 * unit);

  // timeline
  g.fillStyle = "rgba(255,214,140,0.22)";
  g.fillRect(m + 6 * unit, h - m - 10 * unit, w - 2 * m - 12 * unit, 2.5 * unit);
  g.fillStyle = "rgba(255,220,150,1)";
  const prog = 0.2 + rng() * 0.5;
  g.fillRect(m + 6 * unit, h - m - 10 * unit, (w - 2 * m - 12 * unit) * prog, 2.5 * unit);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function crystalAngle(i: number) {
  // 10 crystals spread over the ring, leaving the gate gap open at GATE_DIR
  const step = (Math.PI * 2 - GATE_GAP) / (MONO_COUNT - 1);
  return GATE_DIR + GATE_GAP / 2 + i * step;
}

export function buildMonoliths(U: Uniforms, maxAnisotropy: number) {
  const rng = mulberry32(2024);
  const list: Monolith[] = [];
  for (let i = 0; i < MONO_COUNT; i++) {
    // the pair framing the gate is the tallest — it sells the entrance
    const hero = i === 0 || i === MONO_COUNT - 1;
    const H = hero ? 27 + rng() * 5 : 18 + rng() * 8;
    const W = hero ? 10 + rng() * 2.5 : 8 + rng() * 3.5;
    const { geo, quad, H: height } = buildMonolithGeometry(rng, H, W);
    const angle = crystalAngle(i) + (rng() - 0.5) * 0.05;
    const R = RING_R + (rng() - 0.5) * 3;
    const x = Math.sin(angle) * R;
    const z = Math.cos(angle) * R;
    const gy = groundHeight(x, z) - 0.6;

    const goldMat = new THREE.ShaderMaterial({
      vertexShader: goldVert,
      fragmentShader: goldFrag,
      uniforms: { ...U, uGrow: { value: 0 }, uHeight: { value: height } },
      defines: { MONO: "" },
      side: THREE.DoubleSide,
    });
    const body = new THREE.Mesh(geo, goldMat);
    body.frustumCulled = false;

    const { geo: sgeo, aspect } = buildScreenGeometry(quad, i);
    const slate = makePlaceholderTexture(i, aspect, VIDEO_CLIPS[i]?.title);
    slate.anisotropy = maxAnisotropy;
    let tex: THREE.Texture = slate;
    let video: HTMLVideoElement | null = null;
    const src = VIDEO_SOURCES[i];
    if (src) {
      video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.setAttribute("playsinline", "");
      video.setAttribute("muted", "");
      video.src = src;
      const vt = new THREE.VideoTexture(video);
      vt.colorSpace = THREE.SRGBColorSpace;
      vt.minFilter = THREE.LinearFilter;
      vt.magFilter = THREE.LinearFilter;
      vt.generateMipmaps = false;
      tex = vt;
    }
    const plateAspect = aspect;
    const screenMat = new THREE.ShaderMaterial({
      vertexShader: screenVert,
      fragmentShader: screenFrag,
      uniforms: {
        ...U,
        uMap: { value: tex },
        uPower: { value: 0 },
        uGrow: goldMat.uniforms.uGrow,
        uHeight: { value: height },
        uSeed: { value: i * 0.37 },
        uIsVideo: { value: video ? 1 : 0 },
        uTexAspect: { value: video ? 16 / 9 : plateAspect },
        uPlateAspect: { value: plateAspect },
      },
      side: THREE.DoubleSide,
    });
    if (video) {
      // if the clip never becomes decodable (missing file, wrong codec) the
      // plate quietly returns to the generated slate instead of going black
      const fallback = () => {
        if (!screenMat.uniforms.uIsVideo.value) return;
        screenMat.uniforms.uIsVideo.value = 0;
        screenMat.uniforms.uMap.value = slate;
        screenMat.uniforms.uTexAspect.value = plateAspect;
      };
      video.addEventListener("loadedmetadata", () => {
        screenMat.uniforms.uTexAspect.value = video!.videoWidth / Math.max(1, video!.videoHeight);
      });
      video.addEventListener("error", fallback);
      window.setTimeout(() => {
        if (video!.readyState < 2) fallback();
      }, 6000);
    }
    const screen = new THREE.Mesh(sgeo, screenMat);
    screen.frustumCulled = false;

    const group = new THREE.Group();
    group.add(body, screen);
    group.position.set(x, gy, z);
    group.rotation.y = angle + Math.PI; // plates face the plaza
    list.push({
      group,
      angle,
      height,
      base: new THREE.Vector3(x, gy + 0.6, z),
      goldMat,
      screenMat,
      video,
      videoStarted: false,
      riseAt: 0,
    });
  }
  return list;
}

// ───────────────────────── armillary rings around the core
// Four hairline rings, each parked on its own plane. They never sit on the same
// tilt: as the charge builds they swing onto one shared plane and read as a
// single concentric circle with the core — the blast — in the middle of it.
export function buildArmillary(material: THREE.ShaderMaterial) {
  const rng = mulberry32(5);
  const group = new THREE.Group();
  const rings: THREE.Mesh[] = [];
  const radii = [7.6, 9.4, 11.2, 13.0];
  const tubes = [0.075, 0.062, 0.052, 0.044];
  // spreads of tilt: the two inner rings lean hard, the outer pair barely
  const tilts: [number, number, number][] = [
    [1.15, 0.5, 0.72],
    [-0.95, 1.05, -0.55],
    [0.42, -0.35, 0.28],
    [-0.22, 0.6, -0.16],
  ];
  for (let i = 0; i < radii.length; i++) {
    const geo = new THREE.TorusGeometry(radii[i], tubes[i], 6, 260);
    const mesh = new THREE.Mesh(geo, material);
    const [tx, ty, tz] = tilts[i];
    mesh.quaternion.setFromEuler(new THREE.Euler(tx + (rng() - 0.5) * 0.08, ty, tz));
    mesh.position.y = CORE_Y;
    mesh.frustumCulled = false;
    mesh.userData.base = mesh.quaternion.clone();
    mesh.userData.spinDir = i % 2 === 0 ? 1 : -1;
    mesh.userData.spinRate = 0.55 + i * 0.22;
    rings.push(mesh);
    group.add(mesh);
  }
  // a small "index" bead riding the outer ring, like a bezel marker
  const beadGeo = new THREE.SphereGeometry(0.36, 14, 10);
  const bead = new THREE.Mesh(beadGeo, material);
  bead.position.set(radii[radii.length - 1], 0, 0);
  bead.frustumCulled = false;
  rings[rings.length - 1].add(bead);

  return { group, rings, bead };
}
