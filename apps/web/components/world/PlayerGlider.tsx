"use client";

import { useMemo, useRef } from "react";
import { extend, useFrame, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { generateGlider } from "@/lib/world/generateGlider";
import { GliderCraftMaterial } from "@/lib/shaders/gliderCraft";
import { useFlightControls } from "@/components/controllers/useFlightControls";
import { flushInputs, readSelfSnapshot } from "@/lib/net/connection";
import { playerState, pushTrailPoint } from "@/lib/net/playerState";
import { predictStep, reconcile } from "@/lib/net/prediction";
import TrailRibbon from "./TrailRibbon";
import HoverDraft from "./HoverDraft";
import { FLIGHT, TRAIL } from "@shard-islands/shared";

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
  const zoomShown = useRef(1);
  /** Last acknowledged input, so a snapshot is reconciled once, not per frame. */
  const lastAck = useRef(-1);
  /** Eased, so the downwash fades in and out rather than switching. */
  const draft = useRef(0);
  /** 0 the instant flight begins, 1 once the chase camera has taken over. */
  const handover = useRef(0);
  const seeded = useRef(false);
  const basis = useMemo(() => new THREE.Matrix4(), []);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 20); // a stall must not teleport the player
    const p = playerState;
    const inp = input.current;

    if (craftMaterialRef.current) {
      craftMaterialRef.current.uTime = state.clock.elapsedTime;
    }

    // The flight model itself now lives in the shared package, so the
    // server's authoritative tick runs the identical arithmetic. What
    // happens here is prediction: step immediately for feel, then fold in
    // the server's answer whenever a newer one has landed.
    predictStep(inp, dt);

    const snapshot = readSelfSnapshot();
    if (snapshot && snapshot.lastSeq !== lastAck.current) {
      lastAck.current = snapshot.lastSeq;
      reconcile(snapshot);
    }

    // batched and rate-limited inside; a no-op while offline
    flushInputs(performance.now());

    draft.current += ((inp.hover ? 1 : 0) - draft.current) * Math.min(1, dt * 3.5);

    // The craft's basis, rebuilt from the attitude prediction just produced.
    // This has to happen here and not inside the shared step: the step is
    // pure arithmetic that the server runs too, and these are three.js
    // vectors that only the renderer and the chase camera below care about.
    const cp = Math.cos(p.pitch);
    forward.set(cp * Math.cos(p.yaw), cp * Math.sin(p.yaw), Math.sin(p.pitch));
    right.crossVectors(forward, UP).normalize();
    up.crossVectors(right, forward).normalize();

    // arc-length sampled, so trail resolution does not depend on frame rate
    pushTrailPoint(p, TRAIL.pointSpacingMeters * 2.2, Math.round(p.trailLength));

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

    // wheel zoom, eased so a flick of the wheel does not snap the camera
    zoomShown.current += (inp.zoom - zoomShown.current) * Math.min(1, dt * 6);
    const dist = 7.5 * zoomShown.current;

    camTarget
      .set(p.position[0], p.position[1], p.position[2])
      .addScaledVector(boom, dist)
      .addScaledVector(up, 2.3 * zoomShown.current);
    lookTarget
      .set(p.position[0], p.position[1], p.position[2])
      .addScaledVector(forward, 9 * Math.max(0.15, Math.cos(ly)));

    // The camera is inherited from the fall, pointed straight down at the
    // ground, and the chase framing is nearly horizontal. Cutting between
    // the two is the jolt that made arrival read as a scene change rather
    // than as the end of a dive, so the follow is slack for the first
    // second and tightens to its normal rate as the craft levels out.
    if (!seeded.current) {
      seeded.current = true;
      state.camera.getWorldDirection(lookAt);
      lookAt.multiplyScalar(9).add(state.camera.position);
    }
    handover.current = Math.min(1, handover.current + dt / 1.1);
    const settle = handover.current * handover.current * (3 - 2 * handover.current);

    const follow = 1 - Math.pow(THREE.MathUtils.lerp(0.6, 0.0016, settle), dt);
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
    <>
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

      <HoverDraft
        strength={() => draft.current}
        position={() => playerState.position}
      />

      {/* the trail lives in world space — parenting it to the craft would
          drag the whole tail around every time the nose turns */}
      <TrailRibbon points={() => playerState.trail} width={TRAIL.baseThickness * 1.15} />
    </>
  );
}
