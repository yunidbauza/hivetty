import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

const list = (): MediaQueryList | null =>
  typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? null
    : window.matchMedia(QUERY);

const subscribe = (onChange: () => void): (() => void) => {
  const media = list();
  if (media === null) return () => {};
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

const read = (): boolean => list()?.matches ?? false;

/**
 * Whether the user has asked for less motion.
 *
 * ## Why JavaScript has to answer this
 *
 * `global.css` already collapses CSS animation and transition durations under
 * this media query, and for everything the app draws itself that is enough.
 *
 * It does nothing for a canvas. The creatures (`SwarmCreature`, the Home
 * comb, the splash globe) are drawn frame by frame from a `requestAnimationFrame`
 * loop, and no stylesheet reaches a loop. The only lever is whether the loop
 * runs, so something has to read the query in JS and paint a still frame
 * instead (`useCanvasLoop`'s `still`). `src/splash/stage.ts` reaches the same
 * conclusion for the cold-start globe.
 *
 * ## Why it subscribes
 *
 * The setting is changed while apps are running — it is a system toggle, not a
 * boot flag — and a value read once at mount would leave a creature breathing
 * at somebody who just asked it to stop.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
