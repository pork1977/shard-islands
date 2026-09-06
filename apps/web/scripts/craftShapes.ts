import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { generateGlider } from "../lib/world/generateGlider";
import { PLUMAGE_NAMES } from "@shard-islands/shared";

/**
 * The four craft, drawn flat, side by side.
 *
 * Checking a silhouette by flying a browser around and squinting at a
 * ten-pixel craft is not checking it. This projects the actual geometry —
 * the same buffer the game renders — from above and from the side, so the
 * question "are these genuinely different shapes or the same one painted
 * three ways" has an answer you can look at.
 *
 *   pnpm --filter web exec tsx scripts/craftShapes.ts
 */

const FORMS = [0, 1, 2, 3];
const CELL_W = 380;
const CELL_H = 240;
const PAD = 26;

interface Tri {
  pts: [number, number][];
}

/** Triangles of one form, projected onto a plane. */
function project(plumage: number, axes: [0 | 1 | 2, 0 | 1 | 2]): Tri[] {
  const geometry = generateGlider(plumage);
  const pos = geometry.getAttribute("position");
  const tris: Tri[] = [];

  for (let i = 0; i < pos.count; i += 3) {
    const pts: [number, number][] = [];
    for (let v = 0; v < 3; v++) {
      const c = [pos.getX(i + v), pos.getY(i + v), pos.getZ(i + v)];
      pts.push([c[axes[0]], c[axes[1]]]);
    }
    tris.push({ pts });
  }
  return tris;
}

function draw(tris: Tri[], x0: number, y0: number, colour: string): string {
  // Fit whatever the shape happens to be into the cell, so a long thin form
  // and a wide flat one are both readable rather than one filling the box
  // and the other being a dot.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const t of tris) {
    for (const [a, b] of t.pts) {
      if (a < minX) minX = a;
      if (a > maxX) maxX = a;
      if (b < minY) minY = b;
      if (b > maxY) maxY = b;
    }
  }
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const k = Math.min((CELL_W - PAD * 2) / w, (CELL_H - PAD * 2) / h);
  const cx = x0 + CELL_W / 2;
  const cy = y0 + CELL_H / 2;
  const at = ([a, b]: [number, number]) =>
    // Screen Y runs down; the craft's second axis runs up.
    `${cx + (a - (minX + maxX) / 2) * k},${cy - (b - (minY + maxY) / 2) * k}`;

  return tris
    .map(
      (t) =>
        `<polygon points="${t.pts.map(at).join(" ")}" fill="${colour}" fill-opacity="0.10" stroke="${colour}" stroke-opacity="0.85" stroke-width="1"/>`,
    )
    .join("");
}

const COLOURS: Record<number, string> = {
  0: "#7ff0ff",
  1: "#ff8a1e",
  2: "#eaf9ff",
  3: "#b06bff",
};

const W = CELL_W * 2 + 200;
const H = CELL_H * FORMS.length;

const rows = FORMS.map((form, i) => {
  const y = i * CELL_H;
  const colour = COLOURS[form];
  const name = form === 0 ? "Standard" : (PLUMAGE_NAMES[form] ?? String(form));
  return `
    <text x="24" y="${y + CELL_H / 2 - 6}" fill="${colour}" font-family="Segoe UI, Arial, sans-serif" font-size="26" font-weight="700">${name}</text>
    <text x="24" y="${y + CELL_H / 2 + 22}" fill="rgba(226,242,255,0.4)" font-family="Segoe UI, Arial, sans-serif" font-size="14">above · side</text>
    ${draw(project(form, [0, 1]), 200, y, colour)}
    ${draw(project(form, [0, 2]), 200 + CELL_W, y, colour)}
    <line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
}).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0d1a28"/>
  ${rows}
</svg>`;

// Wrapped, and written to a path rather than an import.meta URL: tsx
// transforms this package as CJS, where neither top-level await nor
// import.meta.url is available.
async function main() {
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile("../../brand/craft-shapes.png", buf);
  console.log(`wrote brand/craft-shapes.png (${(buf.length / 1024).toFixed(1)} KB)`);
}

void main();
