import type { HarnessAdapter } from '../port';

import { writeContainerSet } from './container-files';
import { hookContextReply } from './hook-vocabulary';
import { readHook } from './hooks';
import { launch } from './launch';
import { writeMcpConfig } from './mcp-config';
import { writePluginDir } from './plugin';
import { writeAgentSettings, writeHookSettings } from './settings';

/**
 * Adapter #1. `launch` arrived with HIVE-234, `prepare` with HIVE-235, `readHook` and
 * `contextReply` with HIVE-236; later stories add the rest.
 */
export const claudeCodeAdapter: HarnessAdapter = {
  id: 'claude-code',
  capabilities: {},
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
};
