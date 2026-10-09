# toys

Small browser toys you poke at: physics, sound, and not much else.

**[breakcore woodchipper](toys/woodchipper/)**: hold to feed a drum loop into a woodchipper. It plays in order as it goes in, and every slice comes out as a chunk carrying that slice. Each time a chunk lands or gets hit, it replays its slice at the volume of the impact, so gravity becomes the sequencer. Grab chunks and throw them to play the pile. `Q` snaps hits to the 16th grid, `R` clears, and you can drag your own loop onto the page (desktop).

## Run it

```sh
npm install
npx playwright install chromium   # once, for screenshot checks
npm run dev
```

Then open the URL it prints. The gallery is at `/` and each toy is at `/<name>/`. Add `?debug` to see physics colliders and live numbers, or `?seed=42` to make a run repeatable.

## Make a new one

```sh
npm run new -- marbles "marbles" "a jar of marbles that tune themselves"
```

This gives you a gray-box toy with physics, touch, and sound already wired up. Write the feel spec at the top of `main.ts` first.

## Automated Screenshot & State Verification

```sh
npm run shot -- woodchipper --debug
```

This opens the toy headlessly at desktop and phone sizes, taps through the audio gate, runs the toy's scripted demo, and writes screenshots plus a `report.json` of each toy's state into `shots/woodchipper/`. It fails if the toy errors or never becomes ready.

## Deploy

`npm run build` produces a static site in `dist/` with relative paths, so it works on Vercel, Cloudflare Pages, Netlify or GitHub Pages, at the root or in a subfolder.

## Stack

[PixiJS](https://pixijs.com) for 2D, [Matter.js](https://brm.io/matter-js/) for 2D physics, and the Web Audio API directly. For 3D toys, add Three.js and Rapier 3D.
