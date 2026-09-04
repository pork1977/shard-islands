"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import GlassFloor from "./GlassFloor";
import FractureScene from "./FractureScene";
import WorldScene from "./WorldScene";
import PlayerGlider from "@/components/world/PlayerGlider";
import ControlsHint from "./ControlsHint";
import { generateFrostedGlassNormalTexture } from "@/lib/textures/frostedGlassNormal";
import { useGameStore } from "@/lib/store/useGameStore";

function Stage() {
  // one bake, shared by the intact pane and the shards, so the broken pane
  // keeps exactly the same surface texture
  const normalMap = useMemo(() => generateFrostedGlassNormalTexture(), []);

  const phase = useGameStore((s) => s.phase);

  if (phase === "landing") return <GlassFloor normalMap={normalMap} />;

  return (
    <>
      <WorldScene />
      {/* the broken pane stays mounted while it is still falling away */}
      {phase === "fracturing" && <FractureScene normalMap={normalMap} />}
      {phase === "flying" && <PlayerGlider />}
    </>
  );
}

export default function Experience() {
  return (
    <>
      <Canvas camera={{ position: [0, 0, 5], fov: 50, far: 5000 }} dpr={[1, 2]}>
        <color attach="background" args={["#04080e"]} />
        <Stage />
        <EffectComposer>
          <Bloom
            intensity={0.75}
            luminanceThreshold={0.72}
            luminanceSmoothing={0.25}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
      <ControlsHint />
    </>
  );
}
