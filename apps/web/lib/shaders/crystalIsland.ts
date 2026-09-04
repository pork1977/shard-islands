import { shaderMaterial } from "@react-three/drei";
import * as THREE from "three";

// Dark crystalline rock threaded with glowing neon veins.
//
// Hand-lit rather than using MeshStandardMaterial: there is no HDRI in the
// project yet, and a PBR material with no environment to reflect looks flat
// and dead. A single key direction plus a fresnel rim gives the facets their
// edges, and the veins supply the light the world design asks for.
export const CrystalIslandMaterial = shaderMaterial(
  {
    uTime: 0,
    uReveal: 0,
    uBase: new THREE.Color("#141033"),
    uVein: new THREE.Color("#4fe0ff"),
    uRim: new THREE.Color("#b98cff"),
    // fog toward the nebula's violet rather than toward black, so distance
    // shifts hue instead of just draining the colour away
    uFogColor: new THREE.Color("#1a0d3a"),
    uSeed: 0,
  },
  /* glsl */ `
    attribute vec3 aBary;

    varying vec3 vNormalW;
    varying vec3 vLocal;
    varying vec3 vViewDir;
    varying vec3 vBary;
    varying float vDepth;

    void main() {
      vLocal = position;
      vBary = aBary;
      vNormalW = normalize(mat3(modelMatrix) * normal);

      vec4 world = modelMatrix * vec4(position, 1.0);
      vViewDir = normalize(cameraPosition - world.xyz);

      vec4 mv = viewMatrix * world;
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `,
  /* glsl */ `
    uniform float uTime;
    uniform float uReveal;
    uniform vec3 uBase;
    uniform vec3 uVein;
    uniform vec3 uRim;
    uniform vec3 uFogColor;
    uniform float uSeed;

    varying vec3 vNormalW;
    varying vec3 vLocal;
    varying vec3 vViewDir;
    varying vec3 vBary;
    varying float vDepth;

    float hash(vec3 p) {
      return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
    }

    float noise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float n000 = hash(i);
      float n100 = hash(i + vec3(1.0, 0.0, 0.0));
      float n010 = hash(i + vec3(0.0, 1.0, 0.0));
      float n110 = hash(i + vec3(1.0, 1.0, 0.0));
      float n001 = hash(i + vec3(0.0, 0.0, 1.0));
      float n101 = hash(i + vec3(1.0, 0.0, 1.0));
      float n011 = hash(i + vec3(0.0, 1.0, 1.0));
      float n111 = hash(i + vec3(1.0, 1.0, 1.0));
      return mix(
        mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
        mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
        f.z
      );
    }

    void main() {
      vec3 N = normalize(vNormalW);
      vec3 L = normalize(vec3(-0.4, 0.75, 0.5));

      float lambert = max(dot(N, L), 0.0);
      float wrap = max(dot(N, -L), 0.0) * 0.18; // faint bounce from below

      // brighter base so this reads as dark ROCK carrying light, rather than
      // a black silhouette that only exists where the veins are
      vec3 col = uBase * (0.4 + lambert * 1.0 + wrap);

      // Veins run along the facet edges rather than wandering across the
      // surface. Noise-driven veins came out as brain-coral blotches; light
      // seaming the actual cut faces is what reads as mineral.
      float edge = min(min(vBary.x, vBary.y), vBary.z);
      float seam = 1.0 - smoothstep(0.0, fwidth(edge) * 1.3, edge);

      // Only a minority of seams carry light. Lighting them all draws the
      // mesh topology and the island reads as a wireframe geodesic dome
      // rather than as rock with mineral running through it.
      float lit = noise(vLocal * 2.6 + uSeed);
      seam *= smoothstep(0.62, 0.88, lit);

      // veins light up as the world unfolds, rather than being fully lit from
      // the moment the pane breaks
      float pulse = 0.7 + 0.3 * sin(uTime * 1.1 + uSeed * 6.0 + vLocal.y * 2.0);
      col += uVein * seam * pulse * (0.5 + 1.6 * uReveal);

      // fresnel rim picks out facet edges — kept restrained, since a strong
      // rim over the whole silhouette makes solid rock look like jellyfish
      float fres = pow(1.0 - max(dot(N, normalize(vViewDir)), 0.0), 3.5);
      col += uRim * fres * 0.22;

      // depth haze, so the island field reads as receding rather than as a
      // flat wall of objects all at the same distance
      float fog = 1.0 - exp(-vDepth * 0.012);
      col = mix(col, uFogColor, clamp(fog, 0.0, 0.92));

      gl_FragColor = vec4(col, 1.0);
    }
  `,
);
