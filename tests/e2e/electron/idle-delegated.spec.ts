import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import {
  HOOK_ENV_RECEIVER_URL,
  HOOK_ENV_SESSION,
  HOOK_ENV_TOKEN,
  HOOK_HEADER_SESSION,
  HOOK_HEADER_TOKEN,
  HOOK_PATH,
} from '../../../electron/shared/hook-contract';
import { LEDGER_POST_PATH } from '../../../electron/shared/ledger-contract';
import { goToOvermind, overmindNewSession } from '../fixtures/places';
import { launchHive } from './fixtures/hive-app';

/**
 * A quiet session with an agent on its work reads `idle (sweeper)`.
 *
 * The whole path no unit test holds: the session's own ask, posted with its
 * own credentials, reaches main's ledger, the mirror, and the status cell,
 * beside a status that Claude Code's hooks set. The agent is the spec's own,
 * with no ledger wake (and nothing shipped is seeded), so the ask wakes nobody.
 */
const PROJECT = 'nova-web';
const REAL_DIRECTORY = join(import.meta.dirname, '../../..');
const AGENT = `---
name: sweeper
description: Sweeps when asked
icon: Ghost
---
Sweep the channel.
`;

const readMarker = (path: string): string | null => (existsSync(path) ? readFileSync(path, 'utf8').trim() : null);

async function shell(page: Page, sessionId: string, command: string): Promise<void> {
  await page.evaluate(([id, data]) => window.hive!.pty.write({ sessionId: id!, data: data! }), [sessionId, `${command}\n`]);
}

/** A POST from the session's own shell, with its own credentials; the HTTP code lands in `marker`. */
const curl = (path: string, payload: unknown, marker: string): string =>
  `curl -sS -m 5 -o /dev/null -w '%{http_code}' -X POST "$${HOOK_ENV_RECEIVER_URL}${path}"` +
  ` -H "${HOOK_HEADER_SESSION}: $${HOOK_ENV_SESSION}"` +
  ` -H "${HOOK_HEADER_TOKEN}: $${HOOK_ENV_TOKEN}"` +
  ` -H "content-type: application/json"` +
  ` --data-binary '${JSON.stringify(payload)}'` +
  ` > '${marker}'`;

test('a quiet session whose ask an agent holds reads idle (sweeper), with who in its title', async ({}, testInfo) => {
  test.setTimeout(90_000);
  const configPath = testInfo.outputPath('hive-config.json');
  const bootDir = testInfo.outputPath('.');
  const folder = join(dirname(configPath), 'agents', 'sweeper');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'AGENT.md'), AGENT);
  writeFileSync(
    configPath,
    JSON.stringify({
      version: 2,
      shell: '/bin/sh',
      claudeCommand: `printf bootstrapped > '${bootDir}/boot-'"$${HOOK_ENV_SESSION}"; false`,
      projects: [{ id: PROJECT, name: PROJECT, path: REAL_DIRECTORY, icon: 'ph-cube' }],
    }),
  );
  const app = await launchHive({ userDataDir: testInfo.outputPath('user-data'), configPath, unseeded: true });
  const page = await app.firstWindow();
  let posts = 0;
  const post = async (session: string, path: string, payload: unknown, code: string) => {
    posts += 1;
    const marker = testInfo.outputPath(`posted-${String(posts)}.txt`);
    await shell(page, session, curl(path, payload, marker));
    await expect.poll(() => readMarker(marker), { timeout: 15_000 }).toBe(code);
  };

  try {
    await page.waitForSelector('nav[aria-label="Places"]');
    await goToOvermind(page);
    await overmindNewSession(page).click();
    await page.keyboard.type(PROJECT);
    await page.keyboard.press('Enter');
    const terminal = page.locator('[data-terminal-id^="sess-"]').last();
    await expect(terminal).toBeVisible();
    const session = await terminal.getAttribute('data-terminal-id');
    if (session === null) throw new Error('the spawned session has no terminal id');
    await expect.poll(() => readMarker(join(bootDir, `boot-${session}`)), { timeout: 15_000 }).toBe('bootstrapped');

    // A turn, then its Stop: the session is idle, as the hooks say.
    await post(session, HOOK_PATH, { hook_event_name: 'UserPromptSubmit' }, '204');
    await post(session, HOOK_PATH, { hook_event_name: 'Stop' }, '204');
    await goToOvermind(page);
    const status = page.getByTestId('session-row').filter({ hasText: session }).locator('[data-col="status"]');
    await expect(status).toHaveText('idle');

    // It hands a job to the agent: still idle, and now says who has it.
    await post(session, LEDGER_POST_PATH, { to: 'sweeper', kind: 'ask', body: 'Sweep HIVE-1', meta: { ticket: 'HIVE-1' } }, '200');
    await expect(status).toHaveText('idle (sweeper)');
    await expect(status).toHaveAttribute('title', 'Waiting on sweeper');
  } finally {
    await app.close();
  }
});
