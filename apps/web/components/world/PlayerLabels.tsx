"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ROOM } from "@shard-islands/shared";
import {
  connection,
  readRemotePlayers,
  readRoster,
  type RemoteSnapshot,
  type RosterEntry,
} from "@/lib/net/connection";
import { playerState } from "@/lib/net/playerState";
import { useGameStore } from "@/lib/store/useGameStore";
import { ALPHA_COLOUR, SEAT_COLOURS } from "@/lib/world/seatColours";


/**
 * A name over every craft, drawn once per seat onto a canvas.
 *
 * Sprites rather than DOM: a label has to sit in the world, behind hills and
 * in front of things it is in front of, and a projected DOM overlay gets all
 * of that wrong. Canvas rather than a webfont, for the same reason the
 * graffiti is drawn — nothing here waits on a network fetch.
 */
function labelTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, 256, 128);
  ctx.font = "700 76px ui-sans-serif, system-ui, Segoe UI, Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // A dark rim, so a pale label stays readable against a pale sky.
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.strokeText(text, 128, 66);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, 128, 66);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export default function PlayerLabels() {
  const phase = useGameStore((s) => s.phase);

  const snapshots = useRef<RemoteSnapshot[]>([]);
  const roster = useRef<RosterEntry[]>([]);
  const spriteRefs = useRef<(THREE.Sprite | null)[]>([]);

  // One texture per seat, built once. Seat 0 is P1.
  const textures = useMemo(
    () => Array.from({ length: ROOM.maxPlayers }, (_, i) => labelTexture(`P${i + 1}`)),
    [],
  );

  const colours = useMemo(
    () => [...SEAT_COLOURS.map((c) => new THREE.Color(c)), new THREE.Color(ALPHA_COLOUR)],
    [],
  );
  const alphaColour = colours[colours.length - 1];

  useFrame(() => {
    const sprites = spriteRefs.current;
    if (sprites.length === 0) return;

    const entries = readRoster(roster.current);
    const alphaId = entries.find((e) => e.alpha)?.id ?? "";

    const remotes = readRemotePlayers(performance.now(), snapshots.current);

    let used = 0;

    const place = (
      x: number,
      y: number,
      z: number,
      seat: number,
      isAlpha: boolean,
    ) => {
      const sprite = sprites[used];
      if (!sprite) return;
      used++;

      sprite.visible = true;
      // Above the craft in WORLD space: a label that banks with the aircraft
      // is a label nobody can read.
      sprite.position.set(x, y, z + 4.2);
      // Sprites are sized in world units, so a label big enough to read
      // across the map fills the screen from the chase camera seven metres
      // behind your own craft. Sized for the near case; distant ones are
      // small, which is the correct signal anyway.
      const scale = isAlpha ? 4.1 : 3.4;
      sprite.scale.set(scale, scale * 0.5, 1);

      const material = sprite.material as THREE.SpriteMaterial;
      material.map = textures[seat % textures.length];
      material.color.copy(isAlpha ? alphaColour : colours[seat % SEAT_COLOURS.length]);
      material.opacity = isAlpha ? 1 : 0.85;
      material.needsUpdate = true;
    };

    for (const remote of remotes) {
      place(remote.x, remote.y, remote.z, remote.seat, remote.id === alphaId);
    }

    // The local craft gets one too — it is how the player learns which one
    // they are on someone else's screen, and which colour is theirs.
    if (phase === "flying" && connection.selfId) {
      const me = entries.find((e) => e.self);
      if (me) {
        place(
          playerState.position[0],
          playerState.position[1],
          playerState.position[2],
          me.seat,
          me.alpha,
        );
      }
    }

    for (let i = used; i < sprites.length; i++) {
      const sprite = sprites[i];
      if (sprite) sprite.visible = false;
    }
  });

  return (
    <group>
      {Array.from({ length: ROOM.maxPlayers }, (_, i) => (
        <sprite
          key={i}
          ref={(sprite) => {
            spriteRefs.current[i] = sprite;
          }}
          visible={false}
        >
          <spriteMaterial
            transparent
            depthWrite={false}
            depthTest
            toneMapped={false}
          />
        </sprite>
      ))}
    </group>
  );
}
