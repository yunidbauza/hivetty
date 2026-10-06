import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Markdown } from '@features/shared/components/markdown';

describe('Markdown', () => {
  it('renders paragraphs, emphasis, code and safe links', () => {
    const { container } = render(<Markdown source={'A **bold** `x < y` & [docs](https://example.com/a)'} />);
    expect(container.querySelector('strong')).toHaveTextContent('bold');
    expect(container.querySelector('code')).toHaveTextContent('x < y');
    expect(container).toHaveTextContent('& docs');
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('href', 'https://example.com/a');
  });

  it('renders raw HTML as text and injects no element', () => {
    const { container } = render(<Markdown source={'<script>alert(1)</script>\n\nhi <b>there</b> <img src=x onerror=alert(1)>'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('<script>alert(1)</script>');
    expect(container).toHaveTextContent('<b>there</b>');
  });

  it('drops a javascript: link to its text', () => {
    const { container } = render(<Markdown source={'[click](javascript:alert(1))'} />);
    expect(container.querySelector('a')).toBeNull();
    expect(container).toHaveTextContent('click');
  });

  it("draws a task list as the test plan, with GitHub's ticks", () => {
    render(<Markdown source={'- [x] Corporations pass\n- [ ] LLCs are checked'} />);
    expect(screen.getByRole('img', { name: 'done' }).closest('li')).toHaveTextContent('Corporations pass');
    expect(screen.getByRole('img', { name: 'to do' }).closest('li')).toHaveTextContent('LLCs are checked');
  });

  it('renders lists, headings, quotes and fenced code', () => {
    const { container } = render(<Markdown source={'## Why\n\n> quoted\n\n1. one\n2. two\n\n```ts\nconst a = 1;\n```'} />);
    expect(container).toHaveTextContent('Why');
    expect(container.querySelector('blockquote')).toHaveTextContent('quoted');
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    expect(container.querySelector('pre')).toHaveTextContent('const a = 1;');
  });

  it('draws a GFM table with inline marks in its cells, and keeps HTML in a cell as text', () => {
    render(<Markdown source={'| ≤ | Step |\n|---:|---|\n| **748** | `5h` <b>x</b> |'} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '≤' })).toHaveClass('text-right');
    const cells = screen.getAllByRole('cell');
    expect(cells[0]?.querySelector('strong')).toHaveTextContent('748');
    expect(cells[1]?.querySelector('code')).toHaveTextContent('5h');
    expect(cells[1]?.querySelector('b')).toBeNull();
  });
});
