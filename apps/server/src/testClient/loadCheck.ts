import { type Room } from "colyseus.js";
import { FLIGHT_ALTITUDE, SERVER_TICK_RATE_HZ } from "@shard-islands/shared";
import { join, leaveAll } from "./lobby.js";

/**
 * What a full room costs the server and the wire.
 *
 * The plan defers two optimisations to this phase — a spatial hash for
 * collision, and decimating and quantising the trail arrays — and both are
 * easy to justify in the abstract and expensive to get wrong. Neither
 * should be built without a number saying it is needed.
 *
 * The question is not "does the server hit twenty ticks a second", because
 * a Windows timer will not hit it exactly whatever the load. The question
 * is whether FILLING THE ROOM makes it worse. So this measures an empty
 * room, fills it, and measures again.
 *
 * Bandwidth is counted off the client's actual socket rather than estimated
 * from the schema, which would only measure a guess about the delta
 * encoder.
 *
 *   pnpm --filter server exec tsx src/testClient/loadCheck.ts --count=23
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FRAME_DT = 1 / 60;

function arg(name: string, fallback: number) {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? Number(found.split("=")[1]) : fallback;
}

const COUNT = Math.max(1, Math.min(23, arg("count", 23)));
const WINDOW = arg("window", 10);

interface Sample {
  tickRate: number;
  kbPerSecond: number;
  players: number;
  trailPoints: number;
}

/** Counts every byte the room sends this client. */
function meterSocket(room: Room) {
  const ws = (room as unknown as { connection: { transport: { ws: WebSocket } } })
    .connection.transport.ws;
  const traffic = { bytes: 0, messages: 0 };
  ws.addEventListener("message", (event: MessageEvent) => {
    const data = event.data;
    traffic.messages++;
    traffic.bytes +=
      data instanceof ArrayBuffer
        ? data.byteLength
        : typeof data === "string"
          ? data.length
          : (data?.byteLength ?? 0);
  });
  return traffic;
}

async function measure(
  room: Room,
  traffic: { bytes: number; messages: number },
  seconds: number,
): Promise<Sample> {
  const startTick = room.state.tick as number;
  const startBytes = traffic.bytes;
  const t0 = Date.now();

  await sleep(seconds * 1000);

  const elapsed = (Date.now() - t0) / 1000;
  let trailPoints = 0;
  room.state.players.forEach((p: { trail: { length: number } }) => {
    trailPoints += p.trail.length;
  });

  return {
    tickRate: ((room.state.tick as number) - startTick) / elapsed,
    kbPerSecond: (traffic.bytes - startBytes) / 1024 / elapsed,
    players: room.state.players.size,
    trailPoints,
  };
}

const report = (label: string, s: Sample) =>
  console.log(
    `${label.padEnd(18)} ${s.players} players, ${s.trailPoints} trail points` +
      ` · ${s.tickRate.toFixed(2)} ticks/s` +
      ` · ${s.kbPerSecond.toFixed(1)} KB/s`,
  );

async function main() {
  const watcher = await join();
  const traffic = meterSocket(watcher);
  await sleep(500);

  const idle = await measure(watcher, traffic, WINDOW);
  report("empty room", idle);

  // Fill it: a ring of craft, all turning, all with trails near the cap.
  const bots: Room[] = [];
  for (let i = 0; i < COUNT; i++) bots.push(await join());
  bots.forEach((room, i) => {
    const a = (i / COUNT) * Math.PI * 2;
    room.send("spawn", {
      x: Math.cos(a) * 200,
      y: Math.sin(a) * 200,
      z: FLIGHT_ALTITUDE + ((i % 7) - 3) * 14,
      yaw: a + Math.PI / 2,
      pitch: 0,
      speed: 26,
      trailLength: 320,
    });
  });

  let seq = 0;
  let flying = true;
  const flyThem = async () => {
    while (flying) {
      seq += 3;
      for (let i = 0; i < bots.length; i++) {
        const turn = Math.sin(Date.now() / 4000 + i * 1.7) * 0.55;
        bots[i].send("input", {
          samples: [seq - 2, seq - 1, seq].map((n) => ({
            seq: n,
            turn,
            pitch: 0,
            boosting: false,
            hover: false,
            roll: 0,
            dt: FRAME_DT,
          })),
        });
      }
      await sleep(3 * FRAME_DT * 1000);
    }
  };
  const flight = flyThem();

  // Long enough for every trail to grow to its cap, which is the expensive
  // state to measure — a room measured the instant it fills is measuring
  // twenty-four empty ribbons.
  await sleep(14000);

  const loaded = await measure(watcher, traffic, WINDOW);
  report("full room", loaded);

  flying = false;
  await flight;
  await leaveAll([watcher, ...bots]);

  const slowdown = 1 - loaded.tickRate / idle.tickRate;
  const perPlayer = loaded.kbPerSecond / Math.max(1, loaded.players - 1);

  console.log("");
  console.log(`tick rate lost to load   ${(slowdown * 100).toFixed(1)}%`);
  console.log(`bandwidth per player     ${perPlayer.toFixed(2)} KB/s`);
  console.log(`(nominal tick rate ${SERVER_TICK_RATE_HZ}Hz; a timer that never lands`);
  console.log(` exactly on 50ms is why the empty room is the baseline)`);

  const checks: [string, boolean, string][] = [
    [
      "filling the room does not slow the tick",
      slowdown < 0.06,
      `${(slowdown * 100).toFixed(1)}% slower`,
    ],
    [
      "a full room fits a mobile connection",
      loaded.kbPerSecond < 25,
      `${loaded.kbPerSecond.toFixed(1)} KB/s`,
    ],
  ];

  console.log("");
  for (const [name, ok, detail] of checks) {
    console.log(`${ok ? "  ok  " : " FAIL "} ${name.padEnd(40)} ${detail}`);
  }

  const allOk = checks.every(([, ok]) => ok);
  console.log(allOk ? "\nRESULT: OK" : "\nRESULT: FAILED");
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.log("RESULT: FAILED", err?.message ?? err);
  process.exit(1);
});
