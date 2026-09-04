import * as THREE from "three";
import type { FracturePattern } from "./generateVoronoiCells";

/**
 * Builds ONE merged BufferGeometry containing every shard.
 *
 * Note this deliberately does not use InstancedMesh: instancing requires all
 * instances to share a single geometry, but every Voronoi shard is a different
 * polygon. Merging into one buffer gets the same one-draw-call benefit, and
 * the per-shard attributes below (centroid / random / distance-from-impact)
 * let a vertex shader rigid-transform each shard independently later, so the
 * tumble costs nothing on the CPU.
 *
 * Attributes emitted per vertex:
 *  - aPaneUv    original UV on the intact pane, so shards keep sampling the
 *               same light field and the break is seamless
 *  - aCentroid  shard centre, for rotating each piece about itself
 *  - aRandom    stable per-shard randomness for motion variation
 *  - aEdge      1 at the shard centre, 0 at its outline — drives crack shading
 *  - aDist      normalised distance of the shard from the impact point, for
 *               staggering the break outward from the strike
 */
export function buildFractureGeometry(
  pattern: FracturePattern,
  depth = 0.05,
): THREE.BufferGeometry {
  const { cells, cellEdgeWidths, impact, width, height } = pattern;

  const positions: number[] = [];
  const normals: number[] = [];
  const paneUvs: number[] = [];
  const centroidUvs: number[] = [];
  const centroids: number[] = [];
  const randoms: number[] = [];
  const edges: number[] = [];
  const edgeWidths: number[] = [];
  const dists: number[] = [];

  const halfDepth = depth / 2;

  const maxDist = Math.max(
    Math.hypot(width / 2 - impact[0], height / 2 - impact[1]),
    Math.hypot(-width / 2 - impact[0], -height / 2 - impact[1]),
  );

  const uvOf = (x: number, y: number): [number, number] => [
    x / width + 0.5,
    y / height + 0.5,
  ];

  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci];
    if (cell.length < 3) continue;

    // guarantee CCW winding so side-face normals point outward
    let area = 0;
    for (let i = 0; i < cell.length; i++) {
      const [x1, y1] = cell[i];
      const [x2, y2] = cell[(i + 1) % cell.length];
      area += x1 * y2 - x2 * y1;
    }

    let poly = cell;
    let widths = cellEdgeWidths[ci];
    if (area < 0) {
      // reversing the ring also remaps which edge each width belongs to:
      // segment j of the reversed ring is the reverse of segment n-2-j
      const n = cell.length;
      const rp: number[][] = [];
      const rw: number[] = [];
      for (let j = 0; j < n; j++) {
        rp.push(cell[n - 1 - j]);
        rw.push(widths[(((n - 2 - j) % n) + n) % n]);
      }
      poly = rp;
      widths = rw;
    }

    let cx = 0;
    let cy = 0;
    for (const [x, y] of poly) {
      cx += x;
      cy += y;
    }
    cx /= poly.length;
    cy /= poly.length;

    // No inset here: the pane must be perfectly seamless until it actually
    // cracks. The gap is opened in the vertex shader instead, per shard, at
    // the moment that piece breaks — which is also what lets the very first
    // frame after the click be indistinguishable from the intact pane.
    const inset = poly;

    const rand = [Math.random(), Math.random(), Math.random()];
    const dist = Math.min(1, Math.hypot(cx - impact[0], cy - impact[1]) / maxDist);
    const [ccu, ccv] = uvOf(cx, cy);

    const push = (
      x: number,
      y: number,
      z: number,
      nx: number,
      ny: number,
      nz: number,
      edge: number,
      edgeWidth: number,
      uv?: [number, number],
    ) => {
      positions.push(x, y, z);
      normals.push(nx, ny, nz);
      const [u, v] = uv ?? uvOf(x, y);
      paneUvs.push(u, v);
      // carried on every vertex, not just the centre ones, so the fragment
      // shader can rotate each shard's view about its own centre
      centroidUvs.push(ccu, ccv);
      centroids.push(cx, cy, 0);
      randoms.push(rand[0], rand[1], rand[2]);
      edges.push(edge);
      edgeWidths.push(edgeWidth);
      dists.push(dist);
    };

    for (let i = 0; i < inset.length; i++) {
      const a = inset[i];
      const b = inset[(i + 1) % inset.length];

      // Because the geometry is non-indexed, each triangle owns its own copies
      // of a and b — which is what lets every edge carry its own crack width.
      const ew = widths[i] ?? 1;

      // front face — fan from the centroid, aEdge 1 at centre / 0 at outline
      push(cx, cy, halfDepth, 0, 0, 1, 1, ew, [ccu, ccv]);
      push(a[0], a[1], halfDepth, 0, 0, 1, 0, ew);
      push(b[0], b[1], halfDepth, 0, 0, 1, 0, ew);

      // back face, reversed winding
      push(cx, cy, -halfDepth, 0, 0, -1, 1, ew, [ccu, ccv]);
      push(b[0], b[1], -halfDepth, 0, 0, -1, 0, ew);
      push(a[0], a[1], -halfDepth, 0, 0, -1, 0, ew);

      // side wall — the cut edge of the glass
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = dy / len;
      const ny = -dx / len;

      push(a[0], a[1], halfDepth, nx, ny, 0, 0, ew);
      push(a[0], a[1], -halfDepth, nx, ny, 0, 0, ew);
      push(b[0], b[1], -halfDepth, nx, ny, 0, 0, ew);

      push(a[0], a[1], halfDepth, nx, ny, 0, 0, ew);
      push(b[0], b[1], -halfDepth, nx, ny, 0, 0, ew);
      push(b[0], b[1], halfDepth, nx, ny, 0, 0, ew);
    }
  }

  const geometry = new THREE.BufferGeometry();
  const attr = (data: number[], size: number) =>
    new THREE.BufferAttribute(new Float32Array(data), size);

  geometry.setAttribute("position", attr(positions, 3));
  geometry.setAttribute("normal", attr(normals, 3));
  geometry.setAttribute("aPaneUv", attr(paneUvs, 2));
  geometry.setAttribute("aCentroidUv", attr(centroidUvs, 2));
  geometry.setAttribute("aCentroid", attr(centroids, 3));
  geometry.setAttribute("aRandom", attr(randoms, 3));
  geometry.setAttribute("aEdge", attr(edges, 1));
  geometry.setAttribute("aEdgeWidth", attr(edgeWidths, 1));
  geometry.setAttribute("aDist", attr(dists, 1));

  return geometry;
}
