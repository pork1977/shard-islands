/**
 * The height field, shared by the client that renders it and the server that
 * simulates against it.
 *
 * This used to live only in the web app, which was fine while the server did
 * nothing but relay positions. It cannot stay there now that the server
 * simulates authoritatively: the flight model stops the player sinking into
 * the ground, so a server without the same ground would fight the client
 * every time anyone skimmed a hill.
 *
 * Deliberately free of three.js — this is arithmetic, and the mesh built
 * from it stays in the web app.
 */

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
}

function fbm(x: number, y: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * freq, y * freq) * amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Doubling each side gives four times the area to fly over. The noise is
 * sampled in absolute world coordinates, so hills and valleys stay the same
 * physical size — the map gains more ground rather than the same ground
 * stretched.
 */
export const TERRAIN_SIZE = 2800;
/**
 * Deep enough below the glass to give the fall real distance to cover.
 *
 * Doubled from -560: the descent is where the player picks a landing and
 * gathers motes, and at the old depth it was over before either had really
 * begun. Everything in the world is placed relative to this, so the whole
 * landscape simply sits further down and flight is unchanged — the fall is
 * the only thing that gets longer.
 */
export const TERRAIN_BASE_Z = -930;
export const TERRAIN_MAX_HEIGHT = 105;
/** Standing water fills anything below this height. */
export const WATER_HEIGHT = 12;

/** Where the fall ends and flight begins — comfortably above the peaks. */
export const FLIGHT_ALTITUDE = TERRAIN_BASE_Z + TERRAIN_MAX_HEIGHT + 95;

/**
 * The two landmark regions are placed by hand, not found by a search.
 *
 * One large desert and one huge lake are composition decisions: they have to
 * sit far apart, well inside the flight boundary (TERRAIN_SIZE * 0.44), and
 * clear of the middle where the player lands. A search over noise gets the
 * geology right and the composition wrong, so these are coordinates.
 */
export const GREAT_LAKE = { x: -620, y: 420, radius: 380 };
export const DESERT = { x: 560, y: -470, radius: 430 };

/** The only water in the desert, and so the only green in it. */
export const OASIS = { x: DESERT.x - 130, y: DESERT.y + 60, radius: 74 };

/** Flat-topped rock: the desert's landmarks, and something to fly between. */
export const MESAS = [
  { x: DESERT.x + 175, y: DESERT.y - 120, radius: 92, height: 74 },
  { x: DESERT.x - 205, y: DESERT.y - 195, radius: 64, height: 58 },
  { x: DESERT.x + 35, y: DESERT.y + 215, radius: 74, height: 48 },
];

/** Islands standing in the great lake. The first is the big one. */
export const LAKE_ISLANDS = [
  { x: GREAT_LAKE.x + 55, y: GREAT_LAKE.y - 35, radius: 100, height: 44 },
  { x: GREAT_LAKE.x - 165, y: GREAT_LAKE.y + 110, radius: 58, height: 29 },
  { x: GREAT_LAKE.x + 175, y: GREAT_LAKE.y + 150, radius: 45, height: 23 },
  { x: GREAT_LAKE.x - 80, y: GREAT_LAKE.y + 215, radius: 34, height: 18 },
];

interface Region {
  x: number;
  y: number;
  radius: number;
}

/**
 * A circle with a noise-warped rim. A hard circle stamped on a map reads as
 * a decal; the warp is what makes the edge look like geography.
 */
function regionMask(
  x: number,
  y: number,
  region: Region,
  warpFreq: number,
  warpAmount: number,
  edge: number,
): number {
  const d = Math.hypot(x - region.x, y - region.y);
  const warp = (valueNoise(x * warpFreq + 19.3, y * warpFreq - 5.1) - 0.5) * warpAmount;
  return clamp01((region.radius - (d + warp)) / edge);
}

/**
 * The sand before the oasis is subtracted from it.
 *
 * The warp is deliberately small next to the radius, and the rim narrow: at
 * a warp of 250 over a 210-wide rim the region never reached full strength
 * anywhere, so the ground blended half sand and half grass across the whole
 * basin and read as sage rather than as a desert.
 */
function desertBaseAt(x: number, y: number): number {
  return regionMask(x, y, DESERT, 0.0034, 165, 130);
}

/** 0 outside, 1 in the deep sand. Already cut back around the oasis. */
export function desertAt(x: number, y: number): number {
  const sand = desertBaseAt(x, y);
  if (sand <= 0) return 0;
  // the oasis pushes the sand back, which is what puts a ring of green
  // around the water instead of sand running to the water's edge
  const green = clamp01((OASIS.radius * 2.1 - Math.hypot(x - OASIS.x, y - OASIS.y)) / 90);
  return clamp01(sand - green);
}

/** 0 outside, 1 in open water. */
export function lakeAt(x: number, y: number): number {
  return regionMask(x, y, GREAT_LAKE, 0.0042, 190, 150);
}

/** How far a point stands above the lake bed, in metres. */
function lakeIslandsAt(x: number, y: number): number {
  let rise = 0;
  for (const isle of LAKE_ISLANDS) {
    const d = Math.hypot(x - isle.x, y - isle.y);
    if (d > isle.radius) continue;
    // domed, with a rough shoulder so the shoreline is not a perfect circle
    const t = smooth(1 - d / isle.radius);
    rise += isle.height * t * (0.82 + valueNoise(x * 0.02, y * 0.02) * 0.36);
  }
  return rise;
}

/**
 * The single source of truth for ground height, in terrain-local units.
 *
 * The mesh is built from this, the flight controller samples it for ground
 * clearance, and the server's authoritative simulation samples the very same
 * function — deriving any of those separately guarantees they disagree.
 */
export function terrainHeightAt(x: number, y: number): number {
  // rolling continental shape, so the map has broad valleys and highlands
  const continental = fbm(x * 0.0022 + 11, y * 0.0022 - 7, 3);
  const detail = fbm(x * 0.011, y * 0.011, 4);

  // ridges only above a threshold, so lowlands stay open and flyable
  const ridge = Math.pow(Math.max(0, continental - 0.42) * 2.4, 1.6);

  // Normalised to 0..1 BEFORE scaling, so TERRAIN_MAX_HEIGHT is actually the
  // ceiling. Summing unbounded terms overshot it by more than threefold,
  // which put peaks above the altitude flight happens at and left the player
  // scraping through mountains that should have been well below them.
  const ridgeN = Math.min(1, ridge / 1.7);
  const rolling = continental * 0.6 + detail * 0.4;
  const t = Math.max(0, Math.min(1, rolling * 0.45 + ridgeN * 0.55));
  let h = t * TERRAIN_MAX_HEIGHT;

  // ---- the desert ---------------------------------------------------------
  const sand = desertBaseAt(x, y);
  if (sand > 0) {
    // Dunes run as long parallel ridges all facing the same way, because
    // that is what makes sand read as sand from the air. Isotropic noise
    // just looks like small hills that happen to be beige.
    const along = x * 0.92 + y * 0.39;
    const dunes =
      13 +
      Math.sin(along * 0.021 + fbm(x * 0.003, y * 0.003, 2) * 7) * 9 +
      fbm(x * 0.0055 + 40, y * 0.0055, 3) * 30;
    h = lerp(h, dunes, smooth(sand));

    for (const mesa of MESAS) {
      const d = Math.hypot(x - mesa.x, y - mesa.y);
      if (d > mesa.radius) continue;
      // steep sides, dead flat on top — the profile is the whole point
      const wall = 1 - smooth(clamp01((d - mesa.radius * 0.68) / (mesa.radius * 0.32)));
      h += mesa.height * wall * sand;
    }

    // dug below the waterline, so the world's water plane fills the oasis
    const pool = smooth(clamp01((OASIS.radius - Math.hypot(x - OASIS.x, y - OASIS.y)) / 46));
    h = lerp(h, 3.5, pool * sand);
  }

  // ---- the great lake -----------------------------------------------------
  const lake = lakeAt(x, y);
  if (lake > 0) {
    const bed = 1.5 + fbm(x * 0.008 + 3, y * 0.008 - 9, 2) * 6;
    h = lerp(h, bed, smooth(lake));
    h += lakeIslandsAt(x, y) * lake;
  }

  // Everything under the waterline is pushed further under it.
  //
  // A pond whose bed sits a few centimetres below the surface is two
  // near-coplanar sheets across its whole area, and no amount of depth
  // precision makes that stable — from altitude it crawls and flickers. The
  // cure is for shallow water to actually be deep. The shoreline itself is
  // the fixed point of this remap, so the coastline the eye reads does not
  // move; only the bed drops away beneath it.
  if (h < WATER_HEIGHT) {
    h = WATER_HEIGHT - (WATER_HEIGHT - h) * 2.4;
  }

  return h;
}
