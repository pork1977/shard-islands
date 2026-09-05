"use client";

import { useEffect, useMemo, useState } from "react";
import { ROOM } from "@shard-islands/shared";
import { readOvercharged, readTrailForSeat } from "@/lib/net/connection";
import TrailRibbon from "./TrailRibbon";
import { TRAIL } from "@shard-islands/shared";

/**
 * Everyone else's trail.
 *
 * The trail is the score, so until now the leaderboard was the only place
 * you could tell who was winning — you could see a rival craft but not the
 * thing that makes them a rival. This is what puts the contest in the sky
 * instead of in the corner of the screen.
 *
 * Rendered from the room's own arrays rather than from anything predicted:
 * a trail is a record of where somebody HAS been, so unlike their position
 * there is nothing to guess at and nothing to smooth. The server appends by
 * arc length, so the resolution is the same as the local ribbon's.
 *
 * One ribbon per SEAT rather than per present player. Seats are stable for
 * as long as somebody holds one, so a ribbon follows one player instead of
 * jumping to a different trail whenever anybody leaves. Unoccupied seats
 * cost a draw call with an empty draw range.
 */

/** Matches the craft and label palette, so a trail is identifiable. */
const SEAT_CORES = [
  "#41e8ff",
  "#ff7ad9",
  "#9dff6b",
  "#ffc247",
  "#b98cff",
  "#ff6b5f",
  "#6bffd0",
  "#dfe9ff",
];

const SEAT_TAILS = [
  "#7b4dff",
  "#a1197f",
  "#2f8f2a",
  "#a35c00",
  "#5a2fbf",
  "#a12a1f",
  "#1f8f78",
  "#5b6a8f",
];

/**
 * A live wake, drawn white hot.
 *
 * This is not decoration. While a craft is overcharged its trail cuts
 * anybody who touches it, so the ribbon has stopped being a scoreboard and
 * become a hazard — and a hazard that looks like every other ribbon is a
 * trap. Anything that changes what a line in the sky DOES has to change
 * what it looks like.
 */
const LIVE_CORE = "#ffffff";
const LIVE_TAIL = "#ff9d2b";

export default function RemoteTrails() {
  const seats = useMemo(
    () => Array.from({ length: ROOM.maxPlayers }, (_, seat) => seat),
    [],
  );

  // Polled and held in state rather than read per frame, because the tint
  // is a material property set at render: it changes a handful of times a
  // minute, so a re-render when it does is cheaper than any alternative.
  const [live, setLive] = useState<number[]>([]);
  useEffect(() => {
    const seen = new Set<number>();
    const poll = setInterval(() => {
      readOvercharged(seen);
      setLive((was) => {
        if (was.length === seen.size && was.every((s) => seen.has(s))) return was;
        return [...seen];
      });
    }, 200);
    return () => clearInterval(poll);
  }, []);

  return (
    <group>
      {seats.map((seat) => {
        const hot = live.includes(seat);
        return (
          <TrailRibbon
            key={seat}
            points={() => readTrailForSeat(seat, performance.now())}
            width={TRAIL.baseThickness * (hot ? 1.7 : 1.15)}
            core={hot ? LIVE_CORE : SEAT_CORES[seat % SEAT_CORES.length]}
            tail={hot ? LIVE_TAIL : SEAT_TAILS[seat % SEAT_TAILS.length]}
            opacity={hot ? 1 : 0.85}
          />
        );
      })}
    </group>
  );
}
