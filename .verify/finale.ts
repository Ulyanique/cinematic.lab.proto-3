// Where is the camera and where is the emblem between the blast and the logo?
import { IntroScene } from "../src/intro/IntroScene";
import { TL } from "../src/intro/config";
import { QUALITY } from "../src/intro/config";

const host: any = {
  clientWidth: 1600,
  clientHeight: 900,
  appendChild() {},
  removeChild() {},
  style: {},
  addEventListener() {},
  removeEventListener() {},
};
(globalThis as any).ResizeObserver = class {
  constructor(_cb: any) {}
  observe() {}
  disconnect() {}
};
(globalThis as any).requestAnimationFrame = () => 1;
(globalThis as any).cancelAnimationFrame = () => {};

const s = new IntroScene(host, { quality: QUALITY.high });
const a = s as any;
const V = a.scene.position.constructor as new (x?: number, y?: number, z?: number) => any;
const fwd = new V();
const toE = new V();
const p = new V();

for (const t of [26.0, 26.4, 27.5, 28.2, 29.0, 29.7, 30.4, 31.5]) {
  for (let k = 0; k < 2; k++) a.update(t, 1 / 60);
  const cam = a.camera;
  cam.getWorldDirection(fwd);
  const e = a.emblem.group.position.clone();
  e.y += 1.2;
  toE.copy(e).sub(cam.position);
  const dist = toE.length();
  const ang = (Math.acos(Math.max(-1, Math.min(1, toE.normalize().dot(fwd)))) * 180) / Math.PI;
  p.copy(e).project(cam);
  const onScreen = Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1;
  const fov = cam.fov.toFixed(0);
  const em = a.emblem;
  const eu = a.emblemMat.uniforms;
  console.log(
    `   emblem scale=${em.group.scale.x.toFixed(2)} worldpos=(${em.group.position.x.toFixed(1)},${em.group.position.y.toFixed(1)},${em.group.position.z.toFixed(1)}) ` +
      `uGlow=${eu.uGlow.value.toFixed(2)} uSweep=${eu.uSweep.value.toFixed(2)} molten=${(1 - eu.uForm.value).toFixed(2)} ` +
      `halo=${(a.emblemHalo.material.opacity as number).toFixed(3)} haloVis=${a.emblemHalo.visible}`
  );
  console.log(
    `t=${t.toFixed(1)} cam=(${cam.position.x.toFixed(1)},${cam.position.y.toFixed(1)},${cam.position.z.toFixed(1)}) ` +
      `эмблема dist=${dist.toFixed(1)} угл=${ang.toFixed(1)}° ndc=(${p.x.toFixed(2)},${p.y.toFixed(2)}) ` +
      `в кадре=${onScreen ? "да" : "НЕТ"} fov=${fov} visible=${a.emblem.group.visible} uForm=${a.emblemMat.uniforms.uForm.value.toFixed(2)}`
  );
}
s.dispose();
