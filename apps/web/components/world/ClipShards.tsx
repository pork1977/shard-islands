"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CLIP } from "@shard-islands/shared";
import { readShards, type ShardView } from "@/lib/net/connection";
import { SEAT_COLOURS } from "@/lib/world/seatColours";

/** Ceiling on how many can be drawn at once — the room never makes this many. */
const CAPACITY = 240;
/** How long a taken shard spends flaring out, rather than simply ceasing to be. */
const POP_SECONDS = 0.4;

interface Fading {
  shard: ShardView;
  at: number;
}

/**
 * The wreckage of somebody's trail.
 *
 * These are the point of tail-clip. A cut that only destroyed would be
 * spiteful and not much else; a cut that leaves a line of somebody's colour
 * hanging in the air is an advertisement, visible from a long way off, that
 * a fight happened here and the winnings are still lying about. Whoever
 * turns back fastest gets them — including the player they were taken from.
 *
 * Drawn in the VICTIM's colour, deliberately. The shards say whose trail
 * this was, not who cut it: from across the sky a scatter of somebody
 * else's colour is a place worth flying to, and a scatter of your own is an
 * insult you can still do something about.
 *
 * Nothing here is predicted. The room owns which shards exist and who
 * collected them, exactly as it owns the cores, because a shard the client
 * drew on its own authority is a reward the player can see and never have.
 */
export default function ClipShards() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);

  // Refs rather than memos: these are mutated every frame, and a memo is a
  // value the renderer is entitled to assume nobody writes to.
  const liveRef = useRef<ShardView[]>([]);
  /** When each shard was first seen, by id, for the arming swell. */
  const seenAtRef = useRef(new Map<number, number>());
  /** Shards the room has taken away, still flaring out of the sky. */
  const fadingRef = useRef(new Map<number, Fading>());

  const geo = useMemo(
    () => ({
      // Sharp and flat rather than the cores' round faceted look: this is
      // debris off somebody's wing, not a thing that grew here.
      shard: new THREE.TetrahedronGeometry(2.6, 0),
      halo: new THREE.TetrahedronGeometry(6.2, 0),
    }),
    [],
  );

  const colours = useMemo(() => SEAT_COLOURS.map((c) => new THREE.Color(c)), []);

  useFrame((state) => {
    const mesh = meshRef.current;
    const halo = haloRef.current;
    if (!mesh || !halo) return;

    const now = state.clock.elapsedTime;
    const live = liveRef.current;
    const seenAt = seenAtRef.current;
    const fading = fadingRef.current;
    readShards(live);

    const present = new Set<number>();
    for (const shard of live) present.add(shard.id);

    // Anything here last frame and gone now was collected or timed out.
    // Handed to the fade rather than dropped, because a pickup that simply
    // stops existing gives the player nothing to connect to the score that
    // just went up.
    for (const id of seenAt.keys()) {
      if (!present.has(id)) seenAt.delete(id);
    }
    for (const [id, entry] of fading) {
      if (now - entry.at > POP_SECONDS) fading.delete(id);
    }

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const spin = new THREE.Vector3(0.42, -0.31, 0.85).normalize();

    let n = 0;

    const draw = (shard: ShardView, size: number, haloScale: number) => {
      if (n >= CAPACITY) return;
      q.setFromAxisAngle(spin, now * 1.35 + shard.id * 1.7);
      pos.set(shard.x, shard.y, shard.z);
      const tint = colours[shard.colour % colours.length];

      scale.setScalar(size);
      mesh.setMatrixAt(n, m.compose(pos, q, scale));
      mesh.setColorAt(n, tint);

      scale.setScalar(size * haloScale);
      halo.setMatrixAt(n, m.compose(pos, q, scale));
      halo.setColorAt(n, tint);
      n++;
    };

    for (const shard of live) {
      let first = seenAt.get(shard.id);
      if (first === undefined) {
        first = now;
        seenAt.set(shard.id, first);
      }
      // Remembered every frame it is alive, so the frame it disappears has
      // something to flare.
      fading.set(shard.id, { shard, at: now });

      const age = now - first;

      // Small and dull until it arms, then full size. The room will not let
      // anybody take one before then, and a shard that looked collectable
      // while it was not would read as a bug every single time.
      const arming = Math.min(1, (age * 1000) / CLIP.shardArmMs);
      const armed = arming >= 1;
      const breathe = armed ? 1 + Math.sin(age * 3.4 + shard.id) * 0.1 : 0.3 + arming * 0.4;

      // Worth is visible in the size: a fat shard is one to go for.
      const worth = 0.75 + Math.min(1, shard.value / 22) * 0.75;
      draw(shard, breathe * worth, armed ? 0.9 : 0.3);
    }

    for (const [id, entry] of fading) {
      if (present.has(id)) continue;
      const t = (now - entry.at) / POP_SECONDS;
      if (t >= 1) continue;
      // Flares outward as it goes, the same gesture a collected core makes.
      draw(entry.shard, (1 - t) * (1 + t * 2.6), 1.2);
    }

    // Everything unused collapses to nothing rather than staying where it
    // was last frame.
    scale.setScalar(0);
    q.identity();
    pos.set(0, 0, 0);
    for (let i = n; i < CAPACITY; i++) {
      mesh.setMatrixAt(i, m.compose(pos, q, scale));
      halo.setMatrixAt(i, m.compose(pos, q, scale));
    }

    mesh.instanceMatrix.needsUpdate = true;
    halo.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (halo.instanceColor) halo.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[geo.shard, undefined, CAPACITY]}
        frustumCulled={false}
      >
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      <instancedMesh
        ref={haloRef}
        args={[geo.halo, undefined, CAPACITY]}
        frustumCulled={false}
      >
        <meshBasicMaterial
          transparent
          opacity={0.2}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}
