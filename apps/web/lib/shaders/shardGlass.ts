import { shaderMaterial } from "@react-three/drei";
import * as THREE from "three";
import {
  GLASS_HELPERS_GLSL,
  GLASS_UNIFORMS_GLSL,
  glassUniformDefaults,
} from "./glassCommon";

// The pane, as separable shards, rendered from the very first frame.
//
// There is deliberately no separate "crack overlay" any more. An earlier
// version animated a branching crack network and then swapped in this
// tessellation, and the two never matched — they were different geometry
// from different algorithms, so the moment of handover always jumped. Here
// the cracks ARE the shard edges, so "finished cracking" and "broken into
// shards" are the same object by construction rather than by coincidence.
//
// At uProgress 0 this is pixel-identical to the intact pane: no crack lines,
// no gaps, no per-shard offset. Each shard then breaks at its own moment.
export const ShardGlassMaterial = shaderMaterial(
  {
    ...glassUniformDefaults(),
    uGlowColor: new THREE.Color("#5fe4ff"),
    uProgress: 0,
  },
  /* glsl */ `
    attribute vec2 aPaneUv;
    attribute vec3 aCentroid;
    attribute vec3 aRandom;
    attribute float aEdge;
    attribute float aDist;

    uniform float uProgress;

    varying vec2 vPaneUv;
    varying vec3 vNormal;
    varying vec3 vRandom;
    varying float vEdge;
    varying float vDist;
    varying float vCracked;
    varying float vFlash;

    // When this particular shard breaks. Quantising into discrete bursts is
    // what stops the fracture reading as one smooth sweep — glass goes in
    // steps: a crack, a pause, then several more at once.
    float shardCrackTime(float dist, float rnd) {
      float base = pow(clamp(dist, 0.0, 1.0), 0.72);
      float jitter = (rnd - 0.5) * 0.17;
      float raw = clamp(base + jitter, 0.0, 1.0);
      float bursts = 9.0;
      return floor(raw * bursts) / bursts;
    }

    void main() {
      vPaneUv = aPaneUv;
      vNormal = normal;
      vRandom = aRandom;
      vEdge = aEdge;
      vDist = aDist;

      float ct = shardCrackTime(aDist, aRandom.y);
      vCracked = smoothstep(ct, ct + 0.025, uProgress);
      // brief white-hot pulse as this piece lets go
      vFlash = vCracked * (1.0 - smoothstep(ct + 0.02, ct + 0.14, uProgress));

      // the hairline gap opens only once this piece has cracked, so the pane
      // is seamless until the fracture actually reaches it
      vec3 pos = position;
      pos.xy = mix(pos.xy, aCentroid.xy, 0.0045 * vCracked);

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  /* glsl */ `
    ${GLASS_UNIFORMS_GLSL}
    uniform vec3 uGlowColor;

    varying vec2 vPaneUv;
    varying vec3 vNormal;
    varying vec3 vRandom;
    varying float vEdge;
    varying float vDist;
    varying float vCracked;
    varying float vFlash;

    ${GLASS_HELPERS_GLSL}

    void main() {
      // Once a piece has cracked it has shifted slightly in its socket, so the
      // view through it stops lining up with its neighbours and the tile seams
      // visibly jog at the crack. Scaled by vCracked so nothing moves before
      // the fracture arrives.
      vec2 shardShift = (vRandom.xy - 0.5) * 0.03 * (1.0 - vDist * 0.55) * vCracked;
      vec3 col = glassSurface(vPaneUv + shardShift);
      col *= mix(1.0, 0.86 + vRandom.z * 0.28, vCracked);

      // aEdge runs 1 at the shard centre to 0 along its outline. fwidth gives a
      // constant pixel-width hairline regardless of shard size; thresholding
      // aEdge directly made crack width proportional to shard size.
      float w = fwidth(vEdge);
      float crack = (1.0 - smoothstep(0.0, w * 1.4, vEdge)) * vCracked;
      float bruise = (1.0 - smoothstep(0.0, w * 7.0, vEdge)) * vCracked;

      // glass either side of the split darkens, and the broken lip catches light.
      // Brightness varies per shard and falls off from the strike — cracks lit
      // uniformly across the whole pane read as decorative neon, not damage.
      col = mix(col, col * 0.45, bruise * 0.5);
      col += uLightColor * crack * (0.08 + 0.3 * exp(-vDist * 2.0)) * (0.6 + vRandom.x * 0.8);

      // light from the world beneath leaking up through the cracks
      float leak = crack * exp(-vDist * 3.0);
      col += uGlowColor * leak * 1.1;

      // the white-hot instant of this piece letting go
      col += vec3(0.92, 0.98, 1.0) * crack * vFlash * 1.5;

      // pulverised core at the strike, where glass is crushed not cleanly split
      col += uGlowColor * exp(-vDist * 26.0) * 0.9 * vCracked;

      // exposed cut faces glow along their thickness
      float side = 1.0 - step(0.5, abs(vNormal.z));
      vec3 cutCol = uGlassColor * 0.6 + uLightColor * 0.25 + uGlowColor * exp(-vDist * 3.0) * 0.55;
      col = mix(col, cutCol, side * vCracked);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
);
