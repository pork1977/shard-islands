import { Client } from "colyseus.js";
import { SKY_FULL } from "@shard-islands/shared";

/**
 * That the machine turns people away politely, and at the right number.
 *
 * The cap only earns its keep if the refusal is DISTINGUISHABLE. A join that
 * fails with a generic error is retried four times by the client before it
 * gives up, which spends eight seconds arriving at an answer the server
 * already knew — and the player spends them falling through an empty sky
 * wondering what is wrong. So this asserts the code as well as the count.
 *
 * Run against a server started with a small cap, so the test is quick and
 * does not need to open sixty-five sockets:
 *
 *   PORT=2599 MAX_CONCURRENT=3 pnpm --filter server dev
 *   GAME_SERVER_URL=ws://localhost:2599 pnpm --filter server exec \
 *     tsx src/testClient/capacityCheck.ts --cap=3
 */

const ENDPOINT = process.env.GAME_SERVER_URL ?? "ws://localhost:2567";
const arg = (name: string, fallback: number) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? Number(found.split("=")[1]) : fallback;
};

const CAP = arg("cap", 3);
const TRIES = CAP + 3;

async function main() {
  console.log(`endpoint  ${ENDPOINT}`);
  console.log(`cap       ${CAP}, attempting ${TRIES} joins`);
  console.log("");

  const joined: Awaited<ReturnType<Client["joinOrCreate"]>>[] = [];
  const refusals: number[] = [];
  const wrong: string[] = [];

  for (let i = 0; i < TRIES; i++) {
    try {
      joined.push(await new Client(ENDPOINT).joinOrCreate("shard_islands"));
      console.log(`  join ${i + 1}  accepted`);
    } catch (err) {
      const code = (err as { code?: number }).code;
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  join ${i + 1}  refused (code ${code}) ${message}`);
      if (code === SKY_FULL) refusals.push(code);
      else wrong.push(`join ${i + 1} failed with ${code}: ${message}`);
    }
  }

  for (const room of joined) {
    try {
      await room.leave();
    } catch {
      // already gone
    }
  }

  const checks: [string, boolean, string][] = [
    ["accepted exactly the cap", joined.length === CAP, `${joined.length} accepted`],
    ["refused the rest", refusals.length === TRIES - CAP, `${refusals.length} refused`],
    [
      `refusals carry SKY_FULL (${SKY_FULL})`,
      wrong.length === 0,
      wrong.length === 0 ? "all correct" : wrong.join("; "),
    ],
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
