import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { generateVoronoiCells } from "../lib/fracture/generateVoronoiCells";
import { CRACK_RAYS } from "../lib/fracture/crackLook";

/**
 * The fracture, flat, and the order it arrives in.
 *
 * The opening sequence cannot be judged through the browser pane: it stops
 * requestAnimationFrame the moment it is hidden, and a frozen camera reads
 * exactly like working code. So the pattern is rendered here from the same
 * generator the game uses, and the propagation is shown as a strip of
 * moments rather than an animation.
 *
 * The left panel is what the pane looks like once it is fully cracked. The
 * strip is the same pane at five points through the fracture, with cracked
 * pieces lit — which is the only way to see whether cracks SPEAR outward or
 * advance as a ring.
 *
 *   pnpm --filter web exec tsx scripts/crackPattern.ts
 */

const W = 900;
const H = 520;
const STEPS = [0.12, 0.25, 0.45, 0.7, 1.0];

/**
 * MIRROR of shardCrackTime in shaders/shardGlass.ts.
 *
 * Duplicated deliberately and knowingly: the shader's copy is GLSL inside a
 * template string and cannot be imported. If the two drift, this preview
 * stops describing the thing it is previewing — so they change together.
 */
function crackTime(dist: number, angle: number, rnd: number): number {
  const wobble = Math.sin(angle * 2.0 + 1.1) * 0.2 + Math.sin(angle * 3.0 - 0.7) * 0.12;
  let lateral = Math.abs(Math.sin((angle + wobble) * CRACK_RAYS * 0.5));
  lateral *= lateral;

  const d = Math.max(0, Math.min(1, dist));
  const t = d * (0.45 + 0.55 * lateral) + lateral * 0.3;
  return Math.max(0, Math.min(1, t / 1.3 + (rnd - 0.5) * 0.05));
}

const pattern = generateVoronoiCells({
  width: W,
  height: H,
  impact: [40, -20],
  maxCells: 460,
});

interface Shard {
  points: number[][];
  t: number;
}

const maxDist = Math.hypot(W / 2, H / 2);
const shards: Shard[] = pattern.cells.map((poly) => {
  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p[0];
    cy += p[1];
  }
  cx /= poly.length;
  cy /= poly.length;
  const dx = cx - pattern.impact[0];
  const dy = cy - pattern.impact[1];
  return {
    points: poly,
    t: crackTime(Math.min(1, Math.hypot(dx, dy) / maxDist), Math.atan2(dy, dx), Math.random()),
  };
});

const path = (poly: number[][], ox: number, oy: number, k: number) =>
  poly.map((p) => `${(ox + (p[0] + W / 2) * k).toFixed(1)},${(oy + (p[1] + H / 2) * k).toFixed(1)}`).join(" ");

// ---- the finished pane, large ---------------------------------------------
const bigK = 1;
const big = shards
  .map(
    (s) =>
      `<polygon points="${path(s.points, 0, 0, bigK)}" fill="none" stroke="#bfe4ff" stroke-opacity="0.75" stroke-width="0.9"/>`,
  )
  .join("");

// ---- the strip: the same pane part-way through ----------------------------
const stripK = 0.31;
const stripW = W * stripK;
const stripH = H * stripK;
const GAP = 14;

const strip = STEPS.map((step, i) => {
  const ox = i * (stripW + GAP);
  const oy = H + 40;
  const cells = shards
    .map((s) => {
      const cracked = s.t <= step;
      const fill = cracked ? "#7ff0ff" : "#16293c";
      const op = cracked ? 0.55 : 1;
      return `<polygon points="${path(s.points, ox, oy, stripK)}" fill="${fill}" fill-opacity="${op}" stroke="#0d1a28" stroke-width="0.35"/>`;
    })
    .join("");
  return `${cells}
    <text x="${ox + 4}" y="${oy + stripH + 18}" fill="rgba(226,242,255,0.6)" font-family="Segoe UI, Arial, sans-serif" font-size="15">t = ${step.toFixed(2)}</text>`;
}).join("");

const totalW = Math.max(W, STEPS.length * (stripW + GAP));
const totalH = H + 40 + stripH + 34;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
  <rect width="${totalW}" height="${totalH}" fill="#0d1a28"/>
  <rect width="${W}" height="${H}" fill="#16293c"/>
  ${big}
  ${strip}
</svg>`;

async function main() {
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile("../../brand/crack-pattern.png", buf);
  console.log(
    `wrote brand/crack-pattern.png — ${shards.length} shards, ${CRACK_RAYS} rays ` +
      `(${(buf.length / 1024).toFixed(1)} KB)`,
  );
}

void main();
