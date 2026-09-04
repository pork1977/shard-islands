"use client";

import { useMemo, useRef } from "react";
import { extend, useFrame, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { generateGlider } from "@/lib/world/generateGlider";
import { GliderCraftMaterial } from "@/lib/shaders/gliderCraft";
import { useFlightControls } from "@/components/controllers/useFlightControls";
import { playerState } from "@/lib/net/playerState";
import {
  terrainHeightAt,
  TERRAIN_BASE_Z,
  TERRAIN_SIZE,
  FLIGHT_ALTITUDE,
} from "@/lib/world/generateTerrain";
import { FLIGHT } from "@shard-islands/shared";

extend({ GliderCraftMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    gliderCraftMaterial: ThreeElements["meshBasicMaterial"] & {
      uTime?: number;
      uHull?: THREE.ColorRepresentation;
      uEdge?: THREE.ColorRepresentation;
      uCore?: THREE.ColorRepresentation;
    };
  }
}

/** This world's up axis. The glass floor was looked down through along -Z. */
const UP = new THREE.Vector3(0, 0, 1);

/** Where the world starts turning you back, and where it refuses outright. */
const BOUNDARY_SOFT = TERRAIN_SIZE * 0.34;
const BOUNDARY_HARD = TERRAIN_SIZE * 0.44;
/** Enough headroom to climb without leaving the world behind. */
const CEILING = FLIGHT_ALTITUDE + 120;

export default function PlayerGlider() {
  const geometry = useMemo(() => generateGlider(), []);
  const groupRef = useRef<THREE.Group>(null);
  const craftMaterialRef = useRef<InstanceType<typeof GliderCraftMaterial>>(null);
  const input = useFlightControls();

  // scratch vectors, reused every frame rather than allocated
  const forward = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(), []);
  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);
  const boom = useMemo(() => new THREE.Vector3(), []);
  const basis = useMemo(() => new THREE.Matrix4(), []);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 20); // a stall must not teleport the player
    const p = playerState;
    const inp = input.current;

    if (craftMaterialRef.current) {
      craftMaterialRef.current.uTime = state.clock.elapsedTime;
    }

    // Steering is damped rather than applied directly: raw input straight
    // into the heading makes the craft feel twitchy and toy-like, and the
    // damping is what gives it the weight of a glider.
    const turnTarget = -inp.turn * 1.6;
    // inverted: drag down / press S to pull the nose UP, like a flight stick
    const pitchTarget = inp.pitch * 1.0;

    p.yaw += (turnTarget - 0) * dt * FLIGHT.turnDamping * 0.35;
    p.pitch += (pitchTarget - p.pitch) * dt * FLIGHT.turnDamping;
    p.pitch = THREE.MathUtils.clamp(p.pitch, -1.1, 1.1);

    // bank into the turn — reads as aerodynamic rather than sliding sideways
    const rollTarget = -inp.turn * 0.85;
    p.roll += (rollTarget - p.roll) * dt * 4.0;

    // diving gains speed, climbing bleeds it
    const dive = Math.max(0, -Math.sin(p.pitch));
    const climb = Math.max(0, Math.sin(p.pitch));
    const target =
      FLIGHT.baseForwardSpeed *
      (1 + dive * (FLIGHT.diveSpeedMultiplier - 1) - climb * 0.35) *
      (inp.boosting ? FLIGHT.boostSpeedMultiplier : 1);
    // Boost engages hard and bleeds off gently. Ramping in at the same slow
    // rate it decays at is what made shift feel like nothing was happening.
    const responsiveness = target > p.speed ? 5.5 : 1.6;
    p.speed += (target - p.speed) * Math.min(1, dt * responsiveness);
    p.boosting = inp.boosting;

    const cp = Math.cos(p.pitch);
    forward.set(cp * Math.cos(p.yaw), cp * Math.sin(p.yaw), Math.sin(p.pitch));
    right.crossVectors(forward, UP).normalize();
    up.crossVectors(right, forward).normalize();

    p.position[0] += forward.x * p.speed * dt;
    p.position[1] += forward.y * p.speed * dt;
    p.position[2] += forward.z * p.speed * dt;
    p.velocity = [forward.x * p.speed, forward.y * p.speed, forward.z * p.speed];

    // Keep the player inside the map. Beyond the edge there is nothing to
    // look at, and turning back leaves the world a long way off — so the
    // boundary curves them round rather than letting them leave.
    const distFromCentre = Math.hypot(p.position[0], p.position[1]);
    if (distFromCentre > BOUNDARY_SOFT) {
      const over = Math.min(
        1,
        (distFromCentre - BOUNDARY_SOFT) / (BOUNDARY_HARD - BOUNDARY_SOFT),
      );
      // steer the heading back toward the middle, harder the further out
      const inward = Math.atan2(-p.position[1], -p.position[0]);
      let delta = inward - p.yaw;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      p.yaw += delta * over * dt * 1.9;

      // and a hard stop at the very edge, in case they fight it the whole way
      if (distFromCentre > BOUNDARY_HARD) {
        const s = BOUNDARY_HARD / distFromCentre;
        p.position[0] *= s;
        p.position[1] *= s;
      }
    }

    // Ground clearance sampled from the SAME height function the mesh was
    // built from, so the player skims the actual hills rather than a guess.
    const ground =
      TERRAIN_BASE_Z + terrainHeightAt(p.position[0], p.position[1]) + 3.5;
    if (p.position[2] < ground) {
      p.position[2] = ground;
      if (p.pitch < 0) p.pitch *= 0.4; // scrub the dive rather than ploughing in
    }
    p.position[2] = Math.min(p.position[2], CEILING);

    const group = groupRef.current;
    if (!group) return;

    group.position.set(p.position[0], p.position[1], p.position[2]);
    // Local +X forward, +Z up — built directly rather than via lookAt, which
    // assumes a Y-up convention this world does not use. The Y axis must be
    // up × forward: negating it yields a LEFT-handed basis, which mirrors the
    // craft and throws it out of frame entirely.
    right.crossVectors(up, forward);
    basis.makeBasis(forward, right, up);
    group.quaternion.setFromRotationMatrix(basis);
    group.rotateX(p.roll);

    group.quaternion.normalize();
    p.quaternion = [
      group.quaternion.x,
      group.quaternion.y,
      group.quaternion.z,
      group.quaternion.w,
    ];

    // Chase camera: both position and look-at are damped, never rigidly
    // parented. A hard-parented camera transmits every twitch of the craft
    // and makes flight feel jittery instead of cinematic.
    // Free-look orbits the camera about the craft without touching where it
    // is heading — the boom swings round, the flight path does not change.
    const ly = inp.lookYaw;
    const lp = inp.lookPitch;
    const cosP = Math.cos(lp);
    boom
      .copy(forward)
      .multiplyScalar(-cosP * Math.cos(ly))
      .addScaledVector(right, -cosP * Math.sin(ly))
      .addScaledVector(up, Math.sin(lp))
      .normalize();

    camTarget
      .set(p.position[0], p.position[1], p.position[2])
      .addScaledVector(boom, 7.5)
      .addScaledVector(up, 2.3);
    lookTarget
      .set(p.position[0], p.position[1], p.position[2])
      .addScaledVector(forward, 9 * Math.max(0.15, Math.cos(ly)));

    const follow = 1 - Math.pow(0.0016, dt);
    state.camera.position.lerp(camTarget, follow);
    lookAt.lerp(lookTarget, follow);
    state.camera.up.copy(UP);
    state.camera.lookAt(lookAt);

    // Ease the field of view back down from the wide angle the fall left it
    // at, then let speed nudge it — going faster should feel like going
    // faster, not just move the scenery quicker.
    const cam = state.camera as unknown as THREE.PerspectiveCamera;
    // Boost widens the lens only slightly. At the previous rate it pulled
    // back so far on boost that the craft shrank and the world felt further
    // away, which is the opposite of what going faster should feel like.
    const fovTarget = 62 + (p.speed / FLIGHT.baseForwardSpeed - 1) * 5;
    cam.fov += (fovTarget - cam.fov) * Math.min(1, dt * 2.2);
    cam.updateProjectionMatrix();
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={geometry}>
        <gliderCraftMaterial
          ref={craftMaterialRef}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
