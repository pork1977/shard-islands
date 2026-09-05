import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

/**
 * One point of a player's trail.
 *
 * Kept as three plain floats rather than a nested vector type: @colyseus/schema
 * sends only what changed, and a flat leaf costs far less per update than a
 * nested object once there are hundreds of these per player.
 */
export class TrailPoint extends Schema {
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") z = 0;
}

/**
 * A piece of somebody's severed trail, lying in the sky waiting to be taken.
 *
 * Unlike the Energy Cores these cannot be generated from a shared seed —
 * they appear wherever a fight happened — so their positions really do go
 * over the wire. They are also the only genuinely dynamic entity in the
 * world, which is why they carry an id: the client animates each one in and
 * out, and needs to know that the shard at index three is still the same
 * shard it was drawing last frame after somebody ahead of it was taken.
 */
export class ClipShard extends Schema {
  @type("uint32") id = 0;

  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") z = 0;

  /** Trail points this shard is worth to whoever collects it. */
  @type("uint8") value = 1;

  /** The colour of the player it was cut from, so a kill reads at a glance. */
  @type("uint8") colour = 0;
}

/**
 * The Beacon's own state.
 *
 * All of it synced, including the charge fraction, because the charging is
 * as much a part of the event as the opening — a ring filling up on the
 * horizon is what tells players it is worth setting off now, and a player
 * who cannot see it coming can only ever arrive late.
 */
export class BeaconState extends Schema {
  /** 0 to 1. */
  @type("float32") charge = 0;

  /** 0 charging, 1 open, 2 spent and cooling down. */
  @type("uint8") phase = 0;

  /** Milliseconds left in the current phase, for the countdown ring. */
  @type("uint16") phaseMsLeft = 0;

  /** Who is overcharged right now, empty when nobody is. */
  @type("string") holderId = "";
  @type("uint8") holderSeat = 0;
  @type("uint16") overchargeMsLeft = 0;
}

export class PlayerState extends Schema {
  @type("string") id = "";

  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") z = 0;

  /** Heading and attitude, cheaper on the wire than a quaternion. */
  @type("float32") yaw = 0;
  @type("float32") pitch = 0;
  @type("float32") roll = 0;

  @type("float32") speed = 0;
  @type("boolean") boosting = false;

  /** How much trail this player has earned — the score, in effect. */
  @type("float32") trailLength = 26;

  /** Cores collected this session, purely so the player can see the count. */
  @type("uint16") cores = 0;

  /**
   * Slipstream multiplier in effect, 1 when not drafting. Synced because the
   * owning client replays its own inputs against it, and everyone else uses
   * it to decide whether to draw the drafting effect on that craft.
   */
  @type("float32") draft = 1;

  /** Hue index into the client's palette, so players are told apart. */
  @type("uint8") colour = 0;

  /**
   * Times this player has been cut, and where the last cut happened.
   *
   * The counter is the event: clients watch it for a change and play the
   * burst at the recorded point. Sending it this way rather than as a
   * message means a client that joins, drops a packet, or looks away still
   * ends up agreeing with everybody else about what the world looks like —
   * which for the highest-stakes mechanic in the game is the whole point.
   */
  @type("uint16") clipsTaken = 0;
  @type("float32") clipX = 0;
  @type("float32") clipY = 0;
  @type("float32") clipZ = 0;

  /** Cuts this player has landed, for their own scoreline. */
  @type("uint16") clipsMade = 0;

  /**
   * Holding the Beacon's charge.
   *
   * Kept on the player as well as on the Beacon, because every other craft
   * in the sky needs to know at a glance — an overcharged craft's wake cuts
   * anyone who touches it, and being unable to tell which trail that is
   * would make it a trap rather than a threat.
   */
  @type("boolean") overcharged = false;

  /**
   * Milliseconds of protection left after being cut. Synced so the player
   * can see they are safe, and so nobody else wastes a pass on them.
   */
  @type("uint16") immuneMs = 0;

  /**
   * Which seat in the room this player holds, from zero.
   *
   * Assigned as the lowest FREE seat rather than from an ever-rising
   * counter: seats need to be reused when somebody leaves, or after eight
   * joins two players in the same sky end up the same colour. It doubles as
   * the player's name — seat 0 is P1.
   */
  @type("uint8") seat = 0;

  /**
   * The last input sequence number this player's state includes.
   *
   * The whole of client-side reconciliation hangs off this one field: it
   * tells the client which of its own predicted inputs the server has
   * already accounted for, and therefore which ones it must replay on top
   * of the authoritative state it just received.
   */
  @type("uint32") lastSeq = 0;

  /** False while the player is still falling and reporting position directly. */
  @type("boolean") simulated = false;

  /**
   * Nobody is at the controls.
   *
   * A browser tab left open stays connected forever, so without this its
   * craft keeps being flown by the room — drifting around the map, sitting
   * on the scoreboard, and being counted as another player in the sky. It
   * is exactly how a phantom "P1" appears in a room with one person in it.
   *
   * Synced rather than handled by simply deleting the player, because
   * somebody who tabs away for a moment should be able to come back to
   * their own trail. Their craft is hidden, they are off the scoreboard,
   * and they can neither cut nor be cut.
   */
  @type("boolean") away = false;

  /**
   * The damped stick, which is simulation state rather than an input detail:
   * it carries between steps, so replaying inputs on top of an authoritative
   * state without it gives a different answer than the server got. Synced
   * for the same reason position is — the owning client needs it to replay.
   */
  @type("float32") smoothTurn = 0;
  @type("float32") smoothPitch = 0;

  /**
   * The barrel roll and the shove, both carried for the same reason as the
   * damped stick: they persist between steps, so an owning client replaying
   * its unacknowledged inputs without them lands somewhere else.
   */
  @type("float32") rollSpin = 0;
  @type("float32") rollDir = 0;
  @type("float32") rollCooldown = 0;
  @type("float32") shoveX = 0;
  @type("float32") shoveY = 0;
  @type("float32") shoveZ = 0;

  /**
   * Shockwaves this craft has thrown, and where the last one went off.
   *
   * A counter, like the clip counter, because it is an event and events
   * have to survive a dropped packet: a client that missed the one tick a
   * roll was starting on would simply never draw it.
   */
  @type("uint16") rolls = 0;
  @type("float32") rollX = 0;
  @type("float32") rollY = 0;
  @type("float32") rollZ = 0;

  @type([TrailPoint]) trail = new ArraySchema<TrailPoint>();
}

export class RoomState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();

  /**
   * One flag per Energy Core: true while it is collected and waiting to come
   * back. Positions are never sent — both sides generate the identical
   * layout from the shared seed, so the wire only carries what changed,
   * which is a single boolean per pickup.
   */
  @type(["boolean"]) coresTaken = new ArraySchema<boolean>();

  /**
   * Trail fragments scattered by tail-clips, and collectible by anyone.
   *
   * Held in the room rather than on the victim: once a piece of trail has
   * been cut loose it belongs to nobody, and whoever reaches it first owns
   * it — including the player it was taken from, if they turn around fast
   * enough.
   */
  @type([ClipShard]) shards = new ArraySchema<ClipShard>();

  /** The one thing on the map everybody can see at once. */
  @type(BeaconState) beacon = new BeaconState();

  /** Server tick count, useful for debugging desync. */
  @type("uint32") tick = 0;
}
