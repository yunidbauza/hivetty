/**
 * The filenames of a container set (HIVE-132, HIVE-133), and the origins it is
 * written for.
 *
 * A leaf (HIVE-235): `generated.ts` reaches the Claude Code adapter through the
 * harness registry, and the adapter's `container-files.ts` needs these names,
 * so they live where neither import can close a cycle.
 */

/**
 * Exported, unlike {@link CONTAINER_SCRIPT_FILE} (HIVE-133,
 * post-review fix): `sessions/index.ts` has to name these same two files when
 * it selects `--settings` and `--mcp-config` for a container spawn, and it
 * used to do that with its own hardcoded copies of these strings. Nothing
 * tied the reader's path to the writer's, so a rename here would have drifted
 * silently past every test. The agent-settings and status-line filenames have
 * no such second reader — `writeContainerSession`'s caller never names them —
 * so they stay private.
 */
export const CONTAINER_MCP_FILE = 'hive.mcp.json';
export const CONTAINER_SETTINGS_FILE = 'claude-hooks.settings.json';
/**
 * The agent-space settings file in every set — the one carrying
 * `permissions.ask: ["*"]`. Exported since HIVE-137, because a containerised
 * agent's wake has to name it on its own command line.
 */
export const CONTAINER_AGENT_FILE = 'claude-agent.settings.json';
/**
 * The status line script in every set. Exported for the Claude Code adapter's
 * `container-files.ts`, which writes it (HIVE-235); nothing reads it back.
 */
export const CONTAINER_SCRIPT_FILE = 'statusline.sh';

/** The receiver's URLs, as some host addresses them. */
export interface ContainerOrigins {
  url: string;
  origin: string;
  metricsUrl?: string;
  readyUrl?: string;
}
