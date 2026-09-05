import { Client, type Room } from "colyseus.js";
import { SERVER_TICK_RATE_HZ } from "@shard-islands/shared";
import { playerState } from "./playerState";

/**
 * The room connection, joined the instant the pane is struck.
 *
 * The entire point of this module is that nothing ever waits for it. The
 * premise of the whole experience is that a touch drops you into a world
 * with no loading screen and no lobby, so the join runs alongside the
 * fracture and the fall — seven and a half seconds of cinematic that has to
 * happen anyway — and if it has not landed by the time the player is flying,
 * they simply fly alone until it does. There is no code path anywhere that
 * blocks on, awaits, or gates the sequence behind this.
 *
 * Everything here is deliberately a plain mutable object rather than store
 * state: it is read inside the frame loop, and pushing connection status
 * through React would re-render the scene tree for something no component
 * needs to re-render for.
 */
export type ConnectionStatus = "offline" | "joining" | "joined" | "failed";

export interface RemoteSnapshot {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  colour: number;
}

interface Connection {
  status: ConnectionStatus;
  room: Room | null;
  selfId: string;
  /**
   * How long the join actually took, in milliseconds. Kept because this is
   * the number the phase is about: it has to be able to be enormous without
   * anybody noticing.
   */
  joinMs: number | null;
  attempts: number;
  error: string | null;
}

export const connection: Connection = {
  status: "offline",
  room: null,
  selfId: "",
  joinMs: null,
  attempts: 0,
  error: null,
};

const ENDPOINT = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567";
const ROOM_NAME = "shard_islands";

/**
 * Three tries, spaced so they all fall comfortably inside the descent. A
 * cold server or a dropped packet should not cost the player their session,
 * and there is a seven second window in which to be quietly persistent.
 */
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 700;

let joining = false;

/**
 * Starts joining. Safe to call more than once; only the first call does
 * anything. Returns immediately, always.
 */
export function beginJoin() {
  if (joining || connection.status === "joined") return;
  joining = true;
  connection.status = "joining";
  connection.error = null;
  void tryJoin(0, performance.now());
}

async function tryJoin(attempt: number, startedAt: number) {
  connection.attempts = attempt + 1;

  try {
    const client = new Client(ENDPOINT);
    const room = await client.joinOrCreate(ROOM_NAME);

    connection.room = room;
    connection.selfId = room.sessionId;
    connection.joinMs = Math.round(performance.now() - startedAt);
    connection.status = "joined";

    room.onLeave(() => {
      connection.room = null;
      connection.selfId = "";
      connection.status = "offline";
      joining = false;
    });

    room.onError((code, message) => {
      connection.error = `${code} ${message ?? ""}`.trim();
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (attempt + 1 < MAX_ATTEMPTS) {
      window.setTimeout(
        () => void tryJoin(attempt + 1, startedAt),
        RETRY_DELAY_MS * (attempt + 1),
      );
      return;
    }

    // Out of tries. Nothing is torn down and nothing is reported to the
    // player: a single-player session that never found the server is still
    // a complete session, and a "could not connect" banner over the top of
    // the world would be the one piece of UI this design cannot have.
    connection.status = "failed";
    connection.error = message;
    joining = false;
  }
}

const SEND_INTERVAL_MS = 1000 / SERVER_TICK_RATE_HZ;
let lastSentAt = 0;

/**
 * Reports the local player, rate-limited to the server's own tick.
 *
 * Called every frame from the flight controller and throttled here rather
 * than at the call site, so a 144Hz client and a 30Hz one put the same load
 * on the wire.
 */
export function reportLocalPlayer(nowMs: number) {
  const room = connection.room;
  if (!room) return;
  if (nowMs - lastSentAt < SEND_INTERVAL_MS) return;
  lastSentAt = nowMs;

  room.send("move", {
    x: playerState.position[0],
    y: playerState.position[1],
    z: playerState.position[2],
    yaw: playerState.yaw,
    pitch: playerState.pitch,
    roll: playerState.roll,
    speed: playerState.speed,
    boosting: playerState.boosting,
  });
}

/**
 * Reports a player who is still on the way down.
 *
 * Without this, anyone mid-descent has never sent a position and sits at the
 * room's default — the world origin, which is a kilometre up in empty sky —
 * so every other client renders a glider parked in mid-air until they land.
 * Reporting the fall costs nothing extra on the wire (same rate, same
 * message) and means other players can watch you come down, which is the
 * more interesting answer anyway.
 */
export function reportDescent(
  nowMs: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
) {
  const room = connection.room;
  if (!room) return;
  if (nowMs - lastSentAt < SEND_INTERVAL_MS) return;
  lastSentAt = nowMs;

  room.send("move", {
    x,
    y,
    z,
    yaw,
    // steeply nose-down: what a craft in a dive looks like from outside
    pitch: -1.15,
    roll: 0,
    speed: 0,
    boosting: false,
  });
}

/**
 * Everyone else currently in the room.
 *
 * Read straight off the synced state each frame rather than mirrored into a
 * local copy through change callbacks: the schema map is already kept
 * current by the client library, the renderer already runs every frame, and
 * a second copy is a second thing to get out of step. Interpolation between
 * ticks is phase 9's problem, not this one's.
 */
export function readRemotePlayers(into: RemoteSnapshot[]): RemoteSnapshot[] {
  into.length = 0;

  const room = connection.room;
  if (!room?.state?.players) return into;

  room.state.players.forEach((player: RemoteSnapshot, id: string) => {
    if (id === connection.selfId) return;
    // Joined but never reported. Their schema entry is still all zeroes, and
    // the origin is open sky — drawing them there is worse than not yet
    // drawing them at all.
    if (player.x === 0 && player.y === 0 && player.z === 0) return;
    into.push({
      id,
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw,
      pitch: player.pitch,
      roll: player.roll,
      colour: player.colour,
    });
  });

  return into;
}

/** How many gliders are in the sky, including this one. */
export function playerCount(): number {
  const room = connection.room;
  if (!room?.state?.players) return 1;
  return room.state.players.size;
}
