/**
 * The landing hero is one scroll timeline, 0 → 1, shared by the 3D frame and the page overlay.
 * Kept free of three.js so the page can read it without loading the scene.
 */
export const TIMELINE = {
  /** The frame finishes its turn, centred and front-on. */
  turnEnd: 0.42,
  /** The drawn frame has replaced the 3D one. */
  swapEnd: 0.5,
  /** The camera has passed through the lens; the photograph fills the screen. */
  zoomEnd: 0.97,
} as const;

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
export const span = (p: number, from: number, to: number) => clamp01((p - from) / (to - from));
