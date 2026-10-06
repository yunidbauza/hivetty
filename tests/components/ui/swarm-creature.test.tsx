import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SwarmCreature } from '@components/ui/swarm-creature';
import * as brood from '@lib/swarm/brood';
import { BLEED } from '@lib/swarm/brood';
import { HOVER } from '@lib/swarm/hover';
import { OVERLORD } from '@lib/swarm/overlord';
import { SPIRE } from '@lib/swarm/spire';
import { recordingContext } from '@tests/support/canvas-2d';
import { expectNoHexColour } from '@tests/support/light';

/**
 * `matchMedia` is not implemented in happy-dom, so every test that cares about
 * it has to install one. Returning `matches` from the argument lets a test say
 * "the user asked for reduced motion" without reaching into the component.
 */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) =>
        listeners.add(fn),
      removeEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) =>
        listeners.delete(fn),
    })),
  );

  return listeners;
}

/** Records what the loop does with the screen, without ever running a frame. */
class FakeIntersectionObserver {
  static last: FakeIntersectionObserver | undefined;
  observe = vi.fn();
  disconnect = vi.fn();
  constructor() {
    FakeIntersectionObserver.last = this;
  }
}

const raf = vi.fn((_cb: FrameRequestCallback) => 1);

beforeEach(() => {
  raf.mockClear();
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  const rec = recordingContext();
  // The hive draws its window on a layer sized to the canvas it paints into.
  Object.defineProperty(rec.ctx, 'canvas', { value: document.createElement('canvas') });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => rec.ctx as never);
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, get: () => 104 });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { configurable: true, get: () => 96 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SwarmCreature', () => {
  it('is hidden from assistive technology', () => {
    stubMatchMedia(false);
    const { container } = render(<SwarmCreature creature="overlord" />);

    expect(container.querySelector('[data-creature]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders at the height it was given', () => {
    stubMatchMedia(false);
    const { container } = render(<SwarmCreature creature="overlord" size={120} />);

    expect(container.querySelector('[data-creature]')).toHaveStyle({ height: '120px' });
  });

  it('draws the egg as the Hatchery does, in a box its height tall', () => {
    stubMatchMedia(false);
    const { container } = render(<SwarmCreature creature="egg" size={120} />);

    const egg = container.querySelector('[data-creature="egg"]');
    expect(egg).toHaveStyle({ height: '120px' });
    expect(egg).toHaveAttribute('aria-hidden', 'true');
    expect(egg?.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it.each(['overlord', 'egg'] as const)('passes a caller’s class to the %s box', (creature) => {
    stubMatchMedia(false);
    const { container } = render(<SwarmCreature creature={creature} className="mb-9" />);

    expect(container.querySelector('[data-creature]')).toHaveClass('select-none', 'mb-9');
  });

  it('names which creature it is, so casting stays reviewable', () => {
    stubMatchMedia(false);
    const { container } = render(<SwarmCreature creature="spire" />);

    expect(container.querySelector('[data-creature]')).toHaveAttribute('data-creature', 'spire');
  });

  /** Every creature is the Brood's now; no sprite, no `<img>`. */
  it.each([
    ['overlord', OVERLORD],
    ['spire', SPIRE],
    ['mutalisk', HOVER],
  ] as const)('draws the %s on a canvas, as wide as its box', (creature, drawing) => {
    stubMatchMedia(false);
    const { container } = render(<SwarmCreature creature={creature} size={72} />);

    const width = (72 * drawing.box[2]) / drawing.box[3];
    expect(container.querySelector('[data-creature]')).toHaveStyle({ height: '72px', width: `${width}px` });
    expect(container.querySelector('img')).toBeNull();
    // The canvas bleeds past the laid-out box so nothing drawn past it is cut off (HIVE-222).
    expect(container.querySelector('[data-creature] canvas')).toHaveStyle({
      height: `${72 * (1 + 2 * BLEED)}px`,
      width: `${width * (1 + 2 * BLEED)}px`,
      left: `${-width * BLEED}px`,
      top: `${-72 * BLEED}px`,
      pointerEvents: 'none',
    });
  });

  it.each([
    ['spire', SPIRE],
    ['overlord', OVERLORD],
  ] as const)('holds the %s at its rest frame when the user asked for less motion', (creature, drawing) => {
    stubMatchMedia(true);
    const paint = vi.spyOn(brood, 'paintCreature');
    render(<SwarmCreature creature={creature} />);

    expect(paint).toHaveBeenCalledTimes(1);
    expect(paint.mock.calls[0]![1]).toBe(drawing);
    expect(paint.mock.calls[0]![2]).toBe(drawing.rest);
    expect(raf).not.toHaveBeenCalled();
  });

  describe('a Brood creature', () => {
    it('draws the spire on a canvas, as tall as its size and as wide as its box', () => {
      stubMatchMedia(false);
      const { container } = render(<SwarmCreature creature="spire" size={96} />);

      const creature = container.querySelector('[data-creature]')!;
      expect(creature).toHaveAttribute('data-creature', 'spire');
      expect(creature).toHaveAttribute('aria-hidden', 'true');
      expect(creature).toHaveStyle({ height: '96px', width: `${(96 * SPIRE.box[2]) / SPIRE.box[3]}px` });
      expect(creature.querySelector('canvas')).not.toBeNull();
    });

    it('draws the mutalisk on a canvas at its own aspect', () => {
      stubMatchMedia(false);
      const { container } = render(<SwarmCreature creature="mutalisk" size={120} />);

      const creature = container.querySelector('[data-creature]')!;
      expect(creature).toHaveAttribute('data-creature', 'mutalisk');
      expect(creature).toHaveStyle({ height: '120px', width: `${(120 * HOVER.box[2]) / HOVER.box[3]}px` });
    });

    it('animates only once it is on screen', () => {
      stubMatchMedia(false);
      render(<SwarmCreature creature="spire" />);

      expect(FakeIntersectionObserver.last?.observe).toHaveBeenCalled();
      expect(raf).not.toHaveBeenCalled();
    });

    it('paints its rest frame once under reduced motion, and schedules no frame', () => {
      stubMatchMedia(true);
      const paint = vi.spyOn(brood, 'paintCreature');
      render(<SwarmCreature creature="spire" />);

      expect(paint).toHaveBeenCalledTimes(1);
      const [, creature, t, w, h] = paint.mock.calls[0]!;
      expect(creature).toBe(SPIRE);
      expect(t).toBe(SPIRE.rest);
      expect([w, h]).toEqual([104, 96]);
      expect(raf).not.toHaveBeenCalled();
    });

    it('carries no colour literal into the page', () => {
      stubMatchMedia(false);
      const { container } = render(<SwarmCreature creature="mutalisk" />);

      expectNoHexColour(container);
    });
  });
});
