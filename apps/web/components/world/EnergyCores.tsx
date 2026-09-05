"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { coreSites, CORE_COUNT } from "@shard-islands/shared";
import { readCoresTaken } from "@/lib/net/connection";

/** How long a collected core takes to flare and vanish. */
const POP_SECONDS = 0.35;
/** And how long it takes to swell back in when it returns. */
const RETURN_SECONDS = 0.7;

/**
 * The Energy Cores, out in the world.
 *
 * Positions come from the shared layout rather than from the room, so this
 * renders correctly before the connection has even finished — and the room
 * only ever tells us which of them are currently gone. Collection itself is
 * the server's decision entirely: this draws the answer, it never guesses
 * at it. Predicting a pickup locally would mean showing the player a core
 * they had not got whenever two people reached for the same one.
 *
 * Two meshes for two hundred and forty pickups: a faceted core and a larger
 * additive shell, both instanced.
 */
export default function EnergyCores() {
  const coreRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);

  const sites = useMemo(() => coreSites(), []);
  const taken = useMemo(() => new Uint8Array(CORE_COUNT), []);
  /** When each core was last seen to change state, for the pop and the swell. */
  const changedAt = useRef(new Float32Array(CORE_COUNT));
  const wasTaken = useRef(new Uint8Array(CORE_COUNT));

  const geo = useMemo(
    () => ({
      core: new THREE.OctahedronGeometry(3.4, 0),
      halo: new THREE.OctahedronGeometry(7.6, 0),
    }),
    [],
  );

  const colours = useMemo(
    () => ({
      loose: new THREE.Color("#7ef7d0"),
      clustered: new THREE.Color("#9fd0ff"),
    }),
    [],
  );

  useFrame((state) => {
    const core = coreRef.current;
    const halo = haloRef.current;
    if (!core || !halo) return;

    readCoresTaken(taken);
    const now = state.clock.elapsedTime;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const spin = new THREE.Vector3(0.31, 0.62, 0.72).normalize();

    for (let i = 0; i < sites.length; i++) {
      const site = sites[i];
      const isTaken = taken[i] === 1;

      if (isTaken !== (wasTaken.current[i] === 1)) {
        wasTaken.current[i] = isTaken ? 1 : 0;
        changedAt.current[i] = now;
      }

      const age = now - changedAt.current[i];
      let size: number;

      if (isTaken) {
        // flare outward as it goes, rather than simply ceasing to exist
        const t = age / POP_SECONDS;
        size = t >= 1 ? 0 : (1 - t) * (1 + t * 2.4);
      } else {
        const t = Math.min(1, age / RETURN_SECONDS);
        // swells past its size and settles, so a returning core catches the eye
        const overshoot = Math.sin(t * Math.PI) * 0.35;
        const breathe = 1 + Math.sin(now * 1.9 + i) * 0.09;
        size = (t * t * (3 - 2 * t) + overshoot) * breathe;
      }

      q.setFromAxisAngle(spin, now * 0.8 + i * 0.7);
      pos.set(site.x, site.y, site.z);

      scale.setScalar(size);
      core.setMatrixAt(i, m.compose(pos, q, scale));
      core.setColorAt(i, site.clustered ? colours.clustered : colours.loose);

      scale.setScalar(size * 0.85);
      halo.setMatrixAt(i, m.compose(pos, q, scale));
      halo.setColorAt(i, site.clustered ? colours.clustered : colours.loose);
    }

    core.instanceMatrix.needsUpdate = true;
    halo.instanceMatrix.needsUpdate = true;
    if (core.instanceColor) core.instanceColor.needsUpdate = true;
    if (halo.instanceColor) halo.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh
        ref={coreRef}
        args={[geo.core, undefined, CORE_COUNT]}
        frustumCulled={false}
      >
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      <instancedMesh
        ref={haloRef}
        args={[geo.halo, undefined, CORE_COUNT]}
        frustumCulled={false}
      >
        <meshBasicMaterial
          transparent
          opacity={0.24}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}
