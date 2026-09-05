"use client";

import { useMemo, useRef } from "react";
import { extend, useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { ShardGlassMaterial } from "@/lib/shaders/shardGlass";
import { generateVoronoiCells } from "@/lib/fracture/generateVoronoiCells";
import { buildFractureGeometry } from "@/lib/fracture/fractureGeometry";
import { FLIGHT } from "@shard-islands/shared";
import { useGameStore } from "@/lib/store/useGameStore";
import { resetPlayerState, STARTING_TRAIL_LENGTH } from "@/lib/net/playerState";
import { FLIGHT_ALTITUDE, TERRAIN_SIZE } from "@/lib/world/generateTerrain";
import {
  DESCENT_ACCEL,
  DESCENT_DRAG_PER_SECOND,
  collectMotes,
  descentAuthority,
  fallRun,
} from "@/lib/world/fallMotes";
import { useFlightControls } from "@/components/controllers/useFlightControls";
import { reportDescent, sendSpawn } from "@/lib/net/connection";
import { startPrediction } from "@/lib/net/prediction";
import {
  CRACK_DURATION,
  COLLAPSE_AT,
  PLUNGE_AT,
  PLUNGE_DURATION,
} from "@/lib/timeline";

/**
 * How far out the fall is allowed to carry the player. Inside the flight
 * boundary (0.44 of the map), so nobody lands somewhere the game will
 * immediately start steering them out of.
 */
const DESCENT_LIMIT = TERRAIN_SIZE * 0.4;

extend({ ShardGlassMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    shardGlassMaterial: ThreeElements["meshBasicMaterial"] & {
      uTime?: number;
      uAspect?: number;
      uNormalMap?: THREE.Texture | null;
      uGlassColor?: THREE.ColorRepresentation;
      uLightColor?: THREE.ColorRepresentation;
      uCoolColor?: THREE.ColorRepresentation;
      uLightPos?: THREE.Vector2;
      uGlowColor?: THREE.ColorRepresentation;
      uProgress?: number;
      uCollapse?: number;
      uImpact?: THREE.Vector2;
    };
  }
}

export default function FractureScene({ normalMap }: { normalMap: THREE.Texture }) {
  const materialRef = useRef<InstanceType<typeof ShardGlassMaterial>>(null);
  const { viewport } = useThree();
  const impact = useGameStore((s) => s.impact);
  const strikeAt = useGameStore((s) => s.strikeAt);
  const beginFlight = useGameStore((s) => s.beginFlight);

  const input = useFlightControls();
  const driftRef = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  /** Last frame's altitude, so mote pickups are a crossing test, not a guess. */
  const lastZRef = useRef<number | null>(null);
  /** Where the fall is pointed. Damped, so steering swings the view round. */
  const bearingRef = useRef<number | null>(null);

  const impact2D = useMemo<[number, number]>(
    () => (impact ? [impact[0], impact[1]] : [0, 0]),
    [impact],
  );

  // Generated at strike time rather than pre-baked, so the pattern is always
  // centred exactly where the user touched and differs every time.
  const geometry = useMemo(
    () =>
      buildFractureGeometry(
        generateVoronoiCells({
          width: viewport.width,
          height: viewport.height,
          impact: impact2D,
        }),
      ),
    [impact2D, viewport.width, viewport.height],
  );

  useFrame((state, rawDelta) => {
    const mat = materialRef.current;
    if (!mat) return;

    // clamped so a stalled frame cannot fling the descent sideways
    const dt = Math.min(rawDelta, 1 / 20);

    mat.uTime = state.clock.elapsedTime;
    mat.uAspect = viewport.width / viewport.height;

    // Wall-clock driven, so a dropped frame skips ahead rather than playing
    // the break in slow motion.
    const t = (performance.now() - strikeAt) / 1000;
    const u = THREE.MathUtils.clamp(t / CRACK_DURATION, 0, 1);

    // Fracture accelerates: the first cracks come slowly — the "what was
    // that?" beat — then it runs away as the pane loses integrity.
    mat.uProgress = Math.pow(u, 1.45);
    mat.uCollapse = Math.max(0, t - COLLAPSE_AT);

    // The camera falls through the hole the pane just left behind, drifting
    // toward the strike point so the plunge goes through the opening rather
    // than through intact glass.
    const p = THREE.MathUtils.clamp((t - PLUNGE_AT) / PLUNGE_DURATION, 0, 1);

    // The fall does not end in a stop — it hands straight over to the player,
    // seeded with the position and heading the plunge arrived at so control
    // begins exactly where the camera already is.
    //
    // It also hands over its MOTION. Arriving at zero speed on a level
    // heading threw away everything the descent had built up and read as the
    // sequence stopping and a game starting; carrying the fall's direction,
    // some of its speed and a nose-down attitude means the first thing the
    // player does is pull out of a dive they were already in.
    if (p >= 1) {
      const drift = driftRef.current;
      const lateral = Math.hypot(drift.vx, drift.vy);

      resetPlayerState(
        [state.camera.position.x, state.camera.position.y, state.camera.position.z],
        // below a drift this small there is no meaningful heading to keep,
        // and picking one out of the noise spins the craft on arrival
        lateral > 6 ? Math.atan2(drift.vy, drift.vx) : 0,
        {
          pitch: -0.62,
          speed: THREE.MathUtils.clamp(
            FLIGHT.baseForwardSpeed + lateral * 0.35,
            FLIGHT.baseForwardSpeed,
            FLIGHT.baseForwardSpeed * 2.3,
          ),
          // everything caught on the way down, as a head start on the trail
          trailLength: STARTING_TRAIL_LENGTH + fallRun.bonus,
        },
      );
      // Prediction starts from exactly the state the fall produced, and the
      // server is told the same state, so both sides begin from one place.
      startPrediction();
      sendSpawn();

      beginFlight();
      return;
    }

    if (p > 0) {
      const eased = p * p * (3 - 2 * p); // smoothstep: eases in, then commits
      const accel = Math.pow(p, 1.7); // and keeps accelerating downward

      // Steerable descent. A seven-second fall you cannot touch is a
      // cutscene, and it drags however good it looks — letting the player
      // pick where they come down turns the same seconds into a skydive.
      // Authority builds in over the first moments so the break still reads
      // as something happening TO them before it becomes theirs.
      // shared with the mote layout, which integrates exactly this curve
      const authority = descentAuthority(p);
      const drift = driftRef.current;

      // Steering is relative to where the fall is POINTED, not to the world
      // axes. The view swings round to follow the drift, so world-locked
      // controls would mean the same key sent the player somewhere different
      // depending on which way they happened to be facing. Forward is the
      // bearing and left/right are across it: a plane's controls, in a dive.
      if (bearingRef.current === null) {
        bearingRef.current = fallRun.bearings[0] ?? 0;
      }
      const aimX = Math.cos(bearingRef.current);
      const aimY = Math.sin(bearingRef.current);
      const push = input.current.pitch;
      const steer = input.current.turn;
      const shove = authority * dt * DESCENT_ACCEL;

      drift.vx += (aimX * push + aimY * steer) * shove;
      drift.vy += (aimY * push - aimX * steer) * shove;
      drift.vx *= Math.pow(DESCENT_DRAG_PER_SECOND, dt); // settles at terminal
      drift.vy *= Math.pow(DESCENT_DRAG_PER_SECOND, dt);
      drift.x += drift.vx * dt;
      drift.y += drift.vy * dt;

      const fallX = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(0, impact2D[0] * 0.85, eased) + drift.x,
        -DESCENT_LIMIT,
        DESCENT_LIMIT,
      );
      const fallY = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(0, impact2D[1] * 0.85, eased) + drift.y,
        -DESCENT_LIMIT,
        DESCENT_LIMIT,
      );
      const fallZ = THREE.MathUtils.lerp(5, FLIGHT_ALTITUDE, accel);

      state.camera.position.set(fallX, fallY, fallZ);

      // Anything the fall passed THROUGH this frame counts, not just what it
      // happens to be next to right now: the descent covers several metres a
      // frame by the end, and a plain proximity test drops the player
      // straight through a mote without registering it.
      const lastZ = lastZRef.current;
      if (lastZ !== null) collectMotes(lastZ, fallX, fallY, fallZ);
      lastZRef.current = fallZ;

      // Where this ends up if the player holds what they are doing. Drawn on
      // the ground as a ring: with the view tilted forward, the spot below
      // the camera is off the bottom of the frame, and a landing marker you
      // cannot see is not a landing marker.
      const remaining = (1 - p) * PLUNGE_DURATION;
      fallRun.landing[0] = THREE.MathUtils.clamp(
        fallX + drift.vx * remaining * 0.85,
        -DESCENT_LIMIT,
        DESCENT_LIMIT,
      );
      fallRun.landing[1] = THREE.MathUtils.clamp(
        fallY + drift.vy * remaining * 0.85,
        -DESCENT_LIMIT,
        DESCENT_LIMIT,
      );

      // Aim the fall.
      //
      // A camera pointed straight down cannot see anything it is steering
      // toward: a mote three hundred metres to the side sits ninety degrees
      // off axis and is simply never in the frame. Tilting the view forward,
      // toward wherever the player is actually drifting, is what makes the
      // descent something you can aim — and it lands the camera most of the
      // way round to the near-horizontal framing that flight uses, so the
      // handover has far less ground to cover.
      //
      // The tilt waits until the pane is well broken up. Swinging the view
      // while the shards are still filling the frame would throw the debris
      // off the edge of the screen, which is the thing this sequence has
      // spent a lot of effort not doing.
      if (Math.hypot(drift.vx, drift.vy) > 8) {
        const want = Math.atan2(drift.vy, drift.vx);
        let delta = want - bearingRef.current;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        bearingRef.current += delta * Math.min(1, dt * 2.2);
      }

      const tilt = THREE.MathUtils.lerp(
        0.08,
        1.15,
        THREE.MathUtils.smoothstep(p, 0.18, 0.8),
      );
      const dirX = Math.cos(bearingRef.current);
      const dirY = Math.sin(bearingRef.current);
      const sinT = Math.sin(tilt);
      const cosT = Math.cos(tilt);

      // Up is derived rather than fixed: looking straight down, "up the
      // screen" is the bearing itself; looking level, it is the world's own
      // up. Anything constant gimbals somewhere between the two.
      // other clients see the fall itself, not a glider parked at spawn
      reportDescent(performance.now(), fallX, fallY, fallZ, bearingRef.current);

      state.camera.up.set(dirX * cosT, dirY * cosT, sinT);
      state.camera.lookAt(
        fallX + dirX * sinT * 60,
        fallY + dirY * sinT * 60,
        fallZ - cosT * 60,
      );

      // Field of view widens as the fall accelerates. Falling through open
      // air has almost no visual cue for speed, and the FOV kick is what
      // makes the drop feel fast rather than merely long.
      const cam = state.camera as unknown as THREE.PerspectiveCamera;
      cam.fov = THREE.MathUtils.lerp(50, 88, Math.pow(p, 1.3));
      cam.updateProjectionMatrix();
    }
  });

  const impactVec = useMemo(
    () => new THREE.Vector2(impact2D[0], impact2D[1]),
    [impact2D],
  );

  return (
    <mesh geometry={geometry}>
      <shardGlassMaterial
        ref={materialRef}
        uNormalMap={normalMap}
        uImpact={impactVec}
        transparent
      />
    </mesh>
  );
}
