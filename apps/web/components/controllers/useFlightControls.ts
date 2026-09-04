"use client";

import { useEffect, useRef } from "react";

export interface FlightInput {
  /** -1..1, steer left/right. */
  turn: number;
  /** -1..1, nose down/up. */
  pitch: number;
  boosting: boolean;
}

/**
 * Steering input, unified across mouse and touch.
 *
 * Both go through Pointer Events on purpose: the brief requires a young
 * child to be able to fly this, so there is exactly one interaction —
 * press and drag in the direction you want to go, release to level out.
 * No multi-touch, no precision targets, no reading required. Keyboard is
 * added on top for adults who expect WASD, not as the primary path.
 */
export function useFlightControls(): React.RefObject<FlightInput> {
  const input = useRef<FlightInput>({ turn: 0, pitch: 0, boosting: false });

  useEffect(() => {
    const keys = new Set<string>();
    const drag = { active: false, originX: 0, originY: 0 };

    // drag distance needed for full deflection, relative to screen size, so
    // the control feels the same on a phone as on a desktop monitor
    const range = () => Math.min(window.innerWidth, window.innerHeight) * 0.28;

    const applyDrag = (x: number, y: number) => {
      const r = range();
      input.current.turn = clamp((x - drag.originX) / r, -1, 1);
      input.current.pitch = clamp((y - drag.originY) / r, -1, 1);
    };

    const onPointerDown = (e: PointerEvent) => {
      drag.active = true;
      drag.originX = e.clientX;
      drag.originY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!drag.active) return;
      applyDrag(e.clientX, e.clientY);
    };

    const endDrag = () => {
      drag.active = false;
      input.current.turn = 0;
      input.current.pitch = 0;
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
      } else if (!drag.active) {
        input.current.turn = 0;
        input.current.pitch = 0;
      }
      input.current.boosting = keys.has(" ") || keys.has("shift");
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
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
