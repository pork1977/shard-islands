"use client";

import { useEffect, useMemo, useRef } from "react";
import { extend, useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { GlassFloorMaterial } from "@/lib/shaders/glassFloor";
import { generateHandprintTexture } from "@/lib/textures/handprintTexture";
import { generateRadialGlowTexture } from "@/lib/textures/radialGlowTexture";
import { useGameStore } from "@/lib/store/useGameStore";
import { prewarmWorld } from "@/lib/world/prewarm";
import { beginJoin } from "@/lib/net/connection";

extend({ GlassFloorMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    glassFloorMaterial: ThreeElements["meshBasicMaterial"] & {
      uTime?: number;
      uAspect?: number;
      uNormalMap?: THREE.Texture | null;
      uGlassColor?: THREE.ColorRepresentation;
      uLightColor?: THREE.ColorRepresentation;
      uCoolColor?: THREE.ColorRepresentation;
      uLightPos?: THREE.Vector2;
    };
  }
}

export function GlassPane({
  normalMap,
  interactive = true,
}: {
  normalMap: THREE.Texture;
  interactive?: boolean;
}) {
  const materialRef = useRef<InstanceType<typeof GlassFloorMaterial>>(null);
  const { viewport } = useThree();
  const strike = useGameStore((s) => s.strike);

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uTime = state.clock.elapsedTime;
    materialRef.current.uAspect = viewport.width / viewport.height;
  });

  return (
    <mesh
      scale={[viewport.width, viewport.height, 1]}
      // The whole pane is the target, not just the handprint — a small child
      // smacking anywhere on the screen has to work.
      onPointerDown={
        interactive
          ? (e) => {
              e.stopPropagation();
              // Both at once, and neither waits for the other. The join has
              // the whole fracture and fall to complete in; if it does not,
              // the player flies alone until it does.
              beginJoin();
              strike([e.point.x, e.point.y, e.point.z]);
            }
          : undefined
      }
    >
      <planeGeometry args={[1, 1]} />
      <glassFloorMaterial ref={materialRef} uNormalMap={normalMap} />
    </mesh>
  );
}

function HandprintHotspot() {
  const handTexture = useMemo(() => generateHandprintTexture(), []);
  const glowTexture = useMemo(() => generateRadialGlowTexture(), []);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const breathe = 1 + Math.sin(t * 1.6) * 0.04;
    groupRef.current.scale.setScalar(breathe);

    const bleed = groupRef.current.children[0] as THREE.Mesh;
    (bleed.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(t * 1.6) * 0.09;

    const hand = groupRef.current.children[1] as THREE.Mesh;
    (hand.material as THREE.MeshBasicMaterial).opacity = 0.8 + Math.sin(t * 1.6) * 0.12;
  });

  return (
    <group ref={groupRef} position={[0, 0, 0.01]}>
      {/* light bleeding through the thinner, etched area of the pane —
          physically plausible, and it's what invites the touch */}
      <mesh position={[0, 0, -0.001]} raycast={() => null}>
        <planeGeometry args={[2.6, 2.6]} />
        <meshBasicMaterial
          map={glowTexture}
          transparent
          color="#4fd8ff"
          opacity={0.35}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      {/* Etched area lit from beneath. Additive is safe now the pane is dark —
          it only clipped the fingers into a blob back when the glass was pale. */}
      <mesh raycast={() => null}>
        <planeGeometry args={[1.1, 1.1]} />
        <meshBasicMaterial
          map={handTexture}
          transparent
          color="#9fe9ff"
          opacity={0.85}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export default function GlassFloor({ normalMap }: { normalMap: THREE.Texture }) {
  // the world below is built during this screen, not during the break
  useEffect(() => {
    prewarmWorld();
  }, []);

  return (
    <group>
      <GlassPane normalMap={normalMap} />
      <HandprintHotspot />
    </group>
  );
}
