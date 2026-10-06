import { useEffect, useState } from 'react';

import { useSwarmPhrase } from '@/hooks/use-swarm-phrase';
import { loadAgents } from '@/lib/agents';
import { loadShipped } from '@/lib/shipped';
import { cn } from '@/lib/utils';

import { Button } from '@components/ui/button';
import { Icon } from '@components/ui/icon';
import { SwarmCreature } from '@components/ui/swarm-creature';
import { SettingsSectionHeader } from '@features/settings/components/settings-section-header';
import { AgentDefinition } from '@features/shared/components/agent-definition';
import { ShippedDot } from '@features/shared/components/shipped-marker';
import { useAgents } from '@hooks/use-agents';
import { useShipped } from '@hooks/use-shipped';

/**
 * The Agents section of settings (HIVE-114): the list, New agent, and the
 * editor beside them.
 *
 * Settings edits in place, with Form | Source tabs: its detail pane is too
 * narrow for the two side by side. The agent page shows the same editor
 * (`features/shared`) side by side, and both edit the one editor-store draft,
 * so an edit made in one shows in the other. A row opens its agent here and New
 * agent a never-saved one; neither leaves Settings. The list keeps what it
 * always said about each agent: its glyph, its name, the shipped dot and its
 * state.
 *
 * A broken definition's row is not disabled — unlike an invalid skill's. The
 * folder names it, so there is always a file to open, and the user has to be
 * able to open it to fix the key they were told about.
 */
export function AgentsSection() {
  const snapshot = useAgents();
  const phrase = useSwarmPhrase('empty.settingsSkills');

  /** The agent open beside the list: a name, `null` for a never-saved one, or nothing open. */
  const [open, setOpen] = useState<{ name: string | null } | null>(null);

  useEffect(() => {
    void loadAgents();
  }, []);

  /*
    What the user changed in the agents the app ships. Asked again whenever the
    snapshot changes, which is every save and every edit made outside the app,
    so the dot follows the file rather than the last launch.
  */
  const shipped = useShipped('agents');
  useEffect(() => {
    void loadShipped();
  }, [snapshot]);

  const agents = snapshot?.agents ?? [];
  const empty = agents.length === 0;

  const newAgent = (): void => setOpen({ name: null });

  const description =
    'Background agents that wake on a schedule or a message and correspond through the ledger. Saved as AGENT.md under ~/.hive/agents.';

  /*
    No snapshot is the browser demo, which has no bridge to ask and no disk to
    write to — the same header-only shape `skills-section.tsx` uses, and for
    the same reason: a pane of dead controls teaches the user the app is broken.
  */
  if (!snapshot) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-4">
        <SettingsSectionHeader
          title="Agents"
          description="Background agents are only available in the desktop app."
        />
      </div>
    );
  }

  /*
    Once something is open the list-and-editor layout draws even with no
    agents, so a first agent can be written here.
  */
  if (empty && open === null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4">
        <SettingsSectionHeader title="Agents" description={description} />

        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-6 text-center">
          <SwarmCreature creature="mutalisk" size={120} className="mb-9" />
          <span className="text-ui-sm text-muted">{phrase}</span>
          <span className="text-ui-sm text-subtle">
            Write one and it will be listed here, asleep until the waker lands.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            onClick={newAgent}
            className="w-fit"
          >
            + New agent
          </Button>

        </div>

        <p className="mt-auto pt-2 text-micro text-subtle">
          Agents folder: {snapshot.agentsRoot}
        </p>
      </div>
    );
  }

  return (
    <div className="@container flex min-h-0 flex-1 flex-col gap-3.5 overflow-hidden px-5 py-4">
      <SettingsSectionHeader title="Agents" description={description} />

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,10rem)_minmax(0,1fr)] gap-3 @min-[520px]:grid-cols-[190px_minmax(0,1fr)] @min-[520px]:grid-rows-1">
        <div className="flex min-h-0 flex-col overflow-y-auto rounded-lg border border-border">
          {agents.map((agent) => {
            const broken = agent.invalid !== undefined;
            const active = open?.name === agent.name;

            return (
              <button
                key={agent.name}
                type="button"
                onClick={() => setOpen({ name: agent.name })}
                aria-current={active ? 'true' : undefined}
                title={broken ? agent.invalid : undefined}
                /*
                  Not `justify-between`. The identity is one group pinned left —
                  glyph then name — and the status is what floats to the far edge.
                */
                className={cn(
                  'flex items-center gap-2 border-b border-border-soft px-2.5 py-1.5 text-left text-control last:border-b-0 hover:bg-hover hover:text-ink',
                  active ? 'bg-hover text-ink' : 'text-muted',
                )}
              >
                {/*
                  The agent's own glyph, from `icon:` in its frontmatter, already
                  on `AgentSummary`. It is what makes the list scannable rather
                  than read: a fleet of five agents is five shapes before it is
                  five names.
                */}
                <Icon name={agent.icon} size={14} className="shrink-0 text-brand" />
                <span className="truncate tabular-nums">{agent.name}</span>
                <ShippedDot status={shipped.get(agent.name)} />
                {broken ? (
                  <span className="ml-auto shrink-0 text-micro text-amber-text">invalid</span>
                ) : (
                  <span
                    className="ml-auto shrink-0 text-micro text-subtle"
                    title={
                      agent.wake.everyMs === undefined && agent.wake.on.length === 0
                        ? 'Manual only — no schedule and no triggers.'
                        : undefined
                    }
                  >
                    {agent.status}
                  </span>
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={newAgent}
            className="border-t border-border-soft px-2.5 py-1.5 text-left tabular-nums text-control text-brand hover:bg-hover"
          >
            + New agent
          </button>
        </div>

        {open === null ? (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-ui-sm text-subtle">
            Select an agent, or write a new one.
          </div>
        ) : (
          <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border">
            <AgentDefinition
              key={open.name ?? '+new'}
              name={open.name}
              notice={null}
              layout="tabs"
              onRename={(name) => setOpen({ name })}
              onClose={() => setOpen(null)}
            />
          </div>
        )}
      </div>

      <p className="text-micro text-subtle">
        Agents folder: {snapshot.agentsRoot}
      </p>
    </div>
  );
}
