import { createServer } from "http";
// Imported from @colyseus/core rather than the "colyseus" meta-package.
// That package declares its engine as peer dependencies and nothing else, and
// pnpm kept satisfying those peers with a stale 0.18 core left in the store —
// which loaded a 0.18 runtime against a 0.16 schema and refused to boot.
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ShardIslandsRoom } from "./rooms/ShardIslandsRoom.js";

const port = Number(process.env.PORT ?? 2567);

const httpServer = createServer((req, res) => {
  // A plain health endpoint, so a host can tell the process is alive.
  // Anything else is deliberately left alone: Colyseus attaches its own
  // request listener to this same server for matchmaking, and a catch-all
  // 404 here answers those requests first and makes the room unjoinable.
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  }
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("shard_islands", ShardIslandsRoom);

gameServer.listen(port).then(() => {
  console.log(`[server] listening on ws://localhost:${port}`);
});
