/**
 * The one piece of geometry the whole tail-clip mechanic rests on.
 *
 * Shared rather than kept in the server, because the moment the client wants
 * to draw a warning when you are about to cut somebody — or to predict a
 * clip locally — it has to ask the identical question and get the identical
 * answer. A second implementation of "how close did those two paths come"
 * would disagree in exactly the cases that matter.
 */

export interface Approach {
  /** Squared distance at closest approach. Squared, to keep the hot loop free of roots. */
  distSq: number;
  /** Where along the first segment, 0..1. */
  s: number;
  /** Where along the second segment, 0..1. */
  t: number;
}

const scratch: Approach = { distSq: 0, s: 0, t: 0 };

/**
 * Closest approach between two line SEGMENTS in 3D.
 *
 * This is the swept test the plan calls for. A per-tick point check asks
 * "was the craft touching the ribbon at the instant the tick ended", which
 * a craft at fifty metres a second answers "no" while having passed clean
 * through it — twelve metres of travel between two samples of a ribbon a
 * couple of metres wide. Treating the tick's movement as a segment and the
 * ribbon as a segment asks the question that was actually meant: did those
 * two paths ever come close enough.
 *
 * Ericson's clamped-parametric solution: solve for the closest points on the
 * two infinite lines, clamp into range, and re-solve the other parameter
 * against the clamp. The degenerate cases — either segment being a point,
 * the two being parallel — are the ones that bite, and each is handled
 * explicitly rather than left to divide by a near-zero.
 *
 * Returns a shared object: read what you need before calling again.
 */
export function segmentApproach(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  dx: number,
  dy: number,
  dz: number,
): Approach {
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = dx - cx;
  const vy = dy - cy;
  const vz = dz - cz;
  const wx = ax - cx;
  const wy = ay - cy;
  const wz = az - cz;

  const a = ux * ux + uy * uy + uz * uz; // |u|^2, never negative
  const b = ux * vx + uy * vy + uz * vz;
  const c = vx * vx + vy * vy + vz * vz; // |v|^2, never negative
  const d = ux * wx + uy * wy + uz * wz;
  const e = vx * wx + vy * wy + vz * wz;

  const denom = a * c - b * b; // >= 0, and 0 exactly when the two are parallel

  let s: number;
  let t: number;

  const EPS = 1e-9;

  if (a <= EPS && c <= EPS) {
    // Both segments are points.
    s = 0;
    t = 0;
  } else if (a <= EPS) {
    // The first is a point: project it onto the second.
    s = 0;
    t = clamp01(e / c);
  } else if (c <= EPS) {
    // The second is a point: project it onto the first.
    t = 0;
    s = clamp01(-d / a);
  } else if (denom <= EPS) {
    // Parallel. Any s is as good as any other on the infinite lines, so pin
    // the start of the first segment and take the best t for it — then the
    // clamp pass below fixes s if that t ran off an end.
    s = 0;
    t = clamp01(e / c);
    s = clamp01((b * t - d) / a);
  } else {
    s = clamp01((b * e - c * d) / denom);
    t = (b * s + e) / c;

    // t escaped the segment, so it clamps — and once it does, s is no longer
    // the right answer for the clamped t and has to be solved again.
    if (t < 0) {
      t = 0;
      s = clamp01(-d / a);
    } else if (t > 1) {
      t = 1;
      s = clamp01((b - d) / a);
    }
  }

  const px = wx + s * ux - t * vx;
  const py = wy + s * uy - t * vy;
  const pz = wz + s * uz - t * vz;

  scratch.distSq = px * px + py * py + pz * pz;
  scratch.s = s;
  scratch.t = t;
  return scratch;
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
