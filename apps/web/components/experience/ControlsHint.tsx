"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/lib/store/useGameStore";
import { PLUNGE_AT } from "@/lib/timeline";

/**
 * A glanceable control legend, shown once flying begins.
 *
 * Deliberately DOM rather than drawn into the canvas: text stays crisp at
 * any device pixel ratio and costs nothing per frame. It is also kept
 * wordless where possible and fades after a while — the whole premise is a
 * page with no instructions to read, so this must not become a tutorial.
 */
export default function ControlsHint() {
  const phase = useGameStore((s) => s.phase);
  const strikeAt = useGameStore((s) => s.strikeAt);
  const [faded, setFaded] = useState(false);
  const [visible, setVisible] = useState(false);

  // Appears as the fall begins, not when flight does — the descent is
  // steerable, and the player needs to know that while it is happening.
  useEffect(() => {
    if (phase === "landing") {
      setVisible(false);
      setFaded(false);
      return;
    }
    const untilPlunge = Math.max(
      0,
      PLUNGE_AT * 1000 - (performance.now() - strikeAt),
    );
    const show = setTimeout(() => setVisible(true), untilPlunge);
    // stays legible for a good while — the first version dimmed so far, so
    // fast, that it was easy to miss the instructions were there at all
    const dim = setTimeout(() => setFaded(true), untilPlunge + 25000);
    return () => {
      clearTimeout(show);
      clearTimeout(dim);
    };
  }, [phase, strikeAt]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        // bottom-right: the dev-server badge sits bottom-left and covers it
        right: 18,
        bottom: 16,
        textAlign: "right",
        pointerEvents: "none",
        userSelect: "none",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        fontSize: 13,
        lineHeight: 2,
        letterSpacing: 0.3,
        color: "#fff",
        padding: "10px 14px",
        borderRadius: 10,
        background: "rgba(12,20,32,0.42)",
        border: "1px solid rgba(255,255,255,0.18)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        boxShadow: "0 4px 18px rgba(0,0,0,0.28)",
        opacity: faded ? 0.62 : 1,
        transition: "opacity 1.5s ease",
      }}
    >
      <div>
        <Key>drag</Key> steer
      </div>
      <div>
        <Key>W</Key>
        <Key>A</Key>
        <Key>S</Key>
        <Key>D</Key> fly
      </div>
      <div>
        <Key>shift</Key> boost
      </div>
      <div>
        <Key>space</Key> hover
      </div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        minWidth: 18,
        padding: "1px 6px",
        marginRight: 5,
        borderRadius: 4,
        textAlign: "center",
        background: "rgba(255,255,255,0.16)",
        border: "1px solid rgba(255,255,255,0.28)",
        fontSize: 11,
      }}
    >
      {children}
    </span>
  );
}
