// Brightness audit: walk 25..31 s and print every light-driving value, so a
// black frame can be traced to the envelope that collapsed.
import { IntroScene } from "../src/intro/IntroScene";
import { QUALITY, TL } from "../src/intro/config";
const host: any = { clientWidth: 1600, clientHeight: 900, appendChild() {}, removeChild() {}, style: {}, addEventListener() {}, removeEventListener() {} };
(globalThis as any).ResizeObserver = class { constructor(_c: any) {} observe() {} disconnect() {} };
(globalThis as any).requestAnimationFrame = () => 1;
(globalThis as any).cancelAnimationFrame = () => {};
const s: any = new IntroScene(host, { quality: QUALITY.high });
for (let t = 25; t <= 31.001; t += 0.25) {
  s.update(t, 1 / 60);
  const P = s.post;
  const shells = s.shellMats.map((m: any) => m.uniforms.uAmt.value).reduce((a: number, b: number) => a + b, 0);
  const halos = s.halos.map((h: any) => h.material.color.r * (h.visible ? 1 : 0)).reduce((a: number, b: number) => a + b, 0);
  const em = s.emblemMat.uniforms;
  console.log(
    `t=${t.toFixed(2)} core=${s.U.uCore.value.w.toFixed(2)} beam=${s.beamMat.uniforms.uAmt.value.toFixed(2)}` +
    ` halos=${halos.toFixed(2)} shells=${shells.toFixed(2)} emGlow=${em.uGlow.value.toFixed(2)} emVis=${s.emblem.group.visible ? 1 : 0}` +
    ` bloom=${P.bloom.strength.toFixed(2)} flash=${P.final.uniforms.uFlash.value.toFixed(2)} fade=${P.final.uniforms.uFade.value.toFixed(2)}`
  );
}
s.dispose();
