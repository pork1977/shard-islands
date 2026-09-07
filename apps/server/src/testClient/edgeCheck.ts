import { BOUNDARY_HARD, BOUNDARY_SOFT, TERRAIN_SIZE } from "@shard-islands/shared";
import { join, leaveAll } from "./lobby.js";

/**
 * How close to the rim a craft can actually get, flown rather than reasoned.
 *
 * Twice now the boundary has been "fixed" and the wall has still been where
 * it was. Both times the reasoning was sound and something else was true.
 * So this flies a craft at the edge under boost until it stops making
 * progress, and reports where it stopped against where the ground ends.
 *
 *   GAME_SERVER_URL=wss://shard-islands.fly.dev \
 *     pnpm --filter server exec tsx src/testClient/edgeCheck.ts
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FRAME_DT = 1 / 60;
const HALF = TERRAIN_SIZE / 2;

async function main() {
  const room = await join();
  // Aimed straight down +X, starting well inside, so the only thing that can
  // stop it is the boundary.
  room.send("spawn", {
    x: 300,
    y: 0,
    z: -600,
    yaw: 0,
    pitch: 0,
    speed: 30,
    trailLength: 20,
  });
  await sleep(500);

  const me = () =>
    room.state.players.get(room.sessionId) as { x: number; y: number } | undefined;

  let seq = 0;
  let best = 0;
  let stalledFor = 0;

  for (let i = 0; i < 900; i++) {
    seq += 3;
    room.send("input", {
      samples: [seq - 2, seq - 1, seq].map((n) => ({
        seq: n,
        turn: 0,
        pitch: 0,
        boosting: true,
        hover: false,
        roll: 0,
        dt: FRAME_DT,
      })),
    });
    await sleep(3 * FRAME_DT * 1000);

    const p = me();
    if (!p) continue;
    const reach = Math.max(Math.abs(p.x), Math.abs(p.y));
    if (reach > best + 0.5) {
      best = reach;
      stalledFor = 0;
    } else {
      stalledFor++;
      // The boundary turns you, so it stops making progress long before it
      // stops moving. Twelve ticks of no gain is the wall.
      if (stalledFor > 40) break;
    }
  }

  const p = me();
  await leaveAll([room]);

  console.log(`ground ends at        ${HALF.toFixed(0)}`);
  console.log(`turn-back begins      ${BOUNDARY_SOFT.toFixed(0)}`);
  console.log(`refused outright      ${BOUNDARY_HARD.toFixed(0)}`);
  console.log(`furthest actually flown ${best.toFixed(0)}  (final ${p?.x.toFixed(0)}, ${p?.y.toFixed(0)})`);
  console.log(`short of the ground by  ${(HALF - best).toFixed(0)}m`);

  const ok = best >= BOUNDARY_HARD - 30;
  console.log("");
  console.log(
    `${ok ? "  ok  " : " FAIL "} a craft reaches the hard boundary    ` +
      `${best.toFixed(0)} vs ${BOUNDARY_HARD.toFixed(0)}`,
  );
  console.log(ok ? "\nRESULT: OK" : "\nRESULT: FAILED");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.log("RESULT: FAILED", err?.message ?? err);
  process.exit(1);
});
