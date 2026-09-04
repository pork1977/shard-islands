import { shaderMaterial } from "@react-three/drei";
import {
  GLASS_HELPERS_GLSL,
  GLASS_UNIFORMS_GLSL,
  glassUniformDefaults,
} from "./glassCommon";

// The intact pane. All the actual shading lives in glassCommon so the fracture
// shards render identically — see the note there.
export const GlassFloorMaterial = shaderMaterial(
  glassUniformDefaults(),
  /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  /* glsl */ `
    ${GLASS_UNIFORMS_GLSL}
    varying vec2 vUv;
    ${GLASS_HELPERS_GLSL}

    void main() {
      gl_FragColor = vec4(glassSurface(vUv), 1.0);
    }
  `,
);
