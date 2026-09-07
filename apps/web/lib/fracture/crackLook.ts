/**
 * The shape of the fracture, shared by the two halves that have to agree.
 *
 * The pane's look is decided in two places that never touch each other: the
 * Voronoi seeding, which decides where the cracks ARE, and the shader, which
 * decides the order they arrive in. Both need the same idea of how many
 * major cracks radiate from the strike, or the fast lanes in the animation
 * run through parts of the pane that have no long crack in them.
 */

/** How many fast lanes the crack front runs along. */
export const CRACK_RAYS = 9;

/**
 * Long radial cracks forced into the geometry.
 *
 * Comfortably more than CRACK_RAYS, so that wherever a fast lane falls there
 * is a real crack near it to travel down. The reference this is aimed at —
 * a stone through a window — has a dense hole at the strike and a dozen or
 * more long spears reaching the frame, not the five or six a mosaic gets.
 */
export const MAJOR_CRACKS_MIN = 13;
export const MAJOR_CRACKS_MAX = 19;
