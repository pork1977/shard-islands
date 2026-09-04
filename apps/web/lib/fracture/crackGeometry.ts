import * as THREE from "three";
import type { CrackNetwork } from "./generateCrackNetwork";

/**
 * Turns the crack network into tapered quad strips — one quad per segment,
 * widened along the segment normal.
 *
 * Attributes:
 *  - aSide  -1..1 across the crack width, for shading the fracture profile
 *  - aArc   0..1 distance along the crack path from the impact, so the
 *           cracks can be revealed progressively as they propagate
 *  - aGen   generation, so major fractures read brighter than fine branches
 */
export function buildCrackGeometry(network: CrackNetwork, z = 0.02): THREE.BufferGeometry {
  const { segments, maxArc } = network;

  const positions: number[] = [];
  const sides: number[] = [];
  const arcs: number[] = [];
  const gens: number[] = [];

  for (const s of segments) {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    const a1x = s.x1 + nx * s.w1;
    const a1y = s.y1 + ny * s.w1;
    const b1x = s.x1 - nx * s.w1;
    const b1y = s.y1 - ny * s.w1;
    const a2x = s.x2 + nx * s.w2;
    const a2y = s.y2 + ny * s.w2;
    const b2x = s.x2 - nx * s.w2;
    const b2y = s.y2 - ny * s.w2;

    const t1 = s.arc1 / maxArc;
    const t2 = s.arc2 / maxArc;

    const push = (x: number, y: number, side: number, t: number) => {
      positions.push(x, y, z);
      sides.push(side);
      arcs.push(t);
      gens.push(s.generation);
    };

    push(a1x, a1y, 1, t1);
    push(b1x, b1y, -1, t1);
    push(b2x, b2y, -1, t2);

    push(a1x, a1y, 1, t1);
    push(b2x, b2y, -1, t2);
    push(a2x, a2y, 1, t2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("aSide", new THREE.BufferAttribute(new Float32Array(sides), 1));
  geometry.setAttribute("aArc", new THREE.BufferAttribute(new Float32Array(arcs), 1));
  geometry.setAttribute("aGen", new THREE.BufferAttribute(new Float32Array(gens), 1));
  return geometry;
}
