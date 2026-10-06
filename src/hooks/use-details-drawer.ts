import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A properties sidebar folded into a drawer on a narrow page (HIVE-223, HIVE-225):
 * opening focuses the panel; Escape or `close` shuts it and hands focus back to its button.
 */
export function useDetailsDrawer() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    button.current?.focus();
  }, []);
  const toggle = useCallback(() => (open ? close() : setOpen(true)), [open, close]);
  useEffect(() => {
    if (!open) return undefined;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);
  return { open, toggle, close, button, panel };
}
