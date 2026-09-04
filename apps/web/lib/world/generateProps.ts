import { terrainHeightAt, TERRAIN_SIZE, WATER_HEIGHT } from "./generateTerrain";

export interface BuildingSpec {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rot: number;
  shade: number;
}

export interface TreeSpec {
  x: number;
  y: number;
  z: number;
  scale: number;
}

/** Roads are drawn by the terrain shader, so they are just segments. */
export type RoadSegment = [number, number, number, number];

export interface PropsSpec {
  buildings: BuildingSpec[];
  trees: TreeSpec[];
  roads: RoadSegment[];
  towns: [number, number][];
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Slope from finite differences of the same height field the mesh uses. */
function slopeAt(x: number, y: number): number {
  const d = 6;
  const hx = terrainHeightAt(x + d, y) - terrainHeightAt(x - d, y);
  const hy = terrainHeightAt(x, y + d) - terrainHeightAt(x, y - d);
  return Math.hypot(hx, hy) / (2 * d);
}

/**
 * Settlements, woodland and the roads between them.
 *
 * Landmarks are what turn scenery into a map: without buildings and roads
 * there is nowhere to aim for on the way down and no sense of scale in the
 * air. Everything is placed against the SAME height function the terrain
 * mesh is built from, so nothing floats or sinks.
 */
export function generateProps(seed = 24601): PropsSpec {
  const random = rng(seed);
  const half = TERRAIN_SIZE * 0.34;

  const towns: [number, number][] = [];
  const buildings: BuildingSpec[] = [];

  // find buildable ground: above the waterline, not on a cliff
  let guard = 0;
  while (towns.length < 7 && guard++ < 4000) {
    const x = (random() * 2 - 1) * half;
    const y = (random() * 2 - 1) * half;
    const h = terrainHeightAt(x, y);
    if (h < WATER_HEIGHT + 6) continue;
    if (slopeAt(x, y) > 0.16) continue;
    // keep towns apart so they read as separate places
    if (towns.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < 190)) continue;
    towns.push([x, y]);
  }

  for (const [tx, ty] of towns) {
    const count = 10 + Math.floor(random() * 16);
    const spread = 24 + random() * 30;
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2;
      const r = Math.pow(random(), 0.7) * spread;
      const x = tx + Math.cos(a) * r;
      const y = ty + Math.sin(a) * r;
      const h = terrainHeightAt(x, y);
      if (h < WATER_HEIGHT + 3) continue;
      if (slopeAt(x, y) > 0.28) continue;

      const w = 5 + random() * 9;
      buildings.push({
        x,
        y,
        z: h,
        w,
        d: w * (0.7 + random() * 0.7),
        h: 6 + random() * 16,
        rot: random() * Math.PI,
        shade: random(),
      });
    }
  }

  // roads linking each town to the next, forming a rough network
  const roads: RoadSegment[] = [];
  for (let i = 0; i < towns.length; i++) {
    const a = towns[i];
    const b = towns[(i + 1) % towns.length];
    roads.push([a[0], a[1], b[0], b[1]]);
  }

  // woodland, thinning near the towns so the settlements stay readable
  const trees: TreeSpec[] = [];
  for (let i = 0; i < 2600; i++) {
    const x = (random() * 2 - 1) * half * 1.25;
    const y = (random() * 2 - 1) * half * 1.25;
    const h = terrainHeightAt(x, y);
    if (h < WATER_HEIGHT + 4) continue;
    if (slopeAt(x, y) > 0.5) continue;
    if (towns.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < 55)) continue;
    trees.push({ x, y, z: h, scale: 3.2 + random() * 4.4 });
  }

  return { buildings, trees, roads, towns };
}
