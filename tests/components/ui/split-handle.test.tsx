import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SplitHandle } from '@components/ui/split-handle';

/**
 * The draggable seam.
 *
 * The container's geometry is stubbed rather than laid out — happy-dom performs
 * no layout, so every `getBoundingClientRect` is zero and a drag would divide by
 * it. What is under test is the arithmetic and the listener lifecycle, both of
 * which are independent of real measurement.
 */

interface Options {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  onReset?: () => void;
  grip?: boolean;
  rect?: { left: number; top: number; width: number; height: number };
}

function renderHandle(
  axis: 'horizontal' | 'vertical',
  onValue = vi.fn(),
  {
    value = 0.5,
    min,
    max,
    step,
    onReset,
    grip,
    rect = { left: 100, top: 50, width: 400, height: 200 },
  }: Options = {},
) {
  const containerRef = createRef<HTMLElement>();
  const container = document.createElement('div');
  container.getBoundingClientRect = () =>
    ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }) as DOMRect;
  (containerRef as { current: HTMLElement | null }).current = container;

  render(
    <SplitHandle
      axis={axis}
      containerRef={containerRef}
      label="Resize the editor"
      value={value}
      onValue={onValue}
      min={min}
      max={max}
      step={step}
      onReset={onReset}
      grip={grip}
    />,
  );

  return { onValue, handle: screen.getByRole('slider') };
}

describe('SplitHandle', () => {
  /**
   * `aria-orientation` on a slider names the direction the **value moves**, not
   * the direction the divider is drawn. A vertical divider is dragged left and
   * right, so it announces `horizontal` — the opposite of the prop name, and
   * the same direction as the arrow keys that actually work.
   */
  it('announces the axis its value moves along, not the line it draws', () => {
    const { handle } = renderHandle('vertical');

    expect(handle).toHaveAttribute('aria-orientation', 'horizontal');
    expect(handle).toHaveAttribute('aria-valuenow', '50');
    expect(handle).toHaveAttribute('aria-valuemin', '0');
    expect(handle).toHaveAttribute('aria-valuemax', '100');
  });

  it('announces the other way round for a stacked split', () => {
    const { handle } = renderHandle('horizontal');
    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('labels itself with what it resizes', () => {
    const { handle } = renderHandle('vertical');
    expect(handle).toHaveAccessibleName('Resize the editor');
  });

  it('reports the ratio along X for a vertical divider', () => {
    const { handle, onValue } = renderHandle('vertical');

    fireEvent.pointerDown(handle);
    fireEvent.pointerMove(window, { clientX: 300, clientY: 0 });

    // (300 - 100) / 400
    expect(onValue).toHaveBeenCalledWith(0.5);
  });

  it('reports the ratio along Y for a horizontal divider', () => {
    const { handle, onValue } = renderHandle('horizontal');

    fireEvent.pointerDown(handle);
    fireEvent.pointerMove(window, { clientX: 0, clientY: 100 });

    // (100 - 50) / 200
    expect(onValue).toHaveBeenCalledWith(0.25);
  });

  /**
   * The gesture ends with the pointer, not with the element. A move after
   * `pointerup` that still resized would mean the window kept following the
   * cursor after the user let go.
   */
  it('stops tracking on pointerup', () => {
    const { handle, onValue } = renderHandle('vertical');

    fireEvent.pointerDown(handle);
    fireEvent.pointerUp(window);
    onValue.mockClear();
    fireEvent.pointerMove(window, { clientX: 300 });

    expect(onValue).not.toHaveBeenCalled();
  });

  /**
   * The OS takes the pointer away on a three-finger swipe or a window drag.
   * Without this the move listener survives the gesture and keeps resizing on
   * the next unrelated mouse movement.
   */
  it('stops tracking on pointercancel', () => {
    const { handle, onValue } = renderHandle('vertical');

    fireEvent.pointerDown(handle);
    fireEvent.pointerCancel(window);
    onValue.mockClear();
    fireEvent.pointerMove(window, { clientX: 300 });

    expect(onValue).not.toHaveBeenCalled();
  });

  it('does nothing when the container has no size', () => {
    const { handle, onValue } = renderHandle('vertical', vi.fn(), {
      rect: { left: 0, top: 0, width: 0, height: 0 },
    });

    fireEvent.pointerDown(handle);
    fireEvent.pointerMove(window, { clientX: 300 });

    expect(onValue).not.toHaveBeenCalled();
  });

  /**
   * A split a mouse can move and a keyboard cannot is a setting only some users
   * have.
   */
  it('moves with the arrow keys along its own axis', async () => {
    const onValue = vi.fn();
    const { handle } = renderHandle('vertical', onValue);

    handle.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onValue).toHaveBeenLastCalledWith(0.52);

    await userEvent.keyboard('{ArrowLeft}');
    expect(onValue).toHaveBeenLastCalledWith(0.48);
  });

  it('uses up and down for a horizontal divider', async () => {
    const onValue = vi.fn();
    const { handle } = renderHandle('horizontal', onValue);

    handle.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(onValue).toHaveBeenLastCalledWith(0.52);

    await userEvent.keyboard('{ArrowUp}');
    expect(onValue).toHaveBeenLastCalledWith(0.48);
  });

  it('ignores the perpendicular arrows', async () => {
    const onValue = vi.fn();
    const { handle } = renderHandle('vertical', onValue);

    handle.focus();
    await userEvent.keyboard('{ArrowUp}{ArrowDown}');

    expect(onValue).not.toHaveBeenCalled();
  });

  it('announces its value as a percentage (HIVE-213)', () => {
    const ref = { current: document.createElement('div') };
    render(<SplitHandle axis="vertical" containerRef={ref} label="Editor split" value={0.4} onValue={() => {}} />);
    expect(screen.getByRole('slider', { name: 'Editor split' })).toHaveAttribute('aria-valuenow', '40');
  });

  describe('reset', () => {
    it('calls back on a double-click when it has a default to return to', async () => {
      const onReset = vi.fn();
      const { handle } = renderHandle('vertical', vi.fn(), { onReset });

      await userEvent.dblClick(handle);

      expect(onReset).toHaveBeenCalledOnce();
    });

    /** The editor's divider passes none, and must not break on the gesture. */
    it('survives a double-click with no handler', async () => {
      const { handle } = renderHandle('vertical');

      await userEvent.dblClick(handle);

      expect(handle).toBeInTheDocument();
    });
  });

  /*
    The gutter appearance the agent run log needs (HIVE polish). Both sides of
    that seam are the same black, so a hairline in `border-border-soft` is exactly what
    separates one receipt row from the next — the divider read as one more row.
    A caller sizes the band itself and gets a grip in it instead of a rule.
  */
  describe('grip', () => {
    it('drops the hairline fill and draws three dots instead', () => {
      const { handle } = renderHandle('horizontal', vi.fn(), { grip: true });

      expect(handle).not.toHaveClass('bg-border-soft');
      expect(handle.querySelectorAll('.rounded-full')).toHaveLength(3);
    });

    it('moves the hover answer off the band and onto the dots', () => {
      // A 12px band flooding brand-blue is a much louder answer to a pointer
      // than a hairline doing it — and it would paint over the dots.
      const { handle } = renderHandle('horizontal', vi.fn(), { grip: true });

      expect(handle).not.toHaveClass('focus-visible:bg-brand');
      expect(handle.querySelector('.rounded-full')).toHaveClass(
        'group-hover:bg-muted',
        'group-focus-visible:bg-brand',
      );
    });

    it('leaves the hairline and its enlarged hit area alone by default', () => {
      const { handle } = renderHandle('horizontal');

      expect(handle).toHaveClass('bg-border-soft', 'focus-visible:bg-brand');
      expect(handle.querySelectorAll('.rounded-full')).toHaveLength(0);
      expect(handle.firstElementChild).toHaveClass('group-hover:bg-brand');
    });

    it('still drags, because the grip is decoration on the same control', () => {
      const { onValue, handle } = renderHandle('horizontal', vi.fn(), {
        grip: true,
      });

      fireEvent.pointerDown(handle);
      fireEvent.pointerMove(window, { clientX: 0, clientY: 150 });

      expect(onValue).toHaveBeenCalledWith(0.5);
    });
  });
});
