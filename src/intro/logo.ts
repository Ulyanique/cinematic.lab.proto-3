// Compass (циркуль) logo: vector parts shared by the SVG overlay and the particle sampler

export interface LogoPart {
  d: string;
  kind: "fill" | "stroke";
  width?: number;
  evenodd?: boolean;
  opacity?: number;
}

const f = (n: number) => n.toFixed(2);

function leg(hx: number, hy: number, tx: number, ty: number, w0: number, w1: number) {
  const dx = tx - hx;
  const dy = ty - hy;
  const L = Math.hypot(dx, dy);
  const nx = -dy / L;
  const ny = dx / L;
  return (
    `M${f(hx + nx * w0)},${f(hy + ny * w0)} L${f(tx + nx * w1)},${f(ty + ny * w1)} ` +
    `L${f(tx - nx * w1)},${f(ty - ny * w1)} L${f(hx - nx * w0)},${f(hy - ny * w0)} Z`
  );
}

const HX = 100;
const HY = 52;
const LEG_R = Math.hypot(44, 118);

function arc(rad: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  const x1 = HX - rad * Math.sin(a);
  const x2 = HX + rad * Math.sin(a);
  const y = HY + rad * Math.cos(a);
  return `M${f(x1)},${f(y)} A${f(rad)},${f(rad)} 0 0 0 ${f(x2)},${f(y)}`;
}

export const LOGO_PARTS: LogoPart[] = [
  // top ring (handle)
  {
    d: "M100,12 a8.5,8.5 0 1,0 0.01,0 Z M100,16.2 a4.3,4.3 0 1,1 -0.01,0 Z",
    kind: "fill",
    evenodd: true,
  },
  // stem
  { d: "M96.8,28 h6.4 v12 h-6.4 Z", kind: "fill" },
  // legs: left = needle, right = pencil
  { d: leg(HX, HY, 56, 170, 7.6, 0.6), kind: "fill" },
  { d: leg(HX, HY, 144, 170, 7.6, 2.6), kind: "fill" },
  // pencil collar
  { d: leg(128.3, 128, 138.8, 156, 4.8, 4.6), kind: "fill" },
  // hinge with hole
  {
    d: "M88,52 a12,12 0 1,0 24,0 a12,12 0 1,0 -24,0 Z M95.5,52 a4.5,4.5 0 1,1 9,0 a4.5,4.5 0 1,1 -9,0 Z",
    kind: "fill",
    evenodd: true,
  },
  // adjustment arc between legs
  { d: "M79.6,112 Q100,134 120.4,112", kind: "stroke", width: 2.8 },
  // traced circle
  { d: arc(LEG_R, 36), kind: "stroke", width: 3.2 },
  { d: arc(LEG_R + 11, 41), kind: "stroke", width: 1.1, opacity: 0.7 },
];

/** Rasterise the logo and return `count` random points (x,y in -0.5..0.5, z jitter) */
export function sampleLogo(count: number): Float32Array {
  const S = 420;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.scale(S / 200, S / 200);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  ctx.lineCap = "round";
  for (const p of LOGO_PARTS) {
    const path = new Path2D(p.d);
    if (p.kind === "fill") ctx.fill(path, p.evenodd ? "evenodd" : "nonzero");
    else {
      ctx.lineWidth = p.width ?? 2;
      ctx.stroke(path);
    }
  }
  const data = ctx.getImageData(0, 0, S, S).data;
  const pts: number[] = [];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (data[(y * S + x) * 4 + 3] > 128) pts.push(x, y);
    }
  }
  const out = new Float32Array(count * 3);
  const n = pts.length / 2;
  for (let i = 0; i < count; i++) {
    const k = Math.floor(Math.random() * n);
    out[i * 3] = (pts[k * 2] + Math.random()) / S - 0.5;
    out[i * 3 + 1] = -((pts[k * 2 + 1] + Math.random()) / S - 0.5);
    out[i * 3 + 2] = (Math.random() - 0.5) * 0.08;
  }
  return out;
}
