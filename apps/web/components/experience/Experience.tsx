"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import GlassFloor from "./GlassFloor";
import FractureScene from "./FractureScene";
import WorldScene from "./WorldScene";
import PlayerGlider from "@/components/world/PlayerGlider";
import { generateFrostedGlassNormalTexture } from "@/lib/textures/frostedGlassNormal";
import { generateWorld } from "@/lib/world/generateWorld";
import { useGameStore } from "@/lib/store/useGameStore";

function Stage() {
  // one bake, shared by the intact pane and the shards, so the broken pane
  // keeps exactly the same surface texture
  const normalMap = useMemo(() => generateFrostedGlassNormalTexture(), []);

  // Built at mount, while the landing screen is still up, so the world is
  // already in memory the instant the floor gives way. Generating it on
  // demand would put a hitch at exactly the moment the premise forbids one.
  const world = useMemo(() => generateWorld(), []);

  const phase = useGameStore((s) => s.phase);
  const impact = useGameStore((s) => s.impact);
  const impact2D: [number, number] = impact ? [impact[0], impact[1]] : [0, 0];

  if (phase === "landing") return <GlassFloor normalMap={normalMap} />;

  return (
    <>
      <WorldScene world={world} impact={impact2D} />
      {/* the broken pane stays mounted while it is still falling away */}
      {phase === "fracturing" && <FractureScene normalMap={normalMap} />}
      {phase === "flying" && <PlayerGlider />}
    </>
  );
}

export default function Experience() {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 50 }} dpr={[1, 2]}>
      <color attach="background" args={["#04080e"]} />
      <Stage />
      <EffectComposer>
        <Bloom intensity={1.0} luminanceThreshold={0.5} luminanceSmoothing={0.25} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
