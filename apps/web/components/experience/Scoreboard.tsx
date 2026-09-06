"use client";

import { useEffect, useState } from "react";
import { readRoster, type RosterEntry } from "@/lib/net/connection";
import { useGameStore } from "@/lib/store/useGameStore";
import { readBests, recordScore } from "@/lib/world/personalBest";
import { SEAT_COLOURS } from "@/lib/world/seatColours";

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
  const [bests, setBests] = useState<number[]>([]);

  useEffect(() => {
    const scratch: RosterEntry[] = [];
    const poll = setInterval(() => {
      // copied out, because the reader reuses its array every call
      const roster = readRoster(scratch);
      setRows(roster.slice(0, 5).map((r) => ({ ...r })));

      // Offered every poll rather than at some ending, because there is
      // no ending — the game never stops and a tab can close at any
      // moment. recordScore only writes when the board would change.
      const mine = roster.find((r) => r.self);
      if (mine) recordScore(mine.trailLength);
      setBests(readBests());
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

      {bests.length > 0 && (
        <div
          style={{
            marginTop: 9,
            paddingTop: 7,
            borderTop: "1px solid rgba(255,255,255,0.14)",
            textAlign: "right",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: 2.8,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.34)",
              marginBottom: 3,
            }}
          >
            your best
          </div>
          {bests.map((score, i) => (
            <div
              key={i}
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                fontVariantNumeric: "tabular-nums",
                // The top one is the number to beat; the other two are
                // there to show it is a board and not a fluke.
                color: i === 0 ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.38)",
              }}
            >
              {score}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
