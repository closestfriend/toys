/**
 * Viewport size + device pixel ratio, with a single resize subscription.
 * DPR is capped at 2: phones report 3, and rendering 9x the pixels for no
 * visible gain is the most common reason a toy runs hot.
 */
export interface Viewport {
  w: number;
  h: number;
  dpr: number;
  /** min(w, h) — handy for sizing things so they read on phone and desktop. */
  unit: number;
}

export const MAX_DPR = 2;

export function viewport(): Viewport {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return { w, h, dpr: Math.min(window.devicePixelRatio || 1, MAX_DPR), unit: Math.min(w, h) };
}

export function onResize(cb: (v: Viewport) => void): () => void {
  let raf = 0;
  const fire = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => cb(viewport()));
  };
  window.addEventListener('resize', fire);
  window.visualViewport?.addEventListener('resize', fire);
  return () => {
    window.removeEventListener('resize', fire);
    window.visualViewport?.removeEventListener('resize', fire);
  };
}
