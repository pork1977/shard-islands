"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PLUMAGE_NODE, plumageSites } from "@shard-islands/shared";
import { readPlumageTaken } from "@/lib/net/connection";

/**
 * The four things worth crossing the map for.
 *
 * A rare pickup nobody can find is not rare, it is absent — so each one
 * stands in a column of light tall enough to be picked out from anywhere in
 * the sky. That is the entire job of the beam: it is not decoration, it is
 * the invitation, and it is what turns "there is a thing somewhere" into
 * "there is a thing THERE and someone else is probably already going".
 *
 * White rather than any seat colour. Every other bright thing out here
 * belongs to somebody — a trail, a craft, a scattered shard — and this one
 * belongs to nobody yet.
 *
 * Positions come from the shared seed, never the wire. Only whether each is
 * still there has to be synced.
 */
const SITES = plumageSites();

export default function PlumageNodes() {
  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const taken = useMemo(() => new Uint8Array(SITES.length), []);

  const geometry = useMemo(() => new THREE.IcosahedronGeometry(7, 0), []);
  const beamGeometry = useMemo(
    () => new THREE.CylinderGeometry(2.4, 2.4, 620, 8, 1, true),
    [],
  );

  useFrame((state) => {
    readPlumageTaken(taken);
    const t = state.clock.elapsedTime;

    for (let i = 0; i < SITES.length; i++) {
      const group = groupRefs.current[i];
      if (!group) continue;

      // Gone means gone: no ghost, no fading husk. It either is or is not.
      group.visible = taken[i] === 0;
      if (!group.visible) continue;

      // Tumbling, and breathing. A rare thing that sits perfectly still
      // reads as scenery.
      group.rotation.z = t * 0.6 + i;
      group.rotation.x = Math.sin(t * 0.4 + i) * 0.5;
      const pulse = 1 + Math.sin(t * 2.2 + i * 1.7) * 0.09;
      group.scale.setScalar(pulse);
    }
  });

  return (
    <>
      {SITES.map((site, i) => (
        <group key={i} position={[site.x, site.y, site.z]}>
          {/* The beam is NOT inside the tumbling group: a column of light
              that rolls with the thing it marks stops reading as vertical,
              which is the one property it needs. */}
          <mesh raycast={() => null} rotation={[Math.PI / 2, 0, 0]}>
            <primitive object={beamGeometry} attach="geometry" />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={0.13}
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>

          <group ref={(g) => void (groupRefs.current[i] = g)}>
            <mesh raycast={() => null}>
              <primitive object={geometry} attach="geometry" />
              <meshBasicMaterial
                color="#ffffff"
                transparent
                opacity={0.95}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>

            {/* A soft shell, so it glows rather than merely being pale. */}
            <mesh raycast={() => null} scale={2.1}>
              <primitive object={geometry} attach="geometry" />
              <meshBasicMaterial
                color="#cfe9ff"
                transparent
                opacity={0.22}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                side={THREE.BackSide}
                toneMapped={false}
              />
            </mesh>
          </group>

          {/* Sized off the pickup radius rather than a number picked to look
              right, so what you can see is what you can actually take. */}
          <mesh raycast={() => null} scale={PLUMAGE_NODE.pickupRadius}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshBasicMaterial
              color="#9fd8ff"
              transparent
              opacity={0.05}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}
