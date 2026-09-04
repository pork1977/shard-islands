"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { generateProps } from "@/lib/world/generateProps";
import { TERRAIN_BASE_Z } from "@/lib/world/generateTerrain";

/**
 * Buildings and woodland, drawn as two InstancedMeshes — a couple of
 * thousand objects in two draw calls. Individual meshes at this count would
 * cost more in draw calls than the whole rest of the scene combined.
 */
export default function WorldProps() {
  const props = useMemo(() => generateProps(), []);
  const buildingsRef = useRef<THREE.InstancedMesh>(null);
  const treesRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 0, 1);
    const colour = new THREE.Color();

    const bm = buildingsRef.current;
    if (bm) {
      props.buildings.forEach((b, i) => {
        q.setFromAxisAngle(up, b.rot);
        // box origin is its centre, so lift by half the height to sit on ground
        pos.set(b.x, b.y, TERRAIN_BASE_Z + b.z + b.h / 2);
        scale.set(b.w, b.d, b.h);
        bm.setMatrixAt(i, m.compose(pos, q, scale));
        // warm roofs and pale walls, varied per building
        colour.setHSL(0.08 + b.shade * 0.07, 0.28 + b.shade * 0.2, 0.5 + b.shade * 0.25);
        bm.setColorAt(i, colour);
      });
      bm.instanceMatrix.needsUpdate = true;
      if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
      bm.computeBoundingSphere();
    }

    const tm = treesRef.current;
    if (tm) {
      props.trees.forEach((t, i) => {
        q.identity();
        pos.set(t.x, t.y, TERRAIN_BASE_Z + t.z + t.scale * 0.9);
        scale.set(t.scale * 0.62, t.scale * 0.62, t.scale * 1.9);
        tm.setMatrixAt(i, m.compose(pos, q, scale));
      });
      tm.instanceMatrix.needsUpdate = true;
      tm.computeBoundingSphere();
    }
  }, [props]);

  return (
    <group>
      <instancedMesh
        ref={buildingsRef}
        args={[undefined, undefined, props.buildings.length]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial />
      </instancedMesh>

      <instancedMesh
        ref={treesRef}
        args={[undefined, undefined, props.trees.length]}
        frustumCulled={false}
      >
        {/* cones: from the air a conifer canopy is all silhouette anyway */}
        <coneGeometry args={[1, 1, 6]} />
        <meshLambertMaterial color="#245c27" />
      </instancedMesh>
    </group>
  );
}
