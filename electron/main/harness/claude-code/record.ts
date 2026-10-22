import { homedir } from 'node:os';

import type { HarnessRecord } from '../port';

import { nameFromTitle } from './title';
import { createTitleOriginReader, transcriptPath } from './title-origin';

/**
 * Claude Code's record (HIVE-239): its transcripts under `~/.claude/projects`, and the
 * `custom-title` / `ai-title` lines in them. `home` is the test seam the moved callers
 * already had.
 */
export function createClaudeRecord(home: string = homedir()): HarnessRecord {
  const origins = createTitleOriginReader({ home });
  return {
    transcriptPath: (cwd, sessionUuid) => transcriptPath(home, cwd, sessionUuid),
    hasTranscript: (cwd, sessionUuid) => transcriptPath(home, cwd, sessionUuid) !== null,
    titleOrigin: (cwd, sessionUuid, name) => origins.classify(cwd, sessionUuid, name),
    nameFromTitle,
  };
}
