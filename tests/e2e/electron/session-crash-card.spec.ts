import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { goToOvermind, overmindNewSession } from '../fixtures/places';
import { launchHive, writeProjectConfig } from './fixtures/hive-app';

/**
 * A session killed in front of you keeps its ended card (6 Oct 2026).
 *
 * `/exit` leaves for the Overmind (#107, `narrow-stage.spec.ts` holds that
 * half). A process that dies by a signal is nobody's choice, so the stage
 * stays on it and the card says why: main's `sessionLost` reaches the
 * renderer before the `terminated` status, through the real pty host.
 */
const PROJECT = 'nova-web';
const REAL_DIRECTORY = join(import.meta.dirname, '../../..');

async function shell(page: Page, sessionId: string, command: string): Promise<void> {
  await page.evaluate(([id, data]) => window.hive!.pty.write({ sessionId: id!, data: data! }), [sessionId, `${command}\n`]);
}

test('a session whose shell is killed stays on stage, with the card saying why', async ({}, testInfo) => {
  const configPath = testInfo.outputPath('hive-config.json');
  writeProjectConfig(configPath, { id: PROJECT, path: REAL_DIRECTORY });
  const app = await launchHive({ userDataDir: testInfo.outputPath('user-data'), configPath });
  const page = await app.firstWindow();

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

    // The shell kills itself: SIGKILL, the ending nobody asked for.
    await shell(page, session, 'kill -9 $$');

    const card = page.getByRole('region', { name: 'Session ended' });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText('ended unexpectedly: its process was killed by signal 9');
    await expect(page.getByTestId('session-header')).toBeVisible();
  } finally {
    await app.close();
  }
});
