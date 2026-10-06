import { useEffect, useRef, useState } from 'react';

import {
  deleteAgent,
  frontmatterName,
  loadAgents,
  nameProblem,
  readAgent,
  renameAgent,
  saveAgent,
  templateFor,
} from '@/lib/agents';
import {
  keepShippedMine,
  loadShipped,
  resetShipped,
  takeShippedPrompt,
} from '@/lib/shipped';

import { AgentEditor } from '@features/shared/components/agent-editor';
import { InlineConfirm } from '@features/shared/components/inline-confirm';
import { HeldBanner, ShippedStrip } from '@features/shared/components/shipped-marker';
import { useAgents } from '@hooks/use-agents';
import { useShipped } from '@hooks/use-shipped';
import type { AgentProblem } from '@shared/agent-contract';
import { useAgentDraft, useAgentDraftActions } from '@stores/editor-store';

interface AgentDefinitionProps {
  /** The agent, or `null` for a new one never saved. */
  name: string | null;
  /** The page's run notice (the header owns Run now); drawn in the footer. */
  notice: string | null;
  /** A save that renamed landed: show the agent under its new name. */
  onRename: (name: string) => void;
  /** The agent was deleted, or a never-saved one discarded: nothing is left to show. */
  onClose: () => void;
  /** Form and Source side by side (the agent page) or behind tabs (Settings). */
  layout?: 'split' | 'tabs';
}

/**
 * One agent's `AGENT.md`, on the agent page's Definition view (HIVE-204) and
 * in Settings › Agents. What rename and delete open is the caller's to say.
 *
 * What Settings › Agents did for the agent it had open, moved here when the
 * editor left Settings: the read on open, the name check, save, rename, delete,
 * and the shipped strip and held banner. Three things changed on the way:
 *
 * 1. **The buffer lives in editor-store**, keyed by name (`''` for the new
 *    agent), so leaving the page — another agent, another place — loses
 *    nothing and asks nothing. Revert is the only discard, which is why the
 *    discard guard Settings carried is gone.
 * 2. **Run now is the page header's**, in both views, so this component only
 *    draws the notice it is handed.
 * 3. **Delete hands back to the caller** (`onClose`): the page closes, Settings
 *    empties its detail pane.
 *
 * The rules each step keeps are the ones `agents-section.tsx` spelled out:
 * refusals are structured (`AgentWriteResult` names a field per problem), and a
 * rename is one call carrying the buffer, so the definition validated is the
 * one about to be written.
 */
export function AgentDefinition({ name, notice, onRename, onClose, layout = 'split' }: AgentDefinitionProps) {
  const snapshot = useAgents();
  const key = name ?? '';
  const draft = useAgentDraft(key);
  const { loadAgentDraft, editAgentDraft, moveAgentDraft, dropAgentDraft } = useAgentDraftActions();

  const [pending, setPending] = useState<{
    question: string;
    detail: string;
    confirmLabel: string;
    act: () => void;
  } | null>(null);
  /** What main refused, field by field. Cleared on every fresh attempt. */
  const [problems, setProblems] = useState<AgentProblem[]>([]);
  /**
   * What a shipped-strip verb answered when main refused it. Its own channel,
   * beside the page's run notice, for the reason Settings kept the two apart
   * from `problems`: it is transient and must not latch.
   */
  const [ownNotice, setOwnNotice] = useState<string | null>(null);

  useEffect(() => {
    void loadAgents();
  }, []);

  /*
    What the user changed in the agents the app ships. Asked again whenever the
    snapshot changes, which is every save and every edit made outside the app,
    so the strip follows the file rather than the last launch.
  */
  const shipped = useShipped('agents');
  useEffect(() => {
    void loadShipped();
  }, [snapshot]);

  const agents = snapshot?.agents ?? [];
  /**
   * Names already spoken for, excluding the one being edited.
   *
   * Invalid ones count, for the reason the skills pane learned: they are
   * folders on disk with an AGENT.md in them, so saving under one of their
   * names overwrites a real file — and the likeliest invalid agent is one
   * whose frontmatter name and folder disagree, which is exactly the name the
   * user is then likely to type.
   */
  const allNames = agents.map((agent) => agent.name);
  const taken = allNames.filter((other) => other !== name);

  /**
   * The name a read was started for. A read that resolves after the page has
   * moved to another agent is dropped — two quick row clicks race, and
   * whichever resolved last would otherwise land one agent's file under the
   * other's name.
   */
  const current = useRef(name);
  current.current = name;

  useEffect(() => {
    setProblems([]);
    setOwnNotice(null);
    if (name === null) return;

    void readAgent(name).then((source) => {
      if (current.current !== name) return;
      if (source === null) {
        /*
          The folder is on disk but the IPC guard refuses to address it — an
          upper-case or reserved folder name. Saying so beats the silence of an
          editor stuck on its placeholder with nothing to explain why.
        */
        setProblems([
          {
            field: '',
            reason:
              'This folder cannot be opened. Rename it on disk to lowercase letters, digits and dashes.',
          },
        ]);
        return;
      }
      loadAgentDraft(name, source);
    });
  }, [name, loadAgentDraft]);

  /*
    A new agent starts from the template, seeded from every name on disk —
    `allNames`, not `taken`, though for a never-saved agent the two agree.
    Only once the list has arrived, so the seed cannot draw a name already
    held, and only when no draft exists: a new agent left half-written is kept.

    Asked on opening, not whenever the draft goes missing: Save and Delete drop
    the `''` draft on their way off the page, and reseeding behind them would
    leave a phantom new agent for the next visit. The names and the draft go
    through refs for that reason — they are read at seeding, not watched.
  */
  const names = useRef(allNames);
  names.current = allNames;
  const hasDraft = useRef(draft !== undefined);
  hasDraft.current = draft !== undefined;
  const listed = snapshot !== null;
  useEffect(() => {
    if (name === null && listed && !hasDraft.current) editAgentDraft('', templateFor(names.current));
  }, [name, listed, editAgentDraft]);

  const text = draft?.text ?? null;
  const dirty = draft?.dirty ?? false;
  const typed = text === null ? '' : frontmatterName(text);
  const localProblem = text === null ? null : nameProblem(typed, taken);

  /*
    What the editor shows: the local name check first, then whatever main last
    refused. The local one comes first because it is the only problem the page
    can know before asking, and it is by far the most common.
  */
  const shown: AgentProblem[] =
    localProblem === null ? problems : [{ field: 'name', reason: localProblem }, ...problems];

  const save = (): void => {
    if (text === null || localProblem !== null) return;

    setProblems([]);
    setOwnNotice(null);

    void (async () => {
      /*
        A rename carries the buffer, so it is one operation rather than a move
        followed by a write. Moving first and writing after validated the
        *stale* file: fixing a broken definition and renaming it in the same
        edit was refused with problems the user had already resolved.
      */
      const result =
        name !== null && name !== typed
          ? await renameAgent(name, typed, text)
          : await saveAgent(typed, text);

      if (!result.ok) {
        setProblems(result.problems);
        return;
      }

      if (name !== typed) {
        moveAgentDraft(key, typed);
        loadAgentDraft(typed, text);
        onRename(typed);
        return;
      }
      loadAgentDraft(typed, text);
    })();
  };

  /**
   * Reset, take the shipped prompt, or keep mine, then re-read the file: the
   * first two rewrite it underneath the editor. Only offered while the draft is
   * clean, so there is nothing typed to lose.
   */
  const resolveShipped = (verb: typeof resetShipped): void => {
    if (name === null) return;

    setOwnNotice(null);
    void verb({ kind: 'agents', name }).then(async (refusal) => {
      if (refusal !== null) {
        setOwnNotice(refusal);
        return;
      }

      const source = await readAgent(name);
      if (current.current !== name || source === null) return;
      loadAgentDraft(name, source);
    });
  };

  const remove = (): void => {
    if (name === null) {
      // Never written, so there is nothing to delete — just close it.
      dropAgentDraft('');
      onClose();
      return;
    }

    setPending({
      question: `Delete ${name}?`,
      detail: 'The folder and its AGENT.md are removed from disk.',
      confirmLabel: 'Delete',
      act: () => {
        void deleteAgent(name).then((result) => {
          if (!result.ok) {
            setProblems(result.problems);
            return;
          }
          dropAgentDraft(name);
          onClose();
        });
      },
    });
  };

  const revert = (): void => {
    if (draft === undefined) return;
    if (draft.saved !== null) {
      editAgentDraft(key, draft.saved);
      return;
    }
    // Never saved: back to a fresh template.
    editAgentDraft('', templateFor(allNames));
  };

  /*
    No snapshot is the browser demo, which has no bridge to ask and no disk to
    write to — a page of dead controls teaches the user the app is broken.
  */
  if (!snapshot) {
    return (
      <div className="flex flex-1 items-center justify-center px-5 py-4">
        <p className="text-ui text-subtle">Background agents are only available in the desktop app.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {name === null || dirty ? null : (
        <>
          <ShippedStrip
            status={shipped.get(name)}
            onReset={() => resolveShipped(resetShipped)}
            onKeepMine={() => resolveShipped(keepShippedMine)}
          />
          <HeldBanner
            status={shipped.get(name)}
            onTake={() => resolveShipped(takeShippedPrompt)}
            onKeep={() => resolveShipped(keepShippedMine)}
          />
        </>
      )}
      {/*
        Keyed by the agent, so moving to another agent remounts the editor
        rather than re-rendering it with a different buffer. The form holds
        per-field state that is only meaningful for the agent it was typed into.
        `+new` is no agent's name (names are lowercase, digits and dashes), so an agent called `new` gets its own.
      */}
      <AgentEditor
        key={name ?? '+new'}
        path={name === null ? null : `${snapshot.agentsRoot}/${name}/AGENT.md`}
        source={text ?? ''}
        dirty={dirty}
        taken={taken}
        problems={shown}
        onChange={(next) => editAgentDraft(key, next)}
        onSave={save}
        onDelete={remove}
        onRevert={revert}
        notice={notice ?? ownNotice}
        actionsHidden={pending !== null}
        layout={layout}
      />

      {pending === null ? null : (
        <InlineConfirm
          label={pending.question}
          title={pending.question}
          confirmLabel={pending.confirmLabel}
          className="border-t border-border-soft"
          cancelLabel="Keep editing"
          escape="document"
          onConfirm={() => {
            pending.act();
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        >
          {pending.detail}
        </InlineConfirm>
      )}
    </div>
  );
}
