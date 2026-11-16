// Frame-to-frame delta of every light value: a flicker is a big jump here.
import { IntroScene } from "../src/intro/IntroScene";
import { QUALITY, TL } from "../src/intro/config";
const host: any = { clientWidth: 1600, clientHeight: 900, appendChild() {}, removeChild() {}, style: {}, addEventListener() {}, removeEventListener() {} };
(globalThis as any).ResizeObserver = class { constructor(_c: any) {} observe() {} disconnect() {} };
(globalThis as any).requestAnimationFrame = () => 1;
(globalThis as any).cancelAnimationFrame = () => {};
const s: any = new IntroScene(host, { quality: QUALITY.high });
let prev: number[] | null = null;
let worst = { t: 0, d: 0, what: "" };
for (let t = 27.4; t <= 28.8; t += 1 / 60) {
  s.update(t, 1 / 60);
  const v = [
    s.U.uCore.value.w, s.beamMat.uniforms.uAmt.value,
    s.halos[0].material.color.r, s.halos[1].material.color.r,
    s.shellMats[0].uniforms.uAmt.value, s.post.final.uniforms.uFlash.value,
    s.post.bloom.strength, s.orb.visible ? s.orb.scale.x : 0,
  ];
  if (prev) {
    v.forEach((x, i) => {
      const rel = Math.abs(x - prev![i]) / Math.max(0.25, Math.abs(prev![i]));
      if (rel > worst.d) worst = { t, d: rel, what: ["core", "beam", "halo0", "halo1", "shell", "flash", "bloom", "orb"][i] };
    });
  }
  prev = v;
}
console.log(`максимальный скачок: ${(worst.d * 100).toFixed(0)}% по "${worst.what}" на t=${worst.t.toFixed(2)}`);
s.dispose();
