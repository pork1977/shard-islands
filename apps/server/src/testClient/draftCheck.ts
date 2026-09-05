import { Client, type Room } from "colyseus.js";
import { DRAFT, FLIGHT_ALTITUDE } from "@shard-islands/shared";

/**
 * Does flying in somebody's wake actually pull you along — and does your own
 * colour pull harder?
 *
 * Three craft in a line, all on the same heading: a leader, a stranger
 * thirty metres back, and an ally sixty metres back. Once the leader has
 * flown far enough for its trail to reach them, both followers are inside
 * it, and the room should be giving them different multipliers.
 *
 * The ally is seat 8. Colours are seat % 8, so nine clients have to join
 * before two of them share one — which is exactly why this test is a script
 * and not two people with two browsers.
 *
 *   pnpm --filter server exec tsx src/testClient/draftCheck.ts
 */

const ENDPOINT = process.env.GAME_SERVER_URL ?? "ws://localhost:2567";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ALTITUDE = FLIGHT_ALTITUDE;
const SECONDS = 4;
const FRAME_DT = 1 / 60;

async function join(): Promise<Room> {
  const client = new Client(ENDPOINT);
  return client.joinOrCreate("shard_islands");
}

/** Straight and level, on the same heading as everyone else in the line. */
function spawnAt(room: Room, x: number, yaw = 0, speed = 26) {
  room.send("spawn", {
    x,
    y: 0,
    z: ALTITUDE,
    yaw,
    pitch: 0,
    speed,
    trailLength: 26,
  });
}

async function main() {
  // Nine seats, so the last one wraps onto the leader's colour.
  const rooms: Room[] = [];
  for (let i = 0; i < 9; i++) rooms.push(await join());

  const leader = rooms[0];
  const stranger = rooms[1];
  const ally = rooms[8];
  // Parked directly on the leader's line but pointed across it. Being in
  // somebody's wake is not enough; without the heading test this would be
  // the cheapest free boost in the game.
  const crosser = rooms[2];

  const seatOf = (room: Room) =>
    (room.state.players.get(room.sessionId) as { seat: number } | undefined)?.seat;

  // Only these four are spawned. The rest hold seats and are never
  // simulated, so they lay no trail and cannot interfere.
  spawnAt(leader, 0);
  spawnAt(stranger, -30);
  spawnAt(ally, -60);
  spawnAt(crosser, 40, Math.PI / 2, 0);

  await sleep(150);

  const flyers = [leader, stranger, ally, crosser];
  let seq = 0;

  // Hold a dead straight line for a few seconds.
  for (let frame = 0; frame < SECONDS * 60; frame += 3) {
    seq += 3;
    for (const room of flyers) {
      const samples = [seq - 2, seq - 1, seq].map((s) => ({
        seq: s,
        turn: 0,
        pitch: 0,
        boosting: false,
        // the crosser holds station, so it stays on the line being crossed
        hover: room === crosser,
        dt: FRAME_DT,
      }));
      room.send("input", { samples });
    }
    await sleep(3 * FRAME_DT * 1000);
  }

  await sleep(300);

  const draftOf = (room: Room) =>
    (room.state.players.get(room.sessionId) as { draft: number } | undefined)?.draft ?? 0;

  const leaderDraft = draftOf(leader);
  const strangerDraft = draftOf(stranger);
  const allyDraft = draftOf(ally);

  console.log(`seats            leader ${seatOf(leader)}, stranger ${seatOf(stranger)}, ally ${seatOf(ally)}`);
  console.log(`leader draft     ${leaderDraft.toFixed(2)} (expected 1.00)`);
  console.log(`stranger draft   ${strangerDraft.toFixed(2)} (expected ${DRAFT.strangerMultiplier})`);
  console.log(`ally draft       ${allyDraft.toFixed(2)} (expected ${DRAFT.alliedMultiplier})`);
  const crosserDraft = draftOf(crosser);
  console.log(`crossing draft   ${crosserDraft.toFixed(2)} (expected 1.00 — wrong heading)`);

  for (const room of rooms) await room.leave();

  const ok =
    Math.abs(leaderDraft - 1) < 0.001 &&
    Math.abs(strangerDraft - DRAFT.strangerMultiplier) < 0.001 &&
    Math.abs(allyDraft - DRAFT.alliedMultiplier) < 0.001 &&
    Math.abs(crosserDraft - 1) < 0.001;

  console.log(ok ? "RESULT: OK" : "RESULT: FAILED");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.log("RESULT: FAILED", err?.message ?? err);
  process.exit(1);
});
