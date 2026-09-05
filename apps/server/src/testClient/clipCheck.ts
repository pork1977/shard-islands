import { Client, type Room } from "colyseus.js";
import { CLIP, FLIGHT_ALTITUDE } from "@shard-islands/shared";

/**
 * The tail-clip regression harness the plan asks for at this phase.
 *
 * Collision timing is the one thing in this project that manual testing
 * cannot honestly check. Two people in two browsers can tell you a clip
 * happened; they cannot tell you whether it happened for the right reason,
 * whether it would have happened a tick earlier or later, or whether the
 * near-misses that should have been misses actually were. Every scenario
 * here is a fixed geometry with one expected answer.
 *
 *   pnpm --filter server exec tsx src/testClient/clipCheck.ts
 */

const ENDPOINT = process.env.GAME_SERVER_URL ?? "ws://localhost:2567";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ALT = FLIGHT_ALTITUDE;
const FRAME_DT = 1 / 60;

/** The victim runs along +X through the origin; everything is placed off that. */
const VICTIM_TRAIL_LENGTH = 120;
/** Where the clipper is aimed to cross it. */
const CROSS_X = 30;
/**
 * Each scenario gets its own strip of sky.
 *
 * Learned the hard way: run them all through the same coordinates and the
 * shards scattered by one cut are still lying there twenty-six seconds
 * later, directly on the flight path of the next scenario, which quietly
 * collects them and reports numbers that mean nothing.
 */
const LANES = [-360, -180, 0, 180, 360];

interface Seen {
  seat: number;
  colour: number;
  trailLength: number;
  trailPoints: number;
  clipsTaken: number;
  clipsMade: number;
  immuneMs: number;
  x: number;
  y: number;
  draft: number;
}

async function join(): Promise<Room> {
  return new Client(ENDPOINT).joinOrCreate("shard_islands");
}

function look(room: Room): Seen {
  const me = room.state.players.get(room.sessionId) as Record<string, number> & {
    trail: { length: number };
  };
  return {
    seat: me.seat,
    colour: me.colour,
    trailLength: me.trailLength,
    trailPoints: me.trail.length,
    clipsTaken: me.clipsTaken,
    clipsMade: me.clipsMade,
    immuneMs: me.immuneMs,
    x: me.x,
    y: me.y,
    draft: me.draft,
  };
}

function spawn(
  room: Room,
  x: number,
  y: number,
  yaw: number,
  speed: number,
  trailLength: number,
) {
  room.send("spawn", { x, y, z: ALT, yaw, pitch: 0, speed, trailLength });
}

/** Straight and level for `frames` frames, three samples per message. */
async function fly(rooms: Room[], frames: number, seqFrom: number, boosting = false) {
  let seq = seqFrom;
  for (let f = 0; f < frames; f += 3) {
    seq += 3;
    const samples = [seq - 2, seq - 1, seq].map((n) => ({
      seq: n,
      turn: 0,
      pitch: 0,
      boosting,
      hover: false,
      dt: FRAME_DT,
    }));
    for (const room of rooms) room.send("input", { samples });
    await sleep(3 * FRAME_DT * 1000);
  }
  return seq;
}

/**
 * One pass at a trail.
 *
 * `extraSeats` pads the room so the clipper lands on a seat whose colour
 * matches the victim's — the only way to test the same-colour rule, since
 * colour is seat % 8.
 */
async function pass(opts: {
  label: string;
  lane: number;
  extraSeats: number;
  /** PI/2 crosses the trail; 0 follows it. */
  clipperYaw: number;
  clipperY: number;
  clipperSpeed: number;
  /** Hand the clipper a whole tick of input at once, so it jumps the trail. */
  burst?: boolean;
}) {
  const victim = await join();
  const padding: Room[] = [];
  for (let i = 0; i < opts.extraSeats; i++) padding.push(await join());
  const clipper = await join();

  // The victim lays a long straight line down its lane.
  spawn(victim, 0, opts.lane, 0, 26, VICTIM_TRAIL_LENGTH);
  await sleep(150);
  let seq = await fly([victim], 180, 0);

  const before = look(victim);

  // Then the clipper is dropped in beside it and flown across.
  spawn(
    clipper,
    CROSS_X,
    opts.lane + opts.clipperY,
    opts.clipperYaw,
    opts.clipperSpeed,
    26,
  );
  await sleep(150);

  // Only what THIS pass scatters counts: shards from an earlier scenario
  // live for twenty-six seconds and would otherwise be counted again.
  const shardsBefore = (clipper.state.shards as unknown as { length: number }).length;

  // How close the clipper is ever SEEN to the victim's line, so a pass that
  // tunnelled can be told apart from one that simply touched. Immunity is
  // watched at the same time, because it counts down from the moment of the
  // cut and is long gone by the time the pass finishes.
  let closest = Infinity;
  let mostImmune = 0;
  const watch = setInterval(() => {
    const me = clipper.state.players.get(clipper.sessionId) as
      | { x: number; y: number }
      | undefined;
    if (me && Math.abs(me.y - opts.lane) < closest) closest = Math.abs(me.y - opts.lane);

    const prey = victim.state.players.get(victim.sessionId) as
      | { immuneMs: number }
      | undefined;
    if (prey && prey.immuneMs > mostImmune) mostImmune = prey.immuneMs;
  }, 5);

  if (opts.burst) {
    const samples = [];
    for (let i = 1; i <= 12; i++) {
      samples.push({ seq: i, turn: 0, pitch: 0, boosting: true, hover: false, dt: 1 / 20 });
    }
    clipper.send("input", { samples });
    await sleep(900);
  } else {
    seq = await fly([victim, clipper], 240, seq);
    await sleep(300);
  }

  clearInterval(watch);

  const after = look(victim);
  const hunter = look(clipper);
  const shards =
    (clipper.state.shards as unknown as { length: number }).length - shardsBefore;

  await victim.leave();
  await clipper.leave();
  for (const p of padding) await p.leave();

  console.log(
    `${opts.label.padEnd(18)} victim P${before.seat + 1}/c${before.colour}` +
      `  clipper P${hunter.seat + 1}/c${hunter.colour}` +
      `  trail ${before.trailLength.toFixed(0)} -> ${after.trailLength.toFixed(0)}` +
      `  cuts ${after.clipsTaken}` +
      `  shards ${shards}` +
      `  closest ${closest.toFixed(1)}m`,
  );

  return {
    before,
    after,
    hunter,
    shards,
    closest,
    mostImmune,
    sameColour: before.colour === hunter.colour,
  };
}

/**
 * The severed tail is out there to be taken — but not immediately.
 *
 * Both halves matter. If shards could not be collected, a clip would be
 * pure destruction and there would be no reason to hunt anybody. If they
 * could be collected the instant they appear, the victim — who is standing
 * right where the cut happened — would simply re-absorb their own tail and
 * lose nothing at all. The arming delay is what turns a kill into a race
 * back to the wreckage.
 *
 * Timed from the moment the shards actually appear, watched at ten
 * milliseconds, because the whole question is about a second and a half.
 */
async function collectAShard() {
  const victim = await join();
  const clipper = await join();
  // Joined in advance: once the cut lands there is only about a second and
  // a half before the shards arm, which is not enough time to negotiate a
  // new connection.
  const scavenger = await join();

  // Read fresh each time rather than held: nothing guarantees the array
  // instance a client hands out before its first patch is the one it keeps.
  const shardsNow = () =>
    clipper.state.shards as unknown as {
      length: number;
      [i: number]: { x: number; y: number; z: number; value: number };
    };
  const before = shardsNow().length;

  const lane = LANES[4];
  spawn(victim, 0, lane, 0, 26, VICTIM_TRAIL_LENGTH);
  await sleep(150);
  const seq = await fly([victim], 180, 0);
  spawn(clipper, CROSS_X, lane - 40, Math.PI / 2, 26, 26);
  await sleep(150);

  // Fly the pass and STOP the instant the trail comes apart. Flying it out
  // to the end and looking afterwards was the first attempt, and it quietly
  // made the whole test meaningless: by then the shards had been armed for
  // seconds, so the arming delay could never have been observed.
  let cutAt = 0;
  let flown = seq;
  for (let f = 0; f < 240 && cutAt === 0; f += 3) {
    flown = await fly([victim, clipper], 3, flown);
    if (shardsNow().length > before) cutAt = Date.now();
  }

  if (cutAt === 0 || shardsNow().length <= before) {
    console.log(
      `shard pickup       no cut: victim c${look(victim).colour}` +
        ` clipper c${look(clipper).colour}` +
        ` cuts ${look(victim).clipsTaken}` +
        ` shards ${before} -> ${shardsNow().length}`,
    );
    await victim.leave();
    await clipper.leave();
    await scavenger.leave();
    return { ok: false, why: "no cut happened, so nothing to collect" };
  }

  const shards = shardsNow();
  const newest = shards[shards.length - 1];
  const target = { x: newest.x, y: newest.y, z: newest.z, value: newest.value };
  const startTrail = look(scavenger).trailLength;

  // Parked exactly on it and held there. Hover input every frame, because a
  // craft the room hears nothing from is flown for it — and would drift off
  // the shard it is meant to be sitting on.
  scavenger.send("spawn", {
    x: target.x,
    y: target.y,
    z: target.z,
    yaw: 0,
    pitch: 0,
    speed: 0,
    trailLength: startTrail,
  });

  let duringArming = -1;
  let seat = 0;
  for (let i = 0; i < 60; i++) {
    scavenger.send("input", {
      samples: [
        { seq: ++seat, turn: 0, pitch: 0, boosting: false, hover: true, dt: FRAME_DT },
      ],
    });
    const since = Date.now() - cutAt;
    // Sampled comfortably inside the arming window, allowing for the fact
    // that cutAt is when this client SAW the shards, up to a patch late.
    if (duringArming < 0 && since > 700) duringArming = look(scavenger).trailLength;
    if (since > CLIP.shardArmMs + 1200) break;
    await sleep(50);
  }

  const after = look(scavenger).trailLength;

  await victim.leave();
  await clipper.leave();
  await scavenger.leave();

  const heldBack = duringArming === startTrail;
  const collected = after >= startTrail + target.value;

  console.log(
    `shard pickup       worth ${target.value}` +
      `  parked on it: ${startTrail.toFixed(0)}` +
      ` -> ${duringArming.toFixed(0)} while arming` +
      ` -> ${after.toFixed(0)} after`,
  );

  return {
    ok: heldBack && collected,
    why: heldBack
      ? collected
        ? "held back, then collected"
        : "armed but never collected"
      : "collected before it armed",
  };
}

async function main() {
  console.log(
    `clip radius ${CLIP.radius}m · crossing needs agreement < ${CLIP.maxHeadingAgreement}` +
      ` · immunity ${CLIP.immunityMs}ms\n`,
  );

  // 1. A rival crossing the wake at right angles: the whole point.
  const crossed = await pass({
    label: "rival crosses",
    lane: LANES[0],
    extraSeats: 0,
    clipperYaw: Math.PI / 2,
    clipperY: -40,
    clipperSpeed: 26,
  });
  await sleep(400);

  // 2. The same pass by somebody of the victim's own colour. Colours are
  //    seat % 8, so seven padding seats put the clipper on seat 8.
  const allied = await pass({
    label: "ally crosses",
    lane: LANES[1],
    extraSeats: 7,
    clipperYaw: Math.PI / 2,
    clipperY: -40,
    clipperSpeed: 26,
  });
  await sleep(400);

  // 3. A rival FOLLOWING the wake. This is drafting, and it sits the craft
  //    exactly on the line a cut is tested against — if it severed, draft
  //    and clip could not both exist.
  const followed = await pass({
    label: "rival follows",
    lane: LANES[2],
    extraSeats: 0,
    clipperYaw: 0,
    clipperY: 0,
    clipperSpeed: 26,
  });
  await sleep(400);

  // 4. A rival crossing so fast it is never sampled anywhere near the trail.
  const tunnelled = await pass({
    label: "rival jumps it",
    lane: LANES[3],
    extraSeats: 0,
    clipperYaw: Math.PI / 2,
    clipperY: -90,
    clipperSpeed: 400,
    burst: true,
  });
  await sleep(400);

  // 5. And the payoff: the severed tail is out there to be taken.
  const picked = await collectAShard();

  console.log("");

  const checks: [string, boolean, string][] = [
    ["a rival's crossing cuts", crossed.after.clipsTaken === 1, `${crossed.after.clipsTaken} cuts`],
    [
      "the cut costs the victim",
      crossed.after.trailLength < crossed.before.trailLength - 5,
      `${crossed.before.trailLength.toFixed(0)} -> ${crossed.after.trailLength.toFixed(0)}`,
    ],
    ["the clipper is credited", crossed.hunter.clipsMade === 1, `${crossed.hunter.clipsMade}`],
    [
      "the victim is given grace",
      crossed.mostImmune > CLIP.immunityMs * 0.8,
      `${crossed.mostImmune}ms of ${CLIP.immunityMs}`,
    ],
    ["the tail scatters", crossed.shards > 0, `${crossed.shards} shards`],
    ["same colour cannot cut", allied.sameColour && allied.after.clipsTaken === 0, allied.sameColour ? `${allied.after.clipsTaken} cuts` : "colours did not match — test invalid"],
    ["following is not cutting", followed.after.clipsTaken === 0, `${followed.after.clipsTaken} cuts`],
    ["drafting still works there", followed.hunter.draft > 1, `${followed.hunter.draft.toFixed(2)}x`],
    ["a jumped trail still cuts", tunnelled.after.clipsTaken === 1, `${tunnelled.after.clipsTaken} cuts`],
    [
      "  ...and it really jumped",
      tunnelled.closest > CLIP.radius,
      `never seen closer than ${tunnelled.closest.toFixed(1)}m`,
    ],
    ["shards arm, then collect", picked.ok, picked.why],
  ];

  for (const [name, ok, detail] of checks) {
    console.log(`${ok ? "  ok  " : " FAIL "} ${name.padEnd(30)} ${detail}`);
  }

  const allOk = checks.every(([, ok]) => ok);
  console.log(allOk ? "\nRESULT: OK" : "\nRESULT: FAILED");
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.log("RESULT: FAILED", err?.message ?? err);
  process.exit(1);
});
