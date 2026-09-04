import { Delaunay } from "d3-delaunay";

export interface FracturePattern {
  /** Convex polygons in pane-local space, wound CCW, first point not repeated. */
  cells: number[][][];
  /**
   * Per cell, a width multiplier for the crack running from vertex i to i+1.
   * Cracks need a strong hierarchy — a few thick splits, many faint hairlines.
   * Uniform-weight lines everywhere are what make a fracture read as a road
   * map rather than broken glass.
   */
  cellEdgeWidths: number[][];
  /** Impact point in pane-local space. */
  impact: [number, number];
  width: number;
  height: number;
}

interface Options {
  width: number;
  height: number;
  /** Impact point in pane-local space (origin at pane centre). */
  impact: [number, number];
  /** Approximate upper bound on shard count. */
  maxCells?: number;
}

/**
 * Seeds a Voronoi diagram in POLAR coordinates around the impact point rather
 * than scattering points randomly.
 *
 * This is the difference between "cracked glass" and "generic mosaic": real
 * impact fracture has radial spokes running outward from the strike and
 * concentric rings crossing them. A polar lattice of seed points produces
 * exactly those two families of cell boundaries, because neighbours along an
 * arc share radial edges and neighbours along a spoke share arc edges.
 *
 * Ring radii grow geometrically, so shards are small and dense at the impact
 * and get progressively larger toward the edges of the pane.
 */
export function generateVoronoiCells({
  width,
  height,
  impact,
  maxCells = 420,
}: Options): FracturePattern {
  const [ix, iy] = impact;

  const halfW = width / 2;
  const halfH = height / 2;

  // furthest corner from the impact — rings must reach past it to cover the pane
  const maxRadius = Math.max(
    Math.hypot(-halfW - ix, -halfH - iy),
    Math.hypot(halfW - ix, -halfH - iy),
    Math.hypot(-halfW - ix, halfH - iy),
    Math.hypot(halfW - ix, halfH - iy),
  );

  const points: [number, number][] = [[ix, iy]];

  const inPane = (x: number, y: number) =>
    x > -halfW * 1.4 && x < halfW * 1.4 && y > -halfH * 1.4 && y < halfH * 1.4;

  // Major radial fractures: the handful of long cracks that run from the
  // strike right out to the edge of the pane. The polar lattice alone only
  // produces short radial segments between adjacent rings, so these are
  // forced explicitly — a pair of seed points straddling the ray puts a
  // Voronoi boundary exactly ON the ray, and chaining pairs outward along it
  // makes that boundary continuous for the full length of the crack.
  const majorCount = 5 + Math.floor(Math.random() * 4);
  const majorBase = Math.random() * Math.PI * 2;

  for (let m = 0; m < majorCount; m++) {
    const angle =
      majorBase +
      (m / majorCount) * Math.PI * 2 +
      (Math.random() - 0.5) * 0.35;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    // perpendicular, for offsetting the pair either side of the crack line
    const px = -uy;
    const py = ux;

    let r = maxRadius * 0.03;
    while (r < maxRadius * 1.2) {
      const eps = r * 0.16;
      const cxp = ix + ux * r;
      const cyp = iy + uy * r;
      if (inPane(cxp, cyp)) {
        points.push([cxp + px * eps, cyp + py * eps]);
        points.push([cxp - px * eps, cyp - py * eps]);
      }
      r *= 1.55;
    }
  }

  let spokes = 13;
  let radius = maxRadius * 0.022;
  const growth = 1.42;
  let ring = 0;

  // ONE offset shared by every ring. Giving each ring its own random offset
  // destroys the most important feature of impact fracture: long radial
  // cracks spearing from the strike to the edge. Those exist because the
  // radial cell boundaries of consecutive rings line up — which only happens
  // if the rings share their spoke angles. Per-ring offsets produced a
  // concentric doily instead.
  const spokeOffset = Math.random() * Math.PI * 2;

  while (radius < maxRadius * 1.15 && points.length < maxCells) {
    // Widen the spoke count as rings grow, otherwise outer cells become
    // absurdly long arcs. Doubling subdivides existing spokes rather than
    // replacing them, so the original radial lines survive out to the edge.
    if (ring > 0 && ring % 3 === 0) spokes *= 2;

    const angleStep = (Math.PI * 2) / spokes;

    for (let s = 0; s < spokes && points.length < maxCells; s++) {
      // Angular jitter kept small — enough to look organic, not enough to
      // break the radial alignment that makes the long cracks read.
      const angleJitter = (Math.random() - 0.5) * angleStep * 0.12;
      const radiusJitter = (Math.random() - 0.5) * radius * 0.42;

      const angle = spokeOffset + s * angleStep + angleJitter;
      const r = radius + radiusJitter;

      const x = ix + Math.cos(angle) * r;
      const y = iy + Math.sin(angle) * r;

      // keep seeds a little outside the pane too, so edge cells close cleanly
      if (inPane(x, y)) points.push([x, y]);
    }

    radius *= growth;
    ring++;
  }

  const delaunay = Delaunay.from(points);
  const voronoi = delaunay.voronoi([-halfW, -halfH, halfW, halfH]);

  const cells: number[][][] = [];
  const cellEdgeWidths: number[][] = [];
  for (let i = 0; i < points.length; i++) {
    const polygon = voronoi.cellPolygon(i);
    if (!polygon || polygon.length < 4) continue;
    // d3 repeats the first point to close the ring; drop it
    const { points: jaggedPoints, widths } = jagged(
      polygon.slice(0, -1).map((p) => [p[0], p[1]] as [number, number]),
      halfW,
      halfH,
    );
    cells.push(jaggedPoints);
    cellEdgeWidths.push(widths);
  }

  return { cells, cellEdgeWidths, impact, width, height };
}

/**
 * Kinks each straight Voronoi edge, because real glass cracks are jagged —
 * dead-straight edges are what make a fracture read as a computed diagram.
 *
 * The jitter MUST be a deterministic function of the edge's two endpoints.
 * Two neighbouring cells each generate their shared edge independently, so
 * if they jittered it differently the pieces would no longer tile — you'd get
 * gaps and overlaps along every crack. Hashing a canonical (order-independent)
 * key for the endpoint pair guarantees both cells produce identical points.
 */
function jagged(
  poly: [number, number][],
  halfW: number,
  halfH: number,
): { points: number[][]; widths: number[] } {
  const SUBDIVISIONS = 3;
  const EPS = 1e-6;
  const out: number[][] = [];
  const widths: number[] = [];

  // An edge lying along the pane's own border isn't a crack — jittering it
  // pulls the outermost shards off the edge of the screen and lets the
  // background show through as black notches.
  const onBorder = (p: [number, number]) =>
    Math.abs(Math.abs(p[0]) - halfW) < 1e-4 || Math.abs(Math.abs(p[1]) - halfH) < 1e-4;

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];

    out.push([a[0], a[1]]);

    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);

    // The pane's own border is not a crack, so it gets zero width and draws
    // no line at all — otherwise a bright rectangle frames the screen.
    if (len < EPS || (onBorder(a) && onBorder(b))) {
      widths.push(0);
      continue;
    }

    // canonical direction, so both adjacent cells walk the edge the same way
    const forward = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
    const from = forward ? a : b;
    const to = forward ? b : a;
    const key = edgeKey(from, to);

    const nx = -(to[1] - from[1]) / len;
    const ny = (to[0] - from[0]) / len;

    // Heavily skewed so most cracks are faint hairlines and a handful are
    // thick, chunky splits. Hashed from the shared edge key so the two cells
    // either side of a crack always agree on how wide it is.
    const widthFactor = 0.3 + Math.pow(hash(key + ":w"), 3.0) * 2.4;

    const interior: number[][] = [];
    for (let s = 1; s < SUBDIVISIONS; s++) {
      const t = s / SUBDIVISIONS;
      // kept modest — glass runs fairly straight between junctions and only
      // kinks a little, so heavy jitter reads as noise rather than fracture
      const offset = (hash(key + ":" + s) - 0.5) * len * 0.12;
      interior.push([
        from[0] + (to[0] - from[0]) * t + nx * offset,
        from[1] + (to[1] - from[1]) * t + ny * offset,
      ]);
    }

    if (!forward) interior.reverse();
    out.push(...interior);
    // one width per emitted sub-segment, so a crack keeps a consistent
    // thickness along its whole length
    for (let s = 0; s < SUBDIVISIONS; s++) widths.push(widthFactor);
  }

  return { points: out, widths };
}

function edgeKey(a: [number, number], b: [number, number]): string {
  return `${a[0].toFixed(4)},${a[1].toFixed(4)}|${b[0].toFixed(4)},${b[1].toFixed(4)}`;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
