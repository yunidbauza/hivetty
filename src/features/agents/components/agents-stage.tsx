import { Robot } from '@phosphor-icons/react';

import { Button } from '@components/ui/button';
import { CombGlyph } from '@components/ui/comb-glyph';
import { EmptyPlace } from '@components/ui/empty-place';
import { AgentPage } from '@features/agents/components/agent-page';
import { useShownAgent } from '@features/agents/shown-agent';
import { useAgentsListed } from '@stores/hive-store';
import { useAgentPageActions } from '@stores/ui-store';

/**
 * The Agents place's stage (HIVE-204): the shown agent's page (`useShownAgent`:
 * the last one, else the next, else the first), or "Pick an agent" when none is — Work's empty shape, for the same reason: the place
 * owns the stage either way, and an empty stage that says what to do beats
 * the Overmind showing through. With no agent defined it says how to make
 * the first one (HIVE-211).
 *
 * Keyed by the agent, so moving to another one remounts the page: its notice,
 * and the editor's per-field state, belong to the agent they were about.
 */
export function AgentsStage() {
  const name = useShownAgent();
  const listed = useAgentsListed();
  const { openAgentPage } = useAgentPageActions();

  if (name === undefined) {
    if (!listed) {
      return (
        <EmptyPlace
          label="Agents"
          glyph={<CombGlyph icon={Robot} />}
          title="No agents yet"
          actions={
            <Button variant="primary" onClick={() => openAgentPage(null, 'definition')}>
              New agent
            </Button>
          }
        >
          An agent is a headless Claude that Hive TTY wakes on the ledger or a schedule. Define one and it lists here.
        </EmptyPlace>
      );
    }
    return (
      <section aria-label="Agents" className="flex flex-1 items-center justify-center">
        <p className="text-ui text-subtle">Pick an agent</p>
      </section>
    );
  }

  return <AgentPage key={name ?? 'new'} name={name} />;
}
