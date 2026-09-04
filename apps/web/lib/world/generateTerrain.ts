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

/** Ridged fbm — sharp crests rather than rolling hills, to suit crystal. */
function ridged(x: number, y: number, octaves = 5): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(x * freq, y * freq);
    const r = 1 - Math.abs(n * 2 - 1);
    sum += r * r * amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum;
}

export interface TerrainData {
  geometry: THREE.BufferGeometry;
  size: number;
  maxHeight: number;
}

/**
 * The land below — the thing that turns a scatter of floating rocks into a
 * map you are flying over. Without a ground plane there is no sense of
 * place, scale or direction, which is what "no world shown" amounts to.
 *
 * Built in the XY plane with height along +Z, matching this world's
 * convention (the glass floor was looked down through along -Z).
 */
export function generateTerrain(size = 520, segments = 108): TerrainData {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  const position = geometry.attributes.position as THREE.BufferAttribute;

  const maxHeight = 62;

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);

    const continental = valueNoise(x * 0.004 + 11, y * 0.004 - 7);
    const peaks = ridged(x * 0.012, y * 0.012);

    // basins in the middle of the map, ridges around them
    let h = peaks * continental * maxHeight;
    h -= continental * 8;

    position.setZ(i, h);
  }

  const faceted = geometry.toNonIndexed();
  faceted.computeVertexNormals();
  geometry.dispose();

  return { geometry: faceted, size, maxHeight };
}
