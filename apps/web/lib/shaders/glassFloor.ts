import { shaderMaterial } from "@react-three/drei";
import * as THREE from "three";

// Frosted architectural glass.
//
// Key idea (and the thing the two earlier passes got wrong): glass doesn't
// read as glass because of its colour, it reads as glass because light is
// REFRACTED through an uneven surface. So rather than tinting a flat plane,
// this samples a procedural "what's behind the pane" light field at a UV
// offset by the surface normal, per pixel. The rolled-glass pebbling comes
// from a baked normal map; the joints are modelled as real bevels that catch
// a specular streak on the light-facing side and fall into shadow on the other.
export const GlassFloorMaterial = shaderMaterial(
  {
    uTime: 0,
    uAspect: 1.777,
    uNormalMap: null as THREE.Texture | null,
    uGlassColor: new THREE.Color("#0c161e"),
    uLightColor: new THREE.Color("#9dc6e8"),
    uCoolColor: new THREE.Color("#14323f"),
    uLightPos: new THREE.Vector2(0.18, 0.88),
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
    uniform float uAspect;
    uniform sampler2D uNormalMap;
    uniform vec3 uGlassColor;
    uniform vec3 uLightColor;
    uniform vec3 uCoolColor;
    uniform vec2 uLightPos;
    varying vec2 vUv;

    float hash1(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    // The light behind the pane, before it gets refracted. A single hard, cold
    // source raking across dark architectural glass — most of the pane sits in
    // shadow so the handprint is the only inviting thing on screen.
    vec3 behindGlass(vec2 p, vec2 lightPos) {
      vec2 q = (p - lightPos) * vec2(uAspect, 1.0);
      float hard = exp(-dot(q, q) * 9.0);
      float spill = exp(-dot(q, q) * 1.6);

      vec2 q2 = (p - vec2(0.94, 0.08)) * vec2(uAspect, 1.0);
      float counter = exp(-dot(q2, q2) * 2.2);

      vec3 col = uGlassColor;
      col += uLightColor * (hard * 0.8 + spill * 0.14);
      col += uCoolColor * counter * 0.5;
      return col;
    }

    void main() {
      // very slow drift, like light changing outside — keeps it alive without
      // the obviously-fake sweeping band the previous version used
      vec2 lightPos = uLightPos + vec2(sin(uTime * 0.05) * 0.015, cos(uTime * 0.04) * 0.01);

      // Aspect-corrected tile grid so tiles stay square on any window shape,
      // with density driven by the NARROWER axis — keying it to height alone
      // left a portrait phone showing ~1.5 tiles across, absurdly zoomed in.
      float tilesY = 3.0 / min(1.0, uAspect);
      vec2 tileUv = vec2(vUv.x * uAspect, vUv.y) * tilesY;
      vec2 cell = floor(tileUv);
      vec2 f = fract(tileUv);
      vec2 edgeDist = min(f, 1.0 - f);
      float d = min(edgeDist.x, edgeDist.y);

      float jointHalf = 0.016;
      float bevelRun = 0.06;
      float jointMask = smoothstep(jointHalf, jointHalf * 0.45, d);
      float bevelMask = smoothstep(bevelRun, jointHalf, d) * (1.0 - jointMask);

      // which way the bevel slopes: away from the nearest joint
      vec2 bevelDir;
      if (edgeDist.x < edgeDist.y) {
        bevelDir = vec2(f.x < 0.5 ? -1.0 : 1.0, 0.0);
      } else {
        bevelDir = vec2(0.0, f.y < 0.5 ? -1.0 : 1.0);
      }

      // rolled-glass pebbling from the baked map, tiled in square space
      // two octaves: finer primary pebbling with a coarser undulation under it,
      // which is closer to real rolled glass than a single uniform cell size
      // frequencies keyed to tile size so pebbles-per-tile stays constant
      vec2 texUv = vec2(vUv.x * uAspect, vUv.y);
      vec3 mapN = texture2D(uNormalMap, texUv * (tilesY * 1.8)).rgb * 2.0 - 1.0;
      vec3 mapN2 = texture2D(uNormalMap, texUv * (tilesY * 0.57) + 0.37).rgb * 2.0 - 1.0;
      vec2 surfaceN = mapN.xy * 0.6 + mapN2.xy * 0.3;

      vec3 N = normalize(vec3(surfaceN + bevelDir * bevelMask * 0.9, 1.0));

      // refraction: sample the light field displaced by the surface normal
      vec2 refracted = vUv + N.xy * 0.045;
      vec3 col = behindGlass(refracted, lightPos);

      // second, wider tap approximates the frost scattering light sideways
      col = mix(col, behindGlass(vUv + N.xy * 0.13, lightPos), 0.35);

      // per-tile variation — different glass, different thickness behind each
      float tileVar = hash1(cell + 3.7);
      col *= 0.93 + tileVar * 0.14;
      col = mix(col, col * vec3(0.94, 1.02, 0.99), hash1(cell + 11.3));

      // iron-green cast that real glass carries
      col *= vec3(0.95, 1.0, 0.975);

      // Grazing light picks out individual pebbles as hard sparkles — this is
      // what keeps the dark half reading as textured GLASS rather than a void,
      // which is the trap the earlier dark-vignette version fell into.
      vec3 L = normalize(vec3((lightPos - vUv) * vec2(uAspect, 1.0), 0.35));
      vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
      float spec = pow(max(dot(N, H), 0.0), 90.0);
      float sparkle = pow(max(dot(N, H), 0.0), 300.0);
      col += uLightColor * (spec * 0.5 + sparkle * 0.9);

      // structural joint: near-black metal channel with a cold edge catch
      float lampAtJoint = exp(-dot((vUv - lightPos) * vec2(uAspect, 1.0), (vUv - lightPos) * vec2(uAspect, 1.0)) * 1.6);
      vec3 jointCol = vec3(0.03, 0.05, 0.07) + uLightColor * lampAtJoint * 0.28;
      col = mix(col, jointCol, jointMask * 0.92);

      // hard specular edge along the bevel facing the light, deep shadow opposite
      float bevelFacing = dot(normalize(bevelDir + vec2(0.0001)), normalize((lightPos - vUv) * vec2(uAspect, 1.0)));
      col += uLightColor * bevelMask * pow(max(bevelFacing, 0.0), 1.5) * 0.5;
      col *= 1.0 - bevelMask * max(-bevelFacing, 0.0) * 0.55;

      // fine sandblast micro-grain
      col *= 0.985 + hash1(floor(vUv * vec2(1600.0 * uAspect, 1600.0))) * 0.03;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
);
