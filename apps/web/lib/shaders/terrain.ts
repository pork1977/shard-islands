import { shaderMaterial } from "@react-three/drei";
import * as THREE from "three";

// Lush land seen from the air: shorelines, grassland, forested slopes, bare
// rock and snow on the peaks. Height and steepness drive the palette, which
// is what makes terrain read as geography rather than as one tinted mass.
export const TerrainMaterial = shaderMaterial(
  {
    uTime: 0,
    uReveal: 0,
    // saturated, stylised, high-key — a map read from the air
    uSand: new THREE.Color("#e8d9a4"),
    uGrass: new THREE.Color("#63bd45"),
    uDeepGrass: new THREE.Color("#2b7a34"),
    uMeadow: new THREE.Color("#9dc95a"),
    uRock: new THREE.Color("#7d7466"),
    uSnow: new THREE.Color("#f4f9fc"),
    uFogColor: new THREE.Color("#6a4a6e"),
    uMaxHeight: 78,
    uWaterHeight: 9,
    uRoadColor: new THREE.Color("#9c8a6b"),
    // roads as line segments the shader measures distance to — far cheaper
    // and better-fitting than laying ribbon geometry over uneven ground
    uRoads: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 0, 0)),
    uRoadCount: 0,
    /** xy = city centre, z = radius, w = block size. */
    uCity: new THREE.Vector4(0, 0, 0, 34),
    uUrban: new THREE.Color("#8a8f96"),
    // the desert: dune sand, sun-bleached crests, and the red rock the mesas
    // are cut from
    uDuneSand: new THREE.Color("#dcbc85"),
    uDuneCrest: new THREE.Color("#f2e2b6"),
    uRedRock: new THREE.Color("#a3623c"),
    /** Silt under the great lake, so deep water reads as deep. */
    uLakeBed: new THREE.Color("#1b4a5e"),
  },
  /* glsl */ `
    // Both regions are baked per-vertex by the generator rather than
    // recomputed here: the masks are noise-warped, and two implementations
    // of the same warp in two languages drift apart.
    attribute float aDesert;
    attribute float aLake;

    varying vec3 vNormalW;
    varying vec3 vPos;
    varying float vDepth;
    varying float vDesert;
    varying float vLake;

    void main() {
      vPos = position;
      vDesert = aDesert;
      vLake = aLake;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vec4 world = modelMatrix * vec4(position, 1.0);
      vec4 mv = viewMatrix * world;
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `,
  /* glsl */ `
    uniform float uTime;
    uniform float uReveal;
    uniform vec3 uSand;
    uniform vec3 uGrass;
    uniform vec3 uDeepGrass;
    uniform vec3 uMeadow;
    uniform vec3 uRock;
    uniform vec3 uSnow;
    uniform vec3 uFogColor;
    uniform float uMaxHeight;
    uniform float uWaterHeight;
    uniform vec3 uRoadColor;
    uniform vec4 uRoads[16];
    uniform int uRoadCount;
    uniform vec4 uCity;
    uniform vec3 uUrban;
    uniform vec3 uDuneSand;
    uniform vec3 uDuneCrest;
    uniform vec3 uRedRock;
    uniform vec3 uLakeBed;

    varying vec3 vNormalW;
    varying vec3 vPos;
    varying float vDepth;
    varying float vDesert;
    varying float vLake;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
      );
    }

    void main() {
      vec3 N = normalize(vNormalW);
      // low dusk sun, matching the sky's own sun direction
      vec3 L = normalize(vec3(-0.72, 0.28, 0.16));
      float lambert = max(dot(N, L), 0.0);
      float sky = 0.35 + 0.65 * max(N.z, 0.0); // ambient from the sky above

      float h = vPos.z;
      // flat ground is grass, steep faces are exposed rock
      float steep = 1.0 - clamp(N.z, 0.0, 1.0);

      // Detail smaller than a pixel is not detail, it is noise that crawls
      // as the camera moves. Every high-frequency term below is faded out
      // with distance: the canopy speckle has a three-metre period, so from
      // three hundred metres up it is pure moiré. Coarse features keep their
      // own, much longer, leash.
      float detail = 1.0 - smoothstep(150.0, 460.0, vDepth);
      float coarse = 1.0 - smoothstep(420.0, 1100.0, vDepth);

      // Biomes as distinct REGIONS with fairly crisp borders, not a smooth
      // blend. Read from the air, that separation into readable areas —
      // meadow, forest, farmland — is most of the stylised-map look; a soft
      // gradient between greens just reads as one hazy field.
      float biome = noise(vPos.xy * 0.0055);
      float mottle = noise(vPos.xy * 0.021);

      vec3 col = uGrass;
      // darker forested tracts
      col = mix(col, uDeepGrass, smoothstep(0.46, 0.60, biome));
      // drier meadow elsewhere
      col = mix(col, uMeadow, smoothstep(0.44, 0.30, biome));
      // patchwork within a region so it is not one flat colour
      col = mix(col, col * 1.14, step(0.55, mottle) * coarse);
      col = mix(col, col * 0.88, step(0.62, noise(vPos.xy * 0.05 + 4.0)) * detail);

      // canopy speckle in the forest, which is what tree cover reads as from
      // altitude without placing a single tree
      float canopy = noise(vPos.xy * 0.34);
      col = mix(col, uDeepGrass * 0.72,
                smoothstep(0.52, 0.58, biome) * smoothstep(0.45, 0.72, canopy) * 0.55 * detail);

      // shoreline sand just above the waterline
      col = mix(uSand, col, smoothstep(uWaterHeight - 0.5, uWaterHeight + 7.0, h));
      // rock as it rises
      col = mix(col, uRock, smoothstep(0.5, 0.74, h / uMaxHeight));
      // exposed rock wherever it is too steep to hold soil
      col = mix(col, uRock, smoothstep(0.5, 0.82, steep));
      // snow caps
      col = mix(col, uSnow, smoothstep(0.80, 0.94, h / uMaxHeight) * (1.0 - steep * 0.5));

      // The desert. Laid over the finished green palette rather than blended
      // into it, so the boundary is the one the generator planted cactus to
      // and there is no band of sandy grass in between.
      if (vDesert > 0.001) {
        vec3 sand = mix(uDuneSand, uDuneCrest, smoothstep(0.35, 0.72, noise(vPos.xy * 0.018)));
        // wind ripples, running the same way the dunes do
        float ripple = sin((vPos.x * 0.92 + vPos.y * 0.39) * 0.5 + noise(vPos.xy * 0.06) * 5.0);
        sand *= 0.95 + 0.05 * ripple * detail;
        // out here the only steep ground is a mesa wall, and it is bare rock
        float wall = smoothstep(0.34, 0.6, steep);
        sand = mix(sand, uRedRock, wall);
        // strata banding, which is what reads as sedimentary rock from a
        // distance rather than a brown cliff
        sand = mix(sand, uRedRock * 0.72, wall * step(0.5, fract(h * 0.085)) * coarse);
        // Committed rather than proportional: a half-sand, half-grass
        // blend across the whole basin is what made this read as sage.
        col = mix(col, sand, smoothstep(0.12, 0.5, vDesert));
      }

      // The lake bed darkens with depth under the water plane. Without it a
      // huge lake is one flat blue sheet with no sense of a bottom.
      col = mix(col, uLakeBed,
                vLake * (1.0 - smoothstep(uWaterHeight - 2.0, uWaterHeight + 10.0, h)));

      // roads linking the settlements, laid on wherever the ground is gentle
      float road = 0.0;
      for (int i = 0; i < 16; i++) {
        if (i >= uRoadCount) break;
        vec2 a = uRoads[i].xy;
        vec2 b = uRoads[i].zw;
        vec2 ab = b - a;
        float t = clamp(dot(vPos.xy - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
        float d = length(vPos.xy - (a + ab * t));
        road = max(road, 1.0 - smoothstep(3.0, 7.0, d));
      }
      // The city floor: paved ground with a street grid running through it,
      // which is what turns a cluster of buildings into somewhere that looks
      // built rather than dropped on a field.
      float cityDist = length(vPos.xy - uCity.xy);
      float inCity = 1.0 - smoothstep(uCity.z * 0.75, uCity.z * 1.12, cityDist);
      inCity *= 1.0 - smoothstep(0.18, 0.4, steep);
      col = mix(col, uUrban, inCity * 0.8);

      vec2 g = abs(fract((vPos.xy - uCity.xy) / uCity.w) - 0.5) * uCity.w;
      float streets = 1.0 - smoothstep(2.0, 4.2, min(g.x, g.y));
      col = mix(col, uRoadColor * 0.82, streets * inCity * 0.9 * coarse);

      // roads do not climb cliffs
      road *= 1.0 - smoothstep(0.25, 0.5, steep);
      col = mix(col, uRoadColor, road * 0.85 * coarse);

      // Dusk lighting: a cool dim ambient with a warm raking key, so lit
      // slopes go golden and shaded ones fall to deep blue. Much darker
      // overall, which is what lets neon read against it.
      vec3 ambient = vec3(0.20, 0.24, 0.40) * sky * 0.85;
      vec3 key = vec3(1.0, 0.72, 0.45) * lambert * 1.15;
      col *= ambient + key;

      // Aerial perspective sells altitude, but too much of it bleaches the
      // whole map to pale grey-green — it needs to bite only in the far
      // distance, and never fully.
      float fog = 1.0 - exp(-vDepth * 0.00085);
      col = mix(col, uFogColor, clamp(fog, 0.0, 0.68));

      // the land's colour comes up as the player falls into the world
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum) * 0.5, col, 0.3 + 0.7 * uReveal);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
);
