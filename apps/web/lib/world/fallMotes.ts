import { PLUNGE_DURATION } from "@/lib/timeline";
import { FLIGHT_ALTITUDE, GREAT_LAKE, DESERT } from "./generateTerrain";
import { getProps } from "./generateProps";

/**
 * Energy motes, hanging in the air the player falls through.
 *
 * The descent used to be seven seconds of steering with nothing at stake.
 * These give it stakes, and they are laid out as three STREAMS rather than
 * scattered: each stream curves away toward a different landmark, so taking
 * one is both a decision about what you collect and a decision about where
 * you come down. You cannot have two of them. That trade — the reward is on
 * the way to somewhere, and you have to pick the somewhere — is the whole
 * mechanic.
 */
export interface FallMote {
  x: number;
  y: number;
  z: number;
  /** Which stream it belongs to, which is what tints it. */
  stream: number;
  collected: boolean;
}

/**
 * Steering authority during the fall, and the air resistance that settles
 * it. These live beside the mote layout rather than in the descent
 * controller because the two have to agree: a stream is only worth laying
 * where a committed player can actually get to.
 *
 * The old value was 26, which gave a lateral reach of about eighty metres
 * across a map twenty-eight hundred metres wide — enough to nudge, nowhere
 * near enough to choose a destination.
 */
export const DESCENT_ACCEL = 210;
export const DESCENT_DRAG_PER_SECOND = 0.12;
/** Terminal lateral speed: acceleration over the drag coefficient. */
export const DESCENT_TERMINAL = DESCENT_ACCEL / -Math.log(DESCENT_DRAG_PER_SECOND);
/** How long the drift takes to answer the stick, in seconds. */
const DESCENT_TAU = 1 / -Math.log(DESCENT_DRAG_PER_SECOND);

/**
 * Steering does not arrive all at once: the break has to read as something
 * happening TO the player before it becomes theirs, so authority ramps in
 * over the first moments of the fall. Exported because the mote layout has
 * to integrate exactly this curve.
 */
const AUTHORITY_START = 0.06;
const AUTHORITY_RATE = 4;

export function descentAuthority(p: number): number {
  return Math.max(0, Math.min(1, (p - AUTHORITY_START) * AUTHORITY_RATE));
}

/**
 * How far sideways a player who commits from the first instant will be by a
 * given point in the fall.
 *
 * This is the integral of the authority ramp against terminal speed, minus
 * the lag while the drift catches up with the stick. It is not an estimate:
 * the streams are laid ON this curve, so holding one direction from the top
 * sweeps a whole stream, and anything else trades motes for a different
 * landing. Guessing the shape instead — an eyeballed power curve — put every
 * mote tens of metres off the line the player actually flies, which made
 * the streams uncollectable without anyone being able to say why.
 */
export function descentReach(p: number): number {
  const full = AUTHORITY_START + 1 / AUTHORITY_RATE;
  const ramped = Math.min(p, full);

  let integral = 0;
  if (ramped > AUTHORITY_START) {
    integral += (AUTHORITY_RATE / 2) * Math.pow(ramped - AUTHORITY_START, 2);
  }
  if (p > full) integral += p - full;

  const lag = DESCENT_TERMINAL * DESCENT_TAU * descentAuthority(p);
  return Math.max(0, DESCENT_TERMINAL * PLUNGE_DURATION * integral - lag);
}

/** Trail length granted per mote. The trail IS the score, so this is the prize. */
export const MOTE_TRAIL_BONUS = 9;

/**
 * Generous, because the player is falling past these at speed — and then
 * made more generous again, because in practice nobody was catching any.
 * Twenty metres asked the player to hold a heading to within a couple of
 * degrees for ten seconds; the mote is a reward for committing to a
 * direction, not a test of precision flying.
 */
export const MOTE_PICKUP_RADIUS = 38;

/** Where the player starts flying from, before any steering. */
export const DESCENT_START_Z = 5;

/**
 * Live state for one run down. Deliberately a plain mutable object, for the
 * same reason the player's own state is: it changes every frame and pushing
 * it through React would re-render the tree at frame rate.
 */
export const fallRun = {
  motes: [] as FallMote[],
  /** Compass bearing of each stream, for aiming the descent camera. */
  bearings: [] as number[],
  /**
   * Where the fall is currently going to put the player, if they hold what
   * they are doing. Published by the descent controller and drawn as a ring
   * on the ground: the point of a steerable descent is being able to see
   * where the steering is taking you.
   */
  landing: [0, 0] as [number, number],
  collected: 0,
  /** Trail length earned so far. */
  bonus: 0,
};

export interface FallRunPlan {
  motes: FallMote[];
  bearings: number[];
}

/** Camera altitude at a given point through the plunge, matching FractureScene. */
function altitudeAt(p: number): number {
  return DESCENT_START_Z + (FLIGHT_ALTITUDE - DESCENT_START_Z) * Math.pow(p, 1.7);
}

function normaliseAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Three streams, aimed at the city, the great lake and the desert.
 *
 * The city is sited by a search over the terrain, so its bearing is not
 * known in advance and can land on top of another target's. Any two that
 * end up within about forty degrees are pushed apart, because two streams
 * the player cannot tell apart is the same as having one.
 */
export function createFallMotes(startX: number, startY: number): FallRunPlan {
  const { city } = getProps();

  const targets = [
    { x: city.cx, y: city.cy },
    { x: GREAT_LAKE.x, y: GREAT_LAKE.y },
    { x: DESERT.x, y: DESERT.y },
  ];

  const angles = targets.map((t) => Math.atan2(t.y - startY, t.x - startX));
  for (let i = 1; i < angles.length; i++) {
    for (let j = 0; j < i; j++) {
      const gap = normaliseAngle(angles[i] - angles[j]);
      if (Math.abs(gap) < 0.7) {
        angles[i] = angles[j] + (gap >= 0 ? 0.7 : -0.7);
      }
    }
  }

  const motes: FallMote[] = [];
  const perStream = 9;

  angles.forEach((angle, stream) => {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    for (let i = 0; i < perStream; i++) {
      // Spaced by TIME through the fall rather than by height. The descent
      // accelerates hard, so evenly spaced altitudes would arrive in a rush
      // at the end and a crawl at the start.
      const t = i / (perStream - 1);
      // Starts a third of the way down, where the three trajectories have
      // finally diverged far enough that no single point is within pickup
      // range of two streams. Any earlier and the player collects the head
      // of all three without steering, which is the opposite of a choice.
      const p = 0.32 + t * 0.6;
      const out = descentReach(p);

      motes.push({
        x: startX + dirX * out,
        y: startY + dirY * out,
        z: altitudeAt(p),
        stream,
        collected: false,
      });
    }
  });

  return { motes, bearings: angles };
}

/** Arms a run with a freshly built set of motes. */
export function setFallRun(plan: FallRunPlan) {
  fallRun.motes = plan.motes;
  fallRun.bearings = plan.bearings;
  fallRun.collected = 0;
  fallRun.bonus = 0;
}

/**
 * Collects anything the camera passed this frame.
 *
 * Tested as a CROSSING rather than as a proximity check on the current
 * position: near the end of the plunge the camera covers a couple of metres
 * per frame, and at a low frame rate a pure distance test drops the player
 * straight through a mote without noticing it.
 */
export function collectMotes(
  prevZ: number,
  x: number,
  y: number,
  z: number,
): number {
  const low = Math.min(prevZ, z) - 2;
  const high = Math.max(prevZ, z) + 2;
  let taken = 0;

  for (const mote of fallRun.motes) {
    if (mote.collected) continue;
    if (mote.z < low || mote.z > high) continue;
    if (Math.hypot(mote.x - x, mote.y - y) > MOTE_PICKUP_RADIUS) continue;

    mote.collected = true;
    fallRun.collected += 1;
    fallRun.bonus += MOTE_TRAIL_BONUS;
    taken += 1;
  }

  return taken;
}

