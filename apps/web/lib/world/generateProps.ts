import {
  terrainHeightAt,
  desertAt,
  TERRAIN_SIZE,
  WATER_HEIGHT,
  DESERT,
  OASIS,
  MESAS,
  LAKE_ISLANDS,
} from "./generateTerrain";

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
  /** 1 = sun-baked mud brick, for the outpost out in the sand. */
  adobe: number;
}

export interface TreeSpec {
  x: number;
  y: number;
  z: number;
  scale: number;
  tint: number;
}

/**
 * A tuft of grass, a clump of reeds, or a bush of desert scrub — all the
 * same thing to the renderer, which just draws crossed blades at a size and
 * a colour.
 */
export interface BladeSpec {
  x: number;
  y: number;
  z: number;
  scale: number;
  tint: number;
  rot: number;
}

/** One upright of a picket fence. */
export interface PicketSpec {
  x: number;
  y: number;
  z: number;
  rot: number;
  h: number;
}

/** A short horizontal run of fence rail, following the ground between posts. */
export interface RailSpec {
  x: number;
  y: number;
  z: number;
  rot: number;
  len: number;
}

export interface ScatterSpec {
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
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
  palms: ScatterSpec[];
  cacti: ScatterSpec[];
  rocks: ScatterSpec[];
  grass: BladeSpec[];
  reeds: BladeSpec[];
  pickets: PicketSpec[];
  rails: RailSpec[];
  roads: RoadSegment[];
  towns: [number, number][];
  city: CitySpec;
  /** Stands on the big island in the great lake. */
  lighthouse: { x: number; y: number; z: number };
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
 * A city, outlying towns, and the roads between them — plus everything that
 * lives at ground level: grass, reeds along the water, paddock fencing, and
 * the two landmark regions' own inhabitants (cactus and palm in the desert,
 * a lighthouse out in the lake).
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
    // a city in the middle of the sand is a story the rest of the map does
    // not support, and it would bulldoze the desert's silhouette from above
    if (desertAt(x, y) > 0.02) continue;
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

  const city: CitySpec = { cx, cy, radius: 330, block: 34 };

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
          adobe: 0,
        });
      }
    }
  }

  // ---- outlying towns -----------------------------------------------------
  // scaled with the map, or four times the area is just four times emptier
  const towns: [number, number][] = [[cx, cy]];
  let guard = 0;
  while (towns.length < 13 && guard++ < 9000) {
    const x = (random() * 2 - 1) * half;
    const y = (random() * 2 - 1) * half;
    if (!buildable(x, y, 0.16)) continue;
    if (desertAt(x, y) > 0.02) continue;
    if (towns.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < 300)) continue;
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
        adobe: 0,
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

  // ---- paddocks ------------------------------------------------------------
  // Fenced fields on the edge of each village. Fencing is the cheapest thing
  // that says "somebody works this ground" — buildings alone read as models
  // dropped on a hillside, whereas an enclosure implies the land is used.
  const pickets: PicketSpec[] = [];
  const rails: RailSpec[] = [];

  for (const [tx, ty] of towns.slice(1)) {
    const fields = 2 + Math.floor(random() * 3);
    for (let f = 0; f < fields; f++) {
      const a = random() * Math.PI * 2;
      const dist = 62 + random() * 78;
      const px = tx + Math.cos(a) * dist;
      const py = ty + Math.sin(a) * dist;
      if (!buildable(px, py, 0.13)) continue;

      const rot = random() * Math.PI;
      const halfW = 15 + random() * 15;
      const halfD = 11 + random() * 12;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      // corners in field-local space, walked in order
      const corners: [number, number][] = [
        [-halfW, -halfD],
        [halfW, -halfD],
        [halfW, halfD],
        [-halfW, halfD],
      ];

      // one side left open, so a field has a way in rather than being a box
      const gap = Math.floor(random() * 4);

      for (let s = 0; s < 4; s++) {
        if (s === gap) continue;
        const [ax, ay] = corners[s];
        const [bx, by] = corners[(s + 1) % 4];
        const len = Math.hypot(bx - ax, by - ay);
        const steps = Math.max(2, Math.round(len / 1.25));
        const sideRot = rot + Math.atan2(by - ay, bx - ax);

        for (let k = 0; k <= steps; k++) {
          const t = k / steps;
          const lx = ax + (bx - ax) * t;
          const ly = ay + (by - ay) * t;
          const wx = px + lx * cos - ly * sin;
          const wy = py + lx * sin + ly * cos;
          const h = terrainHeightAt(wx, wy);
          if (h < WATER_HEIGHT + 1) continue;
          pickets.push({
            x: wx,
            y: wy,
            z: h,
            rot: sideRot,
            // Taller than a real picket. At a true 1.2m a fence is a
            // one-pixel scratch from any altitude the game is played at,
            // and the point of it is to be seen from the air.
            h: 2.1 + random() * 0.6,
          });
        }

        // rails in short spans, each sitting on the ground under it
        const spans = Math.max(1, Math.round(len / 5));
        for (let k = 0; k < spans; k++) {
          const t = (k + 0.5) / spans;
          const lx = ax + (bx - ax) * t;
          const ly = ay + (by - ay) * t;
          const wx = px + lx * cos - ly * sin;
          const wy = py + lx * sin + ly * cos;
          const h = terrainHeightAt(wx, wy);
          if (h < WATER_HEIGHT + 1) continue;
          rails.push({ x: wx, y: wy, z: h, rot: sideRot, len: len / spans });
        }
      }
    }
  }

  // ---- woodland, now scenery rather than the whole map --------------------
  const trees: TreeSpec[] = [];
  for (let i = 0; i < 6000; i++) {
    const x = (random() * 2 - 1) * half * 1.3;
    const y = (random() * 2 - 1) * half * 1.3;
    const h = terrainHeightAt(x, y);
    if (h < WATER_HEIGHT + 4 || slopeAt(x, y) > 0.55) continue;
    // The desert earns its silhouette from the air by being the one place
    // with no canopy in it. A dilated mask keeps conifers off the fringe as
    // well, where sand is already showing through the grass.
    if (desertAt(x, y) > 0.06) continue;
    // keep clear of the city and the towns
    if (Math.hypot(cx - x, cy - y) < city.radius + 40) continue;
    if (towns.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < 110)) continue;
    trees.push({ x, y, z: h, scale: 3.4 + random() * 4.6, tint: random() });
  }

  // ---- ground cover --------------------------------------------------------
  // Reeds want the waterline, which is a thin band: rejection-sampling the
  // whole map to find it wastes tens of thousands of height lookups. A
  // coarse pass finds the shoreline cells once, then the reeds are scattered
  // inside them.
  const reeds: BladeSpec[] = [];
  const shoreStep = 15;
  const shoreReach = half * 1.32;
  const shoreCells: [number, number][] = [];
  for (let x = -shoreReach; x <= shoreReach; x += shoreStep) {
    for (let y = -shoreReach; y <= shoreReach; y += shoreStep) {
      const h = terrainHeightAt(x, y);
      if (h > WATER_HEIGHT - 4.5 && h < WATER_HEIGHT + 3.5) shoreCells.push([x, y]);
    }
  }

  for (const [sx, sy] of shoreCells) {
    const clump = 1 + Math.floor(random() * 3);
    for (let i = 0; i < clump; i++) {
      const x = sx + (random() - 0.5) * shoreStep;
      const y = sy + (random() - 0.5) * shoreStep;
      const h = terrainHeightAt(x, y);
      if (h > WATER_HEIGHT + 3.2 || h < WATER_HEIGHT - 5) continue;
      reeds.push({
        x,
        y,
        z: h,
        // tall enough to stand clear of the water they are standing in
        scale: 4.2 + random() * 3.6,
        tint: random(),
        rot: random() * Math.PI,
      });
    }
  }

  // Grass everywhere else, in clumps rather than as evenly spread singles.
  //
  // Density is the whole problem here. Ground cover at anything like a real
  // spacing would be millions of tufts across fourteen square kilometres,
  // and an affordable number spread evenly is one blade every twelve metres,
  // which reads as nothing at all. Clumping spends the same budget on fewer,
  // denser patches, so what the player actually skims over has something in
  // it — and the distance fade in the material means only the patches within
  // about a hundred metres are ever drawn.
  const grass: BladeSpec[] = [];
  for (let i = 0; i < 10500; i++) {
    const x = (random() * 2 - 1) * half * 1.34;
    const y = (random() * 2 - 1) * half * 1.34;
    const h = terrainHeightAt(x, y);
    if (h < WATER_HEIGHT + 1.2) continue;
    // bare rock and snow up top, paving in the middle of town
    if (h > 74) continue;
    if (Math.hypot(cx - x, cy - y) < city.radius * 0.8) continue;

    const sand = desertAt(x, y);
    const scrub = sand > 0.25;
    // dry scrub only out in the sand, and thinly: the desert has to read as
    // empty by contrast with everywhere else
    if (scrub && random() > 0.2) continue;

    const clump = scrub ? 2 + Math.floor(random() * 2) : 3 + Math.floor(random() * 4);
    for (let k = 0; k < clump; k++) {
      grass.push({
        x: x + (random() - 0.5) * 5.5,
        y: y + (random() - 0.5) * 5.5,
        // the clump shares one height sample; over five metres of ground the
        // error is smaller than the sinking the blades want anyway
        z: h - 0.35,
        scale: scrub ? 2.2 + random() * 2.0 : 2.4 + random() * 2.8,
        tint: scrub ? 1 : random() * 0.55,
        rot: random() * Math.PI,
      });
    }
  }

  // ---- the desert's own inhabitants ---------------------------------------
  const cacti: ScatterSpec[] = [];
  for (let i = 0; i < 2200; i++) {
    const x = DESERT.x + (random() * 2 - 1) * DESERT.radius;
    const y = DESERT.y + (random() * 2 - 1) * DESERT.radius;
    if (desertAt(x, y) < 0.4) continue;
    const h = terrainHeightAt(x, y);
    if (h < WATER_HEIGHT + 4) continue;
    if (slopeAt(x, y) > 0.32) continue; // not on the mesa walls
    if (cacti.length >= 300) break;
    cacti.push({
      x,
      y,
      z: h,
      scale: 1.7 + random() * 1.9,
      rot: random() * Math.PI * 2,
      tint: random(),
    });
  }

  const rocks: ScatterSpec[] = [];
  for (let i = 0; i < 3000; i++) {
    const x = DESERT.x + (random() * 2 - 1) * DESERT.radius * 1.1;
    const y = DESERT.y + (random() * 2 - 1) * DESERT.radius * 1.1;
    if (desertAt(x, y) < 0.25) continue;
    const h = terrainHeightAt(x, y);
    if (h < WATER_HEIGHT + 2) continue;
    if (rocks.length >= 420) break;
    // boulders gather at the foot of the mesas, where they fell from
    const nearMesa = MESAS.some(
      (m) => Math.hypot(m.x - x, m.y - y) < m.radius * 1.45,
    );
    if (!nearMesa && random() > 0.35) continue;
    rocks.push({
      x,
      y,
      z: h,
      scale: nearMesa ? 2.2 + random() * 5.5 : 1.4 + random() * 2.6,
      rot: random() * Math.PI * 2,
      tint: random(),
    });
  }

  // palms ringing the oasis, thickest right at the water
  const palms: ScatterSpec[] = [];
  for (let i = 0; i < 900; i++) {
    const a = random() * Math.PI * 2;
    const r = OASIS.radius * (0.95 + Math.pow(random(), 1.6) * 1.1);
    const x = OASIS.x + Math.cos(a) * r;
    const y = OASIS.y + Math.sin(a) * r;
    const h = terrainHeightAt(x, y);
    if (h < WATER_HEIGHT + 0.5 || h > WATER_HEIGHT + 16) continue;
    if (palms.length >= 70) break;
    palms.push({
      x,
      y,
      z: h,
      scale: 5.5 + random() * 4,
      rot: random() * Math.PI * 2,
      tint: random(),
    });
  }

  // an outpost on the dry side of the oasis: flat-roofed mud brick
  const outpostX = OASIS.x + 118;
  const outpostY = OASIS.y - 74;
  for (let i = 0; i < 60; i++) {
    const a = random() * Math.PI * 2;
    const r = Math.pow(random(), 0.7) * 44;
    const x = outpostX + Math.cos(a) * r;
    const y = outpostY + Math.sin(a) * r;
    const h = terrainHeightAt(x, y);
    if (h < WATER_HEIGHT + 3 || slopeAt(x, y) > 0.3) continue;
    const w = 6 + random() * 7;
    buildings.push({
      x,
      y,
      z: h,
      w,
      d: w * (0.8 + random() * 0.5),
      h: 5 + random() * 7,
      rot: random() * Math.PI,
      shade: random(),
      pitched: 0,
      adobe: 1,
    });
  }

  // ---- the lake's landmark -------------------------------------------------
  const isle = LAKE_ISLANDS[0];
  const lighthouse = {
    x: isle.x + 14,
    y: isle.y - 8,
    z: terrainHeightAt(isle.x + 14, isle.y - 8),
  };

  return {
    buildings,
    trees,
    palms,
    cacti,
    rocks,
    grass,
    reeds,
    pickets,
    rails,
    roads,
    towns,
    city,
    lighthouse,
  };
}

/**
 * The world is generated twice — once for the props, once for the roads and
 * city footprint the terrain shader paints — and both happen at the moment
 * the pane breaks. Generating it once and handing out the same object keeps
 * that moment free of a second full pass over the height field.
 */
let cached: PropsSpec | null = null;

export function getProps(): PropsSpec {
  if (!cached) cached = generateProps();
  return cached;
}
