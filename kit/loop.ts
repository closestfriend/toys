/**
 * Fixed-timestep loop. Physics/game logic runs at a constant rate (default 60 Hz)
 * no matter the display refresh rate, so a 120 Hz phone and a 60 Hz monitor
 * behave identically. Rendering happens once per animation frame.
 *
 * Never step physics inside requestAnimationFrame directly — use this.
 */
export interface LoopOptions {
  /** Seconds per update step. Default 1/60. */
  step?: number;
  /** Called 0..n times per frame with a constant dt (seconds). */
  update: (dt: number) => void;
  /** Called once per frame. alpha = 0..1 progress toward the next update, for interpolation. */
  render: (alpha: number, frameDt: number) => void;
  /** Max updates per frame before we drop time (prevents the spiral of death after a tab sleep). */
  maxSteps?: number;
}

export interface Loop {
  start(): void;
  stop(): void;
  readonly running: boolean;
  /** Smoothed frames per second, for the debug hook. */
  readonly fps: number;
  /** Total fixed updates run so far. */
  readonly ticks: number;
}

export function createLoop(opts: LoopOptions): Loop {
  const step = opts.step ?? 1 / 60;
  const maxSteps = opts.maxSteps ?? 5;
  let acc = 0;
  let last = 0;
  let raf = 0;
  let running = false;
  let fps = 60;
  let ticks = 0;

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, 0.25);
    last = now;
    if (frameDt > 0) fps += (1 / frameDt - fps) * 0.05;

    acc += frameDt;
    let n = 0;
    while (acc >= step && n < maxSteps) {
      opts.update(step);
      acc -= step;
      ticks++;
      n++;
    }
    if (n === maxSteps) acc = 0; // fell behind; drop the backlog instead of spiralling
    opts.render(acc / step, frameDt);
  };

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    get running() {
      return running;
    },
    get fps() {
      return Math.round(fps);
    },
    get ticks() {
      return ticks;
    },
  };
}
