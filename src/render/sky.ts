import * as THREE from 'three';
import { ModelBuilder, ico } from './modelBuilder';

export const SKY = {
  top: new THREE.Color(0x7fb6e0),
  horizon: new THREE.Color(0xf4e3c3),
  sunDir: new THREE.Vector3(-0.5, 0.75, 0.42).normalize(),
};

/** Gradient sky dome with a soft sun glow, plus drifting low-poly clouds. Follows the camera. */
export class Sky {
  readonly group = new THREE.Group();
  private dome: THREE.Mesh;
  private top = new THREE.Color().copy(SKY.top);
  private horizon = new THREE.Color().copy(SKY.horizon);
  private clouds: { mesh: THREE.Mesh; speed: number }[] = [];

  constructor(private mapSize: number) {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: this.top },
        uHorizon: { value: this.horizon },
        uSun: { value: SKY.sunDir },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
          float s = max(dot(normalize(vDir), normalize(uSun)), 0.0);
          col += vec3(1.0, 0.86, 0.6) * (pow(s, 24.0) * 0.55 + pow(s, 4.0) * 0.12);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(320, 24, 16), mat);
    this.dome.renderOrder = -1;
    this.group.add(this.dome);

    const cloudMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, transparent: true, opacity: 0.92 });
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 14; i++) {
      const b = new ModelBuilder();
      const puffs = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < puffs; k++) {
        const r = 1.6 + rnd() * 1.6;
        b.add(ico(r, 0), k % 2 ? 0xffffff : 0xf3f0ea, { pos: [k * 1.8 - puffs, rnd() * 0.8, (rnd() - 0.5) * 2], scale: [1.3, 0.7, 1] });
      }
      const mesh = new THREE.Mesh(b.build(), cloudMat);
      mesh.position.set(rnd() * (mapSize + 80) - 40, 26 + rnd() * 10, rnd() * (mapSize + 80) - 40);
      this.group.add(mesh);
      this.clouds.push({ mesh, speed: 0.6 + rnd() * 0.6 });
    }
  }

  /** The sky's colours for the time of day (the dome follows these; fog is set by the caller). */
  setColors(top: THREE.Color, horizon: THREE.Color): void {
    this.top.copy(top);
    this.horizon.copy(horizon);
  }

  update(dt: number, camera: THREE.Camera): void {
    this.dome.position.copy(camera.position);
    for (const c of this.clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > this.mapSize + 50) c.mesh.position.x = -50;
    }
  }
}
