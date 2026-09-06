"use client";

import { useEffect, useMemo, useRef } from "react";
import { extend, useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { GlassFloorMaterial } from "@/lib/shaders/glassFloor";
import { generateHandprintTexture } from "@/lib/textures/handprintTexture";
import { generateRadialGlowTexture } from "@/lib/textures/radialGlowTexture";
import { generateSprayTextTexture } from "@/lib/textures/sprayTexture";
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

/**
 * One word, sprayed on the wrong side of the glass.
 *
 * Reverse psychology, because an instruction would break the spell: a page
 * that says "press here" is a product, and a page that says DON'T is a dare.
 * It sits low and off-centre, angled, well away from the handprint — the
 * hand is still the invitation, and this is just something somebody wrote.
 *
 * Its position has to follow the viewport, which it did not at first. The
 * camera's vertical field of view is fixed, so the WIDTH of world visible
 * shrinks with the aspect ratio: a place that is comfortably off to one
 * side on a laptop is off the edge entirely on a phone held upright. The
 * word read "N'T" on a portrait screen — on the one screen this whole
 * project opens with, and the one most likely to be seen on a phone first.
 */
function Graffiti() {
  const texture = useMemo(() => generateSprayTextTexture("DON'T"), []);
  const meshRef = useRef<THREE.Mesh>(null);
  const viewport = useThree((state) => state.viewport);

  const WIDTH = 2.5;
  const MARGIN = 0.25;

  // Shrink only when there is genuinely not enough room, so the desktop
  // composition — which is the one that was art directed — is untouched.
  const scale = Math.min(1, (viewport.width - MARGIN * 2) / WIDTH);
  // Then sit as far off-centre as it can while staying wholly on screen.
  const roomToTheLeft = viewport.width / 2 - (WIDTH * scale) / 2 - MARGIN;
  const x = -Math.min(1.15, Math.max(0, roomToTheLeft));

  useFrame((state) => {
    if (!meshRef.current) return;
    // barely alive, as if the light behind the glass moves past it
    const t = state.clock.elapsedTime;
    const material = meshRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = 0.26 + Math.sin(t * 0.7) * 0.035;
  });

  return (
    <mesh
      ref={meshRef}
      position={[x, -1.05, 0.008]}
      rotation={[0, 0, -0.07]}
      scale={[scale, scale, 1]}
      raycast={() => null}
    >
      <planeGeometry args={[WIDTH, 1.05]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.26}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
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
      <Graffiti />
      <HandprintHotspot />
    </group>
  );
}
