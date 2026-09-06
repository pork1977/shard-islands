import { createServer } from "http";
// Imported from @colyseus/core rather than the "colyseus" meta-package.
// That package declares its engine as peer dependencies and nothing else, and
// pnpm kept satisfying those peers with a stale 0.18 core left in the store —
// which loaded a 0.18 runtime against a 0.16 schema and refused to boot.
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ShardIslandsRoom } from "./rooms/ShardIslandsRoom.js";

const port = Number(process.env.PORT ?? 2567);
const startedAt = Date.now();

/**
 * Which sites are allowed to open a socket to this server.
 *
 * An allowlist, not CORS. Browsers do not send a preflight for a WebSocket
 * handshake — there is nothing for CORS to police — but they DO send an
 * Origin header on it, and they will not let a page forge one. Checking it
 * here is what stops somebody else's site pointing their traffic at this
 * server and running their game on your bill.
 *
 * Unset means allow everything, which is what local development wants and
 * what production must never be left as. The deploy sets it.
 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

function originAllowed(origin: string | undefined): boolean {
  if (allowedOrigins.length === 0) return true;
  if (!origin) {
    // No Origin header at all: not a browser. A native or scripted client,
    // which includes every test client in this repo.
    //
    // Allowed deliberately, because refusing it would buy nothing. Anybody
    // writing their own client sets whatever headers they like, so an
    // allowlist has never been able to stop them; what it stops is a PAGE
    // in somebody else's browser, and a page always sends an Origin.
    return true;
  }
  const normalised = origin.replace(/\/$/, "");
  return allowedOrigins.some(
    (allowed) =>
      normalised === allowed ||
      // One wildcard form, for Vercel preview deployments: "*.vercel.app".
      // Only ever pointed at a staging server — a production server that
      // trusts every preview URL trusts every fork of the repo.
      (allowed.startsWith("*.") && normalised.endsWith(allowed.slice(1))),
  );
}

const httpServer = createServer((req, res) => {
  // A plain health endpoint, so a host can tell the process is alive.
  // Anything else is deliberately left alone: Colyseus attaches its own
  // request listener to this same server for matchmaking, and a catch-all
  // 404 here answers those requests first and makes the room unjoinable.
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        rooms: matchMaker.stats.local.roomCount,
        players: matchMaker.stats.local.ccu,
        originsLocked: allowedOrigins.length > 0,
      }),
    );
  }
});

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
    verifyClient: (info, next) => {
      if (originAllowed(info.origin)) return next(true);
      console.warn(`[server] refused origin ${info.origin}`);
      next(false, 403, "origin not allowed");
    },
  }),
});

gameServer.define("shard_islands", ShardIslandsRoom);

// 0.0.0.0 explicitly: a container that binds only to localhost is
// unreachable from outside itself, and the symptom is a health check that
// fails for no visible reason.
gameServer.listen(port, "0.0.0.0").then(() => {
  console.log(
    `[server] listening on :${port}` +
      (allowedOrigins.length > 0
        ? ` — origins ${allowedOrigins.join(", ")}`
        : " — ALL ORIGINS ALLOWED (set ALLOWED_ORIGINS in production)"),
  );
});

/**
 * Let players finish being disconnected before the process goes.
 *
 * A host replacing this machine sends SIGTERM and then waits a few seconds
 * before killing it. Without this the socket simply dies mid-tick and every
 * player sees a frozen sky until their client gives up; with it they are
 * told, and the client's own reconnect path can do its job.
 */
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    console.log(`[server] ${signal} — shutting down`);
    gameServer
      .gracefullyShutdown(false)
      .catch((err) => console.error("[server] shutdown failed", err))
      .finally(() => process.exit(0));
  });
}
