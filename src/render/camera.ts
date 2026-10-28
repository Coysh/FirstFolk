import * as THREE from 'three';
import type { HeightField } from './terrain';

/**
 * Angled strategy camera: orbits a ground target at a fixed pitch. Pan, zoom and yaw are
 * smoothed; Q/E snap the yaw in 90° steps, touch twist rotates freely.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly target = new THREE.Vector3();
  private goal = new THREE.Vector3();
  yaw = 0;
  goalYaw = 0;
  distance = 20;
  goalDistance = 20;
  pitch = 0.86;
  readonly minDistance = 7;
  readonly maxDistance = 60;

  constructor(private hf: HeightField, private mapSize: number) {
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.5, 400);
  }

  lookAt(x: number, z: number, immediate = false): void {
    this.goal.set(x, 0, z);
    this.clamp();
    if (immediate) {
      this.target.copy(this.goal);
      this.target.y = this.hf.at(x, z);
    }
  }

  /** Move by screen-aligned world deltas (right, forward). */
  pan(right: number, forward: number): void {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.goal.x += right * cos - forward * sin;
    this.goal.z += -right * sin - forward * cos;
    this.clamp();
  }

  /** Pan instantly (used while dragging so the ground sticks to the finger). */
  panImmediate(right: number, forward: number): void {
    this.pan(right, forward);
    this.target.x = this.goal.x;
    this.target.z = this.goal.z;
  }

  zoom(factor: number): void {
    this.goalDistance = THREE.MathUtils.clamp(this.goalDistance * factor, this.minDistance, this.maxDistance);
  }

  rotate(delta: number, immediate = false): void {
    this.goalYaw += delta;
    if (immediate) this.yaw = this.goalYaw;
  }

  snapRotate(dir: 1 | -1): void {
    const step = Math.PI / 2;
    this.goalYaw = Math.round(this.goalYaw / step) * step + dir * step;
  }

  /** World units per screen pixel at the target, for drag panning. */
  unitsPerPixel(viewportHeight: number): number {
    return (2 * this.distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / viewportHeight;
  }

  private clamp(): void {
    const m = 6;
    this.goal.x = THREE.MathUtils.clamp(this.goal.x, m, this.mapSize - m);
    this.goal.z = THREE.MathUtils.clamp(this.goal.z, m, this.mapSize - m);
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 10);
    this.target.x += (this.goal.x - this.target.x) * k;
    this.target.z += (this.goal.z - this.target.z) * k;
    const groundY = this.hf.at(this.target.x, this.target.z);
    this.target.y += (Math.max(groundY, this.hf.waterY) - this.target.y) * (1 - Math.exp(-dt * 4));
    this.yaw += (this.goalYaw - this.yaw) * (1 - Math.exp(-dt * 9));
    this.distance += (this.goalDistance - this.distance) * (1 - Math.exp(-dt * 9));

    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.distance,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * cp * this.distance,
    );
    this.camera.lookAt(this.target);
  }
}
