import { shaderMaterial } from "@react-three/drei";
import * as THREE from "three";

// Daylight sky, replacing the starfield nebula. The brief moved from a
// "space" look to falling into a beautiful world, and a starfield reads as
// space no matter what colour the ground is.
export const SkyMaterial = shaderMaterial(
  {
    uTime: 0,
    uReveal: 0,
    // Dusk. The trail is the game's scoreboard, and a glowing ribbon needs
    // a dim sky to read against — under midday blue it washed out to white.
    uZenith: new THREE.Color("#131a4a"),
    uHorizon: new THREE.Color("#e8794a"),
    uSunColor: new THREE.Color("#ffb066"),
    uCloud: new THREE.Color("#8a6f9c"),
    // sun sitting low, so the light rakes across the land
    uSunDir: new THREE.Vector3(-0.72, 0.28, 0.16).normalize(),
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

      // +Z is up in this world (the glass floor was looked down through -Z).
      // The warm band is kept tight to the horizon — spread across the whole
      // dome it just reads as an orange ceiling rather than a sunset.
      float horizonBand = smoothstep(0.42, -0.05, d.z);
      vec3 col = mix(uZenith, uHorizon, horizonBand);

      // sun and its haze
      float sun = max(dot(d, normalize(uSunDir)), 0.0);
      col += uSunColor * pow(sun, 900.0) * 3.0;
      col += uSunColor * pow(sun, 6.0) * 0.28;

      // high cloud, thickening toward the horizon the way real cloud decks do
      vec3 cp = d / max(abs(d.z) + 0.22, 0.16);
      float c = fbm(cp * 1.5 + vec3(uTime * 0.008, uTime * 0.005, 0.0));
      float cover = smoothstep(0.48, 0.78, c) * smoothstep(0.02, 0.35, d.z);
      col = mix(col, uCloud * (0.85 + sun * 0.3), cover * 0.85);

      // stars, only where the sky is dark and clear of cloud
      float star = pow(hash(floor(d * 340.0)), 260.0);
      col += vec3(0.85, 0.9, 1.0) * star * smoothstep(0.25, 0.7, d.z) * (1.0 - cover) * 2.2;

      // below the horizon fades into the aerial haze the land sits in
      col = mix(uHorizon * 0.42, col, smoothstep(-0.25, 0.06, d.z));

      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum) * 0.55, col, 0.35 + 0.65 * uReveal);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
);
