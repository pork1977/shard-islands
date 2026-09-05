"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import GlassFloor from "./GlassFloor";
import FractureScene from "./FractureScene";
import FallMotes from "./FallMotes";
import FallHud from "./FallHud";
import Presence from "./Presence";
import NetDebug from "./NetDebug";
import Scoreboard from "./Scoreboard";
import WorldScene from "./WorldScene";
import PlayerGlider from "@/components/world/PlayerGlider";
import RemoteGliders from "@/components/world/RemoteGliders";
import PlayerLabels from "@/components/world/PlayerLabels";
import RemoteTrails from "@/components/world/RemoteTrails";
import ControlsHint from "./ControlsHint";
import SpeedLines from "./SpeedLines";
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
      {/* what there is to do on the way down, and where you are going to land */}
      {phase === "fracturing" && <FallMotes />}
      {phase === "flying" && <PlayerGlider />}
      {/* other people, visible from the moment the world is */}
      <RemoteGliders />
      {/* names over every craft, gold on whoever is winning */}
      <PlayerLabels />
      {/* and their trails, which are what the score actually is */}
      <RemoteTrails />
      <SpeedLines />
    </>
  );
}

export default function Experience() {
  return (
    <>
      {/*
        The near plane matters more than it looks. At the default 0.1 against
        a far plane of 5000 the depth buffer spends almost all its precision
        in the first few metres, and by the time the ground is hundreds of
        metres away two surfaces at the same height cannot be told apart —
        which is exactly what made every pool of water crawl and flicker on
        the way down. Nothing in this scene is ever within a metre of the
        lens, so the range starts at 1.
      */}
      <Canvas
        camera={{ position: [0, 0, 5], fov: 50, near: 1, far: 5000 }}
        dpr={[1, 2]}
      >
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
      <FallHud />
      <Presence />
      <Scoreboard />
      <NetDebug />
      <ControlsHint />
    </>
  );
}
