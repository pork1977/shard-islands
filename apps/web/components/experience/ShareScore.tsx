"use client";

import { useEffect, useState } from "react";
import { readRoster, type RosterEntry } from "@/lib/net/connection";
import { useGameStore } from "@/lib/store/useGameStore";

const SITE = "https://www.shardislands.me";

/**
 * Share what you managed.
 *
 * The only growth loop this game can honestly have. There are no accounts,
 * no persistence and no history — a room empties and takes every score with
 * it — so there is nothing to link TO. What there is, is a number somebody
 * is briefly proud of and a reason to say it out loud, and a link back here
 * is the whole point.
 *
 * Which is also why it does not appear until there is something worth
 * sharing. A share button next to a score of twenty-six is an advert; next
 * to a score of three hundred it is a boast, and people forward boasts.
 */
const WORTH_SHARING = 60;

export default function ShareScore() {
  const phase = useGameStore((s) => s.phase);
  const [score, setScore] = useState(0);
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    const scratch: RosterEntry[] = [];
    const poll = setInterval(() => {
      const mine = readRoster(scratch).find((r) => r.self);
      if (mine) setScore(mine.trailLength);
    }, 500);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    if (!said) return;
    const t = setTimeout(() => setSaid(null), 2600);
    return () => clearTimeout(t);
  }, [said]);

  if (phase !== "flying" || score < WORTH_SHARING) return null;

  const text = `I flew a trail of ${score} on Shard Islands. Beat that.`;

  const share = async () => {
    // The native sheet where there is one — on a phone that is the whole
    // difference between sharing and not.
    if (navigator.share) {
      try {
        await navigator.share({ title: "Shard Islands", text, url: SITE });
        return;
      } catch {
        // Dismissed, or refused. Fall through to the clipboard rather than
        // leaving the tap having done nothing.
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${SITE}`);
      setSaid("copied");
    } catch {
      setSaid("could not copy");
    }
  };

  return (
    <button
      onClick={share}
      aria-label={`Share your score of ${score}`}
      style={{
        position: "fixed",
        right: 18,
        // Directly above the help mark, which is above the control legend.
        bottom: 228,
        zIndex: 20,
        height: 34,
        padding: "0 13px",
        borderRadius: 17,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 7,
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        fontSize: 12.5,
        letterSpacing: 1,
        fontWeight: 600,
        color: "#eaf6ff",
        background: "rgba(38,74,112,0.72)",
        border: "1px solid rgba(170,220,255,0.65)",
        boxShadow: "0 0 14px rgba(90,170,255,0.35)",
        textShadow: "0 1px 6px rgba(0,0,0,0.6)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        whiteSpace: "nowrap",
      }}
    >
      {said ?? `share ${score}`}
    </button>
  );
}
