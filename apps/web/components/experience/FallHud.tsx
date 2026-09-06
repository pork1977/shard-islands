"use client";

import { useEffect, useState } from "react";
import { useGameStore, type GamePhase } from "@/lib/store/useGameStore";
import { fallRun } from "@/lib/world/fallMotes";
import { PLUNGE_AT } from "@/lib/timeline";
import { THE_POINT } from "@/lib/world/howToPlay";

/**
 * The tally of what was caught on the way down.
 *
 * Deliberately tiny and nearly wordless. The motes have to be worth chasing,
 * which means the player has to see the number move — but this is still a
 * page whose whole premise is that nothing on it looks like a game menu, so
 * it is two lines, it never blocks anything, and it leaves once the reward
 * has been read.
 */
export default function FallHud() {
  const phase = useGameStore((s) => s.phase);
  const strikeAt = useGameStore((s) => s.strikeAt);

  if (phase === "landing") return null;

  // Keyed on the strike, so a new run gets a new component with fresh state
  // rather than an old one that has to be talked out of what it was showing.
  return <FallTally key={strikeAt} phase={phase} strikeAt={strikeAt} />;
}

/**
 * Polled rather than subscribed: the run is a plain mutable object mutated
 * inside the frame loop, and re-rendering React at frame rate to display a
 * two-digit number would be a poor trade.
 */
function FallTally({ phase, strikeAt }: { phase: GamePhase; strikeAt: number }) {
  const [tally, setTally] = useState({ collected: 0, bonus: 0 });
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const untilFall = Math.max(0, PLUNGE_AT * 1000 - (performance.now() - strikeAt));
    const show = setTimeout(() => setVisible(true), untilFall);
    const poll = setInterval(
      () => setTally({ collected: fallRun.collected, bonus: fallRun.bonus }),
      80,
    );

    return () => {
      clearTimeout(show);
      clearInterval(poll);
    };
  }, [strikeAt]);

  // stays up briefly into flight, so the final tally is readable, then goes
  useEffect(() => {
    if (phase !== "flying") return;
    const dim = setTimeout(() => setFading(true), 2600);
    const hide = setTimeout(() => setVisible(false), 4400);
    return () => {
      clearTimeout(dim);
      clearTimeout(hide);
    };
  }, [phase]);

  if (!visible) return null;

  const caught = tally.collected > 0;

  return (
    <div
      style={{
        position: "fixed",
        top: 22,
        left: 0,
        right: 0,
        textAlign: "center",
        pointerEvents: "none",
        userSelect: "none",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        opacity: fading ? 0 : 1,
        transition: "opacity 1.6s ease",
      }}
    >
      <div
        style={{
          fontSize: 26,
          letterSpacing: 6,
          color: caught ? "#9ff0ff" : "rgba(255,255,255,0.45)",
          textShadow: caught ? "0 0 18px rgba(90,220,255,0.75)" : "none",
          transition: "color 0.25s ease",
        }}
      >
        ◆ {tally.collected}
      </div>
      <div
        style={{
          marginTop: 2,
          fontSize: 12,
          letterSpacing: 2.4,
          textTransform: "uppercase",
          color: caught ? "rgba(190,240,255,0.85)" : "rgba(255,255,255,0.3)",
        }}
      >
        {caught ? `trail +${tally.bonus}` : "gather on the way down"}
      </div>

      {/*
        The one sentence the game never actually said.
        
        Everything else teaches itself as it happens — the slipstream names
        itself when you are in one, the Beacon announces its own countdown —
        but nothing ever told a new player what any of it was FOR. It goes
        here rather than on the glass because the fall is twelve seconds in
        which they are committed, watching, and have almost nothing to do:
        the one moment a sentence can be read without costing them anything.
      */}
      <div
        style={{
          marginTop: 14,
          fontSize: 12.5,
          letterSpacing: 0.6,
          color: "rgba(200,228,255,0.5)",
        }}
      >
        {THE_POINT}
      </div>
    </div>
  );
}
