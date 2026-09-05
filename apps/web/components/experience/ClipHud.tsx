"use client";

import { useEffect, useRef, useState } from "react";
import { CLIP } from "@shard-islands/shared";
import { readClipStanding } from "@/lib/net/connection";
import { useGameStore } from "@/lib/store/useGameStore";

/** How long a message stays up. Long enough to read while flying. */
const MESSAGE_MS = 2200;

interface Message {
  kind: "cut" | "lost";
  at: number;
}

/**
 * What just happened to you in a fight.
 *
 * Both halves need saying out loud. Landing a cut is invisible from the
 * cockpit — you fly through a line and something happens to somebody
 * behind you — and losing one is worse than invisible: your score drops
 * for a reason you never saw, which reads as the game taking something off
 * you rather than as another player doing it.
 *
 * Driven off the two counters in the room's own state rather than off the
 * clip event feed, which has one consumer already. The counters say the
 * same thing and cannot be missed by a client that happened to look away.
 */
export default function ClipHud() {
  const phase = useGameStore((s) => s.phase);
  const [message, setMessage] = useState<Message | null>(null);
  const [shield, setShield] = useState(0);

  const seen = useRef<{ made: number; taken: number } | null>(null);

  useEffect(() => {
    const poll = setInterval(() => {
      const standing = readClipStanding();
      if (!standing) return;

      setShield(standing.immuneMs);

      const before = seen.current;
      seen.current = { made: standing.clipsMade, taken: standing.clipsTaken };
      // First reading is a baseline, not news. A player joining a room where
      // they have somehow already been cut should not be told about it.
      if (!before) return;

      if (standing.clipsTaken > before.taken) {
        setMessage({ kind: "lost", at: Date.now() });
      } else if (standing.clipsMade > before.made) {
        setMessage({ kind: "cut", at: Date.now() });
      }
    }, 100);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  if (phase !== "flying") return null;

  const protectedNow = shield > 0;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        top: "31%",
        textAlign: "center",
        pointerEvents: "none",
        userSelect: "none",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        textShadow: "0 2px 14px rgba(0,0,0,0.85)",
      }}
    >
      {message && (
        <div
          style={{
            fontSize: message.kind === "lost" ? 30 : 26,
            fontWeight: 800,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: message.kind === "lost" ? "#ff8a7a" : "#9dff6b",
          }}
        >
          {message.kind === "lost" ? "trail cut" : "clipped them"}
        </div>
      )}

      {protectedNow && (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "rgba(190,225,255,0.85)",
          }}
        >
          shielded {(shield / 1000).toFixed(1)}s
          <div
            style={{
              margin: "5px auto 0",
              width: 120,
              height: 2,
              background: "rgba(255,255,255,0.16)",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, (shield / CLIP.immunityMs) * 100)}%`,
                height: "100%",
                background: "rgba(190,225,255,0.9)",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
