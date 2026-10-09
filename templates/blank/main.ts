/**
 * __TITLE__
 *
 * Feel spec: (write this first — what is the satisfying moment, and what does it sound like?)
 *
 * This is the gray-box stage: tap to drop boxes, each landing makes a click.
 * Get physics + input + sound feeling right here before any real visuals.
 */
import '@kit/kit.css';
import { Application, Graphics } from 'pixi.js';
import Matter from 'matter-js';
import { masterBus, unlock, createLoop, expose, debug, createRng, seedFromUrl, onPointer, viewport, onResize, hud } from '@kit/index';

const { Engine, Bodies, Composite, Events } = Matter;

const seed = seedFromUrl();
const rng = createRng(seed);
const hook = expose({ name: '__SLUG__', seed, state: () => ({}) });

const ctx = await unlock({ title: '__TITLE__', subtitle: '__DESCRIPTION__' });
const out = masterBus();

const v0 = viewport();
const app = new Application();
await app.init({ resizeTo: window, background: '#0b0b0d', antialias: true, resolution: v0.dpr, autoDensity: true, autoStart: false });
app.ticker.stop();
document.body.appendChild(app.canvas);

const engine = Engine.create();
const boxes: { body: Matter.Body; g: Graphics }[] = [];
let floor: Matter.Body | null = null;
let hits = 0;

function layout(w: number, h: number) {
  if (floor) Composite.remove(engine.world, floor);
  floor = Bodies.rectangle(w / 2, h + 50, w * 3, 100, { isStatic: true });
  Composite.add(engine.world, floor);
}

function click(gain: number) {
  if (ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(rng.range(180, 260), t);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.09);
}

Events.on(engine, 'collisionStart', (ev) => {
  for (const p of ev.pairs) {
    const s = Math.hypot(p.bodyA.velocity.x - p.bodyB.velocity.x, p.bodyA.velocity.y - p.bodyB.velocity.y);
    if (s > 1.5) {
      click(Math.min(0.6, s / 20));
      hits++;
    }
  }
});

function spawn(x: number, y: number) {
  const size = rng.range(30, 60);
  const body = Bodies.rectangle(x, y, size, size, { restitution: 0.3 });
  const g = new Graphics().rect(-size / 2, -size / 2, size, size).fill(0x8b877e);
  app.stage.addChild(g);
  Composite.add(engine.world, body);
  boxes.push({ body, g });
}

onPointer(app.canvas, { down: (p) => spawn(p.x, p.y) });

const ui = hud();
const loop = createLoop({
  update(dt) {
    Engine.update(engine, dt * 1000);
  },
  render() {
    for (const b of boxes) {
      b.g.position.set(b.body.position.x, b.body.position.y);
      b.g.rotation = b.body.angle;
    }
    ui.set(`<b>tap</b> drop a box${debug ? `\nboxes ${boxes.length} · hits ${hits} · ${loop.fps}fps` : ''}`);
    app.render();
  },
});

layout(v0.w, v0.h);
onResize((v) => layout(v.w, v.h));
loop.start();

hook.state = () => ({ boxes: boxes.length, hits, fps: loop.fps, audio: ctx.state });
hook.demo = async () => {
  for (let i = 0; i < 6; i++) {
    spawn(v0.w / 2 + rng.range(-80, 80), 60);
    await new Promise((r) => setTimeout(r, 150));
  }
};
hook.ready = true;
