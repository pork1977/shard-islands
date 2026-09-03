"use client";

import dynamic from "next/dynamic";

const Experience = dynamic(() => import("./Experience"), { ssr: false });

export default function ExperienceLoader() {
  return <Experience />;
}
