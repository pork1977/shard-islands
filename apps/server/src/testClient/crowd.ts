import { type Room } from "colyseus.js";
import { FLIGHT_ALTITUDE } from "@shard-islands/shared";
import { join, leaveAll } from "./lobby.js";

/**
 * Fills the sky with convincing craft, so the renderer can be measured
 * against a full room without twenty-four phones.
 *
 * This is the instrument the plan asks for at the performance pass, and it
 * has to produce the expensive case rather than a cheap imitation of it:
 * long trails, spread over the piece of sky somebody is actually looking
 * at, all of them turning so no ribbon is a straight line that costs
 * nothing to draw.
 *
 *   pnpm --filter server exec tsx src/testClient/crowd.ts --count=24
 *
 * Options:
 *   --count=N     how many craft (default 8)
 *   --seconds=N   how long to hold them there (default 120)
 *   --trail=N     starting trail length each (default 300, near the cap)
 *   --spread=N    metres around the observer to scatter them (default 220)
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FRAME_DT = 1 / 60;

function arg(name: string, fallback: number) {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? Number(found.split("=")[1]) : fallback;
}

const COUNT = Math.max(1, Math.min(23, arg("count", 8)));
const SECONDS = arg("seconds", 120);
const TRAIL = arg("trail", 300);
const SPREAD = arg("spread", 220);

interface Watched {
  x: number;
  y: number;
  z: number;
  yaw: number;
  simulated: boolean;
}

async function main() {
  const scout = await join();
  await sleep(400);

  // Centred on whoever is watching, if anybody is. A crowd measured on the
  // far side of the map from the camera measures nothing.
  let cx = 0;
  let cy = 0;
  let cz = FLIGHT_ALTITUDE;
  let found = false;
  scout.state.players.forEach((p: Watched, id: string) => {
    if (found || id === scout.sessionId || !p.simulated) return;
    cx = p.x;
    cy = p.y;
    cz = p.z;
    found = true;
  });
  console.log(
    found
      ? `crowding ${COUNT} craft around the player at ${cx.toFixed(0)}, ${cy.toFixed(0)}`
      : `nobody flying — crowding ${COUNT} craft around the origin`,
  );

  const bots: Room[] = [];
  for (let i = 0; i < COUNT; i++) bots.push(await join());

  bots.forEach((room, i) => {
    // A ring, at mixed radii and heights, all facing round the circle so
    // they orbit rather than immediately scatter.
    const a = (i / COUNT) * Math.PI * 2;
    const r = SPREAD * (0.35 + 0.65 * ((i % 5) / 4));
    room.send("spawn", {
      x: cx + Math.cos(a) * r,
      y: cy + Math.sin(a) * r,
      z: cz + ((i % 7) - 3) * 14,
      yaw: a + Math.PI / 2,
      pitch: 0,
      speed: 26,
      trailLength: TRAIL,
    });
  });
  await sleep(250);

  console.log(`holding for ${SECONDS}s — ctrl-c to stop early`);

  let seq = 0;
  const until = Date.now() + SECONDS * 1000;
  while (Date.now() < until) {
    seq += 3;
    for (let i = 0; i < bots.length; i++) {
      // Each on its own gentle arc, so every ribbon is a curve. A straight
      // trail is the cheapest thing the renderer will ever be asked for and
      // measuring against one would flatter it.
      const turn = Math.sin(Date.now() / 4000 + i * 1.7) * 0.55;
      bots[i].send("input", {
        samples: [seq - 2, seq - 1, seq].map((n) => ({
          seq: n,
          turn,
          pitch: Math.sin(Date.now() / 6500 + i) * 0.12,
          boosting: false,
          hover: false,
          roll: 0,
          dt: FRAME_DT,
        })),
      });
    }
    await sleep(3 * FRAME_DT * 1000);
  }

  await leaveAll([scout, ...bots]);
  console.log("crowd dispersed");
}

main().catch((err) => {
  console.log("FAILED", err?.message ?? err);
  process.exit(1);
});
