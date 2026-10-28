import * as THREE from 'three';

/** Shared time uniform for all wind-swayed materials. */
export const windTime = { value: 0 };

/**
 * Patch a standard material so flags and pennants flutter. The per-vertex `sway` attribute
 * (0 at the pole, 1 at the free edge; painted in Blender) scales the motion, so only cloth moves.
 */
export function withSway(mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTime;
    shader.vertexShader =
      'uniform float uWindTime;\nattribute float sway;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float swPh = modelMatrix[3].x * 0.37 + modelMatrix[3].z * 0.29;
        float swT = uWindTime * 4.4 + swPh + position.x * 6.0;
        transformed.z += sin(swT) * sway * 0.055;
        transformed.y += cos(swT * 0.9) * sway * 0.02;
        transformed.x += sin(uWindTime * 2.1 + swPh) * sway * 0.025;`,
      );
  };
  mat.customProgramCacheKey = () => 'sway';
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
