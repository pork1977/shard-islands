import { FLIGHT, ROLL } from "./constants";
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

/**
 * Where the world starts turning you back, and where it refuses outright.
 *
 * Both moved outward. The soft edge sat at 0.34 of the terrain — 952 metres
 * of a map that is drawn to 1400 — so a third of the visible world was
 * scenery you were steered away from before reaching. Worse, cores are
 * seeded out to 0.4 (1120m), which put the outermost ones INSIDE the
 * turn-back band: reachable in principle, and in practice the game fought
 * you the whole way there.
 *
 * They are also measured as a SQUARE now, not a circle, because the terrain
 * is a square: a 2800x2800 plane spanning 1400 metres each way. A circular
 * boundary inscribed in it stops you 84 metres short along an axis and 664
 * metres short toward a corner — which is why the edge still looked
 * unreachable after the radius was widened. Comparing max(|x|, |y|) instead
 * follows the shape of the ground, so the rim is the same distance away
 * whichever way you fly at it.
 */
export const BOUNDARY_SOFT = TERRAIN_SIZE * 0.47;
export const BOUNDARY_HARD = TERRAIN_SIZE * 0.495;

/**
 * How hard the soft edge turns you, in radians per second at full strength.
 *
 * This, not the wall, is what a player actually meets. Flown at it under
 * boost, a craft used to stop gaining ground at 1287 of a possible 1336 —
 * the turn was strong enough and started early enough that the hard
 * boundary was unreachable, so widening the hard boundary changed nothing
 * anybody could feel. Measured by edgeCheck.ts rather than reasoned about,
 * after two goes at this that were sound on paper and wrong in the air.
 */
export const BOUNDARY_TURN_RATE = 1.5;
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
  /**
   * Fire a barrel roll, -1 or 1 for the direction; 0 or absent for no.
   *
   * A request, not a command: the step decides whether it is allowed, using
   * only state both sides have, so the client's prediction and the server's
   * answer agree about whether the roll happened without either asking.
   */
  roll?: number;
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
  /**
   * Speed multiplier from riding somebody's slipstream; 1 when not drafting.
   *
   * Set by the room, carried in the synced state, and part of the sim rather
   * than an input, because the client has to replay with the same value the
   * server used or every drafted second becomes a correction.
   */
  draft: number;

  /**
   * Radians of barrel roll left to turn through, and the direction.
   *
   * Simulation state for the same reason the damped stick is: it carries
   * between steps. Both sides start a roll from the same request under the
   * same rule and turn through it at the same rate, so neither has to be
   * told what the other did.
   */
  rollSpin: number;
  rollDir: number;
  /** Seconds until another roll is allowed. */
  rollCooldown: number;

  /**
   * Velocity handed to this craft by somebody else's shockwave, decaying.
   *
   * Set by the room — only the room knows who was near whom — and synced,
   * so the owning client replays against the same push it was given. A
   * shove the client did not know about would be a correction every frame
   * it lasted.
   */
  shoveX: number;
  shoveY: number;
  shoveZ: number;
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
    draft: 1,
    rollSpin: 0,
    rollDir: 0,
    rollCooldown: 0,
    shoveX: 0,
    shoveY: 0,
    shoveZ: 0,
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
  into.draft = from.draft;
  into.rollSpin = from.rollSpin;
  into.rollDir = from.rollDir;
  into.rollCooldown = from.rollCooldown;
  into.shoveX = from.shoveX;
  into.shoveY = from.shoveY;
  into.shoveZ = from.shoveZ;
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

  // The barrel roll. Started here rather than by the room so that the
  // client's own prediction fires on the exact frame the key was pressed —
  // a defensive move that waited a round trip to begin would be useless.
  // The cooldown lives in the sim, so both sides refuse it in the same
  // places without a word passing between them.
  if (s.rollCooldown > 0) s.rollCooldown = Math.max(0, s.rollCooldown - dt);
  const wants = input.roll ?? 0;
  if (wants !== 0 && s.rollSpin <= 0 && s.rollCooldown <= 0) {
    s.rollSpin = Math.PI * 2;
    s.rollDir = wants < 0 ? -1 : 1;
    s.rollCooldown = ROLL.cooldownSeconds;
  }

  const turnTarget = -s.smoothTurn * 1.0;
  // positive input points the nose DOWN: drag down, or press W. Hovering
  // levels the craft out, because a nose-down aircraft holding station
  // reads as broken rather than as deliberate.
  const pitchTarget = hovering ? 0 : -s.smoothPitch * 0.62;

  s.yaw += turnTarget * dt * 1.35;
  s.pitch += (pitchTarget - s.pitch) * dt * 3.0;
  s.pitch = clamp(s.pitch, -0.9, 0.9);

  if (s.rollSpin > 0) {
    // Mid-roll: the barrel overrides the bank entirely. Turning through
    // exactly two pi means the craft finishes where it started, so the
    // angle can be normalised at the end without anything appearing to jump.
    const step = Math.min(s.rollSpin, ((Math.PI * 2) / ROLL.durationSeconds) * dt);
    s.roll += s.rollDir * step;
    s.rollSpin -= step;
    if (s.rollSpin <= 1e-6) {
      s.rollSpin = 0;
      s.rollDir = 0;
      while (s.roll > Math.PI) s.roll -= Math.PI * 2;
      while (s.roll < -Math.PI) s.roll += Math.PI * 2;
    }
  } else {
    // bank INTO the turn — reads as aerodynamic rather than sliding sideways
    const rollTarget = s.smoothTurn * 0.85;
    s.roll += (rollTarget - s.roll) * dt * 4.0;
  }

  // diving gains speed, climbing bleeds it
  const dive = Math.max(0, -Math.sin(s.pitch));
  const climb = Math.max(0, Math.sin(s.pitch));
  // Draft stacks with boost rather than replacing it: the slipstream is a
  // reward for holding a hard line behind somebody, and it should be worth
  // taking whether or not you are also on the throttle.
  const target = hovering
    ? 0
    : FLIGHT.baseForwardSpeed *
      (1 + dive * (FLIGHT.diveSpeedMultiplier - 1) - climb * 0.35) *
      (input.boosting ? FLIGHT.boostSpeedMultiplier : 1) *
      (s.draft > 0 ? s.draft : 1);
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

  // Somebody else's shockwave, still pushing. Applied after the craft's own
  // motion and decayed afterwards, so the order is the same on both sides.
  if (s.shoveX !== 0 || s.shoveY !== 0 || s.shoveZ !== 0) {
    s.x += s.shoveX * dt;
    s.y += s.shoveY * dt;
    s.z += s.shoveZ * dt;
    const decay = Math.exp(-dt * ROLL.shoveDamping);
    s.shoveX *= decay;
    s.shoveY *= decay;
    s.shoveZ *= decay;
    // Below a walking pace it is not a shove any more, and leaving it to
    // trail off asymptotically keeps the field dirty forever.
    if (Math.abs(s.shoveX) + Math.abs(s.shoveY) + Math.abs(s.shoveZ) < 0.05) {
      s.shoveX = 0;
      s.shoveY = 0;
      s.shoveZ = 0;
    }
  }

  // Keep the player inside the map. Beyond the edge there is nothing to look
  // at, and turning back leaves the world a long way off — so the boundary
  // curves them round rather than letting them leave.
  // Chebyshev distance — the square the terrain actually is, rather than the
  // circle that fits inside it.
  const distFromCentre = Math.max(Math.abs(s.x), Math.abs(s.y));
  if (distFromCentre > BOUNDARY_SOFT) {
    const over = Math.min(
      1,
      (distFromCentre - BOUNDARY_SOFT) / (BOUNDARY_HARD - BOUNDARY_SOFT),
    );
    const inward = Math.atan2(-s.y, -s.x);
    let delta = inward - s.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    s.yaw += delta * over * dt * BOUNDARY_TURN_RATE;

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
