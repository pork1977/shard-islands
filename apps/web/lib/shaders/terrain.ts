import { shaderMaterial } from "@react-three/drei";
import * as THREE from "three";

// The land below. Height drives the palette — deep glowing basins through
// mid slopes to pale crystalline crests — so the map reads as terrain with
// geography rather than as one flat-shaded mass.
export const TerrainMaterial = shaderMaterial(
  {
    uTime: 0,
    uReveal: 0,
    uLow: new THREE.Color("#2a0f4d"),
    uMid: new THREE.Color("#1b2a63"),
    uHigh: new THREE.Color("#8fa8e8"),
    uGlow: new THREE.Color("#ff4fb0"),
    uFogColor: new THREE.Color("#1a0d3a"),
    uMaxHeight: 62,
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
    uniform vec3 uLow;
    uniform vec3 uMid;
    uniform vec3 uHigh;
    uniform vec3 uGlow;
    uniform vec3 uFogColor;
    uniform float uMaxHeight;

    varying vec3 vNormalW;
    varying vec3 vPos;
    varying float vDepth;

    void main() {
      vec3 N = normalize(vNormalW);
      vec3 L = normalize(vec3(-0.4, 0.35, 0.85));
      float lambert = max(dot(N, L), 0.0);

      float h = clamp(vPos.z / uMaxHeight, -0.3, 1.0);

      vec3 col = mix(uLow, uMid, smoothstep(-0.1, 0.35, h));
      col = mix(col, uHigh, smoothstep(0.45, 0.95, h));
      col *= 0.35 + lambert * 0.95;

      // energy pooling in the basins, brightest at the lowest ground
      float basin = smoothstep(0.12, -0.25, h);
      float shimmer = 0.75 + 0.25 * sin(uTime * 0.7 + vPos.x * 0.05 + vPos.y * 0.04);
      col += uGlow * basin * shimmer * (0.35 + 0.9 * uReveal);

      // crests catch the light
      float crest = smoothstep(0.7, 1.0, h) * pow(max(dot(N, L), 0.0), 3.0);
      col += uHigh * crest * 0.5;

      float fog = 1.0 - exp(-vDepth * 0.0075);
      col = mix(col, uFogColor, clamp(fog, 0.0, 0.95));

      gl_FragColor = vec4(col, 1.0);
    }
  `,
);
