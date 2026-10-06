import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';

import { cn } from '@/lib/utils';

import { EditorSurface } from '@components/editor/editor-surface';
import { Button } from '@components/ui/button';
import { SplitHandle } from '@components/ui/split-handle';
import { AgentForm } from '@features/shared/components/agent-form';
import { languageFor } from '@lib/explorer/language';
import { onTablistKeyDown } from '@lib/tablist';
import type { AgentProblem } from '@shared/agent-contract';
import {
  DEFAULT_AGENT_SPLIT_RATIO,
  useAgentSplitRatio,
  useEditorAppearance,
  useSetAgentSplitRatio,
} from '@stores/appearance-store';

type Tab = 'form' | 'source';

/**
 * The narrowest each pane may be dragged to, px: the form's fields and their
 * inline problems stop wrapping at 460, and 320 keeps a frontmatter line such
 * as `slack.channel:#incorp-dev` on one row. The grid's class repeats both
 * numbers, since Tailwind cannot read a constant.
 */
export const FORM_MIN_PX = 460;
export const SOURCE_MIN_PX = 320;
/** Half the seam's `w-3` gutter: the ratio is the grip's centre, so the form stops 6px short of it. */
const HALF_SEAM_PX = 6;

/**
 * Why Run now would refuse, or `null` when it would not — the page header's
 * gate (HIVE-204), kept beside the editor whose buffer it is about.
 *
 * A wake reads `AGENT.md` off disk — it does not see the draft — so running
 * with unsaved edits would execute the previous version while the screen shows
 * the new one, and a never-saved agent has no file at all. A definition main
 * refused is not predicted here: the run comes back with the runtime's own
 * `invalid` refusal. Refusals only the runtime knows (working, paused) are not
 * predicted either; they arrive as an `AgentRunResult`.
 */
export function runRefusal(path: string | null, dirty: boolean): string | null {
  if (path === null) return 'Save it first — there is no definition on disk yet.';
  if (dirty) return 'Save first — a wake reads the file, not this buffer.';
  return null;
}

/**
 * The markdown grammar, resolved once at module scope.
 *
 * `EditorSurface` re-imports the grammar whenever this identity changes, so a
 * loader built in render would fetch the chunk on every keystroke. An AGENT.md
 * is always markdown — there is no file name to branch on here as there is in
 * the explorer — so the loader is a constant rather than a memo.
 */
const AGENT_LANGUAGE = languageFor('AGENT.md')?.load ?? null;

interface AgentEditorProps {
  /** The file being edited, or `null` while its contents are still arriving. */
  path: string | null;
  /** The whole file — one buffer, shown two ways. */
  source: string;
  dirty: boolean;
  /** Why it cannot be saved. Empty means it can. */
  problems: readonly AgentProblem[];
  /** Names already spoken for. Forwarded to the form's name field. */
  taken: readonly string[];
  onChange: (source: string) => void;
  onSave: () => void;
  onDelete: () => void;
  /** Put the buffer back to the file as last read or saved. Offered only while dirty. */
  onRevert: () => void;
  /**
   * What the last run attempt answered, or `null`.
   *
   * **Deliberately not a `problems` entry**, which is where this landed first
   * and where it was a trap. `problems` is what made Save refuse *and* what
   * Run now's gate read, so reporting "it is already working" through it
   * disabled the very button that had just produced the message — and
   * relabelled it "this definition cannot be read", which was false: the
   * definition parsed, which is why the call reached main at all. The state
   * cleared only on reselect or a no-op Save.
   *
   * A refusal here is transient by construction. `working` ends, `paused` is
   * one click away, and `unknown` is the runtime coming up — every one of them
   * is a reason to try again shortly, so none of them may disable retrying.
   * `agent-view.tsx` reached the same shape from the other direction and calls
   * it `notice`.
   */
  notice: string | null;
  /**
   * A question is open below the editor, so its buttons are the only ones on
   * offer — `skill-editor.tsx`'s prop, for the same four-answers problem.
   */
  actionsHidden?: boolean;
  /**
   * `split`: Form and Source side by side from 900px of container, with the
   * draggable seam (the agent page). `tabs`: Form | Source tabs at every width
   * (Settings, whose detail pane is too narrow for two panes).
   */
  layout?: 'split' | 'tabs';
}

/**
 * An agent's `AGENT.md`: side by side on the agent page's Definition view, and
 * behind tabs in Settings › Agents (HIVE-114, HIVE-204).
 *
 * ## Side by side on the page, tabs in Settings
 *
 * Settings' editor column is roughly 450–650px after the list, and a split
 * there lands each half near 300px, where `slack.channel:#incorp-dev` wraps, so
 * Settings asks for `layout="tabs"`. The page gives it the whole stage, so at
 * 900px of container and up the form and the source sit side by side and you
 * can watch the frontmatter change as you edit the form. The seam between them
 * drags, the split is kept in appearance-store, and neither pane goes below
 * its minimum width. Below 900px of a split the Form | Source tabs come back,
 * each with the full height.
 *
 * ## Why the real editor, and not a `<textarea>`
 *
 * This used to be a plain textarea, on the argument `skill-editor.tsx` then
 * made — that the editor seam exists for repo files, and mounting it here would
 * pull the explorer's stack into settings so the user can write a paragraph.
 * That argument undersold what an AGENT.md is, and the skills pane has since
 * abandoned it too. It is not a paragraph: it is a
 * frontmatter block with a dozen keys whose problems the footer reports **by
 * line**, and a body long enough to scroll — so a reader told "unknown key on
 * line 7" had to count rows with a finger, and could not search the file at
 * all.
 *
 * `EditorSurface` answers all three at once — the gutter, the floating find
 * panel, and `Mod-s` bound *inside* the view, which is the only place a save
 * shortcut can be bound and still fire while CodeMirror holds focus. Markdown
 * highlighting comes with it, so the `---` fences and the keys between them
 * stop reading as prose. The cost is one CodeMirror mount on the page, which is
 * lazy-chunked like every other.
 */
export function AgentEditor({
  path,
  source,
  dirty,
  problems,
  taken,
  onChange,
  onSave,
  onDelete,
  onRevert,
  notice,
  actionsHidden = false,
  layout = 'split',
}: AgentEditorProps) {
  const split = layout === 'split';
  const [tab, setTab] = useState<Tab>('form');
  const uid = useId();
  const appearance = useEditorAppearance();
  const ratio = useAgentSplitRatio();
  const setRatio = useSetAgentSplitRatio();
  const grid = useRef<HTMLDivElement>(null);

  // Both panes keep a width the form and the editor can draw in; the CSS minmax holds them on a resize too.
  const onRatio = (next: number) => {
    const width = grid.current?.getBoundingClientRect().width ?? 0;
    if (width > 0) {
      setRatio(Math.min(Math.max(next, (FORM_MIN_PX + HALF_SEAM_PX) / width), 1 - (SOURCE_MIN_PX + HALF_SEAM_PX) / width));
    }
  };

  /**
   * The live `onSave`, for a listener bound once on mount.
   *
   * `onSave` is a fresh closure on every render of `agents-section.tsx` — it
   * reads the buffer — so binding it directly would either re-attach the
   * listener on every keystroke or, with an empty dependency array, save a
   * buffer from the first render forever. The same shape `EditorSurface` uses
   * for its own `Mod-s`, and for the same reason.
   */
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  /*
    What the footer says, and what it deliberately does not.

    A problem that names a field is rendered beside that field by `AgentForm`,
    so repeating its sentence here would print the same complaint twice on one
    screen. But a footer that then said nothing would be the failure this
    replaces — a refused Save with no reason — so it counts them instead and
    points at where they are.

    A whole-file problem has no field to sit beside, so the footer owns it
    outright.
  */
  const footer = ((): string => {
    const wholeFile = problems.find((problem) => problem.field === '');

    if (wholeFile !== undefined) return wholeFile.reason;
    if (problems.length === 0) {
      return 'The name in the frontmatter names the folder.';
    }

    /*
      On the narrow Source tab the form is hidden, so nothing else on screen is
      showing these. Say the first one in full rather than counting — a count
      with no reachable detail is the disabled-Save-with-no-explanation this
      whole line exists to replace.
    */
    if (tab === 'source') {
      const first = problems[0];
      const text =
        first === undefined
          ? ''
          : first.field === 'name'
            ? first.reason
            : `${first.field}: ${first.reason}`;

      return problems.length === 1
        ? text
        : `${text} (+${problems.length - 1} more)`;
    }

    return problems.length === 1
      ? `1 problem — see ${problems[0]?.field ?? 'the form'}.`
      : `${problems.length} problems — see the form.`;
  })();

  const tabClass = (which: Tab) =>
    cn(
      'rounded-md px-2 py-0.5 text-micro',
      tab === which ? 'bg-active text-ink' : 'text-subtle hover:text-ink',
    );

  /**
   * ⌘S from anywhere in the pane, and exactly once.
   *
   * The Source tab's own binding lives inside CodeMirror, which is the only
   * place a shortcut can be bound and still fire while the editor holds focus.
   * That leaves the Form tab — ten inputs, no editor — where ⌘S reached the
   * browser and offered to save the page. This listener is for them.
   *
   * A native listener on the frame rather than a JSX `onKeyDown`, the way
   * `editor-pane.tsx` binds Escape: a keyboard handler on a non-interactive
   * `<div>` is what `jsx-a11y` exists to reject, and the rule is right — the
   * shortcut must never be the *only* way to save, which is why the Save button
   * three lines below stays exactly where it is.
   *
   * Scoped to the frame, not to `window`: settings is an overlay over a shell
   * full of live terminals, and a global ⌘S would save whichever agent happened
   * to be open while the user was typing somewhere else entirely.
   *
   * `defaultPrevented` is what keeps the two bindings from doubling up:
   * CodeMirror's keymap prevents the default when it handles `Mod-s`, and the
   * event still bubbles out here. Saving twice is not harmless — `save` writes
   * through the bridge, and a rename writes through a *different* call — so the
   * guard is the point, not tidiness.
   */
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = frame.current;
    if (host === null) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 's' || !(event.metaKey || event.ctrlKey)) return;
      if (event.defaultPrevented) return;

      event.preventDefault();
      onSaveRef.current();
    };

    host.addEventListener('keydown', onKeyDown);

    return () => {
      host.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div ref={frame} className="@container flex min-h-0 flex-1 flex-col overflow-hidden">
      {/*
        The bar: the path, not the name — the name is in the page header, and
        what this adds is *where the bytes go*, which is what a user needs when
        they go looking for the file outside the app. `min-w-0` is load-bearing:
        without it `truncate` never engages and a long path widens the page.
      */}
      <div className="flex items-center gap-3 border-b border-border-soft px-5 py-2 text-control">
        <span className="min-w-0 flex-1 truncate tabular-nums text-subtle">{path ?? 'not saved yet'}</span>
        <span className={dirty ? 'shrink-0 font-sans text-amber-text' : 'shrink-0 font-sans text-subtle'}>
          {dirty ? 'unsaved' : 'saved'}
        </span>
      </div>

      {/*
        Below 900px of stage, today's Form | Source tabs; at or above, both
        panes side by side and the tabs go. A container query rather than a
        viewport one: the stage's width is what the panes share, and the rails
        beside it take a different share of the window on every layout. In
        the tabs layout the tabs stay at every width.
      */}
      <div
        role="tablist"
        aria-label="Agent editor view"
        className={cn('flex gap-1 border-b border-border-soft px-2.5 py-1.5', split && '@min-[900px]:hidden')}
      >
        <button
          type="button"
          role="tab"
          id={`${uid}-tab-form`}
          aria-selected={tab === 'form'}
          aria-controls={`${uid}-panel-form`}
          tabIndex={tab === 'form' ? 0 : -1}
          onKeyDown={onTablistKeyDown}
          onClick={() => setTab('form')}
          className={tabClass('form')}
        >
          Form
        </button>
        <button
          type="button"
          role="tab"
          id={`${uid}-tab-source`}
          aria-selected={tab === 'source'}
          aria-controls={`${uid}-panel-source`}
          tabIndex={tab === 'source' ? 0 : -1}
          onKeyDown={onTablistKeyDown}
          onClick={() => setTab('source')}
          className={tabClass('source')}
        >
          Source
        </button>
      </div>

      {/*
        Both panes edit the one buffer, so in wide mode the source is mounted
        even while the narrow tab says Form: there is nothing to keep in step.
      */}
      <div
        ref={grid}
        style={{ '--agent-form-w': `calc(${String(ratio * 100)}% - ${String(HALF_SEAM_PX)}px)` } as CSSProperties}
        className={cn(
          'grid min-h-0 flex-1',
          split && '@min-[900px]:grid-cols-[minmax(460px,var(--agent-form-w))_12px_minmax(320px,1fr)]',
        )}
      >
        <div
          role="tabpanel"
          id={`${uid}-panel-form`}
          aria-labelledby={`${uid}-tab-form`}
          className={cn(
            'min-h-0 overflow-y-auto font-sans',
            split && '@min-[900px]:block',
            tab === 'form' ? 'block' : 'hidden',
          )}
        >
          <AgentForm
            source={source}
            problems={problems}
            taken={taken}
            onChange={onChange}
          />
        </div>
        {split ? (
          <SplitHandle
            axis="vertical"
            containerRef={grid}
            label="Resize the form and the source"
            value={ratio}
            onValue={onRatio}
            onReset={() => setRatio(DEFAULT_AGENT_SPLIT_RATIO)}
            grip
            className="hidden w-3 bg-bg @min-[900px]:block"
          />
        ) : null}
        <div
          role="tabpanel"
          id={`${uid}-panel-source`}
          aria-labelledby={`${uid}-tab-source`}
          className={cn('min-h-0 flex-col', split && '@min-[900px]:flex', tab === 'source' ? 'flex' : 'hidden')}
        >
          {/*
            The one thing the source could not say for itself, and the one users
            got wrong: the text under the frontmatter is the agent's job, re-read
            on every wake — not a description of what sort of agent it is.
          */}
          <p className="border-b border-border-soft px-[18px] py-2 font-sans text-control leading-relaxed text-subtle">
            Below the <code className="font-mono">---</code> is what this agent
            does, carried out on every wake. Write it as instructions, not as a
            description.
          </p>
          {/*
            `readOnly` is hard-`false`, and deliberately not
            `!appearance.editable`. That setting is the explorer's guard against
            editing repo files by accident; this page exists to write this one
            file, and an editor that silently refused every keystroke because of
            a preference set elsewhere would read as broken.

            The `fileKey` is the path, so the caret and the undo history survive
            a trip to the Form tab and back — and a *different* agent gets a
            different key, which is what stops one agent's undo stack reaching
            into another's file. A never-saved agent has no path, and every
            never-saved agent is the same draft, so they share one key.
          */}
          <EditorSurface
            ariaLabel="Agent source"
            fileKey={path ?? 'new-agent'}
            value={source}
            languageLoad={AGENT_LANGUAGE}
            readOnly={false}
            fontFamily={appearance.fontFamily}
            fontSize={appearance.fontSize}
            wordWrap={appearance.wordWrap}
            lineNumbers={appearance.lineNumbers}
            tabWidth={appearance.tabWidth}
            onChange={onChange}
            onSave={onSave}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border-soft px-5 py-2 font-sans">
        {/*
          The notice outranks the standing line, and is amber rather than red:
          "it is already working" is the system behaving correctly, not a fault
          in the file. A problem still wins over both — a definition that will
          not parse is the more urgent fact, and it is also why the run was
          never attempted.
        */}
        {problems.length === 0 && notice !== null ? (
          <span role="status" className="min-w-0 text-micro text-amber-text">
            {notice}
          </span>
        ) : (
          <span
            className={
              problems.length === 0
                ? 'min-w-0 text-micro text-subtle'
                : 'min-w-0 text-micro text-red'
            }
          >
            {footer}
          </span>
        )}
        <div className="flex shrink-0 gap-1.5" hidden={actionsHidden}>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-full border border-red-edge px-3 py-1 text-control font-semibold text-red hover:bg-hover"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onRevert}
            disabled={!dirty}
            className="rounded-full border border-edge px-3 py-1 text-control font-semibold text-ink hover:bg-hover disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:text-muted"
          >
            Revert
          </button>
          <Button
            variant="primary"
            size="sm"
            onClick={onSave}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
