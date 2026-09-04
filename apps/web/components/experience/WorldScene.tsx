"use client";

import { useMemo, useRef } from "react";
import { extend, useFrame, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { SkyMaterial } from "@/lib/shaders/sky";
import { TerrainMaterial } from "@/lib/shaders/terrain";
import {
  generateTerrain,
  TERRAIN_BASE_Z,
  TERRAIN_MAX_HEIGHT,
  TERRAIN_SIZE,
  WATER_HEIGHT,
} from "@/lib/world/generateTerrain";
import { useGameStore } from "@/lib/store/useGameStore";
import { revealAt } from "@/lib/timeline";

extend({ SkyMaterial, TerrainMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    skyMaterial: ThreeElements["meshBasicMaterial"] & {
      uTime?: number;
      uReveal?: number;
      uZenith?: THREE.ColorRepresentation;
      uHorizon?: THREE.ColorRepresentation;
      uSunColor?: THREE.ColorRepresentation;
      uCloud?: THREE.ColorRepresentation;
      uSunDir?: THREE.Vector3;
    };
    terrainMaterial: ThreeElements["meshBasicMaterial"] & {
      uTime?: number;
      uReveal?: number;
      uMaxHeight?: number;
      uWaterHeight?: number;
      uFogColor?: THREE.ColorRepresentation;
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

function Sky({ reveal }: { reveal: React.RefObject<number> }) {
  const materialRef = useRef<InstanceType<typeof SkyMaterial>>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uTime = state.clock.elapsedTime;
      materialRef.current.uReveal = reveal.current ?? 0;
    }
    // stays centred on the viewer so it can never be flown out of
    meshRef.current?.position.copy(state.camera.position);
  });

  return (
    <mesh ref={meshRef} renderOrder={-1}>
      <sphereGeometry args={[600, 32, 24]} />
      <skyMaterial ref={materialRef} side={THREE.BackSide} depthWrite={false} />
    </mesh>
  );
}

function Land({ reveal }: { reveal: React.RefObject<number> }) {
  const materialRef = useRef<InstanceType<typeof TerrainMaterial>>(null);
  const terrain = useMemo(() => generateTerrain(), []);

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uTime = state.clock.elapsedTime;
    materialRef.current.uReveal = reveal.current ?? 0;
  });

  return (
    <>
      <mesh geometry={terrain.geometry} position={[0, 0, TERRAIN_BASE_Z]}>
        <terrainMaterial
          ref={materialRef}
          uMaxHeight={TERRAIN_MAX_HEIGHT}
          uWaterHeight={WATER_HEIGHT}
        />
      </mesh>

      {/* standing water filling the low ground */}
      <mesh position={[0, 0, TERRAIN_BASE_Z + WATER_HEIGHT]}>
        <planeGeometry args={[TERRAIN_SIZE, TERRAIN_SIZE]} />
        <meshBasicMaterial color="#2d7fb8" transparent opacity={0.82} />
      </mesh>
    </>
  );
}

/**
 * Soft cloud alpha, built once. Clouds replace the floating boulders that
 * used to provide parallax on the way down — they get in the way far less,
 * and falling through a cloud deck sells altitude better than rocks do.
 */
function makeCloudTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);

  const h = (x: number, y: number) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const vnoise = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    return (
      h(ix, iy) * (1 - ux) * (1 - uy) +
      h(ix + 1, iy) * ux * (1 - uy) +
      h(ix, iy + 1) * (1 - ux) * uy +
      h(ix + 1, iy + 1) * ux * uy
    );
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 6;
      const v = (y / size) * 6;
      let n = vnoise(u, v) * 0.55 + vnoise(u * 2.3, v * 2.3) * 0.3 + vnoise(u * 5, v * 5) * 0.15;
      // fade to nothing at the edges so each puff is a soft island
      const dx = x / size - 0.5;
      const dy = y / size - 0.5;
      const edge = 1 - Math.min(1, Math.hypot(dx, dy) * 2.1);
      n *= Math.max(0, edge);
      const a = Math.max(0, Math.min(1, (n - 0.28) * 3.2));
      const o = (y * size + x) * 4;
      image.data[o] = 255;
      image.data[o + 1] = 255;
      image.data[o + 2] = 255;
      image.data[o + 3] = a * 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

interface CloudSpec {
  position: [number, number, number];
  scale: number;
  opacity: number;
  rotation: number;
}

function Clouds({ texture }: { texture: THREE.Texture }) {
  const specs = useMemo<CloudSpec[]>(() => {
    const out: CloudSpec[] = [];
    // Layered decks through the whole descent, so the long fall keeps
    // passing something. Density thins near the ground so the landscape is
    // clear once flight begins.
    for (let i = 0; i < 150; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.pow(Math.random(), 0.6) * 620;
      const t = Math.random();
      out.push({
        position: [
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          -25 - t * 420,
        ],
        scale: 90 + Math.random() * 230,
        opacity: 0.2 + Math.random() * 0.45,
        rotation: Math.random() * Math.PI,
      });
    }
    return out;
  }, []);

  return (
    <group>
      {specs.map((c, i) => (
        <mesh key={i} position={c.position} rotation={[0, 0, c.rotation]}>
          <planeGeometry args={[c.scale, c.scale]} />
          <meshBasicMaterial
            map={texture}
            transparent
            opacity={c.opacity}
            color="#ffffff"
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

export default function WorldScene() {
  const reveal = useReveal();
  const cloudTexture = useMemo(() => makeCloudTexture(), []);

  return (
    <group>
      <Sky reveal={reveal} />
      <Land reveal={reveal} />
      <Clouds texture={cloudTexture} />
    </group>
  );
}
