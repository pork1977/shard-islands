/**
 * What the game is, in as few words as it can be said.
 *
 * Kept in one place because the same facts appear in three: the line during
 * the fall, the panel behind the question mark, and the control legend. Two
 * of those drifting apart would be worse than either being absent.
 *
 * The constraint this has to respect is the one the whole project is built
 * on: nothing to read before the glass breaks. The front page is a dare,
 * and a dare that comes with instructions is a form. So none of this is
 * ever shown unasked on the landing screen — it appears once the player is
 * already falling and already committed, and thereafter only when asked
 * for.
 */

export interface Mechanic {
  name: string;
  keys?: string;
  what: string;
}

/** The one sentence that was missing. Everything else is detail. */
export const THE_POINT = "Your glowing trail is your score. Longest trail wins.";

export const CONTROLS: Mechanic[] = [
  { name: "Fly", keys: "W A S D", what: "steer. Drag the mouse to look around without turning" },
  { name: "Boost", keys: "shift", what: "faster, and louder" },
  { name: "Hover", keys: "space", what: "stop dead and look about" },
  { name: "Barrel roll", keys: "A A  or  D D", what: "throws everything near you clear, and nothing can cut you for a moment" },
];

export const MECHANICS: Mechanic[] = [
  {
    name: "Energy Cores",
    what: "the glowing shards scattered everywhere. Fly through them to grow.",
  },
  {
    name: "Slipstream",
    what: "fly along behind somebody and you speed up — much faster behind your own colour.",
  },
  {
    name: "Tail-clip",
    what: "cut ACROSS a rival's trail and it snaps. What falls off is loose for anyone to collect. Your own colour is always safe.",
  },
  {
    name: "The Beacon",
    what: "the spiked dome. It charges — faster with craft circling it — then opens. First one to reach the core takes it, and for twenty seconds their trail cuts anyone who touches it.",
  },
];
