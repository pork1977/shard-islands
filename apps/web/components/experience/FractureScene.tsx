"use client";

import { useMemo, useRef, useState } from "react";
import { extend, useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { ShardGlassMaterial } from "@/lib/shaders/shardGlass";
import { CrackOverlayMaterial } from "@/lib/shaders/crackOverlay";
import { generateVoronoiCells } from "@/lib/fracture/generateVoronoiCells";
import { buildFractureGeometry } from "@/lib/fracture/fractureGeometry";
import { generateCrackNetwork } from "@/lib/fracture/generateCrackNetwork";
import { buildCrackGeometry } from "@/lib/fracture/crackGeometry";
import { useGameStore } from "@/lib/store/useGameStore";
import { GlassPane } from "./GlassFloor";

extend({ ShardGlassMaterial, CrackOverlayMaterial });

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
    crackOverlayMaterial: ThreeElements["meshBasicMaterial"] & {
      uProgress?: number;
      uEdgeColor?: THREE.ColorRepresentation;
      uGlowColor?: THREE.ColorRepresentation;
      uOpacity?: number;
    };
  }
}

/** Seconds for the crack front to race from the strike to the pane edges. */
const CRACK_DURATION = 0.42;
/** When the pane stops being a cracked sheet and becomes loose shards. */
const SHATTER_AT = 0.5;

export default function FractureScene({ normalMap }: { normalMap: THREE.Texture }) {
  const shardMaterialRef = useRef<InstanceType<typeof ShardGlassMaterial>>(null);
  const crackMaterialRef = useRef<InstanceType<typeof CrackOverlayMaterial>>(null);
  const [shattered, setShattered] = useState(false);

  const { viewport } = useThree();
  const impact = useGameStore((s) => s.impact);
  const strikeAt = useGameStore((s) => s.strikeAt);
  const impact2D = useMemo<[number, number]>(
    () => (impact ? [impact[0], impact[1]] : [0, 0]),
    [impact],
  );

  // Both are generated at strike time rather than pre-baked, so the pattern is
  // always centred exactly where the user actually touched and is different
  // every time. Generation is sub-millisecond for these point counts.
  const crackGeometry = useMemo(
    () =>
      buildCrackGeometry(
        generateCrackNetwork({
          width: viewport.width,
          height: viewport.height,
          impact: impact2D,
        }),
      ),
    [impact2D, viewport.width, viewport.height],
  );

  const shardGeometry = useMemo(
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
    const t = (performance.now() - strikeAt) / 1000;

    if (crackMaterialRef.current) {
      crackMaterialRef.current.uProgress = Math.min(t / CRACK_DURATION, 1.15);
      // hand over to the real geometric gaps once the pane comes apart
      crackMaterialRef.current.uOpacity = 1 - THREE.MathUtils.smoothstep(t, SHATTER_AT, SHATTER_AT + 0.25);
    }

    if (shardMaterialRef.current) {
      shardMaterialRef.current.uTime = state.clock.elapsedTime;
      shardMaterialRef.current.uAspect = viewport.width / viewport.height;
    }

    if (!shattered && t >= SHATTER_AT) setShattered(true);
  });

  return (
    <group>
      {/* Stage 1: the pane is still whole, cracks racing across it. Stage 2
          swaps in the separable shards, which phase 3's tumble drives. */}
      {shattered ? (
        <mesh geometry={shardGeometry}>
          <shardGlassMaterial ref={shardMaterialRef} uNormalMap={normalMap} />
        </mesh>
      ) : (
        <GlassPane normalMap={normalMap} interactive={false} />
      )}

      <mesh geometry={crackGeometry}>
        <crackOverlayMaterial
          ref={crackMaterialRef}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
