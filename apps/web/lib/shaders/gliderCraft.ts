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
      vec3 V = normalize(vViewDir);
      vec3 L = normalize(vec3(-0.4, 0.35, 0.85));

      // Glass, not painted metal: faces you look straight through are nearly
      // clear, and the material gathers toward the grazing angles. Fresnel
      // drives BOTH the brightness and the opacity, which is what separates
      // glass from a tinted solid.
      float fres = pow(1.0 - max(dot(N, V), 0.0), 2.2);

      vec3 col = uHull * 0.35;
      col += uCore * fres * 1.5;

      // hard specular glint off the facets
      vec3 H = normalize(L + V);
      col += vec3(1.0) * pow(max(dot(N, H), 0.0), 90.0) * 1.4;

      // lit facet edges hold the silhouette together when the body is clear
      float edge = min(min(vBary.x, vBary.y), vBary.z);
      float seam = 1.0 - smoothstep(0.0, fwidth(edge) * 2.0, edge);
      float pulse = 0.85 + 0.15 * sin(uTime * 3.0);
      col += uEdge * seam * pulse * 1.6;

      // clear in the middle, solid at the rim and along every edge
      float alpha = clamp(0.16 + fres * 0.72 + seam * 0.9, 0.0, 1.0);

      gl_FragColor = vec4(col, alpha);
    }
  `,
);
