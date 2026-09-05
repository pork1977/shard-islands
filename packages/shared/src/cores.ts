import {
  terrainHeightAt,
  TERRAIN_BASE_Z,
  TERRAIN_SIZE,
  GREAT_LAKE,
  DESERT,
  OASIS,
  MESAS,
  LAKE_ISLANDS,
  WATER_HEIGHT,
} from "./terrain";

/**
 * Energy Cores: the thing there is to do while flying.
 *
 * Laid out deterministically and shared, so the server never has to send
 * their positions — only which of them are currently there. Both sides
 * generate the identical list from the identical seed, the same trick the
 * terrain uses, and the wire carries one boolean per core instead of a
 * coordinate.
 *
 * Placement is half scattered and half gathered around the landmarks. An
 * even sprinkle over four square kilometres gives a player no reason to go
 * anywhere in particular; clusters give the map destinations, and put two
 * players who both want the same cluster in the same piece of sky, which is
 * where every interesting thing in this game is going to happen.
 */
export interface CoreSite {
  x: number;
  y: number;
  z: number;
  /** 0 loose, 1 part of a cluster — clusters are drawn a little richer. */
  clustered: number;
}

export const CORE_COUNT = 240;

/** Trail granted by one core. Worth roughly four motes caught on the way down. */
export const CORE_TRAIL_VALUE = 12;

/**
 * How close counts as collected.
 *
 * Deliberately far larger than the core looks. The visible core is three
 * and a half metres across a sky that is two point eight kilometres wide,
 * and asking someone to fly a point through it at fifty metres a second is
 * asking for a game of misses. The pickup is a soft bubble around the
 * pretty thing, not the pretty thing itself — and because collection is
 * swept along the whole path flown each tick rather than tested at the
 * endpoint, a boosted dive cannot skip straight over one either.
 */
export const CORE_PICKUP_RADIUS = 22;

/** How long a collected core takes to come back. */
export const CORE_RESPAWN_MS = 22000;

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

let cached: CoreSite[] | null = null;

/**
 * The core layout. Built once and shared; identical on every client and on
 * the server, because a core the server thinks is somewhere else is a core
 * players will swear they flew straight through.
 */
export function coreSites(): CoreSite[] {
  if (cached) return cached;

  const random = rng(90210);
  const sites: CoreSite[] = [];
  const reach = TERRAIN_SIZE * 0.4;

  /** Above the ground, below the altitude cruising happens at. */
  const place = (x: number, y: number, clustered: number) => {
    const ground = terrainHeightAt(x, y);
    // Nothing under the waterline: a core in a lake bed cannot be reached
    // without flying into the lake bed.
    const floor = Math.max(ground, WATER_HEIGHT) + 22;
    const z = TERRAIN_BASE_Z + floor + random() * 105;
    sites.push({ x, y, z, clustered });
  };

  // Clusters at everywhere worth going.
  const anchors = [
    { x: GREAT_LAKE.x, y: GREAT_LAKE.y, spread: 260 },
    { x: DESERT.x, y: DESERT.y, spread: 280 },
    { x: OASIS.x, y: OASIS.y, spread: 110 },
    ...MESAS.map((m) => ({ x: m.x, y: m.y, spread: 90 })),
    ...LAKE_ISLANDS.map((i) => ({ x: i.x, y: i.y, spread: 90 })),
  ];

  const clusteredCount = Math.round(CORE_COUNT * 0.45);
  for (let i = 0; i < clusteredCount; i++) {
    const anchor = anchors[i % anchors.length];
    const angle = random() * Math.PI * 2;
    const radius = Math.pow(random(), 0.6) * anchor.spread;
    place(anchor.x + Math.cos(angle) * radius, anchor.y + Math.sin(angle) * radius, 1);
  }

  // And the rest loose, so the space between destinations is not empty.
  while (sites.length < CORE_COUNT) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * reach;
    place(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
  }

  cached = sites;
  return cached;
}
