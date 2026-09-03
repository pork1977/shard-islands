"use client";

import { Canvas } from "@react-three/fiber";

// Phase 0 scaffold: a single spinning cube proves the render pipeline (Next.js
// client-only mount, R3F canvas, 60fps) works end to end before any of the
// real fracture/world/flight work gets built on top of it.
function SpinningCube() {
  return (
    <mesh rotation={[0.4, 0.4, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#7dd3fc" />
    </mesh>
  );
}

export default function Experience() {
  return (
    <Canvas camera={{ position: [2, 2, 3], fov: 50 }} dpr={[1, 2]}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 2]} intensity={1.2} />
      <SpinningCube />
    </Canvas>
  );
}
