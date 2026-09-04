import { shaderMaterial } from "@react-three/drei";
import * as THREE from "three";

/**
 * The light trail.
 *
 * Additive and deliberately over-bright: this has to read as emitted light
 * against a daylit sky, where a merely coloured ribbon would look like a
 * strip of plastic. Colour runs hot at the craft and cools along the tail,
 * so length is legible at a glance — which is the whole scoring signal of
 * the game.
 */
export const TrailRibbonMaterial = shaderMaterial(
  {
    uTime: 0,
    uHot: new THREE.Color("#ffffff"),
    uCore: new THREE.Color("#41e8ff"),
    uTail: new THREE.Color("#7b4dff"),
    uOpacity: 1,
  },
  /* glsl */ `
    attribute float aT;      // 0 at the tail, 1 at the craft
    attribute float aSide;   // -1 .. 1 across the ribbon

    varying float vT;
    varying float vSide;

    void main() {
      vT = aT;
      vSide = aSide;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  /* glsl */ `
    uniform float uTime;
    uniform vec3 uHot;
    uniform vec3 uCore;
    uniform vec3 uTail;
    uniform float uOpacity;

    varying float vT;
    varying float vSide;

    void main() {
      // Bright filament down the middle, falling off to the edges.
      // NOTE the clamps: an interpolated varying can land just outside its
      // endpoints, and pow() with a negative base is undefined in GLSL. The
      // NaN it returns gets smeared over the whole framebuffer by bloom and
      // blacks out the entire screen, not just the trail.
      float across = clamp(1.0 - abs(vSide), 0.0, 1.0);
      float t = clamp(vT, 0.0, 1.0);
      float core = pow(across, 2.2);
      float glow = pow(across, 0.6);

      vec3 col = mix(uTail, uCore, smoothstep(0.0, 0.65, t));
      // white-hot only right at the nose — over a longer run it bleaches the
      // whole trail and the colour gradient stops reading
      col = mix(col, uHot, pow(t, 14.0));
      col += uHot * core * 0.22;

      // pulses travelling down the trail, so it reads as energy not ribbon
      float pulse = 0.85 + 0.15 * sin(t * 26.0 - uTime * 7.0);

      float alpha = (glow * 0.20 + core * 0.42) * pulse;
      alpha *= smoothstep(0.0, 0.12, t);            // fade out at the tail end
      gl_FragColor = vec4(col * pulse, alpha * uOpacity);
    }
  `,
);
