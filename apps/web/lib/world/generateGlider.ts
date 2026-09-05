import * as THREE from "three";

type P = [number, number, number];

/**
 * The Crystalline Light-Glider: a swept manta/dart in faceted obsidian,
 * built from explicit triangles rather than a model file to stay consistent
 * with the rest of the procedural pipeline.
 *
 * Local axes match this world's convention: +X forward, +Z up.
 *
 * Detailed beyond a bare dart because at chase-camera distance the craft
 * fills a good part of the screen and a plain wedge reads as a placeholder.
 * The additions are all silhouette — canopy, swept tail fins, winglets,
 * thruster pods — since the material lights facet EDGES, so every extra
 * plane adds another lit line rather than just more dark surface.
 */
export function generateGlider(): THREE.BufferGeometry {
  const tris: P[][] = [];
  const quad = (a: P, b: P, c: P, d: P) => {
    tris.push([a, b, c], [a, c, d]);
  };

  // ---- main hull ---------------------------------------------------------
  const nose: P = [1.65, 0, -0.02];
  const spineHigh: P = [-0.05, 0, 0.3];
  const spineLow: P = [-0.05, 0, -0.18];
  const tail: P = [-1.05, 0, 0.05];
  const midL: P = [0.2, 0.44, 0.02];
  const midR: P = [0.2, -0.44, 0.02];

  tris.push(
    [nose, midL, spineHigh],
    [nose, spineHigh, midR],
    [spineHigh, midL, tail],
    [spineHigh, tail, midR],
    [nose, spineLow, midL],
    [nose, midR, spineLow],
    [spineLow, tail, midL],
    [spineLow, midR, tail],
  );

  // ---- wings, swept back with a kink halfway ------------------------------
  const kinkL: P = [-0.25, 0.95, 0.0];
  const kinkR: P = [-0.25, -0.95, 0.0];
  const tipL: P = [-0.78, 1.5, 0.06];
  const tipR: P = [-0.78, -1.5, 0.06];

  tris.push(
    [midL, kinkL, tail],
    [midR, tail, kinkR],
    [kinkL, tipL, tail],
    [kinkR, tail, tipR],
    // underside of each wing, so they have thickness rather than being paper
    [midL, tail, kinkL],
    [midR, kinkR, tail],
  );

  // ---- winglets turned up at each tip -------------------------------------
  const wingletL: P = [-0.72, 1.42, 0.42];
  const wingletR: P = [-0.72, -1.42, 0.42];
  tris.push([tipL, wingletL, kinkL], [tipR, kinkR, wingletR]);

  // ---- cockpit canopy ----------------------------------------------------
  const canopyFront: P = [0.72, 0, 0.16];
  const canopyPeak: P = [0.28, 0, 0.42];
  const canopyL: P = [0.3, 0.2, 0.2];
  const canopyR: P = [0.3, -0.2, 0.2];
  tris.push(
    [canopyFront, canopyL, canopyPeak],
    [canopyFront, canopyPeak, canopyR],
    [canopyPeak, canopyL, spineHigh],
    [canopyPeak, spineHigh, canopyR],
  );

  // ---- twin tail fins, angled outward -------------------------------------
  const finBaseFL: P = [-0.55, 0.26, 0.06];
  const finBaseBL: P = [-1.0, 0.2, 0.06];
  const finTipL: P = [-0.92, 0.46, 0.58];
  tris.push([finBaseFL, finBaseBL, finTipL]);

  const finBaseFR: P = [-0.55, -0.26, 0.06];
  const finBaseBR: P = [-1.0, -0.2, 0.06];
  const finTipR: P = [-0.92, -0.46, 0.58];
  tris.push([finBaseFR, finTipR, finBaseBR]);

  // ---- thruster pods slung under the wing roots ---------------------------
  const pod = (side: number) => {
    const y0 = side * 0.28;
    const y1 = side * 0.52;
    const front = -0.1;
    const back = -0.95;
    const top = -0.04;
    const bottom = -0.26;

    quad(
      [front, y0, top],
      [front, y1, top],
      [back, y1, top],
      [back, y0, top],
    );
    quad(
      [front, y0, bottom],
      [back, y0, bottom],
      [back, y1, bottom],
      [front, y1, bottom],
    );
    quad(
      [front, y1, top],
      [front, y1, bottom],
      [back, y1, bottom],
      [back, y1, top],
    );
    quad(
      [front, y0, top],
      [back, y0, top],
      [back, y0, bottom],
      [front, y0, bottom],
    );
    // exhaust face
    quad(
      [back, y0, top],
      [back, y1, top],
      [back, y1, bottom],
      [back, y0, bottom],
    );
  };
  pod(1);
  pod(-1);

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
