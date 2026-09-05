"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createFallMotes, fallRun, setFallRun } from "@/lib/world/fallMotes";
import { terrainHeightAt, TERRAIN_BASE_Z } from "@/lib/world/generateTerrain";
import { useGameStore } from "@/lib/store/useGameStore";

/** One hue per stream, so which one you are on is readable at a glance. */
const STREAM_COLOURS = ["#66e8ff", "#b98cff", "#ffcf5c"];

/** How long a collected mote takes to pop and vanish. */
const POP_SECONDS = 0.3;

/**
 * The energy motes in the air column, and the ring on the ground marking
 * where the player is currently going to land.
 *
 * The ring is the part that makes the descent a decision rather than a
 * cutscene: without it you are steering blind and only find out where you
 * chose once you are already there.
 */
export default function FallMotes() {
  const impact = useGameStore((s) => s.impact);

  // Built here rather than in the descent controller so the instance count
  // is known on the first render. The controller only ever reads the live
  // run, and frames run after layout effects, so it never sees an empty one.
  const plan = useMemo(
    () => createFallMotes((impact?.[0] ?? 0) * 0.85, (impact?.[1] ?? 0) * 0.85),
    [impact],
  );
  const motes = plan.motes;

  // Armed here, and deliberately NOT cleared on unmount: this component
  // leaves the tree the moment flight begins, and the tally has to outlive
  // it long enough for the player to read what they earned. Arming the next
  // run is what resets it.
  useLayoutEffect(() => {
    setFallRun(plan);
  }, [plan]);

  const coreRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const discRef = useRef<THREE.Mesh>(null);

  /** When each mote was seen to be collected, so it can pop rather than blink. */
  const takenAt = useRef(new Map<number, number>());

  const count = Math.max(1, motes.length);

  const geo = useMemo(
    () => ({
      // Big. These are read from hundreds of metres up, through debris and
      // cloud; at a plausible "collectable" size they were two pixels that
      // never resolved into anything worth steering at.
      core: new THREE.OctahedronGeometry(6.5, 0),
      halo: new THREE.OctahedronGeometry(15, 0),
      // sized to read from several hundred metres up, which is the only
      // altitude it is ever looked at from
      ring: new THREE.RingGeometry(34, 43, 56),
      disc: new THREE.CircleGeometry(34, 44),
    }),
    [],
  );

  const colours = useMemo(() => STREAM_COLOURS.map((c) => new THREE.Color(c)), []);

  useFrame((state) => {
    const now = state.clock.elapsedTime;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const spin = new THREE.Vector3(0.42, 0.83, 0.36).normalize();

    const core = coreRef.current;
    const halo = haloRef.current;

    if (core && halo) {
      motes.forEach((mote, i) => {
        let size = 1;

        if (mote.collected) {
          let t = takenAt.current.get(i);
          if (t === undefined) {
            t = now;
            takenAt.current.set(i, now);
          }
          const age = (now - t) / POP_SECONDS;
          // flares outward as it goes, rather than simply ceasing to exist
          size = age >= 1 ? 0 : (1 - age) * (1 + age * 2.2);
        } else {
          // a slow breath, so a stationary object in a static sky still reads
          // as something live worth flying at
          size = 1 + Math.sin(now * 2.4 + i * 1.7) * 0.12;
        }

        q.setFromAxisAngle(spin, now * 1.1 + i);
        pos.set(mote.x, mote.y, mote.z);

        scale.setScalar(size);
        core.setMatrixAt(i, m.compose(pos, q, scale));
        core.setColorAt(i, colours[mote.stream % colours.length]);

        scale.setScalar(size * (mote.collected ? 1 : 0.72 + Math.sin(now * 3 + i) * 0.06));
        halo.setMatrixAt(i, m.compose(pos, q, scale));
        halo.setColorAt(i, colours[mote.stream % colours.length]);
      });

      core.instanceMatrix.needsUpdate = true;
      halo.instanceMatrix.needsUpdate = true;
      if (core.instanceColor) core.instanceColor.needsUpdate = true;
      if (halo.instanceColor) halo.instanceColor.needsUpdate = true;
      core.computeBoundingSphere();
      halo.computeBoundingSphere();
    }

    // The ring sits on the projected landing point rather than directly
    // below, so it stays in frame and so it answers the question the player
    // is actually asking: not where am I, but where is this taking me.
    const [lx, ly] = fallRun.landing;
    const ground = TERRAIN_BASE_Z + terrainHeightAt(lx, ly);
    const breathe = 1 + Math.sin(now * 3.1) * 0.05;

    if (ringRef.current) {
      ringRef.current.position.set(lx, ly, ground + 1.5);
      ringRef.current.rotation.z = now * 0.35;
      ringRef.current.scale.setScalar(breathe);
    }
    if (discRef.current) {
      discRef.current.position.set(lx, ly, ground + 1.2);
      discRef.current.scale.setScalar(breathe);
    }
  });

  return (
    <group>
      <instancedMesh ref={coreRef} args={[geo.core, undefined, count]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      <instancedMesh ref={haloRef} args={[geo.halo, undefined, count]} frustumCulled={false}>
        <meshBasicMaterial
          transparent
          opacity={0.3}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>

      <mesh ref={ringRef} geometry={geo.ring}>
        <meshBasicMaterial
          color="#8ef4ff"
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={discRef} geometry={geo.disc}>
        <meshBasicMaterial
          color="#5fe4ff"
          transparent
          opacity={0.11}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
