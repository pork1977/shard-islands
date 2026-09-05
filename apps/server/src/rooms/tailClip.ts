import { CLIP, segmentApproach } from "@shard-islands/shared";

/**
 * Finding where one craft's path cuts another craft's trail.
 *
 * Kept out of the room because this is the highest-risk piece of arithmetic
 * in the project and it deserves to be readable on its own, testable on its
 * own, and free of anything to do with rooms, clients or schemas.
 */

export interface Point {
  x: number;
  y: number;
  z: number;
}

/** Anything indexable by number with a length — an ArraySchema qualifies. */
export interface TrailLike {
  readonly length: number;
  [index: number]: Point;
}

/**
 * Chunked bounding boxes over a trail, rebuilt each tick.
 *
 * The plan asks for a uniform spatial hash here. This is the same idea with
 * a fraction of the moving parts: a trail is not a cloud of unrelated
 * points, it is a path, so consecutive points are already near each other
 * and a box around every thirty-two of them is a tight fit for free. A
 * craft's movement in one tick touches one or two of those boxes, so the
 * narrow phase runs against a few dozen segments instead of several hundred
 * — which is the entire benefit the hash was there to provide, without a
 * grid to size, rebuild and get subtly wrong.
 *
 * A hash earns its place when trails have to be tested against each other
 * en masse rather than against a handful of craft. That is the phase 17
 * conversation, and it can be measured then.
 */
const CHUNK = 32;

export interface TrailIndex {
  /** Six floats per chunk: minX, minY, minZ, maxX, maxY, maxZ. */
  bounds: Float32Array;
  chunks: number;
  points: number;
}

export function createTrailIndex(): TrailIndex {
  return { bounds: new Float32Array(0), chunks: 0, points: 0 };
}

/** Rebuilds an index in place, growing its buffer only when it has to. */
export function buildTrailIndex(trail: TrailLike, index: TrailIndex): TrailIndex {
  const points = trail.length;
  index.points = points;
  index.chunks = points < 2 ? 0 : Math.ceil((points - 1) / CHUNK);

  if (index.bounds.length < index.chunks * 6) {
    index.bounds = new Float32Array(index.chunks * 6 + 60);
  }
  if (index.chunks === 0) return index;

  const b = index.bounds;

  for (let c = 0; c < index.chunks; c++) {
    const start = c * CHUNK;
    // One past the last segment in this chunk, so the box covers the segment
    // that straddles the boundary rather than leaving a gap at every seam.
    const end = Math.min(points - 1, start + CHUNK);

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    for (let i = start; i <= end; i++) {
      const p = trail[i];
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.z < minZ) minZ = p.z;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
      if (p.z > maxZ) maxZ = p.z;
    }

    const o = c * 6;
    b[o] = minX;
    b[o + 1] = minY;
    b[o + 2] = minZ;
    b[o + 3] = maxX;
    b[o + 4] = maxY;
    b[o + 5] = maxZ;
  }

  return index;
}

export interface Cut {
  /**
   * The trail segment that was severed. The victim keeps everything from
   * `index + 1` onward — so a cut near the head of the trail takes almost
   * all of it, and one near the tail takes very little. That is the risk
   * and the reward, and it falls out of the geometry rather than being
   * designed in: cutting close behind somebody's craft is both the most
   * valuable place to cut and the hardest place to reach.
   */
  index: number;
  /** Where along the clipper's own path this happened, 0..1. */
  s: number;
  x: number;
  y: number;
  z: number;
}

const cut: Cut = { index: -1, s: 0, x: 0, y: 0, z: 0 };

/**
 * Does this tick's movement cut that trail, and if so where first?
 *
 * `fx, fy, fz` is the clipper's unit heading, used for the crossing test:
 * a craft travelling ALONG a wake is drafting it, not cutting it, and
 * without that distinction the two mechanics could not both exist — sitting
 * in somebody's slipstream puts you exactly on the line that would sever it.
 *
 * Returns a shared object, or null. Read what you need before calling again.
 */
export function findCut(
  fromX: number,
  fromY: number,
  fromZ: number,
  toX: number,
  toY: number,
  toZ: number,
  fx: number,
  fy: number,
  fz: number,
  trail: TrailLike,
  index: TrailIndex,
): Cut | null {
  if (index.chunks === 0) return null;

  const r = CLIP.radius;
  const rSq = r * r;

  // The clipper's own box, fattened by the radius, so a chunk that cannot
  // possibly be within reach is rejected with six comparisons.
  const loX = Math.min(fromX, toX) - r;
  const hiX = Math.max(fromX, toX) + r;
  const loY = Math.min(fromY, toY) - r;
  const hiY = Math.max(fromY, toY) + r;
  const loZ = Math.min(fromZ, toZ) - r;
  const hiZ = Math.max(fromZ, toZ) + r;

  let bestS = Infinity;
  let found = false;
  const b = index.bounds;

  for (let c = 0; c < index.chunks; c++) {
    const o = c * 6;
    if (b[o] > hiX || b[o + 3] < loX) continue;
    if (b[o + 1] > hiY || b[o + 4] < loY) continue;
    if (b[o + 2] > hiZ || b[o + 5] < loZ) continue;

    const start = c * CHUNK;
    const end = Math.min(index.points - 1, start + CHUNK);

    for (let i = start; i < end; i++) {
      const a = trail[i];
      const bb = trail[i + 1];

      const approach = segmentApproach(
        fromX,
        fromY,
        fromZ,
        toX,
        toY,
        toZ,
        a.x,
        a.y,
        a.z,
        bb.x,
        bb.y,
        bb.z,
      );
      if (approach.distSq > rSq) continue;

      // Crossing, not following.
      const sx = bb.x - a.x;
      const sy = bb.y - a.y;
      const sz = bb.z - a.z;
      const len = Math.sqrt(sx * sx + sy * sy + sz * sz);
      if (len < 1e-6) continue;
      const agreement = (fx * sx + fy * sy + fz * sz) / len;
      if (agreement >= CLIP.maxHeadingAgreement) continue;

      // The FIRST thing the clipper's path reaches is what it cuts. A pass
      // across a coiled trail can satisfy several segments at once, and
      // taking the deepest of them would hand the clipper a better cut than
      // they actually flew.
      const s = approach.s;
      if (found && s >= bestS) continue;

      bestS = s;
      found = true;
      cut.index = i;
      cut.s = s;
      // The cut point is on the TRAIL, not on the clipper's path: it is the
      // place the ribbon parts, and it is where the shards will lie.
      cut.x = a.x + sx * approach.t;
      cut.y = a.y + sy * approach.t;
      cut.z = a.z + sz * approach.t;
    }
  }

  return found ? cut : null;
}
