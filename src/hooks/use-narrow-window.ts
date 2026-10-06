import { useSyncExternalStore } from 'react';

/** Under this, round two's session panel stays a strip (HIVE-201; HIVE-211 owns the rest). */
const NARROW = '(max-width: 1199px)';

/** No `matchMedia` (jsdom, an embedded host) reads as wide, as the theme's own query does. */
const hasMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

const subscribe = (onChange: () => void) => {
  if (!hasMatchMedia()) return () => {};
  const query = window.matchMedia(NARROW);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
};

const snapshot = () => (hasMatchMedia() ? window.matchMedia(NARROW).matches : false);

/** Whether the window is narrower than 1,200px. */
export function useNarrowWindow(): boolean {
  return useSyncExternalStore(subscribe, snapshot);
}
