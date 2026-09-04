import * as THREE from "three";

// Shared glass shading, used by BOTH the intact pane and the fracture shards.
// This matters for the transition: shards sample the light field at their
// ORIGINAL pane UV, so the instant the pane breaks it still looks like the
// same unbroken pane — only the crack lines appear. Nothing pops or shifts
// tone at the moment of impact. Duplicating the shading in two files would
// let the two drift apart and break exactly that illusion.

export function glassUniformDefaults() {
  return {
    uTime: 0,
    uAspect: 1.777,
    uNormalMap: null as THREE.Texture | null,
    uGlassColor: new THREE.Color("#0c161e"),
    uLightColor: new THREE.Color("#9dc6e8"),
    uCoolColor: new THREE.Color("#14323f"),
    uLightPos: new THREE.Vector2(0.18, 0.88),
  };
}

export const GLASS_UNIFORMS_GLSL = /* glsl */ `
  uniform float uTime;
  uniform float uAspect;
  uniform sampler2D uNormalMap;
  uniform vec3 uGlassColor;
  uniform vec3 uLightColor;
  uniform vec3 uCoolColor;
  uniform vec2 uLightPos;
`;

export const GLASS_HELPERS_GLSL = /* glsl */ `
  float hash1(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // Very slow drift, like light changing outside.
  vec2 glassLightPos() {
    return uLightPos + vec2(sin(uTime * 0.05) * 0.015, cos(uTime * 0.04) * 0.01);
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

  // Density driven by the NARROWER axis — keying it to height alone left a
  // portrait phone showing ~1.5 tiles across.
  float glassTilesY() {
    return 3.0 / min(1.0, uAspect);
  }

  // Full lit glass colour for a point on the pane, in pane UV space.
  vec3 glassSurface(vec2 paneUv) {
    vec2 lightPos = glassLightPos();
    float tilesY = glassTilesY();

    vec2 tileUv = vec2(paneUv.x * uAspect, paneUv.y) * tilesY;
    vec2 cell = floor(tileUv);
    vec2 f = fract(tileUv);
    vec2 edgeDist = min(f, 1.0 - f);
    float d = min(edgeDist.x, edgeDist.y);

    float jointHalf = 0.016;
    float bevelRun = 0.06;
    float jointMask = smoothstep(jointHalf, jointHalf * 0.45, d);
    float bevelMask = smoothstep(bevelRun, jointHalf, d) * (1.0 - jointMask);

    vec2 bevelDir;
    if (edgeDist.x < edgeDist.y) {
      bevelDir = vec2(f.x < 0.5 ? -1.0 : 1.0, 0.0);
    } else {
      bevelDir = vec2(0.0, f.y < 0.5 ? -1.0 : 1.0);
    }

    // two octaves of rolled-glass pebbling, keyed to tile size so the
    // pebbles-per-tile ratio stays constant at any aspect
    vec2 texUv = vec2(paneUv.x * uAspect, paneUv.y);
    vec3 mapN = texture2D(uNormalMap, texUv * (tilesY * 1.8)).rgb * 2.0 - 1.0;
    vec3 mapN2 = texture2D(uNormalMap, texUv * (tilesY * 0.57) + 0.37).rgb * 2.0 - 1.0;
    vec2 surfaceN = mapN.xy * 0.6 + mapN2.xy * 0.3;

    vec3 N = normalize(vec3(surfaceN + bevelDir * bevelMask * 0.9, 1.0));

    // refraction: sample the light field displaced by the surface normal
    vec3 col = behindGlass(paneUv + N.xy * 0.045, lightPos);
    // wider tap approximates the frost scattering light sideways
    col = mix(col, behindGlass(paneUv + N.xy * 0.13, lightPos), 0.35);

    float tileVar = hash1(cell + 3.7);
    col *= 0.93 + tileVar * 0.14;
    col = mix(col, col * vec3(0.94, 1.02, 0.99), hash1(cell + 11.3));
    col *= vec3(0.95, 1.0, 0.975);

    // Grazing light picks out individual pebbles as hard sparkles — this is
    // what keeps the dark half reading as textured GLASS rather than a void.
    vec3 L = normalize(vec3((lightPos - paneUv) * vec2(uAspect, 1.0), 0.35));
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(N, H), 0.0), 90.0);
    float sparkle = pow(max(dot(N, H), 0.0), 300.0);
    col += uLightColor * (spec * 0.5 + sparkle * 0.9);

    float lampAtJoint = exp(-dot((paneUv - lightPos) * vec2(uAspect, 1.0), (paneUv - lightPos) * vec2(uAspect, 1.0)) * 1.6);
    vec3 jointCol = vec3(0.03, 0.05, 0.07) + uLightColor * lampAtJoint * 0.28;
    col = mix(col, jointCol, jointMask * 0.92);

    float bevelFacing = dot(normalize(bevelDir + vec2(0.0001)), normalize((lightPos - paneUv) * vec2(uAspect, 1.0)));
    col += uLightColor * bevelMask * pow(max(bevelFacing, 0.0), 1.5) * 0.5;
    col *= 1.0 - bevelMask * max(-bevelFacing, 0.0) * 0.55;

    col *= 0.985 + hash1(floor(paneUv * vec2(1600.0 * uAspect, 1600.0))) * 0.03;
    return col;
  }
`;
