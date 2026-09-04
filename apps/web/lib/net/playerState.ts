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
}
