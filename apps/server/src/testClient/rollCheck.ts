import { type Room } from "colyseus.js";
import { FLIGHT_ALTITUDE, ROLL } from "@shard-islands/shared";
import { colourOf, join, joinWithColour, leaveAll } from "./lobby.js";

/**
 * The Shockwave Barrel Roll: does it throw people, and does it save you?
 *
 * Five things have to be true, and only the first is visible from a
 * cockpit: it throws nearby craft clear, it throws them AWAY rather than in
 * some arbitrary direction, it costs the roller trail, it cannot be spammed,
 * and — the whole reason it exists — it makes the roller briefly impossible
 * to cut.
 *
 * That last one is the reason this is a script. Timing a roll into the
 * exact moment somebody is crossing your trail is not something two people
 * with two browsers can do on purpose, and a defensive move that only
 * sometimes defends is worse than none.
 *
 *   pnpm --filter server exec tsx src/testClient/rollCheck.ts
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FRAME_DT = 1 / 60;
const ALT = FLIGHT_ALTITUDE;

interface Seen {
  seat: number;
  colour: number;
  x: number;
  y: number;
  z: number;
  rolls: number;
  rollCooldown: number;
  rollSpin: number;
  shoveX: number;
  shoveY: number;
  trailLength: number;
  clipsTaken: number;
  immuneMs: number;
}

const look = (room: Room) =>
  room.state.players.get(room.sessionId) as unknown as Seen;

function spawn(room: Room, x: number, y: number, yaw: number, speed: number, trail: number) {
  room.send("spawn", { x, y, z: ALT, yaw, pitch: 0, speed, trailLength: trail });
}

let seq = 0;
async function fly(
  rooms: Room[],
  frames: number,
  opts: { roll?: Room; turn?: number } = {},
) {
  for (let f = 0; f < frames; f += 3) {
    seq += 3;
    for (const room of rooms) {
      const samples = [seq - 2, seq - 1, seq].map((n, i) => ({
        seq: n,
        turn: opts.turn ?? 0,
        pitch: 0,
        boosting: false,
        hover: false,
        // The roll is fired on exactly one sample, the way a double tap
        // reaches the wire — asking for it every frame would test a
        // different thing entirely.
        roll: opts.roll === room && f === 0 && i === 0 ? 1 : 0,
        dt: FRAME_DT,
      }));
      room.send("input", { samples });
    }
    await sleep(3 * FRAME_DT * 1000);
  }
}

async function main() {
  console.log(
    `roll radius ${ROLL.radius}m · shove ${ROLL.shoveSpeed}m/s · guard ${ROLL.guardMs}ms` +
      ` · cooldown ${ROLL.cooldownSeconds}s · costs ${ROLL.trailCost}\n`,
  );

  // ---- 1. the shove ----------------------------------------------------
  // A roller, somebody well inside the radius, and somebody just outside it.
  const roller = await join();
  const near = await join();
  const far = await join();
  const lane = -900;

  spawn(roller, 0, lane, 0, 0, 60);
  spawn(near, 0, lane + 18, 0, 0, 60);
  spawn(far, 0, lane + ROLL.radius + 25, 0, 0, 60);
  await sleep(200);

  // Everybody holds station, so the only thing that moves anybody is the
  // shockwave.
  const hold = async (frames: number, rollWith?: Room) => {
    for (let f = 0; f < frames; f += 3) {
      seq += 3;
      for (const room of [roller, near, far]) {
        room.send("input", {
          samples: [seq - 2, seq - 1, seq].map((n, i) => ({
            seq: n,
            turn: 0,
            pitch: 0,
            boosting: false,
            hover: true,
            roll: rollWith === room && f === 0 && i === 0 ? 1 : 0,
            dt: FRAME_DT,
          })),
        });
      }
      await sleep(3 * FRAME_DT * 1000);
    }
  };

  await hold(60);
  const beforeNear = look(near).y;
  const beforeFar = look(far).y;
  const beforeTrail = look(roller).trailLength;

  // Watched rather than sampled once. The spin lasts under a second and the
  // guard under a second and a half; reading either after the dust settles
  // finds zero and blames the game for the stopwatch.
  let sawSpin = 0;
  let sawCooldown = 0;
  let sawGuard = 0;
  const watch = setInterval(() => {
    const now = look(roller);
    if (!now) return;
    if (now.rollSpin > sawSpin) sawSpin = now.rollSpin;
    if (now.rollCooldown > sawCooldown) sawCooldown = now.rollCooldown;
    if (now.immuneMs > sawGuard) sawGuard = now.immuneMs;
  }, 10);

  await hold(3, roller);
  await hold(90);
  clearInterval(watch);

  const spunUp = sawSpin > 0;
  const cooldownSet = sawCooldown;

  const nearMoved = look(near).y - beforeNear;
  const farMoved = look(far).y - beforeFar;
  const rollerTrail = look(roller).trailLength;
  const guard = sawGuard;

  console.log(
    `roll fired        spin peaked ${sawSpin.toFixed(2)} rad,` +
      ` cooldown ${cooldownSet.toFixed(1)}s`,
  );
  console.log(
    `near craft        18m away, thrown ${nearMoved.toFixed(1)}m` +
      ` (${nearMoved > 0 ? "outward" : "INWARD"})`,
  );
  console.log(`far craft         ${(ROLL.radius + 25).toFixed(0)}m away, moved ${farMoved.toFixed(1)}m`);
  console.log(`roller paid       ${beforeTrail.toFixed(0)} -> ${rollerTrail.toFixed(0)}`);
  console.log(`guard             ${guard}ms`);

  // ---- 2. it cannot be spammed ----------------------------------------
  const rollsBefore = look(roller).rolls;
  await hold(3, roller);
  await hold(30);
  const rollsAfter = look(roller).rolls;
  console.log(`second roll       ${rollsAfter - rollsBefore} fired (expected 0, on cooldown)`);

  await leaveAll([roller, near, far]);
  await sleep(300);

  // ---- 3. the guard actually saves you ---------------------------------
  // A victim laying a trail, and a rival crossing it. Run twice: once
  // letting the cut land, once with the victim rolling as it comes in.
  const cutOutcome = async (rollOut: boolean) => {
    const victim = await join();
    const found = await joinWithColour(colourOf(victim), false);
    const attacker = found.room;
    const y = rollOut ? -400 : -200;

    spawn(victim, 0, y, 0, 26, 120);
    await sleep(150);
    await fly([victim], 180);

    // Crossing at right angles, forty metres out.
    spawn(attacker, 30, y - 40, Math.PI / 2, 26, 26);
    await sleep(150);

    // The victim rolls just as the attacker commits. Fired blind on a timer
    // rather than on proximity, which is what a real player does.
    if (rollOut) {
      await fly([victim, attacker], 60);
      await fly([victim, attacker], 6, { roll: victim });
      await fly([victim, attacker], 200);
    } else {
      await fly([victim, attacker], 266);
    }

    const after = look(victim);
    await leaveAll([victim, attacker, ...found.padding]);
    await sleep(250);
    return after;
  };

  const undefended = await cutOutcome(false);
  console.log(
    `\nno roll           victim cut ${undefended.clipsTaken} time(s), trail ${undefended.trailLength.toFixed(0)}`,
  );
  const defended = await cutOutcome(true);
  console.log(
    `rolled out        victim cut ${defended.clipsTaken} time(s), trail ${defended.trailLength.toFixed(0)}`,
  );

  console.log("");
  const checks: [string, boolean, string][] = [
    [
      "a double tap starts a roll",
      spunUp && cooldownSet > ROLL.cooldownSeconds * 0.8,
      `${sawSpin.toFixed(2)} rad, ${cooldownSet.toFixed(1)}s cooldown`,
    ],
    [
      "it throws a near craft clear",
      nearMoved > 4,
      `${nearMoved.toFixed(1)}m`,
    ],
    ["...and throws it OUTWARD", nearMoved > 0, nearMoved > 0 ? "away" : "toward the roller"],
    [
      "it leaves a distant craft alone",
      Math.abs(farMoved) < 1,
      `${farMoved.toFixed(2)}m`,
    ],
    [
      "the roller pays for it",
      Math.abs(beforeTrail - rollerTrail - ROLL.trailCost) < 1.5,
      `${beforeTrail.toFixed(0)} -> ${rollerTrail.toFixed(0)}`,
    ],
    ["it guards the roller", guard > ROLL.guardMs * 0.5, `${guard}ms`],
    ["it cannot be spammed", rollsAfter === rollsBefore, `${rollsAfter - rollsBefore} extra`],
    [
      "the attack lands when undefended",
      undefended.clipsTaken > 0,
      `${undefended.clipsTaken} cut(s)`,
    ],
    [
      "and the roll turns it away",
      defended.clipsTaken === 0,
      `${defended.clipsTaken} cut(s)`,
    ],
  ];

  for (const [name, ok, detail] of checks) {
    console.log(`${ok ? "  ok  " : " FAIL "} ${name.padEnd(34)} ${detail}`);
  }

  const allOk = checks.every(([, ok]) => ok);
  console.log(allOk ? "\nRESULT: OK" : "\nRESULT: FAILED");
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.log("RESULT: FAILED", err?.message ?? err);
  process.exit(1);
});
