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
 * across buildings of wildly different dimensions. Its position is recovered
 * too, as a per-building seed: without one, every building in the world lit
 * exactly the same windows, because the pattern was keyed on coordinates
 * local to each box.
 *
 * Returns a setter for the clock rather than the uniform itself. Some
 * windows flicker — a television, a candle, someone crossing in front of a
 * lamp — so a scene has to advance that clock every frame, and handing back
 * a function keeps the caller from having to reach into and mutate a value
 * it was given.
 */
export function applyBuildingWindows(
  material: THREE.Material,
): (seconds: number) => void {
  const uTime = { value: 0 };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec3 vBuildingPos;
         varying vec3 vBuildingNormal;
         varying float vBuildingSeed;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vec3 instScale = vec3(1.0);
         vec3 instPos = vec3(0.0);
         #ifdef USE_INSTANCING
           instScale = vec3(
             length(instanceMatrix[0].xyz),
             length(instanceMatrix[1].xyz),
             length(instanceMatrix[2].xyz)
           );
           instPos = instanceMatrix[3].xyz;
         #endif
         vBuildingPos = position * instScale;
         vBuildingNormal = normal;
         vBuildingSeed = fract(sin(dot(instPos.xy, vec2(12.9898, 78.233))) * 43758.5453);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;
         varying vec3 vBuildingPos;
         varying vec3 vBuildingNormal;
         varying float vBuildingSeed;

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

           // every hash is offset by the building's own seed, so two houses
           // side by side do not light the identical set of rooms
           vec2 key = cell + vBuildingSeed * 37.0;

           float lit = winHash(key + 3.1);
           float isLit = step(0.62, lit);

           // Roughly one occupied room in eight has something moving in it.
           // It was one in three, and a whole town doing it at once read as
           // a fault in the renderer rather than as life indoors — the point
           // is the odd window catching your eye, not a light show.
           //
           // Two motions overlaid: a slow wobble for firelight or a screen,
           // and occasional dropouts for someone passing between lamp and
           // glass. Both gentler than they were, and slower.
           float flickers = step(0.87, winHash(key + 5.5));
           float phase = winHash(key + 17.7);
           float t = uTime * (0.35 + phase * 0.9) + phase * 60.0;
           float wobble = 0.84 + 0.16 * sin(t * 3.1) * sin(t * 1.4 + 1.3);
           float step6 = floor(t * 1.5);
           float dropout = step(0.05, fract(sin(step6 * 12.9898 + phase * 78.233) * 43758.5453));
           float flicker = mix(1.0, wobble * mix(0.45, 1.0, dropout), flickers);

           float glow = isLit * flicker;

           // most panes dark glass, a scattering warmly lit
           vec3 darkGlass = vec3(0.16, 0.20, 0.26);
           vec3 warm = vec3(1.0, 0.92, 0.66);
           vec3 cool = vec3(0.88, 0.95, 1.0);
           vec3 glass = mix(darkGlass, mix(warm, cool, winHash(key + 8.4)), glow);

           gl_FragColor.rgb = mix(gl_FragColor.rgb, glass, pane * 0.85);
           // lit panes glow a little so they read at distance
           gl_FragColor.rgb += warm * pane * glow * 0.35;
         }`,
      );
  };
  material.needsUpdate = true;

  return (seconds: number) => {
    uTime.value = seconds;
  };
}
