"use client";

import { useEffect, useState } from "react";
import { BEACON } from "@shard-islands/shared";
import { readBeacon, type BeaconView } from "@/lib/net/connection";
import { useGameStore } from "@/lib/store/useGameStore";
import { SEAT_COLOURS } from "@/lib/world/seatColours";

/**
 * The Beacon, on screen.
 *
 * The dome says all of this in the sky already, and that is where it should
 * be read from — but only if you happen to be looking at it. A player nose
 * down in a canyon collecting cores has no idea the thing is about to open,
 * and "you missed the event because you were facing the wrong way" is not a
 * decision anybody made.
 *
 * So: a quiet line while it charges, an unmissable one while it is open,
 * and the name of whoever took it for as long as they hold it. Nothing here
 * is a decision — it reports the room.
 */
export default function BeaconHud() {
  const phase = useGameStore((s) => s.phase);
  const [b, setB] = useState<BeaconView | null>(null);

  useEffect(() => {
    const poll = setInterval(() => {
      const view = readBeacon();
      // Copied out: the reader hands back the same object every call.
      setB({ ...view });
    }, 120);
    return () => clearInterval(poll);
  }, []);

  if (phase !== "flying" || !b) return null;

  const holder = b.holderId !== "" && b.overchargeMsLeft > 0;
  const open = b.phase === 1;
  const nearly = b.phase === 0 && b.charge > 0.75;

  // Nothing worth saying: charging quietly, nobody holding it.
  if (!open && !holder && !nearly) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        top: 92,
        textAlign: "center",
        pointerEvents: "none",
        userSelect: "none",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        textShadow: "0 2px 14px rgba(0,0,0,0.85)",
      }}
    >
      {open && (
        <>
          <div
            style={{
              fontSize: 27,
              fontWeight: 800,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: "#fff3d0",
            }}
          >
            the beacon is open
          </div>
          <div
            style={{
              marginTop: 2,
              fontSize: 13,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: "rgba(255,225,160,0.85)",
            }}
          >
            first one there takes it · {(b.phaseMsLeft / 1000).toFixed(1)}s
          </div>
        </>
      )}

      {nearly && !open && (
        <div
          style={{
            fontSize: 13,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "rgba(255,190,110,0.8)",
          }}
        >
          the beacon is nearly charged · {Math.round(b.charge * 100)}%
        </div>
      )}

      {holder && (
        <div
          style={{
            marginTop: open ? 8 : 0,
            fontSize: b.mine ? 20 : 15,
            fontWeight: 700,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: b.mine ? "#ffffff" : SEAT_COLOURS[b.holderSeat % SEAT_COLOURS.length],
          }}
        >
          {b.mine ? "you are overcharged" : `P${b.holderSeat + 1} is overcharged`}
          <span style={{ opacity: 0.7, fontWeight: 400 }}>
            {" "}
            {(b.overchargeMsLeft / 1000).toFixed(0)}s
          </span>
          <div
            style={{
              margin: "5px auto 0",
              width: 160,
              height: 3,
              background: "rgba(255,255,255,0.16)",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, (b.overchargeMsLeft / BEACON.overchargeMs) * 100)}%`,
                height: "100%",
                background: b.mine ? "#ffffff" : "#ff9d2b",
              }}
            />
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              letterSpacing: 2,
              fontWeight: 400,
              color: "rgba(255,255,255,0.6)",
            }}
          >
            {b.mine ? "your wake cuts them · pickups worth double" : "do not touch their trail"}
          </div>
        </div>
      )}
    </div>
  );
}
