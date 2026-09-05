import { Room, type Client } from "@colyseus/core";
import {
  ROOM,
  SERVER_TICK_RATE_HZ,
  TRAIL,
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
export class ShardIslandsRoom extends Room<RoomState> {
  maxClients = ROOM.maxPlayers;

  private runtime = new Map<string, Runtime>();

  /** When each collected core comes back, by index. 0 means it is out there. */
  private coreReturnsAt: number[] = [];

  /** Arming and expiry for each live shard, keyed by its id. */
  private shardTiming = new Map<number, ShardTiming>();
  private nextShardId = 1;

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

    // Resolved for the whole room BEFORE anybody is stepped, so drafting is
    // decided against one consistent picture of where everyone was. Doing it
    // inside the per-player loop would let the players simulated first be
    // judged against last tick's trails and the rest against this tick's.
    this.resolveDrafting();

    this.state.players.forEach((player, id) => {
      const rt = this.runtime.get(id);
      if (!rt || !rt.simulating) return;

      // Where this tick started. Both core collection and tail-clip are
      // tested against the whole path flown, not just where the craft
      // ended up.
      rt.fromX = rt.sim.x;
      rt.fromY = rt.sim.y;
      rt.fromZ = rt.sim.z;

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
          },
          1 / SERVER_TICK_RATE_HZ,
        );
      }

      this.collectCores(player, rt, rt.fromX, rt.fromY, rt.fromZ);
      this.collectShards(player, rt, now);
      this.publish(player, rt);
      this.appendTrail(player);

      player.immuneMs = Math.max(0, Math.min(65535, rt.immuneUntil - now));
    });

    // Everybody has moved and everybody's trail is up to date, so every cut
    // this tick is judged against the same finished picture of the sky.
    this.resolveClips(now);

    this.respawnCores(now);
    this.expireShards(now);
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
        player.trailLength + CORE_TRAIL_VALUE,
      );
      player.cores += 1;
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
    }[] = [];

    this.state.players.forEach((clipper, clipperId) => {
      const crt = this.runtime.get(clipperId);
      if (!crt || !crt.simulating) return;

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
        if (victim.colour === clipper.colour) return;

        const vrt = this.runtime.get(victimId);
        if (!vrt || !vrt.simulating) return;
        if (now < vrt.immuneUntil) return;
        // Nothing to cut off a craft that has barely started laying one.
        if (victim.trail.length < 4) return;

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
        );
        if (!cut) return;

        cuts.push({
          victimId,
          clipperId,
          index: cut.index,
          x: cut.x,
          y: cut.y,
          z: cut.z,
        });
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
    },
    now: number,
  ) {
    const victim = this.state.players.get(c.victimId);
    const vrt = this.runtime.get(c.victimId);
    if (!victim || !vrt || now < vrt.immuneUntil) return;

    // Everything from the tail up to the cut. One point always survives, so
    // a craft is never left with no ribbon at all.
    const lost = Math.min(c.index + 1, victim.trail.length - 1);
    if (lost < 1) return;

    // Scattered before the trail is shortened — the shards lie along the
    // piece that was taken, which is what makes a kill readable from across
    // the sky as a line of somebody else's colour hanging in the air.
    this.scatterShards(victim, lost, now);

    victim.trail.splice(0, lost);
    victim.trailLength = Math.max(CLIP.minTrailLength, victim.trailLength - lost);

    victim.clipsTaken += 1;
    victim.clipX = c.x;
    victim.clipY = c.y;
    victim.clipZ = c.z;

    vrt.immuneUntil = now + CLIP.immunityMs;
    victim.immuneMs = CLIP.immunityMs;

    const clipper = this.state.players.get(c.clipperId);
    if (clipper) clipper.clipsMade += 1;

    console.log(
      `[room] clip P${(clipper?.seat ?? 0) + 1} cut P${victim.seat + 1} for ${lost}`,
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
  private scatterShards(victim: PlayerState, lost: number, now: number) {
    const total = Math.round(lost * CLIP.shardYield);
    if (total < 1) return;

    const count = Math.max(1, Math.min(CLIP.maxShards, Math.round(total / 4)));
    const per = Math.max(1, Math.min(255, Math.floor(total / count)));

    for (let n = 0; n < count; n++) {
      const at = Math.min(lost - 1, Math.floor(((n + 0.5) / count) * lost));
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

      player.trailLength = Math.min(MAX_TRAIL_LENGTH, player.trailLength + shard.value);
      this.shardTiming.delete(shard.id);
      shards.splice(i, 1);
    }
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
