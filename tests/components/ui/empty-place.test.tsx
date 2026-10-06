import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyPlace } from '@components/ui/empty-place';

describe('EmptyPlace (HIVE-211)', () => {
  it('is a labelled section with a heading, body and actions', () => {
    render(
      <EmptyPlace
        label="Work"
        glyph={<span data-testid="g" />}
        title="Jira isn't connected"
        actions={<button type="button">Go</button>}
      >
        Body
      </EmptyPlace>,
    );
    const region = screen.getByRole('region', { name: 'Work' });
    expect(within(region).getByRole('heading', { name: "Jira isn't connected" })).toBeInTheDocument();
    expect(within(region).getByText('Body')).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Go' })).toBeInTheDocument();
    expect(within(region).getByTestId('g')).toBeInTheDocument();
  });

  it('draws no action row without actions', () => {
    render(
      <EmptyPlace label="Agents" glyph={null} title="No agents yet">
        Body
      </EmptyPlace>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
