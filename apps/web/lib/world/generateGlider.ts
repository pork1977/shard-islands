import * as THREE from "three";

/**
 * The Crystalline Light-Glider: a swept manta/dart silhouette in faceted
 * obsidian, built from explicit triangles rather than a model file to stay
 * consistent with the rest of the procedural pipeline.
 *
 * Local axes match the world's convention here: +X is forward, +Z is up.
 */
export function generateGlider(): THREE.BufferGeometry {
  const nose: [number, number, number] = [1.5, 0, 0];
  const tail: [number, number, number] = [-1.0, 0, 0.06];
  const spineHigh: [number, number, number] = [-0.1, 0, 0.28];
  const spineLow: [number, number, number] = [-0.1, 0, -0.16];
  const wingL: [number, number, number] = [-0.75, 1.35, -0.02];
  const wingR: [number, number, number] = [-0.75, -1.35, -0.02];
  const midL: [number, number, number] = [0.25, 0.42, 0.02];
  const midR: [number, number, number] = [0.25, -0.42, 0.02];

  const tris: [number, number, number][][] = [
    // upper hull
    [nose, midL, spineHigh],
    [nose, spineHigh, midR],
    [spineHigh, midL, tail],
    [spineHigh, tail, midR],
    // lower hull
    [nose, spineLow, midL],
    [nose, midR, spineLow],
    [spineLow, tail, midL],
    [spineLow, midR, tail],
    // wings, swept back from the mid spar
    [midL, wingL, tail],
    [midR, tail, wingR],
    [midL, tail, wingL],
    [midR, wingR, tail],
  ];

  const positions: number[] = [];
  const bary: number[] = [];
  for (const t of tris) {
    for (let i = 0; i < 3; i++) {
      positions.push(t[i][0], t[i][1], t[i][2]);
      bary.push(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setAttribute("aBary", new THREE.BufferAttribute(new Float32Array(bary), 3));
  geometry.computeVertexNormals();
  return geometry;
}
