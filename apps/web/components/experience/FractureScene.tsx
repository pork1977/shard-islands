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
    };
  }
}

export default function FractureScene({ normalMap }: { normalMap: THREE.Texture }) {
  const materialRef = useRef<InstanceType<typeof ShardGlassMaterial>>(null);
  const { viewport } = useThree();
  const impact = useGameStore((s) => s.impact);

  // Built once per strike. Generation is cheap (sub-millisecond for a few
  // hundred seed points) so it happens at click time rather than being
  // pre-baked — that way the pattern is always centred exactly on where the
  // user actually touched, and is different every time.
  const geometry = useMemo(() => {
    const pattern = generateVoronoiCells({
      width: viewport.width,
      height: viewport.height,
      impact: impact ? [impact[0], impact[1]] : [0, 0],
    });
    return buildFractureGeometry(pattern);
  }, [impact, viewport.width, viewport.height]);

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uTime = state.clock.elapsedTime;
    materialRef.current.uAspect = viewport.width / viewport.height;
  });

  return (
    <mesh geometry={geometry}>
      <shardGlassMaterial ref={materialRef} uNormalMap={normalMap} />
    </mesh>
  );
}
