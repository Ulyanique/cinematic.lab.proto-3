// ─────────────────────────────────────────────────────────────
//  The compass emblem, rebuilt as real geometry.
//  Coordinates come straight from the brand's vector drawing
//  (200×200 artboard) and are mapped into world units by S.
// ─────────────────────────────────────────────────────────────
import * as THREE from "three";
import { mulberry32 } from "./math";

const S = 1 / 40; // artboard units → emblem units (emblem ≈ 4.15 tall)
const X = (x: number) => (x - 100) * S;
const Y = (y: number) => (100 - y) * S;
const L = (v: number) => v * S;

const DEPTH = L(9.2); // 0.23

export interface CompassEmblem {
  group: THREE.Group;
  material: THREE.ShaderMaterial;
  /** Area-weighted surface samples in emblem-local space (for the particle build-up). */
  sampleSurface: (count: number, seed?: number) => Float32Array;
  dispose: () => void;
}

/** Tapered blade (leg) as an extruded quad with a soft chamfer. */
function bladeGeometry(
  from: [number, number],
  to: [number, number],
  w0: number,
  w1: number,
  depth = DEPTH
) {
  const [hx, hy] = from;
  const [tx, ty] = to;
  const dx = tx - hx;
  const dy = ty - hy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const shape = new THREE.Shape();
  shape.moveTo(hx + nx * w0, hy + ny * w0);
  shape.lineTo(tx + nx * w1, ty + ny * w1);
  shape.lineTo(tx - nx * w1, ty - ny * w1);
  shape.lineTo(hx - nx * w0, hy - ny * w0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: L(0.9),
    bevelThickness: L(0.9),
    bevelSegments: 2,
    steps: 1,
    curveSegments: 6,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

function washerGeometry(outer: number, inner: number, depth: number) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: L(1.5),
    bevelThickness: L(1.2),
    bevelSegments: 3,
    steps: 1,
    curveSegments: 48,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

/** Tube along a quadratic arc in the XY plane. */
function arcTube(a: [number, number], b: [number, number], c: [number, number], radius: number, seg = 36) {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(a[0], a[1], 0),
    new THREE.Vector3(b[0], b[1], 0),
    new THREE.Vector3(c[0], c[1], 0)
  );
  return new THREE.TubeGeometry(curve, seg, radius, 8, false);
}

export function buildCompassEmblem(material: THREE.ShaderMaterial): CompassEmblem {
  const group = new THREE.Group();
  group.name = "compass-emblem";
  const geos: THREE.BufferGeometry[] = [];

  const add = (geo: THREE.BufferGeometry) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    group.add(mesh);
    geos.push(geo);
    return mesh;
  };

  const hinge = new THREE.Vector2(X(100), Y(52));

  // hinge barrel with the signature hole
  const hingeGeo = washerGeometry(L(12), L(4.5), L(11));
  hingeGeo.translate(hinge.x, hinge.y, 0);
  add(hingeGeo);

  // hinge collar (catches the key light)
  const collar = new THREE.TorusGeometry(L(12.2), L(1.1), 6, 80);
  collar.translate(hinge.x, hinge.y, L(5.4));
  add(collar);

  // pivot pin
  const pin = new THREE.CylinderGeometry(L(3.4), L(3.4), L(14.5), 18);
  pin.rotateX(Math.PI / 2);
  pin.translate(hinge.x, hinge.y, 0);
  add(pin);

  // handle ring + stem
  const handle = new THREE.TorusGeometry(L(6.4), L(2.1), 8, 64);
  handle.translate(X(100), Y(12), 0);
  add(handle);

  const stem = new THREE.BoxGeometry(L(6.4), L(13.5), L(8.4));
  stem.translate(X(100), Y(34.5), 0);
  add(stem);

  // neck: joins the handle ring to the stem (the vector art leaves it open,
  // in 3D that reads as a broken part, so it gets a turned collar)
  const neck = new THREE.CylinderGeometry(L(2.9), L(4.2), L(8.6), 20);
  neck.translate(X(100), Y(24.3), 0);
  add(neck);

  // legs: left = needle, right = pencil
  add(bladeGeometry([hinge.x, hinge.y], [X(56), Y(170)], L(4.6), L(2.8)));
  add(bladeGeometry([hinge.x, hinge.y], [X(144), Y(170)], L(4.6), L(4.0)));

  // pencil collar + tip
  add(bladeGeometry([X(128.3), Y(128)], [X(138.8), Y(156)], L(3.1), L(2.9), L(13)));
  const tip = new THREE.ConeGeometry(L(2.4), L(7), 6);
  tip.rotateX(Math.PI); // apex points -Y
  tip.rotateZ(0.358); // …then align with the pencil leg
  tip.translate(1.0694, -1.668, 0);
  add(tip);

  // adjustment arc between the legs
  add(arcTube([X(79.6), Y(112)], [X(100), Y(134)], [X(120.4), Y(112)], L(1.5)));

  // the circle the compass draws — two concentric arcs, centred on the hinge
  const traced = new THREE.TorusGeometry(L(125.9), L(2.1), 6, 160, (72 * Math.PI) / 180);
  traced.rotateZ(-Math.PI / 2 - (36 * Math.PI) / 180);
  traced.translate(hinge.x, hinge.y, 0);
  add(traced);

  const tracedThin = new THREE.TorusGeometry(L(136.9), L(0.9), 5, 160, (82 * Math.PI) / 180);
  tracedThin.rotateZ(-Math.PI / 2 - (41 * Math.PI) / 180);
  tracedThin.translate(hinge.x, hinge.y, 0);
  add(tracedThin);

  // centre the silhouette on the origin (artboard centre sits at y ≈ +0.12)
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  for (const g of geos) g.translate(-center.x, -center.y, -center.z);
  group.updateMatrixWorld(true);

  const tris: number[] = [];
  const cum: number[] = [];
  let totalArea = 0;
  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry as THREE.BufferGeometry;
    const pos = g.getAttribute("position");
    if (!pos) return;
    const idx = g.getIndex();
    const count = idx ? idx.count : pos.count;
    const m = mesh.matrixWorld;
    for (let i = 0; i + 2 < count; i += 3) {
      const i0 = idx ? idx.getX(i) : i;
      const i1 = idx ? idx.getX(i + 1) : i + 1;
      const i2 = idx ? idx.getX(i + 2) : i + 2;
      v0.fromBufferAttribute(pos, i0).applyMatrix4(m);
      v1.fromBufferAttribute(pos, i1).applyMatrix4(m);
      v2.fromBufferAttribute(pos, i2).applyMatrix4(m);
      totalArea += v1.clone().sub(v0).cross(v2.clone().sub(v0)).length() * 0.5;
      tris.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
      cum.push(totalArea);
    }
  });
  const triCount = cum.length;

  const sampleSurface = (count: number, seed = 11) => {
    const rng = mulberry32(seed);
    const out = new Float32Array(count * 3);
    for (let n = 0; n < count; n++) {
      const r = rng() * totalArea;
      let lo = 0;
      let hi = triCount - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] < r) lo = mid + 1;
        else hi = mid;
      }
      const t = lo * 9;
      let a = rng();
      let b = rng();
      if (a + b > 1) {
        a = 1 - a;
        b = 1 - b;
      }
      const c = 1 - a - b;
      out[n * 3] = tris[t] * c + tris[t + 3] * a + tris[t + 6] * b;
      out[n * 3 + 1] = tris[t + 1] * c + tris[t + 4] * a + tris[t + 7] * b;
      out[n * 3 + 2] = tris[t + 2] * c + tris[t + 5] * a + tris[t + 8] * b;
    }
    return out;
  };

  return {
    group,
    material,
    sampleSurface,
    dispose: () => {
      for (const g of geos) g.dispose();
      material.dispose();
    },
  };
}
