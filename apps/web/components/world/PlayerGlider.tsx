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
const BOUNDARY_SOFT = TERRAIN_SIZE * 0.36;
const BOUNDARY_HARD = TERRAIN_SIZE * 0.46;
const CEILING = -12;

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
    const pitchTarget = -inp.pitch * 1.0;

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
      (inp.boosting ? FLIGHT.boostSpeedMultiplier * 0.5 : 1);
    p.speed += (target - p.speed) * dt * 2.2;

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
    camTarget
      .set(p.position[0], p.position[1], p.position[2])
      .addScaledVector(forward, -7.5)
      .addScaledVector(up, 2.3);
    lookTarget
      .set(p.position[0], p.position[1], p.position[2])
      .addScaledVector(forward, 9);

    const follow = 1 - Math.pow(0.0016, dt);
    state.camera.position.lerp(camTarget, follow);
    lookAt.lerp(lookTarget, follow);
    state.camera.up.copy(UP);
    state.camera.lookAt(lookAt);
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={geometry}>
        <gliderCraftMaterial ref={craftMaterialRef} />
      </mesh>
    </group>
  );
}
