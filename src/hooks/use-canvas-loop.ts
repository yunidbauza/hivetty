import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef } from 'react';

export interface CanvasSize {
  /** CSS pixels. */
  w: number;
  h: number;
  /** Device pixels per CSS pixel, capped at 2. */
  dpr: number;
}

export type CanvasPaint = (ctx: CanvasRenderingContext2D, t: number, dt: number, size: CanvasSize) => void;

/** A long frame (a stall, a tab coming back) advances the clock this far at most. */
const MAX_DT = 1 / 15;

/**
 * The shortest gap between two paints: 30fps, less a millisecond so rAF jitter
 * on a 60Hz display never drops every other paint (HIVE-225).
 */
const FRAME_MS = 1000 / 30 - 1;

/**
 * A canvas's animation loop (HIVE-221; extracted from the comb, HIVE-199).
 *
 * Runs `requestAnimationFrame` only while the canvas is on screen and the
 * document is visible, and stops for good on unmount. At most thirty frames a
 * second paint (HIVE-225); each paint advances the clock by the real time since
 * the last one, clamped to 1/15 s, and calls `paint` with it. The backing
 * store follows the element, device pixel ratio capped at 2, and is repainted
 * on every resize.
 *
 * `still`, a number, is reduced motion: one paint at that `t`, no frame ever
 * scheduled, and a repaint whenever `paint` changes (the data or the palette
 * behind it). The latest `paint` is always the one called, so a changing
 * callback never restarts the loop.
 */
export function useCanvasLoop(
  ref: RefObject<HTMLCanvasElement | null>,
  paint: CanvasPaint,
  opts: { still: number | null },
): void {
  const { still } = opts;
  const paintRef = useRef(paint);
  const stillRef = useRef(still);
  const size = useRef<CanvasSize>({ w: 0, h: 0, dpr: 1 });
  const clock = useRef(0);

  useLayoutEffect(() => {
    paintRef.current = paint;
    stillRef.current = still;
  });

  const draw = useCallback(
    (t: number, dt: number): void => {
      const canvas = ref.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || canvas.width === 0) return;
      paintRef.current(ctx, t, dt, size.current);
    },
    [ref],
  );

  // The backing store follows the element. The mount sizes it and paints the
  // first frame of a loop; a still's one paint is the effect below.
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const resize = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      size.current = { w, h, dpr };
    };
    resize();
    if (stillRef.current === null) draw(clock.current, 0);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      resize();
      draw(stillRef.current ?? clock.current, 0);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [ref, draw]);

  useLayoutEffect(() => {
    if (still === null) return;
    clock.current = still;
    draw(still, 0);
  }, [still, paint, draw]);

  const animated = still === null;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !animated) return undefined;
    let frame = 0;
    let last: number | null = null;
    let onScreen = typeof IntersectionObserver === 'undefined';
    let visible = !document.hidden;

    function tick(now: number): void {
      frame = 0;
      if (last === null || now - last >= FRAME_MS) {
        const dt = last === null ? 0 : Math.min(Math.max((now - last) / 1000, 0), MAX_DT);
        last = now;
        clock.current += dt;
        draw(clock.current, dt);
      }
      schedule();
    }
    function schedule(): void {
      if (frame === 0 && onScreen && visible) frame = requestAnimationFrame(tick);
    }
    function stop(): void {
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      last = null;
    }
    const onVisibility = (): void => {
      visible = !document.hidden;
      if (visible) schedule();
      else stop();
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            onScreen = entries.some((entry) => entry.isIntersecting);
            if (onScreen) schedule();
            else stop();
          });
    observer?.observe(canvas);
    document.addEventListener('visibilitychange', onVisibility);
    schedule();
    return () => {
      stop();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [animated, ref, draw]);
}
