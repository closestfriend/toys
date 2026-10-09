#!/usr/bin/env node
/**
 * npm run shot -- <toy> [--debug] [--seed=N] [--no-demo]
 *
 * Boots the dev server, opens the toy in headless Chromium at desktop and
 * phone sizes, taps through the audio gate, runs the toy's scripted demo
 * (window.__toy.demo) and saves screenshots + a state report to shots/<toy>/.
 *
 * Exit code 1 if the toy never became ready or logged errors. Agents: you must
 * actually LOOK at the PNGs this writes before saying a visual change works.
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const toy = args.find((a) => !a.startsWith('--'));
const flag = (name) => args.includes(`--${name}`);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;

if (!toy) {
  console.error('usage: npm run shot -- <toy> [--debug] [--seed=N] [--no-demo]');
  process.exit(2);
}
if (!existsSync(resolve('toys', toy, 'index.html'))) {
  console.error(`no toy at toys/${toy}/index.html`);
  process.exit(2);
}

const seed = opt('seed', '1');
const outDir = resolve('shots', toy);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];

const LAUNCH_ARGS = [
  '--autoplay-policy=no-user-gesture-required',
  '--use-angle=swiftshader', // software WebGL so headless never renders a black canvas
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

async function launch() {
  try {
    return await chromium.launch({ args: LAUNCH_ARGS });
  } catch (err) {
    const fallback = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
    if (existsSync(fallback)) return chromium.launch({ args: LAUNCH_ARGS, executablePath: fallback });
    console.error('Could not launch Chromium. Run: npx playwright install chromium');
    throw err;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await createServer({ logLevel: 'error', server: { port: 5199, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await launch();
const report = { toy, seed, runs: [] };
let failed = false;

try {
  for (const vp of VIEWPORTS) {
    const { name, ...ctxOpts } = vp;
    const context = await browser.newContext(ctxOpts);
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));

    const url = `${base}${toy}/?seed=${seed}${flag('debug') ? '&debug' : ''}`;
    await page.goto(url, { waitUntil: 'load' });

    // Tap through the audio gate like a person would.
    const gate = await page.waitForSelector('[data-kit-gate]', { timeout: 5000 }).catch(() => null);
    if (gate) await gate.click();

    const ready = await page
      .waitForFunction(() => window.__toy?.ready === true, null, { timeout: 15000 })
      .then(() => true)
      .catch(() => false);

    const run = { viewport: name, url, ready, shots: [], errors };
    report.runs.push(run);

    const snap = async (label) => {
      const file = `${name}-${run.shots.length}-${label}.png`;
      await page.screenshot({ path: resolve(outDir, file) });
      const state = await page.evaluate(() => window.__toy?.state?.() ?? null).catch(() => null);
      run.shots.push({ file, state });
    };

    if (!ready) {
      await snap('not-ready');
      failed = true;
      await context.close();
      continue;
    }

    await sleep(400);
    await snap('start');
    const hasDemo = await page.evaluate(() => typeof window.__toy?.demo === 'function');
    if (hasDemo && !flag('no-demo')) {
      void page.evaluate(() => window.__toy.demo());
      await sleep(900);
      await snap('demo');
      await sleep(1800);
      await snap('after');
    }
    await sleep(2500);
    await snap('settled');

    const toyErrors = await page.evaluate(() => window.__toy?.errors ?? []);
    errors.push(...toyErrors);
    if (errors.length) failed = true;
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2));

for (const run of report.runs) {
  console.log(`\n${run.viewport}: ${run.ready ? 'ready' : 'NOT READY'}`);
  for (const s of run.shots) console.log(`  shots/${toy}/${s.file}  ${JSON.stringify(s.state)}`);
  for (const e of run.errors) console.log(`  ERROR ${e}`);
}
console.log(`\nreport: shots/${toy}/report.json`);
console.log(failed ? '\nFAIL' : '\nOK — now open the PNGs and look at them.');
process.exit(failed ? 1 : 0);
