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

  @type([TrailPoint]) trail = new ArraySchema<TrailPoint>();
}

export class RoomState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();

  /** Server tick count, useful for debugging desync. */
  @type("uint32") tick = 0;
}
