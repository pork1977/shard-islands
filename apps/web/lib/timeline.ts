/**
 * The beats of the opening sequence, in seconds from the strike.
 *
 * Shared so the fracture and the world below stay in step — the world's
 * colour has to bloom on exactly the same schedule as the camera's fall,
 * and duplicating these numbers in two files guarantees they drift apart.
 */

/** Time for the fracture to travel from the strike to the pane edges. */
export const CRACK_DURATION = 2.1;

/**
 * A beat of held tension after the pane is fully cracked but before it lets
 * go — the "it's going to fall, isn't it" moment.
 */
export const COLLAPSE_AT = CRACK_DURATION + 0.28;

/** The camera starts falling just after the floor does, not with it. */
export const PLUNGE_AT = COLLAPSE_AT + 0.12;
export const PLUNGE_DURATION = 1.9;

/** 0 while the pane is still whole, 1 once the camera is fully in the world. */
export function revealAt(secondsSinceStrike: number): number {
  const t = (secondsSinceStrike - PLUNGE_AT) / PLUNGE_DURATION;
  return Math.max(0, Math.min(1, t));
}
