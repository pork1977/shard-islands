"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BEACON, beaconSite } from "@shard-islands/shared";
import { readBeacon } from "@/lib/net/connection";

/**
 * The Beacon: one enormous spiked dome, and the only clock the whole map
 * shares.
 *
 * It began as pure orientation — a map needs one thing visible from
 * anywhere, and deliberately only one, because a landmark stops being a
 * landmark the moment there are five of them. Now it also charges, and
 * when it fills it opens and hangs a core in its mouth for whoever gets
 * there first.
 *
 * Everything here reads the room; nothing here decides anything. Whether
 * the Beacon is open, and who took it, is the server's business — a client
 * that opened it on its own authority would send a player diving at
 * something that was not there.
 *
 * Its site now comes from the shared package. It used to be chosen with
 * Math.random inside this component, which meant every player saw it in a
 * different place — invisible while it was scenery, and fatal the moment it
 * became somewhere to race to.
 */
export default function Monolith() {
  const site = useMemo(() => beaconSite(), []);

  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const chargeRef = useRef<THREE.Mesh>(null);
  const beamsRef = useRef<THREE.Group>(null);
  const domeRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Group>(null);
  const coreShellRef = useRef<THREE.Mesh>(null);
  const coreHaloRef = useRef<THREE.Mesh>(null);
  const spikesRef = useRef<THREE.Group>(null);

  const spikes = useMemo(() => {
    const out: { rot: [number, number, number]; len: number }[] = [];
    const count = 26;
    // Deterministic, like everything else about this object.
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      // spread over the upper hemisphere, avoiding a neat ring
      const theta = Math.acos(1 - rand() * 0.95);
      const phi = (i / count) * Math.PI * 2 + rand() * 0.4;
      out.push({
        rot: [theta * Math.cos(phi), theta * Math.sin(phi), phi],
        len: 26 + rand() * 40,
      });
    }
    return out;
  }, []);

  const domeGeo = useMemo(() => {
    // faceted hemisphere, flat-shaded to match the world's low-poly language
    const g = new THREE.SphereGeometry(
      BEACON.domeRadius,
      22,
      12,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2,
    );
    g.rotateX(Math.PI / 2); // +Z up
    const faceted = g.toNonIndexed();
    faceted.computeVertexNormals();
    g.dispose();
    return faceted;
  }, []);

  const spikeGeo = useMemo(() => {
    const g = new THREE.ConeGeometry(3.6, 1, 5);
    g.translate(0, 0.5, 0); // base at origin so it grows outward
    g.rotateX(Math.PI / 2);
    return g;
  }, []);

  const colours = useMemo(
    () => ({
      idle: new THREE.Color("#7a2bff"),
      charged: new THREE.Color("#ff9d2b"),
      open: new THREE.Color("#ffffff"),
      spikeIdle: new THREE.Color("#2b1c4d"),
      spikeOpen: new THREE.Color("#ffe9b0"),
      haloIdle: new THREE.Color("#b06bff"),
      haloOpen: new THREE.Color("#fff0c0"),
    }),
    [],
  );

  const scratch = useMemo(() => new THREE.Color(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const beacon = readBeacon();
    const open = beacon.phase === 1;
    const spent = beacon.phase === 2;

    // How close it is to going off. Drives everything: the colour climbing
    // from violet to hot orange is the whole warning, and it has to be
    // legible from the far side of the map.
    const heat = open ? 1 : spent ? 0 : beacon.charge;
    // A pulse that quickens as it fills, so the last few seconds feel like
    // the last few seconds.
    const urgency = 0.9 + heat * 5.5;
    const beat = 0.5 + 0.5 * Math.sin(t * urgency);

    if (ringRef.current) {
      ringRef.current.rotation.z = t * (0.12 + heat * 0.5);
      const s = 1 + Math.sin(t * 0.9) * 0.03 + heat * beat * 0.06;
      ringRef.current.scale.set(s, s, 1);
      const m = ringRef.current.material as THREE.MeshBasicMaterial;
      m.color.copy(colours.haloIdle).lerp(colours.haloOpen, heat);
      m.opacity = spent ? 0.1 : 0.28 + heat * 0.4;
    }

    // A second ring that fills like a gauge as the charge climbs — the
    // difference between "something is happening over there" and "it goes
    // off in about ten seconds, get moving".
    if (chargeRef.current) {
      chargeRef.current.visible = !spent && beacon.charge > 0.02;
      chargeRef.current.rotation.z = -t * 0.4;
      chargeRef.current.scale.setScalar(0.35 + beacon.charge * 0.9);
      const m = chargeRef.current.material as THREE.MeshBasicMaterial;
      m.color.copy(colours.idle).lerp(colours.charged, beacon.charge);
      m.opacity = open ? 0.9 * beat : 0.2 + beacon.charge * 0.55;
    }

    if (domeRef.current) {
      const m = domeRef.current.material as THREE.MeshLambertMaterial;
      scratch.copy(colours.idle).lerp(colours.charged, heat);
      if (open) scratch.lerp(colours.open, beat * 0.75);
      m.emissive.copy(scratch);
      m.emissiveIntensity = 0.6 + heat * 1.6 + (open ? beat * 1.2 : 0);
    }

    if (spikesRef.current) {
      const glow = 0.9 + heat * 1.8 + (open ? beat * 1.5 : 0);
      spikesRef.current.children.forEach((child) => {
        const m = (child as THREE.Mesh).material as THREE.MeshLambertMaterial;
        m.emissive.copy(colours.spikeIdle).lerp(colours.spikeOpen, heat);
        m.emissiveIntensity = glow;
      });
    }

    if (beamsRef.current) {
      beamsRef.current.rotation.z = -t * (0.05 + heat * 0.45);
      beamsRef.current.children.forEach((b, i) => {
        const mesh = b as THREE.Mesh;
        const m = mesh.material as THREE.MeshBasicMaterial;
        m.color.copy(colours.haloIdle).lerp(colours.haloOpen, heat);
        m.opacity =
          (spent ? 0.05 : 0.1 + heat * 0.5) +
          0.07 * (0.5 + 0.5 * Math.sin(t * (1.3 + heat * 4) + i * 1.7));
        // The shafts stand up taller as it charges, so the column grows.
        mesh.scale.y = 1 + heat * 0.9;
      });
    }

    // The core itself, which is the thing to actually fly at.
    if (coreRef.current) {
      coreRef.current.visible = open;
      if (open) {
        coreRef.current.rotation.z = t * 1.1;
        coreRef.current.rotation.x = t * 0.7;

        if (coreShellRef.current) {
          const s = 1 + beat * 0.14;
          coreShellRef.current.scale.setScalar(s);
        }
        if (coreHaloRef.current) {
          // Breathes out to the claim radius and back, so the size of the
          // thing on screen is also the size of the thing you have to hit.
          const s = 0.55 + 0.45 * beat;
          coreHaloRef.current.scale.setScalar(s);
          (coreHaloRef.current.material as THREE.MeshBasicMaterial).opacity =
            0.16 + 0.2 * (1 - beat);
        }
      }
    }
  });

  return (
    <group ref={groupRef} position={[site.x, site.y, site.groundZ - 6]}>
      <mesh ref={domeRef} geometry={domeGeo}>
        <meshLambertMaterial color="#171a2e" emissive="#2a1150" emissiveIntensity={0.6} />
      </mesh>

      <group ref={spikesRef}>
        {spikes.map((s, i) => (
          <mesh
            key={i}
            geometry={spikeGeo}
            rotation={[s.rot[0], s.rot[1], 0]}
            scale={[1, 1, s.len]}
          >
            <meshLambertMaterial
              color="#2b1c4d"
              emissive="#7a2bff"
              emissiveIntensity={0.9}
            />
          </mesh>
        ))}
      </group>

      {/* halo lying on the ground around the base */}
      <mesh ref={ringRef} position={[0, 0, 1]}>
        <ringGeometry args={[70, 96, 64]} />
        <meshBasicMaterial
          color="#b06bff"
          transparent
          opacity={0.28}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* the charge gauge, a ring that grows as it fills */}
      <mesh ref={chargeRef} position={[0, 0, 3]}>
        <ringGeometry args={[100, 118, 72]} />
        <meshBasicMaterial
          color="#7a2bff"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {/* light shafts climbing into the sky, visible from far across the map */}
      <group ref={beamsRef}>
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2;
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * 26, Math.sin(a) * 26, 150]}
              rotation={[0, 0, a]}
            >
              <planeGeometry args={[16, 300]} />
              <meshBasicMaterial
                color="#c48bff"
                transparent
                opacity={0.14}
                side={THREE.DoubleSide}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
          );
        })}
      </group>

      {/*
        The prize, hanging in the mouth of the dome. Its halo is drawn at
        the claim radius the server actually uses, so what the player aims
        at and what the room measures are the same thing.
      */}
      <group ref={coreRef} position={[0, 0, site.coreZ - (site.groundZ - 6)]} visible={false}>
        <mesh ref={coreShellRef}>
          <icosahedronGeometry args={[9, 1]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
        <mesh>
          <icosahedronGeometry args={[15, 0]} />
          <meshBasicMaterial
            color="#ffe9b0"
            transparent
            opacity={0.5}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={coreHaloRef}>
          <sphereGeometry args={[BEACON.claimRadius, 20, 14]} />
          <meshBasicMaterial
            color="#fff4d0"
            transparent
            opacity={0.18}
            depthWrite={false}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}
