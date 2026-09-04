import { shaderMaterial } from "@react-three/drei";
import * as THREE from "three";
import {
  GLASS_HELPERS_GLSL,
  GLASS_UNIFORMS_GLSL,
  glassUniformDefaults,
} from "./glassCommon";

// The shattered pane. Each shard samples the light field at its ORIGINAL pane
// UV, so at the moment of impact the broken pane is pixel-for-pixel the pane
// that was there a frame earlier — only the crack lines are new. Phase 3 will
// add the rigid-body transform in the vertex shader; the attributes it needs
// are already carried here.
export const ShardGlassMaterial = shaderMaterial(
  {
    ...glassUniformDefaults(),
    uGlowColor: new THREE.Color("#5fe4ff"),
  },
  /* glsl */ `
    attribute vec2 aPaneUv;
    attribute vec3 aCentroid;
    attribute vec3 aRandom;
    attribute float aEdge;
    attribute float aDist;

    varying vec2 vPaneUv;
    varying vec3 vNormal;
    varying float vEdge;
    varying float vDist;

    void main() {
      vPaneUv = aPaneUv;
      vNormal = normal;
      vEdge = aEdge;
      vDist = aDist;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  /* glsl */ `
    ${GLASS_UNIFORMS_GLSL}
    uniform vec3 uGlowColor;

    varying vec2 vPaneUv;
    varying vec3 vNormal;
    varying float vEdge;
    varying float vDist;

    ${GLASS_HELPERS_GLSL}

    void main() {
      vec3 col = glassSurface(vPaneUv);

      // aEdge runs 1 at the shard centre to 0 along its outline. Thresholding
      // it directly makes crack width proportional to shard size — huge gashes
      // across big shards. fwidth gives a constant ~pixel-width hairline
      // regardless of how large the shard is, which is how real cracks read.
      float w = fwidth(vEdge);
      float crack = 1.0 - smoothstep(0.0, w * 1.4, vEdge);
      float bruise = 1.0 - smoothstep(0.0, w * 7.0, vEdge);

      // glass either side of the split darkens, and the broken lip catches light
      col = mix(col, col * 0.45, bruise * 0.5);
      col += uLightColor * crack * 0.3;

      // light from the world beneath leaking up through the cracks, strongest
      // at the strike and fading outward
      float leak = crack * exp(-vDist * 3.0);
      col += uGlowColor * leak * 1.1;

      // exposed cut faces of the glass glow along their thickness
      float side = 1.0 - step(0.5, abs(vNormal.z));
      vec3 cutCol = uGlassColor * 0.6 + uLightColor * 0.25 + uGlowColor * exp(-vDist * 3.0) * 0.55;
      col = mix(col, cutCol, side);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
);
