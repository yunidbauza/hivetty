import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RailHandle } from '@components/layout/rail-handle';

/** A 1,000px row the observer reports once, which the setup stub never does. */
function measuredRow() {
  const row = document.createElement('div');
  row.getBoundingClientRect = () => ({ width: 1000, height: 500, left: 0, top: 0 }) as DOMRect;
  const ref = createRef<HTMLElement>();
  (ref as { current: HTMLElement | null }).current = row;
  return ref;
}

/** A 1,000px row holding a `<main>` stage at [left, right]: the rails' drawn widths are the gaps either side, less a 12px grip. */
function rowWithStage(left: number, right: number) {
  const row = document.createElement('div');
  row.getBoundingClientRect = () => ({ width: 1000, height: 500, left: 0, right: 1000, top: 0 }) as DOMRect;
  const stage = document.createElement('main');
  stage.getBoundingClientRect = () => ({ width: right - left, height: 500, left, right, top: 0 }) as DOMRect;
  row.appendChild(stage);
  const ref = createRef<HTMLElement>();
  (ref as { current: HTMLElement | null }).current = row;
  return ref;
}

describe('RailHandle', () => {
  let observed: (() => void) | undefined;

  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          observed = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('turns a list-rail arrow key into pixels of the row', async () => {
    const onWidth = vi.fn();
    render(<RailHandle rowRef={measuredRow()} rail="list" label="Resize" width={300} onWidth={onWidth} />);
    act(() => observed?.());
    const handle = screen.getByRole('slider', { name: 'Resize' });
    expect(handle).toHaveAttribute('aria-valuenow', '31');

    handle.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onWidth.mock.calls[0]?.[0]).toBeCloseTo(320);
  });

  it('runs the session rail the other way, and double-click resets it', async () => {
    const onWidth = vi.fn();
    render(<RailHandle rowRef={measuredRow()} rail="session" label="Resize" width={320} onWidth={onWidth} />);
    const handle = screen.getByRole('slider', { name: 'Resize' });
    expect(handle).toHaveAttribute('aria-valuenow', '67');

    handle.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(onWidth.mock.calls[0]?.[0]).toBeCloseTo(340);

    await userEvent.dblClick(handle);
    expect(onWidth).toHaveBeenLastCalledWith(320);
  });

  it('puts the seam’s centre under the cursor on a drag, on either rail', () => {
    const onList = vi.fn();
    const onSession = vi.fn();
    render(<RailHandle rowRef={measuredRow()} rail="list" label="List" width={300} onWidth={onList} />);
    render(<RailHandle rowRef={measuredRow()} rail="session" label="Session" width={320} onWidth={onSession} />);

    fireEvent.pointerDown(screen.getByRole('slider', { name: 'List' }));
    fireEvent.pointerMove(window, { clientX: 400 });
    fireEvent.pointerUp(window);
    fireEvent.pointerDown(screen.getByRole('slider', { name: 'Session' }));
    fireEvent.pointerMove(window, { clientX: 600 });
    fireEvent.pointerUp(window);

    // The handle is 12px: its centre at 400 leaves 394 of list, at 600 leaves 394 of session.
    expect(onList.mock.calls[0]?.[0]).toBeCloseTo(394);
    expect(onSession.mock.calls[0]?.[0]).toBeCloseTo(394);
  });

  it('reports the drawn width when flexbox has pulled the rail in (HIVE-223)', () => {
    // Saved 400, but the stage starts at 312: the list is drawn 300 wide.
    render(<RailHandle rowRef={rowWithStage(312, 1000)} rail="list" label="Resize" width={400} onWidth={vi.fn()} />);
    act(() => observed?.());
    // (300 + 6) / 1000
    expect(screen.getByRole('slider', { name: 'Resize' })).toHaveAttribute('aria-valuenow', '31');
  });

  it('reports the session rail’s drawn width from the stage’s right edge (HIVE-223)', () => {
    // Saved 480, but the stage ends at 668: the session rail is drawn 320 wide.
    render(<RailHandle rowRef={rowWithStage(0, 668)} rail="session" label="Resize" width={480} onWidth={vi.fn()} />);
    act(() => observed?.());
    // (1000 - 320 - 6) / 1000
    expect(screen.getByRole('slider', { name: 'Resize' })).toHaveAttribute('aria-valuenow', '67');
  });

  it('will not grow a rail past the stage floor (HIVE-223)', async () => {
    const onWidth = vi.fn();
    // Stage 540 wide: 20px of slack above STAGE_MIN, so the list may reach 320.
    render(<RailHandle rowRef={rowWithStage(312, 852)} rail="list" label="Resize" width={300} onWidth={onWidth} />);
    act(() => observed?.());
    const handle = screen.getByRole('slider', { name: 'Resize' });
    expect(handle).toHaveAttribute('aria-valuemax', '33'); // (320 + 6) / 1000
    handle.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(Math.max(...onWidth.mock.calls.map((c) => c[0] as number))).toBeLessThanOrEqual(320.5);
  });
});
