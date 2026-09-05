import { Room, type Client } from "@colyseus/core";
import { ROOM, SERVER_TICK_RATE_HZ, TRAIL } from "@shard-islands/shared";
import { PlayerState, RoomState, TrailPoint } from "../schema/RoomState.js";

interface MoveMessage {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  boosting: boolean;
}

/**
 * The shared sky.
 *
 * This first pass is intentionally NOT authoritative: clients report where
 * they are and the room relays it. That is fine while the only thing at
 * stake is seeing each other, and it keeps the flight model — which already
 * feels right locally — untouched. Authority has to arrive before tail-clip
 * does, because a clip that each client resolves differently is worse than
 * no clip at all; that is a later phase, and the schema is already shaped
 * for it.
 */
export class ShardIslandsRoom extends Room<RoomState> {
  maxClients = ROOM.maxPlayers;

  private latest = new Map<string, MoveMessage>();
  private nextColour = 0;

  onCreate() {
    this.setState(new RoomState());

    this.onMessage("move", (client, data: MoveMessage) => {
      this.latest.set(client.sessionId, data);
    });

    // Fixed tick, independent of how fast any client reports. Applying
    // messages the moment they arrive would let a 144fps client update far
    // more often than a 30fps one and make the wire load unpredictable.
    this.setSimulationInterval(
      () => this.tick(),
      1000 / SERVER_TICK_RATE_HZ,
    );

    console.log("[room] created");
  }

  onJoin(client: Client) {
    const player = new PlayerState();
    player.id = client.sessionId;
    player.colour = this.nextColour++ % 8;
    this.state.players.set(client.sessionId, player);
    console.log(`[room] join ${client.sessionId} (${this.state.players.size} in room)`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.latest.delete(client.sessionId);
    console.log(`[room] leave ${client.sessionId} (${this.state.players.size} left)`);
  }

  private tick() {
    this.state.tick++;

    this.state.players.forEach((player, id) => {
      const msg = this.latest.get(id);
      if (!msg) return;

      player.x = msg.x;
      player.y = msg.y;
      player.z = msg.z;
      player.yaw = msg.yaw;
      player.pitch = msg.pitch;
      player.roll = msg.roll;
      player.speed = msg.speed;
      player.boosting = msg.boosting;

      // Trail is appended by arc length here too, not per tick, so its
      // resolution does not change with tick rate or with how often the
      // client happens to report.
      const last = player.trail[player.trail.length - 1];
      const spacing = TRAIL.pointSpacingMeters * 2.2;
      if (
        !last ||
        (player.x - last.x) ** 2 +
          (player.y - last.y) ** 2 +
          (player.z - last.z) ** 2 >
          spacing * spacing
      ) {
        const point = new TrailPoint();
        point.x = player.x;
        point.y = player.y;
        point.z = player.z;
        player.trail.push(point);

        const max = Math.round(player.trailLength);
        while (player.trail.length > max) player.trail.shift();
      }
    });
  }
}
