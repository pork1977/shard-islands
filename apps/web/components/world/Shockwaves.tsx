"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ROLL } from "@shard-islands/shared";
import { readRollEvents, type RollEvent } from "@/lib/net/connection";
import { SEAT_COLOURS } from "@/lib/world/seatColours";

/** Concurrent shockwaves. Beyond this nobody is reading them anyway. */
const CAPACITY = 10;
/** How long one takes to expand and go. */
const LIFE = 0.75;

interface Wave {
  x: number;
  y: number;
  z: number;
  colour: number;
  at: number;
}

/**
 * The shockwave a barrel roll throws off.
 *
 * This one has to be honest about its size in a way the other effects do
 * not. Every other flourish in the game is decoration over a rule you
 * cannot see; this one IS the rule — everybody inside it gets thrown, and a
 * player who cannot tell where the edge was will read the whole mechanic as
 * arbitrary. So the sphere expands to exactly ROLL.radius and stops there.
 *
 * A hard shell that expands and thins, and a soft inner flash that
 * collapses. Drawn from the room's record of where the roll happened, so
 * everybody sees the same wall of air in the same place.
 */
export default function Shockwaves() {
  const shellRef = useRef<THREE.InstancedMesh>(null);
  const flashRef = useRef<THREE.InstancedMesh>(null);

  const eventsRef = useRef<RollEvent[]>([]);
  const wavesRef = useRef<Wave[]>([]);

  const geo = useMemo(
    () => ({
      shell: new THREE.SphereGeometry(1, 28, 18),
      flash: new THREE.IcosahedronGeometry(1, 1),
    }),
    [],
  );

  const colours = useMemo(() => SEAT_COLOURS.map((c) => new THREE.Color(c)), []);
  const white = useMemo(() => new THREE.Color("#eaf7ff"), []);
  const tint = useMemo(() => new THREE.Color(), []);

  useFrame((state) => {
    const shell = shellRef.current;
    const flash = flashRef.current;
    if (!shell || !flash) return;

    const now = state.clock.elapsedTime;
    const events = eventsRef.current;
    const waves = wavesRef.current;

    readRollEvents(events);
    for (const e of events) {
      waves.push({ x: e.x, y: e.y, z: e.z, colour: e.colour, at: now });
      if (waves.length > CAPACITY) waves.shift();
    }

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();

    let n = 0;
    for (const wave of waves) {
      const t = (now - wave.at) / LIFE;
      if (t >= 1 || n >= CAPACITY) continue;

      pos.set(wave.x, wave.y, wave.z);
      // Nearly white at the heart, carrying the roller's colour at the rim,
      // so you can tell whose it was without it stopping being a shockwave.
      tint.copy(white).lerp(colours[wave.colour % colours.length], 0.55);

      // Out fast and easing to a stop exactly at the radius that matters.
      const reach = ROLL.radius * Math.sqrt(Math.min(1, t * 1.35));
      q.identity();
      scale.setScalar(Math.max(0.001, reach));
      shell.setMatrixAt(n, m.compose(pos, q, scale));
      shell.setColorAt(n, tint);

      // Small and quick. At nearly half the radius it was fifteen metres of
      // solid white in front of a chase camera twenty metres back — a
      // whiteout rather than a flash, and it hid the one thing the effect
      // is supposed to communicate, which is where the edge of the wave is.
      const flare = Math.max(0, 1 - t * 4.5) * ROLL.radius * 0.16;
      scale.setScalar(Math.max(0.001, flare));
      flash.setMatrixAt(n, m.compose(pos, q, scale));
      flash.setColorAt(n, white);

      n++;
    }

    scale.setScalar(0);
    q.identity();
    pos.set(0, 0, 0);
    for (let i = n; i < CAPACITY; i++) {
      shell.setMatrixAt(i, m.compose(pos, q, scale));
      flash.setMatrixAt(i, m.compose(pos, q, scale));
    }

    while (waves.length > 0 && now - waves[0].at > LIFE) waves.shift();

    // One opacity for all of them: individual fades would need a material
    // each, and a shockwave lasts less than a second.
    const youngest = waves.length > 0 ? (now - waves[waves.length - 1].at) / LIFE : 1;
    const alpha = Math.max(0, 1 - youngest);
    (shell.material as THREE.MeshBasicMaterial).opacity = 0.34 * alpha;
    (flash.material as THREE.MeshBasicMaterial).opacity = 0.4 * alpha;

    shell.instanceMatrix.needsUpdate = true;
    flash.instanceMatrix.needsUpdate = true;
    if (shell.instanceColor) shell.instanceColor.needsUpdate = true;
    if (flash.instanceColor) flash.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh
        ref={shellRef}
        args={[geo.shell, undefined, CAPACITY]}
        frustumCulled={false}
      >
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          wireframe
        />
      </instancedMesh>

      <instancedMesh
        ref={flashRef}
        args={[geo.flash, undefined, CAPACITY]}
        frustumCulled={false}
      >
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}
