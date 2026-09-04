"use client";

import { useEffect, useRef } from "react";

export interface FlightInput {
  /** -1..1, steer left/right. */
  turn: number;
  /** -1..1, nose down/up. */
  pitch: number;
  boosting: boolean;
  /** Camera orbit offsets in radians — look around WITHOUT steering. */
  lookYaw: number;
  lookPitch: number;
  /** Chase-camera distance multiplier, driven by the wheel. */
  zoom: number;
}

/**
 * Steering and free-look.
 *
 * Mouse drag orbits the camera and deliberately does NOT touch the flight
 * controls, so you can look around the craft while holding a heading.
 * Touch drag still steers, because a phone has no second input to spare —
 * splitting on pointer type is what lets one gesture mean the right thing
 * on each device. Keyboard always steers.
 */
export function useFlightControls(): React.RefObject<FlightInput> {
  const input = useRef<FlightInput>({
    turn: 0,
    pitch: 0,
    boosting: false,
    lookYaw: 0,
    lookPitch: 0,
    zoom: 1,
  });

  useEffect(() => {
    const keys = new Set<string>();
    const drag = {
      active: false,
      steering: false,
      originX: 0,
      originY: 0,
      baseYaw: 0,
      basePitch: 0,
    };

    // drag distance for full deflection, relative to screen size, so the
    // control feels the same on a phone as on a desktop monitor
    const range = () => Math.min(window.innerWidth, window.innerHeight) * 0.28;

    const onPointerDown = (e: PointerEvent) => {
      drag.active = true;
      drag.steering = e.pointerType !== "mouse";
      drag.originX = e.clientX;
      drag.originY = e.clientY;
      drag.baseYaw = input.current.lookYaw;
      drag.basePitch = input.current.lookPitch;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!drag.active) return;
      const dx = e.clientX - drag.originX;
      const dy = e.clientY - drag.originY;

      if (drag.steering) {
        const r = range();
        input.current.turn = clamp(dx / r, -1, 1);
        input.current.pitch = clamp(dy / r, -1, 1);
      } else {
        // Yaw is deliberately UNCLAMPED so the camera can swing the whole way
        // round the craft; a limit near half a turn makes it feel like it has
        // hit a wall just as you go to look behind you.
        input.current.lookYaw = drag.baseYaw - dx * 0.005;
        // pitch stays limited, or the camera tumbles over the top
        input.current.lookPitch = clamp(drag.basePitch - dy * 0.004, -1.15, 1.15);
      }
    };

    const endDrag = () => {
      if (drag.steering) {
        input.current.turn = 0;
        input.current.pitch = 0;
      }
      drag.active = false;
      drag.steering = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.key.toLowerCase());
      updateFromKeys();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase());
      updateFromKeys();
    };

    function updateFromKeys() {
      const left = keys.has("a") || keys.has("arrowleft");
      const right = keys.has("d") || keys.has("arrowright");
      const up = keys.has("w") || keys.has("arrowup");
      const down = keys.has("s") || keys.has("arrowdown");

      if (left || right || up || down) {
        input.current.turn = (right ? 1 : 0) - (left ? 1 : 0);
        input.current.pitch = (down ? 1 : 0) - (up ? 1 : 0);
      } else if (!drag.steering) {
        input.current.turn = 0;
        input.current.pitch = 0;
      }
      input.current.boosting = keys.has(" ") || keys.has("shift");
    }

    // right-drag is a legitimate way to swing the camera round, and a context
    // menu popping up mid-flight breaks it
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    // wheel forward pulls the camera in, wheel back pushes it out
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = Math.exp(e.deltaY * 0.0012);
      input.current.zoom = clamp(input.current.zoom * step, 0.35, 4.5);
    };

    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return input;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
