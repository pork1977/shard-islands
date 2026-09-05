import { Client, type Room } from "colyseus.js";
import { BEACON, beaconSite } from "@shard-islands/shared";

/**
 * Charges the Beacon on demand, then leaves it alone.
 *
 * Filling it takes a minute and three quarters with nobody near it, which
 * is right for a game and useless for looking at one. This parks a handful
 * of bots around it so it fills in about twenty seconds, then holds them
 * there and gets out of the way — the core is left hanging for whoever is
 * watching to fly at.
 *
 *   pnpm --filter server exec tsx src/testClient/beaconDemo.ts
 *
 * Pass --claim and one of the bots takes it instead, so the overcharge and
 * the live wake can be seen from another craft's point of view.
 */

const ENDPOINT = process.env.GAME_SERVER_URL ?? "ws://localhost:2567";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FRAME_DT = 1 / 60;
const CLAIM_IT = process.argv.includes("--claim");

const SITE = beaconSite();

async function join(): Promise<Room> {
  return new Client(ENDPOINT).joinOrCreate("shard_islands");
}

async function main() {
  console.log(
    `beacon at ${SITE.x.toFixed(0)}, ${SITE.y.toFixed(0)}, core at ${SITE.coreZ.toFixed(0)}`,
  );

  const bots: Room[] = [];
  for (let i = 0; i < 6; i++) bots.push(await join());

  // Ringed around it, holding station: the same thing a group of players
  // would be doing, and the reason it fills fast.
  bots.forEach((room, i) => {
    const a = (i / bots.length) * Math.PI * 2;
    room.send("spawn", {
      x: SITE.x + Math.cos(a) * 80,
      y: SITE.y + Math.sin(a) * 80,
      z: SITE.groundZ + 150,
      yaw: a + Math.PI,
      pitch: 0,
      speed: 0,
      trailLength: 40,
    });
  });
  await sleep(200);

  const watcher = bots[0];
  const beacon = () =>
    watcher.state.beacon as unknown as { charge: number; phase: number; holderId: string };

  let seq = 0;
  const hold = async (frames: number, only?: Room[]) => {
    for (let f = 0; f < frames; f += 3) {
      seq += 3;
      const samples = [seq - 2, seq - 1, seq].map((n) => ({
        seq: n,
        turn: 0,
        pitch: 0,
        boosting: false,
        hover: true,
        dt: FRAME_DT,
      }));
      for (const room of only ?? bots) room.send("input", { samples });
      await sleep(3 * FRAME_DT * 1000);
    }
  };

  let last = -1;
  while (beacon().phase === 0) {
    await hold(30);
    const pct = Math.round(beacon().charge * 100);
    if (pct >= last + 10) {
      console.log(`  charging ${pct}%`);
      last = pct;
    }
  }

  console.log(`OPEN — core is up for ${BEACON.openMs / 1000}s`);

  if (CLAIM_IT) {
    // One of them peels off and takes it on a level run.
    const diver = bots[1];
    diver.send("spawn", {
      x: SITE.x - 200,
      y: SITE.y,
      z: SITE.coreZ,
      yaw: 0,
      pitch: 0,
      speed: 60,
      trailLength: 90,
    });
    await sleep(120);

    let dseq = 40000;
    for (let f = 0; f < 400; f += 3) {
      dseq += 3;
      diver.send("input", {
        samples: [dseq - 2, dseq - 1, dseq].map((n) => ({
          seq: n,
          turn: 0,
          pitch: 0,
          boosting: true,
          hover: false,
          dt: FRAME_DT,
        })),
      });
      await sleep(3 * FRAME_DT * 1000);
      if (beacon().holderId) break;
    }
    console.log(beacon().holderId ? "claimed — overcharged bot now flying" : "missed it");

    // Keep it flying so its live wake is out there to look at.
    for (let f = 0; f < 900; f += 3) {
      dseq += 3;
      diver.send("input", {
        samples: [dseq - 2, dseq - 1, dseq].map((n) => ({
          seq: n,
          turn: 0.25,
          pitch: 0,
          boosting: false,
          hover: false,
          dt: FRAME_DT,
        })),
      });
      await sleep(3 * FRAME_DT * 1000);
    }
  } else {
    // Left open, untouched, for as long as the window lasts.
    await hold(Math.round((BEACON.openMs / 1000) * 60));
    console.log("window closed");
  }

  for (const room of bots) await room.leave();
  console.log("bots have left the room");
}

main().catch((err) => {
  console.log("FAILED", err?.message ?? err);
  process.exit(1);
});
