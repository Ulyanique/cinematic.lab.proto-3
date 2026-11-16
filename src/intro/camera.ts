// ─────────────────────────────────────────────────────────────
//  Camera rig: one continuous move from the corridor to the
//  orbit, the dive, the detonation and the final logo frame.
//
//  Everything is driven by monotone tracks, so velocity is
//  continuous — the camera never "cuts", it accelerates.
// ─────────────────────────────────────────────────────────────
import * as THREE from "three";
import { clamp, groundHeight, makeTrack, shakeNoise, smax, smoothstep } from "./math";

export interface CameraPose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  roll: number;
}

export interface Obstacle {
  x: number;
  z: number;
  r: number;
}

export class CameraRig {
  readonly pos = new THREE.Vector3();
  readonly target = new THREE.Vector3();
  fov = 40;
  roll = 0;

  private trk = {
    // orbital radius
    R: makeTrack([
      [0, 150], [2, 142], [4, 120], [6, 96], [8, 76], [9.5, 56], [10.7, 42], [11.5, 34],
      [12.4, 27], [13.5, 22.5], [15, 20.5], [18, 19.6], [21, 20.2], [23, 19],
      [25, 15], [26.3, 11], [27.3, 8.6], [28, 8.9],
      [28.15, 12.5], [29, 18.6], [30.2, 20], [32, 18.2], [34.5, 17.2], [60, 17.2],
    ]),
    // yaw around the plaza
    phi: makeTrack([
      // dead straight down the corridor, through the middle of the gate…
      [0, 0.1], [2, 0.06], [5, 0.0], [8, 0.0], [10.7, -0.01], [12.4, -0.05],
      // …then the orbit opens up, once the camera is safely inside the ring
      [13.5, -0.25], [15, -0.7], [17, -1.5], [19, -2.45], [21, -3.4], [23, -4.3],
      [24.5, -4.9], [26, -5.45], [27.3, -5.8], [28, -5.9], [28.5, -5.96],
      [30, -6.1], [32, -6.2], [34.5, -6.25], [60, -6.26],
    ]),
    // height above the plaza
    y: makeTrack([
      [0, 16], [2.5, 12.5], [5, 9.2], [7.5, 7.2], [9.5, 7.6], [11, 10], [12.5, 13.5],
      [14, 15.5], [16, 11.5], [18.5, 9.5], [21, 10.5], [23, 12.5], [25, 13],
      [26.5, 12.4], [27.5, 12.6], [28, 12.5], [28.2, 14], [29.2, 13.2],
      [30.4, 12.6], [32, 12.2], [34.5, 12.1], [60, 12.1],
    ]),
    // focal length: long lens for the hero beats, wide for the flight
    fov: makeTrack([
      [0, 33], [4, 42], [7, 50], [9.5, 55], [11.5, 52], [13.5, 46], [16, 39],
      [19, 36], [22, 38], [24, 44], [26, 52], [27.3, 58], [27.9, 58],
      [28.06, 74], [28.6, 52], [29.6, 40], [31, 33], [34.5, 30], [60, 30],
    ]),
    // lateral lead on the target — "looking into the turn"
    lead: makeTrack([
      // during the orbit the aim point slides along the ring ahead of the
      // camera, so the crystals stream past in the mid-ground instead of
      // sitting behind it — then the aim swings back to the core for the blast
      [0, 0], [6, 0], [8, 2], [10, 3.5], [12, 5], [14, 15], [16, 23], [18, 27],
      [20, 28], [21.5, 25], [23, 15], [25, 5.5], [26.5, 1.5], [28, 0], [60, 0],
    ]),
    // vertical aim point
    ty: makeTrack([
      [0, 13], [5, 12.5], [9, 11], [12, 10], [15, 9.6], [18, 10.4], [21, 12],
      [24, 12.2], [26.5, 12], [28, 12], [28.2, 12.3], [30, 11.9], [32, 11.8],
      [34.5, 11.75], [60, 11.75],
    ]),
    // corridor S-curve
    lateral: makeTrack([
      [0, 3.5], [3, -4.5], [6, 2.5], [9, -1.5], [11, 0.5], [13, 0], [60, 0],
    ]),
    // handheld / engine shake amplitude
    shake: makeTrack([
      [0, 0.01], [3, 0.03], [8, 0.02], [12, 0.02], [18, 0.03], [22, 0.05],
      [24, 0.12], [26, 0.32], [27.4, 1.0], [28, 1.1], [28.25, 2.3], [29, 0.65],
      [30, 0.16], [31, 0.04], [60, 0],
    ]),
  };

  private obstacles: Obstacle[];

  constructor(obstacles: Obstacle[] = []) {
    this.obstacles = obstacles;
  }

  setObstacles(list: Obstacle[]) {
    this.obstacles = list;
  }

  /** Angular velocity of the orbit, used for banking. */
  private omega(t: number) {
    const h = 0.12;
    return (this.trk.phi(t + h) - this.trk.phi(t - h)) / (2 * h);
  }

  sample(t: number): CameraPose {
    const phi = this.trk.phi(t);
    const R = this.trk.R(t);
    const lateral = this.trk.lateral(t);

    let x = R * Math.sin(phi) + lateral * Math.cos(phi);
    let z = R * Math.cos(phi) - lateral * Math.sin(phi);

    // keep the camera out of the crystals (defensive, never visible)
    for (const o of this.obstacles) {
      const dx = x - o.x;
      const dz = z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < o.r && d > 0.0001) {
        x = o.x + (dx / d) * o.r;
        z = o.z + (dz / d) * o.r;
      }
    }

    const sh = this.trk.shake(t);
    const sx = shakeNoise(t, 1.7);
    const sy = shakeNoise(t, 4.1);
    const sz = shakeNoise(t, 8.9);

    x += sx * sh * 0.24;
    z += sz * sh * 0.24;

    const gy = groundHeight(x, z);
    let y = smax(this.trk.y(t), gy + 2.6, 1.8) + sy * sh * 0.22;
    y = Math.max(y, gy + 1.8);

    this.pos.set(x, y, z);

    // aim: a point on the plaza, led tangentially into the direction of travel
    const lead = this.trk.lead(t);
    const tx = -Math.cos(phi) * lead + sx * sh * 0.12;
    const tz = Math.sin(phi) * lead + sz * sh * 0.12;
    this.target.set(tx, this.trk.ty(t) + sy * sh * 0.1, tz);

    this.fov = this.trk.fov(t);
    // bank into the turn + a slow drift + shake
    const bank = clamp(this.omega(t) * 0.11, -0.42, 0.42);
    this.roll = bank + Math.sin(t * 0.31) * 0.012 - sx * sh * 0.02;
    // a tiny bit of roll is introduced while the corridor walls pass by
    this.roll += smoothstep(2, 6, t) * (1 - smoothstep(8, 12, t)) * -0.03;

    return { pos: this.pos, target: this.target, fov: this.fov, roll: this.roll };
  }
}
