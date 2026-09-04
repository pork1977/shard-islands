import { create } from "zustand";
import type { Vec3Tuple } from "@shard-islands/shared";

export type GamePhase = "landing" | "fracturing" | "flying";

// Everything here is deliberately plain serializable primitives (no refs, no
// class instances) so the player slice can later be mirrored straight into a
// networked schema without restructuring.
interface GameState {
  phase: GamePhase;
  /** Strike point in world space — drives the fracture pattern and camera. */
  impact: Vec3Tuple | null;
  /**
   * Wall-clock time of the strike (performance.now, ms). The fracture timeline
   * runs off this rather than off accumulated render-clock deltas, so a
   * dropped frame skips ahead instead of playing the break in slow motion.
   */
  strikeAt: number;
  strike: (impact: Vec3Tuple) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  phase: "landing",
  impact: null,
  strikeAt: 0,
  strike: (impact) =>
    set({ phase: "fracturing", impact, strikeAt: performance.now() }),
  reset: () => set({ phase: "landing", impact: null, strikeAt: 0 }),
}));
