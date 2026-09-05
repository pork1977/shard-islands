import { Client, type Room } from "colyseus.js";
import { SERVER_TICK_RATE_HZ } from "@shard-islands/shared";
import { playerState } from "./playerState";
import { drainOutbox, type SelfSnapshot } from "./prediction";

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
  seat: number;
}

/** A line on the scoreboard. */
export interface RosterEntry {
  id: string;
  seat: number;
  colour: number;
  trailLength: number;
  self: boolean;
  /** Longest trail in the room wears the crown. */
  alpha: boolean;
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
 * Tells the server where the descent put us, and that we are now flying.
 *
 * The server simulates from here on, so it needs a starting state — and the
 * client is the only thing that knows one, because the descent is scripted
 * locally rather than simulated on the server.
 */
export function sendSpawn() {
  const room = connection.room;
  if (!room) return;

  room.send("spawn", {
    x: playerState.position[0],
    y: playerState.position[1],
    z: playerState.position[2],
    yaw: playerState.yaw,
    pitch: playerState.pitch,
    speed: playerState.speed,
    trailLength: playerState.trailLength,
  });
}

/**
 * Sends the stick, not the position.
 *
 * Every frame's input is batched and flushed at the server's own tick rate,
 * so a 144Hz client and a 30Hz one put the same number of packets on the
 * wire while both still get their exact per-frame inputs simulated. The
 * server replays them in order, which is what lets its answer match the
 * client's prediction rather than merely approximate it.
 */
export function flushInputs(nowMs: number) {
  const room = connection.room;
  if (!room) return;
  if (nowMs - lastSentAt < SEND_INTERVAL_MS) return;
  lastSentAt = nowMs;

  const samples = drainOutbox();
  if (samples.length === 0) return;
  room.send("input", { samples });
}

/**
 * The server's version of us, or null if there is not one yet.
 *
 * Read off the synced state rather than through a change callback, for the
 * same reason the remote players are: the map is already kept current, the
 * caller already runs every frame, and a mirrored copy is another thing to
 * fall out of step.
 */
export function readSelfSnapshot(): SelfSnapshot | null {
  const room = connection.room;
  if (!room?.state?.players || !connection.selfId) return null;

  const self = room.state.players.get(connection.selfId) as
    | (SelfSnapshot & { simulated: boolean })
    | undefined;
  if (!self || !self.simulated) return null;

  return self;
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

  room.send("descent", {
    x,
    y,
    z,
    yaw,
    // steeply nose-down: what a craft in a dive looks like from outside
    pitch: -1.15,
  });
}

/**
 * How far in the past remote players are drawn.
 *
 * The server ticks at 20Hz, so snapshots land 50ms apart and a client
 * rendering the newest one has nothing to interpolate toward — remote craft
 * step three times a second. Holding everyone slightly in the past means
 * there is nearly always a later snapshot to move toward, and the motion
 * becomes continuous. The cost is seeing other players a tenth of a second
 * behind where they are; that is the standard trade, and it is the server,
 * not this view, that will judge tail-clips.
 */
const INTERPOLATION_DELAY_MS = 100;

/** Samples older than this are of no further use to anyone. */
const SAMPLE_HISTORY_MS = 600;

interface TimedSample {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
}

interface RemoteBuffer {
  colour: number;
  seat: number;
  samples: TimedSample[];
}

const remoteBuffers = new Map<string, RemoteBuffer>();

/** Shortest way round, so a craft crossing north does not spin the long way. */
function lerpAngle(a: number, b: number, t: number): number {
  let delta = b - a;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}

/**
 * Records a sample for anyone whose state actually changed.
 *
 * Timed on arrival rather than by the server's tick number, because what
 * matters for smoothing is when this client learned of it — clock skew
 * between machines is exactly the thing not to build interpolation on.
 */
function sampleRemotes(nowMs: number) {
  const room = connection.room;
  if (!room?.state?.players) {
    remoteBuffers.clear();
    return;
  }

  const seen = new Set<string>();

  room.state.players.forEach((player: RemoteSnapshot, id: string) => {
    if (id === connection.selfId) return;
    // Joined but never reported. Their schema entry is still all zeroes, and
    // the origin is open sky — drawing them there is worse than not yet
    // drawing them at all.
    if (player.x === 0 && player.y === 0 && player.z === 0) return;

    seen.add(id);
    let buffer = remoteBuffers.get(id);
    if (!buffer) {
      buffer = { colour: player.colour, seat: player.seat, samples: [] };
      remoteBuffers.set(id, buffer);
    }
    buffer.colour = player.colour;
    buffer.seat = player.seat;

    const last = buffer.samples[buffer.samples.length - 1];
    if (
      last &&
      last.x === player.x &&
      last.y === player.y &&
      last.z === player.z &&
      last.yaw === player.yaw
    ) {
      return; // nothing new has landed since the last frame
    }

    buffer.samples.push({
      t: nowMs,
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw,
      pitch: player.pitch,
      roll: player.roll,
    });

    while (
      buffer.samples.length > 2 &&
      nowMs - buffer.samples[0].t > SAMPLE_HISTORY_MS
    ) {
      buffer.samples.shift();
    }
  });

  for (const id of Array.from(remoteBuffers.keys())) {
    if (!seen.has(id)) remoteBuffers.delete(id);
  }
}

/**
 * Everyone else, as they were a tenth of a second ago.
 *
 * Read from the buffered snapshots rather than straight off the synced
 * state: the state is a staircase at the tick rate, and this is the ramp
 * between its steps.
 */
export function readRemotePlayers(
  nowMs: number,
  into: RemoteSnapshot[],
): RemoteSnapshot[] {
  sampleRemotes(nowMs);
  into.length = 0;

  const renderAt = nowMs - INTERPOLATION_DELAY_MS;

  remoteBuffers.forEach((buffer, id) => {
    const samples = buffer.samples;
    if (samples.length === 0) return;

    // Find the pair bracketing the render time, walking backwards because
    // it is nearly always the last pair.
    let older = samples[0];
    let newer = samples[samples.length - 1];
    let bracketed = false;

    for (let i = samples.length - 1; i > 0; i--) {
      if (samples[i - 1].t <= renderAt && samples[i].t >= renderAt) {
        older = samples[i - 1];
        newer = samples[i];
        bracketed = true;
        break;
      }
    }

    if (!bracketed) {
      // Either the buffer has not filled yet, or nothing has arrived for
      // longer than the delay. Hold the freshest known state rather than
      // extrapolating a guess that would have to be taken back.
      const held =
        renderAt < samples[0].t ? samples[0] : samples[samples.length - 1];
      into.push({
        id,
        x: held.x,
        y: held.y,
        z: held.z,
        yaw: held.yaw,
        pitch: held.pitch,
        roll: held.roll,
        colour: buffer.colour,
        seat: buffer.seat,
      });
      return;
    }

    const span = newer.t - older.t;
    const t = span > 0 ? (renderAt - older.t) / span : 1;

    into.push({
      id,
      x: older.x + (newer.x - older.x) * t,
      y: older.y + (newer.y - older.y) * t,
      z: older.z + (newer.z - older.z) * t,
      yaw: lerpAngle(older.yaw, newer.yaw, t),
      pitch: lerpAngle(older.pitch, newer.pitch, t),
      roll: lerpAngle(older.roll, newer.roll, t),
      colour: buffer.colour,
      seat: buffer.seat,
    });
  });

  return into;
}

/**
 * Everyone in the room, longest trail first.
 *
 * The crown goes to the top of that list, decided here rather than by the
 * server: it is a pure function of state every client already has, and one
 * more synced field is one more thing that can disagree with the number
 * printed next to it.
 */
export function readRoster(into: RosterEntry[]): RosterEntry[] {
  into.length = 0;

  const room = connection.room;
  if (!room?.state?.players) return into;

  room.state.players.forEach(
    (
      player: { seat: number; colour: number; trailLength: number },
      id: string,
    ) => {
      into.push({
        id,
        seat: player.seat,
        colour: player.colour,
        trailLength: Math.round(player.trailLength),
        self: id === connection.selfId,
        alpha: false,
      });
    },
  );

  // Ties broken by seat, so the crown does not flicker between two players
  // sitting on the same score.
  into.sort((a, b) => b.trailLength - a.trailLength || a.seat - b.seat);
  if (into.length > 0) into[0].alpha = true;

  return into;
}

/** How many gliders are in the sky, including this one. */
export function playerCount(): number {
  const room = connection.room;
  if (!room?.state?.players) return 1;
  return room.state.players.size;
}
