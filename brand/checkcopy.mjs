/**
 * Product Hunt's fields are hard limits, and a tagline that is four
 * characters too long is discovered at the worst possible moment: while
 * pasting, on launch morning. So the copy gets measured here instead.
 *
 * Run: node brand/checkcopy.mjs
 */
import { readFile } from "node:fs/promises";

const md = await readFile(new URL("./PRODUCT-HUNT.md", import.meta.url), "utf8");

// Every fenced block in the document, in order.
const blocks = [...md.matchAll(/```\n([\s\S]*?)\n```/g)].map((m) => m[1]);

const LIMITS = [
  ["Name", 40],
  ["Tagline (chosen)", 60],
  ["Tagline (alt 1)", 60],
  ["Tagline (alt 2)", 60],
  ["Description", 260],
];

let bad = 0;
LIMITS.forEach(([label, limit], i) => {
  const text = blocks[i];
  if (text === undefined) {
    console.log(`${label.padEnd(18)} MISSING`);
    bad++;
    return;
  }
  const n = [...text].length;
  const ok = n <= limit;
  if (!ok) bad++;
  console.log(
    `${label.padEnd(18)} ${String(n).padStart(3)}/${limit}  ${ok ? "ok" : "OVER BY " + (n - limit)}`,
  );
});

const comment = blocks[5];
if (comment) {
  console.log(`${"First comment".padEnd(18)} ${[...comment].length} chars (no limit)`);
}

process.exit(bad ? 1 : 0);
