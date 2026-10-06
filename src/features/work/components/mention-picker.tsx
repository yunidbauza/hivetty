import { useEffect, useState } from 'react';

import { searchJiraUsers } from '@/lib/jira';
import { cn } from '@/lib/utils';

import type { JiraUser } from '@shared/jira-contract';

/** How long the picker waits after the last keystroke before asking Jira (HIVE-216). */
export const MENTION_DEBOUNCE_MS = 250;

/** `Dana Kim` → `DK`; a one-word name gives its first two letters, `acr` → `AC`. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length >= 2 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? '').slice(0, 2);
  return letters.toUpperCase();
}

/**
 * The `@query` being typed, or nothing (HIVE-216): an `@` at the start or
 * after whitespace, then two or more non-space characters, ending at the
 * caret. `me@dana.io` is an address, not a mention.
 */
export function activeMention(draft: string, caret: number): { start: number; query: string } | null {
  const match = /(^|\s)@(\S{2,})$/.exec(draft.slice(0, caret));
  if (match === null) return null;
  return { start: match.index + match[1]!.length, query: match[2]! };
}

/**
 * The picker's search (HIVE-216): debounced, and an answer shows only while
 * its query is still the one being typed, so the newest query wins. Local
 * state; nothing reaches a store.
 */
export function useMentionPicker(query: string | null) {
  const [answer, setAnswer] = useState<{ query: string; users: JiraUser[] | null } | null>(null);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (query === null) return undefined;
    const timer = setTimeout(() => {
      void searchJiraUsers({ query }).then((result) => {
        setAnswer({ query, users: result !== null && result.ok ? result.value : null });
        setActive(0);
      });
    }, MENTION_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const current = answer !== null && answer.query === query ? answer : null;
  const users = current?.users ?? [];
  const failed = current !== null && current.users === null;
  const open = current !== null && query !== dismissed && (users.length > 0 || failed);

  return {
    open,
    users,
    failed,
    active: Math.min(active, Math.max(users.length - 1, 0)),
    move: (delta: number) =>
      setActive((at) => (users.length === 0 ? 0 : (at + delta + users.length) % users.length)),
    dismiss: () => setDismissed(query),
    current: (): JiraUser | undefined => users[Math.min(active, users.length - 1)],
  };
}

/** The list under the box (HIVE-216): a listbox the textarea drives with arrows and Enter. */
export function MentionList({
  id,
  users,
  failed,
  active,
  onPick,
}: {
  id: string;
  users: JiraUser[];
  failed: boolean;
  active: number;
  onPick: (user: JiraUser) => void;
}) {
  if (failed) {
    return (
      <p className="absolute left-3 top-full z-10 mt-1 rounded-lg border border-border bg-panel-2 px-2.5 py-2 text-control text-muted">
        Could not search Jira
      </p>
    );
  }
  return (
    <ul
      id={id}
      role="listbox"
      aria-label="Mention someone"
      className="absolute left-3 top-full z-10 mt-1 flex w-64 flex-col gap-0.5 rounded-lg border border-border bg-panel-2 p-1"
    >
      {users.map((user, index) => (
        <li
          key={user.accountId}
          id={`${id}-${user.accountId}`}
          role="option"
          aria-selected={index === active}
          // mousedown, not click: picking must not blur the textarea first.
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(user);
          }}
          className={cn(
            'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-control text-ink',
            index === active && 'bg-chip-hover',
          )}
        >
          {/* type-floor-exempt: one initial inside a 20px avatar dot, aria-hidden; the row names the person */}
          <span aria-hidden className="grid size-5 place-items-center rounded-full bg-chip text-[9px] font-semibold">
            {initials(user.displayName)}
          </span>
          {user.displayName}
        </li>
      ))}
    </ul>
  );
}
