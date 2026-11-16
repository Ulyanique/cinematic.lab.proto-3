# CIRCINUS — Golden Monolith Intro

A single, continuous camera move: a flight through a desert of standing stones, into a plaza
ringed by ten crystal monoliths (the video placeholders), a high-speed orbit around them, and a
detonation at the centre of the plaza that resolves into a **compass emblem** — the logo.

Built with React 19 + Vite 7 + three.js 0.187. Everything you see (sky, terrain, monoliths,
screens, emblem, particles, post-processing) is generated procedurally at runtime: no model, no
texture and no image assets are loaded.

---

## Run

```bash
npm install
node tools/fetch-videos.mjs   # pulls the ten clips from Drive into public/videos/
npm run dev                   # http://localhost:5173
npm run build                 # tsc --noEmit && vite build → dist/index.html (single file)
npm run preview
```

The picture is authored for **1920×1080 (16:9)** and always renders at exactly that
aspect — the canvas covers the window, so there are **no letterbox bars**; on an
off-ratio window the overflow edge is cropped instead of padded. On the `high`
tier the framebuffer is literally 1920×1080 (`mid` 1600×900, `low` 1280×720, and
the adaptive resolution steps down only under load).

`vite-plugin-singlefile` inlines the JS and CSS into one `dist/index.html`, so the whole intro is a
single file you can drop on a CDN, put in an iframe, or open from disk.

## Timeline scrubber

The bar at the bottom is a real seek bar: click or drag it to jump anywhere in the
piece (it pauses while you drag and resumes if it was playing). Chapter ticks mark
the rise, the gate, the orbit, the charge, the blast and the logo. Keyboard:
`space` play/pause · `←`/`→` ±1.5 s (`shift` ±5 s) · `Home`/`End` · `m` sound ·
`r` replay.

## URL parameters

| Parameter | Effect |
| --- | --- |
| `?q=low\|med\|high` | force the quality tier (default: detected from the device) |
| `?t=23.4` | start the timeline at that second |
| `?freeze` | hold the frame on `?t=` (great for stills) |

`restart` (⟲) replays the intro, `⛶` toggles fullscreen, `♪` toggles sound (off by default —
browsers block autoplay audio, and the piece is mixed as a silent film with an optional score).

## The timeline (34.5 s)

| Time | Beat |
| --- | --- |
| 0 – 7.6 | corridor: skimming the dunes, stone pillars rushing past |
| 7.6 – 12.7 | the ten monoliths rise out of the ground in a wave, screens igniting |
| 10.7 | the gate: passing between the two tallest monoliths |
| 12.4 – 22.6 | orbit inside the ring, aim led tangentially so the crystals stream past |
| 23.4 – 27.0 | darkening, the plaza inhales, energy converges on the core |
| 27.0 – 28.0 | implosion — the frame collapses to a point |
| 28.0 | detonation at the exact centre, shockwave + light burst |
| 28.7 – 30.7 | emblem assembles out of particles |
| 30.6 / 31.9 | wordmark, then tagline (DOM, over the 3D plate) |
| 34.5 | end, `onEnd()` fires |

All beat timings live in `TL` in `src/intro/config.ts`; the camera lives in `src/intro/camera.ts`
as a set of monotone interpolation tracks (radius, yaw, height, focal length, aim lead, shake), so
velocity and acceleration stay continuous — the camera never cuts.

## Wiring your own video

The ten monoliths are placeholders: each carries a mask texture generated on a canvas, and a
faceted (non-rectangular) plate that samples it. Point `VIDEO_SOURCES` in
`src/intro/config.ts` at your clips:

```ts
export const VIDEO_SOURCES: (string | null)[] = [
  "/videos/reel-01.mp4",
  "/videos/reel-02.mp4",
  // …
];
```

Any entry that is `null` keeps the generated slate. Clips play muted, looped and
`playsInline`; remote URLs need CORS headers (`crossOrigin="anonymous"` is already set) because
the texture is sampled through a shader.

The plate is masked by a chamfered polygon, so the footage reads as part of the crystal instead of
a billboard. Aspect ratios are read per-plate, so 9:16, 1:1 and 16:9 all work — the plate outline
is part of the monolith's front facet.

## Layout

```
src/
  App.tsx              letterbox, HUD, controls, graceful fallbacks
  intro/
    config.ts          brand, video sources, world constants, timeline, quality tiers
    math.ts            seeded rng, easing, value noise, ground height, track interpolation
    camera.ts          the camera rig (one continuous move, obstacle-aware)
    world.ts           terrain, pillars, the ten monoliths + plates, armillary rings
    logo3d.ts          the compass emblem (extruded bevelled geometry)
    shaders.ts         every GLSL chunk: gold, screens, terrain, particles, emblem, sky, post
    post.ts            bloom + radial shafts + grade + vignette
    audio.ts           procedural score (off by default)
    IntroScene.ts      the scene graph, lifecycle, per-frame choreography, dispose()
.verify/               headless harnesses used to validate the piece without a browser
tools/glslcheck.js     GLSL sanity checker (needs `npm i -D @shaderfrog/glsl-parser`)
```

## Notes

- **Quality**: `pickQuality()` reads the GPU string and device memory. `low` drops the bloom
  mip chain, halves the render scale and turns off the particles. Bloom uses a half-float target,
  which needs WebGL2 — the `low` tier falls back to an LDR target.
- **Lifecycle**: `new IntroScene(el, { quality, onFrame, onEnd })` returns an object with
  `restart()`, `seek(t)`, `setSound(on)` and `dispose()`. `dispose()` frees every geometry,
  material, render target and canvas texture.
- **Resize**: rendering is DPR-aware, capped at 2.
- **Headless verification**: `.verify/` contains the harnesses used to check the piece without a
  browser — a full lifecycle run against a mock renderer, a software rasteriser of the real
  geometry through the real camera rig, and trajectory/clearance audits. See the comment at the top
  of each file.
