"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { connection, rejoin } from "@/lib/net/connection";
import { MULTIPLAYER_OFF } from "@/lib/serverStatus";
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
 *
 * SINCE THE SERVER WAS SWITCHED OFF there is a third meaning, and it is the
 * only one that is nobody's bad luck: alone because multiplayer has been
 * turned off on purpose. That one is told plainly. The rule above survives
 * intact, because this still is not a network status line — a player who
 * merely failed to reach a server that IS running is told nothing, exactly
 * as before. The difference is a decision, not a connection, and only
 * MULTIPLAYER_OFF knows about it.
 *
 * It is shown only while the client is not connected, so if the server
 * comes back and the flag is forgotten, the notice takes itself down.
 */
export default function SoloNotice() {
  const phase = useGameStore((s) => s.phase);
  const [status, setStatus] = useState(connection.status);
  const [trying, setTrying] = useState(false);
  /** Set when a retry came back refused, so the reason is visible. */
  const [stillFull, setStillFull] = useState(false);

  useEffect(() => {
    const poll = setInterval(() => setStatus(connection.status), 400);
    return () => clearInterval(poll);
  }, []);

  // "Still full" is worth saying and not worth leaving up: it answers the
  // click, then gets out of the way so the invitation is there to take again.
  useEffect(() => {
    if (!stillFull) return;
    const done = setTimeout(() => setStillFull(false), 4000);
    return () => clearTimeout(done);
  }, [stillFull]);

  if (phase !== "flying") return null;

  /**
   * Multiplayer is off and this player is not connected, which is the one
   * case where the empty sky is a decision somebody took rather than a
   * disappointment. No retry offered: there is nothing on the other end to
   * try, and a button that cannot work is worse than no button.
   *
   * "joining" is excluded so the notice never flashes up during the fall
   * while the attempt is still in the air.
   */
  if (MULTIPLAYER_OFF && status !== "joined" && status !== "joining") {
    return (
      <div style={SHELL}>
        <div style={HEADING}>multiplayer temporarily disabled</div>
        <div style={SUBTEXT}>the sky is yours alone for now</div>
      </div>
    );
  }

  if (status !== "solo" && !trying) return null;

  return (
    <div style={SHELL}>
      <div style={HEADING}>flying solo</div>
      <div style={SUBTEXT}>
        {stillFull ? "sky is still full, try again in a moment" : "the sky was full"} ·{" "}
        <button
          onClick={async () => {
            setTrying(true);
            setStillFull(false);
            const outcome = await rejoin();
            setTrying(false);
            // "joined" needs nothing: the notice unmounts on the next poll.
            if (outcome !== "joined") setStillFull(true);
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
          {trying ? "looking…" : "join the others!"}
        </button>
      </div>
    </div>
  );
}

/**
 * Shared by both notices on purpose. They sit in the same place and say the
 * same kind of thing, and two copies of this would drift apart the first
 * time one of them was nudged.
 */
const SHELL: CSSProperties = {
  position: "fixed",
  left: 18,
  // Clear of the corner: in development Next puts its own badge there,
  // which is why the control legend avoids it too.
  bottom: 70,
  userSelect: "none",
  fontFamily:
    "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  textShadow: "0 1px 6px rgba(0,0,0,0.7)",
};

const HEADING: CSSProperties = {
  fontSize: 12,
  letterSpacing: 2,
  textTransform: "uppercase",
  color: "rgba(210,240,255,0.75)",
};

const SUBTEXT: CSSProperties = {
  marginTop: 2,
  fontSize: 11.5,
  letterSpacing: 0.6,
  color: "rgba(210,240,255,0.45)",
};
