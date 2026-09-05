// Single source of truth for physics/gameplay constants shared by the client's
// predicted flight controller and the server's authoritative simulation.
// Keeping both sides importing from here is what lets prediction and the
// authoritative sim agree without drifting apart.

export const SERVER_TICK_RATE_HZ = 20;
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE_HZ;

export const FLIGHT = {
  // Raised across the board: the map is 1400 units across, and at the old
  // cruise it took over a minute and a half to cross, which is what made
  // the ground look like it was barely moving.
  baseForwardSpeed: 26,
  diveSpeedMultiplier: 1.9,
  turnDamping: 6, // higher = snappier steering response
  /** Boost has to be unmistakable — 1.5x was not felt at all. */
  boostSpeedMultiplier: 2.7,
} as const;

export const TRAIL = {
  pointSpacingMeters: 0.75, // arc-length spacing between recorded trail points
  hotSegmentLength: 24, // most-recent points kept at full resolution for collision
  baseThickness: 0.4,
} as const;

/**
 * Jetstream Draft.
 *
 * Two tiers rather than the flat colour gate first sketched. A hard "only
 * your own colour may draft" rule is dead weight in the rooms this will
 * actually launch in: with eight colours and two players in the sky, the
 * mechanic would almost never be available at all. Grading it keeps the
 * intent — you go and look for your own kind, because that is where the real
 * boost is — while leaving something worth doing behind a stranger.
 */
export const DRAFT = {
  /** Behind anybody's trail. */
  strangerMultiplier: 1.25,
  /** Behind a craft of your own colour. */
  alliedMultiplier: 1.65,
  /** How closely the drafter has to be following the trail's own direction. */
  minHeadingAgreement: 0.55,
  /** Trail points back from the leader that still pull. */
  hotPoints: 34,
} as const;

export const INTERACTION_RADII = {
  /**
   * Raised from 3. At three metres, catching a slipstream at fifty metres a
   * second was threading a needle nobody threaded; the fantasy is sitting in
   * somebody's wake, not landing a precision shot.
   */
  draftLateral: 7,
  tailClip: 0.6, // added to trail thickness/2 for the capsule test
  barrelRoll: 12,
  crystalVoidEvent: 40,
} as const;

export const ROOM = {
  maxPlayers: 24,
} as const;
