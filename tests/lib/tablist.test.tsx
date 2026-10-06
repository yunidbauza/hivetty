import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { onTablistKeyDown } from '@lib/tablist';

function Strip({ onPick }: { onPick: (name: string) => void }) {
  return (
    <div role="tablist">
      {['One', 'Two', 'Three'].map((name) => (
        // Wrapped, as the editor wraps each tab beside its ×.
        <div key={name}>
          <button type="button" role="tab" onKeyDown={onTablistKeyDown} onClick={() => onPick(name)}>
            {name}
          </button>
        </div>
      ))}
    </div>
  );
}

const tab = (name: string) => screen.getByRole('tab', { name });

describe('onTablistKeyDown (HIVE-225)', () => {
  it('moves focus right and left, wrapping, and activates the tab it lands on', () => {
    const onPick = vi.fn();
    render(<Strip onPick={onPick} />);
    tab('Three').focus();
    fireEvent.keyDown(tab('Three'), { key: 'ArrowRight' });
    expect(tab('One')).toHaveFocus();
    expect(onPick).toHaveBeenLastCalledWith('One');
    fireEvent.keyDown(tab('One'), { key: 'ArrowLeft' });
    expect(tab('Three')).toHaveFocus();
    expect(onPick).toHaveBeenLastCalledWith('Three');
  });

  it('goes to the ends on Home and End', () => {
    const onPick = vi.fn();
    render(<Strip onPick={onPick} />);
    fireEvent.keyDown(tab('Two'), { key: 'End' });
    expect(tab('Three')).toHaveFocus();
    fireEvent.keyDown(tab('Three'), { key: 'Home' });
    expect(tab('One')).toHaveFocus();
    expect(onPick).toHaveBeenLastCalledWith('One');
  });

  it('leaves every other key alone', () => {
    const onPick = vi.fn();
    render(<Strip onPick={onPick} />);
    const unhandled = fireEvent.keyDown(tab('Two'), { key: 'a' });
    expect(unhandled).toBe(true); // not default-prevented
    expect(onPick).not.toHaveBeenCalled();
  });
});
