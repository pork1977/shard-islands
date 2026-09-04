"use client";

import { useMemo } from "react";
import * as THREE from "three";

/**
 * Placeholder for the world beneath the glass — phase 4 replaces this with
 * the real Shard Islands.
 *
 * The drifting motes are not decoration: without objects at a range of
 * depths there is no motion parallax, and a camera plunging through the
 * broken pane would read as nothing happening at all. They give the fall
 * something to move past.
 */
export default function VoidBackdrop({ impact }: { impact: [number, number] }) {
  const motes = useMemo(() => {
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 26;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 26;
      // spread through the depth the camera will travel
      positions[i * 3 + 2] = -2 - Math.random() * 55;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, []);

  const glow = useMemo(() => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(190,240,255,0.45)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }, []);

  return (
    <group>
      {/* The far depths. Kept small, dim and distant: a large bright additive
          plane just fills the view with flat cyan once the camera arrives,
          which reads as a painted wall rather than an abyss. */}
      <mesh position={[impact[0] * 0.4, impact[1] * 0.4, -95]}>
        <planeGeometry args={[55, 55]} />
        <meshBasicMaterial
          map={glow}
          transparent
          color="#3fd0ff"
          opacity={0.22}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <points geometry={motes}>
        <pointsMaterial
          // alphaMap makes them soft round motes; bare points render as squares
          map={glow}
          alphaTest={0.01}
          size={0.14}
          sizeAttenuation
          color="#9fe9ff"
          transparent
          opacity={0.7}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  );
}
