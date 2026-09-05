"use client";

import { useMemo, useRef } from "react";
import { extend, useFrame, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { SkyMaterial } from "@/lib/shaders/sky";
import { TerrainMaterial } from "@/lib/shaders/terrain";
import {
  getTerrain,
  TERRAIN_BASE_Z,
  TERRAIN_MAX_HEIGHT,
  TERRAIN_SIZE,
  WATER_HEIGHT,
} from "@/lib/world/generateTerrain";
import { getProps } from "@/lib/world/generateProps";
import WorldProps from "@/components/world/WorldProps";
import Monolith from "@/components/world/Monolith";
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
      uRoads?: THREE.Vector4[];
      uRoadCount?: number;
      uCity?: THREE.Vector4;
      uUrban?: THREE.ColorRepresentation;
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
  const terrain = useMemo(() => getTerrain(), []);

  // same generator the buildings use, so roads join the towns and the paved
  // ground lands under the city rather than beside it
  const layout = useMemo(() => {
    const { roads: segs, city } = getProps();
    const packed = Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 0, 0));
    segs.slice(0, 16).forEach((s, i) => packed[i].set(s[0], s[1], s[2], s[3]));
    return {
      packed,
      count: Math.min(segs.length, 16),
      city: new THREE.Vector4(city.cx, city.cy, city.radius, city.block),
    };
  }, []);

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
          uRoads={layout.packed}
          uRoadCount={layout.count}
          uCity={layout.city}
        />
      </mesh>

      {/* Standing water filling the low ground. The polygon offset settles
          the shoreline, where the sheet and the ground it cuts through are
          genuinely at the same height and would otherwise trade places from
          frame to frame. */}
      <mesh position={[0, 0, TERRAIN_BASE_Z + WATER_HEIGHT]}>
        <planeGeometry args={[TERRAIN_SIZE, TERRAIN_SIZE]} />
        <meshBasicMaterial
          color="#2d7fb8"
          transparent
          opacity={0.82}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-2}
        />
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

const CLOUD_COUNT = 260;

/**
 * The cloud decks, as ONE instanced mesh.
 *
 * They were two hundred and sixty separate meshes, each with its own
 * geometry and its own material, and measuring the frame found them costing
 * two hundred and two draw calls and four and a third milliseconds — for
 * four hundred triangles. Nothing else came close: the terrain draws a
 * hundred and eighty thousand triangles in a single call for free, and half
 * a million triangles of instanced trees and grass cost nothing measurable
 * at all. The clouds were three quarters of the frame, and it was entirely
 * the number of draws.
 *
 * One geometry, one material, one call. Size rides in each instance matrix;
 * opacity rides in an instanced attribute, which is the only part needing a
 * shader touch, because instance colour is RGB and these vary in alpha.
 *
 * Seeded rather than random, matching the terrain and the cores. Clouds are
 * the one place it genuinely would not matter if two players saw different
 * ones — but "everything in this world is generated the same way" is worth
 * more than the exception, and Math.random in a render is a lint error here
 * for good reasons of its own.
 */
function Clouds({ texture }: { texture: THREE.Texture }) {
  const mesh = useMemo(() => {
    let seed = 4242;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      // dusk-lit cloud, catching the low sun from underneath
      color: "#c99ab0",
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           attribute float aAlpha;
           varying float vCloudAlpha;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           vCloudAlpha = aAlpha;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           varying float vCloudAlpha;`,
        )
        .replace(
          "#include <dithering_fragment>",
          `#include <dithering_fragment>
           gl_FragColor.a *= vCloudAlpha;`,
        );
    };

    const instanced = new THREE.InstancedMesh(geometry, material, CLOUD_COUNT);
    instanced.frustumCulled = false;

    const alphas = new Float32Array(CLOUD_COUNT);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 0, 1);

    for (let i = 0; i < CLOUD_COUNT; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = Math.pow(rand(), 0.6) * 1100;
      const t = rand();
      const size = 90 + rand() * 230;

      position.set(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        // Stops well above the highest ground — decks that reach the terrain
        // smear white fog across the hills.
        -25 - t * 680,
      );
      quaternion.setFromAxisAngle(up, rand() * Math.PI);
      scale.set(size, size, 1);
      instanced.setMatrixAt(i, matrix.compose(position, quaternion, scale));

      alphas[i] = 0.2 + rand() * 0.45;
    }

    instanced.instanceMatrix.needsUpdate = true;
    geometry.setAttribute("aAlpha", new THREE.InstancedBufferAttribute(alphas, 1));

    return instanced;
  }, [texture]);

  return <primitive object={mesh} />;
}

export default function WorldScene() {
  const reveal = useReveal();
  const cloudTexture = useMemo(() => makeCloudTexture(), []);

  return (
    <group>
      {/* Everything else is hand-lit in its own shader, but the instanced
          buildings and trees use a standard material, which needs real
          lights. Matched to the sun direction baked into the shaders. */}
      <ambientLight intensity={0.55} color="#5a6ba8" />
      <directionalLight position={[-160, 62, 36]} intensity={1.5} color="#ffb06e" />

      <Sky reveal={reveal} />
      <Land reveal={reveal} />
      <WorldProps />
      <Monolith />
      <Clouds texture={cloudTexture} />
    </group>
  );
}
