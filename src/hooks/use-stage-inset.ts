import { useLayoutEffect, useState, type RefObject } from 'react';

/** Above the page's own input: the gap the design draws (14px), or the corner (24px) with none. */
const ABOVE_INPUT = 14;
const CORNER = 24;

/** The page's input box: the marked one on the page that is showing. */
const visibleInput = (root: HTMLElement): HTMLElement | null =>
  [...root.querySelectorAll<HTMLElement>('[data-stage-input]')].find((el) => el.offsetParent !== null) ?? null;

/**
 * How high the Inbox corner sits on the stage (HIVE-198).
 *
 * Each page marks the box its input lives in with `data-stage-input`, and
 * this reads where that box starts. One rule instead of a height per page,
 * and the Overmind's growing command line moves the corner with it.
 * Hidden pages stay mounted (the stage hides, never unmounts), so only a
 * mark with an `offsetParent` counts. `key` re-queries when the view changes.
 */
export function useStageInset(stage: RefObject<HTMLElement | null>, key: string): number {
  const [inset, setInset] = useState(CORNER);

  useLayoutEffect(() => {
    const root = stage.current;
    if (root === null) return;
    const input = visibleInput(root);
    const measure = () => {
      // Re-queried on every measure, so an input that mounts after the view does is still found.
      const current = visibleInput(root);
      setInset(
        current === null
          ? CORNER
          : root.getBoundingClientRect().bottom - current.getBoundingClientRect().top + ABOVE_INPUT,
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    if (input !== null) observer.observe(input);
    return () => observer.disconnect();
  }, [stage, key]);

  return inset;
}
