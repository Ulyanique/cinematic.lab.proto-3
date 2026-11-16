import * as THREE from "three";
import { clamp, easeOutCubic, smoothstep } from "./math";
import { CORE_Y, MONO_COUNT, TL, type QualitySettings } from "./config";
import { buildArmillary, buildMonoliths, buildPillars, buildTerrain, type Monolith, type Uniforms } from "./world";
import { buildCompassEmblem } from "./logo3d";
import { buildPost, type PostChain } from "./post";
import { CameraRig } from "./camera";

const AXIS_Z = new THREE.Vector3(0, 0, 1);
import {
  beamFrag,
  beamVert,
  blastFrag,
  blastVert,
  emberVert,
  inflowVert,
  logoPtsFrag,
  logoPtsVert,
  orbFrag,
  orbVert,
  pointFrag,
  polishedFrag,
  polishedVert,
  ringFrag,
  ringVert,
  shardFrag,
  shardVert,
  shellFrag,
  skyFrag,
  skyVert,
} from "./shaders";

export interface IntroOptions {
  quality: QualitySettings;
  onFrame?: (t: number) => void;
  onEnd?: () => void;
}

function radialSprite(inner: string, mid: string, outer: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.3, mid);
  grad.addColorStop(0.68, "rgba(255,128,28,0.10)");
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class IntroScene {
  t = 0;
  playing = true;
  freeze = false;

  private opts: IntroOptions;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1600);
  private post: PostChain;
  private rig: CameraRig;

  private raf = 0;
  private last = 0;
  /** the piece is authored for 16:9; the framebuffer is always exactly 16:9 */
  private renderScale = 1;
  private scaleDrops = 0;
  private baseH: number;
  private renderW = 1920;
  private renderH = 1080;
  private slowFrames = 0;
  private fastFrames = 0;
  private ended = false;
  private ro: ResizeObserver;
  private disposed = false;

  private U: Uniforms;
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private monos: Monolith[] = [];
  private riseStart: number[] = [];
  private coreScreen = new THREE.Vector2(0.5, 0.5);

  private orb: THREE.Mesh;
  private orbMat: THREE.ShaderMaterial;
  private halos: THREE.Sprite[] = [];
  private beam: THREE.Mesh;
  private beamMat: THREE.ShaderMaterial;
  private shells: THREE.Mesh[] = [];
  private shellMats: THREE.ShaderMaterial[] = [];
  private rings: THREE.Mesh[] = [];
  private ringMats: THREE.ShaderMaterial[] = [];
  private emberMat: THREE.ShaderMaterial;
  private inflowMat: THREE.ShaderMaterial;
  private inflowCharge = { value: 0 };
  private armillary: { group: THREE.Group; rings: THREE.Mesh[]; bead: THREE.Mesh };
  private armillaryMat: THREE.ShaderMaterial;

  private emblem!: ReturnType<typeof buildCompassEmblem>;
  private emblemMat: THREE.ShaderMaterial;
  private readonly fogBase = new THREE.Color(0.045, 0.041, 0.036);
  private emblemHalo: THREE.Mesh;
  private logoPts: THREE.Points;
  private logoMat: THREE.ShaderMaterial;

  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private ringSpin = [0, 0, 0, 0];
  private tmpFace = new THREE.Quaternion();
  private tmpSpin = new THREE.Quaternion();
  private tmpDir = new THREE.Vector3();
  private now = 0;
  private onVisibility = () => {
    if (!document.hidden) this.last = performance.now();
  };

  constructor(container: HTMLElement, opts: IntroOptions) {
    this.opts = opts;
    this.baseH = opts.quality.renderH;
    this.renderScale = 1;

    const params = new URLSearchParams(window.location.search);
    if (params.has("t")) this.t = parseFloat(params.get("t") || "0") || 0;
    this.freeze = params.has("freeze");

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
      alpha: false,
      stencil: false,
      depth: true,
    });
    this.renderer = renderer;
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 1);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.setAttribute("aria-hidden", "true");
    container.appendChild(renderer.domElement);

    const U: Uniforms = {
      uTime: { value: 0 },
      uCore: { value: new THREE.Vector4(0, CORE_Y, 0, 0.5) },
      uCorePos: { value: new THREE.Vector3(0, CORE_Y, 0) },
      uMono: { value: Array.from({ length: MONO_COUNT }, () => new THREE.Vector4(0, -80, 0, 0)) },
      uExposure: { value: 1 },
      uFogColor: { value: new THREE.Color(0.045, 0.041, 0.036) },
      uFogDensity: { value: 0.0058 },
      uCharge: { value: 0 },
      uWaveC: { value: new THREE.Vector2(0, 0) },
      uWaveR: { value: -100 },
      uWaveW: { value: 46 },
      uShockR: { value: -1000 },
      uShockW: { value: 8 },
      uShockAmp: { value: 0 },
      uResY: { value: 1080 },
      uBT: { value: -1 },
    };
    this.U = U;

    this.scene.add(this.camera);

    // ── sky
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms: {
        ...U,
        uCoreDir: { value: new THREE.Vector3(0, 0, -1) },
        uCoreGlow: { value: 0.3 },
        uSkyAmt: { value: 0.05 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 40, 24), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // ── architecture
    this.scene.add(buildTerrain(U));
    this.scene.add(buildPillars(U));
    this.monos = buildMonoliths(U, renderer.capabilities.getMaxAnisotropy());
    this.monos.forEach((m) => this.scene.add(m.group));

    // ── camera rig (with the crystals as soft collision volumes)
    this.rig = new CameraRig(
      this.monos.map((m) => ({ x: m.base.x, z: m.base.z, r: 7.5 }))
    );

    // ── reveal schedule: a crystal starts growing just before the camera frames it
    this.computeRiseSchedule();

    // ── energy core
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
    this.orb.frustumCulled = false;
    this.scene.add(this.orb);

    const haloTextures = [
      radialSprite("rgba(255,255,244,1)", "rgba(255,214,150,0.55)", "rgba(255,120,20,0)"),
      radialSprite("rgba(255,214,150,0.75)", "rgba(255,150,50,0.32)", "rgba(255,90,10,0)"),
    ];
    for (const tex of haloTextures) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: false,
          transparent: true,
          fog: false,
        })
      );
      s.position.set(0, CORE_Y, 0);
      s.frustumCulled = false;
      this.halos.push(s);
      this.scene.add(s);
    }

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

    // blast shells
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: orbVert,
        fragmentShader: shellFrag,
        uniforms: { ...U, uAmt: { value: 0 } },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 5), mat);
      mesh.position.set(0, CORE_Y, 0);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.shellMats.push(mat);
      this.shells.push(mesh);
      this.scene.add(mesh);
    }

    // ground shock rings
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.ShaderMaterial({
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
      const mesh = new THREE.Mesh(rg, mat);
      mesh.position.y = 1.4 + i * 0.35;
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.ringMats.push(mat);
      this.rings.push(mesh);
      this.scene.add(mesh);
    }

    // ambient embers / dust
    {
      const n = this.opts.quality.embers;
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
      const p = new THREE.Points(g, this.emberMat);
      p.frustumCulled = false;
      this.scene.add(p);
    }

    // inflow particles (charge)
    {
      const n = 1800;
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

    // detonation sparks
    {
      const n = this.opts.quality.sparks;
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
        const sp = 8 + Math.pow(Math.random(), 1.6) * 95;
        dir.set([v.x, v.y, v.z, sp], i * 4);
        life[i * 2] = 1.8 + Math.random() * 3.4;
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

    // flying debris
    {
      const n = this.opts.quality.shards;
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
        dir.set([v.x, v.y, v.z, 12 + Math.random() * 62], i * 4);
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

    // armillary rings around the core
    this.armillaryMat = new THREE.ShaderMaterial({
      vertexShader: polishedVert,
      fragmentShader: polishedFrag,
      uniforms: { ...U, uForm: { value: 1 }, uSweep: { value: 0 }, uGlow: { value: 0.6 }, uSpan: { value: 3 } },
      side: THREE.DoubleSide,
    });
    this.armillary = buildArmillary(this.armillaryMat);
    this.scene.add(this.armillary.group);

    // ── the compass emblem + the particles that assemble it
    this.emblemMat = new THREE.ShaderMaterial({
      vertexShader: polishedVert,
      fragmentShader: polishedFrag,
      uniforms: { ...U, uForm: { value: 0 }, uSweep: { value: 0 }, uGlow: { value: 0.4 }, uSpan: { value: 2.1 } },
      side: THREE.DoubleSide,
    });
    this.emblem = buildCompassEmblem(this.emblemMat);
    const emblemPos = new THREE.Vector3(0, CORE_Y + 0.35, 0);
    this.emblem.group.position.copy(emblemPos);
    this.emblem.group.scale.setScalar(0.94);
    // face the final camera pose
    const finalPose = this.rig.sample(TL.END);
    this.emblem.group.lookAt(finalPose.pos);
    this.emblem.group.rotateY(0.1);
    this.emblem.group.rotateX(0.04);
    this.emblem.group.updateMatrixWorld(true);
    this.scene.add(this.emblem.group);

    // soft halo behind the emblem
    const haloMat = new THREE.MeshBasicMaterial({
      map: radialSprite("rgba(255,196,110,0.55)", "rgba(255,140,40,0.18)", "rgba(255,80,0,0)"),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.emblemHalo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat);
    this.emblemHalo.scale.setScalar(11);
    this.emblemHalo.position.set(0, 0, -1.1);
    this.emblemHalo.frustumCulled = false;
    this.emblem.group.add(this.emblemHalo);

    // particle build-up targets = samples on the emblem's surface
    {
      const n = this.opts.quality.renderH >= 1000 ? 14000 : 8000;
      const local = this.emblem.sampleSurface(n, 7);
      const world = new Float32Array(n * 3);
      const start = new Float32Array(n * 3);
      const seed = new Float32Array(n);
      const v = new THREE.Vector3();
      const m = this.emblem.group.matrixWorld;
      for (let i = 0; i < n; i++) {
        v.set(local[i * 3], local[i * 3 + 1], local[i * 3 + 2]).applyMatrix4(m);
        world[i * 3] = v.x;
        world[i * 3 + 1] = v.y;
        world[i * 3 + 2] = v.z;

        v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
        if (v.lengthSq() < 0.001) v.set(0, 1, 0);
        v.normalize().multiplyScalar(5 + Math.pow(Math.random(), 0.7) * 26);
        start[i * 3] = v.x;
        start[i * 3 + 1] = v.y * 0.8 + 1.5;
        start[i * 3 + 2] = v.z;
        seed[i] = Math.random();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute("aTarget", new THREE.BufferAttribute(world, 3));
      g.setAttribute("aStart", new THREE.BufferAttribute(start, 3));
      g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
      this.logoMat = new THREE.ShaderMaterial({
        vertexShader: logoPtsVert,
        fragmentShader: logoPtsFrag,
        uniforms: { ...U, uForm: { value: 0 }, uAmt: { value: 0 }, uAura: { value: 0 } },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        transparent: true,
      });
      this.logoPts = new THREE.Points(g, this.logoMat);
      this.logoPts.position.set(0, 0, 0);
      this.logoPts.frustumCulled = false;
      this.logoPts.renderOrder = 50;
      this.logoPts.visible = false;
      this.scene.add(this.logoPts);
    }

    this.emblem.group.visible = false;

    // ── post
    this.post = buildPost(renderer, this.scene, this.camera, opts.quality);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();


    document.addEventListener("visibilitychange", this.onVisibility);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ── schedule ───────────────────────────────────────────────
  /** The ring wakes up as the camera arrives: the gate pair first, then a wave around the circle. */
  private computeRiseSchedule() {
    const order = [0, MONO_COUNT - 1, 1, MONO_COUNT - 2, 2, MONO_COUNT - 3, 3, MONO_COUNT - 4, 4, MONO_COUNT - 5];
    const rises = new Array<number>(MONO_COUNT).fill(TL.RISE_START);
    order.forEach((idx, k) => {
      rises[idx] = TL.RISE_START + k * 0.55 + (idx % 3) * 0.07;
    });
    this.riseStart = rises;
  }

  // ── lifecycle ──────────────────────────────────────────────
  private resize() {
    // Fixed 16:9 framebuffer (1920×1080 on the high tier): the CSS box may crop
    // the edges on an odd window, but the picture is never letterboxed and the
    // framing cannot drift with the browser chrome.
    const h = Math.max(2, Math.round(this.baseH * this.renderScale));
    const w = Math.max(2, Math.round((h * 16) / 9 / 2) * 2);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.post.resize(w, h, 1);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.U.uResY.value = h;
    this.renderW = w;
    this.renderH = h;
  }

  /** internal render size in pixels (always 16:9) */
  get size() {
    return { width: this.renderW, height: this.renderH };
  }

  restart() {
    this.t = 0;
    this.playing = true;
    this.ended = false;
    this.monos.forEach((m) => {
      m.videoStarted = false;
      if (m.video) m.video.currentTime = 0;
    });
  }

  /**
   * Swap a crystal's plate onto a user-supplied clip (drag & drop, or any URL).
   * Object URLs are used for local files, so nothing has to be uploaded anywhere.
   */
  setVideo(index: number, url: string) {
    const m = this.monos[index];
    if (!m) return;
    let v = m.video;
    if (!v) {
      v = document.createElement("video");
      v.crossOrigin = "anonymous";
      v.loop = true;
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.setAttribute("playsinline", "");
      v.setAttribute("muted", "");
      const vt = new THREE.VideoTexture(v);
      vt.colorSpace = THREE.SRGBColorSpace;
      vt.minFilter = THREE.LinearFilter;
      vt.magFilter = THREE.LinearFilter;
      vt.generateMipmaps = false;
      m.screenMat.uniforms.uMap.value = vt;
      m.video = v;
    }
    const applyAspect = () => {
      const a = v!.videoWidth / Math.max(1, v!.videoHeight);
      if (a > 0.1) m.screenMat.uniforms.uTexAspect.value = a;
    };
    v.addEventListener("loadedmetadata", applyAspect);
    v.addEventListener("error", () => {
      m.screenMat.uniforms.uIsVideo.value = 0;
    });
    v.src = url;
    v.load();
    applyAspect();
    m.screenMat.uniforms.uIsVideo.value = 1;
    m.videoStarted = true;
    void v.play().catch(() => undefined);
  }

  /** Number of crystals (for the drop-zone mapping). */
  get crystalCount() {
    return this.monos.length;
  }

  seek(t: number) {
    this.t = Math.max(0, t);
    this.ended = this.t >= TL.END;
  }



  // ── frame loop ─────────────────────────────────────────────
  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const rawDt = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(0.05, Math.max(0, rawDt));
    if (this.playing && !this.freeze) {
      this.t += dt;
      if (this.t >= TL.END) {
        this.t = TL.END;
        this.playing = false;
      }
    }

    // adaptive resolution: shed pixels on heavy frames, recover when calm
    if (rawDt > 1 / 30) {
      this.slowFrames++;
      this.fastFrames = 0;
    } else {
      this.slowFrames = Math.max(0, this.slowFrames - 1);
      this.fastFrames++;
    }
    // hysteresis: a drop needs a long, sustained stall, and we climb back only
    // once — a resolution flip-flop reads as the whole frame "breathing"
    if (this.now > 25.5) {
      this.slowFrames = 0;
      this.fastFrames = 0;
    } else if (this.slowFrames > 120 && this.renderScale > 0.6 && this.scaleDrops < 2) {
      this.renderScale = Math.max(0.6, this.renderScale - 0.2);
      this.scaleDrops++;
      this.slowFrames = 0;
      this.fastFrames = 0;
      this.resize();
    } else if (this.fastFrames > 900 && this.renderScale < 1 && this.scaleDrops === 1) {
      this.renderScale = 1;
      this.scaleDrops = 0;
      this.fastFrames = 0;
      this.resize();
    }

    this.update(this.t, dt);
    this.post.composer.render();
    this.opts.onFrame?.(this.t);

    if (!this.ended && this.t >= TL.END) {
      this.ended = true;
      this.opts.onEnd?.();
    }
  };

  private update(t: number, dt: number) {
    const U = this.U;
    this.now = t;
    const after = t >= TL.BLAST;
    const tb = t - TL.BLAST;
    U.uTime.value = t;
    U.uBT.value = after ? tb : -1;

    // ── global envelopes
    const fade = smoothstep(0, TL.FADE_IN, t);
    const charge = after ? 0 : smoothstep(TL.CHARGE_START, TL.CONVERGE_END + 0.4, t);
    const implode = after ? 0 : smoothstep(TL.IMPLODE_START, TL.BLAST, t);
    const flash = t < TL.BLAST ? 0.34 * Math.pow(smoothstep(TL.BLAST - 0.6, TL.BLAST, t), 2.4) : Math.exp(-tb * 9.0);
    const shutdown = smoothstep(TL.CONVERGE_END, TL.CONVERGE_END + 0.55, t);

    // ── construction wave sweeping the terrain
    const q = clamp((t - 1.3) / 14.5);
    U.uWaveR.value = t < 1.3 ? -100 : 380 * (1 - Math.pow(1 - q, 1.6));

    // ── ground shock
    if (after) {
      U.uShockR.value = tb * 64;
      U.uShockW.value = 7 + tb * 3.2;
      U.uShockAmp.value = 8 * Math.exp(-tb * 0.5) * smoothstep(0, 0.1, tb);
    } else {
      U.uShockR.value = -1000;
      U.uShockAmp.value = 0;
    }

    U.uCharge.value = after ? 0.7 * Math.exp(-tb * 0.32) : charge;
    // after the blast the plaza recedes into haze so the emblem owns the frame
    U.uFogDensity.value = 0.0058 + 0.024 * smoothstep(TL.BLAST + 0.9, TL.BLAST + 3.2, t);
    // …and the haze itself goes dark, so the emblem is the only lit thing in frame
    (U.uFogColor.value as THREE.Color)
      .copy(this.fogBase)
      .multiplyScalar(1 - 0.74 * smoothstep(TL.BLAST + 0.6, TL.BLAST + 2.8, t));
    this.inflowCharge.value = after ? 0 : charge;
    // the blast site darkens so the logo can breathe
    U.uExposure.value = 1 - 0.16 * smoothstep(TL.BLAST + 1.4, TL.BLAST + 3.4, t);

    // ── core
    const seedGlow = smoothstep(0.3, 2.0, t);
    const coreI = after
      ? 0.3 + 70 * Math.exp(-tb * 3.2)
      : 0.3 * seedGlow + 1.5 * charge + 9 * implode * implode;
    (U.uCore.value as THREE.Vector4).w = coreI;

    const pulse = 1 + 0.06 * Math.sin(t * 6 * (1 + charge * 3));
    const orbR = after
      ? 3.6 * Math.exp(-tb * 6.0)
      : (0.3 + 3.9 * Math.pow(charge, 1.35)) * (1 - 0.85 * implode * implode) * pulse * smoothstep(0.3, 1.7, t);
    // the core survives the first frames of the blast so the hand-over from the
    // implosion to the fireball is continuous instead of a white-to-black cut
    this.orb.visible = orbR > 0.01;
    this.orb.scale.setScalar(Math.max(orbR, 0.001));
    this.orbMat.uniforms.uIntensity.value = 0.6 + 1.5 * charge + 4 * implode;

    // halos: inner tight, outer soft
    // after the blast a low warm afterglow stays behind so the plaza never goes pitch black
    const hk = after ? 2.2 * Math.exp(-tb * 2.6) + 0.07 : (0.28 + 0.85 * charge + 2.6 * implode * implode) * seedGlow;
    const hs = after
      ? 13 + 95 * Math.exp(-tb * 2.8)
      : (2.5 + 8 * charge + 16 * implode * implode) * seedGlow + 0.01;
    this.halos[0].scale.setScalar(hs);
    (this.halos[0].material as THREE.SpriteMaterial).color.setRGB(hk, 0.82 * hk, 0.5 * hk);
    const hk2 = after ? 1.5 * Math.exp(-tb * 1.8) + 0.045 : (0.14 + 0.42 * charge + 1.0 * implode) * seedGlow;
    const hs2 = after ? 40 + 170 * Math.exp(-tb * 2.2) : (13 + 52 * charge + 44 * implode) * seedGlow + 0.01;
    this.halos[1].scale.setScalar(hs2);
    (this.halos[1].material as THREE.SpriteMaterial).color.setRGB(hk2, 0.6 * hk2, 0.25 * hk2);

    // beam of light into the sky
    const beamR = 0.4 + 1.2 * charge - 0.85 * implode + (after ? 2.6 * Math.exp(-tb * 2.4) : 0);
    this.beam.scale.set(Math.max(beamR, 0.05), 190, Math.max(beamR, 0.05));
    this.beamMat.uniforms.uAmt.value = after
      ? 2.6 * Math.exp(-tb * 2.6)
      : 0.35 * smoothstep(0.8, 3, t) + 0.5 * charge;
    this.beam.visible = this.beamMat.uniforms.uAmt.value > 0.01;

    // ── detonation shells
    for (let i = 0; i < this.shells.length; i++) {
      const delay = i * 0.16;
      const tt = tb - delay;
      const vis = after && tt > 0 && tt < 2.6;
      this.shells[i].visible = vis;
      if (vis) {
        const speed = i === 0 ? 2.7 : 1.9;
        // Grow the fireball, but stop it just short of the lens: fading it by
        // camera distance (the previous attempt) scaled it past the camera within
        // one frame, so the shell was always invisible and the blast read black.
        const camDist = this.camera.position.distanceTo(this.shells[i].position);
        const sc = Math.min(6.5 + 105 * (1 - Math.exp(-speed * tt)), camDist * 0.86);
        this.shells[i].scale.setScalar(Math.max(0.01, sc));
        this.shellMats[i].uniforms.uAmt.value =
          (i === 0 ? 2.4 : 1.1) * Math.exp(-tt * (i === 0 ? 3.1 : 2.1));
      }
    }
    // ── ground rings
    for (let i = 0; i < this.rings.length; i++) {
      const delay = i * 0.28;
      const tt = tb - delay;
      const vis = after && tt > 0 && tt < 7;
      this.rings[i].visible = vis;
      if (vis) {
        const r = Math.max(0.01, tt * (i === 0 ? 62 : 44));
        this.rings[i].scale.set(r, 1, r);
        this.ringMats[i].uniforms.uAmt.value = (i === 0 ? 1 : 0.6) * Math.exp(-tt * (i === 0 ? 0.55 : 0.4));
      }
    }

    // the dust settles while the blast assembles (it used to sparkle hard over the
    // implosion) and only briefly surges afterwards
    const emberCalm = after
      ? 0.85 + 0.5 * Math.exp(-tb * 2.0)
      : 1 - 0.62 * smoothstep(TL.IMPLODE_START - 0.9, TL.BLAST, t);
    this.emberMat.uniforms.uAmt.value =
      smoothstep(1.6, 5, t) * emberCalm * 0.55 * (1 - 0.62 * smoothstep(TL.BLAST + 3.0, TL.END, t));

    // ── crystals
    const mono = U.uMono.value as THREE.Vector4[];
    for (let i = 0; i < MONO_COUNT; i++) {
      const m = this.monos[i];
      const s = this.riseStart[i];
      const grow = easeOutCubic((t - s) / 2.7);
      m.goldMat.uniforms.uGrow.value = grow;
      const on = clamp((t - s - 2.0) / 1.9);
      const power = on * (1 - shutdown);
      m.screenMat.uniforms.uPower.value = power;
      const flare = 1.7 * Math.exp(-Math.pow((t - s - 0.7) * 1.05, 2));
      const glow = grow > 0 ? (0.4 + 0.8 * grow + flare) * (1 + charge * 1.7 + (after ? 0.5 : 0)) : 0;
      mono[i].set(m.base.x, m.base.y + 0.6, m.base.z, glow);
      // the shockwave vaporises the crystals — no monolith survives the blast
      m.group.visible = grow > 0.001 && (!after || tb < 0.35);

      // a breath of life: the crystal settles with a slow sway
      m.group.rotation.z = Math.sin(t * 0.4 + i) * 0.004 * grow;
      if (after) {
        const k = Math.exp(-tb * 1.4) * 0.06;
        m.group.position.y = m.base.y - 0.6 + Math.sin(tb * 22 + i) * k;
      } else {
        m.group.position.y = m.base.y - 0.6;
      }

      if (m.video && power > 0 && !m.videoStarted) {
        m.videoStarted = true;
        m.video.play().catch(() => undefined);
      }
    }

    // ── armillary: four rings hanging on four different planes. As the charge
    //    builds they swing onto one plane that faces the lens, so right before the
    //    blast they read as a single set of concentric circles with the core —
    //    the detonation — dead in the middle of them.
    if (this.armillary) {
      const align = smoothstep(TL.CONVERGE_END - 3.4, TL.BLAST - 0.15, t);
      this.camera.getWorldDirection(this.tmpDir);
      this.tmpFace.setFromUnitVectors(AXIS_Z, this.tmpDir.negate().normalize());
      const spinRate = 0.1 + charge * 0.5 + implode * 2.0;
      this.armillary.rings.forEach((ring, i) => {
        const dir = (ring.userData.spinDir as number) ?? 1;
        const rate = (ring.userData.spinRate as number) ?? 1;
        this.ringSpin[i] += dt * spinRate * rate * dir;
        this.tmpSpin.setFromAxisAngle(AXIS_Z, this.ringSpin[i]);
        ring.quaternion
          .copy(ring.userData.base as THREE.Quaternion)
          .slerp(this.tmpFace, align)
          .multiply(this.tmpSpin);
        // they ride inward while they line up, so the circle tightens onto the core
        ring.scale.setScalar(1 - 0.26 * align);
      });
      this.armillaryMat.uniforms.uGlow.value =
        0.42 + 0.45 * charge + 0.8 * implode + (after ? 1.4 * Math.exp(-tb * 2.2) : 0);
      // get the rings out of the camera's way before the dive through them
      const expand = after
        ? 1.35 + tb * 15
        : 1 + 0.9 * smoothstep(TL.CONVERGE_END - 2.2, TL.IMPLODE_START, t);
      this.armillary.group.scale.setScalar(expand);
      this.armillary.group.visible = t > 2.2 && tb < 0.5;
    }

    // ── camera
    const pose = this.rig.sample(t);
    this.camera.position.copy(pose.pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(pose.target);
    this.camera.rotateZ(pose.roll);
    this.camera.fov = pose.fov;
    this.camera.updateProjectionMatrix();

    // sky follows the camera
    this.sky.position.copy(this.camera.position);
    this.tmpV.set(0, CORE_Y, 0).sub(this.camera.position).normalize();
    this.skyMat.uniforms.uCoreDir.value.copy(this.tmpV);
    this.skyMat.uniforms.uCoreGlow.value =
      0.22 + 1.5 * charge + (after ? 2.4 * Math.exp(-tb * 2.2) : 0);
    this.skyMat.uniforms.uSkyAmt.value = 0.06 + 0.94 * smoothstep(1.2, 7, t);

    // ── finale: emblem + particles
    const solid = smoothstep(TL.SOLID, TL.SOLID + 1.1, t);
    if (this.emblem) {
      this.emblem.group.visible = t > TL.FORM_START - 0.05;
      this.emblemMat.uniforms.uForm.value = smoothstep(TL.FORM_START, TL.SOLID, t);
      this.emblemMat.uniforms.uSweep.value = -0.25 + 1.5 * smoothstep(TL.SOLID + 0.05, TL.SOLID + 1.5, t);
      const form = smoothstep(TL.FORM_START, TL.SOLID, t);
      // the emblem is molten while it assembles, so it carries its own light: this
      // is what fills the beat between the blast and the reveal
      this.emblemMat.uniforms.uGlow.value = 0.75 + 1.7 * form + 0.7 * solid;
      // a frozen hold: no sine pulse, so the last frame is bit-for-bit still
      this.emblemHalo.scale.setScalar(7.6 + 7 * (1 - form));
      (this.emblemHalo.material as THREE.MeshBasicMaterial).opacity = 0.05 + 0.36 * form;
      this.emblemHalo.visible = t > TL.FORM_START;
    }
    if (this.logoPts) {
      this.logoPts.visible = t > TL.BLAST + 0.15;
      this.logoMat.uniforms.uForm.value = smoothstep(TL.FORM_START - 0.35, TL.FORM_END, t);
      this.logoMat.uniforms.uAmt.value =
        smoothstep(TL.BLAST + 0.2, TL.BLAST + 1.1, t) * (1 - 0.94 * smoothstep(TL.SOLID, TL.SOLID + 1.4, t));
      this.logoMat.uniforms.uAura.value = smoothstep(TL.SOLID + 0.6, TL.END, t);
    }

    // ── post
    this.post.bloom.strength = 0.42 + 1.3 * flash + 0.32 * implode + 0.16 * charge + 0.1 * solid;
    this.post.bloom.radius = 0.6 + 0.25 * flash;
    this.post.bloom.threshold = 0.78 - 0.16 * flash;

    const fu = this.post.final.uniforms;
    fu.uTime.value = t;
    fu.uFlash.value = flash * 0.42;
    fu.uFade.value = fade;
    // the implode used to push aberration to ~1.3 and the thin edges shimmered
    fu.uAberr.value = (0.3 + 1.5 * flash + 0.28 * implode + 0.18 * charge) * (1 - 0.62 * solid);
    fu.uStreak.value =
      smoothstep(1.4, 5, t) * (0.7 + 1.1 * flash + 0.35 * charge) * (1 - smoothstep(TL.BLAST + 0.7, TL.BLAST + 3.4, t));
    fu.uGrain.value = 0;
    fu.uVignette.value = 0.5 + 0.18 * solid;

    // shafts: only while the core is on screen
    const shaftsOn = this.post.shafts.enabled;
    if (shaftsOn) {
      this.tmpV2.set(0, CORE_Y, 0).project(this.camera);
      const onScreen = this.tmpV2.z < 1 && Math.abs(this.tmpV2.x) < 1.4 && Math.abs(this.tmpV2.y) < 1.4;
      const centre = after ? (this.tmpV.set(0, CORE_Y + 0.4, 0) as THREE.Vector3) : this.tmpV.set(0, CORE_Y, 0);
      centre.project(this.camera);
      this.coreScreen.set(centre.x * 0.5 + 0.5, centre.y * 0.5 + 0.5);
      this.post.shafts.uniforms.uCenter.value.copy(this.coreScreen);
      const amt = (0.35 * charge + 1.15 * flash + (after ? 0.5 * Math.exp(-tb * 1.4) : 0)) * (onScreen ? 1 : 0);
      this.post.shafts.uniforms.uAmt.value = clamp(amt, 0, 1.4);
    }

  }

  // ── teardown ───────────────────────────────────────────────
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.ro.disconnect();
    this.monos.forEach((m) => {
      if (m.video) {
        m.video.pause();
        m.video.removeAttribute("src");
        m.video.load();
      }
    });
    this.emblem?.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      const list = Array.isArray(mat) ? mat : [mat];
      for (const m of list) {
        const anyMat = m as THREE.MeshBasicMaterial & { uniforms?: Record<string, THREE.IUniform> };
        anyMat.map?.dispose();
        const map = anyMat.uniforms?.uMap?.value;
        if (map && (map as THREE.Texture).isTexture) (map as THREE.Texture).dispose();
        m.dispose();
      }
    });
    this.post.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
