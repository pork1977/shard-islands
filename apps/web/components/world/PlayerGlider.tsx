"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { extend, useFrame, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { generateGlider } from "@/lib/world/generateGlider";
import { GliderCraftMaterial } from "@/lib/shaders/gliderCraft";
import { takeRoll, useFlightControls } from "@/components/controllers/useFlightControls";
import {
  flushInputs,
  readBeacon,
  readOwnPlumage,
  readSelfSnapshot,
} from "@/lib/net/connection";
import { lookOf } from "@/lib/world/plumageLook";
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

/** What the craft goes back to, and starts as. Matches gliderCraft.ts. */
const DEFAULT_CRAFT = { hull: "#0b0a1f", edge: "#7ff0ff", core: "#2bd6ff" };

export default function PlayerGlider() {
  /**
   * Polled rather than read in the frame loop, because the SHAPE changes
   * too — a rare form is a different silhouette, not a repaint — and new
   * geometry has to be built outside the render.
   */
  const [worn, setWorn] = useState(0);
  useEffect(() => {
    const poll = setInterval(() => setWorn(readOwnPlumage()), 400);
    return () => clearInterval(poll);
  }, []);

  const geometry = useMemo(() => generateGlider(worn), [worn]);
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
  const craftPos = useMemo(() => new THREE.Vector3(), []);
  const zoomShown = useRef(1);
  /** Rare form currently applied, so the uniforms are set on change only. */
  const wornRef = useRef(-1);
  /** Where the boom pointed last frame, in world space, while a view is held. */
  const heldBoom = useRef<THREE.Vector3 | null>(null);
  /** Distance the orbit was taken hold of at, kept constant all the way round. */
  const orbitRadius = useRef(7.5);
  /** Offset from craft to the point the orbit turns about, held for the drag. */
  const aimOffset = useRef<THREE.Vector3 | null>(null);
  /** Last acknowledged input, so a snapshot is reconciled once, not per frame. */
  const lastAck = useRef(-1);
  /** Eased, so the downwash fades in and out rather than switching. */
  const draft = useRef(0);
  /**
   * Whether this craft is holding the Beacon's charge.
   *
   * State rather than a ref, because it changes the ribbon's material and
   * that is decided at render. It changes twice a minute at most.
   */
  const [overcharged, setOvercharged] = useState(false);
  useEffect(() => {
    const poll = setInterval(() => setOvercharged(readBeacon().mine), 200);
    return () => clearInterval(poll);
  }, []);

  /** 0 the instant flight begins, 1 once the chase camera has taken over. */
  const handover = useRef(0);
  const seeded = useRef(false);
  const basis = useMemo(() => new THREE.Matrix4(), []);

  /**
   * The stick as the shared step wants it, reused every frame.
   *
   * The controls hold a barrel roll as a LATCH rather than as a held state,
   * and this is where it is consumed — exactly once, whatever the frame
   * rate. Reading it straight off the controls object would re-fire the
   * same double tap on every frame until the key was pressed again.
   */
  const stickRef = useRef({
    turn: 0,
    pitch: 0,
    boosting: false,
    hover: false,
    roll: 0,
  });

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 20); // a stall must not teleport the player
    const p = playerState;
    const inp = input.current;

    if (craftMaterialRef.current) {
      craftMaterialRef.current.uTime = state.clock.elapsedTime;

      // Applied from the SERVER's answer rather than remembered locally.
      // The roll happens there, and a craft that decided its own form would
      // be wearing something nobody else could see.
      const plumage = readOwnPlumage();
      if (plumage !== wornRef.current) {
        wornRef.current = plumage;
        const look = lookOf(plumage);
        const mat = craftMaterialRef.current;
        mat.uHull.set(look ? look.hull : DEFAULT_CRAFT.hull);
        mat.uEdge.set(look ? look.edge : DEFAULT_CRAFT.edge);
        mat.uCore.set(look ? look.core : DEFAULT_CRAFT.core);
      }
    }

    // The flight model itself now lives in the shared package, so the
    // server's authoritative tick runs the identical arithmetic. What
    // happens here is prediction: step immediately for feel, then fold in
    // the server's answer whenever a newer one has landed.
    const stick = stickRef.current;
    stick.turn = inp.turn;
    stick.pitch = inp.pitch;
    stick.boosting = inp.boosting;
    stick.hover = inp.hover;
    stick.roll = takeRoll();

    predictStep(stick, dt);

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
    /**
     * While a view is held, the world does not move. At all.
     *
     * lookYaw and lookPitch are offsets from the CRAFT's own basis, so they
     * turn with it: steering during a free-look dragged the whole view round
     * with the nose, and pitching took it up and down as well.
     *
     * Cancelling that by adding back the craft's change in heading works for
     * yaw and gets fiddly for pitch, where the sign depends on how the basis
     * was built. So it is not done by arithmetic on the deltas at all. The
     * boom's WORLD direction is remembered from the previous frame, and the
     * offsets that reproduce that exact direction against the new basis are
     * solved for directly — which is inverting the three lines below, needs
     * no signs guessed, and holds pitch as firmly as it holds yaw.
     */
    /**
     * Taking hold of the view must not move it.
     *
     * The orbit used to be defined from scratch — a radius derived from the
     * chase distance and an aim on the craft — so the instant the mouse went
     * down both jumped away from where the camera actually was, and the
     * craft appeared to hop. The orbit is therefore adopted FROM the current
     * pose instead: whatever radius the camera is at, whatever it is looking
     * at, that is where the orbit starts.
     */
    if (inp.freeLook && !heldBoom.current) {
      craftPos.set(p.position[0], p.position[1], p.position[2]);
      // The orbit turns about WHAT THE CAMERA IS LOOKING AT, and the offset
      // from the craft to that point is then held for the whole drag.
      //
      // Orbiting about the craft instead meant the aim had to move from
      // where it was — nine metres ahead of the nose — onto the craft, and
      // easing that over half a second was still a shove: the plane slid
      // forward as the aim slid back. Nothing needs to move at all. Turn
      // about the point already at the centre of the screen and the thing
      // at the centre of the screen stays there.
      aimOffset.current = new THREE.Vector3().copy(lookAt).sub(craftPos);
      const offset = new THREE.Vector3().copy(state.camera.position).sub(lookAt);
      orbitRadius.current = Math.max(0.5, offset.length());
      heldBoom.current = offset.normalize();
    }

    if (inp.freeLook && heldBoom.current) {
      const held = heldBoom.current;
      inp.lookPitch = Math.asin(THREE.MathUtils.clamp(held.dot(up), -1, 1));
      inp.lookYaw = Math.atan2(-held.dot(right), -held.dot(forward));
    }

    /**
     * The drag itself, applied AFTER that and not before.
     *
     * Order is the whole of it. The solve above rewrites both offsets from
     * where the camera was pointing last frame, so anything the mouse had
     * already written into them was simply thrown away — the view was pinned
     * to wherever the drag started and could not be moved at all.
     *
     * Cancel the craft's rotation first, then add what the player did.
     */
    if (inp.lookDeltaX !== 0 || inp.lookDeltaY !== 0) {
      // Yaw is deliberately UNCLAMPED so the camera can swing the whole way
      // round the craft; a limit near half a turn feels like hitting a wall
      // just as you go to look behind you.
      inp.lookYaw -= inp.lookDeltaX * 0.005;
      // Inverted: pushing the mouse up swings the camera up over the craft.
      // Pitch stays limited, or it tumbles over the top.
      inp.lookPitch = THREE.MathUtils.clamp(
        inp.lookPitch + inp.lookDeltaY * 0.004,
        -1.15,
        1.15,
      );
      inp.lookDeltaX = 0;
      inp.lookDeltaY = 0;
    }

    const ly = inp.lookYaw;
    const lp = inp.lookPitch;
    const cosP = Math.cos(lp);
    boom
      .copy(forward)
      .multiplyScalar(-cosP * Math.cos(ly))
      .addScaledVector(right, -cosP * Math.sin(ly))
      .addScaledVector(up, Math.sin(lp))
      .normalize();

    // Remember where it ended up, so the next frame can put it back there
    // however much the craft has rotated in between.
    if (inp.freeLook) {
      heldBoom.current = (heldBoom.current ?? new THREE.Vector3()).copy(boom);
    } else {
      heldBoom.current = null;
      aimOffset.current = null;
    }

    // wheel zoom, eased so a flick of the wheel does not snap the camera
    zoomShown.current += (inp.zoom - zoomShown.current) * Math.min(1, dt * 6);
    const dist = 7.5 * zoomShown.current;

    if (inp.freeLook) {
      /**
       * A TRUE orbit: same distance from the craft at every angle, craft
       * dead centre.
       *
       * The chase framing offsets the camera along the craft's own up as
       * well as along the boom, which is what puts the craft slightly low
       * in frame and looks right when flying. It is wrong for an orbit,
       * because that offset does not rotate with the boom — swing round to
       * where the boom points down and the lift cancels most of it, the
       * camera closes on the craft, and far enough round it ends up inside
       * it and the craft vanishes. That is the arc Paul could feel and not
       * name.
       *
       * The radius here is the length the chase framing would have had, so
       * grabbing the mouse does not jump the camera in or out — it just
       * stops the distance changing as you go round.
       */
      // The centre of the orbit travels with the craft but does not rotate
      // with it, so a turn moves neither the camera nor the aim.
      lookTarget.set(p.position[0], p.position[1], p.position[2]);
      if (aimOffset.current) lookTarget.add(aimOffset.current);
      camTarget.copy(lookTarget).addScaledVector(boom, orbitRadius.current);
    } else {
      camTarget
        .set(p.position[0], p.position[1], p.position[2])
        .addScaledVector(boom, dist)
        .addScaledVector(up, 2.3 * zoomShown.current);
      lookTarget
        .set(p.position[0], p.position[1], p.position[2])
        .addScaledVector(forward, 9 * Math.max(0.15, Math.cos(ly)));
    }

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
      {/* white hot while overcharged: your own wake is cutting people, and
          you need to be able to see where you have put it */}
      <TrailRibbon
        points={() => playerState.trail}
        width={TRAIL.baseThickness * (overcharged ? 1.7 : 1.15)}
        {...(overcharged ? { core: "#ffffff", tail: "#ff9d2b" } : {})}
      />
    </>
  );
}
