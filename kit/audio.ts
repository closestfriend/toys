/**
 * Audio context + master bus + the tap-to-start gate.
 *
 * Browsers (iOS Safari especially) refuse to play sound until the user has
 * interacted with the page. Every toy must go through `unlock()` before it
 * expects sound. Don't create your own AudioContext.
 */
import { params } from './debug';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function audio(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
  }
  return ctx;
}

/**
 * The master bus: everything should connect here, not to ctx.destination.
 * input -> gain -> soft clip -> compressor -> destination
 */
export function masterBus(): GainNode {
  if (master) return master;
  const c = audio();
  master = c.createGain();
  master.gain.value = 0.9;

  const clip = c.createWaveShaper();
  clip.curve = softClipCurve(1.6);
  clip.oversample = '2x';

  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 6;
  comp.ratio.value = 6;
  comp.attack.value = 0.002;
  comp.release.value = 0.12;

  master.connect(clip).connect(comp).connect(c.destination);
  return master;
}

function softClipCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / norm;
  }
  return curve;
}

export interface UnlockOptions {
  title: string;
  subtitle?: string;
  /** Text on the button. Default "tap to start". */
  cta?: string;
}

/**
 * Shows a full-screen "tap to start" gate, resumes the AudioContext on the
 * user's gesture, and resolves once audio is allowed. With `?autostart` in the
 * URL the gate is skipped (audio may stay suspended — fine for screenshots).
 */
export function unlock(opts: UnlockOptions): Promise<AudioContext> {
  const c = audio();
  masterBus();
  if (params.has('autostart')) {
    void c.resume().catch(() => {});
    return Promise.resolve(c);
  }

  return new Promise((resolve) => {
    const gate = document.createElement('div');
    gate.className = 'kit-gate';
    gate.setAttribute('data-kit-gate', '');
    gate.innerHTML = `
      <div class="kit-gate__inner">
        <h1>${escape(opts.title)}</h1>
        ${opts.subtitle ? `<p>${escape(opts.subtitle)}</p>` : ''}
        <button type="button">${escape(opts.cta ?? 'tap to start')}</button>
      </div>`;
    document.body.appendChild(gate);

    const go = async () => {
      gate.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
      try {
        await c.resume();
        // A silent blip "warms" iOS output so the first real hit isn't late.
        const b = c.createBuffer(1, 1, c.sampleRate);
        const s = c.createBufferSource();
        s.buffer = b;
        s.connect(c.destination);
        s.start();
      } catch {
        /* still resolve: a silent toy beats a stuck gate */
      }
      gate.classList.add('kit-gate--gone');
      setTimeout(() => gate.remove(), 400);
      resolve(c);
    };
    gate.addEventListener('pointerdown', go);
    window.addEventListener('keydown', go);
  });
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}
