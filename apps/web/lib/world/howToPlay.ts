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

/**
 * Why anybody would give money to a free game.
 *
 * A bare "donate" link is furniture — people's eyes go over it the way they
 * go over a cookie banner. What converts is a reason, and the reason has to
 * be both true and small: there is a machine in Virginia running the world
 * you were just flying in, and one person pays for it. That is the entire
 * pitch. No tiers, no perks, no "unlock", because the moment money buys
 * something in here the game acquires a shape it was never designed to
 * have — and the front page stops being able to say "free, no sign-up".
 *
 * It lives behind the question mark and nowhere else. Not on the glass,
 * which has no text at all, and not on screen during a flight, where the
 * only thing worth putting in front of somebody who has just done well is
 * the share button.
 */
export const SUPPORT = {
  /**
   * A Stripe Payment Link, priced "customer chooses what to pay".
   *
   * Stripe rather than a donations platform because the money then arrives
   * in the same place the rest of it does, and a platform sitting in the
   * middle is a cut for hosting a button we have already built. The link
   * itself is public — there is nothing secret about a checkout URL — so it
   * lives here in the source rather than in an environment variable, where
   * it would be one more thing to remember on a redeploy.
   *
   * Empty means the whole block renders nothing. A donate link that 404s is
   * worse than no donate link, so this stays blank until there is a real
   * page on the other end of it. Fill it in and the panel grows a footer;
   * leave it and nothing anywhere changes.
   */
  url: "https://donate.stripe.com/14A4gy11K2tybeD8Jc77O00",
  title: "Keep it in the air",
  why:
    "No ads, no accounts, nothing to buy — but there is a server behind this " +
    "and somebody pays for it. If you had a good flight, you can chip in.",
  action: "Buy me a coffee",
};

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
    name: "Rare nodes",
    what:
      "four of them, each standing in a tall column of white light. Fly through one and " +
      "your craft transforms for the rest of the session. No advantage — it just means " +
      "everyone can see you coming.",
  },
  {
    name: "The Beacon",
    what: "the spiked dome. It charges — faster with craft circling it — then opens. First one to reach the core takes it, and for twenty seconds their trail cuts anyone who touches it.",
  },
];
