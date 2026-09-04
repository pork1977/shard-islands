import * as THREE from "three";

/**
 * Adds windows and doors to the instanced building material.
 *
 * Done by patching a standard lit material rather than by texturing, for two
 * reasons: a box's UVs are 0..1 per face, so a window texture would stretch
 * with the building and give a tower and a cottage the same number of
 * floors; and patching keeps instancing, lighting and per-instance colour
 * working for free.
 *
 * The instance's scale is recovered from its matrix so the pattern can be
 * laid out in METRES — that is what keeps every window the same real size
 * across buildings of wildly different dimensions.
 */
export function applyBuildingWindows(material: THREE.Material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec3 vBuildingPos;
         varying vec3 vBuildingNormal;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vec3 instScale = vec3(1.0);
         #ifdef USE_INSTANCING
           instScale = vec3(
             length(instanceMatrix[0].xyz),
             length(instanceMatrix[1].xyz),
             length(instanceMatrix[2].xyz)
           );
         #endif
         vBuildingPos = position * instScale;
         vBuildingNormal = normal;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec3 vBuildingPos;
         varying vec3 vBuildingNormal;

         float winHash(vec2 p) {
           return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
         }`,
      )
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
         {
           vec3 bn = normalize(vBuildingNormal);
           // roof and underside get no glazing
           float wall = 1.0 - step(0.5, abs(bn.z));

           // run the grid along whichever horizontal axis this wall faces
           float across = abs(bn.x) > abs(bn.y) ? vBuildingPos.y : vBuildingPos.x;
           float upPos = vBuildingPos.z;

           float floorH = 3.4;
           float bayW = 3.2;
           vec2 cell = vec2(floor(across / bayW), floor(upPos / floorH));
           vec2 f = vec2(
             fract(across / bayW),
             fract(upPos / floorH)
           );

           // window pane within the bay
           float paneX = step(0.22, f.x) * step(f.x, 0.78);
           float paneY = step(0.30, f.y) * step(f.y, 0.80);
           float pane = paneX * paneY * wall;

           // ground floor becomes a doorway instead of a window
           float groundFloor = 1.0 - step(-0.5 * vBuildingPos.z, 0.0);
           float isGround = step(upPos, floorH * 0.75 - abs(vBuildingPos.z) * 0.0);

           float lit = winHash(cell + 3.1);
           // most panes dark glass, a scattering warmly lit
           vec3 darkGlass = vec3(0.16, 0.20, 0.26);
           vec3 warm = vec3(1.0, 0.92, 0.66);
           vec3 cool = vec3(0.88, 0.95, 1.0);
           vec3 glass = mix(darkGlass, mix(warm, cool, winHash(cell + 8.4)), step(0.62, lit));

           gl_FragColor.rgb = mix(gl_FragColor.rgb, glass, pane * 0.85);
           // lit panes glow a little so they read at distance
           gl_FragColor.rgb += warm * pane * step(0.62, lit) * 0.35;
         }`,
      );
  };
  material.needsUpdate = true;
}
