import * as THREE from 'three';
import type { World } from '../sim/world';

/**
 * Fog of war and borders, drawn in the shaders of the terrain and everything on it.
 * One small RGBA texture with one texel per tile:
 * - R: explored by the player (unexplored land is dimmed and cooled),
 * - G: the player's territory,
 * - B: the rival's territory.
 * Linear filtering gives soft fog edges, and lets the terrain draw a crisp border band
 * wherever territory changes, with no extra geometry.
 */
export class FogOfWar {
  readonly texture: THREE.DataTexture;
  readonly uniforms = {
    uFowMap: { value: null as THREE.DataTexture | null },
    uFowSize: { value: 128 },
    /** 0..1: the border glows brighter while placing a building. */
    uBorderGlow: { value: 0 },
    uBorderColor: { value: new THREE.Color(0xfff1c4) },
    uRivalColor: { value: new THREE.Color(0xd9534f) },
    /** Fades the fog in (0 = everything visible, used by the title screen). */
    uFowStrength: { value: 1 },
    /** 0..1: winter frost on the land and everything growing on it. */
    uSnow: { value: 0 },
  };
  private data: Uint8Array;
  private fogVersion = -1;
  private territoryVersion = -1;

  constructor(private size: number) {
    this.data = new Uint8Array(size * size * 4);
    this.texture = new THREE.DataTexture(this.data, size, size, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
    this.uniforms.uFowMap.value = this.texture;
    this.uniforms.uFowSize.value = size;
  }

  update(world: World, player = 0): void {
    if (world.fogVersion === this.fogVersion && world.territoryVersion === this.territoryVersion) return;
    this.fogVersion = world.fogVersion;
    this.territoryVersion = world.territoryVersion;
    const bit = 1 << player;
    const d = this.data;
    for (let i = 0; i < this.size * this.size; i++) {
      const o = i * 4;
      const t = world.territory[i];
      d[o] = world.explored[i] & bit ? 255 : 0;
      d[o + 1] = t === player ? 255 : 0;
      d[o + 2] = t >= 0 && t !== player && world.explored[i] & bit ? 255 : 0;
      d[o + 3] = 255;
    }
    this.texture.needsUpdate = true;
  }

  /** Patch every material under an object (each material once). */
  applyAll(root: THREE.Object3D): void {
    root.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        if (this.patched.has(mat)) continue;
        this.patched.add(mat);
        this.apply(mat);
      }
    });
  }
  private patched = new WeakSet<THREE.Material>();

  /**
   * Patch a standard material to darken unexplored ground. With `border`, also tint the
   * territories and draw their edges (terrain only). Chains any existing onBeforeCompile.
   */
  apply<M extends THREE.Material>(mat: M, border = false): M {
    const prev = mat.onBeforeCompile;
    const prevKey = mat.customProgramCacheKey?.bind(mat);
    mat.onBeforeCompile = (shader, renderer) => {
      prev?.call(mat, shader, renderer);
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader =
        'varying vec2 vFowXZ;\n' +
        shader.vertexShader.replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vec4 fowP = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            fowP = instanceMatrix * fowP;
          #endif
          vFowXZ = (modelMatrix * fowP).xz;`,
        );
      shader.fragmentShader =
        `varying vec2 vFowXZ;
        uniform sampler2D uFowMap;
        uniform float uFowSize;
        uniform float uBorderGlow;
        uniform float uFowStrength;
        uniform float uSnow;
        uniform vec3 uBorderColor;
        uniform vec3 uRivalColor;\n` +
        shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `#include <opaque_fragment>
          {
            vec4 fow = texture2D(uFowMap, vFowXZ / uFowSize);
            ${
              border
                ? `float own = fow.g;
            float edge = 1.0 - smoothstep(0.0, 0.32, abs(own - 0.5));
            gl_FragColor.rgb *= 1.0 + own * 0.05;
            gl_FragColor.rgb = mix(gl_FragColor.rgb, uBorderColor, edge * (0.55 + 0.4 * uBorderGlow));
            float riv = fow.b;
            float redge = 1.0 - smoothstep(0.0, 0.32, abs(riv - 0.5));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(1.06, 0.9, 0.88), riv * 0.5);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, uRivalColor, redge * 0.7);`
                : ''
            }
            float lum = dot(gl_FragColor.rgb, vec3(0.3, 0.55, 0.15));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.86, 0.9, 0.98) * (0.55 + 0.6 * lum), uSnow * 0.62);
            float hidden = (1.0 - smoothstep(0.15, 0.85, fow.r)) * uFowStrength;
            vec3 dim = gl_FragColor.rgb * vec3(0.24, 0.27, 0.34) + vec3(0.02, 0.025, 0.04);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, dim, hidden);
          }`,
        );
    };
    mat.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}-fow${border ? 'b' : ''}`;
    mat.needsUpdate = true;
    return mat;
  }
}
