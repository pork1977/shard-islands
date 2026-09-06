/**
 * The brand marks, built from the game's own geometry.
 *
 * Not drawn by eye. The handprint here is the SAME construction as
 * `apps/web/lib/textures/handprintTexture.ts` — one ellipse and five
 * rounded capsules at the same offsets — and the glider is the real
 * planform from `apps/web/lib/world/generateGlider.ts` seen from above.
 * A logo that merely resembled the thing on the landing page would drift
 * away from it the first time either was touched; this cannot.
 *
 * Run: node brand/generate.mjs
 */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const S = 1024;               // the coordinate space everything is authored in
const OUT = new URL("./", import.meta.url);

// ---- palette, lifted from the game -------------------------------------
const ETCH = "#9fe9ff";       // GlassFloor's etched handprint
const GLOW = "#4fd8ff";       // the glow beneath it
const SEAT0 = "#5fe4ff";      // first seat colour
const DEEP = "#0d1a28";       // the darkest of the OG gradient
const MID = "#16293c";
const LIFT = "#24455e";

// ---- the handprint, transcribed from handprintTexture.ts ---------------
function finger(baseX, baseY, r, length, angle) {
  const top = -length + r;
  const d = `M ${-r} 0 L ${-r} ${top} A ${r} ${r} 0 0 1 ${r} ${top} L ${r} 0 Z`;
  const deg = (angle * 180) / Math.PI;
  return `<path d="${d}" transform="translate(${baseX} ${baseY}) rotate(${deg})"/>`;
}

function hand(size = S) {
  const cx = size * 0.5;
  const palmCy = size * 0.62;
  const palmRx = size * 0.22;
  const palmRy = size * 0.26;
  const baseY = palmCy - palmRy * 0.85;
  const specs = [
    { dx: -0.62, len: 0.3, angle: -0.16 },
    { dx: -0.22, len: 0.37, angle: -0.05 },
    { dx: 0.2, len: 0.36, angle: 0.05 },
    { dx: 0.58, len: 0.28, angle: 0.16 },
  ];
  return [
    `<ellipse cx="${cx}" cy="${palmCy}" rx="${palmRx}" ry="${palmRy}"/>`,
    finger(cx - palmRx * 0.95, palmCy - size * 0.02, size * 0.075, size * 0.22, -0.65),
    ...specs.map((f) =>
      finger(cx + f.dx * palmRx, baseY, size * 0.055, size * f.len, f.angle),
    ),
  ].join("");
}

// ---- the glider planform, from generateGlider.ts ------------------------
// Local axes there are +X forward, +Y lateral. Seen from above and turned
// to point up the page: svgX = lateral, svgY = -forward.
function glider(size = S) {
  const hull = [
    [1.65, 0], [0.2, 0.44], [-0.25, 0.95], [-0.78, 1.5],
    [-1.05, 0], [-0.78, -1.5], [-0.25, -0.95], [0.2, -0.44],
  ];
  const k = size * 0.29;
  const cx = size * 0.5;
  const cy = size * 0.52;
  const at = ([fwd, lat]) => [cx + lat * k, cy - fwd * k];
  const d = hull
    .map((p, i) => { const [x, y] = at(p); return `${i ? "L" : "M"} ${x} ${y}`; })
    .join(" ") + " Z";

  // The craft's material lights facet EDGES, so a solid silhouette throws
  // away the only thing that makes it recognisable. These are the real
  // triangle edges from generateGlider.ts, seen from above: the spine, and
  // the fan from the tail out to each wing kink and mid-joint.
  const seams = [
    [[1.65, 0], [-1.05, 0]],
    [[-1.05, 0], [0.2, 0.44]], [[-1.05, 0], [-0.25, 0.95]],
    [[-1.05, 0], [0.2, -0.44]], [[-1.05, 0], [-0.25, -0.95]],
  ];
  const w = size * 0.011;
  return `
    <path d="${d}" fill="${SEAT0}" fill-opacity="0.22"/>
    <path d="${d}" fill="none" stroke="${SEAT0}" stroke-width="${w}" stroke-linejoin="round"/>
    <g fill="none" stroke="${SEAT0}" stroke-opacity="0.8" stroke-width="${w * 0.62}" stroke-linecap="round">
      ${seams.map(([a, b]) => {
        const [x1, y1] = at(a); const [x2, y2] = at(b);
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      }).join("")}
    </g>`;
}

// ---- fitting -------------------------------------------------------------
// The handprint texture was authored to FILL a plane on the glass floor, so
// dropped into a square frame unchanged it runs off the top edge. Both marks
// therefore get measured and fitted rather than trusted.
const rot = (x, y, a) => [
  x * Math.cos(a) - y * Math.sin(a),
  x * Math.sin(a) + y * Math.cos(a),
];

function handBBox(size = S) {
  const cx = size * 0.5;
  const palmCy = size * 0.62;
  const palmRx = size * 0.22;
  const palmRy = size * 0.26;
  const baseY = palmCy - palmRy * 0.85;
  const pts = [
    [cx - palmRx, palmCy - palmRy], [cx + palmRx, palmCy + palmRy],
  ];
  const caps = [
    [cx - palmRx * 0.95, palmCy - size * 0.02, size * 0.075, size * 0.22, -0.65],
    [cx - 0.62 * palmRx, baseY, size * 0.055, size * 0.3, -0.16],
    [cx - 0.22 * palmRx, baseY, size * 0.055, size * 0.37, -0.05],
    [cx + 0.2 * palmRx, baseY, size * 0.055, size * 0.36, 0.05],
    [cx + 0.58 * palmRx, baseY, size * 0.055, size * 0.28, 0.16],
  ];
  for (const [bx, by, r, len, a] of caps) {
    for (const [lx, ly] of [[-r, 0], [r, 0], [-r, -len], [r, -len]]) {
      const [dx, dy] = rot(lx, ly, a);
      pts.push([bx + dx, by + dy]);
    }
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function gliderBBox(size = S) {
  const k = size * 0.29;
  return [size * 0.5 - 1.5 * k, size * 0.52 - 1.65 * k,
          size * 0.5 + 1.5 * k, size * 0.52 + 1.05 * k];
}

/** Centre a mark in a square of `size` and let it occupy `frac` of it. */
function fit(body, bbox, size, frac) {
  const [x0, y0, x1, y1] = bbox;
  const w = x1 - x0;
  const h = y1 - y0;
  const k = (size * frac) / Math.max(w, h);
  const tx = size / 2 - (x0 + w / 2) * k;
  const ty = size / 2 - (y0 + h / 2) * k;
  return `<g transform="translate(${tx} ${ty}) scale(${k})">${body}</g>`;
}

// ---- the shared furniture ----------------------------------------------
const defs = (blur) => `
  <defs>
    <linearGradient id="pane" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${MID}"/>
      <stop offset="45%" stop-color="${LIFT}"/>
      <stop offset="100%" stop-color="${DEEP}"/>
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="52%" r="50%">
      <stop offset="0%" stop-color="${GLOW}" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="${GLOW}" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="${GLOW}" stop-opacity="0"/>
    </radialGradient>
    <filter id="soften" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="${blur}"/>
    </filter>
  </defs>`;

/** The pane the mark is etched into: gradient, a hairline grid, a halo. */
const ground = (size) => `
  <rect width="${size}" height="${size}" fill="url(#pane)"/>
  <g stroke="${SEAT0}" stroke-opacity="0.16" stroke-width="${size * 0.004}">
    <line x1="0" y1="${size * 0.2}" x2="${size}" y2="${size * 0.2}"/>
    <line x1="0" y1="${size * 0.82}" x2="${size}" y2="${size * 0.82}"/>
    <line x1="${size * 0.19}" y1="0" x2="${size * 0.19}" y2="${size}"/>
    <line x1="${size * 0.81}" y1="0" x2="${size * 0.81}" y2="${size}"/>
  </g>
  <rect width="${size}" height="${size}" fill="url(#halo)"/>`;

/** Bloom pass then crisp pass — the same trick the game plays with additive. */
const lit = (body, colour) => `
  <g fill="${colour}" opacity="0.75" filter="url(#soften)">${body}</g>
  <g fill="${colour}">${body}</g>`;

const icon = (body, bbox, colour) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    ${defs(S * 0.022)}${ground(S)}${fit(lit(body, colour), bbox, S, 0.66)}
  </svg>`;

const bare = (body, bbox, colour) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    ${defs(S * 0.022)}${fit(lit(body, colour), bbox, S, 0.82)}
  </svg>`;

// ---- wide lockup: mark, rule, wordmark ----------------------------------
const W = 1600, H = 500;
const wide = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${defs(9)}
  <rect width="${W}" height="${H}" fill="${DEEP}"/>
  <g transform="translate(80 40) scale(${420 / S})">${fit(lit(hand(S), ETCH), handBBox(), S, 0.86)}</g>
  <line x1="530" y1="120" x2="530" y2="380" stroke="${SEAT0}" stroke-opacity="0.3" stroke-width="3"/>
  <text x="590" y="238" fill="#eaf6ff" font-family="Segoe UI, Arial, Helvetica, sans-serif"
        font-size="118" font-weight="700" letter-spacing="6">SHARD</text>
  <text x="590" y="360" fill="${SEAT0}" font-family="Segoe UI, Arial, Helvetica, sans-serif"
        font-size="118" font-weight="300" letter-spacing="14">ISLANDS</text>
</svg>`;

// ---- render --------------------------------------------------------------
const png = (svg, w) => sharp(Buffer.from(svg)).resize(w).png({ compressionLevel: 9 });

const jobs = [
  ["icon-hand-1024.png", png(icon(hand(), handBBox(), ETCH), 1024)],
  ["icon-hand-512.png", png(icon(hand(), handBBox(), ETCH), 512)],
  ["icon-hand-256.png", png(icon(hand(), handBBox(), ETCH), 256)],
  ["icon-hand-128.png", png(icon(hand(), handBBox(), ETCH), 128)],
  ["icon-hand-512.jpg", sharp(Buffer.from(icon(hand(), handBBox(), ETCH))).resize(512).jpeg({ quality: 92 })],
  ["mark-hand-1024.png", png(bare(hand(), handBBox(), ETCH), 1024)],
  // For light backgrounds, where the pale etch colour disappears entirely.
  ["mark-hand-ink-1024.png", png(bare(hand(), handBBox(), "#123048"), 1024)],
  ["icon-glider-1024.png", png(icon(glider(), gliderBBox(), SEAT0), 1024)],
  ["icon-glider-512.png", png(icon(glider(), gliderBBox(), SEAT0), 512)],
  ["mark-glider-1024.png", png(bare(glider(), gliderBBox(), SEAT0), 1024)],
  ["logo-wide-1600.png", png(wide, 1600)],
];

for (const [name, pipe] of jobs) {
  const buf = await pipe.toBuffer();
  await writeFile(new URL(name, OUT), buf);
  console.log(name.padEnd(24), (buf.length / 1024).toFixed(1) + " KB");
}
