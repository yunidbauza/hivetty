import type { KeyboardEvent } from 'react';

/**
 * Arrow, Home and End keys across a `role="tablist"`: the WAI-ARIA tabs pattern
 * with automatic activation (HIVE-225).
 *
 * Stateless, so it works in a component that returns before its tabs exist
 * (`session-panel.tsx`). It focuses the target tab and *clicks* it, so each tab's
 * own `onClick` stays the one place selection happens. Tabs may be nested: the
 * editor wraps each tab beside its × button.
 */
export function onTablistKeyDown(event: KeyboardEvent<HTMLElement>): void {
  const list = event.currentTarget.closest('[role="tablist"]');
  if (list === null) return;
  const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
  const at = tabs.indexOf(event.currentTarget);
  const moves: Record<string, number> = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 };
  const to = moves[event.key];
  if (to === undefined || at === -1) return;
  event.preventDefault();
  const target = tabs[(to + tabs.length) % tabs.length];
  target?.focus();
  target?.click();
}
