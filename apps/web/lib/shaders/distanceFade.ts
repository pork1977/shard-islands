import * as THREE from "three";

/**
 * Shrinks an instanced mesh's instances to nothing beyond a given range.
 *
 * Ground cover is the reason this exists. Nineteen thousand tufts of grass
 * are the right density to fly through at ten metres and completely wrong to
 * look down on from two hundred, where each one is smaller than a pixel and
 * the whole map crawls with aliasing. Culling them by distance costs one
 * subtraction per vertex and removes both the shimmer and the overdraw.
 *
 * The blade collapses toward its own base rather than fading its alpha,
 * which keeps the material opaque — a transparent one would have to be
 * depth-sorted against every other blade every frame.
 */
export function applyDistanceFade(
  material: THREE.Material,
  near: number,
  far: number,
) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uFadeNear;
         uniform float uFadeFar;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         {
           #ifdef USE_INSTANCING
             vec3 instOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
           #else
             vec3 instOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
           #endif
           float fadeDist = distance(cameraPosition, instOrigin);
           transformed *= 1.0 - smoothstep(uFadeNear, uFadeFar, fadeDist);
         }`,
      );

    shader.uniforms.uFadeNear = { value: near };
    shader.uniforms.uFadeFar = { value: far };
  };
  material.needsUpdate = true;
}
