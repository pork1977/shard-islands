import { Delaunay } from "d3-delaunay";

export interface FracturePattern {
  /** Convex polygons in pane-local space, wound CCW, first point not repeated. */
  cells: number[][][];
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

  let spokes = 13;
  let radius = maxRadius * 0.022;
  const growth = 1.42;
  let ring = 0;

  while (radius < maxRadius * 1.15 && points.length < maxCells) {
    // Widen the spoke count as rings grow, otherwise outer cells become
    // absurdly long arcs. Doubling (rather than a smooth increase) keeps
    // spokes aligned across rings so radial cracks stay continuous.
    if (ring > 0 && ring % 3 === 0) spokes *= 2;

    // per-ring angular offset so spokes aren't a perfectly rigid starburst
    const ringOffset = Math.random() * Math.PI * 2;
    const angleStep = (Math.PI * 2) / spokes;

    for (let s = 0; s < spokes && points.length < maxCells; s++) {
      // jitter scaled to local cell size, so it reads organic at every radius
      const angleJitter = (Math.random() - 0.5) * angleStep * 0.55;
      const radiusJitter = (Math.random() - 0.5) * radius * 0.42;

      const angle = ringOffset + s * angleStep + angleJitter;
      const r = radius + radiusJitter;

      const x = ix + Math.cos(angle) * r;
      const y = iy + Math.sin(angle) * r;

      // keep seeds a little outside the pane too, so edge cells close cleanly
      if (
        x > -halfW * 1.4 &&
        x < halfW * 1.4 &&
        y > -halfH * 1.4 &&
        y < halfH * 1.4
      ) {
        points.push([x, y]);
      }
    }

    radius *= growth;
    ring++;
  }

  const delaunay = Delaunay.from(points);
  const voronoi = delaunay.voronoi([-halfW, -halfH, halfW, halfH]);

  const cells: number[][][] = [];
  for (let i = 0; i < points.length; i++) {
    const polygon = voronoi.cellPolygon(i);
    if (!polygon || polygon.length < 4) continue;
    // d3 repeats the first point to close the ring; drop it
    cells.push(polygon.slice(0, -1).map((p) => [p[0], p[1]]));
  }

  return { cells, impact, width, height };
}
