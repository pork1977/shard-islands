"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

/**
 * Puts the live scene on `window.__shardScene`, in development only.
 *
 * There is one thing that cannot be checked any other way. A component that
 * throws is loud — the canvas goes with it. A component that renders
 * nothing is completely silent: the sky looks exactly as it did, and the
 * only way to tell "there are no shards out there" from "the shards are
 * being drawn at zero scale" is to ask the scene graph.
 *
 * Screenshots cannot settle it either, because whether a thing is on screen
 * depends on where the camera happens to be looking. This does not.
 *
 * Stripped entirely from a production build.
 */
export default function SceneProbe() {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const clock = useThree((s) => s.clock);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as Record<string, unknown>;
    w.__shardScene = scene;
    w.__shardCamera = camera;
    // The clock too: every animation in the scene is a function of it, so
    // "is this thing animating" is unanswerable without being able to read
    // the number the animation is reading.
    w.__shardClock = clock;
    // The renderer, so a one-off frame can be drawn from a camera of your
    // own choosing. The chase camera owns the real one and overwrites it
    // every frame, which makes "point the camera at that and let me look"
    // otherwise impossible.
    w.__shardGl = gl;
    return () => {
      delete w.__shardScene;
      delete w.__shardCamera;
      delete w.__shardClock;
      delete w.__shardGl;
    };
  }, [scene, camera, clock, gl]);

  return null;
}
