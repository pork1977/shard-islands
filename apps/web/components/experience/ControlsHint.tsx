"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/lib/store/useGameStore";

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
  const [faded, setFaded] = useState(false);

  useEffect(() => {
    if (phase !== "flying") return;
    const t = setTimeout(() => setFaded(true), 9000);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase !== "flying") return null;

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
        fontSize: 12,
        lineHeight: 1.7,
        letterSpacing: 0.3,
        color: "rgba(255,255,255,0.92)",
        textShadow: "0 1px 3px rgba(0,0,0,0.65)",
        opacity: faded ? 0.32 : 1,
        transition: "opacity 1.2s ease",
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
