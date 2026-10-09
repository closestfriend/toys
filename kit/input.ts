/**
 * Unified pointer input (mouse, touch, pen) with velocity tracking, so
 * flings work the same everywhere. Coordinates are CSS pixels relative to
 * the target element.
 */
export interface PointerInfo {
  id: number;
  x: number;
  y: number;
  /** px per second, smoothed */
  vx: number;
  vy: number;
}

export interface PointerHandlers {
  down?: (p: PointerInfo) => void;
  move?: (p: PointerInfo) => void;
  up?: (p: PointerInfo) => void;
}

export function onPointer(el: HTMLElement, h: PointerHandlers): () => void {
  const live = new Map<number, PointerInfo & { t: number }>();

  const pos = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: PointerEvent) => {
    el.setPointerCapture(e.pointerId);
    const { x, y } = pos(e);
    const p = { id: e.pointerId, x, y, vx: 0, vy: 0, t: e.timeStamp };
    live.set(e.pointerId, p);
    h.down?.(p);
  };
  const move = (e: PointerEvent) => {
    const p = live.get(e.pointerId);
    if (!p) return;
    const { x, y } = pos(e);
    const dt = Math.max((e.timeStamp - p.t) / 1000, 1 / 240);
    p.vx += ((x - p.x) / dt - p.vx) * 0.5;
    p.vy += ((y - p.y) / dt - p.vy) * 0.5;
    p.x = x;
    p.y = y;
    p.t = e.timeStamp;
    h.move?.(p);
  };
  const up = (e: PointerEvent) => {
    const p = live.get(e.pointerId);
    if (!p) return;
    live.delete(e.pointerId);
    h.up?.(p);
  };

  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
  };
}
