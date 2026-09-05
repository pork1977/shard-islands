"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { readClipEvents, type ClipEvent } from "@/lib/net/connection";
import { SEAT_COLOURS } from "@/lib/world/seatColours";

/** Concurrent bursts. More than this at once and nobody is reading them anyway. */
const CAPACITY = 8;
/** How long one lasts. Short: it marks a moment, it does not linger. */
const LIFE = 0.85;

/** The world's up axis, which the ring lies across. */
const UP = new THREE.Vector3(0, 0, 1);

interface Burst {
  x: number;
  y: number;
  z: number;
  colour: number;
  at: number;
}

/**
 * The moment a trail comes apart.
 *
 * A cut is over in a single tick and its whole consequence — a ribbon that
 * is suddenly shorter — happens behind the victim, where neither they nor
 * anybody else is looking. Without something at the point of the cut, the
 * highest-stakes event in the game is a number quietly changing.
 *
 * An expanding ring in the victim's colour, lying across the direction of
 * travel, plus a hard flash at the centre. Everyone sees it, in the same
 * place, because it is played from the room's own record of where the cut
 * happened rather than from anyone's guess.
 */
export default function ClipBursts() {
  const ringRef = useRef<THREE.InstancedMesh>(null);
  const coreRef = useRef<THREE.InstancedMesh>(null);

  // Refs rather than memos: both are written every frame.
  const eventsRef = useRef<ClipEvent[]>([]);
  const burstsRef = useRef<Burst[]>([]);

  const geo = useMemo(
    () => ({
      ring: new THREE.TorusGeometry(1, 0.09, 8, 28),
      core: new THREE.IcosahedronGeometry(1, 0),
    }),
    [],
  );

  const colours = useMemo(() => SEAT_COLOURS.map((c) => new THREE.Color(c)), []);

  useFrame((state) => {
    const ring = ringRef.current;
    const core = coreRef.current;
    if (!ring || !core) return;

    const now = state.clock.elapsedTime;
    const events = eventsRef.current;
    const bursts = burstsRef.current;

    readClipEvents(events);
    for (const e of events) {
      bursts.push({ x: e.x, y: e.y, z: e.z, colour: e.colour, at: now });
      if (bursts.length > CAPACITY) bursts.shift();
    }

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();

    let n = 0;
    for (const burst of bursts) {
      const t = (now - burst.at) / LIFE;
      if (t >= 1 || n >= CAPACITY) continue;

      const tint = colours[burst.colour % colours.length];
      pos.set(burst.x, burst.y, burst.z);

      // Ring: out fast, then eased, and thinning as it goes.
      const spread = 4 + Math.sqrt(t) * 46;
      q.setFromAxisAngle(UP, burst.at * 3);
      scale.set(spread, spread, spread * (1 - t * 0.7));
      ring.setMatrixAt(n, m.compose(pos, q, scale));
      ring.setColorAt(n, tint);

      // Centre: a hard flash that collapses.
      const flash = Math.max(0, 1 - t * 2.6) * 9;
      q.identity();
      scale.setScalar(flash);
      core.setMatrixAt(n, m.compose(pos, q, scale));
      core.setColorAt(n, tint);

      n++;
    }

    scale.setScalar(0);
    q.identity();
    pos.set(0, 0, 0);
    for (let i = n; i < CAPACITY; i++) {
      ring.setMatrixAt(i, m.compose(pos, q, scale));
      core.setMatrixAt(i, m.compose(pos, q, scale));
    }

    // Spent bursts dropped only once they are off screen, so the array does
    // not shuffle under a burst that is still playing.
    while (bursts.length > 0 && now - bursts[0].at > LIFE) bursts.shift();

    ring.instanceMatrix.needsUpdate = true;
    core.instanceMatrix.needsUpdate = true;
    if (ring.instanceColor) ring.instanceColor.needsUpdate = true;
    if (core.instanceColor) core.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh
        ref={ringRef}
        args={[geo.ring, undefined, CAPACITY]}
        frustumCulled={false}
      >
        <meshBasicMaterial
          transparent
          opacity={0.85}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>

      <instancedMesh
        ref={coreRef}
        args={[geo.core, undefined, CAPACITY]}
        frustumCulled={false}
      >
        <meshBasicMaterial
          transparent
          opacity={0.7}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}
