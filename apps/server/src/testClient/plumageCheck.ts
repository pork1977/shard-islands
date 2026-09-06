import { PLUMAGE_FORMS, PLUMAGE_NAMES, plumageSites } from "@shard-islands/shared";
import { join, leaveAll } from "./lobby.js";

/**
 * That a rare node can actually be taken, and that the server decides what
 * it turns you into.
 *
 * Three things worth proving and one worth proving twice. The pickup has to
 * survive being flown through at speed, like the cores — the swept test
 * exists because the endpoint test let a boosted dive pass clean through
 * something it was aimed at, and that failure costs far more here, where a
 * node takes two and a half minutes to come back.
 *
 * The form has to be one of the three and it has to come from the SERVER:
 * a client-rolled form is a craft that looks like one thing to its owner
 * and another to everyone else, which is the bug the Beacon already taught
 * this project once.
 *
 * And it has to be keepable but not collectable twice, because the node is
 * a transformation rather than a currency.
 *
 *   pnpm --filter server exec tsx src/testClient/plumageCheck.ts
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FRAME_DT = 1 / 60;

const plumageOf = (room: { state: { players: { get(id: string): unknown } } }, id: string) =>
  (room.state.players.get(id) as { plumage: number } | undefined)?.plumage ?? -1;

const takenCount = (room: { state: { plumageTaken: ArrayLike<boolean> } }) => {
  const flags = room.state.plumageTaken;
  let n = 0;
  for (let i = 0; i < flags.length; i++) if (flags[i]) n++;
  return n;
};

async function main() {
  const sites = plumageSites();
  console.log(`${sites.length} rare nodes, first at ` +
    `${sites[0].x.toFixed(0)}, ${sites[0].y.toFixed(0)}, ${sites[0].z.toFixed(0)}`);

  const room = await join();
  const target = sites[0];

  // Land a little short of it and fly straight through, rather than landing
  // on top of it: arriving already inside the bubble would prove only that
  // a stationary craft can be given one.
  const APPROACH = 150;
  room.send("spawn", {
    x: target.x - APPROACH,
    y: target.y,
    z: target.z,
    yaw: 0, // +X, straight at it
    pitch: 0,
    speed: 30,
    trailLength: 30,
  });
  await sleep(400);

  const before = plumageOf(room, room.sessionId);
  const takenBefore = takenCount(room as never);

  let seq = 0;
  for (let i = 0; i < 100; i++) {
    seq += 3;
    room.send("input", {
      samples: [seq - 2, seq - 1, seq].map((n) => ({
        seq: n,
        turn: 0,
        pitch: 0,
        boosting: true, // at speed, which is the part that used to fail
        hover: false,
        roll: 0,
        dt: FRAME_DT,
      })),
    });
    await sleep(3 * FRAME_DT * 1000);
    if (plumageOf(room, room.sessionId) !== 0) break;
  }

  await sleep(500);
  const after = plumageOf(room, room.sessionId);
  const takenAfter = takenCount(room as never);

  // Fly on for a while: a second node must not overwrite the first.
  for (let i = 0; i < 60; i++) {
    seq += 3;
    room.send("input", {
      samples: [seq - 2, seq - 1, seq].map((n) => ({
        seq: n,
        turn: 0.2,
        pitch: 0,
        boosting: true,
        hover: false,
        roll: 0,
        dt: FRAME_DT,
      })),
    });
    await sleep(3 * FRAME_DT * 1000);
  }
  const later = plumageOf(room, room.sessionId);

  await leaveAll([room]);

  console.log(`before          ${before}`);
  console.log(`after flying through  ${after} (${PLUMAGE_NAMES[after] ?? "none"})`);
  console.log(`still, later    ${later}`);
  console.log(`nodes taken     ${takenBefore} → ${takenAfter}`);

  const checks: [string, boolean, string][] = [
    ["starts with nothing", before === 0, `${before}`],
    ["flying through takes it", after !== 0, `${PLUMAGE_NAMES[after] ?? after}`],
    [
      "the form is one the server offers",
      PLUMAGE_FORMS.includes(after as never),
      `${after}`,
    ],
    ["exactly one node was consumed", takenAfter === takenBefore + 1, `${takenAfter}`],
    ["it is kept, not re-rolled", later === after, `${after} → ${later}`],
  ];

  console.log("");
  for (const [name, ok, detail] of checks) {
    console.log(`${ok ? "  ok  " : " FAIL "} ${name.padEnd(38)} ${detail}`);
  }

  const allOk = checks.every(([, ok]) => ok);
  console.log(allOk ? "\nRESULT: OK" : "\nRESULT: FAILED");
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.log("RESULT: FAILED", err?.message ?? err);
  process.exit(1);
});
