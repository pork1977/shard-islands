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
import DraftHud from "./DraftHud";
import ClipHud from "./ClipHud";
import BeaconHud from "./BeaconHud";
import RollHud from "./RollHud";
import HowToPlay from "./HowToPlay";
import ShareScore from "./ShareScore";
import WorldScene from "./WorldScene";
import PlayerGlider from "@/components/world/PlayerGlider";
import RemoteGliders from "@/components/world/RemoteGliders";
import PlayerLabels from "@/components/world/PlayerLabels";
import RemoteTrails from "@/components/world/RemoteTrails";
import EnergyCores from "@/components/world/EnergyCores";
import ClipShards from "@/components/world/ClipShards";
import ClipBursts from "@/components/world/ClipBursts";
import Shockwaves from "@/components/world/Shockwaves";
import SceneProbe from "./SceneProbe";
import ControlsHint from "./ControlsHint";
import SpeedLines from "./SpeedLines";
import { generateFrostedGlassNormalTexture } from "@/lib/textures/frostedGlassNormal";
import { useGameStore } from "@/lib/store/useGameStore";
import { deviceTier, maxPixelRatio } from "@/lib/world/deviceTier";

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
      {/* the reason to go anywhere */}
      <EnergyCores />
      {/* and what is left of whoever lost a fight over one */}
      <ClipShards />
      <ClipBursts />
      {/* and the one interaction that takes nothing from anybody */}
      <Shockwaves />
      <SpeedLines />
      {/* development only: lets the scene graph be inspected from outside */}
      <SceneProbe />
    </>
  );
}

export default function Experience() {
  // The cursor stays visible. Hiding it in flight was tried and reverted:
  // dragging the pointer is how you look around, and doing that blind turns
  // out to be worse than the arrow being visible.
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
        // Capped at 1 on a phone. A full-screen render with a bloom pass
        // over it costs pixels, and a modern handset asks for three times
        // as many in each direction as it can usefully show at arm's
        // length — nine times the work for nothing.
        dpr={[1, maxPixelRatio()]}
      >
        <color attach="background" args={["#04080e"]} />
        <Stage />
        <EffectComposer>
          <Bloom
            intensity={0.75}
            luminanceThreshold={0.72}
            luminanceSmoothing={0.25}
            mipmapBlur
            // Half-resolution bloom on a phone. It is a blur: run at half
            // and then upsampled, the result is very nearly the same image
            // for a quarter of the pixels, and this is the pass that makes
            // iOS throttle when the sky fills with emissive trails.
            resolutionScale={deviceTier() === "low" ? 0.5 : 1}
          />
        </EffectComposer>
      </Canvas>
      <FallHud />
      <Presence />
      <Scoreboard />
      <DraftHud />
      <ClipHud />
      <BeaconHud />
      <RollHud />
      {/* a question mark for the people who want one, and nothing for the
          people who do not */}
      <HowToPlay />
      {/* only once there is a number worth boasting about */}
      <ShareScore />
      <NetDebug />
      <ControlsHint />
    </>
  );
}
