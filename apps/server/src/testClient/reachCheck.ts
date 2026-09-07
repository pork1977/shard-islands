import {
  BOUNDARY_HARD,
  BOUNDARY_SOFT,
  TERRAIN_SIZE,
  coreSites,
  plumageSites,
} from "@shard-islands/shared";

/**
 * That everything the world places can actually be flown to.
 *
 * The boundary and the collectables are decided in different files by
 * different constants, and nothing was checking they agreed. They did not:
 * cores were seeded out to 0.4 of the terrain while the turn-back began at
 * 0.34, so the outermost ones sat inside the band where the game steers you
 * away — reachable in theory and infuriating in practice.
 *
 *   pnpm --filter server exec tsx src/testClient/reachCheck.ts
 */

const furthest = (pts: { x: number; y: number }[]) =>
  Math.max(...pts.map((p) => Math.hypot(p.x, p.y)));

const cores = furthest(coreSites());
const rare = furthest(plumageSites());

console.log(`terrain half-width   ${(TERRAIN_SIZE / 2).toFixed(0)}`);
console.log(`turn-back begins     ${BOUNDARY_SOFT.toFixed(0)}`);
console.log(`refused outright     ${BOUNDARY_HARD.toFixed(0)}`);
console.log(`furthest core        ${cores.toFixed(0)}`);
console.log(`furthest rare node   ${rare.toFixed(0)}`);

const checks: [string, boolean, string][] = [
  ["every core is in free airspace", cores <= BOUNDARY_SOFT, `${cores.toFixed(0)} vs ${BOUNDARY_SOFT.toFixed(0)}`],
  ["every rare node is too", rare <= BOUNDARY_SOFT, `${rare.toFixed(0)}`],
  [
    "the hard edge stays on the mesh",
    BOUNDARY_HARD < TERRAIN_SIZE / 2,
    `${BOUNDARY_HARD.toFixed(0)} < ${(TERRAIN_SIZE / 2).toFixed(0)}`,
  ],
  [
    "there is room to turn before the wall",
    BOUNDARY_HARD - BOUNDARY_SOFT > 100,
    `${(BOUNDARY_HARD - BOUNDARY_SOFT).toFixed(0)}m band`,
  ],
];

console.log("");
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name.padEnd(36)} ${detail}`);
}
const allOk = checks.every(([, ok]) => ok);
console.log(allOk ? "\nRESULT: OK" : "\nRESULT: FAILED");
process.exit(allOk ? 0 : 1);
