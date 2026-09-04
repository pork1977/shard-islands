import { shaderMaterial } from "@react-three/drei";
import * as THREE from "three";

// The sky of the world below: layered violet, magenta and teal cloud rather
// than the flat near-black it replaces. This is the single biggest source of
// colour in the scene — with a black background every island reads as a grey
// silhouette no matter how its own veins are tinted.
//
// uReveal ramps as the camera falls, so the colour BLOOMS during the plunge
// instead of simply being there when you arrive.
export const NebulaMaterial = shaderMaterial(
  {
    uTime: 0,
    uReveal: 0,
    // Rich and saturated but DARK. A bright sky turns every island into a
    // black silhouette and leaves the neon veins with nothing to glow
    // against — the colour has to sit below the glow, not above it.
    uDeep: new THREE.Color("#05030f"),
    uViolet: new THREE.Color("#2b1264"),
    uMagenta: new THREE.Color("#63114a"),
    uTeal: new THREE.Color("#0a5464"),
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
    uniform vec3 uDeep;
    uniform vec3 uViolet;
    uniform vec3 uMagenta;
    uniform vec3 uTeal;

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

    // three octaves only — this covers the whole screen every frame and the
    // mobile budget will not absorb a deep fbm here
    float fbm(vec3 p) {
      float v = noise(p) * 0.55;
      v += noise(p * 2.3 + 4.1) * 0.3;
      v += noise(p * 5.1 - 2.7) * 0.15;
      return v;
    }

    void main() {
      vec3 d = vDir;
      float drift = uTime * 0.012;

      float cloudA = fbm(d * 2.2 + vec3(drift, 0.0, 0.0));
      float cloudB = fbm(d * 3.7 + vec3(0.0, -drift, 1.7));
      float cloudC = fbm(d * 1.4 + vec3(-drift * 0.6, 2.3, 0.0));

      vec3 col = uDeep;
      col = mix(col, uViolet, smoothstep(0.35, 0.85, cloudA) * 0.85);
      col = mix(col, uMagenta, smoothstep(0.5, 0.95, cloudB) * 0.5);
      col = mix(col, uTeal, smoothstep(0.45, 0.9, cloudC) * 0.45);

      // brighter toward the core far below, so the depths glow
      float down = smoothstep(0.2, -0.9, d.z);
      col += uTeal * down * 0.18;

      // scattered stars in the gaps between cloud
      float star = pow(hash(floor(d * 260.0)), 220.0);
      col += vec3(0.8, 0.9, 1.0) * star * (1.0 - cloudA) * 2.0;

      // the world's colour blooms as the player falls into it
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum) * 0.35, col, 0.25 + 0.75 * uReveal);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
);
