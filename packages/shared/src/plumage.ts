import {
  DESERT,
  GREAT_LAKE,
  MESAS,
  OASIS,
  TERRAIN_BASE_Z,
  TERRAIN_SIZE,
  WATER_HEIGHT,
  terrainHeightAt,
} from "./terrain";

/**
 * The rare thing worth crossing the map for.
 *
 * Everything else out here is an increment: a core is twelve more trail, a
 * clip is somebody else's twelve. Nothing changes what you ARE. This does —
 * you pick one up and your craft is a different object for the rest of the
 * session, visible to everybody, and it never comes off.
 *
 * IT CHANGES NO NUMBERS, deliberately. Speed and length are already what
 * the whole game hands out, so a rare pickup granting either is just a
 * bigger core. What this grants is that you are unmistakable — which is
 * also its cost, because every other craft in the sky can now see exactly
 * where the trophy is. The prize and the risk are the same object, and
 * there is no balance to tune.
 *
 * THE TRAIL IS NOT TOUCHED. Colour is not decoration in this game, it is
 * the rulebook: `victim.colour === clipper.colour` decides who can cut whom
 * and the same test decides slipstream strength. Recolouring a trail would
 * make the sky lie about both. The craft carries no rule, so the craft is
 * what changes — which is what a mount is anyway.
 */

/** What a craft can become. 0 is an ordinary glider and is not in here. */
export const PLUMAGE = {
  NONE: 0,
  /** Burning. Sheds embers that fall away beneath it. */
  PHOENIX: 1,
  /** Clear faceted glass, refracting the world through itself. */
  PRISM: 2,
  /** A hole in the sky: matte black, lit only at its edges. */
  VOID: 3,
} as const;

export type PlumageId = (typeof PLUMAGE)[keyof typeof PLUMAGE];

/** The three that can be rolled. Chosen by the SERVER, never the client. */
export const PLUMAGE_FORMS: PlumageId[] = [
  PLUMAGE.PHOENIX,
  PLUMAGE.PRISM,
  PLUMAGE.VOID,
];

export const PLUMAGE_NAMES: Record<number, string> = {
  [PLUMAGE.PHOENIX]: "Phoenix",
  [PLUMAGE.PRISM]: "Prism",
  [PLUMAGE.VOID]: "Void",
};

export const PLUMAGE_NODE = {
  /**
   * Four in a sky two point eight kilometres across.
   *
   * Rare enough that seeing one is an event and two players will race for
   * it; not so rare that a player can fly for twenty minutes without ever
   * learning these exist. Four also means the map has more than one story
   * going on at once, which matters in a room of twenty-four.
   */
  count: 4,

  /**
   * Generous, like the cores and for the same reason — collection is swept
   * along the whole path flown each tick, but a target this important
   * should never be lost to a near miss at boost speed.
   */
  pickupRadius: 34,

  /**
   * Long. A node that came back quickly would make the transformation
   * ordinary, and ordinary is the one thing it must not be.
   */
  respawnMs: 150000,

  /**
   * Flown high, and higher than the cores.
   *
   * It has to be visible from a long way off — the whole idea is that you
   * see it across the map and decide to go — and a rare thing tucked into a
   * canyon is a rare thing nobody finds.
   */
  altitude: 150,
} as const;

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export interface PlumageSite {
  x: number;
  y: number;
  z: number;
}

let cached: PlumageSite[] | null = null;

/**
 * Where the four sit. Deterministic, for the reason the Beacon had to be:
 * a site rolled per client is a site every player sees somewhere different,
 * and they will each swear the others are flying at nothing.
 */
export function plumageSites(): PlumageSite[] {
  if (cached) return cached;

  const random = rng(0x9e3779b);
  const sites: PlumageSite[] = [];

  // Spread across the landmarks rather than scattered: these are
  // destinations, and a destination should be somewhere, not anywhere.
  const anchors = [
    { x: GREAT_LAKE.x, y: GREAT_LAKE.y },
    { x: DESERT.x, y: DESERT.y },
    { x: OASIS.x, y: OASIS.y },
    ...MESAS.map((m) => ({ x: m.x, y: m.y })),
  ];

  const reach = TERRAIN_SIZE * 0.34;

  for (let i = 0; i < PLUMAGE_NODE.count; i++) {
    const anchor = anchors[(i * 2 + 1) % anchors.length];
    const angle = random() * Math.PI * 2;
    const radius = 180 + random() * 220;
    let x = anchor.x + Math.cos(angle) * radius;
    let y = anchor.y + Math.sin(angle) * radius;

    // Keep them inside the world even if an anchor sits near its edge.
    const out = Math.hypot(x, y);
    if (out > reach) {
      x *= reach / out;
      y *= reach / out;
    }

    const ground = Math.max(terrainHeightAt(x, y), WATER_HEIGHT);
    sites.push({ x, y, z: TERRAIN_BASE_Z + ground + PLUMAGE_NODE.altitude });
  }

  cached = sites;
  return cached;
}
