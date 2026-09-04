import { shaderMaterial } from "@react-three/drei";
import * as THREE from "three";

// The crack network drawn over the still-intact pane. Cracks are silver-white
// light catching the fracture faces — not a uniform neon glow, which was what
// made the first fracture pass read as decoration rather than damage. The
// cyan only creeps in near the strike, where the world beneath starts to
// show through.
export const CrackOverlayMaterial = shaderMaterial(
  {
    uProgress: 0,
    uEdgeColor: new THREE.Color("#eaf7ff"),
    uGlowColor: new THREE.Color("#5fe4ff"),
    uOpacity: 1,
  },
  /* glsl */ `
    attribute float aSide;
    attribute float aArc;
    attribute float aGen;

    varying float vSide;
    varying float vArc;
    varying float vGen;

    void main() {
      vSide = aSide;
      vArc = aArc;
      vGen = aGen;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  /* glsl */ `
    uniform float uProgress;
    uniform vec3 uEdgeColor;
    uniform vec3 uGlowColor;
    uniform float uOpacity;

    varying float vSide;
    varying float vArc;
    varying float vGen;

    void main() {
      // Cracks propagate outward rather than appearing all at once. The
      // leading tip runs hot, like the fracture front is still releasing
      // energy, then settles to a cooler silver as it passes.
      // NOTE: edges must be passed ascending. smoothstep(hi, lo, x) is
      // UNDEFINED in GLSL and returned NaN here — which then survived the
      // discard below (every NaN comparison is false) and got smeared across
      // the whole framebuffer by bloom's mipmap downsample, blacking out the
      // entire screen rather than just the cracks.
      float reveal = 1.0 - smoothstep(uProgress - 0.09, uProgress, vArc);
      if (!(reveal > 0.001)) discard;
      // keep the white-hot band tight to the advancing front, otherwise most
      // of the crack length stays lit and the whole thing reads as light beams
      float tip = smoothstep(uProgress - 0.045, uProgress - 0.005, vArc);

      // Across-width profile: bright core falling off to the fracture lip.
      // The clamp is load-bearing — vSide is an interpolated varying and can
      // land a hair outside its ±1 endpoints, which makes the pow() base
      // slightly negative. pow() with a negative base is undefined in GLSL
      // and yields NaN, which bloom then smears over the entire framebuffer.
      float across = clamp(abs(vSide), 0.0, 1.0);
      float core = pow(max(1.0 - across, 0.0), 1.6);

      // finer branches are dimmer than the major fractures
      float genFade = 1.0 / (1.0 + vGen * 0.55);

      vec3 col = uEdgeColor * core * genFade * 0.5;
      // light from beneath bleeding up through the widest cracks near the strike
      col += uGlowColor * core * genFade * (1.0 - vArc) * 0.5;
      // white-hot fracture front
      col += uEdgeColor * tip * core * 1.3;

      gl_FragColor = vec4(col, reveal * uOpacity);
    }
  `,
);
