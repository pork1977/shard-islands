"use client";

import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import GlassFloor from "./GlassFloor";

export default function Experience() {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 50 }} dpr={[1, 2]}>
      <GlassFloor />
      <EffectComposer>
        <Bloom intensity={1.0} luminanceThreshold={0.5} luminanceSmoothing={0.25} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
