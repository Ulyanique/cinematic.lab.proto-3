// Re-export the real three.js but swap WebGLRenderer for a no-op mock so the
// whole IntroScene (construction + every frame of the timeline) can run in Node.
export * from "/home/user/cinematic.lab.proto-3/node_modules/three/build/three.module.js";

export class WebGLRenderer {
  domElement: any;
  capabilities = { getMaxAnisotropy: () => 8, isWebGL2: true, maxTextureSize: 4096 };
  info = { render: {}, memory: {}, programs: [] };
  shadowMap = { enabled: false };
  state = { buffers: {} };
  autoClear = true;
  outputColorSpace = "srgb";
  toneMapping = 0;
  toneMappingExposure = 1;
  xr = { enabled: false, isPresenting: false, addEventListener() {}, setAnimationLoop() {} };
  _w = 1280;
  _h = 720;
  _pr = 1;
  constructor() {
    this.domElement = {
      style: {},
      width: 0,
      height: 0,
      setAttribute() {},
      removeAttribute() {},
      addEventListener() {},
      removeEventListener() {},
      remove() {},
      getContext: () => null,
    };
    // any renderer API the mock does not know about becomes a no-op
    return new Proxy(this, {
      get(target, prop, recv) {
        const v = Reflect.get(target, prop, recv);
        if (v !== undefined) return v;
        if (prop === "then") return undefined;
        return () => undefined;
      },
    });
  }
  getPixelRatio() {
    return this._pr;
  }
  setPixelRatio(v: number) {
    this._pr = v;
  }
  getSize(v: any) {
    v.set?.(this._w, this._h);
    return { width: this._w, height: this._h };
  }
  setSize(w: number, h: number, _updateStyle?: boolean) {
    this._w = w;
    this._h = h;
  }
  setClearColor() {}
  setRenderTarget() {}
  getRenderTarget() {
    return null;
  }
  clear() {}
  clearDepth() {}
  clearColor() {}
  render() {}
  compile() {}
  dispose() {}
  forceContextLoss() {}
  setAnimationLoop() {}
  getContext() {
    return null;
  }
  copyFramebufferToTexture() {}
  initTexture() {}
  resetState() {}
}
