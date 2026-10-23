import { MagnifyingGlass } from '@phosphor-icons/react';
import {
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/utils';

import { filterRepos, REPO_LIMIT, type RepoMatch } from '@features/settings/filter-repos';
import { useUserRepos } from '@features/settings/hooks/use-user-repos';
import { looksLikeUrl } from '@features/settings/looks-like-url';
import { useLastUsed } from '@hooks/use-relative-time';
import type { UserRepo } from '@shared/github-contract';

/**
 * The clone view's URL field, with the user's own repositories under it
 * (spec 2026-10-22).
 *
 * The value stays a plain string the parent owns, and picking a repository
 * only writes its https URL into it, so Clone sends exactly what it sent
 * before this existed and `parse-url.ts` in main stays the only validator.
 *
 * The list shows at most ten rows, so the settings pane has a fixed ceiling
 * however many repositories the account has. A value that already looks like a
 * URL closes it, and an unavailable list (the browser demo, an IPC hiccup)
 * renders nothing: the field never depends on the picker.
 */

const TAG = 'shrink-0 rounded-full bg-chip px-1.5 text-micro text-muted';

/** Mouse-down would blur the field and unmount the list before the click lands. */
const keepFocus = (event: MouseEvent): void => {
  event.preventDefault();
};

function RepoOption({
  id,
  active,
  match,
  onPick,
}: {
  id: string;
  active: boolean;
  match: RepoMatch;
  onPick: (repo: UserRepo) => void;
}) {
  const { repo, highlight } = match;
  // The fleet table's `LAST USED` vocabulary, and its 80px column.
  const pushed = useLastUsed(Date.parse(repo.pushedAt));

  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      onMouseDown={keepFocus}
      onClick={() => onPick(repo)}
      className={cn(
        'flex w-full items-center gap-2 border-t border-border-soft px-3 py-1.5 text-left text-control text-ink hover:bg-hover',
        active && 'bg-active',
      )}
    >
      <span className="min-w-0 flex-1 truncate">
        <span className="text-muted">{repo.owner}/</span>
        {highlight === null ? (
          repo.name
        ) : (
          <>
            {repo.name.slice(0, highlight.start)}
            <mark className="bg-transparent text-brand underline underline-offset-2">
              {repo.name.slice(highlight.start, highlight.end)}
            </mark>
            {repo.name.slice(highlight.end)}
          </>
        )}
      </span>
      {repo.isProject ? (
        <span className="shrink-0 rounded-full border border-green px-1.5 text-micro text-green">
          already a project
        </span>
      ) : null}
      {repo.isFork ? <span className={TAG}>fork</span> : null}
      {repo.isArchived ? <span className={TAG}>archived</span> : null}
      {repo.isPrivate ? <span className={TAG}>private</span> : null}
      <span className="w-[80px] shrink-0 text-right text-ui-sm text-subtle">{pushed}</span>
    </button>
  );
}

export function RepoPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { status, retry } = useUserRepos();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  const result = useMemo(
    () => (status.state === 'ready' ? filterRepos(status.snapshot.repos, value) : null),
    [status, value],
  );

  const open =
    focused && !dismissed && status.state !== 'unavailable' && !looksLikeUrl(value);

  const pick = (repo: UserRepo): void => {
    onChange(repo.url);
    setDismissed(true);
  };

  const rows = result?.rows ?? [];
  const current = rows.length === 0 ? -1 : Math.min(active, rows.length - 1);
  const optionId = (index: number): string => `${listId}-${index}`;

  /**
   * The combobox pattern: focus stays in the field, and the arrows move which
   * option is active. A dismissed list reopens on the first arrow rather than
   * moving a row the user cannot see.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (rows.length === 0) return;
      event.preventDefault();
      if (!open) {
        setDismissed(false);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current + step + rows.length) % rows.length);
      return;
    }
    if (event.key === 'Enter' && open && current >= 0) {
      event.preventDefault();
      pick(rows[current].repo);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setDismissed(true);
    }
  };

  const query = value.trim();

  let body: ReactNode = null;
  if (status.state === 'loading') {
    body = <p className="px-3 py-2.5 text-ui-sm text-muted">Loading your repositories…</p>;
  } else if (status.state === 'failed') {
    body = (
      <div className="flex flex-col gap-1.5 px-3 py-2.5 text-ui-sm">
        <p className="text-amber">{status.error.message}</p>
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={retry}
          className="w-fit text-brand hover:text-ink"
        >
          Try again
        </button>
      </div>
    );
  } else if (status.state === 'ready' && result !== null) {
    // With an empty query the account's own total, so 240 repositories say 240
    // rather than the hundred main fetched.
    const total = query === '' ? status.snapshot.total : result.matched;
    const count =
      total > REPO_LIMIT
        ? `Top ${REPO_LIMIT} of ${total} · keep typing to narrow`
        : `${total} repositor${total === 1 ? 'y' : 'ies'}`;

    if (status.snapshot.repos.length === 0) {
      body = (
        <p className="px-3 py-2.5 text-ui-sm text-muted">
          No repositories on this GitHub account.
        </p>
      );
    } else if (result.rows.length === 0) {
      body = (
        <p className="px-3 py-2.5 text-ui-sm text-muted">
          None of your repositories match "{query}". Paste a full URL to clone anything else.
        </p>
      );
    } else {
      body = (
        <>
          <div className="flex justify-between px-3 pt-2 pb-1 text-ui-sm text-subtle">
            <span className="font-semibold uppercase tracking-[0.06em]">{query === '' ? 'Recent' : 'Matching'}</span>
            <span>{count}</span>
          </div>
          <div id={listId} role="listbox" aria-label="Your repositories">
            {result.rows.map((match, index) => (
              <RepoOption
                key={`${match.repo.owner}/${match.repo.name}`}
                id={optionId(index)}
                active={index === current}
                match={match}
                onPick={pick}
              />
            ))}
          </div>
        </>
      );
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="clone-url" className="text-ui-sm text-muted">
        Repository URL
      </label>
      {/*
        The list floats over the form rather than pushing it down. Inline, it
        collapsed on the field's blur, so a click aimed at "Choose…" landed
        where the button had been a moment before and was lost.
      */}
      <div className="relative">
        <div className="flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-1.5 focus-within:border-brand">
          <MagnifyingGlass size={12} className="shrink-0 text-subtle" />
          <input
            id="clone-url"
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && current >= 0 && status.state === 'ready' ? optionId(current) : undefined
            }
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
              setActive(0);
              setDismissed(false);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search your repositories, or paste any git URL"
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-control text-ink outline-none placeholder:text-subtle"
          />
        </div>
        {/*
          `data-escape-scope`: Radix hears Escape on the document in the capture
          phase, before this field does, so the overlay asks whether a control
          has claimed the key (`escapeIsClaimed`). While the list is open it has:
          the first Escape closes the list, the second closes settings.
        */}
        {open && body !== null ? (
          <div
            data-escape-scope=""
            className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-lg border border-border bg-panel-2 shadow-lg"
          >
            {body}
          </div>
        ) : null}
      </div>
    </div>
  );
}
