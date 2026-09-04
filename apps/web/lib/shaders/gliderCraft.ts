import { shaderMaterial } from "@react-three/drei";
import * as THREE from "three";

// The player's craft: obsidian hull with every facet edge lit.
//
// An earlier version put a bright inner mesh inside an opaque hull, which
// hid the glow completely and left a near-black silhouette invisible against
// a dark world. The craft has to carry its own light — it is the one thing
// on screen the player must never lose track of.
export const GliderCraftMaterial = shaderMaterial(
  {
    uTime: 0,
    uHull: new THREE.Color("#0b0a1f"),
    uEdge: new THREE.Color("#7ff0ff"),
    uCore: new THREE.Color("#2bd6ff"),
  },
  /* glsl */ `
    attribute vec3 aBary;

    varying vec3 vBary;
    varying vec3 vNormalW;
    varying vec3 vViewDir;

    void main() {
      vBary = aBary;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vec4 world = modelMatrix * vec4(position, 1.0);
      vViewDir = normalize(cameraPosition - world.xyz);
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  /* glsl */ `
    uniform float uTime;
    uniform vec3 uHull;
    uniform vec3 uEdge;
    uniform vec3 uCore;

    varying vec3 vBary;
    varying vec3 vNormalW;
    varying vec3 vViewDir;

    void main() {
      vec3 N = normalize(vNormalW);
      vec3 L = normalize(vec3(-0.4, 0.35, 0.85));
      float lambert = max(dot(N, L), 0.0);

      vec3 col = uHull * (0.5 + lambert * 1.1);

      // every facet edge lit — on a craft this reads as engineered structure,
      // unlike the islands where lighting all of them looked like a wireframe
      float edge = min(min(vBary.x, vBary.y), vBary.z);
      float seam = 1.0 - smoothstep(0.0, fwidth(edge) * 2.0, edge);
      float pulse = 0.8 + 0.2 * sin(uTime * 3.0);
      col += uEdge * seam * pulse * 1.8;

      float fres = pow(1.0 - max(dot(N, normalize(vViewDir)), 0.0), 2.5);
      col += uCore * fres * 0.9;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
);
