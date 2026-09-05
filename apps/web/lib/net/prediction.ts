import {
  createFlightSim,
  stepFlight,
  type FlightInput,
  type FlightSim,
} from "@shard-islands/shared";
import { playerState } from "./playerState";

/**
 * Client-side prediction, and reconciliation against the server's answer.
 *
 * The server is authoritative but only ticks at 20Hz, and it is a round trip
 * away. Waiting for it would put a visible lag between the stick and the
 * craft, which is unacceptable for something whose whole appeal is how the
 * flying feels. So the client runs the model itself, every frame, and
 * corrects when the truth catches up.
 *
 * That correction is where all the difficulty lives. Naively adopting each
 * server state would drag the craft backwards to where it was a round trip
 * ago. Instead every input is kept until the server acknowledges it, and a
 * correction means: take the authoritative state, replay everything the
 * server had not yet seen, and land on where the player should be NOW.
 * Because both sides run the identical `stepFlight` over the identical
 * inputs, that replay normally reproduces the prediction exactly and the
 * correction is worth nothing at all — which is the point.
 */
export interface InputSample {
  seq: number;
  turn: number;
  pitch: number;
  boosting: boolean;
  hover: boolean;
  /** -1, 0 or 1. Recorded like any other input so a replay re-fires it. */
  roll: number;
  dt: number;
}

/** The authoritative snapshot of ourselves, as the server last published it. */
export interface SelfSnapshot {
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
  lastSeq: number;
  /** Earned server-side, so the local ribbon grows with the score. */
  trailLength: number;
  /** Slipstream multiplier the room has us on. */
  draft: number;
  /** Mid-roll state and any shove we have been given, all replayable. */
  rollSpin: number;
  rollDir: number;
  rollCooldown: number;
  shoveX: number;
  shoveY: number;
  shoveZ: number;
}

/**
 * A correction bigger than this is not a correction, it is a teleport —
 * a stalled tab, a respawn, a lost connection coming back. Sliding it out
 * smoothly would leave the craft visibly detached from the world for
 * seconds, so past this it is simply shown.
 */
const MAX_SMOOTHED_CORRECTION = 40;

/** How quickly a hidden correction bleeds away, in seconds. */
const CORRECTION_TAU = 0.12;

export const prediction = {
  sim: createFlightSim(),
  /** Whatever slipstream we are in, for the indicator. 1 is none. */
  get draft() {
    return prediction.sim.draft;
  },
  /** Inputs the server has not acknowledged yet, oldest first. */
  history: [] as InputSample[],
  /** Samples not yet flushed to the wire. */
  outbox: [] as InputSample[],
  seq: 0,
  active: false,
  /** Metres between what we predicted and what the server said. Diagnostic. */
  error: 0,
  /** Largest error seen this session, which is the number worth watching. */
  worstError: 0,
  /** How many corrections were large enough to be shown rather than hidden. */
  visibleCorrections: 0,
  /** Carried so a correction is absorbed rather than seen as a jump. */
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
};

/**
 * Begins predicting from wherever the descent handed over.
 *
 * Called after `resetPlayerState`, so the sim starts at exactly the state
 * the fall produced — the same state sent to the server as the spawn.
 */
export function startPrediction() {
  const p = playerState;
  prediction.sim = createFlightSim(p.position[0], p.position[1], p.position[2], p.yaw);
  prediction.sim.pitch = p.pitch;
  prediction.sim.roll = p.roll;
  prediction.sim.speed = p.speed;
  prediction.history.length = 0;
  prediction.outbox.length = 0;
  prediction.seq = 0;
  prediction.error = 0;
  prediction.worstError = 0;
  prediction.visibleCorrections = 0;
  prediction.offsetX = 0;
  prediction.offsetY = 0;
  prediction.offsetZ = 0;
  prediction.active = true;
}

export function stopPrediction() {
  prediction.active = false;
}

/**
 * Advances the local craft by one frame and records the input, so it can be
 * replayed if the server disagrees.
 */
export function predictStep(input: FlightInput, dt: number) {
  const sample: InputSample = {
    seq: ++prediction.seq,
    turn: input.turn,
    pitch: input.pitch,
    boosting: input.boosting,
    hover: input.hover === true,
    roll: input.roll ?? 0,
    dt,
  };

  stepFlight(prediction.sim, sample, dt);
  prediction.history.push(sample);
  prediction.outbox.push(sample);

  // A runaway history means the server stopped acknowledging — offline, or
  // a connection that died mid-flight. Prediction still has to work, so the
  // oldest are dropped rather than replayed forever.
  if (prediction.history.length > 240) {
    prediction.history.splice(0, prediction.history.length - 240);
  }

  const decay = Math.exp(-dt / CORRECTION_TAU);
  prediction.offsetX *= decay;
  prediction.offsetY *= decay;
  prediction.offsetZ *= decay;

  writeToPlayerState();
}

/** Hands over everything waiting to be sent, and empties the outbox. */
export function drainOutbox(): InputSample[] {
  if (prediction.outbox.length === 0) return [];
  const samples = prediction.outbox.slice();
  prediction.outbox.length = 0;
  return samples;
}

/**
 * Folds in the server's version of us.
 *
 * Everything the server has already accounted for is dropped, its state is
 * adopted wholesale, and the inputs it had not yet seen are replayed on top.
 * Whatever distance that moves the craft is the prediction error, and it is
 * carried as a decaying visual offset so the player never sees the jump.
 */
export function reconcile(snapshot: SelfSnapshot) {
  if (!prediction.active) return;

  const sim = prediction.sim;
  const beforeX = sim.x;
  const beforeY = sim.y;
  const beforeZ = sim.z;

  sim.x = snapshot.x;
  sim.y = snapshot.y;
  sim.z = snapshot.z;
  sim.yaw = snapshot.yaw;
  sim.pitch = snapshot.pitch;
  sim.roll = snapshot.roll;
  sim.speed = snapshot.speed;
  sim.boosting = snapshot.boosting;
  sim.smoothTurn = snapshot.smoothTurn;
  sim.smoothPitch = snapshot.smoothPitch;
  // Drafting is the room's call, so it arrives with the rest of the state and
  // the replay below runs against the same multiplier the server used.
  sim.draft = snapshot.draft > 0 ? snapshot.draft : 1;
  // Adopted like everything else the step reads. A replay that started from
  // the authoritative position but the client's own idea of the roll it was
  // half way through would diverge for as long as the roll lasted.
  sim.rollSpin = snapshot.rollSpin;
  sim.rollDir = snapshot.rollDir;
  sim.rollCooldown = snapshot.rollCooldown;
  sim.shoveX = snapshot.shoveX;
  sim.shoveY = snapshot.shoveY;
  sim.shoveZ = snapshot.shoveZ;
  if (snapshot.trailLength > 0) playerState.trailLength = snapshot.trailLength;

  let kept = 0;
  for (let i = 0; i < prediction.history.length; i++) {
    const sample = prediction.history[i];
    if (sample.seq <= snapshot.lastSeq) continue;
    prediction.history[kept++] = sample;
    stepFlight(sim, sample, sample.dt);
  }
  prediction.history.length = kept;

  const dx = beforeX - sim.x;
  const dy = beforeY - sim.y;
  const dz = beforeZ - sim.z;
  const error = Math.hypot(dx, dy, dz);

  prediction.error = error;
  if (error > prediction.worstError) prediction.worstError = error;

  if (error > MAX_SMOOTHED_CORRECTION) {
    // Too far to hide. Show it, and do not pretend otherwise.
    prediction.offsetX = 0;
    prediction.offsetY = 0;
    prediction.offsetZ = 0;
    prediction.visibleCorrections++;
  } else {
    // Keep the craft where the player was already looking, and let the
    // difference bleed away over the next fraction of a second.
    prediction.offsetX += dx;
    prediction.offsetY += dy;
    prediction.offsetZ += dz;
  }

  writeToPlayerState();
}

/**
 * The predicted sim is the truth; `playerState` is the view of it that the
 * renderer, the trail and the camera all read. Position carries the decaying
 * correction offset, attitude does not — a craft whose heading lags its
 * motion looks broken in a way a few centimetres of position never does.
 */
function writeToPlayerState() {
  const sim = prediction.sim;
  const p = playerState;

  p.position[0] = sim.x + prediction.offsetX;
  p.position[1] = sim.y + prediction.offsetY;
  p.position[2] = sim.z + prediction.offsetZ;
  p.yaw = sim.yaw;
  p.pitch = sim.pitch;
  p.roll = sim.roll;
  p.speed = sim.speed;
  p.boosting = sim.boosting;

  const cp = Math.cos(sim.pitch);
  p.velocity[0] = cp * Math.cos(sim.yaw) * sim.speed;
  p.velocity[1] = cp * Math.sin(sim.yaw) * sim.speed;
  p.velocity[2] = Math.sin(sim.pitch) * sim.speed;
}

/** The live sim, for anything that needs the uncorrected truth. */
export function localSim(): FlightSim {
  return prediction.sim;
}
