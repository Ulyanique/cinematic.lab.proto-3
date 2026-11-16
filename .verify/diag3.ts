import * as THREE from "three";
import { buildMonoliths } from "../src/intro/world";
import { CameraRig } from "../src/intro/camera";
import { CORE_Y } from "../src/intro/config";
const U: any = { uTime:{value:0}, uCore:{value:new THREE.Vector4(0,CORE_Y,0,1)}, uCorePos:{value:new THREE.Vector3()}, uMono:{value:Array.from({length:10},()=>new THREE.Vector4())}, uExposure:{value:1}, uFogColor:{value:new THREE.Color()}, uFogDensity:{value:0.006}, uCharge:{value:0}, uWaveC:{value:new THREE.Vector2()}, uWaveR:{value:0}, uWaveW:{value:40}, uShockR:{value:0}, uShockW:{value:1}, uShockAmp:{value:0}, uResY:{value:1080}, uBT:{value:-1} };
const monos = buildMonoliths(U, 4);
const rig = new CameraRig(monos.map(m=>({x:m.base.x,z:m.base.z,r:6})));
for (const t of [12, 14, 16, 18, 20, 22]) {
  const pose = rig.sample(t);
  const ds = monos.map((m) => Math.hypot(m.base.x - pose.pos.x, m.base.z - pose.pos.z));
  const i = ds.indexOf(Math.min(...ds));
  console.log(`t=${t} cam=(${pose.pos.x.toFixed(1)},${pose.pos.y.toFixed(1)},${pose.pos.z.toFixed(1)}) r=${Math.hypot(pose.pos.x,pose.pos.z).toFixed(1)} closest=#${i} d=${ds[i].toFixed(1)}`);
}
// exact min distance from camera to any monolith triangle
const cam = new THREE.Vector3();
const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
const tri = new THREE.Triangle(); const cp = new THREE.Vector3();
for (const t of Array.from({length: 361}, (_, k) => k * 0.1)) {
  const pose = rig.sample(t);
  cam.copy(pose.pos);
  let best = Infinity; let bestI = -1;
  monos.forEach((m, i) => {
    const g = (m.group.children[0] as THREE.Mesh).geometry as THREE.BufferGeometry;
    g.computeBoundingBox();
    const pos = g.getAttribute("position");
    for (let k = 0; k + 2 < pos.count; k += 3) {
      a.fromBufferAttribute(pos, k).applyMatrix4(m.group.matrixWorld);
      b.fromBufferAttribute(pos, k + 1).applyMatrix4(m.group.matrixWorld);
      c.fromBufferAttribute(pos, k + 2).applyMatrix4(m.group.matrixWorld);
      tri.set(a, b, c); tri.closestPointToPoint(cam, cp);
      const d = cp.distanceTo(cam);
      if (d < best) { best = d; bestI = i; }
    }
  });
  if (best < 4) console.log(`!! t=${t.toFixed(1)} surface ${best.toFixed(2)} crystal #${bestI}`);
  (globalThis as any).__min = Math.min((globalThis as any).__min ?? 99, best);
}

console.log("min surface distance over 0..36 s =", (globalThis as any).__min?.toFixed(2));
