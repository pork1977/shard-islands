import { Client, type Room } from "colyseus.js";

/**
 * Stages a tail-clip directly in front of whoever is playing in a browser.
 *
 * The harness proves the mechanic is correct; it cannot show anybody what it
 * looks like. Two bots are flown into position relative to a real player's
 * craft and one cuts the other, so the ring, the severed ribbon and the
 * scatter of shards all happen in the middle of that player's view — which
 * is the only way to check that a thing meant to be read at flying speed
 * actually reads.
 *
 * Also the seed of the bot harness the plan wants for the mobile perf pass:
 * "put N convincing craft in somebody's sky on demand".
 *
 *   pnpm --filter server exec tsx src/testClient/clipDemo.ts
 */

const ENDPOINT = process.env.GAME_SERVER_URL ?? "ws://localhost:2567";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FRAME_DT = 1 / 60;

interface Watched {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  seat: number;
  colour: number;
  simulated: boolean;
  trail: { length: number; [i: number]: { x: number; y: number; z: number } };
}

/**
 * Cut the watching player's own trail instead of staging one between bots.
 *
 *   pnpm --filter server exec tsx src/testClient/clipDemo.ts --cut-me
 *
 * Worth having as a separate mode: being cut is a different code path from
 * watching somebody else be cut — it is the one that has to move the
 * player's own score, put their own message on their own screen, and leave
 * their own colour scattered behind them.
 */
const CUT_THE_WATCHER = process.argv.includes("--cut-me");

async function join(): Promise<Room> {
  return new Client(ENDPOINT).joinOrCreate("shard_islands");
}

/** Waits for somebody who is actually flying, and is not one of ours. */
async function findAudience(room: Room, ours: Set<string>): Promise<Watched> {
  for (let attempt = 0; attempt < 120; attempt++) {
    let found: Watched | null = null;
    room.state.players.forEach((p: Watched, id: string) => {
      if (found || ours.has(id) || !p.simulated) return;
      found = { ...p, id };
    });
    if (found) return found;
    await sleep(500);
  }
  throw new Error("nobody is flying — open the game in a browser first");
}

async function main() {
  const stage = await join();
  const victim = await join();
  const clipper = await join();
  const ours = new Set([stage.sessionId, victim.sessionId, clipper.sessionId]);

  console.log("waiting for a browser to start flying...");
  const you = await findAudience(stage, ours);
  console.log(`staging in front of P${you.seat + 1} at ${you.x.toFixed(0)}, ${you.y.toFixed(0)}`);

  if (CUT_THE_WATCHER) {
    await cutTheWatcher(stage, clipper, you.id);
    await stage.leave();
    await victim.leave();
    await clipper.leave();
    return;
  }

  // The player's own frame: forward, and the horizontal right of it.
  const cp = Math.cos(you.pitch);
  const fx = cp * Math.cos(you.yaw);
  const fy = cp * Math.sin(you.yaw);
  const rx = fy;
  const ry = -fx;

  const AHEAD = 90;
  const SIDE = 45;

  // The victim crosses their view from left to right, laying a ribbon
  // straight across it.
  const vx = you.x + fx * AHEAD - rx * SIDE;
  const vy = you.y + fy * AHEAD - ry * SIDE;
  const victimYaw = Math.atan2(ry, rx);

  victim.send("spawn", {
    x: vx,
    y: vy,
    z: you.z,
    yaw: victimYaw,
    pitch: 0,
    speed: 26,
    trailLength: 140,
  });

  let seq = 0;
  const fly = async (rooms: Room[], frames: number) => {
    for (let f = 0; f < frames; f += 3) {
      seq += 3;
      const samples = [seq - 2, seq - 1, seq].map((n) => ({
        seq: n,
        turn: 0,
        pitch: 0,
        boosting: false,
        hover: false,
        dt: FRAME_DT,
      }));
      for (const room of rooms) room.send("input", { samples });
      await sleep(3 * FRAME_DT * 1000);
    }
  };

  // Long enough for a ribbon worth cutting, and no longer: the audience is
  // still flying, and a scene staged too far ahead of them is behind them by
  // the time it happens.
  await sleep(200);
  await fly([victim], 90);

  // The clipper is aimed at the VICTIM'S TRAIL rather than at the player.
  // Aiming it at the player's own frame was the first attempt and it missed
  // as often as it hit: by the time the ribbon existed, the craft it had
  // been measured from was a hundred metres further on.
  const trail = victim.state.players.get(victim.sessionId) as {
    trail: { length: number; [i: number]: { x: number; y: number; z: number } };
  };
  const mid = trail.trail[Math.floor(trail.trail.length / 2)];

  // Ninety degrees to the ribbon, far enough back to build up to it.
  const acrossYaw = victimYaw + Math.PI / 2;
  const cx = mid.x - Math.cos(acrossYaw) * 60;
  const cy = mid.y - Math.sin(acrossYaw) * 60;
  clipper.send("spawn", {
    x: cx,
    y: cy,
    z: mid.z,
    yaw: acrossYaw,
    pitch: 0,
    speed: 34,
    trailLength: 40,
  });

  console.log("cutting...");
  await fly([victim, clipper], 360);

  const cut = victim.state.players.get(victim.sessionId) as { clipsTaken: number };
  const shards = (stage.state.shards as unknown as { length: number }).length;
  console.log(`cuts landed ${cut.clipsTaken}, shards in the sky ${shards}`);

  // Held there a while so the shards can be looked at, and flown at.
  await fly([victim, clipper], 600);

  await stage.leave();
  await victim.leave();
  await clipper.leave();
  console.log("done — bots have left the room");
}

/**
 * Fly a bot straight through the watching player's own ribbon.
 *
 * The obvious version of this does not work, and the reason is worth
 * writing down: a trail is not a place, it is a moving object. Aim a bot at
 * a point that is on somebody's ribbon right now and by the time it gets
 * there the ribbon has slid on — a twenty-six point trail at cruise is
 * completely replaced in under two seconds, so the bot arrives at empty sky
 * where a trail used to be. The first attempt missed every time for exactly
 * that reason.
 *
 * So it intercepts instead: launched at the piece of sky the ribbon is
 * about to occupy, arriving as it does. Retried a few times, because the
 * player is a person and may turn.
 */
async function cutTheWatcher(stage: Room, clipper: Room, targetId: string) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const target = stage.state.players.get(targetId) as Watched;
    if (!target) return;
    if (target.trail.length < 8) {
      console.log(`only ${target.trail.length} trail points — fly around a bit first`);
      await sleep(1500);
      continue;
    }

    const cp = Math.cos(target.pitch);
    const hx = cp * Math.cos(target.yaw);
    const hy = cp * Math.sin(target.yaw);
    // Horizontal normal to their heading: the line the bot comes in along.
    const nx = hy;
    const ny = -hx;

    // Where their ribbon will be when the bot gets there: a little ahead of
    // them now, which is a little behind them by arrival.
    const AIM_AHEAD = 12;
    const RUN_UP = 45;
    const ix = target.x + hx * AIM_AHEAD;
    const iy = target.y + hy * AIM_AHEAD;

    clipper.send("spawn", {
      x: ix + nx * RUN_UP,
      y: iy + ny * RUN_UP,
      z: target.z,
      yaw: Math.atan2(-ny, -nx),
      pitch: 0,
      speed: 44,
      trailLength: 40,
    });

    console.log(
      `attempt ${attempt}: intercepting P${target.seat + 1}'s ribbon` +
        ` (${target.trail.length} points)`,
    );

    let seq = attempt * 1000;
    let landed = false;
    for (let f = 0; f < 120 && !landed; f += 3) {
      seq += 3;
      clipper.send("input", {
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
      const now = stage.state.players.get(targetId) as { clipsTaken: number };
      if (now && now.clipsTaken > 0) landed = true;
    }

    const after = stage.state.players.get(targetId) as {
      clipsTaken: number;
      trailLength: number;
      immuneMs: number;
    };
    const shards = (stage.state.shards as unknown as { length: number }).length;

    if (landed) {
      console.log(
        `CUT — P${target.seat + 1} is on ${after.trailLength.toFixed(0)},` +
          ` shielded for ${after.immuneMs}ms, ${shards} shards in the sky`,
      );
      // Left there so the wreckage can be looked at.
      await sleep(5000);
      return;
    }

    console.log(`  missed (trail now ${after.trailLength.toFixed(0)})`);
  }

  console.log("could not land a cut — the target may be turning");
}

main().catch((err) => {
  console.log("FAILED", err?.message ?? err);
  process.exit(1);
});
