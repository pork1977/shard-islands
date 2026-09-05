import { Client } from "colyseus.js";
import { createFlightSim, stepFlight, type FlightSim } from "@shard-islands/shared";

/**
 * Does the server's simulation land where the client predicted?
 *
 * Prediction is invisible when it works and nearly invisible when it is
 * subtly wrong, and the in-browser overlay cannot answer the question on its
 * own: a backgrounded tab stops rendering, the client goes silent, the room
 * correctly flies the craft on its behalf, and the resulting correction is
 * enormous and entirely legitimate. Measuring determinism needs a client
 * that keeps its own clock.
 *
 * So this joins as a real client, spawns, sends a scripted run of inputs at
 * the real flush rate, and runs the identical `stepFlight` over the identical
 * samples locally. Once the server has acknowledged the last input, the two
 * states must agree — not approximately, but to floating-point noise, because
 * both sides ran the same arithmetic over the same numbers.
 *
 *   pnpm --filter server exec tsx src/testClient/predictionCheck.ts
 *
 * This is the seed of the bot-client harness the plan wants standing up
 * properly at phase 13, where tail-clip timing needs regression testing
 * rather than two people with two tabs.
 */

const ENDPOINT = process.env.GAME_SERVER_URL ?? "ws://localhost:2567";
const FRAMES = 240;
const FRAME_DT = 1 / 60;
const FLUSH_EVERY = 3; // ~50ms of frames, matching the browser client

interface Sample {
  seq: number;
  turn: number;
  pitch: number;
  boosting: boolean;
  hover: boolean;
  dt: number;
}

/** A run with some of everything: straight, turning, diving, boosting. */
function stickAt(
  frame: number,
): { turn: number; pitch: number; boosting: boolean; hover: boolean } {
  const t = frame / 60;
  if (t < 1) return { turn: 0, pitch: 0, boosting: false, hover: false };
  if (t < 2) return { turn: 1, pitch: 0, boosting: false, hover: false };
  if (t < 2.5) return { turn: 0, pitch: -1, boosting: false, hover: false };
  if (t < 3) return { turn: -0.5, pitch: 0.4, boosting: true, hover: false };
  // hovering is part of the model, so it belongs in the determinism run
  if (t < 3.8) return { turn: 0.3, pitch: 0, boosting: false, hover: true };
  return {
    turn: Math.sin(t * 2),
    pitch: Math.cos(t * 1.3) * 0.5,
    boosting: false,
    hover: false,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const client = new Client(ENDPOINT);
  const room = await client.joinOrCreate("shard_islands");
  console.log(`joined as ${room.sessionId}`);

  const spawn = { x: 40, y: -25, z: -350, yaw: 0.3, pitch: 0, speed: 30, trailLength: 26 };
  const local: FlightSim = createFlightSim(spawn.x, spawn.y, spawn.z, spawn.yaw);
  local.pitch = spawn.pitch;
  local.speed = spawn.speed;

  room.send("spawn", spawn);
  await sleep(120);

  let seq = 0;
  let outbox: Sample[] = [];

  for (let frame = 0; frame < FRAMES; frame++) {
    const stick = stickAt(frame);
    const sample: Sample = { seq: ++seq, ...stick, dt: FRAME_DT };

    stepFlight(local, sample, sample.dt);
    outbox.push(sample);

    if (outbox.length >= FLUSH_EVERY) {
      room.send("input", { samples: outbox });
      outbox = [];
      await sleep(FLUSH_EVERY * FRAME_DT * 1000);
    }
  }
  if (outbox.length > 0) room.send("input", { samples: outbox });

  // Wait for the room to acknowledge everything sent.
  const deadline = Date.now() + 4000;
  let self: any;
  while (Date.now() < deadline) {
    await sleep(60);
    self = room.state.players.get(room.sessionId);
    if (self && self.lastSeq >= seq) break;
  }

  if (!self) {
    console.log("RESULT: FAILED — no state for this session");
    process.exit(1);
  }

  const dx = self.x - local.x;
  const dy = self.y - local.y;
  const dz = self.z - local.z;
  const drift = Math.hypot(dx, dy, dz);
  const travelled = Math.hypot(local.x - spawn.x, local.y - spawn.y, local.z - spawn.z);

  console.log(`inputs sent      ${seq}, acknowledged ${self.lastSeq}`);
  console.log(`distance flown   ${travelled.toFixed(1)}m`);
  console.log(`position drift   ${(drift * 100).toFixed(3)}cm`);
  console.log(
    `attitude drift   yaw ${(self.yaw - local.yaw).toExponential(2)}` +
      ` pitch ${(self.pitch - local.pitch).toExponential(2)}`,
  );

  await room.leave();
  // Millimetres is generous for float32 rounding on the wire; anything above
  // that means the two simulations are not the same simulation.
  console.log(drift < 0.01 ? "RESULT: OK" : "RESULT: DIVERGED");
  process.exit(drift < 0.01 ? 0 : 1);
}

main().catch((err) => {
  console.log("RESULT: FAILED", err?.message ?? err);
  process.exit(1);
});
