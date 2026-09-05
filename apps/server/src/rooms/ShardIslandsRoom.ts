import { Room, type Client } from "@colyseus/core";
import {
  ROOM,
  SERVER_TICK_RATE_HZ,
  TRAIL,
  CORE_PICKUP_RADIUS,
  CORE_RESPAWN_MS,
  CORE_TRAIL_VALUE,
  DRAFT,
  INTERACTION_RADII,
  coreSites,
  createFlightSim,
  stepFlight,
  type FlightSim,
} from "@shard-islands/shared";
import { PlayerState, RoomState, TrailPoint } from "../schema/RoomState.js";

/** One frame of stick from a client, with the slice of time it applied to. */
interface InputSample {
  /** Monotonic per client. Echoed back so the client knows what to replay. */
  seq: number;
  turn: number;
  pitch: number;
  boosting: boolean;
  hover: boolean;
  dt: number;
}

interface InputMessage {
  samples: InputSample[];
}

/** Where a player begins flying, handed over at the end of their descent. */
interface SpawnMessage {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  speed: number;
  trailLength: number;
}

/** A position report from a player who is still falling. */
interface DescentMessage {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** Per-player state the room keeps but does not sync. */
interface Runtime {
  sim: FlightSim;
  pending: InputSample[];
  lastSeq: number;
  simulating: boolean;
  /** When input last arrived, so a real silence can be told from jitter. */
  lastInputAt: number;
}

/**
 * The same clamp the client applies to its own frame delta. A stalled tab
 * must not teleport anybody, and a doctored client must not be able to buy
 * extra distance by claiming a huge frame.
 */
const MAX_SAMPLE_DT = 1 / 20;
/**
 * Ceiling on how much simulation one tick will do for one player. At 20Hz a
 * well-behaved client sends about three samples per tick; this leaves room
 * to catch up after a hiccup without letting a flood of samples buy speed.
 */
const MAX_SAMPLES_PER_TICK = 12;
/**
 * How long a client must be silent before the room flies their craft for
 * them. Comfortably longer than the gap between flushes, so ordinary jitter
 * never triggers it, and short enough that a dropped connection does not
 * leave a craft hanging in the air.
 */
const SILENCE_BEFORE_COAST_MS = 250;

/** Ribbon length has to stay bounded, for the wire and for the renderer. */
const MAX_TRAIL_LENGTH = 350;

/**
 * The shared sky.
 *
 * Authoritative as of phase 9: clients send the stick, not their position,
 * and this room runs the flight model — the very same `stepFlight` the
 * client predicts with, out of the shared package, against the very same
 * height field. Two implementations of "the same" model always drift, and
 * every drift becomes a correction the player feels.
 *
 * The exception is a player who is still falling. The descent is not the
 * flight model, it is a scripted plunge, so those positions are taken as
 * reported. Nothing is contested there — by the time anything is, because
 * tail-clip has arrived, the descent is long over.
 */
export class ShardIslandsRoom extends Room<RoomState> {
  maxClients = ROOM.maxPlayers;

  private runtime = new Map<string, Runtime>();

  /** When each collected core comes back, by index. 0 means it is out there. */
  private coreReturnsAt: number[] = [];

  onCreate() {
    this.setState(new RoomState());

    // One flag per core, all present to begin with. Positions are never
    // sent: both sides build the identical layout from the shared seed.
    const sites = coreSites();
    this.coreReturnsAt = new Array(sites.length).fill(0);
    for (let i = 0; i < sites.length; i++) this.state.coresTaken.push(false);

    this.onMessage("descent", (client, data: DescentMessage) => {
      const player = this.state.players.get(client.sessionId);
      const rt = this.runtime.get(client.sessionId);
      if (!player || !rt || rt.simulating) return;

      player.x = data.x;
      player.y = data.y;
      player.z = data.z;
      player.yaw = data.yaw;
      player.pitch = data.pitch;
    });

    this.onMessage("spawn", (client, data: SpawnMessage) => {
      const player = this.state.players.get(client.sessionId);
      const rt = this.runtime.get(client.sessionId);
      if (!player || !rt) return;

      // Taken on trust. The client alone knows where its descent ended, and
      // the descent is the one part of a session the server does not
      // simulate; nothing is contested until the player is flying.
      rt.sim = createFlightSim(data.x, data.y, data.z, data.yaw);
      rt.sim.pitch = data.pitch;
      rt.sim.speed = data.speed;
      rt.sim.draft = 1;
      rt.simulating = true;
      rt.pending.length = 0;
      rt.lastInputAt = Date.now();

      player.simulated = true;
      player.trailLength = data.trailLength;
      this.publish(player, rt);
    });

    this.onMessage("input", (client, data: InputMessage) => {
      const rt = this.runtime.get(client.sessionId);
      if (!rt || !Array.isArray(data?.samples)) return;

      for (const sample of data.samples) {
        // Anything already accounted for is a duplicate from a resend.
        if (sample.seq <= rt.lastSeq) continue;
        rt.pending.push({
          seq: sample.seq,
          turn: clamp(sample.turn, -1, 1),
          pitch: clamp(sample.pitch, -1, 1),
          boosting: !!sample.boosting,
          hover: !!sample.hover,
          dt: clamp(sample.dt, 0, MAX_SAMPLE_DT),
        });
      }

      // Ordered, because the wire does not promise it and replaying two
      // samples the wrong way round gives a different answer than the one
      // the client already drew.
      rt.pending.sort((a, b) => a.seq - b.seq);
      rt.lastInputAt = Date.now();
    });

    this.setSimulationInterval(() => this.tick(), 1000 / SERVER_TICK_RATE_HZ);

    console.log("[room] created");
  }

  /** The lowest seat nobody is sitting in. */
  private freeSeat(): number {
    const taken = new Set<number>();
    this.state.players.forEach((p) => taken.add(p.seat));
    for (let seat = 0; seat < ROOM.maxPlayers; seat++) {
      if (!taken.has(seat)) return seat;
    }
    return 0;
  }

  onJoin(client: Client) {
    const player = new PlayerState();
    player.id = client.sessionId;
    player.seat = this.freeSeat();
    player.colour = player.seat % 8;
    this.state.players.set(client.sessionId, player);

    this.runtime.set(client.sessionId, {
      sim: createFlightSim(),
      pending: [],
      lastSeq: 0,
      simulating: false,
      lastInputAt: Date.now(),
    });

    console.log(`[room] join ${client.sessionId} (${this.state.players.size} in room)`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.runtime.delete(client.sessionId);
    console.log(`[room] leave ${client.sessionId} (${this.state.players.size} left)`);
  }

  private tick() {
    this.state.tick++;
    const now = Date.now();

    // Resolved for the whole room BEFORE anybody is stepped, so drafting is
    // decided against one consistent picture of where everyone was. Doing it
    // inside the per-player loop would let the players simulated first be
    // judged against last tick's trails and the rest against this tick's.
    this.resolveDrafting();

    this.state.players.forEach((player, id) => {
      const rt = this.runtime.get(id);
      if (!rt || !rt.simulating) return;

      let applied = 0;
      while (rt.pending.length > 0 && applied < MAX_SAMPLES_PER_TICK) {
        const sample = rt.pending.shift()!;
        stepFlight(rt.sim, sample, sample.dt);
        rt.lastSeq = sample.seq;
        applied++;
      }

      // Coasting is for a client that has actually gone quiet, NOT for a
      // tick that happened to land between two flushes.
      //
      // Clients flush at the tick rate, so with any jitter at all some ticks
      // legitimately carry no samples. Advancing the craft on those ticks
      // invents motion the client never simulated and cannot replay, and it
      // showed up immediately as twelve metres of prediction error. Left
      // alone, the sim simply waits for the input that is already on its
      // way, and the client's own replay lands exactly on it.
      if (applied === 0 && now - rt.lastInputAt > SILENCE_BEFORE_COAST_MS) {
        stepFlight(
          rt.sim,
          {
            turn: rt.sim.smoothTurn,
            pitch: rt.sim.smoothPitch,
            boosting: rt.sim.boosting,
            hover: false,
          },
          1 / SERVER_TICK_RATE_HZ,
        );
      }

      this.collectCores(player, rt);
      this.publish(player, rt);
      this.appendTrail(player);
    });

    this.respawnCores(now);
  }

  private publish(player: PlayerState, rt: Runtime) {
    player.x = rt.sim.x;
    player.y = rt.sim.y;
    player.z = rt.sim.z;
    player.yaw = rt.sim.yaw;
    player.pitch = rt.sim.pitch;
    player.roll = rt.sim.roll;
    player.speed = rt.sim.speed;
    player.boosting = rt.sim.boosting;
    player.smoothTurn = rt.sim.smoothTurn;
    player.smoothPitch = rt.sim.smoothPitch;
    player.draft = rt.sim.draft;
    player.lastSeq = rt.lastSeq;
  }

  /**
   * Who is sitting in whose slipstream.
   *
   * A draft counts when a player is close to another player's recent trail
   * AND travelling along it — crossing somebody's wake at right angles is
   * not drafting, and without the heading test it would be the easiest way
   * in the game to get a free boost. The trail is the authoritative one the
   * room appends, so this is judged against the same geometry every client
   * can see.
   *
   * Own colour is worth far more than a stranger's. That is the team pull:
   * anybody's wake will do, but you go looking for your own kind.
   */
  private resolveDrafting() {
    const lateral = INTERACTION_RADII.draftLateral;
    const lateralSq = lateral * lateral;

    this.state.players.forEach((player, id) => {
      const rt = this.runtime.get(id);
      if (!rt || !rt.simulating) {
        player.draft = 1;
        return;
      }

      // Heading of the drafter, for the along-the-wake test.
      const cp = Math.cos(rt.sim.pitch);
      const fx = cp * Math.cos(rt.sim.yaw);
      const fy = cp * Math.sin(rt.sim.yaw);
      const fz = Math.sin(rt.sim.pitch);

      let best = 1;

      this.state.players.forEach((leader, leaderId) => {
        if (leaderId === id) return;
        const trail = leader.trail;
        if (!trail || trail.length < 2) return;

        const multiplier =
          leader.colour === player.colour
            ? DRAFT.alliedMultiplier
            : DRAFT.strangerMultiplier;
        if (multiplier <= best) return; // cannot improve on what we have

        // Only the freshest part of the wake pulls. An hour-old trail
        // draped across the map should not tow anybody.
        const from = Math.max(0, trail.length - DRAFT.hotPoints);
        for (let i = from; i < trail.length - 1; i++) {
          const a = trail[i];
          const b = trail[i + 1];

          const sx = b.x - a.x;
          const sy = b.y - a.y;
          const sz = b.z - a.z;
          const lenSq = sx * sx + sy * sy + sz * sz;
          if (lenSq < 1e-6) continue;

          // closest point on this segment to the drafter
          let t =
            ((rt.sim.x - a.x) * sx + (rt.sim.y - a.y) * sy + (rt.sim.z - a.z) * sz) /
            lenSq;
          t = t < 0 ? 0 : t > 1 ? 1 : t;

          const dx = rt.sim.x - (a.x + sx * t);
          const dy = rt.sim.y - (a.y + sy * t);
          const dz = rt.sim.z - (a.z + sz * t);
          if (dx * dx + dy * dy + dz * dz > lateralSq) continue;

          // and travelling the way the wake runs
          const inv = 1 / Math.sqrt(lenSq);
          const agreement = (fx * sx + fy * sy + fz * sz) * inv;
          if (agreement < DRAFT.minHeadingAgreement) continue;

          best = multiplier;
          break;
        }
      });

      rt.sim.draft = best;
      player.draft = best;
    });
  }

  /**
   * Cores collected this tick.
   *
   * Decided here and nowhere else. Two players reaching the same core within
   * a few milliseconds is exactly what a client-side pickup gets wrong: both
   * would take it, both would score, and each would watch the other fly
   * through a core that was not there. The room resolves it by being the only
   * thing that can — the first player the loop reaches takes it, and the flag
   * is already set by the time the second is tested.
   *
   * A flat scan over every core, which at 240 cores and two dozen players is
   * a few thousand cheap comparisons a tick. The spatial hash the plan calls
   * for arrives with tail-clip, where the same broad phase gets reused
   * against trail segments and actually earns its complexity.
   */
  private collectCores(player: PlayerState, rt: Runtime) {
    const sites = coreSites();
    const radiusSq = CORE_PICKUP_RADIUS * CORE_PICKUP_RADIUS;

    for (let i = 0; i < sites.length; i++) {
      if (this.state.coresTaken[i]) continue;

      // Cheap axis rejections first: nearly every core is nowhere near.
      const site = sites[i];
      const dx = site.x - rt.sim.x;
      if (dx > CORE_PICKUP_RADIUS || dx < -CORE_PICKUP_RADIUS) continue;
      const dy = site.y - rt.sim.y;
      if (dy > CORE_PICKUP_RADIUS || dy < -CORE_PICKUP_RADIUS) continue;
      const dz = site.z - rt.sim.z;
      if (dz > CORE_PICKUP_RADIUS || dz < -CORE_PICKUP_RADIUS) continue;
      if (dx * dx + dy * dy + dz * dz > radiusSq) continue;

      this.state.coresTaken[i] = true;
      this.coreReturnsAt[i] = Date.now() + CORE_RESPAWN_MS;
      player.trailLength = Math.min(
        MAX_TRAIL_LENGTH,
        player.trailLength + CORE_TRAIL_VALUE,
      );
      player.cores += 1;
    }
  }

  /** Cores come back, so an emptied sky refills for whoever arrives next. */
  private respawnCores(now: number) {
    for (let i = 0; i < this.coreReturnsAt.length; i++) {
      const due = this.coreReturnsAt[i];
      if (due === 0 || now < due) continue;
      this.coreReturnsAt[i] = 0;
      this.state.coresTaken[i] = false;
    }
  }

  /**
   * Trail is appended by arc length, not per tick, so its resolution does
   * not change with tick rate or with how often a client happens to report.
   */
  private appendTrail(player: PlayerState) {
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
  }
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}
