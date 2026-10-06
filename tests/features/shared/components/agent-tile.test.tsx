import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AgentTile, type TileTone } from '@features/shared/components/agent-tile';

const tile = (tone: TileTone, live = 0) =>
  render(<AgentTile icon="ph-robot" tone={tone} live={live} />).container
    .firstElementChild as HTMLElement;

describe('AgentTile', () => {
  it.each([
    ['asking', 'text-amber-text'],
    ['failed', 'text-red'],
    ['working', 'text-green'],
    ['resting', 'text-subtle'],
    ['invalid', 'text-amber-text'],
  ] as const)('draws %s in %s', (tone, colour) => {
    expect(tile(tone)).toHaveClass(colour);
  });

  it('fills and glows only when asking, and fills a failure', () => {
    expect(tile('asking').className).toMatch(/fill-.*--cc-amber.*22%/);
    expect(tile('asking').className).toMatch(/drop-shadow/);
    expect(tile('failed').className).toMatch(/fill-.*--cc-red.*14%/);
    expect(tile('invalid').className).not.toMatch(/fill-|drop-shadow/);
  });

  it('is a hexagon around the glyph', () => {
    expect(tile('working').querySelector('polygon')).not.toBeNull();
  });

  it('counts live runs only past one', () => {
    expect(tile('working', 1).querySelector('b')).toBeNull();
    expect(tile('working', 2).querySelector('b')).toHaveTextContent('2');
  });

  it('is decoration, hidden from assistive tech', () => {
    expect(tile('resting')).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws a small tile, without the glow, for a card header (HIVE-198)', () => {
    const { container } = render(<AgentTile icon="ph-robot" tone="asking" live={0} size="sm" />);
    const small = container.firstElementChild as HTMLElement;
    expect(small.className).toContain('w-6');
    expect(small.className).not.toContain('drop-shadow');
    expect(small.className).toMatch(/fill-.*--cc-amber.*22%/);
  });
});
