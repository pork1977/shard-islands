import { shaderMaterial } from "@react-three/drei";
import * as THREE from "three";

// Frosted architectural glass, viewed dead-on: since a frontal plane can't sell
// a real view-angle fresnel, this fakes the "heavy glass" read with a radial
// vignette (brighter/cooler toward the edges), a slow animated noise-based
// frost distortion, and a diagonal specular sweep for idle shimmer.
export const GlassFloorMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color("#0b1220"),
    uRimColor: new THREE.Color("#8fd8ff"),
  },
  /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    uniform vec3 uRimColor;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float dist = length(centered * vec2(1.6, 1.0));

      // radial vignette standing in for a frontal "fresnel" read
      float rim = smoothstep(0.25, 0.75, dist);

      // slow drifting frost distortion
      float frost = noise(vUv * 6.0 + vec2(uTime * 0.03, uTime * 0.02));
      frost += 0.5 * noise(vUv * 14.0 - vec2(uTime * 0.015, 0.0));
      frost *= 0.06;

      // diagonal specular sweep, idle shimmer
      float sweepPos = fract(uTime * 0.06);
      float sweep = smoothstep(0.08, 0.0, abs((vUv.x + vUv.y) * 0.5 - sweepPos));

      vec3 base = uColor + frost;
      vec3 col = mix(base, uRimColor, rim * 0.5);
      col += uRimColor * sweep * 0.35;

      float alpha = 0.9 - rim * 0.15;
      gl_FragColor = vec4(col, alpha);
    }
  `,
);
