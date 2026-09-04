import { shaderMaterial } from "@react-three/drei";
import * as THREE from "three";

// Lush land seen from the air: shorelines, grassland, forested slopes, bare
// rock and snow on the peaks. Height and steepness drive the palette, which
// is what makes terrain read as geography rather than as one tinted mass.
export const TerrainMaterial = shaderMaterial(
  {
    uTime: 0,
    uReveal: 0,
    uSand: new THREE.Color("#e0cf9c"),
    uGrass: new THREE.Color("#5aa83f"),
    uDeepGrass: new THREE.Color("#24622b"),
    uRock: new THREE.Color("#6f6455"),
    uSnow: new THREE.Color("#f2f7fa"),
    uFogColor: new THREE.Color("#a9c9e0"),
    uMaxHeight: 78,
    uWaterHeight: 9,
  },
  /* glsl */ `
    varying vec3 vNormalW;
    varying vec3 vPos;
    varying float vDepth;

    void main() {
      vPos = position;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vec4 world = modelMatrix * vec4(position, 1.0);
      vec4 mv = viewMatrix * world;
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `,
  /* glsl */ `
    uniform float uTime;
    uniform float uReveal;
    uniform vec3 uSand;
    uniform vec3 uGrass;
    uniform vec3 uDeepGrass;
    uniform vec3 uRock;
    uniform vec3 uSnow;
    uniform vec3 uFogColor;
    uniform float uMaxHeight;
    uniform float uWaterHeight;

    varying vec3 vNormalW;
    varying vec3 vPos;
    varying float vDepth;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
      );
    }

    void main() {
      vec3 N = normalize(vNormalW);
      // sun high and to one side, warm
      vec3 L = normalize(vec3(-0.45, 0.3, 0.84));
      float lambert = max(dot(N, L), 0.0);
      float sky = 0.35 + 0.65 * max(N.z, 0.0); // ambient from the sky above

      float h = vPos.z;
      // flat ground is grass, steep faces are exposed rock
      float steep = 1.0 - clamp(N.z, 0.0, 1.0);

      // Patchiness so the greens are not a flat wash. NB "patch" is a
      // reserved word in GLSL and will not compile as a variable name.
      float mottle = noise(vPos.xy * 0.02) * 0.5 + noise(vPos.xy * 0.09) * 0.5;

      vec3 col = mix(uGrass, uDeepGrass, mottle);
      // shoreline sand just above the waterline
      col = mix(uSand, col, smoothstep(uWaterHeight - 0.5, uWaterHeight + 6.0, h));
      // rock as it rises
      col = mix(col, uRock, smoothstep(0.42, 0.72, h / uMaxHeight));
      // exposed rock wherever it is too steep to hold soil
      col = mix(col, uRock, smoothstep(0.45, 0.8, steep));
      // snow caps
      col = mix(col, uSnow, smoothstep(0.78, 0.95, h / uMaxHeight) * (1.0 - steep * 0.5));

      col *= 0.34 * sky + lambert * 1.15;

      // Aerial perspective sells altitude, but too much of it bleaches the
      // whole map to pale grey-green — it needs to bite only in the far
      // distance, and never fully.
      float fog = 1.0 - exp(-vDepth * 0.00085);
      col = mix(col, uFogColor, clamp(fog, 0.0, 0.68));

      // the land's colour comes up as the player falls into the world
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum) * 0.5, col, 0.3 + 0.7 * uReveal);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
);
