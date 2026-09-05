"use client";

import { useEffect, useState } from "react";
import { readRoster, type RosterEntry } from "@/lib/net/connection";
import { useGameStore } from "@/lib/store/useGameStore";

const SEAT_COLOURS = [
  "#5fe4ff",
  "#ff7ad9",
  "#9dff6b",
  "#ffc247",
  "#b98cff",
  "#ff6b5f",
  "#6bffd0",
  "#ffffff",
];

/**
 * Who is longest.
 *
 * The game has had a score since the trail existed — length is the score —
 * but nothing has ever shown it, so collecting motes and flying well have
 * both felt like they led nowhere. This is the smallest thing that turns
 * that into a contest: four lines, a number that moves, and a crown on
 * whoever is winning.
 *
 * Polled rather than subscribed, at a rate a person can read. The number
 * ticks up every thirty-five metres; re-rendering React any faster than
 * this would be for nobody's benefit.
 */
export default function Scoreboard() {
  const phase = useGameStore((s) => s.phase);
  const [rows, setRows] = useState<RosterEntry[]>([]);

  useEffect(() => {
    const scratch: RosterEntry[] = [];
    const poll = setInterval(() => {
      // copied out, because the reader reuses its array every call
      setRows(readRoster(scratch).slice(0, 5).map((r) => ({ ...r })));
    }, 350);
    return () => clearInterval(poll);
  }, []);

  if (phase !== "flying" || rows.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 18,
        top: 54,
        minWidth: 168,
        pointerEvents: "none",
        userSelect: "none",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        // Sized up: this is the only place the score exists, and it was
        // being read out of the corner of the eye at twelve pixels while
        // the player was busy flying.
        fontSize: 15,
        letterSpacing: 1,
        textShadow: "0 1px 6px rgba(0,0,0,0.75)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 2.8,
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.4)",
          marginBottom: 5,
          textAlign: "right",
        }}
      >
        longest trail
      </div>

      {rows.map((row) => (
        <div
          key={row.id}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 9,
            lineHeight: 1.75,
            color: row.self ? "#ffffff" : "rgba(255,255,255,0.62)",
            fontWeight: row.self ? 700 : 400,
          }}
        >
          {row.alpha && <span style={{ color: "#ffd24a" }}>♦</span>}
          <span
            style={{
              color: row.alpha
                ? "#ffd24a"
                : SEAT_COLOURS[row.colour % SEAT_COLOURS.length],
            }}
          >
            P{row.seat + 1}
          </span>
          <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 44, textAlign: "right" }}>
            {row.trailLength}
          </span>
        </div>
      ))}
    </div>
  );
}
