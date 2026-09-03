"use client";

import { useMemo, useRef } from "react";
import { extend, useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { GlassFloorMaterial } from "@/lib/shaders/glassFloor";
import { generateHandprintTexture } from "@/lib/textures/handprintTexture";
import { generateRadialGlowTexture } from "@/lib/textures/radialGlowTexture";

extend({ GlassFloorMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    glassFloorMaterial: ThreeElements["meshBasicMaterial"] & {
      uTime?: number;
      uColor?: THREE.ColorRepresentation;
      uHighlight?: THREE.ColorRepresentation;
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
  const handTexture = useMemo(() => generateHandprintTexture(), []);
  const glowTexture = useMemo(() => generateRadialGlowTexture(), []);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const breathe = 1 + Math.sin(t * 1.6) * 0.05;
    groupRef.current.scale.setScalar(breathe);
    const hand = groupRef.current.children[1] as THREE.Mesh;
    const mat = hand.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.75 + Math.sin(t * 1.6) * 0.2;
  });

  return (
    <group ref={groupRef} position={[0, 0, 0.01]}>
      {/* local shadow pool, darkens the glass just under the print for
          contrast instead of a screen-wide vignette */}
      <mesh position={[0, 0, -0.001]}>
        <planeGeometry args={[2.2, 2.2]} />
        <meshBasicMaterial
          map={glowTexture}
          transparent
          color="#0f1c26"
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <planeGeometry args={[1.1, 1.1]} />
        <meshBasicMaterial
          map={handTexture}
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
