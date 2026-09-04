"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  terrainHeightAt,
  TERRAIN_BASE_Z,
  TERRAIN_SIZE,
  WATER_HEIGHT,
} from "@/lib/world/generateTerrain";

/**
 * The Beacon: one enormous spiked dome, sited once per session.
 *
 * A map needs one thing visible from anywhere for orientation and for
 * somewhere to aim at on the way down. It is deliberately the only object
 * of its kind — a landmark you can see from across the world stops being a
 * landmark the moment there are five of them.
 */
export default function Monolith() {
  const site = useMemo(() => {
    // deterministic per load: pick high, dry, gently sloped ground away from
    // the middle so it reads as a discovery rather than as the spawn point
    let best: { x: number; y: number; h: number } | null = null;
    for (let i = 0; i < 700; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = TERRAIN_SIZE * (0.14 + Math.random() * 0.16);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      const h = terrainHeightAt(x, y);
      if (h < WATER_HEIGHT + 12) continue;
      if (!best || h > best.h) best = { x, y, h };
    }
    return best ?? { x: 0, y: 0, h: 40 };
  }, []);

  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const beamsRef = useRef<THREE.Group>(null);

  const spikes = useMemo(() => {
    const out: { rot: [number, number, number]; len: number }[] = [];
    const count = 26;
    for (let i = 0; i < count; i++) {
      // spread over the upper hemisphere, avoiding a neat ring
      const theta = Math.acos(1 - Math.random() * 0.95);
      const phi = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      out.push({
        rot: [theta * Math.cos(phi), theta * Math.sin(phi), phi],
        len: 26 + Math.random() * 40,
      });
    }
    return out;
  }, []);

  const domeGeo = useMemo(() => {
    // faceted hemisphere, flat-shaded to match the world's low-poly language
    const g = new THREE.SphereGeometry(58, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    g.rotateX(Math.PI / 2); // +Z up
    const faceted = g.toNonIndexed();
    faceted.computeVertexNormals();
    g.dispose();
    return faceted;
  }, []);

  const spikeGeo = useMemo(() => {
    const g = new THREE.ConeGeometry(3.6, 1, 5);
    g.translate(0, 0.5, 0); // base at origin so it grows outward
    g.rotateX(Math.PI / 2);
    return g;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.12;
      const s = 1 + Math.sin(t * 0.9) * 0.03;
      ringRef.current.scale.set(s, s, 1);
    }
    if (beamsRef.current) {
      beamsRef.current.rotation.z = -t * 0.05;
      beamsRef.current.children.forEach((b, i) => {
        const m = (b as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = 0.10 + 0.07 * (0.5 + 0.5 * Math.sin(t * 1.3 + i * 1.7));
      });
    }
  });

  const z = TERRAIN_BASE_Z + site.h;

  return (
    <group ref={groupRef} position={[site.x, site.y, z - 6]}>
      <mesh geometry={domeGeo}>
        <meshLambertMaterial color="#171a2e" emissive="#2a1150" emissiveIntensity={0.6} />
      </mesh>

      {spikes.map((s, i) => (
        <mesh
          key={i}
          geometry={spikeGeo}
          rotation={[s.rot[0], s.rot[1], 0]}
          scale={[1, 1, s.len]}
        >
          <meshLambertMaterial color="#2b1c4d" emissive="#7a2bff" emissiveIntensity={0.9} />
        </mesh>
      ))}

      {/* halo lying on the ground around the base */}
      <mesh ref={ringRef} position={[0, 0, 1]}>
        <ringGeometry args={[70, 96, 64]} />
        <meshBasicMaterial
          color="#b06bff"
          transparent
          opacity={0.28}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* light shafts climbing into the sky, visible from far across the map */}
      <group ref={beamsRef}>
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2;
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * 26, Math.sin(a) * 26, 150]}
              rotation={[0, 0, a]}
            >
              <planeGeometry args={[16, 300]} />
              <meshBasicMaterial
                color="#c48bff"
                transparent
                opacity={0.14}
                side={THREE.DoubleSide}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}
