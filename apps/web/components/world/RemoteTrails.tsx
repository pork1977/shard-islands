"use client";

import { useEffect, useMemo, useState } from "react";
import { ROOM } from "@shard-islands/shared";
import {
  readOvercharged,
  readSeatRanges,
  readTrailForSeat,
} from "@/lib/net/connection";
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
 * jumping to a different trail whenever anybody leaves.
 *
 * Unoccupied seats used to be mounted anyway with an empty draw range, on
 * the assumption that an empty draw is free. Measuring the frame found all
 * twenty-four costing a draw call each whether or not anybody was in them —
 * twenty-three of those wasted in a two-player room, which is the room this
 * game will spend most of its life in.
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

/**
 * How much ribbon a distant player gets.
 *
 * The plan's first and cheapest degradation step, and the reason it comes
 * first: a trail is a wide emissive band feeding the bloom pass, which is
 * the most expensive kind of pixel there is on a phone, and beyond a couple
 * of hundred metres the whole ribbon resolves to a smear that says nothing
 * a stub would not say. Draw calls are unchanged either way; this is about
 * the fill.
 *
 * Nothing is ever cut to nothing. A player who can see a craft and not its
 * trail has been told something false about the game — that is a craft with
 * no score and nothing behind it to avoid.
 */
const FULL_RIBBON_RANGE = 220;
const STUB_RANGE = 620;
const STUB_POINTS = 40;

export default function RemoteTrails() {
  const seats = useMemo(
    () => Array.from({ length: ROOM.maxPlayers }, (_, seat) => seat),
    [],
  );

  // Polled and held in state rather than read per frame, because both the
  // tint and which seats exist at all are decided at render: they change a
  // handful of times a minute, so re-rendering when they do is cheaper than
  // any alternative.
  const [live, setLive] = useState<number[]>([]);
  /** Seat -> how much of its ribbon to draw. Absent means do not draw it. */
  const [budget, setBudget] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    const hot = new Set<number>();
    const ranges = new Map<number, number>();

    const poll = setInterval(() => {
      readOvercharged(hot);
      setLive((was) =>
        was.length === hot.size && was.every((s) => hot.has(s)) ? was : [...hot],
      );

      readSeatRanges(ranges);
      const next = new Map<number, number>();
      for (const [seat, distance] of ranges) {
        if (distance > STUB_RANGE) continue;
        // Bucketed rather than continuous, so a craft hovering on the
        // threshold does not make React re-render every poll.
        next.set(seat, distance <= FULL_RIBBON_RANGE ? 0 : STUB_POINTS);
      }
      setBudget((was) => {
        if (was.size === next.size && [...next].every(([k, v]) => was.get(k) === v)) {
          return was;
        }
        return next;
      });
    }, 200);
    return () => clearInterval(poll);
  }, []);

  return (
    <group>
      {seats.map((seat) => {
        const cap = budget.get(seat);
        if (cap === undefined) return null;
        const hot = live.includes(seat);
        return (
          <TrailRibbon
            key={seat}
            points={() => readTrailForSeat(seat, performance.now())}
            width={TRAIL.baseThickness * (hot ? 1.7 : 1.15)}
            core={hot ? LIVE_CORE : SEAT_CORES[seat % SEAT_CORES.length]}
            tail={hot ? LIVE_TAIL : SEAT_TAILS[seat % SEAT_TAILS.length]}
            opacity={hot ? 1 : 0.85}
            maxPoints={cap === 0 ? undefined : cap}
          />
        );
      })}
    </group>
  );
}
