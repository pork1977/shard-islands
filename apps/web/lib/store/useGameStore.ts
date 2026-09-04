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
  strike: (impact: Vec3Tuple) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  phase: "landing",
  impact: null,
  strike: (impact) => set({ phase: "fracturing", impact }),
  reset: () => set({ phase: "landing", impact: null }),
}));
