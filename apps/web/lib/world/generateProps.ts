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
  /** 0 = flat roof (urban block), 1 = pitched roof (house) */
  pitched: number;
}

export interface TreeSpec {
  x: number;
  y: number;
  z: number;
  scale: number;
  tint: number;
}

export type RoadSegment = [number, number, number, number];

export interface CitySpec {
  cx: number;
  cy: number;
  radius: number;
  block: number;
}

export interface PropsSpec {
  buildings: BuildingSpec[];
  trees: TreeSpec[];
  roads: RoadSegment[];
  towns: [number, number][];
  city: CitySpec;
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function slopeAt(x: number, y: number): number {
  const d = 6;
  const hx = terrainHeightAt(x + d, y) - terrainHeightAt(x - d, y);
  const hy = terrainHeightAt(x, y + d) - terrainHeightAt(x, y - d);
  return Math.hypot(hx, hy) / (2 * d);
}

function buildable(x: number, y: number, maxSlope = 0.2): boolean {
  return terrainHeightAt(x, y) > WATER_HEIGHT + 5 && slopeAt(x, y) < maxSlope;
}

/**
 * A city, outlying towns, and the roads between them.
 *
 * The map previously read as woodland with a few huts in it. This flips the
 * balance: a dense urban core laid out on a street grid with tall blocks,
 * smaller towns around it, and woodland pushed out to the margins as
 * scenery rather than as the dominant feature.
 */
export function generateProps(seed = 24601): PropsSpec {
  const random = rng(seed);
  const half = TERRAIN_SIZE * 0.34;

  const buildings: BuildingSpec[] = [];

  // ---- the city -----------------------------------------------------------
  // find a broad, gentle area big enough to justify a downtown
  let cx = 0;
  let cy = 0;
  let best = -1;
  for (let i = 0; i < 900; i++) {
    const x = (random() * 2 - 1) * half * 0.7;
    const y = (random() * 2 - 1) * half * 0.7;
    if (!buildable(x, y, 0.1)) continue;
    // score by how much of the surrounding area is also gentle and dry
    let score = 0;
    for (let s = 0; s < 12; s++) {
      const a = (s / 12) * Math.PI * 2;
      const px = x + Math.cos(a) * 90;
      const py = y + Math.sin(a) * 90;
      if (buildable(px, py, 0.16)) score++;
    }
    if (score > best) {
      best = score;
      cx = x;
      cy = y;
    }
  }

  const city: CitySpec = { cx, cy, radius: 210, block: 34 };

  // blocks on a grid, with the streets between them left clear
  const blocks = Math.ceil((city.radius * 2) / city.block);
  for (let bx = 0; bx < blocks; bx++) {
    for (let by = 0; by < blocks; by++) {
      const gx = cx - city.radius + bx * city.block + city.block * 0.5;
      const gy = cy - city.radius + by * city.block + city.block * 0.5;
      const fromCentre = Math.hypot(gx - cx, gy - cy);
      if (fromCentre > city.radius) continue;
      if (!buildable(gx, gy, 0.3)) continue;

      // downtown is tall and dense, the outskirts low and sparse
      const urban = 1 - fromCentre / city.radius;
      if (random() > 0.35 + urban * 0.6) continue;

      const perBlock = urban > 0.55 ? 1 : 1 + Math.floor(random() * 2);
      for (let k = 0; k < perBlock; k++) {
        const jitter = city.block * 0.22;
        const x = gx + (random() - 0.5) * jitter;
        const y = gy + (random() - 0.5) * jitter;
        const h = terrainHeightAt(x, y);
        if (h < WATER_HEIGHT + 3) continue;

        const footprint =
          urban > 0.55 ? 9 + random() * 9 : 6 + random() * 7;
        const height =
          urban > 0.55
            ? 22 + random() * random() * 95 // a few real towers
            : 8 + random() * 18;

        buildings.push({
          x,
          y,
          z: h,
          w: footprint,
          d: footprint * (0.75 + random() * 0.5),
          h: height,
          rot: 0, // aligned to the grid, which is what makes it read as a city
          shade: random(),
          pitched: 0,
        });
      }
    }
  }

  // ---- outlying towns -----------------------------------------------------
  const towns: [number, number][] = [[cx, cy]];
  let guard = 0;
  while (towns.length < 6 && guard++ < 4000) {
    const x = (random() * 2 - 1) * half;
    const y = (random() * 2 - 1) * half;
    if (!buildable(x, y, 0.16)) continue;
    if (towns.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < 260)) continue;
    towns.push([x, y]);
  }

  for (const [tx, ty] of towns.slice(1)) {
    const count = 16 + Math.floor(random() * 22);
    const spread = 40 + random() * 46;
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2;
      const r = Math.pow(random(), 0.7) * spread;
      const x = tx + Math.cos(a) * r;
      const y = ty + Math.sin(a) * r;
      const h = terrainHeightAt(x, y);
      if (h < WATER_HEIGHT + 3 || slopeAt(x, y) > 0.3) continue;

      const w = 6 + random() * 8;
      buildings.push({
        x,
        y,
        z: h,
        w,
        d: w * (0.7 + random() * 0.6),
        h: 7 + random() * 12,
        rot: random() * Math.PI,
        shade: random(),
        pitched: 1,
      });
    }
  }

  // A road NETWORK rather than spokes from one hub: every town joins the
  // city and also its nearest neighbour, so the map has cross-country routes
  // running through it instead of a star.
  const roads: RoadSegment[] = [];
  for (let i = 1; i < towns.length; i++) {
    roads.push([towns[0][0], towns[0][1], towns[i][0], towns[i][1]]);

    let nearest = -1;
    let nearestD = Infinity;
    for (let j = 1; j < towns.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(towns[i][0] - towns[j][0], towns[i][1] - towns[j][1]);
      if (d < nearestD) {
        nearestD = d;
        nearest = j;
      }
    }
    if (nearest > 0 && nearest > i) {
      roads.push([towns[i][0], towns[i][1], towns[nearest][0], towns[nearest][1]]);
    }
  }

  // ---- woodland, now scenery rather than the whole map --------------------
  const trees: TreeSpec[] = [];
  for (let i = 0; i < 1500; i++) {
    const x = (random() * 2 - 1) * half * 1.3;
    const y = (random() * 2 - 1) * half * 1.3;
    const h = terrainHeightAt(x, y);
    if (h < WATER_HEIGHT + 4 || slopeAt(x, y) > 0.55) continue;
    // keep clear of the city and the towns
    if (Math.hypot(cx - x, cy - y) < city.radius + 40) continue;
    if (towns.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < 110)) continue;
    trees.push({ x, y, z: h, scale: 3.4 + random() * 4.6, tint: random() });
  }

  return { buildings, trees, roads, towns, city };
}
