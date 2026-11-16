// ─────────────────────────────────────────────────────────────
//  Post chain: HDR scene → bloom → volumetric shafts → film grade
// ─────────────────────────────────────────────────────────────
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import type { QualitySettings } from "./config";
import { finalFrag, finalVert, shaftsFrag, shaftsVert } from "./shaders";

export interface PostChain {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  shafts: ShaderPass;
  final: ShaderPass;
  resize: (w: number, h: number, pixelRatio: number) => void;
  dispose: () => void;
}

export function buildPost(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  quality: QualitySettings
): PostChain {
  const rt = new THREE.WebGLRenderTarget(4, 4, {
    type: THREE.HalfFloatType,
    samples: quality.sampleCount,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(quality.bloomRes, quality.bloomRes), 0.62, 0.62, 0.78);
  composer.addPass(bloom);

  const shafts = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uAmt: { value: 0 },
        uDensity: { value: 0.55 },
        uDecay: { value: 0.9 },
      },
      vertexShader: shaftsVert,
      fragmentShader: shaftsFrag,
    })
  );
  shafts.enabled = quality.shafts;
  composer.addPass(shafts);

  const final = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uFlash: { value: 0 },
        uFade: { value: 0 },
        uAspect: { value: 1.7 },
        uAberr: { value: 0.4 },
        uStreak: { value: 0 },
        uGrain: { value: 0.022 },
        uVignette: { value: 0.55 },
      },
      vertexShader: finalVert,
      fragmentShader: finalFrag,
    })
  );
  composer.addPass(final);

  return {
    composer,
    bloom,
    shafts,
    final,
    resize: (w, h, pixelRatio) => {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(w, h);
      (final.uniforms.uAspect as THREE.IUniform).value = w / h;
    },
    dispose: () => {
      composer.dispose();
      rt.dispose();
      bloom.dispose();
      shafts.material.dispose();
      final.material.dispose();
    },
  };
}
