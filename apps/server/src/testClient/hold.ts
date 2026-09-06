import { join } from "./lobby.js";

/**
 * Occupy seats and stay there, until killed.
 *
 * Everything else in here measures something and leaves. Testing what a
 * player SEES when the server is full needs the opposite: a server that is
 * still full several minutes later, while a browser is driven by hand
 * against it.
 *
 *   PORT=2602 MAX_CONCURRENT=1 pnpm --filter server dev
 *   GAME_SERVER_URL=ws://localhost:2602 pnpm --filter server exec \
 *     tsx src/testClient/hold.ts --count=1
 */

const arg = (name: string, fallback: number) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? Number(found.split("=")[1]) : fallback;
};

const COUNT = arg("count", 1);

async function main() {
  const held = [];
  for (let i = 0; i < COUNT; i++) held.push(await join());
  console.log(`holding ${held.length} seat(s) — ctrl-c to release`);

  // Nothing to do but exist. The rooms only drop a client that goes quiet
  // for a long time, and these are quiet by design.
  await new Promise(() => {});
}

main().catch((err) => {
  console.log("FAILED", err?.message ?? err);
  process.exit(1);
});
