import { useState, type KeyboardEvent } from 'react';

import { cn } from '@/lib/utils';
import type { Agent } from '@/types/entity';

import { Button } from '@components/ui/button';
import { STATUS_TEXT, STATUS_LABEL } from '@components/ui/status-dot';
import { AgentLedger } from '@features/agents/components/agent-ledger';
import { AgentRunLog } from '@features/agents/components/agent-run-log';
import { parseAgentInput } from '@lib/ledger/agent-input';
import { useAgentFacts } from '@stores/hive-store';

interface AgentViewProps {
  entity: Agent;
  /**
   * The last refusal from a control on the page, or `null` — this view's
   * input, or the page header's Run now and Pause (HIVE-204). Owned by the
   * page, because the header that produces half of them is the page's.
   *
   * Both verbs answer with a **value** rather than throwing — `AgentRunResult`
   * carries a `refused` word and `LedgerResult` a status and a reason — and
   * both contracts say in as many words that they are values so the renderer
   * can draw the reason. Discarding them made a refused Run now look like a
   * dead button, and a rejected post silently eat what the user typed.
   */
  notice: string | null;
  onNotice: (notice: string | null) => void;
}

/**
 * An agent's Activity, under the agent page's header (HIVE-116; the header
 * moved to `agent-page.tsx` in HIVE-204).
 *
 * **Deliberately not a terminal.** Nothing here is typed into a process: the
 * input posts to the ledger, and the log is a transcript of turns that have
 * already ended. It keeps the terminal's rhythm — a header, a body, one input
 * at the bottom — so the eye knows where to look, and that is the whole of the
 * resemblance. Until this story an agent tab mounted a read-only xterm and a
 * message row, which looked like somewhere to type and was not.
 *
 * ## The frame: chrome full-bleed, content inset
 *
 * Three bands, and the session view's exactly — a header bar that spans the
 * stage, a padded body, and a prompt row that spans it again. This view used to
 * have none of that: it mounted straight into the stage with `gap-2` and no
 * padding at all, so the header, the fact tiles and the ledger all sat flush
 * against both edges and the prompt floated as a rounded box in the middle of
 * nothing.
 *
 * The rule the three bands express is that *chrome* touches the edges and
 * *content* never does. The body carries the only inset, and it is `px-4`
 * because the session header is — the two views are a tab apart and a gutter that
 * changed as you switched between them would read as the stage moving. The
 * prompt keeps the console's own `px-[18px]` for the same reason, from the
 * other direction: it is the same control, so it is the same row.
 *
 * ## The split
 *
 * Run log and ledger sit side by side rather than stacked, because the two
 * want different widths for reasons that do not move: the log renders at the
 * *terminal* type scale, which the user sets anywhere from 10px to 18px, so
 * its character budget is elastic; the ledger is chrome at a fixed size
 * showing short correspondence. The elastic one takes the remainder.
 *
 * `minmax(0, 1fr)` and not a bare `1fr`: `1fr` carries an `auto` minimum, so
 * one unbreakable 95-character tool line — `ARG_LIMIT` is 60, plus the tool's
 * name — would push the grid past the stage and hand the whole app a
 * horizontal scrollbar.
 *
 * The stack point is a **container query**, not a media query, and this is the
 * first one in the codebase. The rails drag from their floors (320px and 316px)
 * up to 520px each, so a 1920px window can hold a 700px stage; only this box
 * knows how wide it actually is. Below 720px the ledger drops beneath the log
 * at full width, which is the layout this story started from — nothing is
 * lost, it is just not the shape that suits a wide stage.
 *
 * 720, not the 800 it opened at. The default window is 1440px and the rails at
 * their defaults now take 636 of it, which leaves the stage 804px — four
 * pixels from the old stack point, so a 5px drag or a display a shade under
 * 1440 logical pixels flipped the layout. At 720 the log beside a 280px ledger
 * still has 432px, about 34 characters at the largest terminal size, which is
 * the narrowest a run line reads at all. `agents.spec.ts` narrows the window
 * to 1100px to cross it, where the stage is 464px.
 */
export function AgentView({ entity, notice, onNotice }: AgentViewProps) {
  const facts = useAgentFacts(entity.id);
  const [draft, setDraft] = useState('');

  const submit = () => {
    const input = parseAgentInput(draft);

    if (input.kind === 'empty') return;

    onNotice(null);

    const written =
      input.kind === 'answer'
        ? window.hive?.ledger.answer({ thread: input.thread, body: input.body })
        : window.hive?.ledger.post({
            to: entity.id,
            kind: 'ask',
            body: input.body,
          });

    /*
      The draft is cleared **on success**, never before the write is known.

      A body over the ledger's cap, an unresolvable ref, or a failed disk write
      all come back as a refusal — and clearing first destroyed the message on
      its way out, which is the exact failure `agent-input.ts` tightened its
      thread matching to avoid.
    */
    void written?.then((result) => {
      if (result.ok) {
        setDraft('');

        return;
      }

      onNotice(result.reason);
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;

    event.preventDefault();
    submit();
  };

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      {/*
        The body — the only band with a gutter. The page header above and the
        prompt below are chrome and span the stage; everything between them
        is content and does not.
      */}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-4 py-3">
        {facts === null ? null : (
          <div
            /*
              Five even tiles, labels above values, as the agent page had before
              HIVE-204 took the boxes away. Columns of at least 150px that share
              the width evenly, and wrap onto a second row on a narrow stage
              (both rails dragged wide) rather than truncate.
            */
            className="grid gap-2.5 font-sans text-control [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]"
          >
            {/* Paused reads amber here (HIVE-211): the bar below says why nothing happens. `STATUS_TEXT` is shared and stays. */}
            <Fact label="Status" tone={facts.status === 'paused' ? 'text-amber-text' : STATUS_TEXT[facts.status]}>
              {STATUS_LABEL[facts.status]}
              {facts.askRef === undefined ? '' : ` ${facts.askRef}`}
            </Fact>
            <Fact label="Wake">{facts.wake}</Fact>
            {/*
              The skip count dimmed, and drawn only when it is not zero
              (HIVE-121). Zero draws nothing, so the tile keeps the width it has
              at five columns and the suffix *arriving* is the signal — which is
              what distinguishes a quiet agent from a broken one.

              `Session`'s `· run 7/50` below is the same idiom: a value, then a
              `·`-joined qualifier that is quieter than it.
            */}
            <Fact label="Next">
              {facts.next}
              {facts.skips === undefined ? null : (
                <span className="text-subtle"> · {facts.skips}</span>
              )}
            </Fact>
            <Fact label="Today">{`${facts.todayRuns} runs · ${facts.todayCost}`}</Fact>
            {/*
              The rotation made visible *before* it happens: an agent resumes one
              conversation until this fraction fills, and HIVE-122 starts a fresh
              one. Without the denominator a reader has no way to know how close
              that is.
            */}
            <Fact label="Session">
              {facts.sessionUuid === undefined
                ? '—'
                : `${facts.sessionUuid.slice(0, 8)} · run ${facts.runsSinceRotate}/${facts.rotateAfter}`}
            </Fact>
          </div>
        )}

        <div className="min-h-0 flex-1">
          <div className="grid h-full min-h-0 gap-3 [grid-template-columns:minmax(0,1fr)_300px] @max-[720px]:[grid-template-columns:minmax(0,1fr)]">
            <AgentRunLog name={entity.id} />
            <AgentLedger name={entity.id} />
          </div>
        </div>
      </div>

      {/*
        The prompt, and it is the console's row rather than a box of its own.

        It used to be a rounded `bg-term-input` card floating inside the body's
        (then nonexistent) padding, which read as a widget sitting *on* the view
        instead of the surface the view is typed into. `console-input.tsx` had
        already settled what this control looks like — full-bleed, square, a
        rule above it, `px-[18px] py-2.5`, the name in green followed by `❯` —
        and there is no argument for the agent's version of the same control
        looking different. Every class here is that row's, verbatim.

        The agent's own name is the prompt glyph for the same reason the console
        says `overmind ❯`: the row is addressed to somebody, and which somebody
        is the one thing a prompt should say.
      */}
      {entity.status === 'paused' ? (
        <PauseBar id={entity.id} onNotice={onNotice} />
      ) : (
      <div data-stage-input="" className="flex shrink-0 items-center gap-2.5 border-t border-border-soft bg-term-input px-[18px] py-2.5">
        <span className="shrink-0 font-mono text-ui text-green">
          {`${entity.id} ❯`}
        </span>
        <label htmlFor="agent-input" className="sr-only">
          {`Post to ${entity.id}'s ledger`}
        </label>
        <input
          id="agent-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          /*
            The grammar `parseAgentInput` actually accepts, and the literal
            `answer ` is load-bearing. Anything that does not start with it
            falls through to `{ kind: 'ask' }` — so a placeholder promising a
            bare `a1 yes` would have posted "a1 yes" as a *new ask addressed to
            the agent*, cleared the box on success, left `a1` open, and left
            the agent blocked. A write that succeeds at the wrong thing is the
            one failure this surface's `notice` channel cannot report.
          */
          placeholder="a message, or answer a1 <text>"
          className="min-w-0 flex-1 bg-transparent font-mono text-control text-ink caret-green outline-none placeholder:text-subtle"
        />
      </div>
      )}

      {/*
        The console's hint bar, in the one place it differs: the notice takes
        its slot rather than adding a row beneath it. A refusal and the standing
        explanation answer the same question — what will Enter do — and the
        answer that is true right now is the one worth the height.

        "as the overmind", not "as you": main supplies `from` itself on both
        `ledger.post` and `ledger.answer`, so the renderer cannot speak as
        anyone else — and saying "as you" would describe an identity that does
        not exist in the log.
      */}
      {notice === null ? (
        entity.status === 'paused' ? null : (
        <p className="flex shrink-0 items-center justify-center border-t border-border-soft bg-term-input px-[18px] py-[11px] font-mono text-micro text-subtle">
          ↵ posts to the ledger as the overmind · not a terminal — nothing here
          reaches a process
        </p>
        )
      ) : (
        <p
          role="status"
          className="flex shrink-0 items-center justify-center border-t border-border-soft bg-term-input px-[18px] py-[11px] font-mono text-micro text-amber-text"
        >
          {notice}
        </p>
      )}
    </div>
  );
}

const messageOf = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

/**
 * A paused agent's prompt row (HIVE-211): nothing it is told will wake it, so
 * the input gives way to why, and the way back. The draft lives in
 * `AgentView`, above this, so Resume brings the input back as it was typed.
 */
function PauseBar({ id, onNotice }: { id: string; onNotice: (notice: string | null) => void }) {
  // The same call the row's Pause toggle makes; it rejects when the runtime is not up.
  const resume = () => {
    onNotice(null);
    void window.hive?.agents.resume({ name: id }).catch((cause: unknown) => onNotice(messageOf(cause)));
  };

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-3 border-t border-border-soft bg-amber-soft px-[18px] py-2.5 text-control text-muted"
    >
      <span className="flex-1">
        <b className="text-amber-text">{`${id} is paused.`}</b> Nothing wakes it, not the ledger, not a schedule, until
        you resume it. Your draft is kept.
      </span>
      <Button variant="primary" onClick={resume}>
        Resume
      </Button>
    </div>
  );
}

interface FactProps {
  label: string;
  tone?: string;
  children: React.ReactNode;
}

function Fact({ label, tone, children }: FactProps) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border-soft bg-panel px-3 py-2.5">
      <span className="text-micro tracking-[0.06em] text-subtle uppercase">{label}</span>
      <span className={cn('truncate', tone)}>{children}</span>
    </div>
  );
}
