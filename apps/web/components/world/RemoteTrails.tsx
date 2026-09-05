"use client";

import { useMemo } from "react";
import { ROOM } from "@shard-islands/shared";
import { readTrailForSeat } from "@/lib/net/connection";
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

export default function RemoteTrails() {
  const seats = useMemo(
    () => Array.from({ length: ROOM.maxPlayers }, (_, seat) => seat),
    [],
  );

  return (
    <group>
      {seats.map((seat) => (
        <TrailRibbon
          key={seat}
          points={() => readTrailForSeat(seat, performance.now())}
          width={TRAIL.baseThickness * 1.15}
          core={SEAT_CORES[seat % SEAT_CORES.length]}
          tail={SEAT_TAILS[seat % SEAT_TAILS.length]}
          opacity={0.85}
        />
      ))}
    </group>
  );
}
