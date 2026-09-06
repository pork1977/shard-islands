"use client";

import { useEffect, useState } from "react";
import { beginJoin, connection } from "@/lib/net/connection";
import { useGameStore } from "@/lib/store/useGameStore";

/**
 * Why the sky is empty, on the one occasion the player deserves to know.
 *
 * Presence says, deliberately, that a lone player is told nothing and that
 * "a status line about the network is exactly the sort of UI this opening
 * is built to avoid". That rule was written when alone could only mean
 * nobody else came, and it is still right for that case.
 *
 * The capacity gate created a second meaning it could not have anticipated:
 * alone because the server was full and turned this player away. Left
 * unsaid, the reasonable conclusion is that the game is dead — which, on a
 * day busy enough to trigger the gate, is the exact opposite of the truth
 * and the worst possible thing for a launch.
 *
 * So this is not a network status line. It reports the state of the WORLD,
 * the way the Beacon banner does, and it appears ONLY for a player the
 * server refused. A genuinely quiet sky still says nothing, and a player
 * who never reached the server at all is still told nothing, because for
 * them the session really is complete as it is.
 *
 * Nothing here blocks: they are already flying, the whole time.
 */
export default function SoloNotice() {
  const phase = useGameStore((s) => s.phase);
  const [status, setStatus] = useState(connection.status);
  const [trying, setTrying] = useState(false);

  useEffect(() => {
    const poll = setInterval(() => setStatus(connection.status), 400);
    return () => clearInterval(poll);
  }, []);

  // A retry either lands or comes back refused; both end the trying state,
  // and a fixed window is simpler than threading a result back out.
  useEffect(() => {
    if (!trying) return;
    const done = setTimeout(() => setTrying(false), 2600);
    return () => clearTimeout(done);
  }, [trying]);

  if (phase !== "flying" || (status !== "solo" && !trying)) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 18,
        // Clear of the corner: in development Next puts its own badge
        // there, which is why the control legend avoids it too.
        bottom: 70,
        userSelect: "none",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        textShadow: "0 1px 6px rgba(0,0,0,0.7)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: "rgba(210,240,255,0.75)",
        }}
      >
        flying solo
      </div>
      <div
        style={{
          marginTop: 2,
          fontSize: 11.5,
          letterSpacing: 0.6,
          color: "rgba(210,240,255,0.45)",
        }}
      >
        the sky was full ·{" "}
        <button
          onClick={() => {
            setTrying(true);
            beginJoin();
          }}
          disabled={trying}
          style={{
            padding: 0,
            border: "none",
            background: "none",
            font: "inherit",
            letterSpacing: "inherit",
            cursor: trying ? "default" : "pointer",
            color: trying ? "rgba(210,240,255,0.45)" : "#7ef0ff",
            textDecoration: trying ? "none" : "underline",
            textUnderlineOffset: 3,
          }}
        >
          {trying ? "looking…" : "try again"}
        </button>
      </div>
    </div>
  );
}
