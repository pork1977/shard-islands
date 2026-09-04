"use client";

import { useRef } from "react";
import { extend, useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { SpeedLinesMaterial } from "@/lib/shaders/speedLines";
import { playerState } from "@/lib/net/playerState";
import { useGameStore } from "@/lib/store/useGameStore";
import { PLUNGE_AT, PLUNGE_DURATION } from "@/lib/timeline";
import { FLIGHT } from "@shard-islands/shared";

extend({ SpeedLinesMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    speedLinesMaterial: ThreeElements["meshBasicMaterial"] & {
      uTime?: number;
      uIntensity?: number;
      uAspect?: number;
      uFocus?: number;
      uTint?: number[];
    };
  }
}

/**
 * The whoosh: builds through the free fall, and kicks in again on boost.
 *
 * Drawn as a clip-space quad with depthTest off and a high renderOrder, so
 * it always sits over the scene without needing a post-processing pass.
 */
export default function SpeedLines() {
  const materialRef = useRef<InstanceType<typeof SpeedLinesMaterial>>(null);
  const { size } = useThree();
  const phase = useGameStore((s) => s.phase);
  const strikeAt = useGameStore((s) => s.strikeAt);
  const shown = useRef(0);

  useFrame((state, rawDelta) => {
    const mat = materialRef.current;
    if (!mat) return;
    const dt = Math.min(rawDelta, 1 / 20);

    mat.uTime = state.clock.elapsedTime;
    mat.uAspect = size.width / size.height;

    let target = 0;
    if (phase === "fracturing") {
      // ramps with the fall, easing off right at the end so the arrival is calm
      const t = (performance.now() - strikeAt) / 1000;
      const p = THREE.MathUtils.clamp((t - PLUNGE_AT) / PLUNGE_DURATION, 0, 1);
      target = Math.pow(p, 1.4) * (1 - THREE.MathUtils.smoothstep(p, 0.86, 1));
      mat.uFocus = 0.5;
    } else if (phase === "flying") {
      // only above cruise, so ordinary flight stays clear
      const over = playerState.speed / FLIGHT.baseForwardSpeed - 1.05;
      target = THREE.MathUtils.clamp(over * 1.5, 0, 1);
      mat.uFocus = 0.45;
    }

    // eased so boost does not snap the streaks on and off
    shown.current += (target - shown.current) * Math.min(1, dt * 4.5);
    mat.uIntensity = shown.current;
  });

  return (
    <mesh frustumCulled={false} renderOrder={999}>
      <planeGeometry args={[2, 2]} />
      <speedLinesMaterial
        ref={materialRef}
        transparent
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
