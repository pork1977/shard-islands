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
  const { cells, impact, width, height } = pattern;

  const positions: number[] = [];
  const normals: number[] = [];
  const paneUvs: number[] = [];
  const centroids: number[] = [];
  const randoms: number[] = [];
  const edges: number[] = [];
  const dists: number[] = [];

  const halfDepth = depth / 2;
  // hairline gap between pieces so the crack lines are actually visible
  const gap = Math.min(width, height) * 0.0016;

  const maxDist = Math.max(
    Math.hypot(width / 2 - impact[0], height / 2 - impact[1]),
    Math.hypot(-width / 2 - impact[0], -height / 2 - impact[1]),
  );

  const uvOf = (x: number, y: number): [number, number] => [
    x / width + 0.5,
    y / height + 0.5,
  ];

  for (const cell of cells) {
    if (cell.length < 3) continue;

    // guarantee CCW winding so side-face normals point outward
    let area = 0;
    for (let i = 0; i < cell.length; i++) {
      const [x1, y1] = cell[i];
      const [x2, y2] = cell[(i + 1) % cell.length];
      area += x1 * y2 - x2 * y1;
    }
    const poly = area < 0 ? [...cell].reverse() : cell;

    let cx = 0;
    let cy = 0;
    for (const [x, y] of poly) {
      cx += x;
      cy += y;
    }
    cx /= poly.length;
    cy /= poly.length;

    // shrink slightly toward the centre to open the crack gap, clamped so
    // tiny shards near the impact can't invert
    const inset = poly.map(([x, y]) => {
      const dx = cx - x;
      const dy = cy - y;
      const len = Math.hypot(dx, dy) || 1;
      const t = Math.min(gap / len, 0.34);
      return [x + dx * t, y + dy * t] as [number, number];
    });

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
      uv?: [number, number],
    ) => {
      positions.push(x, y, z);
      normals.push(nx, ny, nz);
      const [u, v] = uv ?? uvOf(x, y);
      paneUvs.push(u, v);
      centroids.push(cx, cy, 0);
      randoms.push(rand[0], rand[1], rand[2]);
      edges.push(edge);
      dists.push(dist);
    };

    for (let i = 0; i < inset.length; i++) {
      const a = inset[i];
      const b = inset[(i + 1) % inset.length];

      // front face — fan from the centroid, aEdge 1 at centre / 0 at outline
      push(cx, cy, halfDepth, 0, 0, 1, 1, [ccu, ccv]);
      push(a[0], a[1], halfDepth, 0, 0, 1, 0);
      push(b[0], b[1], halfDepth, 0, 0, 1, 0);

      // back face, reversed winding
      push(cx, cy, -halfDepth, 0, 0, -1, 1, [ccu, ccv]);
      push(b[0], b[1], -halfDepth, 0, 0, -1, 0);
      push(a[0], a[1], -halfDepth, 0, 0, -1, 0);

      // side wall — the cut edge of the glass
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = dy / len;
      const ny = -dx / len;

      push(a[0], a[1], halfDepth, nx, ny, 0, 0);
      push(a[0], a[1], -halfDepth, nx, ny, 0, 0);
      push(b[0], b[1], -halfDepth, nx, ny, 0, 0);

      push(a[0], a[1], halfDepth, nx, ny, 0, 0);
      push(b[0], b[1], -halfDepth, nx, ny, 0, 0);
      push(b[0], b[1], halfDepth, nx, ny, 0, 0);
    }
  }

  const geometry = new THREE.BufferGeometry();
  const attr = (data: number[], size: number) =>
    new THREE.BufferAttribute(new Float32Array(data), size);

  geometry.setAttribute("position", attr(positions, 3));
  geometry.setAttribute("normal", attr(normals, 3));
  geometry.setAttribute("aPaneUv", attr(paneUvs, 2));
  geometry.setAttribute("aCentroid", attr(centroids, 3));
  geometry.setAttribute("aRandom", attr(randoms, 3));
  geometry.setAttribute("aEdge", attr(edges, 1));
  geometry.setAttribute("aDist", attr(dists, 1));

  return geometry;
}
