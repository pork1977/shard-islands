import { shaderMaterial } from "@react-three/drei";
import * as THREE from "three";

// Daylight sky, replacing the starfield nebula. The brief moved from a
// "space" look to falling into a beautiful world, and a starfield reads as
// space no matter what colour the ground is.
export const SkyMaterial = shaderMaterial(
  {
    uTime: 0,
    uReveal: 0,
    uZenith: new THREE.Color("#2f7fd4"),
    uHorizon: new THREE.Color("#cfe6f5"),
    uSunColor: new THREE.Color("#fff2cf"),
    uCloud: new THREE.Color("#ffffff"),
    uSunDir: new THREE.Vector3(-0.45, 0.3, 0.84).normalize(),
  },
  /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  /* glsl */ `
    uniform float uTime;
    uniform float uReveal;
    uniform vec3 uZenith;
    uniform vec3 uHorizon;
    uniform vec3 uSunColor;
    uniform vec3 uCloud;
    uniform vec3 uSunDir;

    varying vec3 vDir;

    float hash(vec3 p) {
      return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
    }

    float noise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
        f.z
      );
    }

    float fbm(vec3 p) {
      return noise(p) * 0.55 + noise(p * 2.2 + 3.1) * 0.3 + noise(p * 4.6 - 1.4) * 0.15;
    }

    void main() {
      vec3 d = normalize(vDir);

      // +Z is up in this world (the glass floor was looked down through -Z)
      float up = clamp(d.z * 0.5 + 0.5, 0.0, 1.0);
      vec3 col = mix(uHorizon, uZenith, pow(up, 0.8));

      // sun and its haze
      float sun = max(dot(d, normalize(uSunDir)), 0.0);
      col += uSunColor * pow(sun, 900.0) * 3.0;
      col += uSunColor * pow(sun, 6.0) * 0.28;

      // high cloud, thickening toward the horizon the way real cloud decks do
      vec3 cp = d / max(abs(d.z) + 0.22, 0.16);
      float c = fbm(cp * 1.5 + vec3(uTime * 0.008, uTime * 0.005, 0.0));
      float cover = smoothstep(0.48, 0.78, c) * smoothstep(0.02, 0.35, d.z);
      col = mix(col, uCloud * (0.85 + sun * 0.3), cover * 0.85);

      // below the horizon fades into the aerial haze the land sits in
      col = mix(uHorizon * 0.92, col, smoothstep(-0.25, 0.06, d.z));

      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum) * 0.55, col, 0.35 + 0.65 * uReveal);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
);
