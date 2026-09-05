import { terrainHeightAt, TERRAIN_BASE_Z, TERRAIN_SIZE, WATER_HEIGHT } from "./terrain";

/**
 * The Beacon, and what it is for.
 *
 * It was built as scenery — one enormous spiked dome, the only thing on the
 * map visible from anywhere, so a player always has something to orient by.
 * It worked as a landmark and then sat there, which is a waste of the most
 * conspicuous object in the world: everyone can see it, so everyone can be
 * told the same thing by it at the same moment.
 *
 * So it charges. Slowly on its own, and much faster with craft circling it,
 * which is the one thing in this game that asks players to be in the same
 * piece of sky on purpose. When it fills, it opens: the dome cracks, a core
 * hangs in the mouth of it, and the light shafts it already throws into the
 * sky go white. Everybody sees that from wherever they are.
 *
 * The first craft to reach the core takes it, and the Beacon shuts. One
 * winner, no consolation — the race has to be worth losing sleep over, and
 * a prize everyone gets is not a prize. What the loser gets instead is the
 * most valuable target in the sky to chase.
 */

/**
 * Where the Beacon stands.
 *
 * Deterministic and shared, like the terrain and the cores. It was
 * originally sited with Math.random inside a client component, which meant
 * every player saw it somewhere different — harmless while it was scenery
 * and fatal the moment it became a place to race to.
 */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export interface BeaconSite {
  x: number;
  y: number;
  /** Ground level under it, in world Z. */
  groundZ: number;
  /** Where the core hangs when the Beacon is open. */
  coreZ: number;
}

let cached: BeaconSite | null = null;

export function beaconSite(): BeaconSite {
  if (cached) return cached;

  const random = rng(20260905);

  // High, dry, and away from the middle, so it reads as a discovery rather
  // than as the place everybody starts.
  let best: { x: number; y: number; h: number } | null = null;
  for (let i = 0; i < 700; i++) {
    const a = random() * Math.PI * 2;
    const r = TERRAIN_SIZE * (0.14 + random() * 0.16);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    const h = terrainHeightAt(x, y);
    if (h < WATER_HEIGHT + 12) continue;
    if (!best || h > best.h) best = { x, y, h };
  }

  const site = best ?? { x: 0, y: 0, h: 40 };
  const groundZ = TERRAIN_BASE_Z + site.h;

  cached = {
    x: site.x,
    y: site.y,
    groundZ,
    // Clear of the dome and its spikes, and below cruising height, so
    // taking it always means committing to a dive.
    coreZ: groundZ + 96,
  };
  return cached;
}

export const BEACON = {
  /** Radius of the dome itself, for the renderer and for the site check. */
  domeRadius: 58,

  /** How long it takes to fill with nobody anywhere near it. */
  chargeSecondsAlone: 105,
  /**
   * Craft within this of the Beacon speed it up.
   *
   * This is the cooperative half, and the reason the number is generous:
   * players have to *choose* to gather, and a radius they can only hold by
   * flying in tight circles would make it a chore rather than a decision.
   */
  gatherRadius: 260,
  /** Each craft inside that radius adds this much of the base rate. */
  perPilotRate: 0.6,
  /** However big the crowd, it cannot fill faster than this. */
  maxRateMultiplier: 4.5,

  /** How long the core hangs there once it opens. */
  openMs: 14_000,
  /** How close you have to get to take it. */
  claimRadius: 30,
  /** After a claim, how long before it starts charging again. */
  cooldownMs: 25_000,
  /**
   * If nobody comes, it does not start from nothing — an ignored Beacon
   * should come back round quickly rather than punish a quiet room.
   */
  unclaimedCarry: 0.35,

  /** How long the winner keeps it. */
  overchargeMs: 20_000,
  /** Cores and shards are worth this much more while overcharged. */
  overchargeYield: 2,
} as const;
