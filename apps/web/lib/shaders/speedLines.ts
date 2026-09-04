import { shaderMaterial } from "@react-three/drei";

/**
 * Radial speed streaks — the "whoosh" for the free fall and for boosting.
 *
 * A single full-screen quad with no texture reads and a short loop, so it
 * costs effectively nothing and runs fine on mobile. Doing this with
 * particles or geometry would mean thousands of quads for the same effect.
 *
 * Streaks radiate from a focus point rather than the screen centre, so
 * during the fall they can converge on where the player is actually headed.
 */
export const SpeedLinesMaterial = shaderMaterial(
  {
    uTime: 0,
    uIntensity: 0,
    uAspect: 1.777,
    uFocus: 0.5,
    uTint: [0.85, 0.95, 1.0],
  },
  /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0); // already in clip space
    }
  `,
  /* glsl */ `
    uniform float uTime;
    uniform float uIntensity;
    uniform float uAspect;
    uniform float uFocus;
    uniform vec3 uTint;

    varying vec2 vUv;

    float hash(float n) {
      return fract(sin(n * 127.1) * 43758.5453123);
    }

    void main() {
      if (uIntensity <= 0.001) discard;

      vec2 p = vUv - vec2(0.5, uFocus);
      p.x *= uAspect;

      float r = length(p);
      float a = atan(p.y, p.x);

      // streaks are bands in angle, each with its own speed and length, so
      // they read as separate lines rather than a uniform radial blur
      float lane = floor(a * 34.0 / 6.2831853 * 6.2831853 / 0.1848);
      float seed = hash(lane);
      float speed = 0.55 + seed * 1.7;

      float travel = fract(uTime * speed + seed * 7.0);
      // a streak lives in a moving radial window
      float head = travel * 1.25;
      float len = 0.10 + seed * 0.22;
      float band = smoothstep(head, head - len * 0.35, r) *
                   smoothstep(head - len, head - len * 0.75, r);

      // thin them out angularly so there is dark space between lines
      float across = abs(fract(a * 34.0 / 6.2831853) - 0.5) * 2.0;
      float thin = pow(1.0 - across, 9.0);

      // nothing right at the focus, everything toward the edges
      float radial = smoothstep(0.06, 0.55, r);

      float streak = band * thin * radial;
      gl_FragColor = vec4(uTint, streak * uIntensity * 0.85);
    }
  `,
);
