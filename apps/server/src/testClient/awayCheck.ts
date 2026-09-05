import { Client, type Room } from "colyseus.js";
import { FLIGHT_ALTITUDE } from "@shard-islands/shared";

/**
 * Does an abandoned craft stop being a player?
 *
 * This is the "where is P1 coming from" bug. A browser tab left open stays
 * connected indefinitely, and the room goes on flying its craft — drifting
 * around the map, holding a seat, sitting on the scoreboard, and counting
 * as somebody else in the sky. Paul saw a phantom P1 in a room containing
 * only himself, twice.
 *
 * Two things have to be true, and the second is the one that is easy to get
 * wrong: a craft nobody is flying must be parked, AND a player who comes
 * back must get their own craft back rather than a fresh one.
 *
 * Takes about forty seconds, because the timeout it is testing is a real
 * one and shortening it for the test would test something else.
 *
 *   pnpm --filter server exec tsx src/testClient/awayCheck.ts
 */

const ENDPOINT = process.env.GAME_SERVER_URL ?? "ws://localhost:2567";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FRAME_DT = 1 / 60;

interface Me {
  away: boolean;
  x: number;
  trailLength: number;
  seat: number;
}

const look = (room: Room) => room.state.players.get(room.sessionId) as Me;

async function main() {
  const room: Room = await new Client(ENDPOINT).joinOrCreate("shard_islands");

  room.send("spawn", {
    x: 0,
    y: -820,
    z: FLIGHT_ALTITUDE,
    yaw: 0,
    pitch: 0,
    speed: 26,
    trailLength: 60,
  });
  await sleep(150);

  // Fly for a couple of seconds, like somebody who is actually playing.
  let seq = 0;
  for (let f = 0; f < 120; f += 3) {
    seq += 3;
    room.send("input", {
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

  const flying = look(room);
  console.log(`flying            seat ${flying.seat}, away ${flying.away}, x ${flying.x.toFixed(0)}`);

  // Then the tab is abandoned: still connected, saying nothing at all.
  let wentAwayAfter = -1;
  let restedAt = 0;
  for (let elapsed = 0; elapsed < 45_000; elapsed += 500) {
    await sleep(500);
    const me = look(room);
    if (me.away) {
      wentAwayAfter = elapsed;
      restedAt = me.x;
      break;
    }
  }

  if (wentAwayAfter < 0) {
    console.log("RESULT: FAILED — the craft was still being flown after 45s of silence");
    await room.leave();
    process.exit(1);
  }

  console.log(`parked            after ~${(wentAwayAfter / 1000).toFixed(0)}s of silence`);

  // And it must actually stop moving, not merely be labelled.
  await sleep(2000);
  const drifted = Math.abs(look(room).x - restedAt);
  console.log(`drift while away  ${drifted.toFixed(2)}m over 2s`);

  // Coming back must return the player to their own craft and their own
  // score, not strand them with a parked one.
  const before = look(room).trailLength;
  seq += 3;
  room.send("input", {
    samples: [{ seq, turn: 0, pitch: 0, boosting: false, hover: false, dt: FRAME_DT }],
  });
  await sleep(600);
  const back = look(room);
  console.log(`on return         away ${back.away}, trail ${back.trailLength.toFixed(0)} (was ${before.toFixed(0)})`);

  await room.leave();

  const ok = !back.away && drifted < 0.5 && back.trailLength >= before;
  console.log(ok ? "RESULT: OK" : "RESULT: FAILED");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.log("RESULT: FAILED", err?.message ?? err);
  process.exit(1);
});
