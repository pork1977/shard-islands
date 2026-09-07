"use client";

import { useEffect, useRef } from "react";
import { ROLL } from "@shard-islands/shared";

export interface FlightInput {
  /** -1..1, steer left/right. */
  turn: number;
  /** -1..1, nose down/up. */
  pitch: number;
  boosting: boolean;
  /** Holding station: flight stops, steering does not. */
  hover: boolean;
  /** Camera orbit offsets in radians — look around WITHOUT steering. */
  lookYaw: number;
  lookPitch: number;
  /**
   * A free-look drag is in progress.
   *
   * The offsets above are measured against the CRAFT, so they turn with it.
   * That is right when the camera is simply sitting behind the craft, and
   * wrong while somebody is holding a view: they have pointed the camera at
   * something in the world, and steering should turn the craft underneath
   * it rather than drag the whole view along. The camera compensates for
   * the craft's own rotation while this is set.
   */
  freeLook: boolean;
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
/**
 * A barrel roll waiting to be fired: -1 left, 1 right, 0 for nothing.
 *
 * Kept outside React deliberately. It is a latch rather than a state — one
 * double tap has to become exactly one roll, however many frames pass
 * before the next simulation step reads it — and the reader has to clear it
 * as it takes it. That is not a thing a ref full of held stick positions
 * should be doing, and the renderer is not allowed to write to one during
 * a frame anyway.
 */
let pendingRoll = 0;

/** Called by the input handlers below when a double tap lands. */
function requestRoll(direction: number) {
  pendingRoll = direction;
}

/** Called once per simulation step. Reading it is what consumes it. */
export function takeRoll(): number {
  const roll = pendingRoll;
  pendingRoll = 0;
  return roll;
}

export function useFlightControls(): React.RefObject<FlightInput> {
  const input = useRef<FlightInput>({
    turn: 0,
    pitch: 0,
    boosting: false,
    hover: false,
    lookYaw: 0,
    lookPitch: 0,
    freeLook: false,
    zoom: 1,
  });

  useEffect(() => {
    const keys = new Set<string>();
    const drag = {
      active: false,
      steering: false,
      lastX: 0,
      lastY: 0,
      originX: 0,
      originY: 0,
      baseYaw: 0,
      basePitch: 0,
    };

    // drag distance for full deflection, relative to screen size, so the
    // control feels the same on a phone as on a desktop monitor
    const range = () => Math.min(window.innerWidth, window.innerHeight) * 0.28;

    const onPointerDown = (e: PointerEvent) => {
      // A phone has no second key to spare, so the same gesture the plan
      // describes does the job: two quick taps that are not a drag. Which
      // side of the screen decides the direction.
      if (e.pointerType !== "mouse") {
        tapped("touch", e.clientX < window.innerWidth / 2 ? -1 : 1);
      }
      drag.active = true;
      drag.steering = e.pointerType !== "mouse";
      drag.originX = e.clientX;
      drag.originY = e.clientY;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      drag.baseYaw = input.current.lookYaw;
      drag.basePitch = input.current.lookPitch;
      // Mouse drags hold a view; touch drags steer, and must not.
      input.current.freeLook = !drag.steering;
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
        // Accumulated from the last event rather than measured from the drag
        // origin. While a view is being held the frame loop rewrites these
        // every frame to cancel the craft's own rotation, and an absolute
        // "origin plus delta" would discard that correction on the next
        // mouse move — the view would jump back the moment you nudged it.
        const stepX = e.clientX - drag.lastX;
        const stepY = e.clientY - drag.lastY;
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;

        // Yaw is deliberately UNCLAMPED so the camera can swing the whole way
        // round the craft; a limit near half a turn makes it feel like it has
        // hit a wall just as you go to look behind you.
        input.current.lookYaw -= stepX * 0.005;
        // inverted: pushing the mouse up swings the camera up over the craft.
        // pitch stays limited, or the camera tumbles over the top
        input.current.lookPitch = clamp(
          input.current.lookPitch + stepY * 0.004,
          -1.15,
          1.15,
        );
      }
    };

    const endDrag = () => {
      if (drag.steering) {
        input.current.turn = 0;
        input.current.pitch = 0;
      }
      drag.active = false;
      drag.steering = false;
      input.current.freeLook = false;
    };

    /** When each steering key was last pressed, for the double tap. */
    const lastTap = new Map<string, number>();

    /**
     * Two taps of the same steering key inside the window is a barrel roll.
     *
     * Bound to A and D rather than to a key of its own because it is a
     * roll: the gesture and the manoeuvre are the same direction, so there
     * is nothing to learn. The cost of that choice is that a fast
     * left-left correction can fire one by accident, which is survivable —
     * the move takes trail rather than giving it away, so a stray roll is
     * a small tax and never a disaster.
     */
    const tapped = (key: string, dir: number) => {
      const now = performance.now();
      const previous = lastTap.get(key) ?? -Infinity;
      lastTap.set(key, now);
      if (now - previous <= ROLL.doubleTapMs) {
        requestRoll(dir);
        lastTap.delete(key); // three taps is not two rolls
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // A toggle rather than a hold: the point of hovering is to stop and
      // look around for a while, and holding a key down to stand still is
      // an odd thing to ask of anyone.
      if (e.key === " " && !e.repeat) {
        e.preventDefault();
        input.current.hover = !input.current.hover;
      }
      const key = e.key.toLowerCase();
      if (!e.repeat) {
        if (key === "a" || key === "arrowleft") tapped("left", -1);
        if (key === "d" || key === "arrowright") tapped("right", 1);
      }
      keys.add(key);
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
        // Reversed again, by request: W now pushes the nose DOWN and S
        // pulls it up — a stick you push forward to dive. Deliberately the
        // opposite sign to the touch drag above, which stays a direct pull
        // on the nose.
        input.current.pitch = (up ? 1 : 0) - (down ? 1 : 0);
      } else if (!drag.steering) {
        input.current.turn = 0;
        input.current.pitch = 0;
      }
      // Shift alone boosts now: space has been taken for hover, and it was
      // only ever an undocumented second binding for the same thing.
      input.current.boosting = keys.has("shift");

      // Any deliberate throttle input means the player wants to fly again.
      // A hover you cannot get out of by pressing forward is a trap.
      if (up || down || input.current.boosting) input.current.hover = false;
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
