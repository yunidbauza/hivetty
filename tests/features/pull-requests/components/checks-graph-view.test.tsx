import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChecksGraph, GraphNode } from '@/lib/checks-graph';
import { ChecksGraphView } from '@features/pull-requests/components/checks-graph-view';

const reduced = vi.hoisted(() => ({ value: false }));
vi.mock('@/hooks/use-reduced-motion', () => ({ useReducedMotion: () => reduced.value }));

const node = (key: string, state: GraphNode['state'], over: Partial<GraphNode> = {}): GraphNode => ({
  key, label: key, x: 0, y: 0, state, time: state === 'waiting' ? 'waits' : '38s', progress: null, jobId: 1, count: 1, matrix: null, ...over,
});
const graph: ChecksGraph = {
  nodes: [
    node('install', 'passed', { jobId: 11 }),
    node('integration', 'failed', { jobId: 12, time: 'failed · 3m 10s' }),
    node('e2e', 'running', { jobId: 13, progress: 0.5, time: 'running · 2m 14s' }),
    node('build', 'waiting', { jobId: null }),
    node('unit', 'passed', { jobId: null, count: 6, matrix: 'unit' }),
  ],
  edges: [
    { key: 'a>b', d: 'M0 0', state: 'ok' }, { key: 'a>c', d: 'M0 0', state: 'bad' },
    { key: 'a>d', d: 'M0 0', state: 'wait' }, { key: 'a>e', d: 'M0 0', state: 'flow' },
  ],
  groups: [{ file: 'preview.yml', x: 792, y: 118, w: 176, h: 64 }],
  files: ['ci.yml', 'preview.yml'], width: 960, height: 300,
};

beforeEach(() => { reduced.value = false; });
afterEach(() => vi.restoreAllMocks());

const zoomed = (container: HTMLElement) => container.querySelector<HTMLElement>('.origin-top-left')!;

describe('ChecksGraphView', () => {
  it('draws every node state with its name and time', () => {
    render(<ChecksGraphView graph={graph} onJob={() => {}} onExpand={() => {}} />);
    expect(screen.getByRole('button', { name: 'integration, failed, failed · 3m 10s' })).toHaveAttribute('data-state', 'failed');
    expect(screen.getByRole('button', { name: /e2e, running/ })).toHaveAttribute('data-state', 'running');
    expect(screen.getByRole('button', { name: /build, waiting/ })).toHaveAttribute('data-state', 'waiting');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  });

  it('dims a waiting job by its icon and text token, never the label’s opacity (HIVE-225)', () => {
    render(<ChecksGraphView graph={graph} onJob={() => {}} onExpand={() => {}} />);
    const job = screen.getByRole('button', { name: /build, waiting/ });
    expect(job.className).not.toMatch(/opacity-/);
    expect(job.querySelector('b')).toHaveClass('text-muted');
  });

  it('draws each edge in its state, and the group box with its file', () => {
    const { container } = render(<ChecksGraphView graph={graph} onJob={() => {}} onExpand={() => {}} />);
    expect([...container.querySelectorAll('path[data-state]')].map((p) => p.getAttribute('data-state'))).toEqual(['ok', 'bad', 'wait', 'flow']);
    expect(container.querySelector('path[data-state="flow"]')?.getAttribute('class')).toContain('animate-ccflow');
    expect(screen.getByText('preview.yml')).toBeInTheDocument();
  });

  it('holds the edges still under reduced motion', () => {
    reduced.value = true;
    const { container } = render(<ChecksGraphView graph={graph} onJob={() => {}} onExpand={() => {}} />);
    expect(container.querySelector('path[data-state="flow"]')?.getAttribute('class')).not.toContain('animate-ccflow');
  });

  it('shows a job’s whole name on hover, since a long one is cut off in its box', () => {
    render(<ChecksGraphView graph={graph} onJob={() => {}} onExpand={() => {}} />);
    expect(screen.getByRole('button', { name: /integration/ })).toHaveAttribute('title', 'integration');
    expect(screen.getByRole('button', { name: /unit × 6/ })).toHaveAttribute('title', 'unit × 6');
  });

  it('shows a job on click, and opens a matrix box into its legs', () => {
    const onJob = vi.fn();
    const onExpand = vi.fn();
    render(<ChecksGraphView graph={graph} onJob={onJob} onExpand={onExpand} />);
    fireEvent.click(screen.getByRole('button', { name: /integration/ }));
    fireEvent.click(screen.getByRole('button', { name: /unit × 6/ }));
    fireEvent.click(screen.getByRole('button', { name: /build/ }));
    expect(onJob).toHaveBeenCalledWith(12);
    expect(onJob).toHaveBeenCalledTimes(1);
    expect(onExpand).toHaveBeenCalledWith('unit');
  });

  it('opens at 100%, steps in and out by a quarter within 25–200%, and the percentage resets', () => {
    const { container } = render(<ChecksGraphView graph={graph} onJob={() => {}} onExpand={() => {}} />);
    const reset = screen.getByRole('button', { name: 'Reset zoom' });
    expect(reset).toHaveTextContent('100%');
    expect(zoomed(container).style.transform).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(reset).toHaveTextContent('75%');
    expect(zoomed(container).style.transform).toBe('scale(0.75)');
    // The sizer shrinks with it, so the scroller scrolls only what is drawn.
    expect(zoomed(container).parentElement!.style.width).toBe('720px');
    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(reset).toHaveTextContent('25%');
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
    fireEvent.click(reset);
    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(reset).toHaveTextContent('200%');
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
  });

  it('fits a wide graph to the width it has, and never blows a narrow one up', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(480);
    const { container, rerender } = render(<ChecksGraphView graph={graph} onJob={() => {}} onExpand={() => {}} />);
    const fit = screen.getByRole('button', { name: 'Fit to width' });
    fireEvent.click(fit);
    expect(fit).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('50%');
    expect(zoomed(container).style.transform).toBe('scale(0.5)');
    rerender(<ChecksGraphView graph={{ ...graph, width: 300 }} onJob={() => {}} onExpand={() => {}} />);
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('100%');
  });

  it('zooms on a pinch or a ⌘/Ctrl wheel, holding the point under the pointer, and leaves a plain wheel to scroll', () => {
    const { container } = render(<ChecksGraphView graph={graph} onJob={() => {}} onExpand={() => {}} />);
    const scroller = zoomed(container).parentElement!.parentElement!;
    const reset = screen.getByRole('button', { name: 'Reset zoom' });
    const wheel = ({ ctrlKey = false, metaKey = false, ...init }: WheelEventInit) => {
      const event = createEvent.wheel(scroller, init);
      // happy-dom's WheelEvent drops the MouseEvent fields from its init.
      Object.defineProperties(event, { ctrlKey: { value: ctrlKey }, metaKey: { value: metaKey }, clientX: { value: 100 } });
      fireEvent(scroller, event);
      return event;
    };

    expect(wheel({ deltaY: -10 }).defaultPrevented).toBe(false);
    expect(reset).toHaveTextContent('100%');

    // A pinch out: ctrlKey, negative delta. e^0.1 ≈ 1.105.
    scroller.scrollLeft = 200;
    expect(wheel({ deltaY: -10, ctrlKey: true }).defaultPrevented).toBe(true);
    expect(reset).toHaveTextContent('111%');
    // Graph x 300 was under the pointer at 100px; it still is.
    expect(scroller.scrollLeft).toBeCloseTo(300 * Math.exp(0.1) - 100, 0);

    // A mouse notch is held to the same ±10px, so ⌘ and a 100px delta zoom out one step, not off the scale.
    wheel({ deltaY: 100, metaKey: true });
    expect(reset).toHaveTextContent('100%');
    for (let i = 0; i < 30; i += 1) wheel({ deltaY: 100, ctrlKey: true });
    expect(reset).toHaveTextContent('25%');
  });

  it('does not leave a pinch at the zoom limit to jump the scroll on the next button click', () => {
    const { container } = render(<ChecksGraphView graph={graph} onJob={() => {}} onExpand={() => {}} />);
    const scroller = zoomed(container).parentElement!.parentElement!;
    const wheel = (deltaY: number) => {
      const event = createEvent.wheel(scroller, { deltaY });
      Object.defineProperties(event, { ctrlKey: { value: true }, metaKey: { value: false }, clientX: { value: 100 } });
      fireEvent(scroller, event);
    };
    for (let i = 0; i < 30; i += 1) wheel(100);
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('25%');

    // Pinching further in at 25% changes nothing, so it must not arm an anchor either.
    scroller.scrollLeft = 40;
    wheel(100);
    scroller.scrollLeft = 7;
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('50%');
    expect(scroller.scrollLeft).toBe(7);
  });

  it('does not zoom in on a zoom-out pinch when Fit is already below the 25% floor', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(160);
    const { container } = render(<ChecksGraphView graph={graph} onJob={() => {}} onExpand={() => {}} />);
    const scroller = zoomed(container).parentElement!.parentElement!;
    fireEvent.click(screen.getByRole('button', { name: 'Fit to width' }));
    const reset = screen.getByRole('button', { name: 'Reset zoom' });
    expect(reset).toHaveTextContent('17%');
    const wheel = (deltaY: number) => {
      const event = createEvent.wheel(scroller, { deltaY });
      Object.defineProperties(event, { ctrlKey: { value: true }, metaKey: { value: false }, clientX: { value: 100 } });
      fireEvent(scroller, event);
    };
    wheel(100);
    expect(reset).toHaveTextContent('17%');
    wheel(-100);
    expect(Number.parseInt(reset.textContent ?? '', 10)).toBeGreaterThan(17);
  });
});
