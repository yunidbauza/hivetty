/**
 * The `--mcp-config` file every Hive session is launched with (HIVE-112).
 */

export interface McpConfigOptions {
  /**
   * The app's own binary — `process.execPath`.
   *
   * Not a system `node`, and not optional. The host is loaded out of
   * `app.asar` in a packaged build, and only Electron's patched `fs` can read
   * it; a plain `node` would fail to resolve the script at all.
   */
  execPath: string;
  /** Absolute path to the built `mcp-host.js`. */
  scriptPath: string;
}

/**
 * The hive server's own descriptor, extracted so `agent-config.ts` can write
 * it into a per-agent file too (HIVE-123) — the shared `hive.mcp.json` and an
 * agent's own file must never define this server two different ways.
 */
export const hiveServerSpec = ({ execPath, scriptPath }: McpConfigOptions) => ({
  command: execPath,
  args: [scriptPath],
  /*
    Without this the Electron binary boots Chromium and opens a window
    instead of running the script. Verified against the real CLI: an `env`
    block in this file does reach the server process.
  */
  env: { ELECTRON_RUN_AS_NODE: '1' },
});
