import { Brain } from '@phosphor-icons/react';

import {
  chipLabel,
  chipParts,
  clockLabel,
  dayClockLabel,
  pctLabel,
  pctOrNull,
} from '@/lib/session-metrics';
import { isSession } from '@/types/entity';

import { GaugeRing, gaugeTone } from '@components/ui/gauge-ring';
import { TONE_TEXT } from '@components/ui/tag';
import { useActiveEntity, useSessionMetrics } from '@stores/hive-store';

interface StatProps {
  pct: number;
  /** The word beside the number — `ctx`, or a reset time for the two limits. */
  detail: string;
  /** The narrow header's detail (HIVE-213): `5h` / `wk`, so the two limits stay told apart. */
  short?: string;
  /** Names the quantity for assistive tech; never abbreviated. */
  label: string;
}

/**
 * One gauge, one percentage, one detail.
 *
 * The percentage takes the ring's own colour, so a limit going amber changes two
 * things that agree rather than one thing beside an unchanged number.
 *
 * It owns its own separator, because a section that renders only when its number
 * exists must take its divider with it — a border left behind by an absent stat
 * is a hairline against nothing.
 */
function Stat({ pct, detail, short, label }: StatProps) {
  return (
    <span className="flex shrink-0 items-center gap-1 border-l border-border pl-2">
      <GaugeRing pct={pct} label={label} />
      <span className={TONE_TEXT[gaugeTone(pct)]}>{pctLabel(pct)}</span>
      {short === undefined ? (
        <span data-detail="only" className="text-subtle @max-[620px]:hidden">
          {detail}
        </span>
      ) : (
        <>
          <span data-detail="long" className="text-subtle @max-[880px]:hidden">
            {detail}
          </span>
          <span
            data-detail="short"
            className="hidden text-subtle @max-[880px]:inline @max-[620px]:hidden"
          >
            {short}
          </span>
        </>
      )}
    </span>
  );
}

/**
 * The active session's model, effort, context, and the two rate-limit windows
 * (HIVE-79).
 *
 * ```
 * ⌾ Opus 4.5 (1M) · high │ ◔ 46% ctx │ ◔ 12% ↻ 2:30p │ ◕ 46% ↻ Thu 5p
 * ```
 *
 * Renders nothing unless the active tab *is* a session: the orchestrator has no
 * model of its own, and agents are long-lived workers rather than a metered
 * conversation. Returning null rather than an empty element lets the header's
 * row close the gap instead of holding a blank slot.
 *
 * ## It is a readout, not a chip
 *
 * The name is historical and the pill is gone. This is bare mono text now, cut
 * to the same size and colour as the fleet counts at the other end of the bar,
 * because the two report the same kind of thing and only one of them was ever
 * dressed as an object. See the class list on the root span for the argument.
 *
 * ## Three stats, not two
 *
 * The chip used to show context and a single unlabelled percentage that was, in
 * fact, the five-hour window — with a reset **time but no day**. Two of those
 * three facts were unrecoverable from the chip itself. Now each window carries
 * its own gauge and its own reset, and the weekly one carries the weekday,
 * because "resets 5p" is the same string on a Monday and a Friday and completely
 * different news.
 *
 * ## What it does when it does not know: nothing at all
 *
 * A stat with no number is **not rendered**. This replaced an em dash beside a
 * dimmed, empty ring, which was the right instinct — never invent a zero — and
 * the wrong shape: three placeholders is what the chip looks like in the first
 * seconds of *every* session, and each one is a labelled slot promising a number
 * that may never come.
 *
 * The waits are real and they are not all short:
 *
 * - `rate_limits` is absent until a session's first API response — seconds — and
 *   absent for the whole life of a session authenticated with an API key rather
 *   than a subscription.
 * - `context_window.used_percentage` is `null` until the session's **first
 *   assistant turn**, which is however long the user takes to send a prompt.
 *   Confirmed against Claude Code 2.1.228: a spawned session reports its rate
 *   limits on a timer while the context percentage stays null the entire time,
 *   because the number is computed from the last message carrying a `usage`
 *   block and an idle session has none.
 *
 * So an empty slot beside `ctx` was, in the common case, telling the truth about
 * a number the session simply has not produced yet. Absence says the same thing
 * without holding the space, and the stat appears — with its separator — on the
 * tick that first carries it. The chip grows rather than filling in, which is
 * the honest direction: the header only ever claims what it has been told.
 *
 * ### The percentage is what makes a stat, and a reset alone is not one
 *
 * Each window is gated on its **percentage**, so a payload carrying
 * `resets_at` with no `used_percentage` renders nothing rather than a lone
 * reset time. That is a deliberate trade and it does discard a reported fact.
 *
 * `↻ 2:30p` with no number beside it answers a question nobody asked: a reset
 * time is only actionable as the deadline on a quantity, and on its own it
 * reads as a countdown to something unstated. The old chip showed `— ↻ 2:30p`,
 * which kept the fact by reintroducing the placeholder this section exists to
 * remove.
 *
 * It is also not a state Claude Code produces: the two are emitted from one
 * object literal per window, so a reset without its percentage would mean the
 * payload shape had changed. The contract makes them independently optional and
 * `metrics.ts` reads them independently, which is why the case is handled at
 * all rather than assumed away — the tooltip drops it too, so nothing on screen
 * half-reports a window.
 *
 * ## Width, and what gives way
 *
 * The chip sizes to its content. The session header is a size container and
 * gives way in order as the stage narrows (HIVE-213, HIVE-220; widths are the
 * header's):
 *
 * 1. the title truncates;
 * 2. ≤ 880px, the resets give way to `5h` / `wk` (both spans render; the
 *    container picks one);
 * 3. ≤ 720px, the header's status word hides (its dot keeps it as a title);
 *    measured, the row needs ~705px with the word and this label (HIVE-219;
 *    retuned to 720px for the rails' grip gutters, #71);
 * 4. ≤ 700px, the label shortens to the model name, window and effort left to
 *    the tooltip;
 * 5. ≤ 620px, the detail words go: each stat is its ring and percentage;
 * 6. ≤ 560px, the label goes: the brain icon alone;
 * 7. ≤ 500px, the title column's floor drops from 140px to 96px.
 *
 * Each breakpoint sits above the width its row needs with the steps before it
 * (690, 603, 541, 475px), so the header at 1200px with both panels open (452px, the rails' grip gutters included)
 * fits with the icon alone and room to spare.
 *
 * The three percentages never go. The full string, model, window, effort and
 * both resets included, stays in `title` at every step. The header's model slot
 * clips at its end only if these steps ever miss, so the menu stays reachable.
 *
 * The separators are hairline borders rather than `│` glyphs so they do not
 * change width with the font.
 */
export function ModelChip() {
  const entity = useActiveEntity();
  const metrics = useSessionMetrics(entity?.id);

  if (!entity || !isSession(entity)) return null;

  const context = pctOrNull(metrics?.contextPct);
  const fiveHour = pctOrNull(metrics?.fiveHourPct);
  const sevenDay = pctOrNull(metrics?.sevenDayPct);

  const parts = chipParts(metrics, entity.model, entity.effort);
  const label = chipLabel(metrics, entity.model, entity.effort);
  const fiveHourReset = clockLabel(metrics?.fiveHourResetsAt);
  const sevenDayReset = dayClockLabel(metrics?.sevenDayResetsAt);

  /*
    The tooltip spells out what the chip abbreviates — every label in full, both
    resets, and the window size in tokens. A truncated chip loses pixels, not
    information.

    It carries the same stats the chip does and no placeholder for the ones it
    does not have: a tooltip reading `context —` would reintroduce, on hover,
    the empty promise the chip stopped making.
  */
  const title = [
    label,
    context === null ? null : `context ${pctLabel(context)}`,
    fiveHour === null
      ? null
      : `session limit ${pctLabel(fiveHour)}${fiveHourReset === null ? '' : `, resets ${fiveHourReset}`}`,
    sevenDay === null
      ? null
      : `weekly limit ${pctLabel(sevenDay)}${sevenDayReset === null ? '' : `, resets ${sevenDayReset}`}`,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

  return (
    <span
      title={title}
      /*
        A stable handle for the layout specs.
        The Electron suite used to find this element by `getByTitle(/\(1M\)/)`,
        which stopped working the moment the window suffix became *derived* from
        `metrics.contextWindow`: that suite stubs `claude` out entirely
        (`true; false`), so no status line ever reports a window and the label is
        correctly `Opus 4.5 · high`. A locator that depends on a session's
        reported context window cannot find a chip in a suite that has no
        sessions reporting anything — and the alignment those specs measure has
        nothing to do with the model anyway.
      */
      data-testid="model-chip"
      /*
        Plain text, not a pill.

        This used to be a `Chip` — `rounded-full bg-chip px-3 py-1`. The fill
        implied the metrics were a distinct object you could act on. They are a
        readout, so they render like one: `tabular-nums text-xs text-muted` rather
        than the chip's `text-ui-sm`.
      */
      className="flex items-center gap-1.5 whitespace-nowrap tabular-nums text-xs text-muted"
    >
      <Brain size={13} weight="regular" className="shrink-0 text-brand" />
      <span className="flex items-center gap-2">
        {/* Both render; the header's width picks one, or neither (HIVE-220). */}
        <span data-label="full" className="shrink-0 @max-[700px]:hidden">
          {label}
        </span>
        <span
          data-label="model"
          className="hidden shrink-0 @max-[700px]:inline @max-[560px]:hidden"
        >
          {parts.name}
        </span>

        {context === null ? null : (
          <Stat pct={context} detail="ctx" label="context" />
        )}

        {fiveHour === null ? null : (
          <Stat
            pct={fiveHour}
            label="session limit"
            short="5h"
            /*
              The window's *name* when the percentage arrived without a reset,
              not a second em dash. The two travel together in every payload
              observed, but they are independently optional in the contract, and
              a lone number needs to say which of the two windows it counts.
            */
            detail={fiveHourReset === null ? 'session' : `↻ ${fiveHourReset}`}
          />
        )}

        {sevenDay === null ? null : (
          <Stat
            pct={sevenDay}
            label="weekly limit"
            short="wk"
            detail={sevenDayReset === null ? 'week' : `↻ ${sevenDayReset}`}
          />
        )}
      </span>
    </span>
  );
}
