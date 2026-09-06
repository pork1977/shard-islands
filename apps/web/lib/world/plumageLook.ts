import { PLUMAGE } from "@shard-islands/shared";

/**
 * What each rare form looks like.
 *
 * One table, because a craft is drawn in two places with two different
 * materials — the local player gets the faceted shader with its hull, edge
 * and core colours; everyone else is a flat instanced colour — and a form
 * that looked like one thing to its owner and another to the room would be
 * the same class of bug as a Beacon in two places.
 *
 * The trail is not in here and never will be. Colour decides who can cut
 * whom and how hard a slipstream pulls; the craft carries no rule, which is
 * exactly why the craft is what changes.
 */
export interface PlumageLook {
  name: string;
  /** Faceted shader, for the craft the player is sitting in. */
  hull: string;
  edge: string;
  core: string;
  /** Flat colour, for the same craft seen by everybody else. */
  distant: string;
  /** The halo that says "that one is wearing something" from a mile off. */
  halo: string;
}

export const PLUMAGE_LOOKS: Record<number, PlumageLook> = {
  // Burning: a dark body you can barely see, carrying fire at every edge.
  [PLUMAGE.PHOENIX]: {
    name: "Phoenix",
    hull: "#2a0b04",
    edge: "#ff8a1e",
    core: "#fff0c2",
    distant: "#ff7a22",
    halo: "#ff9a3c",
  },
  // Clear glass, lit from inside. The pane you came through, still falling.
  [PLUMAGE.PRISM]: {
    name: "Prism",
    hull: "#dff4ff",
    edge: "#ffffff",
    core: "#9fd8ff",
    distant: "#eaf9ff",
    halo: "#bfe9ff",
  },
  // A hole. The only dark thing in a bright sky, which is why it reads.
  [PLUMAGE.VOID]: {
    name: "Void",
    hull: "#000000",
    edge: "#b06bff",
    core: "#3a0f6b",
    distant: "#14001f",
    halo: "#a24dff",
  },
};

export const lookOf = (plumage: number): PlumageLook | null =>
  PLUMAGE_LOOKS[plumage] ?? null;
