export interface CrackSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** half-widths at each end, in world units */
  w1: number;
  w2: number;
  /** distance travelled along the crack path from the impact, for staggered reveal */
  arc1: number;
  arc2: number;
  /** 0 = major fracture, higher = finer branch */
  generation: number;
}

export interface CrackNetwork {
  segments: CrackSegment[];
  maxArc: number;
}

interface Options {
  width: number;
  height: number;
  impact: [number, number];
}

/**
 * A propagating crack network, as opposed to the Voronoi partition used for
 * the separable shards.
 *
 * The distinction matters: Voronoi tessellates, carving the whole plane into
 * closed cells edge to edge. Real fracture is a branching tree — cracks
 * spear outward, fork, taper, and die, leaving regions of the pane entirely
 * intact. That's the structure this produces, and it's what makes a break
 * read as damage rather than as decorative crazing.
 */
export function generateCrackNetwork({ width, height, impact }: Options): CrackNetwork {
  const [ix, iy] = impact;
  const halfW = width / 2;
  const halfH = height / 2;

  const maxRadius = Math.max(
    Math.hypot(-halfW - ix, -halfH - iy),
    Math.hypot(halfW - ix, -halfH - iy),
    Math.hypot(-halfW - ix, halfH - iy),
    Math.hypot(halfW - ix, halfH - iy),
  );

  const segments: CrackSegment[] = [];
  let maxArc = 0;

  const inBounds = (x: number, y: number) =>
    x > -halfW && x < halfW && y > -halfH && y < halfH;

  const step = maxRadius * 0.018;

  function propagate(
    startX: number,
    startY: number,
    startAngle: number,
    startWidth: number,
    startArc: number,
    generation: number,
    branchBudget: number,
  ) {
    let x = startX;
    let y = startY;
    let angle = startAngle;
    let w = startWidth;
    let arc = startArc;

    // finer cracks wander more and die sooner — thick fractures drive straight
    const wander = 0.09 + generation * 0.07;
    const decay = generation === 0 ? 0.972 : 0.94;
    const minWidth = maxRadius * 0.00035;

    let guard = 0;
    while (w > minWidth && guard++ < 220) {
      angle += (Math.random() - 0.5) * wander;
      const nx = x + Math.cos(angle) * step;
      const ny = y + Math.sin(angle) * step;
      const nw = w * decay;
      const nArc = arc + step;

      segments.push({
        x1: x,
        y1: y,
        x2: nx,
        y2: ny,
        w1: w,
        w2: nw,
        arc1: arc,
        arc2: nArc,
        generation,
      });
      if (nArc > maxArc) maxArc = nArc;

      // fork, splitting energy between the two paths
      if (branchBudget > 0 && generation < 3 && Math.random() < 0.055) {
        const side = Math.random() < 0.5 ? 1 : -1;
        const branchAngle = angle + side * (0.45 + Math.random() * 0.5);
        propagate(nx, ny, branchAngle, w * 0.5, nArc, generation + 1, branchBudget - 1);
      }

      x = nx;
      y = ny;
      w = nw;
      arc = nArc;

      // let cracks run a little past the edge, then stop
      if (!inBounds(x, y) && Math.hypot(x - ix, y - iy) > maxRadius * 0.9) break;
    }
  }

  // major radial fractures
  const majorCount = 6 + Math.floor(Math.random() * 4);
  const baseAngle = Math.random() * Math.PI * 2;
  for (let i = 0; i < majorCount; i++) {
    const angle =
      baseAngle + (i / majorCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const startR = maxRadius * 0.035;
    propagate(
      ix + Math.cos(angle) * startR,
      iy + Math.sin(angle) * startR,
      angle,
      maxRadius * 0.0042,
      startR,
      0,
      6,
    );
  }

  // Crushed annulus: right at the strike the glass is pulverised rather than
  // cleanly split, so this is a dense mess of short cracks at every angle.
  const coreCount = 46;
  for (let i = 0; i < coreCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = maxRadius * (0.012 + Math.random() * 0.07);
    propagate(
      ix + Math.cos(angle) * r,
      iy + Math.sin(angle) * r,
      angle + (Math.random() - 0.5) * 2.2,
      maxRadius * (0.0012 + Math.random() * 0.0016),
      r,
      2,
      1,
    );
  }

  // Concentric cracks linking the radials, which is what closes glass into
  // loose plates rather than leaving it as a plain starburst.
  const ringCount = 7;
  for (let i = 0; i < ringCount; i++) {
    const r = maxRadius * (0.09 + Math.pow(i / ringCount, 1.6) * 0.85);
    const angle = Math.random() * Math.PI * 2;
    const tangent = angle + Math.PI / 2;
    propagate(
      ix + Math.cos(angle) * r,
      iy + Math.sin(angle) * r,
      tangent,
      maxRadius * 0.0022,
      r,
      1,
      2,
    );
    propagate(
      ix + Math.cos(angle) * r,
      iy + Math.sin(angle) * r,
      tangent + Math.PI,
      maxRadius * 0.0022,
      r,
      1,
      2,
    );
  }

  return { segments, maxArc };
}
