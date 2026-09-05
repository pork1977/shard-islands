"use client";

import { useEffect, useState } from "react";
import { ROLL } from "@shard-islands/shared";
import { readRollCooldown } from "@/lib/net/connection";
import { useGameStore } from "@/lib/store/useGameStore";

/**
 * Whether the barrel roll is there when you need it.
 *
 * A defensive move on a cooldown is only usable if you know where the
 * cooldown is. Reaching for it and getting nothing, with no explanation, is
 * the single most frustrating thing a game can do at the moment somebody is
 * about to lose their trail.
 *
 * So it shows only while it is unavailable — a bar draining back to ready.
 * When there is nothing to say it says nothing, which is the same rule the
 * rest of this HUD follows.
 */
export default function RollHud() {
  const phase = useGameStore((s) => s.phase);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const poll = setInterval(() => setCooldown(readRollCooldown()), 100);
    return () => clearInterval(poll);
  }, []);

  if (phase !== "flying" || cooldown <= 0.01) return null;

  const left = Math.max(0, Math.min(1, cooldown / ROLL.cooldownSeconds));

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 62,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        userSelect: "none",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div style={{ textAlign: "center", textShadow: "0 1px 8px rgba(0,0,0,0.8)" }}>
        <div
          style={{
            fontSize: 9,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "rgba(180,210,255,0.55)",
            marginBottom: 3,
          }}
        >
          roll {cooldown.toFixed(1)}s
        </div>
        <div style={{ width: 110, height: 2, background: "rgba(255,255,255,0.14)" }}>
          <div
            style={{
              width: `${(1 - left) * 100}%`,
              height: "100%",
              background: "rgba(150,205,255,0.8)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
