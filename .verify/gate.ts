// How close does the camera pass to the crystals framing the gate?
import { IntroScene } from "../src/intro/IntroScene";
import { QUALITY, TL, RING_R } from "../src/intro/config";

const host: any = {
  clientWidth: 1600, clientHeight: 900, appendChild() {}, removeChild() {},
  style: {}, addEventListener() {}, removeEventListener() {},
};
(globalThis as any).ResizeObserver = class { constructor(_c: any) {} observe() {} disconnect() {} };
(globalThis as any).requestAnimationFrame = () => 1;
(globalThis as any).cancelAnimationFrame = () => {};

const s = new IntroScene(host, { quality: QUALITY.high });
const a = s as any;

console.log("RING_R =", RING_R, " монолиты:");
a.monos.forEach((m: any, i: number) => {
  const p = m.group.position;
  console.log(
    `  ${i + 1}: pos=(${p.x.toFixed(1)}, ${p.z.toFixed(1)}) r=${Math.hypot(p.x, p.z).toFixed(1)} base=(${m.base.x.toFixed(1)}, ${m.base.z.toFixed(1)})`
  );
});

let worst = { t: 0, i: -1, d: 1e9 };
for (let t = 8.0; t <= 13.0; t += 0.05) {
  a.update(t, 1 / 60);
  const c = a.camera.position;
  a.monos.forEach((m: any, i: number) => {
    const p = m.group.position;
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d < worst.d) worst = { t, i, d };
  });
}
console.log(`\nближайшее сближение: ${worst.d.toFixed(2)} до кристалла #${worst.i + 1} на t=${worst.t.toFixed(2)}`);

for (const t of [9.6, 10.2, 10.7, 11.2]) {
  a.update(t, 1 / 60);
  const c = a.camera.position;
  const near = a.monos
    .map((m: any, i: number) => ({ i, d: Math.hypot(c.x - m.group.position.x, c.z - m.group.position.z) }))
    .sort((x: any, y: any) => x.d - y.d)
    .slice(0, 3)
    .map((o: any) => `#${o.i + 1}=${o.d.toFixed(1)}`)
    .join("  ");
  console.log(`t=${t.toFixed(1)} cam=(${c.x.toFixed(1)}, ${c.z.toFixed(1)})  ближайшие: ${near}`);
}
s.dispose();
