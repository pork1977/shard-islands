import { Client, type Room } from "colyseus.js";
import {
  coreSites,
  CORE_PICKUP_RADIUS,
  terrainHeightAt,
  TERRAIN_BASE_Z,
} from "@shard-islands/shared";

/**
 * Can you actually catch a core?
 *
 * Paul's report was that they are tricky to collect, and there are two
 * separate ways a pickup can fail that feel identical from the cockpit:
 *
 *   1. The bubble is too small. You flew past what looked like a hit.
 *   2. The bubble is fine but the craft skipped over it. Collection is
 *      tested once a tick, so a craft moving fast enough teleports from one
 *      side of the core to the other without ever being sampled inside it —
 *      the worst kind of miss, because the player aimed perfectly.
 *
 * This tests both, and the second one is the reason the test exists: it is
 * not reproducible by hand, since it needs the craft to cross the core
 * between two server ticks.
 *
 *   pnpm --filter server exec tsx src/testClient/coreReachCheck.ts
 */

const ENDPOINT = process.env.GAME_SERVER_URL ?? "ws://localhost:2567";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Height of the ground under a point, in world Z. */
const groundAt = (x: number, y: number) => TERRAIN_BASE_Z + terrainHeightAt(x, y);

/**
 * Cores out in the open with clear air around them: well inside the
 * boundary, and high enough above the terrain that a level run at their
 * altitude never touches the ground clamp for a couple of hundred metres
 * either side.
 *
 * Each of the three checks below needs its own core, because a collected
 * one stays gone for twenty-two seconds — including for the check that runs
 * next, and including for a second run of this script.
 */
function candidates() {
  const sites = coreSites();
  const found: number[] = [];

  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    const from = Math.hypot(s.x, s.y);
    if (from < 300 || from > 700) continue;

    let clear = true;
    for (let d = -220; d <= 220 && clear; d += 20) {
      if (s.z - groundAt(s.x + d, s.y) < 30) clear = false;
      if (s.z - groundAt(s.x, s.y + d) < 30) clear = false;
    }
    if (clear) found.push(i);
  }

  if (found.length < 3) throw new Error("not enough cores with clear air around them");
  return found;
}

async function join(): Promise<Room> {
  return new Client(ENDPOINT).joinOrCreate("shard_islands");
}

function spawn(
  room: Room,
  at: { x: number; y: number; z: number },
  yaw: number,
  speed: number,
) {
  room.send("spawn", { ...at, yaw, pitch: 0, speed, trailLength: 26 });
}

const stick = (seq: number, hover: boolean, boosting: boolean) => ({
  seq,
  turn: 0,
  pitch: 0,
  boosting,
  hover,
  dt: 1 / 20,
});

/**
 * Park a craft a fixed distance to one side of a core and see whether the
 * room hands it over. Pure geometry — nothing moves.
 */
async function parkedAt(index: number, offset: number) {
  const site = coreSites()[index];
  const room = await join();
  spawn(room, { x: site.x, y: site.y + offset, z: site.z }, 0, 0);
  await sleep(120);
  room.send("input", { samples: [stick(1, true, false)] });
  await sleep(500);
  const taken = room.state.coresTaken[index] === true;
  await room.leave();
  return taken;
}

async function main() {
  // A probe connection, purely to find out which cores are still out there.
  // Anything already collected — by a previous run, or by somebody actually
  // playing — would make its check meaningless.
  const probe = await join();
  await sleep(200);
  const free = candidates().filter((i) => probe.state.coresTaken[i] !== true);
  await probe.leave();
  if (free.length < 3) throw new Error("not enough uncollected cores to test with");

  const [bubbleIndex, controlIndex, index] = free;
  const site = coreSites()[index];
  console.log(`pickup radius     ${CORE_PICKUP_RADIUS}`);
  console.log(
    `cores under test  ${bubbleIndex}, ${controlIndex}, ${index}` +
      ` (run core at ${site.x.toFixed(0)}, ${site.y.toFixed(0)}, ${site.z.toFixed(0)})`,
  );

  // ---- 1. the bubble ------------------------------------------------
  // Eighteen metres out: inside the new radius, outside the old one. This
  // is the pass that used to look like a hit and score nothing.
  const nearHit = await parkedAt(bubbleIndex, 18);
  await sleep(300);
  // And a control, so this is a boundary rather than a free-for-all.
  const farMiss = await parkedAt(controlIndex, 30);
  await sleep(300);

  console.log(`parked 18m out    ${nearHit ? "collected" : "MISSED"} (expected collected)`);
  console.log(`parked 30m out    ${farMiss ? "COLLECTED" : "missed"} (expected missed)`);

  // ---- 2. the skip --------------------------------------------------
  // Aimed dead at the core from ninety metres out, then handed a whole
  // tick's worth of input at once — which is exactly what a client does
  // after a stall, and is the only way to make the craft cross the core
  // between two collection checks.
  const room = await join();
  const start = { x: site.x - 90, y: site.y, z: site.z };
  spawn(room, start, 0, 400);
  await sleep(180);

  // Every position this client is ever shown, so we can say honestly
  // whether the craft was seen inside the bubble at any point.
  let closest = Infinity;
  const watch = setInterval(() => {
    const me = room.state.players.get(room.sessionId) as
      | { x: number; y: number; z: number }
      | undefined;
    if (!me) return;
    const d = Math.hypot(me.x - site.x, me.y - site.y, me.z - site.z);
    if (d < closest) closest = d;
  }, 5);

  const samples = [];
  for (let i = 1; i <= 12; i++) samples.push(stick(i, false, true));
  room.send("input", { samples });

  await sleep(900);
  clearInterval(watch);

  const me = room.state.players.get(room.sessionId) as { x: number; cores: number };
  const swept = room.state.coresTaken[index] === true;
  const overshoot = me.x - site.x;
  await room.leave();

  console.log(
    `burst run         crossed from -90m to ${overshoot > 0 ? "+" : ""}${overshoot.toFixed(0)}m` +
      ` in one tick, closest sighting ${closest.toFixed(0)}m`,
  );
  console.log(`                  ${swept ? "collected" : "MISSED"} (expected collected)`);

  // The burst is only evidence of sweeping if the craft was never actually
  // seen inside the bubble. If it stopped short, say so rather than bank a
  // pass that proved nothing.
  const conclusive = closest > CORE_PICKUP_RADIUS && overshoot > CORE_PICKUP_RADIUS;
  if (!conclusive) {
    console.log("RESULT: INCONCLUSIVE — the craft never skipped the core");
    process.exit(1);
  }

  const ok = nearHit && !farMiss && swept;
  console.log(ok ? "RESULT: OK" : "RESULT: FAILED");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.log("RESULT: FAILED", err?.message ?? err);
  process.exit(1);
});
