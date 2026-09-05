"use client";

import { useEffect, useState } from "react";
import { connection, playerCount } from "@/lib/net/connection";
import { useGameStore } from "@/lib/store/useGameStore";

/**
 * Who else is up here.
 *
 * Shown only once there IS somebody else — a lone player is told nothing,
 * because "1 player online" is the kind of thing that makes a world feel
 * empty rather than shared. Nothing here ever reports connecting, retrying
 * or failing: the session is complete either way, and a status line about
 * the network is exactly the sort of UI this opening is built to avoid.
 *
 * In development it also prints how long the join actually took, which is
 * the number that matters — it can be enormous and still never be noticed.
 */
export default function Presence() {
  const phase = useGameStore((s) => s.phase);
  const [state, setState] = useState({ count: 1, joinMs: null as number | null });

  useEffect(() => {
    const poll = setInterval(
      () => setState({ count: playerCount(), joinMs: connection.joinMs }),
      400,
    );
    return () => clearInterval(poll);
  }, []);

  if (phase === "landing") return null;

  const others = state.count - 1;
  const showDev = process.env.NODE_ENV !== "production" && state.joinMs !== null;
  if (others < 1 && !showDev) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 18,
        right: 18,
        textAlign: "right",
        pointerEvents: "none",
        userSelect: "none",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        fontSize: 12,
        letterSpacing: 2,
        textTransform: "uppercase",
        color: "rgba(210,240,255,0.75)",
        textShadow: "0 1px 6px rgba(0,0,0,0.6)",
      }}
    >
      {others >= 1 && (
        <div>
          <span style={{ color: "#7ef0ff" }}>●</span> {others} other
          {others === 1 ? "" : "s"} flying
        </div>
      )}
      {showDev && (
        <div style={{ opacity: 0.45, fontSize: 10, letterSpacing: 1.4 }}>
          joined in {state.joinMs}ms
        </div>
      )}
    </div>
  );
}
