// Single source of truth for physics/gameplay constants shared by the client's
// predicted flight controller and the server's authoritative simulation.
// Keeping both sides importing from here is what lets prediction and the
// authoritative sim agree without drifting apart.

export const SERVER_TICK_RATE_HZ = 20;
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE_HZ;

export const FLIGHT = {
  baseForwardSpeed: 14, // m/s
  diveSpeedMultiplier: 1.8,
  turnDamping: 6, // higher = snappier steering response
  boostSpeedMultiplier: 3, // jetstream draft boost
} as const;

export const TRAIL = {
  pointSpacingMeters: 0.75, // arc-length spacing between recorded trail points
  hotSegmentLength: 24, // most-recent points kept at full resolution for collision
  baseThickness: 0.4,
} as const;

export const INTERACTION_RADII = {
  draftLateral: 3,
  tailClip: 0.6, // added to trail thickness/2 for the capsule test
  barrelRoll: 12,
  crystalVoidEvent: 40,
} as const;

export const ROOM = {
  maxPlayers: 24,
} as const;
