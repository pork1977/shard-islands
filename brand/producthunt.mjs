/**
 * The Product Hunt kit.
 *
 * The marks in generate.mjs are the GAME's identity: dark, cold, etched into
 * glass, and correct for a browser tab and a Stripe checkout. They are wrong
 * for a Product Hunt feed, which is a white page full of competing thumbnails
 * where a dark navy square reads as a hole. So the launch icon keeps the shape
 * and throws the palette out, borrowing the seat colours — the ones already
 * flying around the sky — for something that survives being 48 pixels wide
 * next to forty other things.
 *
 * Run: node brand/producthunt.mjs
 */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const OUT = new URL("./", import.meta.url);
const S = 1024;

const CYAN = "#5fe4ff";
const VIOLET = "#b98cff";
const PINK = "#ff7ad9";
const LIME = "#9dff6b";
const DEEP = "#0d1a28";
const INK = "#eaf6ff";
const FONT = "Segoe UI, Arial, Helvetica, sans-serif";

// ---- the handprint, same construction as handprintTexture.ts --------------
function finger(baseX, baseY, r, length, angle) {
  const top = -length + r;
  const d = "M " + -r + " 0 L " + -r + " " + top + " A " + r + " " + r +
    " 0 0 1 " + r + " " + top + " L " + r + " 0 Z";
  const deg = (angle * 180) / Math.PI;
  return `<path d="${d}" transform="translate(${baseX} ${baseY}) rotate(${deg})"/>`;
}

const SPECS = [
  { dx: -0.62, len: 0.3, angle: -0.16 },
  { dx: -0.22, len: 0.37, angle: -0.05 },
  { dx: 0.2, len: 0.36, angle: 0.05 },
  { dx: 0.58, len: 0.28, angle: 0.16 },
];

function hand(size = S) {
  const cx = size * 0.5;
  const palmCy = size * 0.62;
  const palmRx = size * 0.22;
  const palmRy = size * 0.26;
  const baseY = palmCy - palmRy * 0.85;
  return [
    `<ellipse cx="${cx}" cy="${palmCy}" rx="${palmRx}" ry="${palmRy}"/>`,
    finger(cx - palmRx * 0.95, palmCy - size * 0.02, size * 0.075, size * 0.22, -0.65),
    ...SPECS.map((f) =>
      finger(cx + f.dx * palmRx, baseY, size * 0.055, size * f.len, f.angle),
    ),
  ].join("");
}

const HAND_BOX = (() => {
  const cx = S * 0.5;
  const palmCy = S * 0.62;
  const palmRx = S * 0.22;
  const palmRy = S * 0.26;
  const baseY = palmCy - palmRy * 0.85;
  const pts = [[cx - palmRx, palmCy - palmRy], [cx + palmRx, palmCy + palmRy]];
  const caps = [[cx - palmRx * 0.95, palmCy - S * 0.02, S * 0.075, S * 0.22, -0.65]];
  for (const f of SPECS) {
    caps.push([cx + f.dx * palmRx, baseY, S * 0.055, S * f.len, f.angle]);
  }
  for (const [bx, by, r, len, a] of caps) {
    for (const [lx, ly] of [[-r, 0], [r, 0], [-r, -len], [r, -len]]) {
      pts.push([
        bx + lx * Math.cos(a) - ly * Math.sin(a),
        by + lx * Math.sin(a) + ly * Math.cos(a),
      ]);
    }
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
})();

function fit(body, size, frac) {
  const [x0, y0, x1, y1] = HAND_BOX;
  const w = x1 - x0;
  const h = y1 - y0;
  const k = (size * frac) / Math.max(w, h);
  const tx = size / 2 - (x0 + w / 2) * k;
  const ty = size / 2 - (y0 + h / 2) * k;
  return `<g transform="translate(${tx} ${ty}) scale(${k})">${body}</g>`;
}

// ---- launch icons ---------------------------------------------------------
function vivid(stops, handFill, glow) {
  const litHand =
    `<g fill="${glow}" opacity="0.85" filter="url(#b)">${hand()}</g>` +
    `<g fill="${handFill}">${hand()}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      ${stops.map((st) => `<stop offset="${st[0]}" stop-color="${st[1]}"/>`).join("")}
    </linearGradient>
    <filter id="b" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="${S * 0.028}"/>
    </filter>
  </defs>
  <rect width="${S}" height="${S}" fill="url(#g)"/>
  <g stroke="#ffffff" stroke-opacity="0.14" stroke-width="${S * 0.005}">
    <line x1="0" y1="${S * 0.21}" x2="${S}" y2="${S * 0.21}"/>
    <line x1="0" y1="${S * 0.8}" x2="${S}" y2="${S * 0.8}"/>
    <line x1="${S * 0.2}" y1="0" x2="${S * 0.2}" y2="${S}"/>
    <line x1="${S * 0.8}" y1="0" x2="${S * 0.8}" y2="${S}"/>
  </g>
  ${fit(litHand, S, 0.68)}
</svg>`;
}

const iconA = vivid([["0%", CYAN], ["52%", VIOLET], ["100%", PINK]], "#ffffff", "#ffffff");
const iconB = vivid([["0%", "#2b1055"], ["55%", "#5b21a8"], ["100%", DEEP]], CYAN, CYAN);
const iconC = vivid([["0%", PINK], ["50%", VIOLET], ["100%", "#3b1d6e"]], "#ffffff", CYAN);

// ---- gallery slides, 1270x760 --------------------------------------------
const GW = 1270;
const GH = 760;

function T(x, y, size, txt, opts) {
  const o = opts || {};
  const fill = o.fill || INK;
  const weight = o.weight || 400;
  const spacing = o.spacing || 0;
  const anchor = o.anchor || "start";
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" letter-spacing="${spacing}" text-anchor="${anchor}">${txt}</text>`;
}

function slide(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GW}" height="${GH}" viewBox="0 0 ${GW} ${GH}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#16293c"/>
      <stop offset="45%" stop-color="#24455e"/>
      <stop offset="100%" stop-color="${DEEP}"/>
    </linearGradient>
    <filter id="b" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="16"/>
    </filter>
  </defs>
  <rect width="${GW}" height="${GH}" fill="url(#bg)"/>
  <g stroke="${CYAN}" stroke-opacity="0.12" stroke-width="2">
    <line x1="0" y1="150" x2="${GW}" y2="150"/>
    <line x1="0" y1="610" x2="${GW}" y2="610"/>
    <line x1="300" y1="0" x2="300" y2="${GH}"/>
    <line x1="970" y1="0" x2="970" y2="${GH}"/>
  </g>
  ${inner}
  ${T(GW - 90, 692, 23, "shardislands.me", { anchor: "end", fill: "rgba(226,242,255,0.4)", spacing: 3 })}
</svg>`;
}

function handAt(x, y, size, fill) {
  const c = fill || "#a8ecff";
  const lit =
    `<g fill="${c}" opacity="0.8" filter="url(#b)">${hand()}</g>` +
    `<g fill="${c}">${hand()}</g>`;
  return `<g transform="translate(${x} ${y})"><svg width="${size}" height="${size}" viewBox="0 0 ${S} ${S}">${fit(lit, S, 0.9)}</svg></g>`;
}

const DIM = "rgba(226,242,255,0.6)";

const s1 = slide(`
  ${handAt(120, 235, 290)}
  ${T(470, 300, 92, "SHARD ISLANDS", { weight: 700, spacing: 2 })}
  ${T(470, 376, 38, "Your glowing trail is your score.", { fill: CYAN })}
  ${T(470, 428, 38, "Longest trail wins.", { fill: CYAN })}
  ${T(470, 516, 27, "Free · no sign-up · nothing to install", { fill: "rgba(226,242,255,0.55)", spacing: 1 })}
`);

function step(x, n, title, body1, body2) {
  return `
  ${T(x, 340, 130, n, { fill: "rgba(95,228,255,0.28)", weight: 700 })}
  ${T(x, 420, 33, title, { weight: 700 })}
  ${T(x, 466, 24, body1, { fill: DIM })}
  ${T(x, 500, 24, body2, { fill: DIM })}`;
}

const s2 = slide(`
  ${T(GW / 2, 150, 30, "IT TAKES ONE CLICK", { anchor: "middle", spacing: 8, fill: CYAN })}
  ${step(110, "1", "Press the handprint", "A pane of frosted glass", "and one word: DON&apos;T.")}
  ${step(520, "2", "The floor shatters", "You fall through it into", "a sky full of strangers.")}
  ${step(910, "3", "Fly", "WASD. No menu, no lobby,", "no account. You are already in.")}
`);

function mech(x, colour, title, body1, body2) {
  return `
  <rect x="${x}" y="250" width="6" height="150" fill="${colour}"/>
  ${T(x + 28, 290, 33, title, { weight: 700, fill: colour })}
  ${T(x + 28, 340, 24, body1, { fill: "rgba(226,242,255,0.72)" })}
  ${T(x + 28, 376, 24, body2, { fill: "rgba(226,242,255,0.72)" })}`;
}

const s3 = slide(`
  ${T(GW / 2, 150, 30, "WHAT IS OUT THERE", { anchor: "middle", spacing: 8, fill: CYAN })}
  ${mech(90, CYAN, "Trail = score", "Fly through Energy Cores", "and your light trail grows.")}
  ${mech(500, PINK, "Tail-clip", "Cut ACROSS a rival&apos;s trail", "and it snaps. Yours is safe.")}
  ${mech(890, LIME, "The Beacon", "A dome charges, then opens.", "First one there is untouchable.")}
  ${T(GW / 2, 560, 26, "Up to 24 in a sky · server-authoritative · 20 ticks a second", { anchor: "middle", fill: "rgba(226,242,255,0.5)" })}
`);

function key(x, cap, what) {
  return `
  <rect x="${x}" y="270" width="160" height="78" rx="12" fill="rgba(255,255,255,0.09)" stroke="rgba(170,220,255,0.5)" stroke-width="2"/>
  ${T(x + 80, 321, 30, cap, { anchor: "middle", weight: 700 })}
  ${T(x + 80, 394, 24, what, { anchor: "middle", fill: DIM })}`;
}

const s4 = slide(`
  ${T(GW / 2, 150, 30, "THE WHOLE CONTROL SCHEME", { anchor: "middle", spacing: 8, fill: CYAN })}
  ${key(100, "W A S D", "steer")}
  ${key(390, "SHIFT", "boost")}
  ${key(680, "SPACE", "hover")}
  ${key(970, "A A / D D", "barrel roll")}
  ${T(GW / 2, 510, 29, "That is it. There is nothing else to learn.", { anchor: "middle", fill: CYAN })}
`);

// ---- render ---------------------------------------------------------------
const jobs = [
  ["ph-icon-a-512.png", iconA, 512],
  ["ph-icon-a-240.png", iconA, 240],
  ["ph-icon-b-512.png", iconB, 512],
  ["ph-icon-b-240.png", iconB, 240],
  ["ph-icon-c-512.png", iconC, 512],
  ["ph-icon-c-240.png", iconC, 240],
  ["ph-gallery-1-hero.png", s1, GW],
  ["ph-gallery-2-howitworks.png", s2, GW],
  ["ph-gallery-3-mechanics.png", s3, GW],
  ["ph-gallery-4-controls.png", s4, GW],
];

for (const [name, svg, w] of jobs) {
  const buf = await sharp(Buffer.from(svg)).resize(w).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(new URL(name, OUT), buf);
  console.log(name.padEnd(28), (buf.length / 1024).toFixed(1) + " KB");
}
