import * as THREE from "three";

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** Smooth-ish value noise over a direction vector, enough to rough up a silhouette. */
function lumpiness(x: number, y: number, z: number, freq: number): number {
  return (
    hash3(x * freq, y * freq, z * freq) * 0.6 +
    hash3(x * freq * 2.3 + 11, y * freq * 2.3, z * freq * 2.3) * 0.3 +
    hash3(x * freq * 4.7, y * freq * 4.7 + 7, z * freq * 4.7) * 0.1
  );
}

/**
 * A floating crystalline island: broad plateau on top, tapering to a long
 * spike beneath, faceted rather than smooth.
 *
 * Built procedurally rather than loaded as a model — the whole project has
 * no external art pipeline yet, and a subdivided icosahedron pushed around
 * by noise gives the angular crystal silhouette the world design calls for
 * at a couple of hundred triangles apiece.
 */
export function generateIsland(seed: number, detail = 1): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const position = geometry.attributes.position as THREE.BufferAttribute;

  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).normalize();

    // Low frequency and high amplitude: gentle high-frequency noise just
    // makes a sphere look bumpy, whereas big irregular chunks give the
    // angular, broken-off silhouette a crystal shard needs.
    const n = lumpiness(v.x + seed, v.y + seed * 1.7, v.z - seed, 1.05);

    let r = 0.62 + n * 0.78;

    // flatten the upper surface into a plateau you could land on
    if (v.y > 0) r *= 1 - v.y * 0.62;
    // and draw the underside down into a long spike
    if (v.y < 0) r *= 1 + Math.pow(-v.y, 1.9) * 3.4;

    // squash across one horizontal axis so they aren't all round in plan
    position.setXYZ(i, v.x * r * (0.75 + (seed % 1) * 0.5), v.y * r * 0.78, v.z * r);
  }

  // non-indexed + recomputed normals = flat facets, which is what makes it
  // read as cut crystal rather than a smooth blob
  const faceted = geometry.toNonIndexed();
  faceted.computeVertexNormals();
  geometry.dispose();

  // Barycentric coordinates per triangle, so the shader can measure distance
  // to the nearest facet edge and run the glowing seams along them. Noise
  // alone gives organic blotches — veins that follow the actual crystal
  // facets are what make it read as cut mineral.
  const triCount = faceted.attributes.position.count / 3;
  const bary = new Float32Array(triCount * 9);
  for (let t = 0; t < triCount; t++) {
    bary.set([1, 0, 0, 0, 1, 0, 0, 0, 1], t * 9);
  }
  faceted.setAttribute("aBary", new THREE.BufferAttribute(bary, 3));

  return faceted;
}
