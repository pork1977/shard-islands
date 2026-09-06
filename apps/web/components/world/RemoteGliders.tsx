"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { generateGlider } from "@/lib/world/generateGlider";
import { ROOM } from "@shard-islands/shared";
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
 */
export default function RemoteGliders() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const snapshots = useRef<RemoteSnapshot[]>([]);

  const geometry = useMemo(() => generateGlider(), []);
  const colours = useMemo(() => SEAT_COLOURS.map((c) => new THREE.Color(c)), []);
  /**
   * A craft wearing a rare form is drawn in that form's colour instead of
   * its seat's. The trail behind it still carries the seat colour, which is
   * the one that decides anything — this is a trophy, not a rule.
   */
  const plumageColours = useMemo(() => new Map<number, THREE.Color>(), []);

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

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const players = readRemotePlayers(performance.now(), snapshots.current);
    const drawn = Math.min(players.length, mesh.count);

    for (let i = 0; i < drawn; i++) {
      const p = players[i];

      // Same basis as the local craft: local +X is forward and +Z is up, in
      // a world whose up axis is +Z. Building it by hand rather than with
      // lookAt, which assumes Y-up and mirrors the craft.
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
      const look = lookOf(p.plumage);
      if (look) {
        let c = plumageColours.get(p.plumage);
        if (!c) {
          c = new THREE.Color(look.distant);
          plumageColours.set(p.plumage, c);
        }
        mesh.setColorAt(i, c);
      } else {
        mesh.setColorAt(i, colours[p.colour % colours.length]);
      }
    }

    // Unused instances are collapsed rather than left where a player who has
    // since left the room last was.
    for (let i = drawn; i < mesh.count; i++) {
      scratch.scale.setScalar(0);
      mesh.setMatrixAt(
        i,
        scratch.matrix.compose(scratch.hidden, scratch.quaternion, scratch.scale),
      );
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, ROOM.maxPlayers]}
      frustumCulled={false}
    >
      <meshBasicMaterial transparent opacity={0.92} side={THREE.DoubleSide} toneMapped={false} />
    </instancedMesh>
  );
}
