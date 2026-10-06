import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GLOBE_STILL_T } from '@/splash/globe';
import { paletteFrom, startGlobe, type GlobeStage } from '@/splash/stage';
import type { SwarmPalette } from '@lib/swarm/palette';
import { BUILT_IN_THEME } from '@lib/theme/built-in';
import { clearColour, mixColour, swarmPaletteOf } from '@lib/theme/colour';
import { recordingContext } from '@tests/support/canvas-2d';

const drawGlobe = vi.hoisted(() => vi.fn());
vi.mock('@/splash/globe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/splash/globe')>()),
  drawGlobe,
}));

const TOKENS: Record<string, string> = {
  '--cc-bg': ' #10152a',
  '--cc-panel-2': ' #121731',
  '--cc-ink': ' #e9effc',
  '--cc-muted': ' #98a3cc',
  '--cc-subtle': ' #6b779f',
  '--cc-brand': ' #8fa7f2',
  '--cc-green': ' #74b79c',
  '--cc-amber': ' #ffac47',
  '--cc-red': ' #ff8d85',
  '--cc-creep': ' #5b3d8f',
  '--cc-chitin': ' #b9a7f0',
  '--cc-tissue-deep': ' #0b0816',
  '--cc-tissue': ' #2c2346',
  '--cc-tissue-lit': ' #8474c0',
  '--cc-glow-core': ' #e2ffee',
  '--cc-ground': ' #141128',
  '--cc-on-brand': ' #ffffff',
};

describe('paletteFrom', () => {
  it('reads every token, trimmed, and derives the carapace and the creep stop as Home does', () => {
    const palette = paletteFrom((token) => TOKENS[token] ?? '');
    expect(palette.bg).toBe('#10152a');
    expect(palette.panel2).toBe('#121731');
    expect(palette.chitin).toBe('#b9a7f0');
    expect(palette.carapace).toBe(mixColour('#10152a', '#b9a7f0', 0.18));
    expect(palette.creepClear).toBe(clearColour('#5b3d8f'));
    expect(palette.tissueDeep).toBe('#0b0816');
    expect(palette.ground).toBe('#141128');
    expect(palette).not.toHaveProperty('onBrand');
    expect(palette.glint).toBe(swarmPaletteOf(BUILT_IN_THEME.modes.dark.ui).glint);
  });
});

describe('startGlobe', () => {
  const PALETTE = { amber: 'c-amber' } as SwarmPalette;
  const STAGE: GlobeStage = { width: 960, height: 600, cx: 660, cy: 276, scale: 1 };
  let rec: ReturnType<typeof recordingContext>;
  let reduced = false;
  const raf = vi.fn((_cb: FrameRequestCallback) => 1);
  const frame = (now: number) => raf.mock.calls.at(-1)![0](now);
  /**
   * The last frame's clock and palette, after checking it drew on the canvas's
   * own context: by identity, since the recording context is a Proxy that
   * deep equality cannot compare.
   */
  const lastDrawn = () => {
    const [ctx, t, palette] = drawGlobe.mock.lastCall!;
    expect(ctx).toBe(rec.ctx);
    return [t, palette];
  };

  beforeEach(() => {
    reduced = false;
    rec = recordingContext();
    raf.mockClear();
    drawGlobe.mockClear();
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced, media: query }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => rec.ctx as never);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sizes the canvas to the stage at a device pixel ratio capped at 2', () => {
    const canvas = document.createElement('canvas');
    startGlobe(canvas, PALETTE, STAGE);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    expect([canvas.width, canvas.height]).toEqual([960 * dpr, 600 * dpr]);
  });

  it('under reduced motion draws one frame at the still and schedules none', () => {
    reduced = true;
    startGlobe(document.createElement('canvas'), PALETTE, STAGE);
    expect(drawGlobe).toHaveBeenCalledTimes(1);
    expect(lastDrawn()).toEqual([GLOBE_STILL_T, PALETTE]);
    expect(raf).not.toHaveBeenCalled();
  });

  it('otherwise draws every frame on the document clock, centred and scaled', () => {
    startGlobe(document.createElement('canvas'), PALETTE, { ...STAGE, scale: 0.6 });
    expect(raf).toHaveBeenCalledTimes(1);
    frame(1500);
    expect(lastDrawn()).toEqual([1.5, PALETTE]);
    expect(rec.calls.find((c) => c.op === 'translate')?.args).toEqual([660, 276]);
    expect(rec.calls.find((c) => c.op === 'scale')?.args).toEqual([0.6, 0.6]);
    expect(raf).toHaveBeenCalledTimes(2);
  });

  it('starts a clock of its own at `from`, for a window that opens late', () => {
    startGlobe(document.createElement('canvas'), PALETTE, { ...STAGE, from: GLOBE_STILL_T });
    frame(9000);
    expect(lastDrawn()).toEqual([GLOBE_STILL_T, PALETTE]);
    frame(9500);
    expect(lastDrawn()).toEqual([GLOBE_STILL_T + 0.5, PALETTE]);
  });

  it('does nothing without a 2D context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    startGlobe(document.createElement('canvas'), PALETTE, STAGE);
    expect(drawGlobe).not.toHaveBeenCalled();
    expect(raf).not.toHaveBeenCalled();
  });
});
