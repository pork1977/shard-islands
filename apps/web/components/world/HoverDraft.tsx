"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const RINGS = 4;
const FALL_DISTANCE = 26;
const CYCLE_SECONDS = 1.4;

/**
 * The downwash under a craft holding station.
 *
 * Hovering is otherwise invisible: a craft at zero speed looks exactly like
 * a craft that has stopped working. Rings shed downward and widening as they
 * go are the cheapest read for "this thing is holding itself up" — and they
 * give the player something that confirms the key press landed.
 *
 * World-aligned rather than parented to the craft: downwash goes down, and a
 * banked aircraft's wash does not bank with it.
 */
export default function HoverDraft({
  strength,
  position,
}: {
  /** 0 to 1, eased by the caller so it fades in and out. */
  strength: () => number;
  position: () => readonly [number, number, number];
}) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRefs = useRef<(THREE.Mesh | null)[]>([]);

  const geometry = useMemo(() => new THREE.RingGeometry(0.55, 0.78, 40), []);

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;

    const amount = strength();
    group.visible = amount > 0.01;
    if (!group.visible) return;

    const [x, y, z] = position();
    group.position.set(x, y, z);

    const now = state.clock.elapsedTime;

    for (let i = 0; i < RINGS; i++) {
      const ring = ringRefs.current[i];
      if (!ring) continue;

      // each ring a fixed fraction of a cycle behind the one above it
      const phase = ((now / CYCLE_SECONDS + i / RINGS) % 1 + 1) % 1;

      ring.position.z = -phase * FALL_DISTANCE * amount;
      const spread = 1.6 + phase * 9;
      ring.scale.set(spread, spread, 1);

      const material = ring.material as THREE.MeshBasicMaterial;
      // brightest just after it sheds, gone by the time it has fallen away
      material.opacity = amount * 0.5 * Math.sin(phase * Math.PI) ** 1.4;
    }
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: RINGS }, (_, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            ringRefs.current[i] = mesh;
          }}
          geometry={geometry}
        >
          <meshBasicMaterial
            color="#8ff0ff"
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
