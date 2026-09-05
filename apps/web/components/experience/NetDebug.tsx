"use client";

import { useEffect, useState } from "react";
import { connection } from "@/lib/net/connection";
import { prediction } from "@/lib/net/prediction";
import { useGameStore } from "@/lib/store/useGameStore";

/**
 * Prediction error, in development only.
 *
 * The plan calls for this explicitly, and for a good reason: whether
 * prediction is working is not something you can see. When it is right the
 * screen looks exactly as it did before the server had any say, and when it
 * is subtly wrong it also looks nearly right — until someone is watching
 * you, and your craft is somewhere else on their screen. The number is the
 * only honest way to tell the two apart.
 *
 * Error is the distance between where this client predicted it would be and
 * where the server said it was, measured at the moment of each correction.
 * With both sides running the same step over the same inputs it should sit
 * at essentially zero; anything that persists above a few centimetres means
 * the two simulations have diverged and the cause is worth finding.
 */
export default function NetDebug() {
  const phase = useGameStore((s) => s.phase);
  const [stats, setStats] = useState({
    error: 0,
    worst: 0,
    pops: 0,
    unacked: 0,
    status: "offline" as string,
    simulated: false,
  });

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const poll = setInterval(() => {
      setStats({
        error: prediction.error,
        worst: prediction.worstError,
        pops: prediction.visibleCorrections,
        unacked: prediction.history.length,
        status: connection.status,
        simulated: prediction.active,
      });
    }, 250);
    return () => clearInterval(poll);
  }, []);

  if (process.env.NODE_ENV === "production") return null;
  if (phase !== "flying") return null;

  const cm = (m: number) => `${(m * 100).toFixed(1)}cm`;
  const healthy = stats.worst < 0.5;

  return (
    <div
      style={{
        position: "fixed",
        left: 16,
        top: 16,
        pointerEvents: "none",
        userSelect: "none",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        lineHeight: 1.7,
        color: healthy ? "rgba(160,230,190,0.75)" : "rgba(255,190,120,0.9)",
        textShadow: "0 1px 4px rgba(0,0,0,0.8)",
      }}
    >
      <div>net {stats.status}{stats.simulated ? " · predicting" : ""}</div>
      <div>err {cm(stats.error)} · worst {cm(stats.worst)}</div>
      <div>unacked {stats.unacked} · pops {stats.pops}</div>
    </div>
  );
}
