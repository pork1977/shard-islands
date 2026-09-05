"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/** Stable 0..1 from an index and an offset. */
function hash(i: number, salt: number) {
  return (Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1 * 0.5 + 0.5;
}

/** Vortex rings shed from under the craft. */
const RINGS = 6;
/** Short vertical dashes of displaced air falling between them. */
const STREAKS = 26;

const FALL_DISTANCE = 30;
const CYCLE_SECONDS = 1.5;

/**
 * The downwash under a craft holding station.
 *
 * Hovering is otherwise invisible: a craft at zero speed looks exactly like
 * a craft that has stopped working. This is what says it is holding itself
 * up, and it is also the confirmation that the key press landed.
 *
 * Four things, because any one of them alone reads as a decoration rather
 * than as air being moved:
 *
 *   A bright disc pressed against the belly of the craft, where the column
 *   is densest. Everything else falls away from it.
 *
 *   A cone widening downward. It is what gives the column a volume, instead
 *   of leaving a stack of unrelated hoops hanging in space.
 *
 *   Vortex rings shedding downward, expanding as they go and FLATTENING as
 *   they expand — a real ring loses its cross-section as it spreads, and
 *   keeping every ring the same thickness was most of why the first version
 *   read as clip art.
 *
 *   Streaks of displaced air falling between the rings, each on its own
 *   phase and turning slightly with the column. They are what make it look
 *   fast rather than decorative.
 *
 * World-aligned, not parented to the craft: downwash goes down, and a
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
  const discRef = useRef<THREE.Mesh>(null);
  const coneRef = useRef<THREE.Mesh>(null);
  const streaksRef = useRef<THREE.InstancedMesh>(null);

  const geometry = useMemo(
    () => ({
      // A torus rather than a flat ring: it can be squashed as it spreads,
      // and it still catches light seen edge on instead of disappearing.
      ring: new THREE.TorusGeometry(1, 0.07, 6, 44),
      disc: new THREE.CircleGeometry(1, 32),
      cone: new THREE.ConeGeometry(1, 1, 28, 1, true),
      streak: new THREE.PlaneGeometry(0.16, 2.6),
    }),
    [],
  );

  /**
   * Fixed per-streak variation, so each one keeps its own character.
   *
   * Hashed from the index rather than drawn from Math.random: the same
   * column every time, and nothing impure happening during a render.
   */
  const streakSeeds = useMemo(
    () =>
      Array.from({ length: STREAKS }, (_, i) => ({
        angle: (i / STREAKS) * Math.PI * 2 + hash(i, 1.7) * 0.5,
        radius: 0.35 + hash(i, 5.2) * 0.75,
        phase: hash(i, 9.9),
        speed: 0.85 + hash(i, 13.4) * 0.5,
      })),
    [],
  );

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;

    const amount = strength();
    group.visible = amount > 0.01;
    if (!group.visible) return;

    const [x, y, z] = position();
    group.position.set(x, y, z);

    const now = state.clock.elapsedTime;
    const reach = FALL_DISTANCE * amount;

    // The disc at the top, breathing so the column never sits still.
    const disc = discRef.current;
    if (disc) {
      const pulse = 1 + Math.sin(now * 6.2) * 0.06;
      disc.scale.setScalar(2.1 * pulse * amount);
      (disc.material as THREE.MeshBasicMaterial).opacity = amount * 0.42;
    }

    // The cone hanging beneath it.
    const cone = coneRef.current;
    if (cone) {
      const spread = 7.5 * amount;
      cone.scale.set(spread, reach, spread);
      // Its origin is its middle, so it has to be pushed half a length down
      // to hang from the craft rather than straddle it.
      cone.position.z = -reach * 0.5;
      (cone.material as THREE.MeshBasicMaterial).opacity = amount * 0.09;
    }

    for (let i = 0; i < RINGS; i++) {
      const ring = ringRefs.current[i];
      if (!ring) continue;

      // Each ring a fixed fraction of a cycle behind the one above it.
      const phase = (((now / CYCLE_SECONDS + i / RINGS) % 1) + 1) % 1;

      ring.position.z = -phase * reach;
      // Spreads fast at first and slows, the way a shed vortex does.
      const spread = 1.5 + Math.pow(phase, 0.65) * 8.5;
      // Thinner as it widens: the ring is losing itself into the air.
      ring.scale.set(spread, spread, Math.max(0.15, 1 - phase * 0.85));
      ring.rotation.z = now * 0.35 + i * 1.1;

      const material = ring.material as THREE.MeshBasicMaterial;
      // Brightest just after it sheds, and gone well before it runs out of
      // room, so nothing ever pops out of existence at the bottom.
      material.opacity =
        amount * 0.55 * Math.pow(1 - phase, 1.5) * Math.min(1, phase * 7);
    }

    const streaks = streaksRef.current;
    if (streaks) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const pos = new THREE.Vector3();
      const scale = new THREE.Vector3();
      const axis = new THREE.Vector3(1, 0, 0);

      for (let i = 0; i < STREAKS; i++) {
        const seed = streakSeeds[i];
        const phase =
          ((((now * seed.speed) / CYCLE_SECONDS + seed.phase) % 1) + 1) % 1;

        // Falls, spreading outward and turning slightly with the column.
        const spread = seed.radius * (1.6 + phase * 6.5);
        const angle = seed.angle + phase * 0.8;
        pos.set(Math.cos(angle) * spread, Math.sin(angle) * spread, -phase * reach);

        // Stretched as it accelerates away, and pinched to nothing at either
        // end of its life so it never blinks in or out.
        const life = Math.sin(phase * Math.PI);
        scale.set(life, 0.6 + phase * 1.9, 1).multiplyScalar(amount);

        // The plane lies in XY; stood up along the world Z it falls down.
        q.setFromAxisAngle(axis, Math.PI / 2);
        streaks.setMatrixAt(i, m.compose(pos, q, scale));
      }
      streaks.instanceMatrix.needsUpdate = true;
      (streaks.material as THREE.MeshBasicMaterial).opacity = amount * 0.5;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={discRef} geometry={geometry.disc}>
        <meshBasicMaterial
          color="#cdf6ff"
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {/* rotated so the cone hangs down the world -Z rather than its own -Y */}
      <mesh ref={coneRef} geometry={geometry.cone} rotation={[Math.PI / 2, 0, 0]}>
        <meshBasicMaterial
          color="#7fe6ff"
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {Array.from({ length: RINGS }, (_, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            ringRefs.current[i] = mesh;
          }}
          geometry={geometry.ring}
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

      <instancedMesh
        ref={streaksRef}
        args={[geometry.streak, undefined, STREAKS]}
        frustumCulled={false}
      >
        <meshBasicMaterial
          color="#b7f4ff"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}
