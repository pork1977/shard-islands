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
    uFogColor: new THREE.Color("#b6d4ea"),
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
  },
  /* glsl */ `
    varying vec3 vNormalW;
    varying vec3 vPos;
    varying float vDepth;

    void main() {
      vPos = position;
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

    varying vec3 vNormalW;
    varying vec3 vPos;
    varying float vDepth;

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
      // sun high and to one side, warm
      vec3 L = normalize(vec3(-0.45, 0.3, 0.84));
      float lambert = max(dot(N, L), 0.0);
      float sky = 0.35 + 0.65 * max(N.z, 0.0); // ambient from the sky above

      float h = vPos.z;
      // flat ground is grass, steep faces are exposed rock
      float steep = 1.0 - clamp(N.z, 0.0, 1.0);

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
      col = mix(col, col * 1.14, step(0.55, mottle));
      col = mix(col, col * 0.88, step(0.62, noise(vPos.xy * 0.05 + 4.0)));

      // canopy speckle in the forest, which is what tree cover reads as from
      // altitude without placing a single tree
      float canopy = noise(vPos.xy * 0.34);
      col = mix(col, uDeepGrass * 0.72,
                smoothstep(0.52, 0.58, biome) * smoothstep(0.45, 0.72, canopy) * 0.55);

      // shoreline sand just above the waterline
      col = mix(uSand, col, smoothstep(uWaterHeight - 0.5, uWaterHeight + 7.0, h));
      // rock as it rises
      col = mix(col, uRock, smoothstep(0.5, 0.74, h / uMaxHeight));
      // exposed rock wherever it is too steep to hold soil
      col = mix(col, uRock, smoothstep(0.5, 0.82, steep));
      // snow caps
      col = mix(col, uSnow, smoothstep(0.80, 0.94, h / uMaxHeight) * (1.0 - steep * 0.5));

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
      col = mix(col, uRoadColor * 0.82, streets * inCity * 0.9);

      // roads do not climb cliffs
      road *= 1.0 - smoothstep(0.25, 0.5, steep);
      col = mix(col, uRoadColor, road * 0.85);

      // strong key light with a bright sky fill — flat, sunny and saturated
      col *= 0.52 * sky + lambert * 1.05;

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
