import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import {
  beamFrag,
  blastFrag,
  blastVert,
  emberVert,
  finalFrag,
  finalVert,
  inflowVert,
  logoPtsFrag,
  logoPtsVert,
  orbFrag,
  orbVert,
  pointFrag,
  ringFrag,
  ringVert,
  shardFrag,
  shardVert,
  shellFrag,
  skyFrag,
  skyVert,
} from "./shaders";
import { clamp, easeOutCubic, groundHeight, makeTrack, smax, smoothstep } from "./math";
import { CORE_Y, MONO_COUNT, TL } from "./config";
import { buildMonoliths, buildPillars, buildTerrain, type Monolith, type Uniforms } from "./world";
import { sampleLogo } from "./logo";

const beamVert = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
void main(){
  vUv = uv;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const LOGO_D = 16;
const LOGO_SIDE = 0.42; // fraction of screen height
const LOGO_CENTER_Y = 0.44; // from top (0..1)

function radialSprite(inner: string, outer: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.25, "rgba(255,200,110,0.55)");
  grad.addColorStop(0.6, "rgba(255,130,30,0.12)");
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export class IntroScene {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1500);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private finalPass: ShaderPass;
  private raf = 0;
  private last = 0;
  private pixelRatio = 1;
  private slowFrames = 0;
  private freeze = false;
  private onFrame: (t: number) => void;
  private ro: ResizeObserver;

  t = 0;
  playing = true;

  private U: Uniforms;
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private monos: Monolith[];
  private riseStart: number[] = [];
  private orb: THREE.Mesh;
  private orbMat: THREE.ShaderMaterial;
  private haloIn: THREE.Sprite;
  private haloOut: THREE.Sprite;
  private beam: THREE.Mesh;
  private beamMat: THREE.ShaderMaterial;
  private shell: THREE.Mesh;
  private shellMat: THREE.ShaderMaterial;
  private ring: THREE.Mesh;
  private ringMat: THREE.ShaderMaterial;
  private embers: THREE.Points;
  private emberMat: THREE.ShaderMaterial;
  private inflowMat: THREE.ShaderMaterial;
  private inflowCharge = { value: 0 };
  private logoPts: THREE.Points;
  private logoMat: THREE.ShaderMaterial;

  private trk = {
    R: makeTrack([
      [0, 172], [2.5, 164], [7, 92], [11, 36], [13, 28], [16, 23], [22, 21], [25, 21.5], [28, 19],
      [30, 15.5], [31.6, 12.5], [32, 12], [33, 13.5], [34.5, 20], [37, 27], [41, 30], [60, 33],
    ]),
    phi: makeTrack([
      [0, 0], [11, 0], [13, 0.3], [19, 3.1], [25, 6.0], [28, 6.9], [32, 7.35], [60, 7.55],
    ]),
    y: makeTrack([
      [0, 9], [2.5, 7], [7, 4.2], [11, 5.0], [13, 6.5], [17, 8], [21, 5.5], [24, 9.5], [27, 13],
      [30, 11.5], [32, 11], [34, 9], [38, 9.5], [60, 10],
    ]),
    tR: makeTrack([
      [0, 0], [10.5, 0], [12.5, 8], [15, 30], [18, 32], [23, 32], [25.5, 28], [28, 17], [30, 6],
      [31.4, 0], [60, 0],
    ]),
    lead: makeTrack([
      [0, 0], [11, 0.2], [14, 0.55], [23, 0.6], [26, 0.5], [28, 0.3], [30, 0.1], [60, 0],
    ]),
    ty: makeTrack([
      [0, 11], [10.5, 11], [13, 9], [17, 10], [22, 11], [26, 12], [30, 11], [60, 11],
    ]),
    roll: makeTrack([
      [0, 0], [4, 0.03], [9, -0.02], [13, -0.08], [18, -0.12], [24, -0.05], [28, 0.06],
      [31.5, 0.14], [32.6, 0], [36, 0], [60, 0],
    ]),
    fov: makeTrack([
      [0, 40], [8, 46], [11, 52], [18, 58], [26, 62], [30, 56], [31.8, 44], [32.05, 72],
      [32.6, 54], [36, 46], [60, 42],
    ]),
  };

  constructor(container: HTMLElement, onFrame: (t: number) => void) {
    this.container = container;
    this.onFrame = onFrame;

    const params = new URLSearchParams(window.location.search);
    if (params.has("t")) this.t = parseFloat(params.get("t") || "0") || 0;
    this.freeze = params.has("freeze");

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
      alpha: false,
      stencil: false,
    });
    this.renderer = renderer;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setClearColor(0x000000, 1);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    container.appendChild(renderer.domElement);

    const U: Uniforms = {
      uTime: { value: 0 },
      uCore: { value: new THREE.Vector4(0, CORE_Y, 0, 0.5) },
      uCorePos: { value: new THREE.Vector3(0, CORE_Y, 0) },
      uMono: { value: Array.from({ length: MONO_COUNT }, () => new THREE.Vector4(0, -50, 0, 0)) },
      uExposure: { value: 1 },
      uFogColor: { value: new THREE.Color(0.17, 0.07, 0.012) },
      uFogDensity: { value: 0.0062 },
      uCharge: { value: 0 },
      uWaveC: { value: new THREE.Vector2(0, 0) },
      uWaveR: { value: -100 },
      uWaveW: { value: 45 },
      uShockR: { value: -1000 },
      uShockW: { value: 8 },
      uShockAmp: { value: 0 },
      uResY: { value: 1080 },
      uBT: { value: -1 },
    };
    this.U = U;

    this.scene.add(this.camera);

    // sky
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms: {
        ...U,
        uCoreDir: { value: new THREE.Vector3(0, 0, -1) },
        uCoreGlow: { value: 0.3 },
        uSkyAmt: { value: 0.1 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 40, 24), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // world
    this.scene.add(buildTerrain(U));
    this.scene.add(buildPillars(U));
    this.monos = buildMonoliths(U);
    this.monos.forEach((m) => this.scene.add(m.group));

    // camera-driven reveal schedule for monoliths
    for (let i = 0; i < MONO_COUNT; i++) {
      let s: number;
      if (i === 0) s = 8.0;
      else if (i === 9) s = 8.7;
      else {
        const target = this.monos[i].angle - 1.5;
        s = 30;
        for (let tt = 9; tt < 30; tt += 0.02) {
          if (this.trk.phi(tt) >= target) {
            s = tt;
            break;
          }
        }
        s = Math.max(s, 9.7 + i * 0.1);
      }
      this.riseStart.push(s);
    }

    // energy core
    this.orbMat = new THREE.ShaderMaterial({
      vertexShader: orbVert,
      fragmentShader: orbFrag,
      uniforms: { ...U, uIntensity: { value: 1 } },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), this.orbMat);
    this.orb.position.set(0, CORE_Y, 0);
    this.scene.add(this.orb);

    const mkHalo = (tex: THREE.Texture) =>
      new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          fog: false,
        })
      );
    this.haloIn = mkHalo(radialSprite("rgba(255,255,240,1)", "rgba(255,120,20,0)"));
    this.haloOut = mkHalo(radialSprite("rgba(255,210,140,0.7)", "rgba(255,90,10,0)"));
    this.haloIn.position.set(0, CORE_Y, 0);
    this.haloOut.position.set(0, CORE_Y, 0);
    this.scene.add(this.haloIn, this.haloOut);

    // vertical beam
    this.beamMat = new THREE.ShaderMaterial({
      vertexShader: beamVert,
      fragmentShader: beamFrag,
      uniforms: { ...U, uAmt: { value: 0 } },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const bg = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true);
    bg.translate(0, 0.5, 0);
    this.beam = new THREE.Mesh(bg, this.beamMat);
    this.beam.position.y = -4;
    this.beam.frustumCulled = false;
    this.scene.add(this.beam);

    // blast shell
    this.shellMat = new THREE.ShaderMaterial({
      vertexShader: orbVert,
      fragmentShader: shellFrag,
      uniforms: { ...U, uAmt: { value: 0 } },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 5), this.shellMat);
    this.shell.position.set(0, CORE_Y, 0);
    this.shell.visible = false;
    this.shell.frustumCulled = false;
    this.scene.add(this.shell);

    // ground shock ring
    this.ringMat = new THREE.ShaderMaterial({
      vertexShader: ringVert,
      fragmentShader: ringFrag,
      uniforms: { ...U, uAmt: { value: 0 } },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const rg = new THREE.PlaneGeometry(2, 2);
    rg.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(rg, this.ringMat);
    this.ring.position.y = 1.6;
    this.ring.visible = false;
    this.ring.frustumCulled = false;
    this.scene.add(this.ring);

    // ambient embers
    {
      const n = 2400;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const a = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        a[i * 4] = Math.random() * 2 - 1;
        a[i * 4 + 1] = Math.random() * 2 - 1;
        a[i * 4 + 2] = Math.random() * 2 - 1;
        a[i * 4 + 3] = Math.random();
      }
      g.setAttribute("aRnd", new THREE.BufferAttribute(a, 4));
      this.emberMat = new THREE.ShaderMaterial({
        vertexShader: emberVert,
        fragmentShader: pointFrag,
        uniforms: { ...U, uAmt: { value: 0 } },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      });
      this.embers = new THREE.Points(g, this.emberMat);
      this.embers.frustumCulled = false;
      this.scene.add(this.embers);
    }

    // inflow particles (charge phase)
    {
      const n = 1600;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const a = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        a[i * 4] = Math.random();
        a[i * 4 + 1] = Math.random();
        a[i * 4 + 2] = Math.random() * 2 - 1;
        a[i * 4 + 3] = Math.random();
      }
      g.setAttribute("aRnd", new THREE.BufferAttribute(a, 4));
      this.inflowMat = new THREE.ShaderMaterial({
        vertexShader: inflowVert,
        fragmentShader: pointFrag,
        uniforms: { ...U, uCharge: this.inflowCharge, uAmt: { value: 1 } },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      });
      const p = new THREE.Points(g, this.inflowMat);
      p.frustumCulled = false;
      this.scene.add(p);
    }

    // explosion sparks
    {
      const n = 5500;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const dir = new Float32Array(n * 4);
      const life = new Float32Array(n * 2);
      const v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
        if (v.lengthSq() < 0.0001) v.set(0, 1, 0);
        v.normalize();
        v.y = v.y * 0.8 + 0.12;
        v.normalize();
        const sp = 8 + Math.pow(Math.random(), 1.6) * 90;
        dir.set([v.x, v.y, v.z, sp], i * 4);
        life[i * 2] = 1.8 + Math.random() * 3.2;
        life[i * 2 + 1] = Math.random();
      }
      g.setAttribute("aDir", new THREE.BufferAttribute(dir, 4));
      g.setAttribute("aLife", new THREE.BufferAttribute(life, 2));
      const m = new THREE.ShaderMaterial({
        vertexShader: blastVert,
        fragmentShader: blastFrag,
        uniforms: { ...U },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      });
      const p = new THREE.Points(g, m);
      p.frustumCulled = false;
      this.scene.add(p);
    }

    // explosion shards
    {
      const n = 320;
      const base = new THREE.OctahedronGeometry(1, 0);
      base.scale(0.32, 0.32, 1.3);
      const ig = new THREE.InstancedBufferGeometry();
      ig.setAttribute("position", base.getAttribute("position"));
      ig.instanceCount = n;
      const dir = new Float32Array(n * 4);
      const spin = new Float32Array(n * 4);
      const v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
        v.y = v.y * 0.7 + 0.15;
        v.normalize();
        dir.set([v.x, v.y, v.z, 12 + Math.random() * 60], i * 4);
        const ax = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        spin.set([ax.x, ax.y, ax.z, 0.25 + Math.pow(Math.random(), 2) * 1.1], i * 4);
      }
      ig.setAttribute("aDir", new THREE.InstancedBufferAttribute(dir, 4));
      ig.setAttribute("aSpin", new THREE.InstancedBufferAttribute(spin, 4));
      const m = new THREE.ShaderMaterial({
        vertexShader: shardVert,
        fragmentShader: shardFrag,
        uniforms: { ...U },
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(ig, m);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
    }

    // logo particles (parented to the camera)
    {
      const n = 16000;
      const target = sampleLogo(n);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute("aTarget", new THREE.BufferAttribute(target, 3));
      const start = new Float32Array(n * 3);
      const seed = new Float32Array(n);
      const v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
        if (v.lengthSq() < 0.0001) v.set(1, 0, 0);
        v.normalize().multiplyScalar(2 + Math.pow(Math.random(), 0.6) * 13);
        start.set([v.x, v.y * 0.8, v.z * 0.6], i * 3);
        seed[i] = Math.random();
      }
      g.setAttribute("aStart", new THREE.BufferAttribute(start, 3));
      g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
      this.logoMat = new THREE.ShaderMaterial({
        vertexShader: logoPtsVert,
        fragmentShader: logoPtsFrag,
        uniforms: { ...U, uForm: { value: 0 }, uScale: { value: 5 }, uAmt: { value: 0 } },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        transparent: true,
      });
      this.logoPts = new THREE.Points(g, this.logoMat);
      this.logoPts.frustumCulled = false;
      this.logoPts.renderOrder = 50;
      this.camera.add(this.logoPts);
    }

    // post-processing
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.7, 1.0);
    this.composer.addPass(this.bloom);
    this.finalPass = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          uTime: { value: 0 },
          uFlash: { value: 0 },
          uFade: { value: 0 },
          uAspect: { value: 1.7 },
          uAberr: { value: 1 },
          uStreak: { value: 1 },
        },
        vertexShader: finalVert,
        fragmentShader: finalFrag,
      })
    );
    this.composer.addPass(this.finalPass);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();

    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private resize() {
    const w = Math.max(2, this.container.clientWidth);
    const h = Math.max(2, this.container.clientHeight);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    (this.finalPass.uniforms.uAspect as THREE.IUniform).value = w / h;
    this.U.uResY.value = h * this.pixelRatio;
  }

  restart() {
    this.t = 0;
    this.playing = true;
    this.monos.forEach((m) => {
      m.videoStarted = false;
      if (m.video) m.video.currentTime = 0;
    });
  }
  seek(t: number) {
    this.t = t;
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const rawDt = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(0.05, rawDt);
    if (this.playing && !this.freeze) this.t += dt;

    // adaptive resolution
    if (rawDt > 1 / 32) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 50 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.slowFrames = 0;
      this.resize();
    }

    this.update(this.t);
    this.composer.render();
    this.onFrame(this.t);
  };

  private update(t: number) {
    const U = this.U;
    const tb = t - TL.BLAST;
    U.uTime.value = t;
    U.uBT.value = tb;

    // ── timeline-derived quantities
    const after = t >= TL.BLAST;
    const charge = after ? 0 : smoothstep(TL.CHARGE_START, TL.COLLAPSE, t);
    const implode = after ? 0 : smoothstep(TL.COLLAPSE, TL.BLAST, t);
    const flash = t < TL.BLAST ? 0.45 * Math.pow(smoothstep(TL.BLAST - 0.55, TL.BLAST, t), 2) : Math.exp(-tb * 3.0);

    // wave of construction
    const q = clamp((t - TL.WAVE_START) / TL.WAVE_LEN);
    U.uWaveR.value = t < TL.WAVE_START ? -100 : 360 * (1 - Math.pow(1 - q, 1.6));

    // shock
    if (after) {
      U.uShockR.value = tb * 60;
      U.uShockW.value = 7 + tb * 2.5;
      U.uShockAmp.value = 7 * Math.exp(-tb * 0.45) * smoothstep(0, 0.12, tb);
    } else {
      U.uShockR.value = -1000;
      U.uShockAmp.value = 0;
    }

    U.uCharge.value = after ? 0.55 * Math.exp(-tb * 0.25) : charge;
    this.inflowCharge.value = after ? 0 : charge;
    U.uExposure.value = 1 - 0.5 * smoothstep(33, 36.5, t);

    // core light
    const seedGlow = smoothstep(0.4, 2.0, t);
    const coreI = after ? 0.35 + 60 * Math.exp(-tb * 3.4) : 0.4 * seedGlow + 2.6 * charge + 11 * implode * implode;
    (U.uCore.value as THREE.Vector4).w = coreI;

    // orb
    const pulse = 1 + 0.06 * Math.sin(t * 6 * (1 + charge * 3));
    const orbR = (0.3 + 3.6 * Math.pow(charge, 1.4)) * (1 - 0.82 * implode * implode) * pulse * smoothstep(0.3, 1.7, t);
    this.orb.visible = !after && orbR > 0.01;
    this.orb.scale.setScalar(Math.max(orbR, 0.001));
    this.orbMat.uniforms.uIntensity.value = 0.6 + 1.4 * charge + 3 * implode;

    const hk = after ? 4 * Math.exp(-tb * 3.2) + 0.08 : (0.35 + 1.5 * charge + 3.5 * implode * implode) * seedGlow;
    const hs = after ? 14 + 90 * Math.exp(-tb * 3.0) : (3 + 13 * charge + 26 * implode * implode) * seedGlow + 0.01;
    this.haloIn.scale.setScalar(hs);
    (this.haloIn.material as THREE.SpriteMaterial).color.setRGB(1.0 * hk, 0.82 * hk, 0.5 * hk);
    const hk2 = after ? 2.2 * Math.exp(-tb * 2.4) + 0.06 : (0.18 + 0.9 * charge + 1.6 * implode) * seedGlow;
    const hs2 = after ? 40 + 160 * Math.exp(-tb * 2.4) : (14 + 52 * charge + 40 * implode) * seedGlow + 0.01;
    this.haloOut.scale.setScalar(hs2);
    (this.haloOut.material as THREE.SpriteMaterial).color.setRGB(1.0 * hk2, 0.6 * hk2, 0.25 * hk2);

    // beam
    const beamR = 0.45 + 1.3 * charge - 0.9 * implode + (after ? 7 * Math.exp(-tb * 1.3) : 0);
    this.beam.scale.set(Math.max(beamR, 0.05), 170, Math.max(beamR, 0.05));
    this.beamMat.uniforms.uAmt.value =
      after ? 3.0 * Math.exp(-tb * 1.4) : 0.4 * smoothstep(1, 3, t) + 0.9 * charge;

    this.beam.visible = this.beamMat.uniforms.uAmt.value > 0.01;

    // shell + ring
    this.shell.visible = after && tb < 2.2;
    if (this.shell.visible) {
      this.shell.scale.setScalar(Math.max(0.01, 95 * (1 - Math.exp(-2.6 * tb))));
      this.shellMat.uniforms.uAmt.value = 2.2 * Math.exp(-tb * 2.8);
    }
    this.ring.visible = after && tb < 6;
    if (this.ring.visible) {
      const r = Math.max(0.01, tb * 60);
      this.ring.scale.set(r, 1, r);
      this.ringMat.uniforms.uAmt.value = Math.exp(-tb * 0.55);
    }

    // embers
    this.emberMat.uniforms.uAmt.value = smoothstep(2, 5, t);

    // monoliths
    const mono = U.uMono.value as THREE.Vector4[];
    for (let i = 0; i < MONO_COUNT; i++) {
      const m = this.monos[i];
      const s = this.riseStart[i];
      const grow = easeOutCubic((t - s) / 2.6);
      m.goldMat.uniforms.uGrow.value = grow;
      const power = clamp((t - s - 1.9) / 1.8);
      m.screenMat.uniforms.uPower.value = power;
      const flare = 1.6 * Math.exp(-Math.pow((t - s - 0.5) * 1.1, 2));
      const glow = grow > 0 ? (0.45 + 0.8 * grow + flare) * (1 + charge * 1.6 + (after ? 0.6 : 0)) : 0;
      mono[i].set(m.base.x, m.base.y + 0.5, m.base.z, glow);
      m.group.visible = grow > 0.001;
      if (m.video && power > 0 && !m.videoStarted) {
        m.videoStarted = true;
        m.video.play().catch(() => undefined);
      }
    }

    // ── camera
    const phi = this.trk.phi(t);
    const R = this.trk.R(t);
    let x = R * Math.sin(phi);
    let z = R * Math.cos(phi);
    const sway = (1 - smoothstep(5, 11, t)) * smoothstep(0.5, 3, t) * 7;
    x += sway * Math.sin(t * 0.45);
    const shakeAmp = 0.02 + 0.2 * charge * charge + 0.7 * implode * implode + (after ? 1.5 * Math.exp(-tb * 2.4) : 0);
    const sx = Math.sin(t * 17.3) + 0.6 * Math.sin(t * 31.7 + 1.3) + 0.4 * Math.sin(t * 7.1 + 4.0);
    const sy = Math.sin(t * 19.1 + 2.0) + 0.6 * Math.sin(t * 27.3 + 0.4) + 0.4 * Math.sin(t * 6.3 + 1.0);
    const sz = Math.sin(t * 15.7 + 3.0) + 0.5 * Math.sin(t * 23.1);
    x += sx * shakeAmp * 0.3;
    z += sz * shakeAmp * 0.3;
    let y = smax(this.trk.y(t), groundHeight(x, z) + 2.4, 1.5) + sy * shakeAmp * 0.3;
    y = Math.max(y, groundHeight(x, z) + 1.4);
    this.camera.position.set(x, y, z);

    const tphi = phi + this.trk.lead(t);
    const tR = this.trk.tR(t);
    const target = new THREE.Vector3(tR * Math.sin(tphi), this.trk.ty(t), tR * Math.cos(tphi));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target);
    this.camera.rotateZ(this.trk.roll(t) + sx * shakeAmp * 0.006);

    this.camera.fov = this.trk.fov(t);
    this.camera.updateProjectionMatrix();

    // sky follows the camera
    this.sky.position.copy(this.camera.position);
    const cd = new THREE.Vector3(0, CORE_Y, 0).sub(this.camera.position).normalize();
    this.skyMat.uniforms.uCoreDir.value.copy(cd);
    this.skyMat.uniforms.uCoreGlow.value = 0.25 + 1.4 * charge + (after ? 2 * Math.exp(-tb * 2.4) : 0);
    this.skyMat.uniforms.uSkyAmt.value = 0.08 + 0.92 * smoothstep(1.5, 8, t);

    // logo particles
    const hVis = 2 * LOGO_D * Math.tan((this.camera.fov * Math.PI) / 360);
    this.logoPts.position.set(0, (0.5 - LOGO_CENTER_Y) * hVis, -LOGO_D);
    this.logoMat.uniforms.uScale.value = LOGO_SIDE * hVis;
    this.logoMat.uniforms.uForm.value = clamp((t - TL.FORM_START) / (TL.FORM_END - TL.FORM_START));
    this.logoMat.uniforms.uAmt.value = smoothstep(TL.BLAST + 0.6, TL.BLAST + 1.4, t) * (1 - 0.82 * smoothstep(35.9, 37.2, t));
    this.logoPts.visible = t > TL.BLAST + 0.5;

    // post
    this.bloom.strength = 0.45 + 1.9 * flash + 0.5 * implode;
    this.bloom.radius = 0.75 + 0.2 * flash;
    const fu = this.finalPass.uniforms;
    fu.uTime.value = t;
    fu.uFlash.value = flash * 0.9;
    fu.uFade.value = smoothstep(0, 1.6, t);
    fu.uAberr.value = 0.12 + 1.6 * flash + 0.8 * implode;
    fu.uStreak.value = 1 + 1.6 * flash + charge * 0.4;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.composer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
    this.monos.forEach((m) => m.video?.pause());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
