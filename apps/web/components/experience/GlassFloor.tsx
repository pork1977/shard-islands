"use client";

import { useMemo, useRef } from "react";
import { extend, useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { GlassFloorMaterial } from "@/lib/shaders/glassFloor";
import { generateHandprintTexture } from "@/lib/textures/handprintTexture";

extend({ GlassFloorMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    glassFloorMaterial: ThreeElements["meshBasicMaterial"] & {
      uTime?: number;
      uColor?: THREE.ColorRepresentation;
      uRimColor?: THREE.ColorRepresentation;
    };
  }
}

function GlassPane() {
  const materialRef = useRef<InstanceType<typeof GlassFloorMaterial>>(null);
  const { viewport } = useThree();

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uTime = state.clock.elapsedTime;
    }
  });

  return (
    <mesh scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <glassFloorMaterial ref={materialRef} transparent />
    </mesh>
  );
}

function HandprintHotspot() {
  const texture = useMemo(() => generateHandprintTexture(), []);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const breathe = 1 + Math.sin(t * 1.6) * 0.05;
    groupRef.current.scale.setScalar(breathe);
    const glow = groupRef.current.children[0] as THREE.Mesh;
    const mat = glow.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.75 + Math.sin(t * 1.6) * 0.2;
  });

  return (
    <group ref={groupRef} position={[0, 0, 0.01]}>
      <mesh>
        <planeGeometry args={[1.1, 1.1]} />
        <meshBasicMaterial
          map={texture}
          transparent
          color="#cdf6ff"
          opacity={0.9}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
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
