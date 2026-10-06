import { render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentView } from '@features/agents/components/agent-view';
import { dayKey, type AgentSummary } from '@shared/agent-contract';
import { isAgent, type Agent } from '@/types/entity';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';

/**
 * The agent view (HIVE-116).
 *
 * The assertions worth having here are the ones about what this surface is
 * *not*: not a terminal, not a second place to type into a process, and not a
 * log that promises history it never kept.
 */
const summary = (over: Partial<AgentSummary> = {}): AgentSummary => ({
  name: 'watcher',
  description: 'Watches #incorp-dev and my mentions.',
  icon: 'ph-robot',
  status: 'asking',
  wake: { on: ['slack.mention'], everyMs: 300_000 },
  mcp: [],
  tools: [],
  rotateAfter: 50,
  runsSinceRotate: 17,
  sessionUuid: '9f3c1e2ab8',
  runs: [
    {
      run: 'r16',
      trigger: 'timer',
      startedAt: Date.now() - 5_000,
      endedAt: Date.now() - 3_000,
      outcome: 'done',
      costUsd: 0.008,
      turns: 2,
    },
    {
      run: 'r17',
      trigger: 'ledger',
      startedAt: Date.now() - 2_000,
      endedAt: Date.now(),
      outcome: 'asking',
      costUsd: 0.041,
      turns: 4,
    },
  ],
  ...over,
});

/*
  An agent mid-run. Liveness is `live` now, not the status word (HIVE-128) —
  the status carries on saying what the agent *is*, the list says what it is
  doing and how many of them there are.
*/
const working = (): Partial<AgentSummary> => ({
  status: 'working',
  live: [
    {
      run: 'live-1',
      kind: 'standing',
      trigger: 'timer',
      startedAt: Date.now(),
    },
  ],
});

const seed = (over: Partial<AgentSummary> = {}): Agent => {
  useHiveStore.getState().hydrateAgents([summary(over)]);

  const entity = useHiveStore.getState().entities['watcher'];

  if (entity === undefined || !isAgent(entity)) throw new Error('not seeded');

  return entity;
};

/** The page owns the notice now (HIVE-204); this holds it the way the page does. */
function Harness({ entity }: { entity: Agent }) {
  const [notice, setNotice] = useState<string | null>(null);

  return <AgentView entity={entity} notice={notice} onNotice={setNotice} />;
}

const bridge = () => {
  const run = vi.fn().mockResolvedValue({ started: true, run: 'r18' });
  const post = vi.fn().mockResolvedValue({ ok: true });
  const answer = vi.fn().mockResolvedValue({ ok: true });

  vi.stubGlobal('hive', { agents: { run }, ledger: { post, answer } });

  return { run, post, answer };
};

describe('AgentView', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    useUiStore.getState().reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('the facts', () => {
    it('renders all five', () => {
      render(<Harness entity={seed()} />);

      for (const label of ['Status', 'Wake', 'Next', 'Today', 'Session']) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });

    it('lays them out as five even tiles, in order, labels above values', () => {
      render(<Harness entity={seed()} />);

      const labels = ['Status', 'Wake', 'Next', 'Today', 'Session'].map((label) => screen.getByText(label));
      const row = labels[0]?.parentElement?.parentElement as HTMLElement;

      // Even columns that wrap on a narrow stage rather than squeeze.
      expect(row).toHaveClass('grid', '[grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]');
      expect(Array.from(row.children).map((fact) => fact.firstElementChild?.textContent)).toEqual([
        'Status',
        'Wake',
        'Next',
        'Today',
        'Session',
      ]);

      for (const label of labels) {
        expect(label).toHaveClass('text-micro', 'uppercase');
        expect(label.parentElement).toHaveClass('rounded-lg', 'border', 'border-border-soft', 'bg-panel');
      }
    });

    it('gives the ledger a 300px column beside the run log', () => {
      const { container } = render(<Harness entity={seed()} />);

      expect(container.querySelector('[class*="minmax(0,1fr)_300px"]')).not.toBeNull();
    });

    it('shows the rotation as a fraction, so it is visible before it happens', () => {
      render(<Harness entity={seed()} />);

      expect(screen.getByText(/9f3c1e2a · run 17\/50/)).toBeInTheDocument();
    });

    /*
      The day's total rather than the last run's, and read from the
      accumulator main keeps rather than summed from `runs` (HIVE-121).

      It used to sum that array, which is capped at the last twenty runs — so
      the tile stopped growing part-way through any day a five-minute agent
      actually worked. The number here is also the one the scheduler's daily
      ceiling is compared against; a tile deriving its own would be a second
      opinion about one fact.
    */
    it('shows today’s totals rather than the last run’s cost', () => {
      render(
        <Harness
          entity={seed({ today: { day: dayKey(Date.now()), runs: 31, usd: 2.14 } })}
        />,
      );

      expect(screen.getByText('31 runs · $2.14')).toBeInTheDocument();
    });

    it('reads a quiet day as none rather than as unmeasured', () => {
      render(<Harness entity={seed({ today: undefined })} />);

      expect(screen.getByText('0 runs · $0.00')).toBeInTheDocument();
    });

    /*
      Zero draws nothing, so the tile keeps the width it has at five columns
      and the suffix arriving is itself the signal — which is what makes a
      quiet agent distinguishable from a broken one.
    */
    it('shows the skip count beside the next wake', () => {
      render(<Harness entity={seed({ status: 'sleeping', skipsSinceRun: 3 })} />);

      expect(screen.getByText(/skipped 3/)).toBeInTheDocument();
    });

    it('draws no skip count when nothing has been skipped', () => {
      render(<Harness entity={seed({ status: 'sleeping', skipsSinceRun: 0 })} />);

      expect(screen.queryByText(/skipped/)).not.toBeInTheDocument();
    });

    it('reads an em dash for an agent that has never run', () => {
      render(<Harness entity={seed({ sessionUuid: undefined, runs: [] })} />);

      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('names the open ask beside the status', () => {
      const entity = seed();
      useHiveStore.getState().hydrateLedger([
        {
          id: '20260830-140000-0001',
          ts: Date.now(),
          from: 'watcher',
          to: 'overmind',
          kind: 'ask',
          ref: 'a71',
          body: 'Retry the deploy?',
        },
      ]);

      render(<Harness entity={entity} />);

      expect(screen.getByText(/asking a71/)).toBeInTheDocument();
    });
  });

  describe('the run log', () => {
    it('draws older runs as receipts, with no control promising an expansion', () => {
      render(<Harness entity={seed({ status: 'sleeping' })} />);

      expect(screen.getByText(/#r16/)).toBeInTheDocument();
      expect(screen.getByText(/#r17/)).toBeInTheDocument();
      // No disclosure control: those lines were never kept. A row is a button
      // now, but one that scrolls to the run's output, never one that expands.
      expect(
        screen
          .queryAllByRole('button', { name: /^#r/i })
          .filter((row) => row.hasAttribute('aria-expanded')),
      ).toEqual([]);
    });

    /**
     * `runs` is appended when a run *finalizes*, while `status: 'working'` is
     * patched at spawn — so during a run `runs[last]` is the run before this
     * one. Naming it as the live header showed the wrong id, trigger and start
     * time, and hid the previous run's own receipt.
     *
     * Main sends a descriptor for every run in flight now (HIVE-128), so the
     * live row has an identity of its own — and it is still not r17's.
     */
    it('never labels a live run with the previous run’s identity', () => {
      render(<Harness entity={seed(working())} />);

      // r17 is the last *finished* run, so it keeps its receipt…
      expect(screen.getByText(/#r17/)).toBeInTheDocument();
      expect(screen.getByText(/asking/)).toBeInTheDocument();
      // …and the live run is drawn under the id main gave it.
      expect(screen.getByTitle('standing run')).toHaveTextContent('#live-1');
      expect(screen.getByText('running')).toBeInTheDocument();
    });

    it('keeps every finished run’s receipt while another is live', () => {
      render(<Harness entity={seed(working())} />);

      expect(screen.getByText(/#r16/)).toBeInTheDocument();
      expect(screen.getByText(/#r17/)).toBeInTheDocument();
    });

    it('renders the streamed lines', () => {
      const entity = seed({ status: 'working' });
      useHiveStore.getState().appendAgentLines({
        name: 'watcher',
        lines: [
          { text: 'ledger_read {"since":"20260830"}', color: 'dim' },
          { text: '● turn ended — asking · $0.041', color: 'cyan' },
        ],
      });

      render(<Harness entity={entity} />);

      expect(screen.getByText(/● turn ended/)).toBeInTheDocument();
    });

    it('says so plainly when there is nothing yet', () => {
      render(<Harness entity={seed({ runs: [] })} />);

      expect(screen.getByText(/Nothing yet/)).toBeInTheDocument();
    });

    /*
      The receipts and the output are two documents that happened to be stacked
      in one scroll box, and one scrollbar made both unreadable: scrolling back
      through the receipts pushed the output off the bottom, and reading the
      output pushed every receipt out of reach.

      Asserted structurally rather than by scrolling, because happy-dom lays
      nothing out — there is no overflow to observe. What a test *can* pin is
      that the two live in separate scroll containers and that the output's own
      is the one the autoscroll foot sits in.
    */
    it('scrolls the receipts and the output separately', () => {
      const entity = seed({ status: 'working' });
      useHiveStore.getState().appendAgentLines({
        name: 'watcher',
        lines: [{ text: 'still going', color: 'ink' }],
      });

      const { container } = render(<Harness entity={entity} />);

      const receipts = container.querySelector('[data-region="run-receipts"]');
      const output = container.querySelector('[data-region="run-output"]');

      expect(receipts).not.toBeNull();
      expect(output).not.toBeNull();
      expect(receipts).not.toContainElement(output as HTMLElement);
      expect(within(receipts as HTMLElement).getByText(/#r17/)).toBeInTheDocument();
      expect(within(output as HTMLElement).getByText('still going')).toBeInTheDocument();
    });

    /*
      No receipts means no box for them — an empty scroll container would still
      claim its border and its share of the height for nothing.
    */
    it('draws no receipts region for an agent that has never run', () => {
      const { container } = render(<Harness entity={seed({ runs: [] })} />);

      expect(container.querySelector('[data-region="run-receipts"]')).toBeNull();
      expect(container.querySelector('[data-region="run-output"]')).not.toBeNull();
    });
  });

  describe('the ledger column', () => {
    it('shows what passed between the overmind and this agent', () => {
      const entity = seed();
      useHiveStore.getState().hydrateLedger([
        {
          id: '20260830-140000-0001',
          ts: Date.now(),
          from: 'watcher',
          to: 'overmind',
          kind: 'done',
          body: 'Swept 4 mentions.',
        },
        {
          id: '20260830-140000-0002',
          ts: Date.now(),
          from: 'sess-01',
          to: 'overmind',
          kind: 'done',
          body: 'Somebody else entirely.',
        },
      ]);

      render(<Harness entity={entity} />);

      const ledger = screen.getByText('Ledger').parentElement as HTMLElement;

      expect(within(ledger).getByText('Swept 4 mentions.')).toBeInTheDocument();
      expect(
        within(ledger).queryByText('Somebody else entirely.'),
      ).not.toBeInTheDocument();
    });

    /*
      Ordering and the render cap live in `agent-ledger.test.tsx`, the mirror
      file for the component that owns them. What belongs *here* is only that
      the view mounts the column against the right agent — which the test above
      covers.
    */

    it('renders an ask without option buttons, which HIVE-118 owns', () => {
      const entity = seed();
      useHiveStore.getState().hydrateLedger([
        {
          id: '20260830-140000-0001',
          ts: Date.now(),
          from: 'watcher',
          to: 'overmind',
          kind: 'ask',
          ref: 'a71',
          body: 'Retry the deploy?',
        },
      ]);

      render(<Harness entity={entity} />);

      expect(screen.getByText('Retry the deploy?')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /approve/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe('the input', () => {
    it('answers an open ask', async () => {
      const { answer } = bridge();
      render(<Harness entity={seed()} />);

      await userEvent.type(
        screen.getByRole('textbox'),
        'answer a71 approve{Enter}',
      );

      expect(answer).toHaveBeenCalledWith({ thread: 'a71', body: 'approve' });
    });

    it('posts free text as an ask addressed to this agent', async () => {
      const { post } = bridge();
      render(<Harness entity={seed()} />);

      await userEvent.type(
        screen.getByRole('textbox'),
        'check the deploy{Enter}',
      );

      expect(post).toHaveBeenCalledWith({
        to: 'watcher',
        kind: 'ask',
        body: 'check the deploy',
      });
    });

    it('clears the box after posting', async () => {
      bridge();
      render(<Harness entity={seed()} />);

      const box = screen.getByRole('textbox');
      await userEvent.type(box, 'check the deploy{Enter}');

      expect(box).toHaveValue('');
    });

    it('posts nothing on a stray Enter', async () => {
      const { post, answer } = bridge();
      render(<Harness entity={seed()} />);

      await userEvent.type(screen.getByRole('textbox'), '{Enter}');

      expect(post).not.toHaveBeenCalled();
      expect(answer).not.toHaveBeenCalled();
    });

    it('keeps the draft and says why when the write is refused', () => {
      // Clearing before the write is known destroys the message on its way
      // out — the exact failure `agent-input.ts` tightened its matching over.
      const post = vi.fn().mockResolvedValue({
        ok: false,
        status: 413,
        reason: 'That is longer than the ledger accepts.',
      });
      vi.stubGlobal('hive', {
        agents: { run: vi.fn() },
        ledger: { post, answer: vi.fn() },
      });

      render(<Harness entity={seed()} />);

      return userEvent
        .type(screen.getByRole('textbox'), 'check the deploy{Enter}')
        .then(async () => {
          expect(screen.getByRole('textbox')).toHaveValue('check the deploy');
          expect(
            await screen.findByText(/longer than the ledger accepts/),
          ).toBeInTheDocument();
        });
    });

    it('says it speaks as the overmind, which is what main enforces', () => {
      render(<Harness entity={seed()} />);

      expect(screen.getByText(/as the overmind/i)).toBeInTheDocument();
      expect(screen.getByText(/not a terminal/i)).toBeInTheDocument();
    });

    /*
      A refusal and the standing explanation answer the same question — what
      will Enter do — so the true-right-now answer takes the slot rather than
      adding a row beneath it and pushing the log up.
    */
    it('puts a refusal in the hint bar’s place, not beneath it', async () => {
      const { post } = bridge();
      post.mockResolvedValue({ ok: false, reason: 'the ledger is not up' });

      render(<Harness entity={seed()} />);
      await userEvent.type(screen.getByRole('textbox'), 'hello{Enter}');

      expect(
        await screen.findByText('the ledger is not up'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/as the overmind/i)).not.toBeInTheDocument();
    });

    /*
      The console's row, verbatim — same rule above it, same `bg-term-input`,
      same 18px gutters, and the party being addressed as the prompt glyph.
      It used to be a rounded card floating inside the body, which read as a
      widget sitting on the view rather than the surface it is typed into.
    */
    it('names the agent in the prompt, the way the console names the overmind', () => {
      render(<Harness entity={seed()} />);

      expect(screen.getByText('watcher ❯')).toBeInTheDocument();
    });

    /**
     * The placeholder must describe a grammar `parseAgentInput` accepts.
     *
     * It read `a1 <answer> to answer an open ask` first, and there is no bare-ref
     * form — anything not starting with the literal `answer ` falls through to
     * `{ kind: 'ask' }`. So a user following the hint typed `a1 yes`, the write
     * *succeeded* as a new ask addressed to the agent, the box cleared on
     * success, `a1` stayed open, and the agent stayed blocked. Nothing failed,
     * so `notice` had nothing to report.
     *
     * Driven through the real parser rather than string-matched: the property
     * that matters is that the example works, not that it is spelled a
     * particular way.
     */
    it('demonstrates a grammar the parser actually accepts', async () => {
      const { answer, post } = bridge();
      render(<Harness entity={seed()} />);

      const box = screen.getByRole('textbox');
      const shown = box.getAttribute('placeholder') ?? '';
      const example = shown.slice(shown.indexOf('answer '));

      // The placeholder names an example at all.
      expect(example).toMatch(/^answer \S+/);

      await userEvent.type(
        box,
        `${example.replace(/<text>/, 'go ahead')}{Enter}`,
      );

      expect(answer).toHaveBeenCalledWith(
        expect.objectContaining({ thread: 'a1' }),
      );
      expect(post).not.toHaveBeenCalled();
    });
  });
});

describe('a paused agent (HIVE-211)', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    useUiStore.getState().reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads paused in amber, swaps the prompt for the bar, and keeps the draft through resume', async () => {
    const resume = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('hive', { agents: { resume, pause: vi.fn() }, ledger: {} });
    const { rerender } = render(<Harness entity={seed({ status: 'sleeping' })} />);
    await userEvent.type(screen.getByLabelText(/Post to watcher/), 'half a thought');

    rerender(<Harness entity={seed({ status: 'paused' })} />);
    expect(screen.queryByLabelText(/Post to watcher/)).toBeNull();
    expect(screen.getByText('watcher is paused.')).toHaveClass('text-amber-text');
    expect(
      screen.getByText(/Nothing wakes it, not the ledger, not a schedule, until you resume it\. Your draft is kept\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/posts to the ledger as the overmind/)).toBeNull();
    const status = screen.getByText('Status').nextElementSibling;
    expect(status).toHaveClass('text-amber-text');

    await userEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(resume).toHaveBeenCalledWith({ name: 'watcher' });

    rerender(<Harness entity={seed({ status: 'sleeping' })} />);
    expect(screen.getByLabelText(/Post to watcher/)).toHaveValue('half a thought');
  });

  it('a refused resume lands in the notice', async () => {
    const resume = vi.fn().mockRejectedValue(new Error('The agent runtime is not running.'));
    vi.stubGlobal('hive', { agents: { resume, pause: vi.fn() }, ledger: {} });
    render(<Harness entity={seed({ status: 'paused' })} />);

    await userEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(await screen.findByText('The agent runtime is not running.')).toBeInTheDocument();
  });
});
