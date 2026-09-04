import { createServer } from "http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ShardIslandsRoom } from "./rooms/ShardIslandsRoom.js";

const port = Number(process.env.PORT ?? 2567);

const httpServer = createServer((req, res) => {
  // a plain health endpoint, so a host can tell the process is alive
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("shard_islands", ShardIslandsRoom);

gameServer.listen(port).then(() => {
  console.log(`[server] listening on ws://localhost:${port}`);
});
