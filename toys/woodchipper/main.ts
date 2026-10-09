/**
 * BREAKCORE WOODCHIPPER
 *
 * Feel spec: hold to feed a drum loop into the chipper. It plays in order as
 * it goes in, and each slice is spat out as a chunk carrying that slice. Every
 * time a chunk lands or gets hit, it retriggers its slice at a volume set by
 * the impact. Gravity becomes the sequencer: a fresh pile is a chaotic roll
 * that settles into silence. Grab chunks and throw them to play the pile.
 * Q snaps hits to the 16th grid, turning chaos into something you can dance to.
 */
import '@kit/kit.css';
import { Application, Container, Graphics } from 'pixi.js';
import Matter from 'matter-js';
import {
  audio,
  masterBus,
  unlock,
  createLoop,
  expose,
  debug,
  createRng,
  seedFromUrl,
  onPointer,
  viewport,
  onResize,
  hud,
  type Viewport,
} from '@kit/index';
import { synthBreak } from './break';
import { SlicePlayer, SLICE_COUNT, PEAK_BUCKETS } from './slices';

const { Engine, Bodies, Body, Composite, Events, Query } = Matter;

const MAX_CHUNKS = 120;
const CHUNK_LIFETIME = 28; // seconds before a chunk fades away
const HIT_SPEED_MIN = 1.4; // relative speed (px/step) needed to make a sound
const HIT_COOLDOWN = 0.085; // seconds between retriggers of the same chunk

const seed = seedFromUrl();
const rng = createRng(seed);

interface Chunk {
  body: Matter.Body;
  view: Container;
  flash: Graphics;
  slice: number;
  born: number;
  lastHit: number;
  flashAmt: number;
  prevX: number;
  prevY: number;
  prevA: number;
  dying: boolean;
}

// ---------- boot ----------

const hook = expose({
  name: 'woodchipper',
  seed,
  state: () => ({}),
});

const ctx = await unlock({
  title: 'breakcore woodchipper',
  subtitle:
    'hold anywhere to feed the loop in. grab chunks and throw them. every landing replays its slice. drop your own loop on the page.',
});

const v0 = viewport();
const app = new Application();
await app.init({
  resizeTo: window,
  background: '#0b0b0d',
  antialias: true,
  resolution: v0.dpr,
  autoDensity: true,
  autoStart: false,
  preference: 'webgl',
});
app.ticker.stop();
document.body.appendChild(app.canvas);

const player = new SlicePlayer(ctx, masterBus(), synthBreak(ctx));
let loopName = 'built-in break (172)';
let gridT0 = ctx.currentTime;

const engine = Engine.create({ enableSleeping: false });
const world = engine.world;

const layers = {
  log: new Graphics(),
  chipper: new Graphics(),
  floor: new Graphics(),
  blades: new Graphics(),
  chunks: new Container(),
  debug: new Graphics(),
};
app.stage.addChild(layers.floor, layers.log, layers.chunks, layers.chipper, layers.blades, layers.debug);

// ---------- layout: walls + chipper ----------

let vp: Viewport = v0;
let walls: Matter.Body[] = [];
let hopper: Matter.Body | null = null;
let chipper = { x: 0, y: 0, topW: 0, botW: 0, h: 0, mouthY: 0 };
const FLOOR_PAD = 72;
let floorY = 0;
let chunkW = 60;
let chunkH = 30;

function layout(v: Viewport) {
  vp = v;
  const { w, h, unit } = v;
  engine.gravity.scale = 0.001 * Math.max(0.8, unit / 700);

  for (const b of walls) Composite.remove(world, b);
  const t = 200;
  floorY = h - FLOOR_PAD; // leave a strip under the floor for the HUD
  walls = [
    Bodies.rectangle(w / 2, floorY + t / 2, w + t * 2, t, { isStatic: true, friction: 0.8, label: 'floor' }),
    Bodies.rectangle(-t / 2, h / 2, t, h * 4, { isStatic: true, label: 'wall' }),
    Bodies.rectangle(w + t / 2, h / 2, t, h * 4, { isStatic: true, label: 'wall' }),
  ];
  Composite.add(world, walls);

  chunkW = Math.max(40, Math.min(92, unit * 0.085));
  chunkH = chunkW * 0.52;

  const topW = Math.max(150, Math.min(300, w * 0.24));
  chipper = {
    x: w / 2,
    y: Math.max(120, h * 0.24),
    topW,
    botW: topW * 0.42,
    h: topW * 0.62,
    mouthY: 0,
  };
  chipper.mouthY = chipper.y + chipper.h / 2;

  if (hopper) Composite.remove(world, hopper);
  const { x, y, botW, h: hh } = chipper;
  hopper = Bodies.fromVertices(
    x,
    y,
    [
      [
        { x: -topW / 2, y: -hh / 2 },
        { x: topW / 2, y: -hh / 2 },
        { x: botW / 2, y: hh / 2 },
        { x: -botW / 2, y: hh / 2 },
      ],
    ],
    { isStatic: true, label: 'hopper', friction: 0.3 },
  );
  // fromVertices centres the body on its centroid, which for a trapezoid sits
  // above the midpoint. Align the collider's bounds with the drawn shape instead.
  const bb = hopper.bounds;
  Body.translate(hopper, { x: x - (bb.min.x + bb.max.x) / 2, y: y - (bb.min.y + bb.max.y) / 2 });
  Composite.add(world, hopper);

  drawChipper();
  drawLog();
  layers.floor.clear().rect(0, floorY, w, 1).fill(DIM);
}

// ---------- drawing ----------

const INK = 0x0b0b0d;
const BONE = 0xf2efe8;
const DIM = 0x3a3833;
const ACCENT = 0xff4d2e;

function sliceColor(i: number): number {
  // Hot-to-cold sweep across the loop, so you can read where in the bar a chunk came from.
  const hue = (8 + (i / SLICE_COUNT) * 300) % 360;
  return hslToHex(hue, 0.86, 0.58);
}

function hslToHex(h: number, s: number, l: number): number {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}

function drawChipper() {
  const g = layers.chipper.clear();
  const { x, y, topW, botW, h } = chipper;
  g.poly([x - topW / 2, y - h / 2, x + topW / 2, y - h / 2, x + botW / 2, y + h / 2, x - botW / 2, y + h / 2]).fill(
    0x1c1b19,
  );
  g.poly([x - topW / 2, y - h / 2, x + topW / 2, y - h / 2, x + botW / 2, y + h / 2, x - botW / 2, y + h / 2]).stroke({
    width: 2,
    color: DIM,
  });
  // hazard stripes along the rim
  const stripes = 9;
  for (let i = 0; i < stripes; i++) {
    const sx = x - topW / 2 + (i / stripes) * topW;
    g.rect(sx, y - h / 2 - 8, topW / stripes / 2, 8).fill(i % 2 ? INK : ACCENT);
  }
  // mouth
  g.rect(x - botW / 2, y + h / 2 - 3, botW, 6).fill(ACCENT);
}

let bladeAngle = 0;
let bladeSpeed = 0;
function drawBlades() {
  const g = layers.blades.clear();
  const { x, y } = chipper;
  const r = chipper.botW * 0.42;
  g.circle(x, y + chipper.h * 0.08, r + 4).fill(0x121110);
  for (let k = 0; k < 4; k++) {
    const a = bladeAngle + (k * Math.PI) / 2;
    g.moveTo(x, y + chipper.h * 0.08)
      .lineTo(x + Math.cos(a) * r, y + chipper.h * 0.08 + Math.sin(a) * r)
      .stroke({ width: 4, color: k % 2 ? BONE : 0x8b877e, cap: 'round' });
  }
}

/** The loop overview strip across the top, with the next slice to be fed lit up. */
function drawLog() {
  const g = layers.log.clear();
  const pad = 16;
  const w = vp.w - pad * 2;
  const top = 18;
  const hgt = Math.min(48, vp.h * 0.06);
  const n = player.overview.length;
  const bw = w / n;
  for (let i = 0; i < n; i++) {
    const s = Math.floor(i / PEAK_BUCKETS);
    const amp = player.overview[i]!;
    const lit = s === feed.visualIndex;
    const bh = Math.max(1, amp * hgt);
    g.rect(pad + i * bw, top + (hgt - bh) / 2, Math.max(1, bw - 0.5), bh).fill(lit ? sliceColor(s) : DIM);
  }
  for (let s = 1; s < SLICE_COUNT; s++) {
    g.rect(pad + (s * w) / SLICE_COUNT, top - 3, 1, hgt + 6).fill(s % 4 ? 0x24231f : 0x4a4740);
  }
}

// ---------- chunks ----------

const chunks: Chunk[] = [];
const byBody = new Map<number, Chunk>();
let simTime = 0;
let hitsTotal = 0;

function makeChunkView(slice: number): { view: Container; flash: Graphics } {
  const view = new Container();
  const body = new Graphics();
  const w = chunkW;
  const h = chunkH;
  body.roundRect(-w / 2, -h / 2, w, h, 4).fill(sliceColor(slice));
  // its slice's waveform, drawn on the chunk like a label
  const peaks = player.peaks[slice]!;
  const bw = (w - 10) / PEAK_BUCKETS;
  for (let k = 0; k < PEAK_BUCKETS; k++) {
    const bh = Math.max(1, peaks[k]! * (h - 10));
    body.rect(-w / 2 + 5 + k * bw, -bh / 2, Math.max(1, bw - 0.6), bh).fill({ color: INK, alpha: 0.78 });
  }
  const flash = new Graphics().roundRect(-w / 2, -h / 2, w, h, 4).fill(BONE);
  flash.alpha = 0;
  view.addChild(body, flash);
  return { view, flash };
}

let side = 1;
function spawnChunk(slice: number) {
  const x = chipper.x + rng.range(-chipper.botW * 0.2, chipper.botW * 0.2);
  const y = chipper.mouthY + chunkH * 0.75 + 6; // clear of the hopper, so spawning isn't a collision
  const body = Bodies.rectangle(x, y, chunkW, chunkH, {
    restitution: 0.28,
    friction: 0.55,
    frictionAir: 0.004,
    density: 0.0018,
    chamfer: { radius: 3 },
    label: 'chunk',
  });
  const s = Math.max(0.85, vp.unit / 800);
  side = -side;
  Body.setVelocity(body, { x: side * rng.range(3, 9.5) * s, y: rng.range(-7.5, -2) * s });
  Body.setAngularVelocity(body, rng.range(-0.25, 0.25));
  Composite.add(world, body);

  const { view, flash } = makeChunkView(slice);
  view.position.set(x, y);
  layers.chunks.addChild(view);
  const c: Chunk = {
    body,
    view,
    flash,
    slice,
    born: simTime,
    lastHit: -1,
    flashAmt: 0.6,
    prevX: x,
    prevY: y,
    prevA: 0,
    dying: false,
  };
  chunks.push(c);
  byBody.set(body.id, c);

  // keep the pile bounded: oldest chunks start fading
  const alive = chunks.filter((k) => !k.dying);
  if (alive.length > MAX_CHUNKS) alive[0]!.dying = true;
  bladeSpeed = Math.min(bladeSpeed + 0.12, 0.6);
}

function removeChunk(c: Chunk) {
  Composite.remove(world, c.body);
  c.view.destroy({ children: true });
  byBody.delete(c.body.id);
  chunks.splice(chunks.indexOf(c), 1);
  grabs.forEach((g, id) => g.chunk === c && grabs.delete(id));
}

function reset() {
  [...chunks].forEach(removeChunk);
  feed.visualIndex = 0;
  feed.audioIndex = 0;
  drawLog();
}

// ---------- sound on impact ----------

let quantize = false;

function nextGrid(t: number): number {
  const grid = player.sliceDur / 2; // 16ths when the loop is 2 bars of 16 slices
  return gridT0 + Math.ceil((t - gridT0) / grid - 1e-6) * grid;
}

function hit(c: Chunk, speed: number) {
  if (c.dying || speed < HIT_SPEED_MIN) return;
  if (simTime - c.lastHit < HIT_COOLDOWN) return;
  c.lastHit = simTime;
  const gain = Math.min(1, Math.pow((speed - HIT_SPEED_MIN) / 11, 1.25) + 0.08);
  const pan = (c.body.position.x / vp.w) * 2 - 1;
  const when = quantize ? nextGrid(ctx.currentTime + 0.005) : ctx.currentTime;
  player.play(c.slice, when, gain, pan * 0.7);
  c.flashAmt = Math.max(c.flashAmt, 0.25 + gain * 0.75);
  hitsTotal++;
}

Events.on(engine, 'collisionStart', (ev) => {
  for (const pair of ev.pairs) {
    const a = pair.bodyA.parent ?? pair.bodyA;
    const b = pair.bodyB.parent ?? pair.bodyB;
    const ca = byBody.get(a.id);
    const cb = byBody.get(b.id);
    if (!ca && !cb) continue;
    const rel = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
    if (ca) hit(ca, rel);
    if (cb) hit(cb, rel);
  }
});

// ---------- feeding (the loop goes in, in order, on the audio clock) ----------

const feed = {
  active: false,
  audioIndex: 0,
  audioNext: 0,
  visualIndex: 0,
  visualTimer: 0,
};
const feeders = new Set<number | 'key'>();

function setFeeding(on: boolean) {
  if (on === feed.active) return;
  feed.active = on;
  if (on) {
    const lead = 0.03;
    feed.audioNext = ctx.currentTime + lead;
    feed.visualTimer = lead;
    feed.audioIndex = feed.visualIndex;
  }
}

function updateFeed(dt: number) {
  if (!feed.active) return;
  // audio: scheduled ahead on the sample-accurate clock
  if (ctx.state === 'running') {
    while (feed.audioNext < ctx.currentTime + 0.05) {
      player.play(feed.audioIndex, feed.audioNext, 0.9, 0);
      feed.audioIndex = (feed.audioIndex + 1) % SLICE_COUNT;
      feed.audioNext += player.sliceDur;
    }
  }
  // visuals: spawn on the sim clock, same rate, so chunks pop out in time
  feed.visualTimer -= dt;
  while (feed.visualTimer <= 0) {
    spawnChunk(feed.visualIndex);
    feed.visualIndex = (feed.visualIndex + 1) % SLICE_COUNT;
    feed.visualTimer += player.sliceDur;
    drawLog();
  }
}

// ---------- input ----------

const grabs = new Map<number, { chunk: Chunk; x: number; y: number }>();

onPointer(app.canvas, {
  down(p) {
    const found = Query.point(
      chunks.filter((c) => !c.dying).map((c) => c.body),
      { x: p.x, y: p.y },
    )[0];
    const c = found && byBody.get(found.id);
    if (c) {
      grabs.set(p.id, { chunk: c, x: p.x, y: p.y });
      hit(c, HIT_SPEED_MIN + 3); // picking one up taps it
    } else {
      feeders.add(p.id);
      setFeeding(true);
    }
  },
  move(p) {
    const g = grabs.get(p.id);
    if (g) {
      g.x = p.x;
      g.y = p.y;
    }
  },
  up(p) {
    grabs.delete(p.id);
    feeders.delete(p.id);
    if (feeders.size === 0) setFeeding(false);
  },
});

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space') {
    e.preventDefault();
    feeders.add('key');
    setFeeding(true);
  }
  if (e.code === 'KeyQ') {
    quantize = !quantize;
    gridT0 = ctx.currentTime;
  }
  if (e.code === 'KeyR') reset();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    feeders.delete('key');
    if (feeders.size === 0) setFeeding(false);
  }
});

// drop your own loop
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (!file) return;
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    player.setBuffer(buf);
    loopName = file.name;
    gridT0 = ctx.currentTime;
    reset();
  } catch (err) {
    loopName = `couldn't decode ${file.name}`;
    console.warn(err);
  }
});

// ---------- loop ----------

const ui = hud();

const loop = createLoop({
  update(dt) {
    simTime += dt;
    updateFeed(dt);

    for (const g of grabs.values()) {
      const b = g.chunk.body;
      Body.setVelocity(b, { x: (g.x - b.position.x) * 0.3, y: (g.y - b.position.y) * 0.3 });
      Body.setAngularVelocity(b, b.angularVelocity * 0.85);
    }

    for (const c of chunks) {
      c.prevX = c.body.position.x;
      c.prevY = c.body.position.y;
      c.prevA = c.body.angle;
    }
    Matter.Engine.update(engine, dt * 1000);

    for (const c of [...chunks]) {
      if (!c.dying && simTime - c.born > CHUNK_LIFETIME) c.dying = true;
      if (c.dying) {
        c.view.alpha -= dt * 1.5;
        if (c.view.alpha <= 0) removeChunk(c);
      } else if (c.body.position.y > vp.h + 400) {
        removeChunk(c);
      }
      c.flashAmt *= Math.pow(0.0005, dt); // fast exponential decay
    }

    bladeSpeed += ((feed.active ? 0.55 : 0.03) - bladeSpeed) * Math.min(1, dt * 4);
    bladeAngle += bladeSpeed;
  },

  render(alpha) {
    for (const c of chunks) {
      const p = c.body.position;
      c.view.position.set(c.prevX + (p.x - c.prevX) * alpha, c.prevY + (p.y - c.prevY) * alpha);
      c.view.rotation = c.prevA + (c.body.angle - c.prevA) * alpha;
      c.flash.alpha = c.flashAmt;
      c.view.scale.set(1 + c.flashAmt * 0.08);
    }
    drawBlades();

    if (debug) {
      const g = layers.debug.clear();
      for (const b of Composite.allBodies(world)) {
        // Chunks render interpolated (one step behind physics); shift their outline to match.
        const c = byBody.get(b.id);
        const dx = c ? c.view.x - b.position.x : 0;
        const dy = c ? c.view.y - b.position.y : 0;
        g.poly(b.vertices.flatMap((v) => [v.x + dx, v.y + dy])).stroke({ width: 1, color: b.isStatic ? 0x37ff8b : 0x37c8ff });
      }
    }

    ui.set(
      `<b>hold</b> feed   <b>drag</b> throw   <b>Q</b> quantize ${quantize ? '<b>on</b>' : 'off'}   <b>R</b> reset\n` +
        `${escapeHtml(loopName)} · drop a loop to chip it` +
        (debug ? `\nchunks ${chunks.length} · hits ${hitsTotal} · voices ${player.activeVoices} · ${loop.fps}fps` : ''),
    );
    app.render();
  },
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}

layout(v0);
onResize((v) => layout(v));
loop.start();

// ---------- debug hook ----------

hook.state = () => ({
  chunks: chunks.length,
  bodies: Composite.allBodies(world).length,
  hits: hitsTotal,
  feeding: feed.active,
  quantize,
  voices: player.activeVoices,
  fps: loop.fps,
  ticks: loop.ticks,
  audio: ctx.state,
  loop: loopName,
  sliceDur: Number(player.sliceDur.toFixed(4)),
  canvas: { w: app.canvas.width, h: app.canvas.height },
});
hook.demo = async () => {
  feeders.add('key');
  setFeeding(true);
  await new Promise((r) => setTimeout(r, 1800));
  feeders.delete('key');
  setFeeding(false);
};
hook.ready = true;

// keep audio alive if the tab was backgrounded
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void audio().resume();
});
