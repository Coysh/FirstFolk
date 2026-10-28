import * as THREE from 'three';

/** Shared time uniform for all wind-swayed materials. */
export const windTime = { value: 0 };

/** 0 by day, 1 at night: windows, lanterns and fires glow with it (see withSway). */
export const nightLevel = { value: 0 };

/**
 * Patch a standard material for the Blender art's per-vertex `sway` weight.
 *   0..1   cloth: flutters in the wind (0 at the pole, 1 at the free edge).
 *   2..3   light: glows (a window, a lantern, a flame), the fraction making a flame tip dance.
 * Glow is a little self-lit by day and a lot at night (`nightLevel`).
 */
export function withSway(mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTime;
    shader.uniforms.uNight = nightLevel;
    shader.vertexShader =
      'uniform float uWindTime;\nattribute float sway;\nvarying float vGlow;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float swGlow = step(1.5, sway);
        float swAmt = sway - swGlow * 2.0;
        vGlow = swGlow;
        float swPh = modelMatrix[3].x * 0.37 + modelMatrix[3].z * 0.29;
        float swT = uWindTime * mix(4.4, 12.0, swGlow) + swPh + position.x * 6.0;
        transformed.z += sin(swT) * swAmt * mix(0.055, 0.015, swGlow);
        transformed.y += cos(swT * 0.9) * swAmt * mix(0.02, 0.035, swGlow);
        transformed.x += sin(uWindTime * 2.1 + swPh) * swAmt * 0.025;`,
      );
    shader.fragmentShader =
      'uniform float uNight;\nvarying float vGlow;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vGlow * (0.15 + 1.7 * uNight);`,
      );
  };
  mat.customProgramCacheKey = () => 'sway-glow';
  return mat;
}

/**
 * Patch a standard material so geometry sways in the breeze, more towards the top.
 * Works for instanced and regular meshes; the phase varies per instance position.
 */
export function withWind(mat: THREE.MeshStandardMaterial, strength = 0.05, pivotY = 0.3): THREE.MeshStandardMaterial {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTime;
    shader.vertexShader =
      'uniform float uWindTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float windH = max(position.y - ${pivotY.toFixed(3)}, 0.0);
        #ifdef USE_INSTANCING
          vec3 windP = instanceMatrix[3].xyz;
        #else
          vec3 windP = vec3(modelMatrix[3].x, 0.0, modelMatrix[3].z);
        #endif
        float windPh = windP.x * 0.37 + windP.z * 0.29;
        float windS = sin(uWindTime * 1.5 + windPh) * 0.65 + sin(uWindTime * 2.9 + windPh * 1.7) * 0.35;
        transformed.x += windS * windH * ${strength.toFixed(3)};
        transformed.z += cos(uWindTime * 1.2 + windPh) * windH * ${(strength * 0.6).toFixed(3)};`,
      );
  };
  mat.customProgramCacheKey = () => `wind-${strength}-${pivotY}`;
  return mat;
}
