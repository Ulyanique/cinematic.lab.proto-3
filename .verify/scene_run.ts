// Boots the full IntroScene against the mock renderer and walks the timeline.
import { IntroScene } from "../src/intro/IntroScene";
import { TL } from "../src/intro/config";
import { QUALITY } from "../src/intro/config";

const canvasHost: any = {
  clientWidth: 1600,
  clientHeight: 900,
  appendChild() {},
  removeChild() {},
  style: {},
  addEventListener() {},
  removeEventListener() {},
};

// ResizeObserver / rAF hooks
let rafCb: any = null;
(globalThis as any).ResizeObserver = class {
  constructor(_cb: any) {}
  observe() {}
  disconnect() {}
};
(globalThis as any).requestAnimationFrame = (cb: any) => {
  rafCb = cb;
  return 1;
};
(globalThis as any).cancelAnimationFrame = () => {};

const frames: number[] = [];
let ended = false;
const scene = new IntroScene(canvasHost, {
  quality: QUALITY.high,
  onFrame: (t) => frames.push(t),
  onEnd: () => {
    ended = true;
  },
});

console.log("constructed ok");

// Drive frames manually: t is advanced by the internal loop, so fake the clock.
const sceneAny = scene as any;
let now = 1000;
sceneAny.last = now;
const step = 1 / 60;
for (let i = 0; i < Math.ceil((TL.END + 1.5) / step); i++) {
  now += step * 1000;
  if (!rafCb) break;
  const cb = rafCb;
  rafCb = null;
  cb(now);
}

console.log("frames rendered:", frames.length, "last t:", frames[frames.length - 1]?.toFixed(2), "ended:", ended);

// Sanity checks on the state after the run
const cam = sceneAny.camera;
console.log("camera at end:", cam.position.toArray().map((n: number) => n.toFixed(2)), "fov", cam.fov.toFixed(1));
console.log("emblem visible:", sceneAny.emblem.group.visible, "uForm", sceneAny.emblemMat.uniforms.uForm.value.toFixed(2));
console.log("logo particles visible:", sceneAny.logoPts.visible, "amt", sceneAny.logoMat.uniforms.uAmt.value.toFixed(2));
console.log("wordmark t:", sceneAny.t.toFixed(2));

// timeline spot checks
for (const t of [0.5, 5, 12, 20, 26, 27.9, 28.01, 29, 31, 34]) {
  sceneAny.t = t;
  sceneAny.update(t, 1 / 60);
  const p = cam.position;
  const bad =
    !Number.isFinite(p.x + p.y + p.z) ||
    !Number.isFinite(cam.fov) ||
    !Number.isFinite(sceneAny.U.uTime.value) ||
    !Number.isFinite((sceneAny.U.uMono.value as any[])[0].w);
  console.log(
    `t=${t.toString().padStart(5)} cam=(${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}) fov=${cam.fov.toFixed(0)} ` +
      `bloom=${sceneAny.post.bloom.strength.toFixed(2)} shafts=${(sceneAny.post.shafts.uniforms.uAmt.value as number).toFixed(2)} ` +
      `exposure=${sceneAny.U.uExposure.value.toFixed(2)} ${bad ? "*** NaN ***" : ""}`
  );
}

// verify every monolith has finite uniforms and the videos contract
for (const m of sceneAny.monos) {
  if (!m.goldMat?.uniforms?.uGrow || !m.screenMat?.uniforms?.uPower) {
    console.log("missing uniform", Object.keys(m.screenMat?.uniforms ?? {}));
    continue;
  }
  const g = [m.goldMat.uniforms.uGrow.value, m.screenMat.uniforms.uPower.value];
  if (g.some((n: number) => !Number.isFinite(n))) console.log("bad monolith uniform", g);
}
console.log("mono uniforms ok");
console.log("rise schedule:", sceneAny.riseStart.map((n: number) => n.toFixed(1)).join(" "));

scene.dispose();
console.log("disposed ok");
