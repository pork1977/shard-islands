import { spawn } from "child_process";
import { request } from "http";
import { randomBytes } from "crypto";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

/**
 * Does the origin allowlist actually refuse anybody?
 *
 * This is the only security control in the project, and the failure mode is
 * silent in both directions: an allowlist that refuses everything takes the
 * game down, and one that refuses nothing looks perfect right up until
 * somebody else's site is running their traffic through your server.
 *
 * It starts the REAL production bundle on a spare port with the real
 * environment variable set, because that is the thing being shipped —
 * testing the source under tsx would be testing something else.
 *
 *   pnpm --filter server exec tsx src/testClient/originCheck.ts
 *
 * Run `pnpm --filter server build` first; it checks dist, not src.
 *
 * A raw handshake is the right level for this, and driving a real
 * colyseus.js client was tried and abandoned. Under Node that client's
 * socket reaches verifyClient with no Origin at all, however the header is
 * injected, so the test reported a wide-open server that a browser is in
 * fact refused by — a false alarm, which is worse than no alarm. The header
 * is what the check reads and the handshake is where it reads it; a browser
 * always sends one and cannot forge it.
 *
 * The deployed server is verified from an actual browser instead. From a
 * page on any origin not in the allowlist:
 *
 *   new WebSocket("wss://shard-islands.fly.dev/")   // must fail
 *
 * with a page on an unlocked server as the control, so a refusal cannot be
 * mistaken for a bad URL.
 */

const PORT = 2591;

const ALLOWED = "https://shard-islands.example";
const bundle = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist/index.cjs");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Attempts a WebSocket upgrade and reports the status code that came back. */
function handshake(origin?: string): Promise<number> {
  return new Promise((done, fail) => {
    const req = request(
      {
        host: "127.0.0.1",
        port: PORT,
        path: "/matchmake/joinOrCreate/shard_islands",
        headers: {
          Connection: "Upgrade",
          Upgrade: "websocket",
          "Sec-WebSocket-Version": "13",
          "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
          ...(origin ? { Origin: origin } : {}),
        },
      },
      (res) => {
        res.destroy();
        done(res.statusCode ?? 0);
      },
    );
    // A successful upgrade never becomes a normal response, so it arrives
    // here instead.
    req.on("upgrade", (res, socket) => {
      socket.destroy();
      done(res.statusCode ?? 101);
    });
    req.on("error", fail);
    req.end();
  });
}

async function main() {
  const server = spawn(process.execPath, [bundle], {
    env: { ...process.env, PORT: String(PORT), ALLOWED_ORIGINS: `${ALLOWED}, *.preview.example` },
    stdio: "ignore",
  });

  try {
    // Wait for it to answer rather than guessing at a sleep.
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      await sleep(150);
      up = await new Promise<boolean>((done) => {
        const probe = request(
          { host: "127.0.0.1", port: PORT, path: "/health" },
          (res) => {
            res.resume();
            done(res.statusCode === 200);
          },
        );
        probe.on("error", () => done(false));
        probe.end();
      });
    }
    if (!up) throw new Error("the bundle never came up — has it been built?");

    const exact = await handshake(ALLOWED);
    const trailingSlash = await handshake(`${ALLOWED}/`);
    const wildcard = await handshake("https://feature-branch.preview.example");
    const hostile = await handshake("https://evil.example");
    const lookalike = await handshake(`${ALLOWED}.evil.example`);
    const native = await handshake(undefined);

    console.log(`allowed origin        ${exact}`);
    console.log(`allowed, with slash   ${trailingSlash}`);
    console.log(`wildcard subdomain    ${wildcard}`);
    console.log(`hostile origin        ${hostile}`);
    console.log(`lookalike suffix      ${lookalike}`);
    console.log(`no origin at all      ${native}`);
    console.log("");

    const checks: [string, boolean, string][] = [
      ["the real site gets in", exact === 101, `${exact}`],
      ["a trailing slash is not a different site", trailingSlash === 101, `${trailingSlash}`],
      ["a wildcard entry admits its subdomains", wildcard === 101, `${wildcard}`],
      ["another site is refused", hostile === 403, `${hostile}`],
      // "https://shard-islands.example.evil.example" ends with the allowed
      // string if you compare carelessly. It must not get in.
      ["a lookalike domain is refused", lookalike === 403, `${lookalike}`],
      ["a non-browser client still connects", native === 101, `${native}`],
    ];

    for (const [name, ok, detail] of checks) {
      console.log(`${ok ? "  ok  " : " FAIL "} ${name.padEnd(42)} ${detail}`);
    }

    const allOk = checks.every(([, ok]) => ok);
    console.log(allOk ? "\nRESULT: OK" : "\nRESULT: FAILED");
    process.exitCode = allOk ? 0 : 1;
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.log("RESULT: FAILED", err?.message ?? err);
  process.exit(1);
});
