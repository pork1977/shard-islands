import { getTerrain } from "./generateTerrain";
import { getProps } from "./generateProps";

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
};

/**
 * Builds the world while the player is still looking at the unbroken pane.
 *
 * The terrain mesh and the props are both asked for at the instant the floor
 * breaks, and between them they sample the height field a few hundred
 * thousand times. That is a visible hitch at the one moment the sequence
 * cannot afford one — the whole premise is that the break is instant. The
 * landing screen is idle for as long as the player takes to reach out and
 * touch it, so the work goes there instead.
 *
 * Both generators memoise, so the strike then finds the world already built.
 */
export function prewarmWorld() {
  if (typeof window === "undefined") return;

  const build = () => {
    getTerrain();
    getProps();
  };

  const idle = (window as IdleWindow).requestIdleCallback;
  if (idle) idle(build, { timeout: 2500 });
  else window.setTimeout(build, 250);
}
