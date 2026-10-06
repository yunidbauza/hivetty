import { CaretRight, Plus } from '@phosphor-icons/react';

import { cn } from '@/lib/utils';

import { EmptyState } from '@components/ui/empty-state';
import { AgentRow } from '@features/agents/components/agent-row';
import { useAgentsByGroup } from '@stores/hive-store';
import {
  type AgentGroupKey,
  useAgentPageActions,
  useAgentsFolded,
  useToggleAgentGroup,
} from '@stores/ui-store';

/** Each lane's square, in the colour its rows are asking for attention in. */
const SQUARE: Record<AgentGroupKey, string> = {
  summons: 'bg-amber',
  morphing: 'bg-green',
  burrowed: 'bg-subtle',
};

/**
 * Agents panel — the long-lived background agents, grouped by what they are
 * doing.
 *
 * ## The list comes from disk
 *
 * This panel used to list three seeded agents — a Slack watcher, a PR reviewer,
 * a standup writer — which were a sketch of a feature rather than a feature.
 * Nothing started them, nothing could stop them, and their transcripts were
 * recordings. They went with the rest of the seed, leaving the list genuinely
 * empty and the copy pointing at nothing.
 *
 * Since HIVE-114 there is somewhere to point: `useAgentsSync` mirrors
 * `~/.hive/agents` into the store, so a row here is a real `AGENT.md`.
 *
 * ## Why grouped, and why by state
 *
 * A flat alphabetical list answers "what do I have"; a panel is read to answer
 * "what needs me". Grouping by state puts the second question first — and it
 * is the state, not the name, that changes minute to minute (HIVE-116). Since
 * HIVE-204 the groups are lanes: Summons (needs a person), Morphing (working)
 * and Burrowed (resting), each folding under its own header, with the first two
 * counted again in the panel's header.
 *
 * The ordering rules — asking first, `failed` and invalid filed under Summons,
 * paused after sleeping, empty lanes omitted — all live in `useAgentsByGroup`,
 * so this component renders a decision rather than making one.
 */
export function AgentsPanel() {
  const groups = useAgentsByGroup();
  const folded = useAgentsFolded();
  const toggle = useToggleAgentGroup();
  const { openAgentPage } = useAgentPageActions();

  const count = (key: AgentGroupKey) =>
    groups.find((group) => group.key === key)?.ids.length ?? 0;
  const summons = count('summons');
  const morphing = count('morphing');
  /*
    The way to make another agent: a new agent's page, on Definition
    (HIVE-204). The page owns authoring now, so the panel opens it here
    rather than sending the user to Settings and back. The head's + is the
    only entry; a footer line beside it was the same act twice.
  */
  const newAgent = () => openAgentPage(null, 'definition');

  return (
    <div data-panel="agents" className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-2.5 px-2 pt-2.5 pb-2 text-muted">
        <h2 className="text-ui-lg font-semibold text-ink">Agents</h2>
        <span className="text-ui-sm">
          {summons > 0 ? (
            <span className="text-amber-text">{`${String(summons)} summons`}</span>
          ) : null}
          {summons > 0 && morphing > 0 ? ' · ' : null}
          {morphing > 0 ? (
            <span className="text-green">{`${String(morphing)} morphing`}</span>
          ) : null}
        </span>
        <button
          type="button"
          aria-label="New agent"
          onClick={newAgent}
          className="ml-auto self-center rounded-full p-1.5 text-muted hover:bg-hover hover:text-ink"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      </div>

      {groups.length === 0 ? (
        <EmptyState phrase="empty.agents" creature="mutalisk">
          No agents yet.
        </EmptyState>
      ) : (
        groups.map((group) => (
          <section
            key={group.key}
            aria-label={group.label}
            className="mb-2.5 flex flex-col gap-0.5"
          >
            <button
              type="button"
              aria-expanded={!folded[group.key]}
              onClick={() => toggle(group.key)}
              className="flex items-center gap-2 px-1.5 pt-2.5 pb-1.5 text-ui-sm font-semibold tracking-[0.06em] text-subtle uppercase"
            >
              <CaretRight
                size={12}
                aria-hidden="true"
                className={folded[group.key] ? '' : 'rotate-90'}
              />
              <span
                aria-hidden="true"
                className={cn('size-[9px] rounded-xs', SQUARE[group.key])}
              />
              {group.label}
              <span className="font-medium text-subtle">{group.ids.length}</span>
            </button>

            {folded[group.key]
              ? null
              : group.ids.map((id) => <AgentRow key={id} id={id} />)}
          </section>
        ))
      )}

    </div>
  );
}
