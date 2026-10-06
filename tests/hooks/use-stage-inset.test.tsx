import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useStageInset } from '@hooks/use-stage-inset';

function Probe({ withInput, viewKey }: { withInput: boolean; viewKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inset = useStageInset(ref, viewKey);
  return (
    <div ref={ref} data-testid="stage">
      {withInput ? <div data-stage-input="" data-testid="input" /> : null}
      <output>{inset}</output>
    </div>
  );
}

const rect = (top: number, bottom: number) =>
  ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

/** The DOM here has no layout, so no `offsetParent`: define one for the case. */
const offsetParent = (value: Element | null) =>
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get: () => value });

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, 'offsetParent');
});

describe('useStageInset (HIVE-198)', () => {
  it('sits 24px above the stage foot with no input', () => {
    render(<Probe withInput={false} viewKey="home" />);
    expect(screen.getByRole('status')).toHaveTextContent('24');
  });

  it('sits 14px above a marked input', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.dataset['testid'] === 'input' ? rect(700, 800) : rect(0, 800);
    });
    offsetParent(document.body);
    render(<Probe withInput viewKey="orch" />);
    expect(screen.getByRole('status')).toHaveTextContent('114');
  });

  it('ignores a mark on a hidden page', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.dataset['testid'] === 'input' ? rect(700, 800) : rect(0, 800);
    });
    offsetParent(null);
    render(<Probe withInput viewKey="orch" />);
    expect(screen.getByRole('status')).toHaveTextContent('24');
  });
});
