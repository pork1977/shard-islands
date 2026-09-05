import { Client, type Room } from "colyseus.js";
import { BEACON, beaconSite } from "@shard-islands/shared";

/**
 * The Beacon: does it charge, open, get claimed, and is the prize real?
 *
 * Almost none of this is reachable by hand. Filling the Beacon takes a
 * minute and three quarters alone; the crowd bonus needs several craft
 * holding station in the same place at the same time; and the live wake has
 * to be tested by flying somebody into a trail on purpose at a moment when
 * its owner happens to be overcharged. Every one of those is a scripted
 * setup or it does not get tested at all.
 *
 * The charging itself is not waited out. Craft are parked at the Beacon to
 * drive the rate up, and the test measures the RATE rather than the wall
 * clock — the arithmetic is the thing that can be wrong, and waiting two
 * minutes to watch a number reach one proves nothing extra.
 *
 *   pnpm --filter server exec tsx src/testClient/beaconCheck.ts
 */

const ENDPOINT = process.env.GAME_SERVER_URL ?? "ws://localhost:2567";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FRAME_DT = 1 / 60;

const SITE = beaconSite();

interface Beacon {
  charge: number;
  phase: number;
  phaseMsLeft: number;
  holderId: string;
  holderSeat: number;
  overchargeMsLeft: number;
}

const beacon = (room: Room) => room.state.beacon as unknown as Beacon;
const me = (room: Room) =>
  room.state.players.get(room.sessionId) as unknown as {
    seat: number;
    colour: number;
    overcharged: boolean;
    trailLength: number;
    clipsTaken: number;
    trail: { length: number };
  };

async function join(): Promise<Room> {
  return new Client(ENDPOINT).joinOrCreate("shard_islands");
}

function spawn(room: Room, x: number, y: number, z: number, yaw: number, speed: number, trail = 26) {
  room.send("spawn", { x, y, z, yaw, pitch: 0, speed, trailLength: trail });
}

/** Hold station, so a craft counts toward the gather without flying off. */
function holdStation(rooms: Room[], seqFrom: number) {
  let seq = seqFrom;
  return async (frames: number) => {
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
      for (const room of rooms) room.send("input", { samples });
      await sleep(3 * FRAME_DT * 1000);
    }
    return seq;
  };
}

/** Measured charge gained per second, over a fixed window. */
async function chargeRate(watcher: Room, seconds: number) {
  const from = beacon(watcher).charge;
  await sleep(seconds * 1000);
  const to = beacon(watcher).charge;
  return (to - from) / seconds;
}

async function main() {
  console.log(
    `beacon at ${SITE.x.toFixed(0)}, ${SITE.y.toFixed(0)}` +
      `  core ${SITE.coreZ.toFixed(0)}  claim radius ${BEACON.claimRadius}\n`,
  );

  const watcher = await join();
  await sleep(400);

  // ---- 1. it charges faster with people around it ---------------------
  // Baseline first, with everybody deliberately on the far side of the map.
  const alone = await chargeRate(watcher, 3);

  const crowd: Room[] = [];
  for (let i = 0; i < 3; i++) crowd.push(await join());
  crowd.forEach((room, i) => {
    const a = (i / 3) * Math.PI * 2;
    spawn(
      room,
      SITE.x + Math.cos(a) * 90,
      SITE.y + Math.sin(a) * 90,
      SITE.groundZ + 150,
      a,
      0,
    );
  });
  const hold = holdStation(crowd, 0);
  await sleep(200);

  // Kept fed while the rate is measured, or the room parks them.
  const holding = hold(600);
  const gathered = await chargeRate(watcher, 3);
  await holding;

  const expectedAlone = 1 / BEACON.chargeSecondsAlone;
  const expectedCrowd =
    Math.min(BEACON.maxRateMultiplier, 1 + 3 * BEACON.perPilotRate) /
    BEACON.chargeSecondsAlone;

  console.log(
    `charge alone      ${(alone * 100).toFixed(3)}%/s  (expected ~${(expectedAlone * 100).toFixed(3)})`,
  );
  console.log(
    `charge with 3     ${(gathered * 100).toFixed(3)}%/s  (expected ~${(expectedCrowd * 100).toFixed(3)})`,
  );

  for (const room of crowd) await room.leave();
  await sleep(300);

  // ---- 2. force it open and race for it -------------------------------
  // Waiting out the real charge would add a minute and a half of nothing;
  // the rate above is the part that could be wrong.
  console.log("\nwaiting for it to fill...");
  const filler: Room[] = [];
  for (let i = 0; i < 6; i++) filler.push(await join());
  filler.forEach((room, i) => {
    const a = (i / 6) * Math.PI * 2;
    spawn(room, SITE.x + Math.cos(a) * 70, SITE.y + Math.sin(a) * 70, SITE.groundZ + 150, a, 0);
  });
  const fill = holdStation(filler, 0);
  await sleep(200);

  let opened = false;
  for (let i = 0; i < 60 && !opened; i++) {
    await fill(30);
    if (beacon(watcher).phase === 1) opened = true;
  }

  const openedFor = beacon(watcher).phaseMsLeft;
  console.log(`opened            ${opened}, window ${openedFor}ms`);

  // A challenger comes in at the core.
  //
  // A level run at the core's own altitude, not a nose-down plunge from
  // above it. The first attempt dived, and a diving craft in this flight
  // model travels about one and a half metres forward for every metre it
  // drops — so it sailed a hundred and seventy metres past a thirty metre
  // target and the test blamed the game.
  const winner = filler[0];
  const loser = filler[1];
  spawn(winner, SITE.x - 200, SITE.y, SITE.coreZ, 0, 60, 40);
  await sleep(120);

  let seq = 5000;
  for (let f = 0; f < 300; f += 3) {
    seq += 3;
    winner.send("input", {
      samples: [seq - 2, seq - 1, seq].map((n) => ({
        seq: n,
        turn: 0,
        pitch: 0,
        boosting: true,
        hover: false,
        dt: FRAME_DT,
      })),
    });
    await sleep(3 * FRAME_DT * 1000);
    if (beacon(watcher).holderId) break;
  }

  const b = beacon(watcher);
  const holderIsWinner = b.holderId === winner.sessionId;
  console.log(
    `claimed           by P${b.holderSeat + 1}` +
      ` (${holderIsWinner ? "the diver" : "somebody else"})` +
      `, phase now ${b.phase}, overcharge ${b.overchargeMsLeft}ms`,
  );
  console.log(`winner flagged    ${me(winner).overcharged}`);

  // ---- 3. the prize is real -------------------------------------------
  // Fly the winner along so it lays a live wake, then send a rival of a
  // different colour straight down it. Following a wake is normally
  // drafting; against a live one it should be fatal to the follower.

  seq += 9;
  for (let f = 0; f < 180; f += 3) {
    seq += 3;
    winner.send("input", {
      samples: [seq - 2, seq - 1, seq].map((n) => ({
        seq: n,
        turn: 0,
        pitch: 0,
        boosting: false,
        hover: false,
        dt: FRAME_DT,
      })),
    });
    await sleep(3 * FRAME_DT * 1000);
  }

  const w = winner.state.players.get(winner.sessionId) as unknown as {
    x: number;
    y: number;
    z: number;
    yaw: number;
    colour: number;
    trail: { length: number; [i: number]: { x: number; y: number; z: number } };
  };
  const l = me(loser);
  const differentColours = w.colour !== l.colour;

  // Dropped onto the middle of the live wake, pointed the same way it runs:
  // the drafting position, which against a live wake must still cut.
  const midpoint = w.trail[Math.floor(w.trail.length / 2)];
  spawn(loser, midpoint.x, midpoint.y, midpoint.z, w.yaw, 26, 80);
  await sleep(150);
  // Read AFTER the respawn: spawning sets the trail length, so sampling it
  // beforehand compares two different craft and always looks like a gain.
  const beforeLoser = me(loser).trailLength;

  let seqL = 9000;
  for (let f = 0; f < 120; f += 3) {
    seqL += 3;
    loser.send("input", {
      samples: [seqL - 2, seqL - 1, seqL].map((n) => ({
        seq: n,
        turn: 0,
        pitch: 0,
        boosting: false,
        hover: false,
        dt: FRAME_DT,
      })),
    });
    await sleep(3 * FRAME_DT * 1000);
    if (me(loser).clipsTaken > 0) break;
  }

  const afterLoser = me(loser);
  console.log(
    `live wake         rival cut ${afterLoser.clipsTaken} time(s),` +
      ` trail ${beforeLoser.toFixed(0)} -> ${afterLoser.trailLength.toFixed(0)}` +
      ` (colours ${w.colour} vs ${l.colour})`,
  );

  const holderStillOn = me(winner).overcharged;
  for (const room of filler) await room.leave();
  await watcher.leave();

  console.log("");
  const checks: [string, boolean, string][] = [
    ["it charges at all", alone > 0, `${(alone * 100).toFixed(3)}%/s`],
    [
      "a crowd charges it faster",
      gathered > alone * 2,
      `${(gathered / Math.max(alone, 1e-9)).toFixed(1)}x`,
    ],
    [
      "the rate matches the design",
      Math.abs(gathered - expectedCrowd) / expectedCrowd < 0.35,
      `${(gathered * 100).toFixed(3)} vs ${(expectedCrowd * 100).toFixed(3)}`,
    ],
    ["it opens when full", opened, `${openedFor}ms window`],
    ["the diver takes it", holderIsWinner, b.holderId ? "claimed" : "nobody claimed it"],
    ["it shuts behind them", b.phase === 2, `phase ${b.phase}`],
    ["the winner is flagged", holderStillOn, `${holderStillOn}`],
    ["colours differ, so the wake applies", differentColours, `${w.colour} vs ${l.colour}`],
    [
      "following a live wake is fatal",
      afterLoser.clipsTaken > 0,
      `${afterLoser.clipsTaken} cut(s)`,
    ],
    [
      "and it costs a lot",
      afterLoser.trailLength < beforeLoser * 0.75,
      `${beforeLoser.toFixed(0)} -> ${afterLoser.trailLength.toFixed(0)}`,
    ],
  ];

  for (const [name, ok, detail] of checks) {
    console.log(`${ok ? "  ok  " : " FAIL "} ${name.padEnd(36)} ${detail}`);
  }

  const allOk = checks.every(([, ok]) => ok);
  console.log(allOk ? "\nRESULT: OK" : "\nRESULT: FAILED");
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.log("RESULT: FAILED", err?.message ?? err);
  process.exit(1);
});
