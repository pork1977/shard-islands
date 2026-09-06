import { matchMaker, Room, ServerError, type Client } from "@colyseus/core";
import {
  ROOM,
  ROLL,
  SKY_FULL,
  SERVER_TICK_RATE_HZ,
  TRAIL,
  BEACON,
  beaconSite,
  CLIP,
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
import { ClipShard, PlayerState, RoomState, TrailPoint } from "../schema/RoomState.js";
import {
  buildTrailIndex,
  createTrailIndex,
  findCut,
  type TrailIndex,
} from "./tailClip.js";

/** One frame of stick from a client, with the slice of time it applied to. */
interface InputSample {
  /** Monotonic per client. Echoed back so the client knows what to replay. */
  seq: number;
  turn: number;
  pitch: number;
  boosting: boolean;
  hover: boolean;
  /** -1, 0 or 1: a request to barrel roll. */
  roll: number;
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
  /**
   * Where this tick's movement started, kept so collection and tail-clip can
   * both be tested against the path FLOWN rather than the point landed on.
   */
  fromX: number;
  fromY: number;
  fromZ: number;
  /** Chunked bounds over this player's trail, rebuilt once a tick. */
  trailIndex: TrailIndex;
  /** No cuts until this time, after being cut. */
  immuneUntil: number;
  /**
   * Whether the last stick this player sent was holding station.
   *
   * Kept because coasting has to reproduce what the pilot last asked for.
   * Hover was hard-coded false in the coast, so a player who parked to look
   * around and then switched tabs had their craft quietly flown off by the
   * room and came back somewhere else entirely.
   */
  hovering: boolean;
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

/**
 * How long a client can say nothing before the room decides nobody is
 * flying, and then before it gives the seat back.
 *
 * A tab that is merely in the background still reports, just slowly, so
 * these are far longer than any throttling produces. What they catch is the
 * tab somebody opened, flew for a minute, and abandoned — which otherwise
 * leaves a craft circling the map for as long as the browser stays open.
 *
 * Two stages rather than one, because a player who looks away for thirty
 * seconds should get their own trail back when they return, and only a
 * genuinely gone one should lose the seat.
 */
const AWAY_AFTER_MS = 30_000;
const RELEASE_SEAT_AFTER_MS = 150_000;

/** Ribbon length has to stay bounded, for the wire and for the renderer. */
const MAX_TRAIL_LENGTH = 350;

/** Server-side bookkeeping for one scattered shard. */
interface ShardTiming {
  armedAt: number;
  diesAt: number;
}

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
/**
 * How many craft this machine will carry before it turns people away.
 *
 * Measured, not guessed. Every room ticks on the same Node event loop and
 * Node has one thread, so the cost is machine-wide however the players are
 * distributed. Against production on a performance-1x machine:
 *
 *     24 craft  20.00 Hz      ~64 craft  16.37 Hz
 *     48 craft  18.12 Hz      ~88 craft   9.49 Hz
 *     96 craft   8.83 Hz
 *
 * Gradual to about sixty-four, then a cliff. Sixty-four still holds better
 * than 16Hz, which is the rate this game was developed at for weeks — the
 * room measures its own tick length so the physics is right either way —
 * and below about twelve the interpolation starts to show.
 *
 * Past the cliff nobody wins: the tick is too slow to play on AND clients
 * begin dropping out, so an uncapped machine turns one enthusiastic day
 * into a broken game for everybody rather than a good game for as many as
 * fit.
 *
 * A dedicated core was tried and bought very little — 17.32 to 18.12 Hz at
 * 48 craft, and the knee did not move. That is the evidence that this is
 * the cost of the physics itself rather than of the hardware under it, and
 * the reason the number below is not simply raised by paying Fly more.
 *
 * Override with MAX_CONCURRENT after re-running roomLoadCheck against
 * whatever the machine is at the time.
 */
const CAPACITY = Number(process.env.MAX_CONCURRENT ?? 0) || 64;

export class ShardIslandsRoom extends Room<RoomState> {
  maxClients = ROOM.maxPlayers;

  /**
   * Refuse a join that would cost the people already flying their tick rate.
   *
   * This is deliberately NOT a wall. The client treats a failed join as a
   * solo session and flies on alone — which is the whole reason the landing
   * sequence has no lobby and no spinner — so being turned away here costs
   * a player the other craft in the sky, not the game. Better than the
   * alternative, which is everyone at 6Hz.
   *
   * Counted machine-wide off the matchmaker rather than per room, because
   * the constraint is the event loop, not the room.
   */
  static async onAuth() {
    if (matchMaker.stats.local.ccu >= CAPACITY) {
      throw new ServerError(SKY_FULL, "the sky is full");
    }
    return true;
  }

  private runtime = new Map<string, Runtime>();

  /** When each collected core comes back, by index. 0 means it is out there. */
  private coreReturnsAt: number[] = [];

  /** Arming and expiry for each live shard, keyed by its id. */
  private shardTiming = new Map<number, ShardTiming>();
  private nextShardId = 1;

  /**
   * When the previous tick ran, so this one can be told how long it has
   * actually been.
   *
   * The room asks for fifty milliseconds and does not necessarily get it.
   * Windows rounds a timer up to the next multiple of about fifteen and a
   * half, so a 50ms interval fires every 62.5ms and the room runs at 16Hz
   * rather than 20 — on the development machine, every time, with an empty
   * room. Anything that multiplied by the NOMINAL rate was therefore
   * quietly twenty percent out: an unattended craft coasted slowly, and the
   * Beacon took two minutes to charge instead of one and three quarters.
   *
   * Measuring is both simpler and more honest than trying to fix the timer.
   */
  private lastTickAt = 0;

  /** When the Beacon's current phase ends. */
  private beaconPhaseEndsAt = 0;
  /** When the current overcharge runs out. */
  private overchargeEndsAt = 0;

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
      // A falling player sends these instead of input, and is every bit as
      // present as one who is flying.
      rt.lastInputAt = Date.now();
      if (player.away) player.away = false;
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
      rt.hovering = false;
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
          // Only the sign matters, and the step decides whether it is
          // allowed — a client asking to roll every frame simply gets one
          // roll and then a cooldown, exactly as an honest one would.
          roll: sample.roll ? (sample.roll < 0 ? -1 : 1) : 0,
          dt: clamp(sample.dt, 0, MAX_SAMPLE_DT),
        });
      }

      const player = this.state.players.get(client.sessionId);
      if (player?.away) {
        player.away = false;
        console.log(`[room] P${player.seat + 1} is back`);
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
      fromX: 0,
      fromY: 0,
      fromZ: 0,
      trailIndex: createTrailIndex(),
      immuneUntil: 0,
      hovering: false,
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

    // How long this tick really represents. Clamped, because a process that
    // was descheduled for a second must not advance the world by a second.
    const sinceLast = this.lastTickAt === 0 ? 0 : (now - this.lastTickAt) / 1000;
    this.lastTickAt = now;
    const tickSeconds = Math.min(Math.max(sinceLast, 1 / 240), 1 / 5);

    // Resolved for the whole room BEFORE anybody is stepped, so drafting is
    // decided against one consistent picture of where everyone was. Doing it
    // inside the per-player loop would let the players simulated first be
    // judged against last tick's trails and the rest against this tick's.
    this.resolveDrafting();

    this.state.players.forEach((player, id) => {
      const rt = this.runtime.get(id);
      if (!rt || !rt.simulating || player.away) return;

      // Where this tick started. Both core collection and tail-clip are
      // tested against the whole path flown, not just where the craft
      // ended up.
      rt.fromX = rt.sim.x;
      rt.fromY = rt.sim.y;
      rt.fromZ = rt.sim.z;

      // Whether a roll was already under way before this tick's input, so
      // the shockwave fires once at the moment it begins and not on every
      // tick it is still turning through.
      const wasRolling = rt.sim.rollSpin > 0;

      let applied = 0;
      while (rt.pending.length > 0 && applied < MAX_SAMPLES_PER_TICK) {
        const sample = rt.pending.shift()!;
        stepFlight(rt.sim, sample, sample.dt);
        rt.lastSeq = sample.seq;
        rt.hovering = sample.hover;
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
            hover: rt.hovering,
            roll: 0,
          },
          // Real elapsed time, not the nominal tick. A coasting craft
          // flying at four fifths speed because the timer is coarse is a
          // bug that only appears on one operating system.
          tickSeconds,
        );
      }

      if (!wasRolling && rt.sim.rollSpin > 0) this.fireShockwave(player, rt, now);

      this.collectCores(player, rt, rt.fromX, rt.fromY, rt.fromZ);
      this.collectShards(player, rt, now);
      this.claimBeacon(player, rt, now);
      this.publish(player, rt);
      this.appendTrail(player);

      player.immuneMs = Math.max(0, Math.min(65535, rt.immuneUntil - now));
    });

    // Everybody has moved and everybody's trail is up to date, so every cut
    // this tick is judged against the same finished picture of the sky.
    this.resolveClips(now);

    this.respawnCores(now);
    this.expireShards(now);
    this.reapAbandoned(now);
    this.stepBeacon(now, tickSeconds);
  }

  /**
   * The Beacon: charge, open, claim, cool down.
   *
   * The charge rate is the cooperative half of this — it fills far faster
   * with craft circling it than it ever does on its own, so a room that
   * gathers gets the event several times more often than a room that
   * scatters. Nobody is forced to cooperate and nobody is rewarded directly
   * for it; they simply make the thing they all want happen sooner.
   *
   * What follows is deliberately winner-takes-all. A prize everyone gets
   * for turning up is not a prize, and the whole point is a race worth
   * losing. The consolation for losing is that the sky now contains the
   * most valuable target in the game.
   */
  private stepBeacon(now: number, tickSeconds: number) {
    const beacon = this.state.beacon;

    // The overcharge runs on its own clock: it outlives the opening, and
    // has to end even if the Beacon has already begun recharging.
    if (beacon.holderId) {
      const left = this.overchargeEndsAt - now;
      if (left <= 0) {
        const holder = this.state.players.get(beacon.holderId);
        if (holder) holder.overcharged = false;
        console.log(`[room] overcharge on P${beacon.holderSeat + 1} expired`);
        beacon.holderId = "";
        beacon.overchargeMsLeft = 0;
      } else {
        beacon.overchargeMsLeft = Math.min(65535, left);
      }
    }

    if (beacon.phase === 1) {
      const left = this.beaconPhaseEndsAt - now;
      beacon.phaseMsLeft = Math.max(0, Math.min(65535, left));
      if (left <= 0) {
        // Nobody came. It does not start again from nothing.
        console.log("[room] beacon closed unclaimed");
        beacon.phase = 0;
        beacon.charge = BEACON.unclaimedCarry;
        beacon.phaseMsLeft = 0;
      }
      return;
    }

    if (beacon.phase === 2) {
      const left = this.beaconPhaseEndsAt - now;
      beacon.phaseMsLeft = Math.max(0, Math.min(65535, left));
      if (left <= 0) {
        beacon.phase = 0;
        beacon.charge = 0;
        beacon.phaseMsLeft = 0;
      }
      return;
    }

    // Charging. Count who is close enough to be helping.
    const site = beaconSite();
    const gatherSq = BEACON.gatherRadius * BEACON.gatherRadius;
    let gathered = 0;

    this.state.players.forEach((player) => {
      if (!player.simulated || player.away) return;
      const dx = player.x - site.x;
      const dy = player.y - site.y;
      if (dx * dx + dy * dy <= gatherSq) gathered++;
    });

    const rate = Math.min(
      BEACON.maxRateMultiplier,
      1 + gathered * BEACON.perPilotRate,
    );
    beacon.charge = Math.min(
      1,
      beacon.charge + (rate * tickSeconds) / BEACON.chargeSecondsAlone,
    );

    if (beacon.charge >= 1) {
      beacon.phase = 1;
      this.beaconPhaseEndsAt = now + BEACON.openMs;
      beacon.phaseMsLeft = BEACON.openMs;
      console.log(`[room] beacon OPEN (${gathered} nearby)`);
    }
  }

  /**
   * Did anybody reach the core?
   *
   * Swept along the tick's movement like every other pickup in the game —
   * this one especially, because it is reached in a dive at the highest
   * speed anybody ever flies, which is exactly the case a point check
   * misses.
   */
  private claimBeacon(player: PlayerState, rt: Runtime, now: number) {
    const beacon = this.state.beacon;
    if (beacon.phase !== 1) return;

    const site = beaconSite();
    const r = BEACON.claimRadius;

    const px = rt.sim.x - rt.fromX;
    const py = rt.sim.y - rt.fromY;
    const pz = rt.sim.z - rt.fromZ;
    const pathSq = px * px + py * py + pz * pz;

    let t = 0;
    if (pathSq > 1e-9) {
      t =
        ((site.x - rt.fromX) * px +
          (site.y - rt.fromY) * py +
          (site.coreZ - rt.fromZ) * pz) /
        pathSq;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
    }
    const dx = site.x - (rt.fromX + px * t);
    const dy = site.y - (rt.fromY + py * t);
    const dz = site.coreZ - (rt.fromZ + pz * t);
    if (dx * dx + dy * dy + dz * dz > r * r) return;

    // Whoever held it before loses it the instant somebody else takes it.
    if (beacon.holderId && beacon.holderId !== player.id) {
      const previous = this.state.players.get(beacon.holderId);
      if (previous) previous.overcharged = false;
    }

    beacon.phase = 2;
    beacon.charge = 0;
    this.beaconPhaseEndsAt = now + BEACON.cooldownMs;
    beacon.phaseMsLeft = BEACON.cooldownMs;

    beacon.holderId = player.id;
    beacon.holderSeat = player.seat;
    beacon.overchargeMsLeft = BEACON.overchargeMs;
    this.overchargeEndsAt = now + BEACON.overchargeMs;
    player.overcharged = true;

    console.log(`[room] P${player.seat + 1} TOOK THE BEACON`);
  }

  /**
   * Craft with nobody at the controls.
   *
   * Marked away first and dropped much later, so a moment's inattention is
   * survivable and an abandoned tab is not. An away craft is not simulated,
   * not drawn, not on the scoreboard, and out of every fight — it is as if
   * that player had stepped outside, which is what has happened.
   */
  private reapAbandoned(now: number) {
    this.state.players.forEach((player, id) => {
      const rt = this.runtime.get(id);
      if (!rt) return;

      const silent = now - rt.lastInputAt;

      if (!player.away && silent > AWAY_AFTER_MS) {
        player.away = true;
        console.log(`[room] P${player.seat + 1} went quiet — craft parked`);
        return;
      }

      if (silent > RELEASE_SEAT_AFTER_MS) {
        console.log(`[room] P${player.seat + 1} abandoned — seat released`);
        this.state.players.delete(id);
        this.runtime.delete(id);
      }
    });
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
    player.rollSpin = rt.sim.rollSpin;
    player.rollDir = rt.sim.rollDir;
    player.rollCooldown = rt.sim.rollCooldown;
    player.shoveX = rt.sim.shoveX;
    player.shoveY = rt.sim.shoveY;
    player.shoveZ = rt.sim.shoveZ;
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
      if (!rt || !rt.simulating || player.away) {
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
        if (leader.away) return; // a parked craft has no slipstream
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
  private collectCores(
    player: PlayerState,
    rt: Runtime,
    fromX: number,
    fromY: number,
    fromZ: number,
  ) {
    const sites = coreSites();
    const radiusSq = CORE_PICKUP_RADIUS * CORE_PICKUP_RADIUS;

    // The path flown since the last check, and a box around it wide enough
    // to hold the pickup bubble at either end.
    const px = rt.sim.x - fromX;
    const py = rt.sim.y - fromY;
    const pz = rt.sim.z - fromZ;
    const pathSq = px * px + py * py + pz * pz;

    const loX = Math.min(fromX, rt.sim.x) - CORE_PICKUP_RADIUS;
    const hiX = Math.max(fromX, rt.sim.x) + CORE_PICKUP_RADIUS;
    const loY = Math.min(fromY, rt.sim.y) - CORE_PICKUP_RADIUS;
    const hiY = Math.max(fromY, rt.sim.y) + CORE_PICKUP_RADIUS;
    const loZ = Math.min(fromZ, rt.sim.z) - CORE_PICKUP_RADIUS;
    const hiZ = Math.max(fromZ, rt.sim.z) + CORE_PICKUP_RADIUS;

    for (let i = 0; i < sites.length; i++) {
      if (this.state.coresTaken[i]) continue;

      // Cheap axis rejections first: nearly every core is nowhere near.
      const site = sites[i];
      if (site.x < loX || site.x > hiX) continue;
      if (site.y < loY || site.y > hiY) continue;
      if (site.z < loZ || site.z > hiZ) continue;

      // Closest approach along this tick's path rather than the distance at
      // the end of it. A craft in a boosted dive covers ten metres between
      // ticks, and testing only the endpoint let it pass clean through a
      // core it was aimed straight at — the single most infuriating way for
      // a pickup to fail, because the player did everything right.
      let t = 0;
      if (pathSq > 1e-9) {
        t =
          ((site.x - fromX) * px + (site.y - fromY) * py + (site.z - fromZ) * pz) /
          pathSq;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
      }
      const dx = site.x - (fromX + px * t);
      const dy = site.y - (fromY + py * t);
      const dz = site.z - (fromZ + pz * t);
      if (dx * dx + dy * dy + dz * dz > radiusSq) continue;

      this.state.coresTaken[i] = true;
      this.coreReturnsAt[i] = Date.now() + CORE_RESPAWN_MS;
      player.trailLength = Math.min(
        MAX_TRAIL_LENGTH,
        player.trailLength + CORE_TRAIL_VALUE * this.yieldFor(player),
      );
      player.cores += 1;
    }
  }

  /**
   * A barrel roll just started: throw everything nearby clear.
   *
   * The only interaction in the game that takes nothing from anybody. It
   * does not cut, it does not steal, it does not score — it buys the pilot
   * a moment and some distance, which is precisely what the game had no way
   * of offering to somebody being hunted.
   *
   * Colour is deliberately ignored. A shockwave is not aimed, and a wall of
   * air that politely parts around your own team would be a strange thing
   * to explain; it also means a badly timed roll scatters your own allies,
   * which is a real cost to weigh.
   */
  private fireShockwave(roller: PlayerState, rt: Runtime, now: number) {
    const radiusSq = ROLL.radius * ROLL.radius;
    let caught = 0;

    this.state.players.forEach((other, otherId) => {
      if (otherId === roller.id) return;
      if (other.away) return;
      const ort = this.runtime.get(otherId);
      if (!ort || !ort.simulating) return;

      const dx = ort.sim.x - rt.sim.x;
      const dy = ort.sim.y - rt.sim.y;
      const dz = ort.sim.z - rt.sim.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq > radiusSq) return;

      // Straight out from the roller. A craft sitting exactly on top of one
      // has no direction to be thrown in, so it gets thrown upward.
      const dist = Math.sqrt(distSq);
      const nx = dist > 0.01 ? dx / dist : 0;
      const ny = dist > 0.01 ? dy / dist : 0;
      const nz = dist > 0.01 ? dz / dist : 1;

      // Hardest at the centre, tailing off to nothing at the rim, so there
      // is no cliff edge where one metre decides everything.
      const falloff = 1 - dist / ROLL.radius;
      const push = ROLL.shoveSpeed * (0.35 + 0.65 * falloff);

      ort.sim.shoveX += nx * push;
      ort.sim.shoveY += ny * push;
      ort.sim.shoveZ += nz * push;
      other.shoveX = ort.sim.shoveX;
      other.shoveY = ort.sim.shoveY;
      other.shoveZ = ort.sim.shoveZ;
      caught++;
    });

    // Paid for whether or not it caught anybody: it is a panic button, and
    // one that is free when it misses is one you hold down.
    roller.trailLength = Math.max(
      CLIP.minTrailLength,
      roller.trailLength - ROLL.trailCost,
    );

    // The guard is the real defence. The shove alone cannot save a craft
    // from somebody already committed to the pass.
    rt.immuneUntil = Math.max(rt.immuneUntil, now + ROLL.guardMs);
    roller.immuneMs = Math.min(65535, rt.immuneUntil - now);

    roller.rolls += 1;
    roller.rollX = rt.sim.x;
    roller.rollY = rt.sim.y;
    roller.rollZ = rt.sim.z;

    if (caught > 0) {
      console.log(`[room] P${roller.seat + 1} shockwave threw ${caught} clear`);
    }
  }

  /**
   * Tail-Clip: who cut whose trail this tick.
   *
   * The highest-stakes thing in the game, and therefore the thing that has
   * to be decided in exactly one place. A client never predicts a cut, never
   * plays the effect on its own authority, and never shortens anybody's
   * ribbon locally — every viewer, including the victim, learns what
   * happened from the same state, so nobody ever sees a kill that did not
   * happen or misses one that did.
   *
   * Two gates decide whether a pass counts, and together they are what turns
   * eight arbitrary colours into teams:
   *
   *   Your own colour cannot be cut. Somebody wearing your hue is a craft
   *   you can fly wingtip to wingtip with at speed, and drafting them is
   *   worth far more than drafting anyone else — so your own colour is the
   *   company you want to keep.
   *
   *   You have to cut ACROSS the wake. Following it is drafting, and since
   *   drafting sits you exactly on the line a cut is tested against, without
   *   this the two mechanics could not both exist.
   */
  private resolveClips(now: number) {
    // One index per player, built once. A clipper is tested against every
    // other trail in the room, so building these per pair would rebuild the
    // same bounds two dozen times a tick.
    this.state.players.forEach((player, id) => {
      const rt = this.runtime.get(id);
      if (rt) buildTrailIndex(player.trail, rt.trailIndex);
    });

    // Gathered first and applied second, so every cut is judged against the
    // sky as it stood at the end of the movement pass. Severing a trail
    // while still looking for cuts would let the order players happen to be
    // stored in decide who got away with what.
    const cuts: {
      victimId: string;
      clipperId: string;
      index: number;
      x: number;
      y: number;
      z: number;
      /**
       * True when the cut was made by an overcharged craft's live wake, in
       * which case `index` refers to the wake that was touched and not to
       * the trail actually being severed.
       */
      onOwnTrail: boolean;
    }[] = [];

    this.state.players.forEach((clipper, clipperId) => {
      const crt = this.runtime.get(clipperId);
      if (!crt || !crt.simulating || clipper.away) return;

      // You cut by flying THROUGH something. A craft holding station is not
      // cutting anything, however it happens to be pointed — without this,
      // parking across a lane turns a hovering craft into permanent razor
      // wire that severs everyone who passes, which is both a griefing tool
      // and completely illegible to the victim, who flew into a craft that
      // was visibly doing nothing.
      const mx = crt.sim.x - crt.fromX;
      const my = crt.sim.y - crt.fromY;
      const mz = crt.sim.z - crt.fromZ;
      if (mx * mx + my * my + mz * mz < 0.04) return;

      const cp = Math.cos(crt.sim.pitch);
      const fx = cp * Math.cos(crt.sim.yaw);
      const fy = cp * Math.sin(crt.sim.yaw);
      const fz = Math.sin(crt.sim.pitch);

      this.state.players.forEach((victim, victimId) => {
        if (victimId === clipperId) return;
        if (victim.away) return;
        if (victim.colour === clipper.colour) return;

        const vrt = this.runtime.get(victimId);
        if (!vrt || !vrt.simulating) return;
        // Their grace period protects THEM. An overcharged craft's wake is
        // not being cut, it is doing the cutting, so grace has no bearing
        // on it — the clipper's own grace is checked where the cut lands.
        if (!victim.overcharged && now < vrt.immuneUntil) return;
        // Nothing to touch on a craft that has barely started laying one.
        if (victim.trail.length < 4) return;

        // An overcharged craft's wake is LIVE: touching it at all cuts
        // YOU, whichever way you were going. That inversion is the whole
        // prize — for twenty seconds one player's trail is a line across
        // the sky that nobody else can cross, so the counterplay is to
        // leave them alone and go and earn elsewhere, or to share their
        // colour, which is still safe.
        const live = victim.overcharged;

        const cut = findCut(
          crt.fromX,
          crt.fromY,
          crt.fromZ,
          crt.sim.x,
          crt.sim.y,
          crt.sim.z,
          fx,
          fy,
          fz,
          victim.trail,
          vrt.trailIndex,
          live,
        );
        if (!cut) return;

        // Same collision, opposite outcome.
        cuts.push(
          live
            ? {
                victimId: clipperId,
                clipperId: victimId,
                index: cut.index,
                x: cut.x,
                y: cut.y,
                z: cut.z,
                onOwnTrail: true,
              }
            : {
                victimId,
                clipperId,
                index: cut.index,
                x: cut.x,
                y: cut.y,
                z: cut.z,
                onOwnTrail: false,
              },
        );
      });
    });

    for (const c of cuts) this.applyCut(c, now);
  }

  /**
   * Sever one trail.
   *
   * Deliberately re-checks immunity: two players can cross the same trail in
   * the same tick, and the second of them must not get a second cut out of a
   * craft that has already been taken apart.
   */
  private applyCut(
    c: {
      victimId: string;
      clipperId: string;
      index: number;
      x: number;
      y: number;
      z: number;
      onOwnTrail: boolean;
    },
    now: number,
  ) {
    const victim = this.state.players.get(c.victimId);
    const vrt = this.runtime.get(c.victimId);
    if (!victim || !vrt || now < vrt.immuneUntil) return;

    const points = victim.trail.length;

    // Two different quantities, and conflating them was a real bug.
    //
    // `cutPoints` is how much RIBBON goes. For an ordinary cut that is the
    // whole story: you sever what you fly through, and one point always
    // survives so a craft is never left with nothing at all.
    //
    // `scoreLost` is what it COSTS. For an ordinary cut the two are the
    // same — the ribbon is the score. A live-wake cut is not a geometric
    // severing at all, it is a flat penalty for touching the wire, and
    // charging it against ribbon length let a craft whose ribbon had not
    // caught up with its score lose a single point for flying into one.
    const cutPoints = c.onOwnTrail
      ? Math.min(points - 1, Math.max(1, Math.round(points * CLIP.liveWakeCost)))
      : Math.min(c.index + 1, points - 1);
    if (cutPoints < 1) return;

    const scoreLost = c.onOwnTrail
      ? Math.max(1, Math.round(victim.trailLength * CLIP.liveWakeCost))
      : cutPoints;

    // Scattered before the trail is shortened — the shards lie along the
    // piece that was taken, which is what makes a kill readable from across
    // the sky as a line of somebody else's colour hanging in the air.
    this.scatterShards(victim, cutPoints, scoreLost, now);

    victim.trail.splice(0, cutPoints);
    victim.trailLength = Math.max(CLIP.minTrailLength, victim.trailLength - scoreLost);

    victim.clipsTaken += 1;
    victim.clipX = c.x;
    victim.clipY = c.y;
    victim.clipZ = c.z;

    vrt.immuneUntil = now + CLIP.immunityMs;
    victim.immuneMs = CLIP.immunityMs;

    const clipper = this.state.players.get(c.clipperId);
    if (clipper) clipper.clipsMade += 1;

    console.log(
      `[room] ${c.onOwnTrail ? "live wake" : "clip"} P${(clipper?.seat ?? 0) + 1}` +
        ` cut P${victim.seat + 1} for ${scoreLost}`,
    );
  }

  /**
   * Turn a severed tail into pickups.
   *
   * Only part of it comes back — the rest evaporates, because a clip that
   * conserved every point would leave the room's total score untouched and
   * make the whole mechanic a transfer rather than a stake.
   *
   * They arm after a delay. Without one the victim simply hoovers up their
   * own tail on the spot and has lost nothing at all; with it, both craft
   * are a good forty metres past the cut before anything is takeable, and
   * both have to turn and come back for it. That turn is the fight.
   */
  private scatterShards(
    victim: PlayerState,
    cutPoints: number,
    scoreLost: number,
    now: number,
  ) {
    // Worth what the victim actually lost, laid out along what was severed.
    const total = Math.round(scoreLost * CLIP.shardYield);
    if (total < 1) return;

    const count = Math.max(1, Math.min(CLIP.maxShards, Math.round(total / 4)));
    const per = Math.max(1, Math.min(255, Math.floor(total / count)));

    for (let n = 0; n < count; n++) {
      const at = Math.min(cutPoints - 1, Math.floor(((n + 0.5) / count) * cutPoints));
      const p = victim.trail[at];
      if (!p) continue;

      const shard = new ClipShard();
      shard.id = this.nextShardId++;
      // A little scatter, so a cut reads as debris rather than as a tidy
      // dotted line where a trail used to be.
      shard.x = p.x + (Math.random() - 0.5) * 6;
      shard.y = p.y + (Math.random() - 0.5) * 6;
      shard.z = p.z + (Math.random() - 0.5) * 6;
      shard.value = per;
      shard.colour = victim.colour;

      this.state.shards.push(shard);
      this.shardTiming.set(shard.id, {
        armedAt: now + CLIP.shardArmMs,
        diesAt: now + CLIP.shardLifeMs,
      });
    }
  }

  /**
   * Shards picked up along this tick's path.
   *
   * Swept for the same reason core collection is: the craft that just cut
   * somebody is travelling fast, and testing only where it ended up would
   * let it fly straight through its own winnings.
   */
  private collectShards(player: PlayerState, rt: Runtime, now: number) {
    const shards = this.state.shards;
    if (shards.length === 0) return;

    const r = CLIP.shardPickupRadius;
    const rSq = r * r;

    const px = rt.sim.x - rt.fromX;
    const py = rt.sim.y - rt.fromY;
    const pz = rt.sim.z - rt.fromZ;
    const pathSq = px * px + py * py + pz * pz;

    for (let i = shards.length - 1; i >= 0; i--) {
      const shard = shards[i];
      const timing = this.shardTiming.get(shard.id);
      if (!timing || now < timing.armedAt) continue;

      let t = 0;
      if (pathSq > 1e-9) {
        t =
          ((shard.x - rt.fromX) * px +
            (shard.y - rt.fromY) * py +
            (shard.z - rt.fromZ) * pz) /
          pathSq;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
      }
      const dx = shard.x - (rt.fromX + px * t);
      const dy = shard.y - (rt.fromY + py * t);
      const dz = shard.z - (rt.fromZ + pz * t);
      if (dx * dx + dy * dy + dz * dz > rSq) continue;

      player.trailLength = Math.min(
        MAX_TRAIL_LENGTH,
        player.trailLength + shard.value * this.yieldFor(player),
      );
      this.shardTiming.delete(shard.id);
      shards.splice(i, 1);
    }
  }

  /** What one point of pickup is worth to this player right now. */
  private yieldFor(player: PlayerState) {
    return player.overcharged ? BEACON.overchargeYield : 1;
  }

  /** Shards nobody came back for. */
  private expireShards(now: number) {
    const shards = this.state.shards;
    for (let i = shards.length - 1; i >= 0; i--) {
      const timing = this.shardTiming.get(shards[i].id);
      if (timing && now < timing.diesAt) continue;
      this.shardTiming.delete(shards[i].id);
      shards.splice(i, 1);
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
