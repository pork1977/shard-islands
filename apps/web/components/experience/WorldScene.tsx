"use client";

import { useMemo, useRef } from "react";
import { extend, useFrame, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { CrystalIslandMaterial } from "@/lib/shaders/crystalIsland";
import { NebulaMaterial } from "@/lib/shaders/nebula";
import { useGameStore } from "@/lib/store/useGameStore";
import { revealAt } from "@/lib/timeline";
import type { WorldSpec, IslandSpec, MirrorSpec } from "@/lib/world/generateWorld";

extend({ CrystalIslandMaterial, NebulaMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    crystalIslandMaterial: ThreeElements["meshBasicMaterial"] & {
      uTime?: number;
      uReveal?: number;
      uBase?: THREE.ColorRepresentation;
      uVein?: THREE.ColorRepresentation;
      uRim?: THREE.ColorRepresentation;
      uFogColor?: THREE.ColorRepresentation;
      uSeed?: number;
    };
    nebulaMaterial: ThreeElements["meshBasicMaterial"] & {
      uTime?: number;
      uReveal?: number;
      uDeep?: THREE.ColorRepresentation;
      uViolet?: THREE.ColorRepresentation;
      uMagenta?: THREE.ColorRepresentation;
      uTeal?: THREE.ColorRepresentation;
    };
  }
}

/** Seconds since the strike — the world blooms on the fracture's schedule. */
function useReveal() {
  const strikeAt = useGameStore((s) => s.strikeAt);
  const ref = useRef(0);
  useFrame(() => {
    ref.current = revealAt((performance.now() - strikeAt) / 1000);
  });
  return ref;
}

function Nebula({ reveal }: { reveal: React.RefObject<number> }) {
  const materialRef = useRef<InstanceType<typeof NebulaMaterial>>(null);

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uTime = state.clock.elapsedTime;
    materialRef.current.uReveal = reveal.current ?? 0;
    // keep the sky centred on the viewer so it never gets left behind
    state.scene.getObjectByName("nebula")?.position.copy(state.camera.position);
  });

  return (
    <mesh name="nebula" renderOrder={-1}>
      <sphereGeometry args={[220, 32, 24]} />
      <nebulaMaterial ref={materialRef} side={THREE.BackSide} depthWrite={false} />
    </mesh>
  );
}

/**
 * Vertical gradient for the neon falls: bright and wide where the fluid
 * leaves the rim, thinning and fading to nothing as it drops away. A flat
 * quad with a radial glow on it just reads as a straight pole.
 */
function makeFallTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(w, h);

  for (let y = 0; y < h; y++) {
    const t = y / (h - 1); // 0 at the rim, 1 at the tail
    const fade = Math.pow(1 - t, 1.7);
    const narrow = 0.22 + t * 0.55; // stream pinches as it falls
    for (let x = 0; x < w; x++) {
      const u = (x / (w - 1)) * 2 - 1;
      const across = Math.exp(-(u * u) / (narrow * narrow));
      const a = across * fade;
      const o = (y * w + x) * 4;
      image.data[o] = 255;
      image.data[o + 1] = 255;
      image.data[o + 2] = 255;
      image.data[o + 3] = Math.min(255, a * 255);
    }
  }

  ctx.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function Island({
  spec,
  fallTexture,
  reveal,
}: {
  spec: IslandSpec;
  fallTexture: THREE.Texture;
  reveal: React.RefObject<number>;
}) {
  const materialRef = useRef<InstanceType<typeof CrystalIslandMaterial>>(null);

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uTime = state.clock.elapsedTime;
    materialRef.current.uReveal = reveal.current ?? 0;
  });

  return (
    <group position={spec.position} rotation={spec.rotation} scale={spec.scale}>
      <mesh geometry={spec.geometry}>
        <crystalIslandMaterial ref={materialRef} uSeed={spec.seed} uVein={spec.hue} />
      </mesh>

      {/* neon fluid pouring off the rim and falling away into the void */}
      {spec.falls.map(([angle, length], i) => (
        <mesh
          key={i}
          position={[Math.cos(angle) * 0.7, -0.35 - length / 2, Math.sin(angle) * 0.7]}
          rotation={[0, -angle, 0]}
        >
          <planeGeometry args={[0.5, length]} />
          <meshBasicMaterial
            map={fallTexture}
            transparent
            color={spec.hue}
            opacity={0.55}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function MirrorShard({ spec }: { spec: MirrorSpec }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (ref.current) ref.current.rotation.z = state.clock.elapsedTime * spec.spin;
  });

  return (
    <mesh ref={ref} position={spec.position} rotation={spec.rotation}>
      <planeGeometry args={spec.scale} />
      <meshBasicMaterial
        color={spec.tint}
        transparent
        opacity={0.3}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

export default function WorldScene({
  world,
  impact,
}: {
  world: WorldSpec;
  impact: [number, number];
}) {
  const glow = useMemo(() => {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(190,240,255,0.5)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }, []);

  const fallTexture = useMemo(() => makeFallTexture(), []);

  const motes = useMemo(() => {
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 2] = -2 - Math.random() * 110;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, []);

  const reveal = useReveal();

  return (
    <group>
      <Nebula reveal={reveal} />

      {/* The Infinite Core, far below everything */}
      <mesh position={[impact[0] * 0.3, impact[1] * 0.3, -150]}>
        <planeGeometry args={[90, 90]} />
        <meshBasicMaterial
          map={glow}
          transparent
          // warm magenta core, so the depths read as a different light source
          // from the cyan fracture above rather than more of the same
          color="#ff5fb0"
          opacity={0.34}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {world.mirrors.map((spec, i) => (
        <MirrorShard key={i} spec={spec} />
      ))}

      {world.islands.map((spec, i) => (
        <Island key={i} spec={spec} fallTexture={fallTexture} reveal={reveal} />
      ))}

      {/* motes give the plunge motion parallax — without something at varying
          depths to move past, a falling camera reads as no movement at all */}
      <points geometry={motes}>
        <pointsMaterial
          map={glow}
          alphaTest={0.01}
          size={0.16}
          sizeAttenuation
          color="#9fe9ff"
          transparent
          opacity={0.6}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  );
}
