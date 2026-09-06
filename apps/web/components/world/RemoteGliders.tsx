"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { generateGlider } from "@/lib/world/generateGlider";
import { PLUMAGE_FORMS, ROOM } from "@shard-islands/shared";
import { readRemotePlayers, type RemoteSnapshot } from "@/lib/net/connection";
import { SEAT_COLOURS } from "@/lib/world/seatColours";
import { lookOf } from "@/lib/world/plumageLook";


const UP = new THREE.Vector3(0, 0, 1);

/**
 * Everyone else in the room.
 *
 * Drawn a tenth of a second in the past, interpolated between the two
 * server snapshots bracketing that moment. The server ticks at 20Hz, so
 * rendering the newest state means stepping three times a second; holding
 * everyone slightly behind means there is nearly always a later snapshot to
 * move toward, and the motion is continuous.
 *
 * Instanced against the same geometry the local craft uses, so a remote
 * player is recognisably the same object rather than a stand-in.
 *
 * One batch PER FORM, because an InstancedMesh shares a single geometry and
 * a rare form is a different shape rather than a different colour. Four
 * batches of twenty-four is nothing — and drawing them all from one would
 * have meant everyone else seeing a repainted dart while the player who
 * earned it saw a phoenix, which is the whole feature failing quietly.
 */
export default function RemoteGliders() {
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const snapshots = useRef<RemoteSnapshot[]>([]);

  const forms = useMemo(() => [0, ...PLUMAGE_FORMS], []);
  const geometries = useMemo(() => forms.map((f) => generateGlider(f)), [forms]);
  const colours = useMemo(() => SEAT_COLOURS.map((c) => new THREE.Color(c)), []);
  const formColours = useMemo(
    () =>
      forms.map((f) => {
        const look = lookOf(f);
        return look ? new THREE.Color(look.distant) : null;
      }),
    [forms],
  );

  const scratch = useMemo(
    () => ({
      matrix: new THREE.Matrix4(),
      quaternion: new THREE.Quaternion(),
      basis: new THREE.Matrix4(),
      position: new THREE.Vector3(),
      scale: new THREE.Vector3(1, 1, 1),
      forward: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      hidden: new THREE.Vector3(0, 0, 0),
    }),
    [],
  );

  /**
   * How many craft went into each batch this frame.
   *
   * A ref rather than part of the memoised scratch: writing to a useMemo
   * value from inside the frame loop is exactly what the compiler's
   * immutability rule is there to stop, and a counter is the one thing here
   * that is genuinely per-frame state rather than a reused buffer.
   */
  const counts = useRef<number[]>([]);

  useFrame(() => {
    const players = readRemotePlayers(performance.now(), snapshots.current);
    if (counts.current.length !== forms.length) {
      counts.current = new Array<number>(forms.length).fill(0);
    }
    counts.current.fill(0);

    for (const p of players) {
      const slot = forms.indexOf(p.plumage);
      // A form this build does not know about is still a craft, and drawing
      // it as an ordinary one is better than not drawing it at all.
      const bucket = slot === -1 ? 0 : slot;
      const mesh = meshRefs.current[bucket];
      if (!mesh) continue;
      const i = counts.current[bucket];
      if (i >= mesh.count) continue;

      // Same basis as the local craft: local +X is forward and +Z is up, in
      // a world whose up axis is +Z. Built by hand rather than with lookAt,
      // which assumes Y-up and mirrors the craft.
      const cp = Math.cos(p.pitch);
      scratch.forward.set(cp * Math.cos(p.yaw), cp * Math.sin(p.yaw), Math.sin(p.pitch));
      scratch.right.crossVectors(scratch.forward, UP).normalize();
      scratch.up.crossVectors(scratch.right, scratch.forward).normalize();
      scratch.right.crossVectors(scratch.up, scratch.forward);

      scratch.basis.makeBasis(scratch.forward, scratch.right, scratch.up);
      scratch.quaternion.setFromRotationMatrix(scratch.basis);

      scratch.position.set(p.x, p.y, p.z);
      scratch.scale.setScalar(1);
      mesh.setMatrixAt(
        i,
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale),
      );

      // A rare craft is drawn in its form's colour. The trail behind it
      // still carries the seat colour, which is the one deciding anything.
      const formColour = formColours[bucket];
      mesh.setColorAt(i, formColour ?? colours[p.colour % colours.length]);
      counts.current[bucket] = i + 1;
    }

    // Unused instances are collapsed rather than left where a player who has
    // since left the room last was.
    for (let b = 0; b < forms.length; b++) {
      const mesh = meshRefs.current[b];
      if (!mesh) continue;
      for (let i = counts.current[b]; i < mesh.count; i++) {
        scratch.scale.setScalar(0);
        mesh.setMatrixAt(
          i,
          scratch.matrix.compose(scratch.hidden, scratch.quaternion, scratch.scale),
        );
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  });

  return (
    <>
      {forms.map((form, b) => (
        <instancedMesh
          key={form}
          ref={(m) => void (meshRefs.current[b] = m)}
          args={[geometries[b], undefined, ROOM.maxPlayers]}
          frustumCulled={false}
        >
          <meshBasicMaterial
            transparent
            opacity={0.92}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </instancedMesh>
      ))}
    </>
  );
}
