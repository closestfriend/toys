/**
 * The agent's eyes. Every toy calls `expose()` so automated checks can read
 * real numbers (body count, fps, audio state) instead of guessing from pixels.
 *
 * URL flags:
 *   ?debug      draw colliders / extra overlays (toys check `debug`)
 *   ?seed=123   deterministic randomness (see rng.ts)
 *   ?autostart  skip the tap-to-start gate
 */
export const params = new URLSearchParams(location.search);
export const debug = params.has('debug');

export interface ToyHook {
  name: string;
  seed: number;
  /** Set true once the toy has finished loading and is running. */
  ready: boolean;
  /** Latest snapshot of whatever the toy considers important. */
  state: () => Record<string, unknown>;
  /** Optional scripted interaction for screenshots (e.g. "feed the chipper for 1.5s"). */
  demo?: () => void | Promise<void>;
  /** Console errors captured since load. */
  errors: string[];
}

declare global {
  interface Window {
    __toy?: ToyHook;
  }
}

export function expose(hook: Omit<ToyHook, 'ready' | 'errors'>): ToyHook {
  const full: ToyHook = { ...hook, ready: false, errors: [] };
  window.addEventListener('error', (e) => full.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => full.errors.push(String(e.reason)));
  window.__toy = full;
  return full;
}
