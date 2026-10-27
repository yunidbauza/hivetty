// @vitest-environment node
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The stdio MCP host as `claude` really runs it (HIVE-354): the built
 * `out/main/mcp-host.js` under Electron's own Node, `ELECTRON_RUN_AS_NODE=1`.
 *
 * Vitest runs on the PATH Node, whose `readline` does not break lines on
 * U+2028/U+2029; Electron's does. A request carrying either was cut in two,
 * both halves were skipped as unparseable, and the CLI waited 1800s for a
 * reply that never came. Only this runtime can show it.
 *
 * Gated behind `HIVE_LIVE_MCP_HOST_PROOF=1` (`pnpm test:mcp-host`, which builds
 * first). Needs no `claude` and no receiver: started outside The Hive, the
 * host answers every tool call it parsed with "the ledger is not reachable",
 * and an answer is all this asserts.
 */

const RUN = process.env['HIVE_LIVE_MCP_HOST_PROOF'] === '1';

const approve = (id: number, command: string): string =>
  JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name: 'approve', arguments: { tool_name: 'Bash', input: { command } } },
  });

describe.skipIf(!RUN)('the built MCP host, under Electron', () => {
  it('answers every request, U+2028 and U+2029 included', async () => {
    const electron = createRequire(import.meta.url)('electron') as unknown as string;
    const child = spawn(electron, [join(process.cwd(), 'out', 'main', 'mcp-host.js')], {
      env: {
        PATH: process.env['PATH'] ?? '',
        ELECTRON_RUN_AS_NODE: '1',
        HIVE_GRANTS: '["Bash"]',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const answered = new Set<number>();
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      out += chunk;
      for (const line of out.split('\n').slice(0, -1)) {
        const id = (JSON.parse(line) as { id?: unknown }).id;
        if (typeof id === 'number') answered.add(id);
      }
      out = out.slice(out.lastIndexOf('\n') + 1);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString('utf8');
    });

    const requests = [
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'live', version: '0' } },
      }),
      approve(2, 'echo plain'),
      approve(3, 'echo a\u2028b'),
      approve(4, 'echo c\u2029d'),
      approve(5, 'echo after'),
    ];
    child.stdin.write(`${requests.join('\n')}\n`);

    const deadline = Date.now() + 5_000;
    while (answered.size < 5 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    child.kill();

    expect(err).not.toMatch(/unparseable/);
    expect([...answered].sort()).toEqual([1, 2, 3, 4, 5]);
  }, 20_000);
});
