import { FLIGHT } from "./constants";
import {
  terrainHeightAt,
  TERRAIN_BASE_Z,
  TERRAIN_SIZE,
  FLIGHT_ALTITUDE,
} from "./terrain";

/**
 * The flight model itself, as one pure step — the single copy that both the
 * client's prediction and the server's authoritative tick run.
 *
 * This is the whole point of the module. Prediction only works if the
 * client's guess and the server's answer are produced by identical
 * arithmetic; two implementations of "the same" model, however carefully
 * written, drift, and every drift shows up as the local craft being yanked
 * around by corrections. Sharing the constants was never enough — the
 * integration has to be shared too.
 */

/** Where the world starts turning you back, and where it refuses outright. */
export const BOUNDARY_SOFT = TERRAIN_SIZE * 0.34;
export const BOUNDARY_HARD = TERRAIN_SIZE * 0.44;
/** Enough headroom to climb without leaving the world behind. */
export const CEILING = FLIGHT_ALTITUDE + 120;
/** How far the craft floats above the ground it is skimming. */
export const GROUND_CLEARANCE = 3.5;

/** A frame's worth of stick. */
export interface FlightInput {
  /** -1..1; positive is right. */
  turn: number;
  /** -1..1; positive points the nose DOWN. */
  pitch: number;
  boosting: boolean;
  /**
   * Hold station instead of flying. Steering still works, so the craft can
   * turn on the spot and look around — which is the entire point of it.
   */
  hover?: boolean;
}

/**
 * Everything the step reads and writes.
 *
 * The smoothed stick belongs in here, not in the caller: it carries between
 * frames, so replaying a run of inputs from an older state gives a different
 * answer without it. That makes it simulation state, however much it looks
 * like an input detail.
 */
export interface FlightSim {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  boosting: boolean;
  smoothTurn: number;
  smoothPitch: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function createFlightSim(
  x = 0,
  y = 0,
  z = FLIGHT_ALTITUDE,
  yaw = 0,
): FlightSim {
  return {
    x,
    y,
    z,
    yaw,
    pitch: 0,
    roll: 0,
    speed: 0,
    boosting: false,
    smoothTurn: 0,
    smoothPitch: 0,
  };
}

export function copyFlightSim(from: FlightSim, into: FlightSim): FlightSim {
  into.x = from.x;
  into.y = from.y;
  into.z = from.z;
  into.yaw = from.yaw;
  into.pitch = from.pitch;
  into.roll = from.roll;
  into.speed = from.speed;
  into.boosting = from.boosting;
  into.smoothTurn = from.smoothTurn;
  into.smoothPitch = from.smoothPitch;
  return into;
}

/** Unit heading vector for a given attitude. */
export function flightForward(
  s: Pick<FlightSim, "yaw" | "pitch">,
  out: { x: number; y: number; z: number },
) {
  const cp = Math.cos(s.pitch);
  out.x = cp * Math.cos(s.yaw);
  out.y = cp * Math.sin(s.yaw);
  out.z = Math.sin(s.pitch);
  return out;
}

/**
 * Advances the craft by one step. Deterministic: the same state and the same
 * input over the same dt always give the same result, which is what makes
 * replaying unacknowledged inputs after a correction produce the position
 * the player was already looking at.
 */
export function stepFlight(s: FlightSim, input: FlightInput, dt: number): void {
  // Steering is damped rather than applied directly: raw input straight into
  // the heading makes the craft feel twitchy and toy-like, and the damping
  // is what gives it the weight of a glider. A key is instantly at full
  // deflection where a drag arrives gradually, so the input itself is eased
  // to give the stick some travel instead of an on/off switch.
  s.smoothTurn += (input.turn - s.smoothTurn) * Math.min(1, dt * 3.2);
  s.smoothPitch += (input.pitch - s.smoothPitch) * Math.min(1, dt * 3.0);

  const hovering = input.hover === true;

  const turnTarget = -s.smoothTurn * 1.0;
  // positive input points the nose DOWN: drag down, or press W. Hovering
  // levels the craft out, because a nose-down aircraft holding station
  // reads as broken rather than as deliberate.
  const pitchTarget = hovering ? 0 : -s.smoothPitch * 0.62;

  s.yaw += turnTarget * dt * 1.35;
  s.pitch += (pitchTarget - s.pitch) * dt * 3.0;
  s.pitch = clamp(s.pitch, -0.9, 0.9);

  // bank INTO the turn — reads as aerodynamic rather than sliding sideways
  const rollTarget = s.smoothTurn * 0.85;
  s.roll += (rollTarget - s.roll) * dt * 4.0;

  // diving gains speed, climbing bleeds it
  const dive = Math.max(0, -Math.sin(s.pitch));
  const climb = Math.max(0, Math.sin(s.pitch));
  const target = hovering
    ? 0
    : FLIGHT.baseForwardSpeed *
      (1 + dive * (FLIGHT.diveSpeedMultiplier - 1) - climb * 0.35) *
      (input.boosting ? FLIGHT.boostSpeedMultiplier : 1);
  // Boost engages hard and bleeds off gently. Ramping in at the same slow
  // rate it decays at is what made shift feel like nothing was happening.
  const responsiveness = target > s.speed ? 5.5 : 1.6;
  s.speed += (target - s.speed) * Math.min(1, dt * responsiveness);
  s.boosting = input.boosting && !hovering;

  const cp = Math.cos(s.pitch);
  const fx = cp * Math.cos(s.yaw);
  const fy = cp * Math.sin(s.yaw);
  const fz = Math.sin(s.pitch);

  s.x += fx * s.speed * dt;
  s.y += fy * s.speed * dt;
  s.z += fz * s.speed * dt;

  // Keep the player inside the map. Beyond the edge there is nothing to look
  // at, and turning back leaves the world a long way off — so the boundary
  // curves them round rather than letting them leave.
  const distFromCentre = Math.hypot(s.x, s.y);
  if (distFromCentre > BOUNDARY_SOFT) {
    const over = Math.min(
      1,
      (distFromCentre - BOUNDARY_SOFT) / (BOUNDARY_HARD - BOUNDARY_SOFT),
    );
    const inward = Math.atan2(-s.y, -s.x);
    let delta = inward - s.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    s.yaw += delta * over * dt * 1.9;

    // and a hard stop at the very edge, in case they fight it the whole way
    if (distFromCentre > BOUNDARY_HARD) {
      const scale = BOUNDARY_HARD / distFromCentre;
      s.x *= scale;
      s.y *= scale;
    }
  }

  // Ground clearance sampled from the SAME height function the mesh was
  // built from, so the player skims the actual hills rather than a guess.
  const ground = TERRAIN_BASE_Z + terrainHeightAt(s.x, s.y) + GROUND_CLEARANCE;
  if (s.z < ground) {
    s.z = ground;
    if (s.pitch < 0) s.pitch *= 0.4; // scrub the dive rather than ploughing in
  }
  if (s.z > CEILING) s.z = CEILING;
}
