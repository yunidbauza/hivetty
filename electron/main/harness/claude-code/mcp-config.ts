import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { ContainerFreshness } from '@shared/config-contract';
import { MCP_SERVER_NAME } from '@shared/mcp-contract';

import { hiveServerSpec, type McpConfigOptions } from '../../mcp/config';
import { containerHiveServerSpec, type ResolvedIdentity } from '../../mcp/container-config';

/**
 * The two `--mcp-config` formats a Claude Code session reads (HIVE-112, HIVE-132): the host's
 * stdio file and a container set's HTTP one. The server descriptors stay in `mcp/` because the
 * agent path shares them (HIVE-235).
 */

export const mcpConfig = (options: McpConfigOptions): string =>
  `${JSON.stringify(
    { mcpServers: { [MCP_SERVER_NAME]: hiveServerSpec(options) } },
    null,
    2,
  )}\n`;

/** Write the config, creating its directory if needed. Overwrites. */
export async function writeMcpConfig(
  path: string,
  options: McpConfigOptions,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, mcpConfig(options), 'utf8');
}

export const containerMcpConfig = (
  freshness: ContainerFreshness,
  resolved?: ResolvedIdentity,
): string =>
  `${JSON.stringify(
    {
      mcpServers: {
        [MCP_SERVER_NAME]: containerHiveServerSpec(freshness, resolved),
      },
    },
    null,
    2,
  )}\n`;
