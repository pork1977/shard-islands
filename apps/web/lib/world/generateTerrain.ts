import * as THREE from "three";
import { desertAt, lakeAt, terrainHeightAt, TERRAIN_SIZE } from "@shard-islands/shared";

/**
 * The terrain MESH.
 *
 * The height field itself moved to the shared package once the server began
 * simulating against it — the flight model holds the craft above the ground,
 * so a server with its own idea of where the ground is would fight the
 * client on every hill. Everything geometric stays here; the arithmetic is
 * shared.
 *
 * Re-exported below so the rest of the app can keep importing terrain facts
 * from the module it always did.
 */
export {
  terrainHeightAt,
  desertAt,
  lakeAt,
  TERRAIN_SIZE,
  TERRAIN_BASE_Z,
  TERRAIN_MAX_HEIGHT,
  WATER_HEIGHT,
  FLIGHT_ALTITUDE,
  GREAT_LAKE,
  DESERT,
  OASIS,
  MESAS,
  LAKE_ISLANDS,
} from "@shard-islands/shared";

export interface TerrainData {
  geometry: THREE.BufferGeometry;
}

/**
 * Segments raised with the map, but not proportionally: matching the old
 * density on four times the area would be ~145k quads, which is more than
 * the mobile budget can carry for scenery that is mostly seen from height.
 */
export function generateTerrain(segments = 300): TerrainData {
  const geometry = new THREE.PlaneGeometry(
    TERRAIN_SIZE,
    TERRAIN_SIZE,
    segments,
    segments,
  );
  const position = geometry.attributes.position as THREE.BufferAttribute;

  // The desert and the lake reach the shader as vertex attributes rather
  // than being recomputed in GLSL. Their masks are noise-warped, and a
  // reimplementation in a second language is a standing invitation for the
  // sand the eye sees and the sand the generator plants cactuses in to
  // drift apart.
  const desert = new Float32Array(position.count);
  const lake = new Float32Array(position.count);

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    position.setZ(i, terrainHeightAt(x, y));
    desert[i] = desertAt(x, y);
    lake[i] = lakeAt(x, y);
  }

  geometry.setAttribute("aDesert", new THREE.BufferAttribute(desert, 1));
  geometry.setAttribute("aLake", new THREE.BufferAttribute(lake, 1));
  geometry.computeVertexNormals();
  return { geometry };
}

/**
 * Built once and shared. The mesh is 90k vertices of height-field sampling,
 * and it is asked for at the instant the pane breaks — the same instant the
 * props are generated — so this is memoised and prewarmed rather than
 * rebuilt per mount.
 */
let cachedTerrain: TerrainData | null = null;

export function getTerrain(): TerrainData {
  if (!cachedTerrain) cachedTerrain = generateTerrain();
  return cachedTerrain;
}
