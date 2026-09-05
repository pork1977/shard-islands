"use client";

import { useEffect, useRef, useState } from "react";
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
 *
 * Hidden by default, because it is an instrument and not part of the game —
 * it was sitting in the top left of the screen with no explanation of what
 * it was. F3 brings it up, and it shows itself uninvited if the error goes
 * bad while somebody is actually watching, which is the one moment they
 * would wish they had left it on.
 */

/** Above this much CURRENT error, in metres, something is genuinely wrong. */
const ALARM_METRES = 0.5;
/**
 * How many consecutive bad polls before the readout speaks up, and how long
 * a returning tab is given before it is judged.
 *
 * Both exist for the same reason: a backgrounded tab has its animation frames
 * throttled to almost nothing, so it sends the room a trickle of input while
 * the room carries on at twenty ticks a second. The two drift apart by
 * hundreds of metres, and none of it means the netcode is broken — it means
 * nobody was flying. Judging a tab that has just come back would fire the
 * alarm every single time somebody switched away and returned.
 */
const BAD_POLLS_BEFORE_ALARM = 4;
const SETTLE_AFTER_RETURN_MS = 2500;

export default function NetDebug() {
  const phase = useGameStore((s) => s.phase);
  const [shown, setShown] = useState(false);
  const [alarmed, setAlarmed] = useState(false);
  /**
   * Set once the player has pressed F3 to get rid of it, and never cleared.
   * An alarm that cannot be dismissed is worse than no alarm: the error it
   * is complaining about does not go away on its own, so without this the
   * panel would simply reappear a second after every attempt to close it.
   */
  const dismissed = useRef(false);
  /** Mirrors of the two flags, so the key handler can read them without
   *  being re-bound on every change. */
  const shownRef = useRef(false);
  const alarmedRef = useRef(false);
  shownRef.current = shown;
  alarmedRef.current = alarmed;

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F3") return;
      // the browser's own find-again binding, which we are borrowing
      e.preventDefault();
      const visible = shownRef.current || alarmedRef.current;
      if (visible) dismissed.current = true;
      setShown(!visible);
      setAlarmed(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    let bad = 0;
    let visibleSince = document.visibilityState === "visible" ? Date.now() : 0;

    const onVisibility = () => {
      // A tab coming back has a backlog of divergence that is nobody's
      // fault. Forget what happened while it was away.
      bad = 0;
      visibleSince = document.visibilityState === "visible" ? Date.now() : 0;
      setAlarmed(false);
    };
    document.addEventListener("visibilitychange", onVisibility);

    const watch = setInterval(() => {
      const watching =
        visibleSince > 0 && Date.now() - visibleSince > SETTLE_AFTER_RETURN_MS;
      if (!watching) return;
      bad = prediction.error > ALARM_METRES ? bad + 1 : 0;
      if (bad >= BAD_POLLS_BEFORE_ALARM && !dismissed.current) setAlarmed(true);
    }, 250);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(watch);
    };
  }, []);

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

  if (!shown && !alarmed) return null;

  const cm = (m: number) => `${(m * 100).toFixed(1)}cm`;
  const healthy = stats.error < ALARM_METRES;

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
      <div>
        netcode {stats.status}
        {stats.simulated ? " · predicting" : ""} · F3
      </div>
      <div>err {cm(stats.error)} · worst {cm(stats.worst)}</div>
      <div>unacked {stats.unacked} · pops {stats.pops}</div>
    </div>
  );
}
