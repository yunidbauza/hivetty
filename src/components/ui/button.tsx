import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * A call this button started is in flight (HIVE-225). Not `disabled`: a
   * focused button that becomes disabled drops focus to `<body>`, and the
   * keyboard user loses their place. It stays focusable, says it is busy, and
   * ignores clicks.
   */
  pending?: boolean;
}

/**
 * The button this app has been writing by hand (HIVE-118).
 *
 * Not a new look: `primary` is the class string that already appears verbatim
 * in eleven settings panes, lifted unchanged so that adopting it there is a
 * no-op diff rather than a restyle. What the atom adds is one owner for the
 * three states every hand-rolled copy had to reinvent — focus ring, disabled,
 * and the danger tone.
 *
 * `type="button"` by default, and overridable. A bare `<button>` inside a
 * `<form>` submits it, which is never what a card's option row means.
 */
// `primary`'s border is transparent, not absent: the idiom it was lifted from
// has none, but this atom sits primary beside bordered secondary/danger
// buttons in one row, and a borderless primary would sit 2px shorter than its
// neighbours.
const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-fill text-on-brand hover:bg-brand-fill-hover disabled:hover:bg-brand-fill aria-disabled:hover:bg-brand-fill border border-transparent',
  secondary:
    'border border-edge text-ink hover:bg-hover',
  danger:
    'border border-red-edge text-red hover:bg-hover',
  ghost: 'border border-transparent text-muted hover:bg-hover hover:text-ink',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'rounded-full px-3 py-1 text-control font-semibold',
  md: 'rounded-full px-4 py-1.5 text-control font-semibold',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  pending = false,
  className,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      onClick={pending ? (event) => event.preventDefault() : onClick}
      className={cn(
        'shrink-0 leading-none disabled:opacity-60 aria-disabled:cursor-default aria-disabled:opacity-60',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    />
  );
}
