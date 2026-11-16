// Small math helpers: seeded RNG, value noise, monotone C1 keyframe tracks

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInOut = (t: number) => {
  const x = clamp(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

function hash2(x: number, y: number) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return lerp(
    lerp(hash2(xi, yi), hash2(xi + 1, yi), u),
    lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u),
    v
  );
}
export function fbm(x: number, y: number) {
  let a = 0.5;
  let f = 1;
  let s = 0;
  for (let i = 0; i < 4; i++) {
    s += a * vnoise(x * f, y * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}

/** Height of the golden landscape. Calm plaza in the middle, hills further out, a valley along the entry corridor. */
export function groundHeight(x: number, z: number) {
  const r = Math.hypot(x, z);
  const hills = smoothstep(42, 118, r);
  let corridor = 1;
  if (z > 0) corridor = lerp(0.35, 1, smoothstep(8, 48, Math.abs(x)));
  const n = fbm(x * 0.019 + 10, z * 0.019 - 4);
  const ripple = (vnoise(x * 0.09, z * 0.09) - 0.5) * 1.2;
  return (n - 0.45) * (1.4 + hills * 32 * corridor) + ripple * (1 - hills * 0.3);
}

export function smax(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

/** Monotone cubic Hermite through (t, v) keys — smooth velocity, no overshoot. */
export function makeTrack(keys: [number, number][]) {
  const n = keys.length;
  const ts = keys.map((k) => k[0]);
  const vs = keys.map((k) => k[1]);
  const m = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const d0 = (vs[i] - vs[i - 1]) / (ts[i] - ts[i - 1]);
    const d1 = (vs[i + 1] - vs[i]) / (ts[i + 1] - ts[i]);
    m[i] = d0 * d1 <= 0 ? 0 : (2 * d0 * d1) / (d0 + d1);
  }
  return (t: number) => {
    if (t <= ts[0]) return vs[0];
    if (t >= ts[n - 1]) return vs[n - 1];
    let i = 0;
    while (i < n - 2 && t > ts[i + 1]) i++;
    const h = ts[i + 1] - ts[i];
    const s = (t - ts[i]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * vs[i] +
      (s3 - 2 * s2 + s) * h * m[i] +
      (-2 * s3 + 3 * s2) * vs[i + 1] +
      (s3 - s2) * h * m[i + 1]
    );
  };
}
