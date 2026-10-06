import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasLoop } from '@hooks/use-canvas-loop';
import { recordingContext } from '@tests/support/canvas-2d';

class FakeIntersectionObserver {
  static last: FakeIntersectionObserver | undefined;
  observe = vi.fn();
  disconnect = vi.fn();
  callback: (entries: { isIntersecting: boolean }[]) => void;
  constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
    this.callback = callback;
    FakeIntersectionObserver.last = this;
  }
  fire(isIntersecting: boolean) {
    act(() => this.callback([{ isIntersecting }]));
  }
}

class FakeResizeObserver {
  static last: FakeResizeObserver | undefined;
  observe = vi.fn();
  disconnect = vi.fn();
  callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
    FakeResizeObserver.last = this;
  }
}

const raf = vi.fn((_cb: FrameRequestCallback) => 1);
const caf = vi.fn();
const paint = vi.fn();
const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
};

function Harness({ still }: { still: number | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useCanvasLoop(ref, paint, { still });
  return <canvas ref={ref} />;
}

beforeEach(() => {
  FakeIntersectionObserver.last = undefined;
  FakeResizeObserver.last = undefined;
  raf.mockClear();
  caf.mockClear();
  paint.mockClear();
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', caf);
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.stubGlobal('devicePixelRatio', 3);
  const rec = recordingContext();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => rec.ctx as never);
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, get: () => 200 });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { configurable: true, get: () => 100 });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setHidden(false);
});

describe('useCanvasLoop', () => {
  it('sizes the backing store to the element, DPR capped at 2', () => {
    const { container } = render(<Harness still={null} />);
    const canvas = container.querySelector('canvas')!;
    expect([canvas.width, canvas.height]).toEqual([400, 200]);
  });

  it('schedules no frame before the canvas is on screen, then one once it is', () => {
    render(<Harness still={null} />);
    expect(raf).not.toHaveBeenCalled();
    FakeIntersectionObserver.last!.fire(true);
    expect(raf).toHaveBeenCalledTimes(1);
  });

  it('paints each frame with its clamped dt and the size, and asks for the next', () => {
    render(<Harness still={null} />);
    FakeIntersectionObserver.last!.fire(true);
    paint.mockClear();
    act(() => raf.mock.calls[0]![0](1000));
    act(() => raf.mock.calls[1]![0](3000));
    expect(paint.mock.calls.map(([, t, dt]) => [t, dt])).toEqual([[0, 0], [1 / 15, 1 / 15]]);
    expect(paint.mock.calls[0]![3]).toEqual({ w: 200, h: 100, dpr: 2 });
    expect(raf).toHaveBeenCalledTimes(3);
  });

  /*
    Decorative art at 120fps on ProMotion is four times the blur work for no
    visible gain (HIVE-225). The cap is in `tick`, so every caller gets it.
  */
  it('paints at most 30 frames a second however fast the display asks, dt from the last paint', () => {
    render(<Harness still={null} />);
    FakeIntersectionObserver.last!.fire(true);
    paint.mockClear();
    // 121 frames at 120Hz: one simulated second, both ends included.
    for (let i = 0; i <= 120; i += 1) {
      act(() => raf.mock.calls.at(-1)![0](1000 + i * (1000 / 120)));
    }
    expect(paint.mock.calls.length).toBeLessThanOrEqual(31);
    expect(paint.mock.calls.length).toBeGreaterThanOrEqual(29);
    expect(paint.mock.calls[1]![2]).toBeCloseTo(1 / 30, 3);
    // A skipped frame still asks for the next one: the loop never stalls.
    expect(raf).toHaveBeenCalledTimes(1 + 121);
  });

  it('stops on visibilitychange to hidden, and resumes when shown', () => {
    render(<Harness still={null} />);
    FakeIntersectionObserver.last!.fire(true);
    setHidden(true);
    expect(caf).toHaveBeenCalledWith(1);
    raf.mockClear();
    setHidden(false);
    expect(raf).toHaveBeenCalledTimes(1);
  });

  it('stops when the canvas leaves the viewport', () => {
    render(<Harness still={null} />);
    FakeIntersectionObserver.last!.fire(true);
    FakeIntersectionObserver.last!.fire(false);
    expect(caf).toHaveBeenCalledWith(1);
  });

  it('cleans up on unmount', () => {
    const { unmount } = render(<Harness still={null} />);
    FakeIntersectionObserver.last!.fire(true);
    unmount();
    expect(caf).toHaveBeenCalledWith(1);
    expect(FakeIntersectionObserver.last!.disconnect).toHaveBeenCalled();
    expect(FakeResizeObserver.last!.disconnect).toHaveBeenCalled();
  });

  it('still: 3 paints exactly once at t = 3 and schedules nothing', () => {
    render(<Harness still={3} />);
    expect(paint).toHaveBeenCalledTimes(1);
    expect(paint.mock.calls[0]![1]).toBe(3);
    expect(paint.mock.calls[0]![2]).toBe(0);
    expect(raf).not.toHaveBeenCalled();
    expect(FakeIntersectionObserver.last).toBeUndefined();
  });

  it('repaints on resize', () => {
    render(<Harness still={3} />);
    paint.mockClear();
    act(() => FakeResizeObserver.last!.callback());
    expect(paint).toHaveBeenCalledTimes(1);
    expect(paint.mock.calls[0]![1]).toBe(3);
  });
});
