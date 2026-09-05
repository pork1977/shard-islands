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

  /** Hue index into the client's palette, so players are told apart. */
  @type("uint8") colour = 0;

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
   * The damped stick, which is simulation state rather than an input detail:
   * it carries between steps, so replaying inputs on top of an authoritative
   * state without it gives a different answer than the server got. Synced
   * for the same reason position is — the owning client needs it to replay.
   */
  @type("float32") smoothTurn = 0;
  @type("float32") smoothPitch = 0;

  @type([TrailPoint]) trail = new ArraySchema<TrailPoint>();
}

export class RoomState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();

  /** Server tick count, useful for debugging desync. */
  @type("uint32") tick = 0;
}
