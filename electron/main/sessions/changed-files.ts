/**
 * Every session's changed files, read from its own transcript (HIVE-201).
 *
 * A main-agent edit's PostToolUse says only that something changed; the
 * transcript says exactly what; its format is the adapter's (`foldEdits`).
 * So main reads the transcript itself, from where the last read stopped.
 */
import { open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, relative } from 'node:path';

import type { ChangedFile, ChangedFilesEvent, ChangedFilesSnapshot } from '@shared/changed-files-contract';
import { CH } from '@shared/ipc-contract';

import type { FileTally, HarnessAdapter } from '../harness/port';
import { sessionAdapter } from '../harness/registry';

import { transcriptPath } from './title-origin';

export type { FileTally };

export interface ChangedFiles {
  /** A main-agent edit landed: re-read the transcript from where the last read stopped. Never rejects. */
  onFileTool(entityId: string): Promise<void>;
  list(): ChangedFilesSnapshot;
  /** The session ended: publish `files: []` if it had any, and forget it. */
  drop(entityId: string): void;
}

interface SessionState {
  uuid: string;
  offset: number;
  tallies: Map<string, FileTally>;
  published: ChangedFile[];
}

/**
 * The changed-files reader (HIVE-201): one incremental read per main-agent
 * edit, serialised per session, publishing the whole list on
 * `CH.changedFilesChanged` only when it changed.
 */
export function createChangedFiles({
  send,
  home = homedir(),
  transcriptOf,
  rootOf,
  /** The harness that wrote the session's transcript (HIVE-238). Phase 1: Claude Code. */
  adapterOf = () => sessionAdapter(),
}: {
  send: (channel: string, payload: unknown) => void;
  home?: string;
  /** The session's live transcript, from the receiver's `transcripts` map. */
  transcriptOf: (entityId: string) => { cwd: string; sessionUuid: string } | undefined;
  /** The Files tree's root, absolute and realpath'd; `null` with no project. */
  rootOf: (entityId: string) => Promise<string | null>;
  adapterOf?: (entityId: string) => HarnessAdapter;
}): ChangedFiles {
  const sessions = new Map<string, SessionState>();
  /** One read in flight per session; a trigger during it chains behind it. */
  const queues = new Map<string, Promise<void>>();
  /** Bumped by `drop`: a read triggered before it, or still in flight, is stale and publishes nothing. */
  const generations = new Map<string, number>();
  const generationOf = (entityId: string): number => generations.get(entityId) ?? 0;

  async function publish(entityId: string, state: SessionState): Promise<void> {
    const root = await rootOf(entityId);
    if (root === null || sessions.get(entityId) !== state) return;
    const files: ChangedFile[] = [];
    for (const [absolute, tally] of state.tallies) {
      const path = relative(root, absolute);
      // Outside the tree's root: the fs seam would refuse to open it anyway.
      if (path === '' || path.startsWith('..') || isAbsolute(path)) continue;
      files.push({ path, ...tally });
    }
    if (JSON.stringify(files) === JSON.stringify(state.published)) return;
    state.published = files;
    send(CH.changedFilesChanged, { entityId, files } satisfies ChangedFilesEvent);
  }

  async function readNew(entityId: string, generation: number): Promise<void> {
    if (generationOf(entityId) !== generation) return;
    const transcript = transcriptOf(entityId);
    if (transcript === undefined) return;
    const path = transcriptPath(home, transcript.cwd, transcript.sessionUuid);
    if (path === null) return;
    let state = sessions.get(entityId);
    if (state === undefined) {
      state = { uuid: transcript.sessionUuid, offset: 0, tallies: new Map(), published: [] };
      sessions.set(entityId, state);
    } else if (state.uuid !== transcript.sessionUuid) {
      // `/clear`: a new conversation, a new file. The list carries across (D9).
      state.uuid = transcript.sessionUuid;
      state.offset = 0;
    }
    const handle = await open(path, 'r');
    let text: string;
    try {
      const { size } = await handle.stat();
      if (size <= state.offset) return;
      const buffer = Buffer.alloc(size - state.offset);
      await handle.read(buffer, 0, buffer.length, state.offset);
      // Only up to the last newline: a torn last line is the writer mid-append, not a record.
      const end = buffer.lastIndexOf(0x0a);
      if (end === -1) return;
      text = buffer.subarray(0, end).toString('utf8');
      state.offset += end + 1;
    } finally {
      await handle.close();
    }
    if (sessions.get(entityId) !== state) return;
    adapterOf(entityId).foldEdits(state.tallies, text.split('\n'));
    await publish(entityId, state);
  }

  return {
    onFileTool(entityId) {
      const generation = generationOf(entityId);
      const next = (queues.get(entityId) ?? Promise.resolve())
        .then(() => readNew(entityId, generation))
        .catch((cause: unknown) => {
          // An unreadable transcript skips this read; the offset stays, so the next edit retries.
          console.warn(`[hive] changed files not read (${entityId}):`, cause);
        });
      queues.set(entityId, next);
      return next;
    },
    list: () => ({
      sessions: [...sessions]
        .filter(([, state]) => state.published.length > 0)
        .map(([entityId, state]) => ({ entityId, files: state.published })),
    }),
    drop(entityId) {
      const state = sessions.get(entityId);
      sessions.delete(entityId);
      generations.set(entityId, generationOf(entityId) + 1);
      if (state !== undefined && state.published.length > 0) {
        send(CH.changedFilesChanged, { entityId, files: [] } satisfies ChangedFilesEvent);
      }
    },
  };
}
