"use client";

import { useMemo, useRef } from "react";
import { extend, useFrame, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { TrailRibbonMaterial } from "@/lib/shaders/trailRibbon";

extend({ TrailRibbonMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    trailRibbonMaterial: ThreeElements["meshBasicMaterial"] & {
      uTime?: number;
      uHot?: THREE.ColorRepresentation;
      uCore?: THREE.ColorRepresentation;
      uTail?: THREE.ColorRepresentation;
      uOpacity?: number;
    };
  }
}

/**
 * Capacity, which has to be at least the score cap: trail length IS the
 * score, and a ribbon that stops growing at 220 while the number keeps
 * climbing would quietly lie about who is winning.
 */
const MAX_POINTS = 360;

/**
 * Renders a trail from a flat xyz point buffer.
 *
 * The geometry is allocated once at maximum size and rewritten in place each
 * frame — rebuilding a BufferGeometry per frame per player would churn the
 * heap badly once there are twenty of them on screen. Unused capacity is
 * collapsed to a degenerate point rather than resized.
 *
 * The ribbon is billboarded toward the camera per segment, so it always
 * presents its full width however you look at it. A fixed-orientation strip
 * vanishes to a hairline whenever you view it edge-on, which for a trail
 * you fly alongside is most of the time.
 */
export default function TrailRibbon({
  points,
  width,
  opacity = 1,
  core,
  tail,
}: {
  points: () => number[];
  width: number;
  opacity?: number;
  /** Per-player tint. Left off, the material's own palette is used. */
  core?: THREE.ColorRepresentation;
  tail?: THREE.ColorRepresentation;
}) {
  const materialRef = useRef<InstanceType<typeof TrailRibbonMaterial>>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  const { geometry, position, aT, aSide } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX_POINTS * 2 * 3);
    const t = new Float32Array(MAX_POINTS * 2);
    const side = new Float32Array(MAX_POINTS * 2);

    const index: number[] = [];
    for (let i = 0; i < MAX_POINTS - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }

    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aT", new THREE.BufferAttribute(t, 1));
    g.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    g.setIndex(index);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    return { geometry: g, position: pos, aT: t, aSide: side };
  }, []);

  const dir = useMemo(() => new THREE.Vector3(), []);
  const toCam = useMemo(() => new THREE.Vector3(), []);
  const sideVec = useMemo(() => new THREE.Vector3(), []);
  const here = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uTime = state.clock.elapsedTime;
      materialRef.current.uOpacity = opacity;
    }

    const pts = points();
    const count = Math.min(Math.floor(pts.length / 3), MAX_POINTS);
    if (count < 2) {
      geometry.setDrawRange(0, 0);
      return;
    }

    for (let i = 0; i < count; i++) {
      const o = i * 3;
      here.set(pts[o], pts[o + 1], pts[o + 2]);

      // direction along the trail, from the neighbouring points
      const prev = Math.max(0, i - 1) * 3;
      const next = Math.min(count - 1, i + 1) * 3;
      dir
        .set(pts[next] - pts[prev], pts[next + 1] - pts[prev + 1], pts[next + 2] - pts[prev + 2])
        .normalize();

      toCam.copy(state.camera.position).sub(here).normalize();
      sideVec.crossVectors(dir, toCam);
      if (sideVec.lengthSq() < 1e-8) sideVec.set(0, 0, 1);
      sideVec.normalize();

      const t = i / (count - 1);
      // tapers to a point at the tail and widens toward the craft
      const w = width * (0.25 + 0.75 * t);

      const v = i * 2;
      position[v * 3] = here.x + sideVec.x * w;
      position[v * 3 + 1] = here.y + sideVec.y * w;
      position[v * 3 + 2] = here.z + sideVec.z * w;
      position[(v + 1) * 3] = here.x - sideVec.x * w;
      position[(v + 1) * 3 + 1] = here.y - sideVec.y * w;
      position[(v + 1) * 3 + 2] = here.z - sideVec.z * w;

      aT[v] = t;
      aT[v + 1] = t;
      aSide[v] = 1;
      aSide[v + 1] = -1;
    }

    geometry.setDrawRange(0, (count - 1) * 6);
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aT.needsUpdate = true;
    geometry.attributes.aSide.needsUpdate = true;
  });

  return (
    <mesh ref={meshRef} geometry={geometry} frustumCulled={false} renderOrder={12}>
      <trailRibbonMaterial
        ref={materialRef}
        {...(core !== undefined ? { uCore: core } : {})}
        {...(tail !== undefined ? { uTail: tail } : {})}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}
