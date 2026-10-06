import { afterEach, describe, expect, it, vi } from 'vitest';

import { PIECES } from '@features/whats-new/pieces';
import { BUILT_IN_THEME } from '@lib/theme/built-in';
import { swarmPaletteOf } from '@lib/theme/colour';
import { coloursUsed, recordingContext } from '@tests/support/canvas-2d';

/** The corner pieces: plumbing only (what is drawn, in which colours); pixels are Playwright's. */
const C = swarmPaletteOf(BUILT_IN_THEME.modes.dark.ui);

class FakePath2D {
  readonly d: string;
  constructor(d: string) {
    this.d = d;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const drawAt = (kind: keyof typeof PIECES, t: number) => {
  const { ctx, calls } = recordingContext();
  PIECES[kind].draw(ctx, 200, 150, t, C);
  return calls;
};

describe('PIECES', () => {
  it.each(Object.entries(PIECES))('%s rests inside its loop and draws at every moment of it', (kind, piece) => {
    expect(piece.rest).toBeGreaterThan(0);
    expect(piece.rest).toBeLessThan(piece.dur);
    for (let t = 0; t < piece.dur; t += 0.25) {
      expect(drawAt(kind as keyof typeof PIECES, t).some((c) => c.op === 'stroke')).toBe(true);
    }
  });

  it('fills the comb with a terminal for each session and an agent’s own icon for each agent', () => {
    vi.stubGlobal('Path2D', FakePath2D);
    const icons = drawAt('comb', 4)
      .filter((c) => c.op === 'fill' && c.args[0] instanceof FakePath2D)
      .map((c) => (c.args[0] as FakePath2D).d);
    expect(icons).toHaveLength(10);
    expect(new Set(icons).size).toBe(6);
  });

  it('lights the cell that needs you in amber, then answers it in green', () => {
    expect(coloursUsed(drawAt('comb', 3.6))).toContain(C.amber);
    expect(coloursUsed(drawAt('comb', 4.55)).some((c) => String(c).includes(C.green))).toBe(true);
  });

  it('draws no icons where the runtime has no Path2D', () => {
    vi.stubGlobal('Path2D', undefined);
    expect(drawAt('comb', 4).some((c) => c.op === 'translate')).toBe(false);
  });

  it('marks a failed check red and the merge brand blue', () => {
    expect(coloursUsed(drawAt('pr', 3.6)).some((c) => String(c).includes(C.red))).toBe(true);
    expect(coloursUsed(drawAt('pr', 5.4)).some((c) => String(c).includes(C.brand))).toBe(true);
  });

  it('works the ticket and lands it Done with a check', () => {
    expect(drawAt('ticket', 3).some((c) => c.op === 'arc')).toBe(true);
    expect(coloursUsed(drawAt('ticket', 5.6)).some((c) => String(c).includes(C.green))).toBe(true);
  });
});
