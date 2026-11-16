// Pure-math audit of the armillary alignment: four rings start on four wildly
// different planes and must end up on one plane that faces the lens right before
// the blast, so they read as a single concentric circle with the core inside it.
import * as THREE from "three";
import { TL } from "../src/intro/config";

const AXIS_Z = new THREE.Vector3(0, 0, 1);
const tilts: [number, number, number][] = [
  [1.15, 0.5, 0.72],
  [-0.95, 1.05, -0.55],
  [0.42, -0.35, 0.28],
  [-0.22, 0.6, -0.16],
];
const bases = tilts.map(([x, y, z]) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)));

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// representative late-shot camera axis (the dive down the corridor)
const camDir = new THREE.Vector3(0.05, -0.18, -1).normalize();
const face = new THREE.Quaternion().setFromUnitVectors(AXIS_Z, camDir.clone().negate());
const n = new THREE.Vector3();

for (const t of [22, 25, 26.5, 27.4, 27.9]) {
  const align = smoothstep(TL.CONVERGE_END - 3.4, TL.BLAST - 0.15, t);
  const angles = bases.map((b, i) => {
    const q = b.clone().slerp(face, align).multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_Z, i * 1.3));
    n.copy(AXIS_Z).applyQuaternion(q).normalize();
    return (Math.acos(Math.min(1, Math.abs(n.dot(camDir)))) * 180) / Math.PI;
  });
  const spread = Math.max(...angles) - Math.min(...angles);
  console.log(
    `t=${t.toFixed(1)}  align=${align.toFixed(2)}  отклонение от оси камеры: ` +
      `${angles.map((a) => a.toFixed(1)).join(" / ")}°  разброс ${spread.toFixed(1)}°`
  );
}
