import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { PrCounts } from '@features/home/components/pr-counts';
import { useHiveStore } from '@stores/hive-store';
import { prRecord } from '@tests/support/prs';

describe('PrCounts', () => {
  beforeEach(() => useHiveStore.getState().reset());

  it('counts each flap in its tone, with SUMMONS grey at zero', () => {
    useHiveStore.setState({
      prSource: { kind: 'live', stale: false, repos: 1 },
      prs: [
        prRecord({ number: 3, findings: 0, state: 'draft', branch: 'b3' }),
        prRecord({ number: 7, state: 'merged', mergedAt: '2026-10-03T10:00:00Z', branch: 'b7' }),
      ],
    });
    render(<PrCounts />);
    expect(screen.getByText('PULL REQUESTS', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('LARVA').parentElement).toHaveTextContent('1LARVA');
    expect(screen.getByText('HATCHED').parentElement).toHaveClass('text-brand');
    expect(screen.getByText('SUMMONS').parentElement).toHaveClass('text-subtle');
  });

  it('is not drawn with no PRs or no live source', () => {
    const { container } = render(<PrCounts />);
    expect(container).toBeEmptyDOMElement();
  });
});
