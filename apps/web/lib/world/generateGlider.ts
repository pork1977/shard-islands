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
/**
 * How a rare form changes the SHAPE, not just the colour.
 *
 * The first attempt at this only swapped hull, edge and core colours, which
 * made three craft that were unmistakably the same dart painted three ways.
 * A transformation has to change the silhouette, because the silhouette is
 * all anyone has at two hundred metres.
 *
 * The topology is untouched — every form is the same list of triangles —
 * and only the control points move. That keeps one shape to maintain rather
 * than four, and it means a change to the craft is inherited by all of them.
 *
 * `sweep` shears the wings along their span: positive rakes them backward,
 * negative throws them forward, which is most of what tells a bird of prey
 * from a dart.
 */
interface Form {
  /** Along the body. */
  x: number;
  /** Across the span. */
  y: number;
  /** Through the height. */
  z: number;
  /** Backward rake proportional to span. Negative sweeps forward. */
  sweep: number;
  /** Engine pods, which read as machinery. A bird does not have them. */
  pods: boolean;
  /** Long trailing streamers off the tail. */
  feathers: boolean;
  /** The canopy, which is the one part that says "somebody is inside". */
  canopy: boolean;
}

const FORMS: Record<number, Form> = {
  // The glider everyone starts in.
  0: { x: 1, y: 1, z: 1, sweep: 0, pods: true, feathers: false, canopy: true },
  // PHOENIX — a bird. Long wings thrown forward, a streaming tail, and no
  // machinery anywhere on it.
  1: { x: 1.1, y: 1.85, z: 0.8, sweep: -0.42, pods: false, feathers: true, canopy: false },
  // PRISM — not a plane at all. The span collapses and the body stretches
  // into a tall faceted spike: the shard you fell through, still falling.
  2: { x: 1.5, y: 0.34, z: 2.4, sweep: 0.15, pods: false, feathers: false, canopy: false },
  // VOID — a wide, flat, raked manta. Reads as a hole rather than a craft,
  // which is the whole idea, so it keeps no canopy and no highlights.
  3: { x: 0.8, y: 2.3, z: 0.5, sweep: 0.62, pods: true, feathers: false, canopy: false },
};

const cache = new Map<number, THREE.BufferGeometry>();

export function generateGlider(plumage = 0): THREE.BufferGeometry {
  const cached = cache.get(plumage);
  if (cached) return cached;

  const f = FORMS[plumage] ?? FORMS[0];

  /** Every control point goes through here, so no form can forget one. */
  const s = (p: P): P => {
    const y = p[1] * f.y;
    return [p[0] * f.x - f.sweep * Math.abs(y), y, p[2] * f.z];
  };

  const tris: P[][] = [];
  const quad = (a: P, b: P, c: P, d: P) => {
    tris.push([a, b, c], [a, c, d]);
  };

  // ---- main hull ---------------------------------------------------------
  const nose: P = s([1.65, 0, -0.02]);
  const spineHigh: P = s([-0.05, 0, 0.3]);
  const spineLow: P = s([-0.05, 0, -0.18]);
  const tail: P = s([-1.05, 0, 0.05]);
  const midL: P = s([0.2, 0.44, 0.02]);
  const midR: P = s([0.2, -0.44, 0.02]);

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
  const kinkL: P = s([-0.25, 0.95, 0.0]);
  const kinkR: P = s([-0.25, -0.95, 0.0]);
  const tipL: P = s([-0.78, 1.5, 0.06]);
  const tipR: P = s([-0.78, -1.5, 0.06]);

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
  const wingletL: P = s([-0.72, 1.42, 0.42]);
  const wingletR: P = s([-0.72, -1.42, 0.42]);
  tris.push([tipL, wingletL, kinkL], [tipR, kinkR, wingletR]);

  // ---- cockpit canopy ----------------------------------------------------
  const canopyFront: P = s([0.72, 0, 0.16]);
  const canopyPeak: P = s([0.28, 0, 0.42]);
  const canopyL: P = s([0.3, 0.2, 0.2]);
  const canopyR: P = s([0.3, -0.2, 0.2]);
  if (f.canopy) {
    tris.push(
      [canopyFront, canopyL, canopyPeak],
      [canopyFront, canopyPeak, canopyR],
      [canopyPeak, canopyL, spineHigh],
      [canopyPeak, spineHigh, canopyR],
    );
  }

  // ---- twin tail fins, angled outward -------------------------------------
  const finBaseFL: P = s([-0.55, 0.26, 0.06]);
  const finBaseBL: P = s([-1.0, 0.2, 0.06]);
  const finTipL: P = s([-0.92, 0.46, 0.58]);
  tris.push([finBaseFL, finBaseBL, finTipL]);

  const finBaseFR: P = s([-0.55, -0.26, 0.06]);
  const finBaseBR: P = s([-1.0, -0.2, 0.06]);
  const finTipR: P = s([-0.92, -0.46, 0.58]);
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
      s([front, y0, top]),
      s([front, y1, top]),
      s([back, y1, top]),
      s([back, y0, top]),
    );
    quad(
      s([front, y0, bottom]),
      s([back, y0, bottom]),
      s([back, y1, bottom]),
      s([front, y1, bottom]),
    );
    quad(
      s([front, y1, top]),
      s([front, y1, bottom]),
      s([back, y1, bottom]),
      s([back, y1, top]),
    );
    quad(
      s([front, y0, top]),
      s([back, y0, top]),
      s([back, y0, bottom]),
      s([front, y0, bottom]),
    );
    // exhaust face
    quad(
      s([back, y0, top]),
      s([back, y1, top]),
      s([back, y1, bottom]),
      s([back, y0, bottom]),
    );
  };
  if (f.pods) {
    pod(1);
    pod(-1);
  }

  // ---- tail streamers, for the one form that is a bird --------------------
  // Two long trailing feathers off the tail. They are what turns a wing
  // shape into something alive: the wings say bird of prey, these say it is
  // flying rather than gliding.
  if (f.feathers) {
    const root = 0.16 * f.y;
    for (const side of [1, -1]) {
      const a = s([-0.9, side * 0.1, 0.04]);
      const b = s([-0.95, side * 0.3, 0.02]);
      const tipInner: P = [tail[0] - 2.4 * f.x, side * root, tail[2] + 0.1 * f.z];
      const tipOuter: P = [tail[0] - 1.7 * f.x, side * root * 2.4, tail[2] - 0.05 * f.z];
      tris.push([a, b, tipInner], [b, tipOuter, tipInner]);
    }
  }

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
  cache.set(plumage, geometry);
  return geometry;
}
