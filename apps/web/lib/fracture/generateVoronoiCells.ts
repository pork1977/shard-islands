import { Delaunay } from "d3-delaunay";
import { MAJOR_CRACKS_MAX, MAJOR_CRACKS_MIN } from "./crackLook";

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
  maxCells = 460,
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
  const majorCount =
    MAJOR_CRACKS_MIN +
    Math.floor(Math.random() * (MAJOR_CRACKS_MAX - MAJOR_CRACKS_MIN + 1));
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
      const eps = r * 0.13;
      const cxp = ix + ux * r;
      const cyp = iy + uy * r;
      if (inPane(cxp, cyp)) {
        points.push([cxp + px * eps, cyp + py * eps]);
        points.push([cxp - px * eps, cyp - py * eps]);
      }
      // Close enough that the boundary between successive pairs stays on
      // the ray, far enough apart that the rays do not themselves become a
      // radial grid. At 1.32 they did exactly that.
      r *= 1.46;
    }
  }

  // ---- the field between the cracks --------------------------------------
  //
  // Scattered, NOT a polar lattice.
  //
  // Rings of seeds were the original idea and they are the reason the pane
  // read as a dartboard: seeds at a shared radius share arc-shaped
  // boundaries, so however much they are jittered or interleaved, the eye
  // still assembles them into circles. Widening the jitter only made the
  // circles fuzzy, and staggering alternate rings turned the whole pane into
  // a spider web.
  //
  // The long radial cracks no longer need the lattice: they are the majors
  // above, explicit and a dozen or more of them. That frees this to be what
  // impact fracture actually leaves between its cracks — irregular plates,
  // small and dense at the strike, large and lazy toward the frame.
  //
  // Density falls off with radius by sampling r as a power of a uniform,
  // which crowds seeds toward the impact without any structure at all.
  const scatterTarget = Math.min(maxCells - points.length, 300);
  let guard = 0;
  while (points.length < maxCells && guard < scatterTarget * 40) {
    guard++;
    // 2.1 is the shape of the falloff: 1.0 would spread seeds evenly along
    // the radius, and higher numbers pull them in toward the strike.
    const r = maxRadius * 1.15 * Math.pow(Math.random(), 2.1);
    const angle = Math.random() * Math.PI * 2;
    const x = ix + Math.cos(angle) * r;
    const y = iy + Math.sin(angle) * r;
    if (inPane(x, y)) points.push([x, y]);
  }

  // A thin uniform sprinkle as well, so the far corners are not one enormous
  // plate each — the falloff above leaves them almost empty.
  for (let i = 0; i < 26 && points.length < maxCells; i++) {
    const x = (Math.random() - 0.5) * width * 1.15;
    const y = (Math.random() - 0.5) * height * 1.15;
    points.push([x, y]);
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
