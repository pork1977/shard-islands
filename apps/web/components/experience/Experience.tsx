"use client";

import { useEffect, useMemo } from "react";
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
import WorldScene from "./WorldScene";
import PlayerGlider from "@/components/world/PlayerGlider";
import RemoteGliders from "@/components/world/RemoteGliders";
import PlayerLabels from "@/components/world/PlayerLabels";
import RemoteTrails from "@/components/world/RemoteTrails";
import EnergyCores from "@/components/world/EnergyCores";
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
      {/* the reason to go anywhere */}
      <EnergyCores />
      <SpeedLines />
    </>
  );
}

/**
 * The cursor is only wanted while there is something to click.
 *
 * On the glass it is the whole invitation — a hand waiting to be pressed.
 * Once the pane is broken there is nothing left to point at, and an arrow
 * sitting in the sky is the one thing on screen that gives away that this
 * is a web page. Dragging still orbits the camera; it just does it blind,
 * which is how every flight game has ever done it.
 */
function useHiddenCursor(phase: string) {
  useEffect(() => {
    const hide = phase !== "landing";
    document.documentElement.classList.toggle("in-flight", hide);
    return () => document.documentElement.classList.remove("in-flight");
  }, [phase]);
}

export default function Experience() {
  const phase = useGameStore((s) => s.phase);
  useHiddenCursor(phase);

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
      <DraftHud />
      <NetDebug />
      <ControlsHint />
    </>
  );
}
