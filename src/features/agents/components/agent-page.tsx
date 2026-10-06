import { useEffect, useState } from 'react';

import { isAgent } from '@/types/entity';

import { Icon } from '@components/ui/icon';
import { SegmentedControl } from '@components/ui/segmented-control';
import { AgentView } from '@features/agents/components/agent-view';
import { AgentDefinition } from '@features/shared/components/agent-definition';
import { runRefusal } from '@features/shared/components/agent-editor';
import { useAgents } from '@hooks/use-agents';
import { useAgentDraft } from '@stores/editor-store';
import { agentRunQueued, agentRunRefusal, useEntity } from '@stores/hive-store';
import { useAgentPage, useAgentPageActions, type AgentPageView } from '@stores/ui-store';

const VIEWS = [
  { value: 'activity', label: 'Activity' },
  { value: 'definition', label: 'Definition' },
] as const satisfies readonly { value: AgentPageView; label: string }[];

/**
 * One agent's page on the stage (HIVE-204): a header, then Activity or
 * Definition.
 *
 * The header is the agent's identity — its glyph, its name over its
 * description — then the Activity | Definition switch and Run now. Pause and
 * Resume live in the panel row's slot (HIVE-204, PR 2), beside Run now. There
 * is no back button: the page belongs to the Agents place, and the bar and the
 * panels are the navigation. Edit definition is gone,
 * because Definition is one click away on the switch.
 *
 * Run now is in the header so it is in both views, and it stays **enabled**:
 * a refusal is answered with the sentence, under the header on Activity and in
 * the footer on Definition, which is where the run notice has always shown.
 */
export function AgentPage({ name }: { name: string | null }) {
  const page = useAgentPage();
  const { setAgentPageView, openAgentPage, closeAgentPage } = useAgentPageActions();
  const entity = useEntity(name ?? '');
  const agent = entity !== undefined && isAgent(entity) ? entity : undefined;
  const snapshot = useAgents();
  const draft = useAgentDraft(name ?? '');
  const [notice, setNotice] = useState<string | null>(null);
  // A notice about one agent must not be read as being about the next.
  useEffect(() => setNotice(null), [name]);

  const view: AgentPageView = name === null ? 'definition' : (page?.view ?? 'activity');
  /*
    The path `runRefusal` asks about: there is a file on disk exactly when the
    agent has a name. The folder root is only for the sentence's sake — the
    refusal reads whether it is null.
  */
  const path = name === null ? null : `${snapshot?.agentsRoot ?? ''}/${name}/AGENT.md`;
  const refusal = runRefusal(path, draft?.dirty ?? false);

  const runNow = () => {
    if (refusal !== null || name === null) {
      setNotice(refusal);
      return;
    }
    setNotice(null);

    /*
      The wording comes from `agentRunRefusal` and `agentRunQueued`, not from a
      ternary here (HIVE-117): the shared functions switch exhaustively over
      the union, so the next refusal is a compile error rather than a plausible
      sentence. A definition main refused comes back as the runtime's own
      `invalid`, so the header does not need to know the problems.
    */
    void window.hive?.agents
      .run({ name })
      .then((result) => {
        if (result.started) return;
        setNotice('queued' in result ? agentRunQueued(name, result) : agentRunRefusal(name, result));
      })
      .catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : String(cause)));
  };

  return (
    <div className="@container flex min-h-0 flex-1 flex-col" data-view="agent">
      <header className="flex shrink-0 items-center gap-3 border-b border-border-soft bg-panel px-5 py-3">
        <Icon name={agent?.icon ?? 'ph-robot'} size={20} className="shrink-0 text-subtle" />
        <span className="flex max-w-[420px] min-w-0 flex-col">
          <span className="truncate tabular-nums text-ui font-semibold">{name ?? 'New agent'}</span>
          <span className="truncate font-sans text-ui-sm text-muted">{agent?.sub ?? 'not saved yet'}</span>
        </span>
        <span className="flex-1" />
        <SegmentedControl
          label="View"
          options={VIEWS}
          value={view}
          onChange={setAgentPageView}
          disabledValues={name === null ? ['activity'] : undefined}
        />
        {/*
          Native `title`, as the editor's footer button had it: it previews the
          refusal a click would give, and the click still answers with it.
        */}
        <button
          type="button"
          onClick={runNow}
          title={refusal ?? 'Wake this agent once, now.'}
          className="rounded-full border border-edge px-3 py-1 text-control font-semibold text-ink hover:bg-hover"
        >
          Run now
        </button>
      </header>
      {view === 'activity' && agent !== undefined ? (
        <AgentView entity={agent} notice={notice} onNotice={setNotice} />
      ) : (
        <AgentDefinition
          name={name}
          notice={notice}
          onRename={(next) => openAgentPage(next, 'definition')}
          onClose={closeAgentPage}
        />
      )}
    </div>
  );
}
