import type { ReactNode } from 'react';

interface EmptyPlaceProps {
  /** The section's accessible name: the place, "Work" or "Pull requests". */
  label: string;
  glyph: ReactNode;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}

/**
 * A place with nothing to list (HIVE-211): what it shows, and how to get the
 * first one. `EmptyHatchery`'s type scale; the Hatchery keeps its own egg.
 */
export function EmptyPlace({ label, glyph, title, children, actions }: EmptyPlaceProps) {
  return (
    <section
      aria-label={label}
      className="flex flex-1 flex-col items-center justify-center gap-1.5 px-8 text-center"
    >
      <div aria-hidden className="mb-2 text-subtle">
        {glyph}
      </div>
      <h2 className="text-[20px] text-ink">{title}</h2>
      <div className="mb-3 max-w-[460px] text-ui leading-[1.6] text-muted">{children}</div>
      {actions === undefined ? null : <div className="flex justify-center gap-1.5">{actions}</div>}
    </section>
  );
}
