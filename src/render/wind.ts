import * as THREE from 'three';

/** Shared time uniform for all wind-swayed materials. */
export const windTime = { value: 0 };

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
