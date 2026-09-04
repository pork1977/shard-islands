"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import GlassFloor from "./GlassFloor";
import FractureScene from "./FractureScene";
import VoidBackdrop from "./VoidBackdrop";
import { generateFrostedGlassNormalTexture } from "@/lib/textures/frostedGlassNormal";
import { useGameStore } from "@/lib/store/useGameStore";

function Stage() {
  // one bake, shared by the intact pane and the shards, so the broken pane
  // keeps exactly the same surface texture
  const normalMap = useMemo(() => generateFrostedGlassNormalTexture(), []);
  const phase = useGameStore((s) => s.phase);
  const impact = useGameStore((s) => s.impact);

  if (phase === "landing") return <GlassFloor normalMap={normalMap} />;

  return (
    <>
      <VoidBackdrop impact={impact ? [impact[0], impact[1]] : [0, 0]} />
      <FractureScene normalMap={normalMap} />
    </>
  );
}

export default function Experience() {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 50 }} dpr={[1, 2]}>
      <Stage />
      <EffectComposer>
        <Bloom intensity={1.0} luminanceThreshold={0.5} luminanceSmoothing={0.25} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
