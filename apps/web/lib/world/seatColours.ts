/**
 * The eight seat colours, in one place.
 *
 * Centralised for tail-clip. Colour stopped being decoration the moment it
 * became a rule — your own colour cannot cut you, and the shards a cut
 * scatters are drawn in the colour of the player they were taken from. A
 * palette that had drifted between the craft, the label, the ribbon and the
 * debris would make a mechanic the whole game hangs on unreadable, and it
 * was already copied into three files before any of that mattered.
 */
export const SEAT_COLOURS = [
  "#5fe4ff",
  "#ff7ad9",
  "#9dff6b",
  "#ffc247",
  "#b98cff",
  "#ff6b5f",
  "#6bffd0",
  "#ffffff",
] as const;

/** The Alpha's crown, which overrides the seat colour wherever it applies. */
export const ALPHA_COLOUR = "#ffd24a";

export function seatColour(colour: number): string {
  return SEAT_COLOURS[colour % SEAT_COLOURS.length];
}
