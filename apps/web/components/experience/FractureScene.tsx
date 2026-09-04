"use client";

import { useMemo, useRef } from "react";
import { extend, useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { ShardGlassMaterial } from "@/lib/shaders/shardGlass";
import { generateVoronoiCells } from "@/lib/fracture/generateVoronoiCells";
import { buildFractureGeometry } from "@/lib/fracture/fractureGeometry";
import { useGameStore } from "@/lib/store/useGameStore";
import { resetPlayerState } from "@/lib/net/playerState";
import { FLIGHT_ALTITUDE } from "@/lib/world/generateTerrain";
import {
  CRACK_DURATION,
  COLLAPSE_AT,
  PLUNGE_AT,
  PLUNGE_DURATION,
} from "@/lib/timeline";

extend({ ShardGlassMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    shardGlassMaterial: ThreeElements["meshBasicMaterial"] & {
      uTime?: number;
      uAspect?: number;
      uNormalMap?: THREE.Texture | null;
      uGlassColor?: THREE.ColorRepresentation;
      uLightColor?: THREE.ColorRepresentation;
      uCoolColor?: THREE.ColorRepresentation;
      uLightPos?: THREE.Vector2;
      uGlowColor?: THREE.ColorRepresentation;
      uProgress?: number;
      uCollapse?: number;
      uImpact?: THREE.Vector2;
    };
  }
}

export default function FractureScene({ normalMap }: { normalMap: THREE.Texture }) {
  const materialRef = useRef<InstanceType<typeof ShardGlassMaterial>>(null);
  const { viewport } = useThree();
  const impact = useGameStore((s) => s.impact);
  const strikeAt = useGameStore((s) => s.strikeAt);
  const beginFlight = useGameStore((s) => s.beginFlight);

  const impact2D = useMemo<[number, number]>(
    () => (impact ? [impact[0], impact[1]] : [0, 0]),
    [impact],
  );

  // Generated at strike time rather than pre-baked, so the pattern is always
  // centred exactly where the user touched and differs every time.
  const geometry = useMemo(
    () =>
      buildFractureGeometry(
        generateVoronoiCells({
          width: viewport.width,
          height: viewport.height,
          impact: impact2D,
        }),
      ),
    [impact2D, viewport.width, viewport.height],
  );

  useFrame((state) => {
    const mat = materialRef.current;
    if (!mat) return;

    mat.uTime = state.clock.elapsedTime;
    mat.uAspect = viewport.width / viewport.height;

    // Wall-clock driven, so a dropped frame skips ahead rather than playing
    // the break in slow motion.
    const t = (performance.now() - strikeAt) / 1000;
    const u = THREE.MathUtils.clamp(t / CRACK_DURATION, 0, 1);

    // Fracture accelerates: the first cracks come slowly — the "what was
    // that?" beat — then it runs away as the pane loses integrity.
    mat.uProgress = Math.pow(u, 1.45);
    mat.uCollapse = Math.max(0, t - COLLAPSE_AT);

    // The camera falls through the hole the pane just left behind, drifting
    // toward the strike point so the plunge goes through the opening rather
    // than through intact glass.
    const p = THREE.MathUtils.clamp((t - PLUNGE_AT) / PLUNGE_DURATION, 0, 1);

    // The fall does not end in a stop — it hands straight over to the player,
    // seeded with the position and heading the plunge arrived at so control
    // begins exactly where the camera already is.
    if (p >= 1) {
      resetPlayerState(
        [state.camera.position.x, state.camera.position.y, state.camera.position.z],
        0,
      );
      beginFlight();
      return;
    }

    if (p > 0) {
      const eased = p * p * (3 - 2 * p); // smoothstep: eases in, then commits
      const accel = Math.pow(p, 1.7); // and keeps accelerating downward
      state.camera.position.set(
        THREE.MathUtils.lerp(0, impact2D[0] * 0.85, eased),
        THREE.MathUtils.lerp(0, impact2D[1] * 0.85, eased),
        THREE.MathUtils.lerp(5, FLIGHT_ALTITUDE, accel),
      );

      // Field of view widens as the fall accelerates. Falling through open
      // air has almost no visual cue for speed, and the FOV kick is what
      // makes the drop feel fast rather than merely long.
      const cam = state.camera as THREE.PerspectiveCamera;
      cam.fov = THREE.MathUtils.lerp(50, 88, Math.pow(p, 1.3));
      cam.updateProjectionMatrix();
    }
  });

  const impactVec = useMemo(
    () => new THREE.Vector2(impact2D[0], impact2D[1]),
    [impact2D],
  );

  return (
    <mesh geometry={geometry}>
      <shardGlassMaterial
        ref={materialRef}
        uNormalMap={normalMap}
        uImpact={impactVec}
      />
    </mesh>
  );
}
