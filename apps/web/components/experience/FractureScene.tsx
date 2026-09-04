"use client";

import { useMemo, useRef } from "react";
import { extend, useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { ShardGlassMaterial } from "@/lib/shaders/shardGlass";
import { generateVoronoiCells } from "@/lib/fracture/generateVoronoiCells";
import { buildFractureGeometry } from "@/lib/fracture/fractureGeometry";
import { useGameStore } from "@/lib/store/useGameStore";

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
      uImpact?: THREE.Vector2;
    };
  }
}

/** Seconds for the fracture to travel from the strike to the pane edges. */
const CRACK_DURATION = 2.1;

export default function FractureScene({ normalMap }: { normalMap: THREE.Texture }) {
  const materialRef = useRef<InstanceType<typeof ShardGlassMaterial>>(null);
  const { viewport } = useThree();
  const impact = useGameStore((s) => s.impact);
  const strikeAt = useGameStore((s) => s.strikeAt);

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
