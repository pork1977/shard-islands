import * as THREE from "three";

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

export const TERRAIN_SIZE = 1400;
/** Deep enough below the glass to give the fall real distance to cover. */
export const TERRAIN_BASE_Z = -560;
export const TERRAIN_MAX_HEIGHT = 105;
/** Standing water fills anything below this height. */
export const WATER_HEIGHT = 12;

/** Where the fall ends and flight begins — comfortably above the peaks. */
export const FLIGHT_ALTITUDE = TERRAIN_BASE_Z + TERRAIN_MAX_HEIGHT + 95;

/**
 * The single source of truth for ground height, in terrain-local units.
 *
 * Exported because the flight controller has to sample the SAME surface the
 * mesh was built from — deriving the collision surface separately guarantees
 * the player clips through hills or floats above them.
 */
export function terrainHeightAt(x: number, y: number): number {
  // rolling continental shape, so the map has broad valleys and highlands
  const continental = fbm(x * 0.0022 + 11, y * 0.0022 - 7, 3);
  const detail = fbm(x * 0.011, y * 0.011, 4);

  // ridges only above a threshold, so lowlands stay open and flyable
  const ridge = Math.pow(Math.max(0, continental - 0.42) * 2.4, 1.6);

  // relief pushed hard: seen from flying altitude, gentle undulation reads as
  // a flat plain, and the map needs recognisable hills and valleys
  let h = (continental * 0.5 + detail * 0.45) * TERRAIN_MAX_HEIGHT * 0.8;
  h += ridge * TERRAIN_MAX_HEIGHT * 1.5;
  return h;
}

export interface TerrainData {
  geometry: THREE.BufferGeometry;
}

export function generateTerrain(segments = 190): TerrainData {
  const geometry = new THREE.PlaneGeometry(
    TERRAIN_SIZE,
    TERRAIN_SIZE,
    segments,
    segments,
  );
  const position = geometry.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i < position.count; i++) {
    position.setZ(i, terrainHeightAt(position.getX(i), position.getY(i)));
  }

  geometry.computeVertexNormals();
  return { geometry };
}
