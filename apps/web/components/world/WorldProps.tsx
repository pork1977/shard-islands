"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { generateProps } from "@/lib/world/generateProps";
import { TERRAIN_BASE_Z } from "@/lib/world/generateTerrain";
import { applyBuildingWindows } from "@/lib/shaders/buildingWindows";

/**
 * Buildings and woodland.
 *
 * Everything is instanced — five meshes for several thousand objects. A
 * single cone read as a paper triangle and a bare box as a crate, so a tree
 * is now trunk plus two foliage tiers, and a building is a body plus a
 * separate roof. That is the cheapest silhouette change that stops them
 * reading as primitives.
 */
export default function WorldProps() {
  const props = useMemo(() => generateProps(), []);

  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const roofRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const canopyLowRef = useRef<THREE.InstancedMesh>(null);
  const canopyTopRef = useRef<THREE.InstancedMesh>(null);

  const pitched = useMemo(
    () => props.buildings.filter((b) => b.pitched === 1),
    [props],
  );

  const wallMaterial = useMemo(() => {
    const m = new THREE.MeshLambertMaterial();
    applyBuildingWindows(m);
    return m;
  }, []);

  // Cones and cylinders are built along +Y in three.js, but this world's up
  // axis is +Z — without rotating the geometry itself, every tree and roof
  // lies on its side.
  const geo = useMemo(() => {
    const toZUp = (g: THREE.BufferGeometry) => {
      g.rotateX(Math.PI / 2);
      return g;
    };
    return {
      roof: toZUp(new THREE.ConeGeometry(0.72, 1, 4)),
      trunk: toZUp(new THREE.CylinderGeometry(0.7, 1, 1, 5)),
      canopy: toZUp(new THREE.ConeGeometry(1, 1, 7)),
    };
  }, []);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 0, 1);
    const colour = new THREE.Color();

    const body = bodyRef.current;
    if (body) {
      props.buildings.forEach((b, i) => {
        q.setFromAxisAngle(up, b.rot);
        pos.set(b.x, b.y, TERRAIN_BASE_Z + b.z + b.h / 2);
        scale.set(b.w, b.d, b.h);
        body.setMatrixAt(i, m.compose(pos, q, scale));
        // concrete and glass in town, warmer render out in the villages
        if (b.pitched === 1) {
          colour.setHSL(0.09 + b.shade * 0.05, 0.22, 0.62 + b.shade * 0.2);
        } else {
          colour.setHSL(0.58 + b.shade * 0.08, 0.1 + b.shade * 0.12, 0.42 + b.shade * 0.3);
        }
        body.setColorAt(i, colour);
      });
      body.instanceMatrix.needsUpdate = true;
      if (body.instanceColor) body.instanceColor.needsUpdate = true;
      body.computeBoundingSphere();
    }

    const roof = roofRef.current;
    if (roof) {
      pitched.forEach((b, i) => {
        // cone has 4 sides, rotated 45° so it sits square on the box below
        q.setFromAxisAngle(up, b.rot + Math.PI / 4);
        pos.set(b.x, b.y, TERRAIN_BASE_Z + b.z + b.h + b.w * 0.22);
        scale.set(b.w * 0.78, b.d * 0.78, b.w * 0.45);
        roof.setMatrixAt(i, m.compose(pos, q, scale));
        colour.setHSL(0.03, 0.35, 0.3 + b.shade * 0.12);
        roof.setColorAt(i, colour);
      });
      roof.instanceMatrix.needsUpdate = true;
      if (roof.instanceColor) roof.instanceColor.needsUpdate = true;
      roof.computeBoundingSphere();
    }

    const setTree = (
      mesh: THREE.InstancedMesh | null,
      zOffset: (s: number) => number,
      radius: (s: number) => number,
      height: (s: number) => number,
      shade: number,
    ) => {
      if (!mesh) return;
      props.trees.forEach((t, i) => {
        q.setFromAxisAngle(up, t.tint * Math.PI * 2);
        pos.set(t.x, t.y, TERRAIN_BASE_Z + t.z + zOffset(t.scale));
        scale.set(radius(t.scale), radius(t.scale), height(t.scale));
        mesh.setMatrixAt(i, m.compose(pos, q, scale));
        colour.setHSL(0.27 + t.tint * 0.045, 0.42 + t.tint * 0.2, shade * (0.8 + t.tint * 0.35));
        mesh.setColorAt(i, colour);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    };

    // trunk, then a wide lower tier and a narrower upper one
    setTree(trunkRef.current, (s) => s * 0.35, (s) => s * 0.09, (s) => s * 0.7, 0.28);
    setTree(canopyLowRef.current, (s) => s * 0.95, (s) => s * 0.5, (s) => s * 1.05, 0.34);
    setTree(canopyTopRef.current, (s) => s * 1.6, (s) => s * 0.34, (s) => s * 0.9, 0.42);
  }, [props, pitched]);

  return (
    <group>
      <instancedMesh
        ref={bodyRef}
        args={[undefined, wallMaterial, props.buildings.length]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      <instancedMesh
        ref={roofRef}
        args={[geo.roof, undefined, Math.max(1, pitched.length)]}
        frustumCulled={false}
      >
        <meshLambertMaterial />
      </instancedMesh>

      <instancedMesh
        ref={trunkRef}
        args={[geo.trunk, undefined, props.trees.length]}
        frustumCulled={false}
      >
        <meshLambertMaterial />
      </instancedMesh>

      <instancedMesh
        ref={canopyLowRef}
        args={[geo.canopy, undefined, props.trees.length]}
        frustumCulled={false}
      >
        <meshLambertMaterial />
      </instancedMesh>

      <instancedMesh
        ref={canopyTopRef}
        args={[geo.canopy, undefined, props.trees.length]}
        frustumCulled={false}
      >
        <meshLambertMaterial />
      </instancedMesh>
    </group>
  );
}
