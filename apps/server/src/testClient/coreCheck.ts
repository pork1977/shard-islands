import { Client } from "colyseus.js";
import { coreSites, CORE_TRAIL_VALUE } from "@shard-islands/shared";

/**
 * Can two players collect the same Energy Core?
 *
 * This is the failure the phase exists to prevent, and it is not one that
 * two people with two browsers can reliably produce: it needs both craft on
 * the same core inside the same server tick. Two headless clients spawning
 * at identical coordinates hit that window every time.
 *
 * The room must award the core exactly once — one player up twelve trail and
 * one core collected, the other with nothing — and both clients must agree
 * that the core is gone.
 *
 *   pnpm --filter server exec tsx src/testClient/coreCheck.ts
 */

const ENDPOINT = process.env.GAME_SERVER_URL ?? "ws://localhost:2567";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function joinAt(index: number) {
  const site = coreSites()[index];
  const client = new Client(ENDPOINT);
  const room = await client.joinOrCreate("shard_islands");

  // Spawned exactly on the core, stationary, so the outcome cannot depend on
  // which of the two happened to fly slightly faster.
  room.send("spawn", {
    x: site.x,
    y: site.y,
    z: site.z,
    yaw: 0,
    pitch: 0,
    speed: 0,
    trailLength: 26,
    });

  return room;
}

async function main() {
  // A core far from the middle, so nobody's descent stumbles into it first.
  const index = coreSites().findIndex((s) => Math.hypot(s.x, s.y) > 600);
  if (index < 0) throw new Error("no distant core to test with");

  const a = await joinAt(index);
  const b = await joinAt(index);

  // Both need an input each so the room simulates them at all.
  const stick = { turn: 0, pitch: 0, boosting: false, hover: true, dt: 1 / 60 };
  a.send("input", { samples: [{ seq: 1, ...stick }] });
  b.send("input", { samples: [{ seq: 1, ...stick }] });

  await sleep(900);

  const meA = a.state.players.get(a.sessionId) as { cores: number; trailLength: number };
  const meB = b.state.players.get(b.sessionId) as { cores: number; trailLength: number };
  const takenA = a.state.coresTaken[index];
  const takenB = b.state.coresTaken[index];

  const winners = [meA, meB].filter((p) => p.cores > 0);
  const totalCores = meA.cores + meB.cores;

  console.log(`core index       ${index}`);
  console.log(`A  cores ${meA.cores}  trail ${meA.trailLength}`);
  console.log(`B  cores ${meB.cores}  trail ${meB.trailLength}`);
  console.log(`core taken       A sees ${takenA}, B sees ${takenB}`);

  const exactlyOne = totalCores === 1 && winners.length === 1;
  const scored = winners[0]?.trailLength === 26 + CORE_TRAIL_VALUE;
  const agreed = takenA === true && takenB === true;

  await a.leave();
  await b.leave();

  if (exactlyOne && scored && agreed) {
    console.log("RESULT: OK — collected once, both clients agree");
    process.exit(0);
  }

  console.log(
    `RESULT: FAILED — awarded ${totalCores} time(s),` +
      ` winner trail ${winners[0]?.trailLength ?? "none"}, agreement ${agreed}`,
  );
  process.exit(1);
}

main().catch((err) => {
  console.log("RESULT: FAILED", err?.message ?? err);
  process.exit(1);
});
