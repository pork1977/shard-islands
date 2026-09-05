/**
 * How hard this device can be pushed.
 *
 * Deliberately crude. Every accurate way of answering this — benchmarking a
 * few frames, reading the unmasked renderer string — either costs the first
 * second of the experience or is being actively removed from browsers for
 * fingerprinting reasons. The two things that actually matter here can both
 * be known immediately and for free: whether this is a phone, and how many
 * physical pixels it wants to fill.
 *
 * The plan's reasoning is what this encodes. iOS Safari has no compute
 * shaders, throttles thermally under many simultaneous emissive sources,
 * and has a hard memory ceiling in WKWebView before the tab silently
 * reloads. A phone at device pixel ratio 3 is asking to render nine times
 * the pixels of the same scene at ratio 1, for a screen where nobody can
 * see the difference — that single number is the biggest lever available
 * and it costs nothing to pull.
 */

export type DeviceTier = "low" | "high";

let cached: DeviceTier | null = null;

export function deviceTier(): DeviceTier {
  if (cached) return cached;
  if (typeof window === "undefined") return "high";

  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 820;
  const fewCores = (navigator.hardwareConcurrency ?? 8) <= 4;

  // A touch device on a small screen is a phone whatever it calls itself,
  // and a machine claiming four cores or fewer is not going to enjoy this
  // either.
  cached = (coarse && narrow) || fewCores ? "low" : "high";
  return cached;
}

/**
 * The device pixel ratio ceiling.
 *
 * One on a phone. The scene is a full-screen 3D render with a bloom pass
 * over the top, and bloom is measured in pixels: at ratio 3 the same frame
 * costs nine times as much for a difference nobody can see at arm's length
 * on a six-inch screen.
 */
export function maxPixelRatio(): number {
  return deviceTier() === "low" ? 1 : 2;
}

/**
 * How many other players get a fully drawn craft and ribbon.
 *
 * The plan's number, and it is about heat rather than milliseconds: each
 * trail is an emissive band feeding the bloom pass, and iOS throttles under
 * many of them long before the frame budget runs out.
 */
export function fullyDrawnPlayerCap(): number {
  return deviceTier() === "low" ? 8 : 24;
}
