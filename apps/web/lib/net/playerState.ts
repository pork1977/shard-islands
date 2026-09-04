import type { Vec3Tuple, QuatTuple } from "@shard-islands/shared";

/**
 * The local player's live state.
 *
 * Deliberately a plain mutable object rather than React/zustand state: it
 * changes every frame, and pushing that through a store would re-render the
 * tree 60+ times a second for no benefit. The fields are plain serializable
 * primitives so this can be mirrored straight into a networked schema when
 * the multiplayer phases land — this IS the payload that will be broadcast.
 */
export interface LivePlayerState {
  position: Vec3Tuple;
  quaternion: QuatTuple;
  velocity: Vec3Tuple;
  /** Heading about the world up axis (+Z in this world). */
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  boosting: boolean;
  /**
   * Recent trail points, flat xyz, oldest first.
   *
   * Appended by ARC LENGTH rather than per frame, so the trail's resolution
   * and its memory cost are independent of frame rate — and so the same
   * buffer can be broadcast without flooding the wire when someone's frame
   * rate is high.
   */
  trail: number[];
  /** How much trail the player has earned; drives length and thickness. */
  trailLength: number;
}

export const playerState: LivePlayerState = {
  position: [0, 0, 0],
  quaternion: [0, 0, 0, 1],
  velocity: [0, 0, 0],
  yaw: 0,
  pitch: 0,
  roll: 0,
  speed: 0,
  boosting: false,
  trail: [],
  trailLength: 26,
};

export function resetPlayerState(position: Vec3Tuple, yaw: number) {
  playerState.position = position;
  playerState.quaternion = [0, 0, 0, 1];
  playerState.velocity = [0, 0, 0];
  playerState.yaw = yaw;
  playerState.pitch = 0;
  playerState.roll = 0;
  playerState.speed = 0;
  playerState.boosting = false;
  playerState.trail = [];
  playerState.trailLength = 26;
}

/**
 * Appends to the trail only once the player has actually travelled far
 * enough, and drops the oldest points past the earned length.
 */
export function pushTrailPoint(
  state: LivePlayerState,
  spacing: number,
  maxPoints: number,
) {
  const t = state.trail;
  const [x, y, z] = state.position;

  if (t.length >= 3) {
    const dx = x - t[t.length - 3];
    const dy = y - t[t.length - 2];
    const dz = z - t[t.length - 1];
    if (dx * dx + dy * dy + dz * dz < spacing * spacing) return;
  }

  t.push(x, y, z);
  const excess = t.length / 3 - maxPoints;
  if (excess > 0) t.splice(0, Math.ceil(excess) * 3);
}
