"use client";

import { useMemo, useRef } from "react";
import { extend, useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { GlassFloorMaterial } from "@/lib/shaders/glassFloor";
import { generateHandprintTexture } from "@/lib/textures/handprintTexture";
import { generateRadialGlowTexture } from "@/lib/textures/radialGlowTexture";
import { generateFrostedGlassNormalTexture } from "@/lib/textures/frostedGlassNormal";

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

function GlassPane() {
  const materialRef = useRef<InstanceType<typeof GlassFloorMaterial>>(null);
  const { viewport } = useThree();
  const normalMap = useMemo(() => generateFrostedGlassNormalTexture(), []);

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uTime = state.clock.elapsedTime;
    materialRef.current.uAspect = viewport.width / viewport.height;
  });

  return (
    <mesh scale={[viewport.width, viewport.height, 1]}>
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
      <mesh position={[0, 0, -0.001]}>
        <planeGeometry args={[2.6, 2.6]} />
        <meshBasicMaterial
          map={glowTexture}
          transparent
          color="#dff4ff"
          opacity={0.3}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      {/* the print itself is an etched decal, NOT additive — additive on a
          bright pane clips to white and the fingers merge into one blob */}
      <mesh>
        <planeGeometry args={[1.1, 1.1]} />
        <meshBasicMaterial
          map={handTexture}
          transparent
          color="#f2fdff"
          opacity={0.85}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export default function GlassFloor() {
  return (
    <group>
      <GlassPane />
      <HandprintHotspot />
    </group>
  );
}
