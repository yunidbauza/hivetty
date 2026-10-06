import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '@components/ui/button';

describe('Button', () => {
  it('keeps the primary fill under the pointer while it cannot be pressed', () => {
    render(<Button variant="primary" disabled>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass(
      'disabled:hover:bg-brand-fill',
      'aria-disabled:hover:bg-brand-fill',
    );
  });

  it('defaults to a medium secondary button of type button', () => {
    render(<Button>Cancel</Button>);
    const el = screen.getByRole('button', { name: 'Cancel' });
    expect(el).toHaveAttribute('type', 'button');
    // A pill with an edge, not a hairline (the buttons' look, approved 6 Oct 2026).
    expect(el).toHaveClass('rounded-full', 'border-edge', 'font-semibold');
  });

  it('draws the primary variant with the brand fill', () => {
    render(<Button variant="primary">Send</Button>);
    expect(screen.getByRole('button', { name: 'Send' }).className).toContain(
      'bg-brand-fill',
    );
  });

  it('draws the danger variant with the red token', () => {
    render(<Button variant="danger">Deny</Button>);
    expect(screen.getByRole('button', { name: 'Deny' }).className).toContain(
      'text-red',
    );
  });

  it('draws the ghost variant with no border', () => {
    render(<Button variant="ghost">Clear</Button>);
    expect(screen.getByRole('button', { name: 'Clear' }).className).toContain(
      'border-transparent',
    );
  });

  it('keeps the small size distinct from the medium one', () => {
    const { rerender } = render(<Button size="sm">a</Button>);
    const small = screen.getByRole('button').className;
    rerender(<Button size="md">a</Button>);
    expect(screen.getByRole('button').className).not.toBe(small);
  });

  it('sets both sizes at text-control: a button is a control, not a micro label (HIVE-225)', () => {
    const { rerender } = render(<Button size="sm">a</Button>);
    expect(screen.getByRole('button')).toHaveClass('text-control');
    rerender(<Button size="md">a</Button>);
    expect(screen.getByRole('button')).toHaveClass('text-control');
  });

  it('forwards disabled and merges a caller class', () => {
    render(
      <Button disabled className="w-full">
        Send
      </Button>,
    );
    const el = screen.getByRole('button');
    expect(el).toBeDisabled();
    expect(el.className).toContain('w-full');
  });

  it('lets the caller override type for a submit button', () => {
    render(<Button type="submit">Go</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('stays focusable and inert while pending, and says so (HIVE-225)', () => {
    const onClick = vi.fn();
    render(<Button pending onClick={onClick}>Test</Button>);
    const el = screen.getByRole('button', { name: 'Test' });
    expect(el).not.toBeDisabled();
    expect(el).toHaveAttribute('aria-disabled', 'true');
    expect(el).toHaveAttribute('aria-busy', 'true');
    el.focus();
    fireEvent.click(el);
    expect(onClick).not.toHaveBeenCalled();
    expect(el).toHaveFocus();
  });

  it('carries no pending state when idle', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    const el = screen.getByRole('button', { name: 'Go' });
    expect(el).not.toHaveAttribute('aria-disabled');
    expect(el).not.toHaveAttribute('aria-busy');
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
