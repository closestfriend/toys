/**
 * Slices a loop into N equal parts and plays them back on demand,
 * click-free (short fades) and with a voice cap so a pile-up of collisions
 * can't turn into a wall of noise.
 */
export const SLICE_COUNT = 16;
const PEAK_BUCKETS = 28;
const MAX_VOICES = 24;
const FADE = 0.004;

interface Voice {
  src: AudioBufferSourceNode;
  end: number;
}

export class SlicePlayer {
  buffer!: AudioBuffer;
  sliceDur = 0;
  /** Per slice: PEAK_BUCKETS values in 0..1, for drawing waveforms. */
  peaks: Float32Array[] = [];
  /** Whole-loop overview: SLICE_COUNT * PEAK_BUCKETS values. */
  overview = new Float32Array(0);
  private voices: Voice[] = [];

  constructor(
    private ctx: AudioContext,
    private out: AudioNode,
    buffer: AudioBuffer,
    readonly count = SLICE_COUNT,
  ) {
    this.setBuffer(buffer);
  }

  setBuffer(buffer: AudioBuffer) {
    this.buffer = buffer;
    this.sliceDur = buffer.duration / this.count;
    this.computePeaks();
  }

  get activeVoices(): number {
    const now = this.ctx.currentTime;
    this.voices = this.voices.filter((v) => v.end > now);
    return this.voices.length;
  }

  /** Play slice `i` at audio time `when`. gain 0..1, pan -1..1. */
  play(i: number, when: number, gain: number, pan = 0, rate = 1) {
    const c = this.ctx;
    if (c.state !== 'running' || gain <= 0.001) return;
    const t = Math.max(when, c.currentTime);
    const dur = this.sliceDur / rate;

    if (this.activeVoices >= MAX_VOICES) {
      const oldest = this.voices.shift();
      try {
        oldest?.src.stop(t);
      } catch {
        /* already stopped */
      }
    }

    const src = c.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + FADE);
    g.gain.setValueAtTime(gain, t + Math.max(FADE, dur - FADE * 2));
    g.gain.linearRampToValueAtTime(0, t + dur);
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(g).connect(p).connect(this.out);
    src.start(t, i * this.sliceDur, this.sliceDur + FADE);
    src.stop(t + dur + 0.01);
    this.voices.push({ src, end: t + dur });
  }

  private computePeaks() {
    const b = this.buffer;
    const chans = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
    const sliceLen = Math.floor(b.length / this.count);
    const bucketLen = Math.max(1, Math.floor(sliceLen / PEAK_BUCKETS));
    let max = 0;
    this.peaks = [];
    for (let s = 0; s < this.count; s++) {
      const arr = new Float32Array(PEAK_BUCKETS);
      for (let k = 0; k < PEAK_BUCKETS; k++) {
        let m = 0;
        const start = s * sliceLen + k * bucketLen;
        for (let i = start; i < start + bucketLen; i += 4) {
          for (const ch of chans) m = Math.max(m, Math.abs(ch[i] ?? 0));
        }
        arr[k] = m;
        max = Math.max(max, m);
      }
      this.peaks.push(arr);
    }
    const norm = max > 0 ? 1 / max : 1;
    this.overview = new Float32Array(this.count * PEAK_BUCKETS);
    this.peaks.forEach((arr, s) => {
      for (let k = 0; k < PEAK_BUCKETS; k++) {
        arr[k]! *= norm;
        this.overview[s * PEAK_BUCKETS + k] = arr[k]!;
      }
    });
  }
}

export { PEAK_BUCKETS };
