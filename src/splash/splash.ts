import { scheduleCopy } from './chamber';
import { paletteFrom, startGlobe } from './stage';

import '@/styles/fonts';

import './splash.css';

/**
 * The Overmind Chamber's entry point: the copy's schedule and the globe.
 *
 * Everything that makes a decision is in `chamber.ts`, `globe.ts` and
 * `stage.ts`, which run nothing on import and are tested there. What is left is
 * the wiring a unit test cannot reach anyway: this document's elements and its
 * computed tokens.
 *
 * No store, no IPC, and from `src/` outside this directory only the pure `lib/`
 * modules the globe draws with — the Brood mutalisk (`swarm/muta`, with its
 * `tone` and `kit`), the palette, `MUTA_SCALE` from the comb and the colour helpers. The splash exists to be on screen before
 * the app has loaded, and the ESLint zones in `eslint.config.mjs` make that a
 * build failure rather than a convention.
 *
 * The brood world is centred on the bloom (660, 276 in `splash.css`) and runs on the
 * document's clock, the one the CSS animations and `scheduleCopy` share, so a
 * cell and its log line cannot drift apart.
 */

scheduleCopy(document);

const canvas = document.querySelector<HTMLCanvasElement>('#globe');
if (canvas) {
  const tokens = getComputedStyle(document.documentElement);
  startGlobe(canvas, paletteFrom((token) => tokens.getPropertyValue(token)), {
    width: 960,
    height: 600,
    cx: 660,
    cy: 276,
    scale: 1,
  });
}
