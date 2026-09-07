import { shaderMaterial } from "@react-three/drei";
import { CRACK_RAYS } from "@/lib/fracture/crackLook";
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
    uCollapse: 0,
    uImpact: new THREE.Vector2(0, 0),
  },
  /* glsl */ `
    attribute vec2 aPaneUv;
    attribute vec2 aCentroidUv;
    attribute vec3 aCentroid;
    attribute vec3 aRandom;
    attribute float aEdge;
    attribute float aEdgeWidth;
    attribute float aDist;

    uniform float uProgress;
    /** Seconds since the pane gave way. 0 while it is merely cracked. */
    uniform float uCollapse;
    uniform vec2 uImpact;

    varying vec2 vPaneUv;
    varying vec2 vCentroidUv;
    varying vec3 vNormal;
    varying vec3 vRandom;
    varying float vEdge;
    varying float vEdgeWidth;
    varying float vDist;
    varying float vCracked;
    varying float vFlash;
    varying float vFall;

    // When this particular shard breaks.
    //
    // Distance alone makes every shard at the same radius break together, so
    // the fracture arrives as expanding concentric rings. Real fracture runs
    // along paths: some directions race to the edge while their neighbours
    // barely move. The angular term biases propagation speed by direction, so
    // the front advances in uneven fingers instead of rings.
    //
    // The burst quantisation stays — glass does go in steps rather than one
    // smooth sweep — but each burst is now an irregular blob rather than a ring.
    /**
     * When each shard cracks, as a fraction of the fracture's duration.
     *
     * This used to be a function of DISTANCE, quantised into nine steps —
     * so every shard in a radius band let go on the same frame and the pane
     * came apart as nine expanding rings. That reads as a ripple in a pond,
     * which is the one thing an impact fracture does not look like.
     *
     * Real glass does not advance as a front. A few cracks run almost
     * straight to the edge in the first instants, and everything between
     * them waits for a branch to arrive and cross it. So time is now mostly
     * a function of ANGLE: near one of the major rays a crack travels at
     * better than twice the speed, and the plates between them go last.
     *
     * Nothing is quantised. The staggering that the bursts were faking now
     * comes out of the geometry for free, and every shard gets its own
     * instant — so the flash travels along the cracks instead of firing in
     * rings.
     */
    float shardCrackTime(float dist, float angle, float rnd) {
      // Irregularly spaced rays. Evenly spaced ones make a perfect star,
      // which is the other way for this to look computed rather than broken.
      float wobble = sin(angle * 2.0 + 1.1) * 0.20 + sin(angle * 3.0 - 0.7) * 0.12;
      float lateral = abs(sin((angle + wobble) * ${CRACK_RAYS.toFixed(1)} * 0.5));
      // Squared, so the fast lanes are narrow spears rather than broad wedges.
      lateral *= lateral;

      float d = clamp(dist, 0.0, 1.0);

      // TWO PHASES, deliberately separated rather than blended into one
      // sweep. Blended, the pane came apart as travelling wedges — better
      // than rings, still plainly a pattern being drawn.
      //
      // The spears go first and are over almost before they register: a
      // handful of cracks to the frame inside the opening sixth. Then a
      // beat where nothing much moves. Then the plates between them let go,
      // outward from the strike, slowly enough to watch.
      float spear = d * 0.16;
      float fill = 0.30 + 0.70 * pow(d, 0.75);
      float t = mix(spear, fill, lateral);

      // Coarse per-shard noise, which is what stops the fill arriving as a
      // clean front. Neighbouring plates should not agree with each other.
      return clamp(t + (rnd - 0.5) * 0.13, 0.0, 1.0);
    }

    // Rodrigues rotation — each shard tumbles about its own centre.
    vec3 rotateAxis(vec3 v, vec3 axis, float angle) {
      float c = cos(angle);
      float s = sin(angle);
      return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
    }

    void main() {
      vPaneUv = aPaneUv;
      vCentroidUv = aCentroidUv;
      vNormal = normal;
      vRandom = aRandom;
      vEdge = aEdge;
      vEdgeWidth = aEdgeWidth;
      vDist = aDist;

      vec2 fromImpact = aCentroid.xy - uImpact;
      float ct = shardCrackTime(aDist, atan(fromImpact.y, fromImpact.x), aRandom.y);
      vCracked = smoothstep(ct, ct + 0.025, uProgress);
      // brief white-hot pulse as this piece lets go
      vFlash = vCracked * (1.0 - smoothstep(ct + 0.02, ct + 0.14, uProgress));

      // the hairline gap opens only once this piece has cracked, so the pane
      // is seamless until the fracture actually reaches it
      vec3 pos = position;
      pos.xy = mix(pos.xy, aCentroid.xy, 0.0045 * vCracked);

      // The pane gives way. Pieces at the strike are already loose and go
      // first; the rest follow outward, so the floor falls away rather than
      // dropping as one sheet.
      float fall = max(0.0, uCollapse - (aDist * 0.5 + aRandom.x * 0.2));
      vFall = fall;
      if (fall > 0.0) {
        vec3 local = pos - aCentroid;

        vec3 axis = normalize(aRandom * 2.0 - 1.0 + vec3(0.0011, 0.0007, 0.0013));
        float spin = fall * (1.3 + aRandom.z * 3.4);
        local = rotateAxis(local, axis, spin);
        // Rotate the NORMAL by the same amount, or the pieces spin without
        // their shading ever changing and tumble as dead silhouettes instead
        // of catching the light.
        vNormal = rotateAxis(normal, axis, spin);

        vec2 outward = aCentroid.xy - uImpact;
        vec3 dir = vec3(outward / (length(outward) + 0.001), 0.0);

        // blast hardest at the strike, and everything falls away from the
        // viewer into the void the camera is about to follow it into
        // The debris has to stay just below the camera, and fan out around
        // it. The camera's own descent accelerates hard: at the original
        // launch speed it drew level with the glass a second and a half in
        // and then stayed level for the rest of the fall, which parked every
        // shard in the camera's own plane — off the edge of a view pointed
        // at the ground — and read as the whole field blinking out at once.
        // Simply making them fall harder is no better: they shrink to dark
        // confetti hundreds of metres below. A firm initial shove downward
        // and a much wider lateral spread keeps them a few dozen metres
        // ahead of the lens and off to the sides, tumbling and catching the
        // light for as long as they take to dissolve.
        vec3 velocity =
            dir * (3.4 - aDist * 2.0) * (0.5 + aRandom.y)
          + vec3(0.0, 0.0, -6.5 - aRandom.z * 3.5);
        vec3 displacement = velocity * fall + vec3(0.0, 0.0, -7.0) * fall * fall;

        pos = aCentroid + local + displacement;
      }

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  /* glsl */ `
    ${GLASS_UNIFORMS_GLSL}
    uniform vec3 uGlowColor;

    varying vec2 vPaneUv;
    varying vec2 vCentroidUv;
    varying vec3 vNormal;
    varying vec3 vRandom;
    varying float vEdge;
    varying float vEdgeWidth;
    varying float vDist;
    varying float vCracked;
    varying float vFlash;
    varying float vFall;

    ${GLASS_HELPERS_GLSL}

    void main() {
      // Once a piece has cracked it sits slightly askew in its socket, so the
      // view through it stops lining up with its neighbours and the tile seams
      // visibly jog at the crack.
      //
      // Offsetting the sample alone is not enough: an offset is a pure
      // translation, so a horizontal seam stays perfectly horizontal and every
      // jog ends up axis-aligned. A real piece TILTS, which rotates the view
      // through it. Hence a small rotation about the shard's own centre, plus
      // a slight scale for the piece sitting fractionally proud or sunk.
      float tilt = (vRandom.z - 0.5) * 0.07 * (1.0 - vDist * 0.45) * vCracked;
      float s = sin(tilt);
      float c = cos(tilt);

      vec2 rel = vPaneUv - vCentroidUv;
      rel.x *= uAspect;                       // rotate in square space, not UV space
      rel = vec2(rel.x * c - rel.y * s, rel.x * s + rel.y * c);
      rel *= 1.0 + (vRandom.x - 0.5) * 0.03 * vCracked;
      rel.x /= uAspect;

      vec2 shardShift = (vRandom.xy - 0.5) * 0.022 * (1.0 - vDist * 0.55) * vCracked;
      vec3 col = glassSurface(vCentroidUv + rel + shardShift);
      col *= mix(1.0, 0.86 + vRandom.z * 0.28, vCracked);

      // aEdge runs 1 at the shard centre to 0 along its outline. fwidth turns
      // it into a distance in PIXELS, so crack width stays constant regardless
      // of shard size (thresholding aEdge directly gave big shards big gashes).
      float px = vEdge / max(fwidth(vEdge), 1e-6);

      // Width hierarchy: a few thick splits, most of them faint hairlines,
      // everything fatter near the strike. Uniform-weight lines everywhere are
      // what made this read as a road map rather than broken glass.
      float halfWidth = vEdgeWidth * (0.5 + 0.75 * exp(-vDist * 1.6));

      // A crack is a volume, not a stroke: a dark void down the middle with
      // bright lips either side where the fracture faces catch the light.
      // The lip band is kept tight — a wide one turns thick cracks into
      // puffy silver veins that read as molten metal rather than glass.
      float core = (1.0 - smoothstep(halfWidth * 0.35, halfWidth, px)) * vCracked;
      float lip = exp(-pow((px - halfWidth * 1.1) / max(halfWidth * 0.5, 0.4), 2.0)) * vCracked;
      float bruise = (1.0 - smoothstep(0.0, halfWidth * 5.0 + 2.0, px)) * vCracked;

      col = mix(col, col * 0.5, bruise * 0.4);
      col = mix(col, col * 0.15, core * 0.8);

      // silver-white, per-crack varied. Near-white rather than cyan: the tint
      // was what gave the whole pane a neon, decorative cast.
      vec3 silver = vec3(0.86, 0.93, 1.0);
      col += silver * lip * (0.22 + vRandom.x * 0.3) * (0.4 + 0.7 * exp(-vDist * 1.4));

      // colour only survives right at the strike, where the world beneath
      // starts showing through
      col += uGlowColor * (lip + core * 0.5) * exp(-vDist * 5.5) * 0.9;

      // the white-hot instant of this piece letting go
      col += silver * (lip + core) * vFlash * 1.4;

      // pulverised core at the strike, where glass is crushed not cleanly split
      col += uGlowColor * exp(-vDist * 26.0) * 0.9 * vCracked;

      // exposed cut faces glow along their thickness
      float side = 1.0 - step(0.5, abs(vNormal.z));
      vec3 cutCol = uGlassColor * 0.6 + uLightColor * 0.25 + uGlowColor * exp(-vDist * 3.0) * 0.55;
      col = mix(col, cutCol, side * vCracked);

      // The debris field thins out; it does not switch off.
      //
      // Every piece used to fade over the same window (0.9 to 2.4), and
      // since they all let go within about a second of each other, the whole
      // sheet of debris evaporated together roughly half a second after the
      // pane gave way — a hard cut from a screen full of tumbling glass to
      // an empty sky. Each shard now gets its own start and its own
      // duration, so pieces drop out a few at a time and the last of them
      // are still falling alongside the camera most of the way down.
      float fadeStart = 0.7 + vRandom.z * 2.2;
      float fadeLength = 1.4 + vRandom.x * 2.2;
      float alpha = 1.0 - smoothstep(fadeStart, fadeStart + fadeLength, vFall);

      // A tumbling piece is lit from two places: the cold source above, which
      // it flashes as it spins through the right angle, and the glow rising
      // from the void it is falling into.
      if (vFall > 0.0) {
        vec3 N = normalize(vNormal);
        vec3 L = normalize(vec3(-0.35, 0.5, 0.78));
        // A broad glint as well as a tight one. Seen from above against a
        // lit landscape, a piece that only flares at one exact angle reads
        // as a dark speck for most of its fall — grit rather than glass.
        float glint = pow(max(dot(N, L), 0.0), 26.0);
        float sheen = pow(max(dot(N, L), 0.0), 3.0);
        col += uLightColor * glint * 1.8;
        col += uLightColor * sheen * 0.45;
        col += uGlowColor * max(0.0, -N.z) * 0.32;
        // and it recedes as it falls away. Gently: the piece has to stay
        // visible for as long as it is still on screen, and the alpha above
        // is what should be retiring it, not the exposure.
        col *= 1.0 / (1.0 + vFall * 0.12);
      }

      gl_FragColor = vec4(col, alpha);
    }
  `,
);
