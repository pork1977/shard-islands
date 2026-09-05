"use client";

import { useEffect, useState } from "react";
import { DRAFT } from "@shard-islands/shared";
import { prediction } from "@/lib/net/prediction";
import { useGameStore } from "@/lib/store/useGameStore";

/**
 * Tells the player they are in somebody's slipstream.
 *
 * Drafting is a speed change, and a speed change alone is close to
 * invisible in an open sky with no reference points — a player who has just
 * been given sixty percent more speed for holding a hard line behind
 * somebody needs to know that is what happened, or they will never learn to
 * do it on purpose.
 *
 * Two states, because the difference is the whole team mechanic: anybody's
 * wake gives you something, your own colour gives you far more.
 */
export default function DraftHud() {
  const phase = useGameStore((s) => s.phase);
  const [draft, setDraft] = useState(1);

  useEffect(() => {
    const poll = setInterval(() => setDraft(prediction.draft), 100);
    return () => clearInterval(poll);
  }, []);

  if (phase !== "flying" || draft <= 1.001) return null;

  const allied = draft >= DRAFT.alliedMultiplier - 0.001;
  const percent = Math.round((draft - 1) * 100);

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 92,
        textAlign: "center",
        pointerEvents: "none",
        userSelect: "none",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        textShadow: "0 1px 10px rgba(0,0,0,0.8)",
      }}
    >
      <div
        style={{
          fontSize: 13,
          letterSpacing: 5,
          textTransform: "uppercase",
          color: allied ? "#8effc8" : "rgba(200,230,255,0.8)",
        }}
      >
        {allied ? "wing draft" : "slipstream"}
      </div>
      <div
        style={{
          marginTop: 1,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: 1,
          color: allied ? "#c9ffe4" : "#e8f4ff",
        }}
      >
        +{percent}%
      </div>
    </div>
  );
}
