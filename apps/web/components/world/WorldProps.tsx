"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getProps } from "@/lib/world/generateProps";
import { TERRAIN_BASE_Z } from "@/lib/world/generateTerrain";
import { applyBuildingWindows } from "@/lib/shaders/buildingWindows";
import { applyDistanceFade } from "@/lib/shaders/distanceFade";

/**
 * A clump of blades, used for grass, reeds and desert scrub alike.
 *
 * Normals point straight up rather than out of each quad. A blade is a flat
 * sheet, so its true normal makes one side of every tuft black and the other
 * blown out; taking the light from above instead makes a field of them read
 * as ground cover catching the sky, which is what foliage does.
 */
function makeBladeCluster(blades: number, lean: number, width: number) {
  const position: number[] = [];

  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + 0.6;
    const outX = Math.cos(a) * lean;
    const outY = Math.sin(a) * lean;
    const sideX = Math.cos(a + Math.PI / 2);
    const sideY = Math.sin(a + Math.PI / 2);

    const bx = sideX * width;
    const by = sideY * width;
    const tx = sideX * width * 0.16;
    const ty = sideY * width * 0.16;

    const base0 = [-bx, -by, 0];
    const base1 = [bx, by, 0];
    const tip0 = [outX + tx, outY + ty, 1];
    const tip1 = [outX - tx, outY - ty, 1];

    position.push(...base0, ...base1, ...tip0);
    position.push(...base0, ...tip0, ...tip1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));

  const normal = new Float32Array(position.length);
  for (let i = 2; i < normal.length; i += 3) normal[i] = 1;
  geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));

  return geometry;
}

/** A cone standing on +Z with its base at the origin. */
function upright(radius: number, height: number, segments: number) {
  const g = new THREE.ConeGeometry(radius, height, segments);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, height / 2);
  return g;
}

/** A cylinder standing on +Z with its base at the origin. */
function column(top: number, bottom: number, height: number, segments: number) {
  const g = new THREE.CylinderGeometry(top, bottom, height, segments);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, height / 2);
  return g;
}

/** Saguaro: one trunk, two arms, each arm an elbow and an upright. */
function makeCactus() {
  const parts = [column(0.3, 0.38, 3.0, 7)];

  const arm = (side: number, at: number, len: number) => {
    const elbow = new THREE.CylinderGeometry(0.16, 0.16, len, 6);
    elbow.rotateZ(Math.PI / 2); // lay it along X
    elbow.translate((side * len) / 2, 0, at);
    parts.push(elbow);
    parts.push(
      (() => {
        const up = column(0.15, 0.17, 0.95, 6);
        up.translate(side * len, 0, at);
        return up;
      })(),
    );
  };

  arm(-1, 1.45, 0.55);
  arm(1, 1.95, 0.45);

  return mergeGeometries(parts, false)!;
}

/** Palm: a bare leaning trunk with a crown of fronds, one metre tall. */
function makePalm() {
  const parts = [column(0.11, 0.2, 1.0, 6)];

  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const frond = new THREE.ConeGeometry(0.2, 0.95, 4);
    frond.rotateX(Math.PI / 2);
    frond.translate(0, 0, 0.47); // base at the origin, tip out along +Z
    frond.scale(1, 0.34, 1); // flattened into a leaf rather than a spike
    frond.rotateY(1.2 + (i % 2) * 0.18); // tipped out to near horizontal
    frond.rotateZ((i / fronds) * Math.PI * 2);
    frond.translate(0, 0, 0.97);
    parts.push(frond);
  }

  return mergeGeometries(parts, false)!;
}

/** Picket: a plank with a pointed cap, one metre tall before scaling. */
function makePicket() {
  const plank = new THREE.BoxGeometry(0.34, 0.1, 1);
  plank.translate(0, 0, 0.5);
  const cap = upright(0.26, 0.22, 4);
  cap.translate(0, 0, 1);
  return mergeGeometries([plank, cap], false)!;
}

/**
 * The one thing standing on the big island out in the lake.
 *
 * The lake is large enough to be a destination, and a destination needs
 * something at the end of it. The beam is the point: it is visible from the
 * far shore, so the island announces itself before it can be made out.
 */
function Lighthouse({ x, y, z }: { x: number; y: number; z: number }) {
  const beamRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (beamRef.current) beamRef.current.rotation.z = state.clock.elapsedTime * 0.55;
  });

  return (
    <group position={[x, y, TERRAIN_BASE_Z + z]}>
      <mesh position={[0, 0, 9]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.5, 2.7, 18, 10]} />
        <meshLambertMaterial color="#d8d2c6" />
      </mesh>

      {/* the gallery, and the lamp room above it */}
      <mesh position={[0, 0, 18.4]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[2.6, 2.6, 0.9, 12]} />
        <meshLambertMaterial color="#7d3b32" />
      </mesh>

      <mesh position={[0, 0, 20]}>
        <sphereGeometry args={[1.5, 12, 10]} />
        <meshBasicMaterial color="#ffe9a8" toneMapped={false} />
      </mesh>

      <mesh position={[0, 0, 22.2]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[2.5, 2.6, 12]} />
        <meshLambertMaterial color="#7d3b32" />
      </mesh>

      <group ref={beamRef} position={[0, 0, 20]}>
        {[0, 1].map((i) => (
          <mesh key={i} position={[0, 0, 0]} rotation={[Math.PI / 2, 0, i * Math.PI]}>
            <planeGeometry args={[120, 7]} />
            <meshBasicMaterial
              color="#ffdf9c"
              transparent
              opacity={0.11}
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * Buildings, woodland, and everything that lives at ground level.
 *
 * Everything is instanced — a dozen meshes for some thirty thousand objects.
 * A single cone read as a paper triangle and a bare box as a crate, so a
 * tree is trunk plus two foliage tiers, and a building is a body plus a
 * separate roof. That is the cheapest silhouette change that stops them
 * reading as primitives.
 */
export default function WorldProps() {
  const props = useMemo(() => getProps(), []);

  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const roofRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const canopyLowRef = useRef<THREE.InstancedMesh>(null);
  const canopyTopRef = useRef<THREE.InstancedMesh>(null);
  const grassRef = useRef<THREE.InstancedMesh>(null);
  const reedRef = useRef<THREE.InstancedMesh>(null);
  const picketRef = useRef<THREE.InstancedMesh>(null);
  const railRef = useRef<THREE.InstancedMesh>(null);
  const cactusRef = useRef<THREE.InstancedMesh>(null);
  const palmRef = useRef<THREE.InstancedMesh>(null);
  const rockRef = useRef<THREE.InstancedMesh>(null);

  const pitched = useMemo(
    () => props.buildings.filter((b) => b.pitched === 1),
    [props],
  );

  const windows = useMemo(() => {
    const material = new THREE.MeshLambertMaterial();
    return { material, setTime: applyBuildingWindows(material) };
  }, []);

  // Ground cover is drawn only where the player is low enough to see it.
  // Reeds carry further than grass because a lake edge is something you
  // aim at from a distance.
  const groundMaterials = useMemo(() => {
    const grass = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    applyDistanceFade(grass, 75, 140);
    const reed = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    applyDistanceFade(reed, 120, 220);
    return { grass, reed };
  }, []);

  // drives the lit windows that flicker, so the town looks occupied
  useFrame((state) => {
    windows.setTime(state.clock.elapsedTime);
  });

  // Cones and cylinders are built along +Y in three.js, but this world's up
  // axis is +Z — without rotating the geometry itself, every tree and roof
  // lies on its side.
  const geo = useMemo(() => {
    const toZUp = (g: THREE.BufferGeometry) => {
      g.rotateX(Math.PI / 2);
      return g;
    };
    return {
      roof: toZUp(new THREE.ConeGeometry(0.72, 1, 4)),
      trunk: toZUp(new THREE.CylinderGeometry(0.7, 1, 1, 5)),
      canopy: toZUp(new THREE.ConeGeometry(1, 1, 7)),
      grass: makeBladeCluster(3, 0.36, 0.19),
      reed: makeBladeCluster(4, 0.16, 0.1),
      picket: makePicket(),
      rail: new THREE.BoxGeometry(1, 0.13, 0.22),
      cactus: makeCactus(),
      palm: makePalm(),
      rock: new THREE.IcosahedronGeometry(1, 0),
    };
  }, []);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 0, 1);
    const colour = new THREE.Color();

    const finish = (mesh: THREE.InstancedMesh | null) => {
      if (!mesh) return;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    };

    const body = bodyRef.current;
    if (body) {
      props.buildings.forEach((b, i) => {
        q.setFromAxisAngle(up, b.rot);
        pos.set(b.x, b.y, TERRAIN_BASE_Z + b.z + b.h / 2);
        scale.set(b.w, b.d, b.h);
        body.setMatrixAt(i, m.compose(pos, q, scale));
        // concrete and glass in town, warmer render out in the villages,
        // sun-baked mud out in the sand
        if (b.adobe === 1) {
          colour.setHSL(0.07, 0.34, 0.5 + b.shade * 0.16);
        } else if (b.pitched === 1) {
          colour.setHSL(0.09 + b.shade * 0.05, 0.22, 0.62 + b.shade * 0.2);
        } else {
          colour.setHSL(0.58 + b.shade * 0.08, 0.1 + b.shade * 0.12, 0.42 + b.shade * 0.3);
        }
        body.setColorAt(i, colour);
      });
      finish(body);
    }

    const roof = roofRef.current;
    if (roof) {
      pitched.forEach((b, i) => {
        // cone has 4 sides, rotated 45° so it sits square on the box below
        q.setFromAxisAngle(up, b.rot + Math.PI / 4);
        pos.set(b.x, b.y, TERRAIN_BASE_Z + b.z + b.h + b.w * 0.22);
        scale.set(b.w * 0.78, b.d * 0.78, b.w * 0.45);
        roof.setMatrixAt(i, m.compose(pos, q, scale));
        colour.setHSL(0.03, 0.35, 0.3 + b.shade * 0.12);
        roof.setColorAt(i, colour);
      });
      finish(roof);
    }

    const setTree = (
      mesh: THREE.InstancedMesh | null,
      zOffset: (s: number) => number,
      radius: (s: number) => number,
      height: (s: number) => number,
      shade: number,
    ) => {
      if (!mesh) return;
      props.trees.forEach((t, i) => {
        q.setFromAxisAngle(up, t.tint * Math.PI * 2);
        pos.set(t.x, t.y, TERRAIN_BASE_Z + t.z + zOffset(t.scale));
        scale.set(radius(t.scale), radius(t.scale), height(t.scale));
        mesh.setMatrixAt(i, m.compose(pos, q, scale));
        colour.setHSL(0.27 + t.tint * 0.045, 0.42 + t.tint * 0.2, shade * (0.8 + t.tint * 0.35));
        mesh.setColorAt(i, colour);
      });
      finish(mesh);
    };

    // trunk, then a wide lower tier and a narrower upper one
    setTree(trunkRef.current, (s) => s * 0.35, (s) => s * 0.09, (s) => s * 0.7, 0.28);
    setTree(canopyLowRef.current, (s) => s * 0.95, (s) => s * 0.5, (s) => s * 1.05, 0.34);
    setTree(canopyTopRef.current, (s) => s * 1.6, (s) => s * 0.34, (s) => s * 0.9, 0.42);

    const grass = grassRef.current;
    if (grass) {
      props.grass.forEach((g, i) => {
        q.setFromAxisAngle(up, g.rot);
        pos.set(g.x, g.y, TERRAIN_BASE_Z + g.z);
        scale.set(g.scale, g.scale, g.scale);
        grass.setMatrixAt(i, m.compose(pos, q, scale));
        // tint 1 is desert scrub: straw, not green
        if (g.tint > 0.9) {
          colour.setHSL(0.12, 0.36, 0.42);
        } else {
          colour.setHSL(0.26 + g.tint * 0.06, 0.44 + g.tint * 0.2, 0.34 + g.tint * 0.16);
        }
        grass.setColorAt(i, colour);
      });
      finish(grass);
    }

    const reeds = reedRef.current;
    if (reeds) {
      props.reeds.forEach((r, i) => {
        q.setFromAxisAngle(up, r.rot);
        pos.set(r.x, r.y, TERRAIN_BASE_Z + r.z);
        scale.set(r.scale * 0.72, r.scale * 0.72, r.scale);
        reeds.setMatrixAt(i, m.compose(pos, q, scale));
        // olive through to dry sedge, so a bank is not one flat colour
        colour.setHSL(0.19 + r.tint * 0.08, 0.34 + r.tint * 0.16, 0.26 + r.tint * 0.16);
        reeds.setColorAt(i, colour);
      });
      finish(reeds);
    }

    const pickets = picketRef.current;
    if (pickets) {
      props.pickets.forEach((p, i) => {
        q.setFromAxisAngle(up, p.rot);
        pos.set(p.x, p.y, TERRAIN_BASE_Z + p.z);
        scale.set(1, 1, p.h);
        pickets.setMatrixAt(i, m.compose(pos, q, scale));
        colour.setHSL(0.09, 0.12, 0.6 + (i % 5) * 0.03);
        pickets.setColorAt(i, colour);
      });
      finish(pickets);
    }

    const rails = railRef.current;
    if (rails) {
      props.rails.forEach((r, i) => {
        q.setFromAxisAngle(up, r.rot);
        // two rails per span, one high one low
        [0.8, 1.55].forEach((height, k) => {
          pos.set(r.x, r.y, TERRAIN_BASE_Z + r.z + height);
          scale.set(r.len, 1, 1);
          rails.setMatrixAt(i * 2 + k, m.compose(pos, q, scale));
          colour.setHSL(0.09, 0.12, 0.58);
          rails.setColorAt(i * 2 + k, colour);
        });
      });
      finish(rails);
    }

    const setScatter = (
      mesh: THREE.InstancedMesh | null,
      items: typeof props.cacti,
      tint: (c: THREE.Color, t: number) => void,
      squash = 1,
    ) => {
      if (!mesh) return;
      items.forEach((s, i) => {
        q.setFromAxisAngle(up, s.rot);
        pos.set(s.x, s.y, TERRAIN_BASE_Z + s.z);
        scale.set(s.scale, s.scale, s.scale * squash);
        mesh.setMatrixAt(i, m.compose(pos, q, scale));
        tint(colour, s.tint);
        mesh.setColorAt(i, colour);
      });
      finish(mesh);
    };

    setScatter(cactusRef.current, props.cacti, (c, t) =>
      c.setHSL(0.28 + t * 0.04, 0.34, 0.24 + t * 0.08),
    );
    setScatter(palmRef.current, props.palms, (c, t) =>
      c.setHSL(0.24 + t * 0.05, 0.42, 0.26 + t * 0.1),
    );
    setScatter(
      rockRef.current,
      props.rocks,
      (c, t) => c.setHSL(0.05 + t * 0.02, 0.26, 0.3 + t * 0.14),
      0.62, // boulders sit lower than they are wide
    );
  }, [props, pitched]);

  return (
    <group>
      <instancedMesh
        ref={bodyRef}
        args={[undefined, windows.material, props.buildings.length]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      <instancedMesh
        ref={roofRef}
        args={[geo.roof, undefined, Math.max(1, pitched.length)]}
        frustumCulled={false}
      >
        <meshLambertMaterial />
      </instancedMesh>

      <instancedMesh
        ref={trunkRef}
        args={[geo.trunk, undefined, props.trees.length]}
        frustumCulled={false}
      >
        <meshLambertMaterial />
      </instancedMesh>

      <instancedMesh
        ref={canopyLowRef}
        args={[geo.canopy, undefined, props.trees.length]}
        frustumCulled={false}
      >
        <meshLambertMaterial />
      </instancedMesh>

      <instancedMesh
        ref={canopyTopRef}
        args={[geo.canopy, undefined, props.trees.length]}
        frustumCulled={false}
      >
        <meshLambertMaterial />
      </instancedMesh>

      <instancedMesh
        ref={grassRef}
        args={[geo.grass, groundMaterials.grass, Math.max(1, props.grass.length)]}
        frustumCulled={false}
      />

      <instancedMesh
        ref={reedRef}
        args={[geo.reed, groundMaterials.reed, Math.max(1, props.reeds.length)]}
        frustumCulled={false}
      />

      <instancedMesh
        ref={picketRef}
        args={[geo.picket, undefined, Math.max(1, props.pickets.length)]}
        frustumCulled={false}
      >
        <meshLambertMaterial />
      </instancedMesh>

      <instancedMesh
        ref={railRef}
        args={[geo.rail, undefined, Math.max(1, props.rails.length * 2)]}
        frustumCulled={false}
      >
        <meshLambertMaterial />
      </instancedMesh>

      <instancedMesh
        ref={cactusRef}
        args={[geo.cactus, undefined, Math.max(1, props.cacti.length)]}
        frustumCulled={false}
      >
        <meshLambertMaterial />
      </instancedMesh>

      <instancedMesh
        ref={palmRef}
        args={[geo.palm, undefined, Math.max(1, props.palms.length)]}
        frustumCulled={false}
      >
        <meshLambertMaterial />
      </instancedMesh>

      <instancedMesh
        ref={rockRef}
        args={[geo.rock, undefined, Math.max(1, props.rocks.length)]}
        frustumCulled={false}
      >
        <meshLambertMaterial flatShading />
      </instancedMesh>

      <Lighthouse {...props.lighthouse} />
    </group>
  );
}
