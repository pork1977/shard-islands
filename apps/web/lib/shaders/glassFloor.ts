import { shaderMaterial } from "@react-three/drei";
import * as THREE from "three";

// Frosted architectural glass, viewed dead-on. Previous version leaned on a
// radial vignette that read as "dark hole with a blue rim" rather than glass
// (and implied a void was already there before any click). This version stays
// pale/uniform like real ground glass, with fine sandblasted grain, subtle
// panel seams (sells "architectural pane" scale), and a soft moving specular
// glint for idle shimmer. Contrast for the handprint comes from a small local
// halo, not from darkening the whole floor.
export const GlassFloorMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color("#aebfc9"),
    uHighlight: new THREE.Color("#f4fbff"),
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
    uniform vec3 uHighlight;
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

    // multi-octave for a fine sandblasted grain rather than blocky bands
    float grain(vec2 p) {
      float n = 0.0;
      n += noise(p * 40.0) * 0.5;
      n += noise(p * 90.0 + 11.0) * 0.3;
      n += noise(p * 180.0 - 7.0) * 0.2;
      return n;
    }

    float panelGrid(vec2 uv) {
      vec2 g = fract(uv * vec2(5.0, 3.0));
      vec2 lineDist = min(g, 1.0 - g);
      return smoothstep(0.012, 0.0, min(lineDist.x, lineDist.y));
    }

    void main() {
      vec2 centered = vUv - 0.5;

      // fine, slow-drifting frost grain (not the previous large blocky noise)
      float g = grain(vUv + vec2(uTime * 0.004, uTime * 0.003));

      // architectural panel seams
      float seam = panelGrid(vUv);

      // soft diagonal specular glint sweeping across the pane
      float sweepPos = fract(uTime * 0.05);
      float sweep = smoothstep(0.18, 0.0, abs((vUv.x + vUv.y) * 0.5 - sweepPos));

      // very light natural edge darkening only at the extreme corners, not center
      float edge = smoothstep(0.75, 1.05, length(centered * vec2(1.5, 1.0)));

      vec3 col = uColor + (g - 0.5) * 0.05;
      col = mix(col, uHighlight, seam * 0.25);
      col = mix(col, uHighlight, sweep * 0.18);
      col *= 1.0 - edge * 0.12;

      gl_FragColor = vec4(col, 0.96);
    }
  `,
);
