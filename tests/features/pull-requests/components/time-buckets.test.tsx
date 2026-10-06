import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Bucket } from '@/lib/pr-timeline';
import { dur, TimeBuckets } from '@features/pull-requests/components/time-buckets';

const MIN = 60_000;
const buckets: Bucket[] = [
  { name: 'Self review and fix', ms: 4 * MIN, holder: 'acr' },
  { name: 'CI', ms: 56 * MIN, holder: 'shipper' },
  { name: 'Waiting on you', ms: 50 * MIN, holder: null },
  { name: 'Findings', ms: 80 * MIN, holder: 'fixer' },
];
const SENTENCE = "The longest wait was the fixer on acr's findings. Every mark opens its event in the conversation.";

describe('TimeBuckets', () => {
  it('heads the bar with the age, draws a segment per bucket and the sentence', () => {
    render(<TimeBuckets age={190 * MIN} buckets={buckets} sentence={SENTENCE} />);
    expect(screen.getByRole('heading', { name: /where the 3h 10m went/i })).toBeInTheDocument();
    const segments = screen.getAllByRole('listitem');
    expect(segments).toHaveLength(4);
    const findings = segments.find((s) => s.textContent?.includes('Findings'));
    expect(findings?.textContent).toContain('1h 20m');
    expect(screen.getByText(SENTENCE)).toBeInTheDocument();
  });

  it('prints whole minutes, and hours once there are any', () => {
    expect(dur(9 * MIN)).toBe('9m');
    expect(dur(30_000)).toBe('0m');
    expect(dur(120 * MIN)).toBe('2h 0m');
  });
});
