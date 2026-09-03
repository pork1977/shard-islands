export type Vec3Tuple = [number, number, number];
export type QuatTuple = [number, number, number, number];

export interface PlayerInputSample {
  seq: number;
  dt: number;
  pitch: number; // -1..1
  roll: number; // -1..1
  yaw: number; // -1..1
  boosting: boolean;
}

export interface PlayerStateSnapshot {
  position: Vec3Tuple;
  quaternion: QuatTuple;
  velocity: Vec3Tuple;
  trailLength: number;
  boosting: boolean;
}
