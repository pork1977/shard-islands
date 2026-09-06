import { FLIGHT_ALTITUDE, SPAWN } from "@shard-islands/shared";
import { join, leaveAll } from "./lobby.js";

/**
 * That a landing cannot be replayed, and cannot invent a score.
 *
 * The landing message is trusted by design — the server does not simulate
 * the descent, so only the client knows where the fall ended. What it must
 * not do is trust the same client twice, or trust any number it is handed:
 * the message also carries the trail length, which is the score, and the
 * handler had no guard where the descent handler has always had one.
 *
 * Both halves are tested from a client that behaves badly on purpose,
 * because "the guard is there" is a claim about the source and "the cheat
 * does not work" is a claim about the server.
 *
 *   pnpm --filter server exec tsx src/testClient/spawnGuardCheck.ts
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const landing = (trailLength: number, x = 0, y = 0) => ({
  x,
  y,
  z: FLIGHT_ALTITUDE,
  yaw: 0,
  pitch: 0,
  speed: 24,
  trailLength,
});

const scoreOf = (room: { state: { players: { get(id: string): unknown } } }, id: string) =>
  (room.state.players.get(id) as { trailLength: number } | undefined)?.trailLength ?? -1;

const posOf = (room: { state: { players: { get(id: string): unknown } } }, id: string) => {
  const p = room.state.players.get(id) as { x: number; y: number } | undefined;
  return { x: p?.x ?? NaN, y: p?.y ?? NaN };
};

async function main() {
  // --- a client that lands once, honestly, then tries to land again ------
  const cheat = await join();
  cheat.send("spawn", landing(30));
  await sleep(700);

  const honestScore = scoreOf(cheat, cheat.sessionId);
  const honestPos = posOf(cheat, cheat.sessionId);

  // Re-land: somewhere else entirely, holding the maximum trail.
  cheat.send("spawn", landing(350, 9000, 9000));
  await sleep(700);

  const afterReplay = scoreOf(cheat, cheat.sessionId);
  const replayPos = posOf(cheat, cheat.sessionId);

  // --- a fresh client whose FIRST landing claims an absurd score ---------
  const liar = await join();
  liar.send("spawn", landing(9999));
  await sleep(700);
  const liarScore = scoreOf(liar, liar.sessionId);

  await leaveAll([cheat, liar]);

  console.log(`honest landing            ${honestScore}`);
  console.log(`after replaying it        ${afterReplay}`);
  console.log(`after teleport to 9000     ${replayPos.x.toFixed(1)}, ${replayPos.y.toFixed(1)}`);
  console.log(`first landing claiming 9999  ${liarScore} (cap ${SPAWN.maxTrailLength})`);

  const checks: [string, boolean, string][] = [
    ["an honest landing is accepted", honestScore === 30, `${honestScore}`],
    [
      "a replayed landing changes nothing",
      afterReplay === honestScore,
      `${honestScore} → ${afterReplay}`,
    ],
    [
      // NOT "the position is unchanged": a craft that has landed is being
      // simulated, so it flies forward on its own at ~24 m/s and has moved
      // tens of metres by the time this is read. What must be true is that
      // it is nowhere near the 9000 the replay asked for.
      "a replayed landing cannot teleport",
      Math.abs(replayPos.x) < 1000 && Math.abs(replayPos.y) < 1000,
      `asked for 9000, is at ${replayPos.x.toFixed(1)}, ${replayPos.y.toFixed(1)}`,
    ],
    [
      "an invented score is clamped",
      liarScore <= SPAWN.maxTrailLength && liarScore >= 0,
      `${liarScore}`,
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
