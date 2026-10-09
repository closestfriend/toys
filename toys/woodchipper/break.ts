/**
 * A synthesized two-bar breakbeat, so the toy ships with no sample licensing
 * questions. Drop your own loop on the page to replace it.
 */
import { createRng } from '@kit/rng';

const BAR_1 = {
  kick: 'x.x.......xx....',
  snare: '....X..o.X..X..o',
  hat: 'x.x.x.x.x.x.x.O.',
};
const BAR_2 = {
  kick: 'x.x.......x...x.',
  snare: '....X..o.X..X.oX',
  hat: 'x.x.x.x.x.x.x.x.',
};

export const BREAK_BPM = 172;

export function synthBreak(ctx: BaseAudioContext, bpm = BREAK_BPM): AudioBuffer {
  const sr = ctx.sampleRate;
  const stepSec = 60 / bpm / 4;
  const steps = 32;
  const len = Math.round(steps * stepSec * sr);
  const out = new Float32Array(len);
  const rng = createRng(1729);

  const kick = (t0: number, amp: number) => {
    const start = Math.round(t0 * sr);
    const n = Math.round(0.38 * sr);
    let phase = 0;
    for (let i = 0; i < n && start + i < len; i++) {
      const t = i / sr;
      const f = 44 + 120 * Math.exp(-t * 32);
      phase += (2 * Math.PI * f) / sr;
      const body = Math.sin(phase) * Math.exp(-t * 8.5);
      const click = t < 0.003 ? (1 - t / 0.003) * 0.7 : 0;
      out[start + i]! += (body + click) * amp;
    }
  };

  const snare = (t0: number, amp: number) => {
    const start = Math.round(t0 * sr);
    const n = Math.round(0.28 * sr);
    let lp1 = 0;
    let lp2 = 0;
    for (let i = 0; i < n && start + i < len; i++) {
      const t = i / sr;
      const white = rng() * 2 - 1;
      lp1 += (white - lp1) * 0.55; // crude band-pass: difference of two lowpasses
      lp2 += (white - lp2) * 0.06;
      const noise = (lp1 - lp2) * Math.exp(-t * 16);
      const tone =
        (Math.sin(2 * Math.PI * 186 * t) * 0.7 + Math.sin(2 * Math.PI * 334 * t) * 0.3) *
        Math.exp(-t * 28);
      out[start + i]! += (noise * 1.5 + tone * 0.8) * amp;
    }
  };

  const hat = (t0: number, amp: number, open: boolean) => {
    const start = Math.round(t0 * sr);
    const n = Math.round((open ? 0.22 : 0.05) * sr);
    let lp = 0;
    for (let i = 0; i < n && start + i < len; i++) {
      const t = i / sr;
      const white = rng() * 2 - 1;
      lp += (white - lp) * 0.35;
      const hp = white - lp;
      out[start + i]! += hp * Math.exp(-t * (open ? 13 : 75)) * amp;
    }
  };

  [BAR_1, BAR_2].forEach((bar, b) => {
    for (let s = 0; s < 16; s++) {
      // A touch of swing on the off-16ths keeps it from sounding like a drum machine demo.
      const t = (b * 16 + s) * stepSec + (s % 2 ? stepSec * 0.08 : 0);
      if (bar.kick[s] === 'x') kick(t, 1);
      const sn = bar.snare[s];
      if (sn === 'X') snare(t, 0.95);
      if (sn === 'o') snare(t, 0.38);
      const h = bar.hat[s];
      if (h === 'x') hat(t, s % 4 === 0 ? 0.32 : 0.2, false);
      if (h === 'O') hat(t, 0.28, true);
    }
  });

  // Glue: soft saturation, then normalize.
  let peak = 0;
  for (let i = 0; i < len; i++) {
    out[i] = Math.tanh(out[i]! * 1.4);
    peak = Math.max(peak, Math.abs(out[i]!));
  }
  const norm = peak > 0 ? 0.9 / peak : 1;
  const buf = ctx.createBuffer(1, len, sr);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = out[i]! * norm;
  return buf;
}
