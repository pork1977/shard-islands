import { generateIsland } from "./generateIsland";
import type * as THREE from "three";

export interface IslandSpec {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  seed: number;
  /** Vein/fall colour — the field is polychrome, not all one cyan. */
  hue: string;
  /** Neon fluid pouring off the rim, as [angle, length] pairs. */
  falls: [number, number][];
}

/**
 * Neon palette for the island veins. Cyan alone made the world monochrome;
 * spreading hues across the field is most of what makes it read as vibrant.
 */
const VEIN_PALETTE = [
  "#4fe0ff", // cyan
  "#ff5fd2", // magenta
  "#9d6bff", // violet
  "#3fffd0", // teal
  "#ffcc55", // amber, used sparingly as a warm accent
  "#4fe0ff",
  "#ff5fd2",
];

export interface MirrorSpec {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number];
  spin: number;
  tint: string;
}

export interface WorldSpec {
  islands: IslandSpec[];
  mirrors: MirrorSpec[];
}

function rand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Lays out the island field through the depth the camera falls into.
 *
 * Generated up front, while the landing screen is still showing, rather than
 * when the world is first displayed — the whole premise forbids a hitch at
 * the moment the floor gives way.
 */
export function generateWorld(seed = 1337): WorldSpec {
  const random = rand(seed);
  const islands: IslandSpec[] = [];

  const COUNT = 15;
  for (let i = 0; i < COUNT; i++) {
    // Spread down the fall axis, holding a clear corridor around it. The
    // camera plunges to roughly z -34, so islands must stand off to the sides
    // there or it simply ends up inside one with rock filling the frame.
    const depth = -34 - (i / COUNT) * 110 - random() * 9;
    const angle = random() * Math.PI * 2;
    const radius = 7 + random() * 15;

    const scale = 1.8 + random() * 4.0;
    const fallCount = Math.floor(random() * 3);
    const falls: [number, number][] = [];
    for (let f = 0; f < fallCount; f++) {
      falls.push([random() * Math.PI * 2, 3 + random() * 7]);
    }

    islands.push({
      geometry: generateIsland(random() * 10, 1),
      position: [Math.cos(angle) * radius, Math.sin(angle) * radius * 0.7, depth],
      rotation: [random() * 0.5 - 0.25, random() * Math.PI * 2, random() * 0.4 - 0.2],
      scale,
      seed: random() * 10,
      hue: VEIN_PALETTE[Math.floor(random() * VEIN_PALETTE.length)],
      falls,
    });
  }

  // The underside of the glass floor the player just came through, drifting
  // as huge mirror fragments — the kaleidoscope layer from the world design.
  const mirrors: MirrorSpec[] = [];
  for (let i = 0; i < 7; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 8 + random() * 16;
    mirrors.push({
      position: [
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.8,
        -18 - random() * 60,
      ],
      rotation: [random() * Math.PI, random() * Math.PI, random() * Math.PI],
      scale: [4 + random() * 9, 4 + random() * 9],
      spin: (random() - 0.5) * 0.12,
      tint: VEIN_PALETTE[Math.floor(random() * VEIN_PALETTE.length)],
    });
  }

  return { islands, mirrors };
}
