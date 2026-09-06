import { monitorEventLoopDelay } from "node:perf_hooks";
import { type Room } from "colyseus.js";
import { FLIGHT_ALTITUDE, ROOM, SERVER_TICK_RATE_HZ } from "@shard-islands/shared";
import { join, leaveAll } from "./lobby.js";

/**
 * What MANY rooms cost the server, which is the question a launch asks.
 *
 * loadCheck answers "does filling one room slow its tick" and the answer is
 * no. That is not the launch-day question. Colyseus spawns a new room every
 * time one fills, every room ticks on the same Node event loop, and Node has
 * one thread — so the axis that has never been measured is the only one a
 * front page actually moves: several rooms at once on one shared vCPU.
 *
 * The method is a ramp rather than a single slam, because a single slam
 * tells you only that it broke, not where the knee is. Each stage adds a
 * room's worth of craft, lets their trails grow to the cap (an empty ribbon
 * is not the expensive state), then measures the tick rate every room is
 * actually achieving.
 *
 * THE TRAP this guards against: the load generator is also one Node process,
 * and 200 sockets sending input twenty times a second can bottleneck HERE
 * and be misread as the server slowing down. So the client's own event loop
 * delay is measured alongside, and the run refuses to draw a conclusion
 * while the generator itself is struggling.
 *
 *   pnpm --filter server exec tsx src/testClient/roomLoadCheck.ts
 *   GAME_SERVER_URL=wss://shard-islands.fly.dev pnpm --filter server exec \
 *     tsx src/testClient/roomLoadCheck.ts --stages=1,2,4,6,8
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FRAME_DT = 1 / 60;

function arg(name: string, fallback: string): string {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split("=")[1] : fallback;
}

/** Room-counts to ramp through. */
const STAGES = arg("stages", "1,2,4,6,8")
  .split(",")
  .map((n) => Number(n))
  .filter((n) => Number.isFinite(n) && n > 0);

const PER_ROOM = ROOM.maxPlayers;
const GROW_MS = Number(arg("grow", "13000"));
const WINDOW = Number(arg("window", "8"));

/**
 * Fly's hard_limit is 240 connections. Staying under it deliberately: the
 * goal is to find where the tick degrades, not to prove a documented
 * connection cap works, and a real player arriving mid-run should still get
 * in.
 */
const CEILING = Number(arg("ceiling", "200"));

interface Stage {
  wanted: number;
  clients: number;
  rooms: number;
  tickMin: number;
  tickMean: number;
  kbPerSecond: number;
  loopLagMs: number;
  cpuPercent: number;
}

/** Counts every byte one room sends one client. */
function meterSocket(room: Room) {
  const ws = (room as unknown as { connection: { transport: { ws: WebSocket } } })
    .connection.transport.ws;
  const traffic = { bytes: 0 };
  ws.addEventListener("message", (event: MessageEvent) => {
    const data = event.data;
    traffic.bytes +=
      data instanceof ArrayBuffer
        ? data.byteLength
        : typeof data === "string"
          ? data.length
          : (data?.byteLength ?? 0);
  });
  return traffic;
}

const tickOf = (room: Room) => (room.state?.tick as number | undefined) ?? 0;

/** One client per distinct room, so every room gets measured, not just one. */
function watchers(bots: Room[]): Room[] {
  const seen = new Set<string>();
  const picked: Room[] = [];
  for (const room of bots) {
    if (seen.has(room.roomId)) continue;
    seen.add(room.roomId);
    picked.push(room);
  }
  return picked;
}

async function main() {
  const endpoint = process.env.GAME_SERVER_URL ?? "ws://localhost:2567";
  console.log(`endpoint  ${endpoint}`);
  console.log(`stages    ${STAGES.join(", ")} room(s) · ${PER_ROOM} craft each`);
  console.log("");

  // A probe joined first, purely to report what is already there. Running a
  // load test into a room with real people in it is worth knowing about.
  const probe = await join();
  const occupied = (probe.state.players?.size ?? 1) - 1;
  if (occupied > 0) {
    console.log(`NOTE: ${occupied} player(s) already flying before this run started.`);
    console.log("");
  }
  await probe.leave();

  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  const bots: Room[] = [];
  const meters = new Map<string, { bytes: number }>();
  const results: Stage[] = [];
  let seq = 0;
  let flying = true;

  /** Every bot flies a lazy S, so the server is doing real collision work. */
  const flyThem = async () => {
    while (flying) {
      seq += 3;
      const samples = (turn: number) =>
        [seq - 2, seq - 1, seq].map((n) => ({
          seq: n,
          turn,
          pitch: 0,
          boosting: false,
          hover: false,
          roll: 0,
          dt: FRAME_DT,
        }));
      for (let i = 0; i < bots.length; i++) {
        try {
          bots[i].send("input", {
            samples: samples(Math.sin(Date.now() / 4000 + i * 1.7) * 0.55),
          });
        } catch {
          // a bot that dropped out; the count reported per stage is the
          // truth, so nothing needs doing here
        }
      }
      await sleep(3 * FRAME_DT * 1000);
    }
  };
  const flight = flyThem();

  for (const stage of STAGES) {
    const wanted = Math.min(stage * PER_ROOM, CEILING);
    if (bots.length >= wanted && stage !== STAGES[0]) continue;

    // Join in small parallel batches: one at a time is far too slow at this
    // scale, all at once trips the matchmaker.
    while (bots.length < wanted) {
      const batch = Math.min(8, wanted - bots.length);
      const joined = await Promise.all(
        Array.from({ length: batch }, () => join().catch(() => null)),
      );
      for (const room of joined) {
        if (!room) continue;
        const i = bots.length;
        const a = (i / PER_ROOM) * Math.PI * 2;
        room.send("spawn", {
          x: Math.cos(a) * 200,
          y: Math.sin(a) * 200,
          z: FLIGHT_ALTITUDE + ((i % 7) - 3) * 14,
          yaw: a + Math.PI / 2,
          pitch: 0,
          speed: 26,
          trailLength: 320,
        });
        bots.push(room);
      }
      await sleep(120);
    }

    const live = watchers(bots);
    for (const room of live) {
      if (!meters.has(room.roomId)) meters.set(room.roomId, meterSocket(room));
    }

    // Trails have to reach the cap before the measurement means anything.
    await sleep(GROW_MS);

    loop.reset();
    const cpu0 = process.cpuUsage();
    const startTicks = live.map(tickOf);
    const startBytes = live.map((r) => meters.get(r.roomId)?.bytes ?? 0);
    const t0 = Date.now();

    await sleep(WINDOW * 1000);

    const elapsed = (Date.now() - t0) / 1000;
    const rates = live.map((r, i) => (tickOf(r) - startTicks[i]) / elapsed);
    const bytes = live.reduce(
      (sum, r, i) => sum + ((meters.get(r.roomId)?.bytes ?? 0) - startBytes[i]),
      0,
    );
    const cpu = process.cpuUsage(cpu0);

    const result: Stage = {
      wanted,
      clients: bots.length,
      rooms: live.length,
      tickMin: Math.min(...rates),
      tickMean: rates.reduce((a, b) => a + b, 0) / rates.length,
      kbPerSecond: bytes / 1024 / elapsed / Math.max(1, live.length),
      loopLagMs: loop.mean / 1e6,
      cpuPercent: ((cpu.user + cpu.system) / 1000 / (elapsed * 1000)) * 100,
    };
    results.push(result);

    console.log(
      `${String(result.rooms).padStart(2)} room(s) · ${String(result.clients).padStart(3)} craft` +
        ` │ tick ${result.tickMean.toFixed(2)} Hz mean, ${result.tickMin.toFixed(2)} worst` +
        ` │ ${result.kbPerSecond.toFixed(1)} KB/s per client` +
        ` │ generator loop lag ${result.loopLagMs.toFixed(1)} ms, cpu ${result.cpuPercent.toFixed(0)}%`,
    );

    if (results.length > 1 && result.tickMin < results[0].tickMean * 0.5) {
      console.log("\nStopping the ramp: the tick has already collapsed.");
      break;
    }
  }

  flying = false;
  await flight;
  await leaveAll(bots);

  // ---- verdict -------------------------------------------------------------
  console.log("");
  const baseline = results[0];
  const worst = results[results.length - 1];

  // The generator running hot invalidates everything above it.
  const generatorSuspect = worst.loopLagMs > 40 || worst.cpuPercent > 85;
  if (generatorSuspect) {
    console.log(
      "WARNING: the load generator itself was saturated" +
        ` (loop lag ${worst.loopLagMs.toFixed(1)} ms, cpu ${worst.cpuPercent.toFixed(0)}%).` +
        "\nThe later stages measure THIS machine, not the server. Re-run from" +
        "\ntwo processes before trusting them.",
    );
    console.log("");
  }

  // Measured against the server's OWN idle rate, not the nominal 20Hz: a
  // Windows dev box idles near 16Hz because its timer will not land on 50ms,
  // and that is a property of the clock, not of load.
  const bar = baseline.tickMean * 0.9;
  const healthy = results.filter((r) => r.tickMin >= bar);
  const lastGood = healthy[healthy.length - 1];

  console.log(`nominal tick rate        ${SERVER_TICK_RATE_HZ} Hz`);
  console.log(
    `baseline (${baseline.rooms} room)         ${baseline.tickMean.toFixed(2)} Hz` +
      `  → the bar is ${bar.toFixed(2)} Hz`,
  );
  console.log(
    `at ${String(worst.clients).padStart(3)} craft / ${worst.rooms} rooms   ` +
      `${worst.tickMean.toFixed(2)} Hz mean, ${worst.tickMin.toFixed(2)} worst`,
  );
  console.log(
    `held 90% of baseline up to ` +
      (lastGood ? `${lastGood.clients} craft in ${lastGood.rooms} rooms` : "NO stage"),
  );

  process.exit(0);
}

main().catch((err) => {
  console.log("FAILED", err?.message ?? err);
  process.exit(1);
});
