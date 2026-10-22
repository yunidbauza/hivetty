import type { HarnessAdapter } from '../port';

import { writeContainerSet } from './container-files';
import { hookContextReply } from './hook-vocabulary';
import { readHook } from './hooks';
import { createClaudeInstalled } from './installed';
import { launch } from './launch';
import { writeMcpConfig } from './mcp-config';
import { parseMetrics } from './metrics';
import { writePluginDir } from './plugin';
import { promptMarker } from './prompt-marker';
import { createClaudeRecord } from './record';
import { writeAgentSettings, writeHookSettings } from './settings';
import { foldTranscriptLines } from './transcript-edits';

/**
 * Adapter #1. `launch` arrived with HIVE-234, `prepare` with HIVE-235, `readHook` and
 * `contextReply` with HIVE-236, `foldEdits` with HIVE-238, `capabilities`, `meters` and
 * `record` with HIVE-239,
 * `contextDelivery` and `promptMarker` with HIVE-240, `installed` with HIVE-345.
 */
export const claudeCodeAdapter: HarnessAdapter = {
  id: 'claude-code',
  capabilities: { resume: 'by-id', meters: true, contextDelivery: 'prompt-marker' },
  launch,
  prepare: {
    sessionSettings: writeHookSettings,
    agentSettings: writeAgentSettings,
    plugin: writePluginDir,
    containerSet: writeContainerSet,
    mcpConfig: writeMcpConfig,
  },
  readHook,
  contextReply: hookContextReply,
  promptMarker,
  foldEdits: foldTranscriptLines,
  meters: parseMetrics,
  record: createClaudeRecord(),
  installed: createClaudeInstalled(),
};
