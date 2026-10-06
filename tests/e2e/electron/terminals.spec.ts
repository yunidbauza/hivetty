import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { openProject } from '../fixtures/places';

import { launchHive, writeProjectConfig } from './fixtures/hive-app';

/**
 * A terminal in the built app (terminals, phases 1 and 2).
 *
 * The only test that proves the whole path: a click in the Sessions list, a real
 * spawn through main, a real host poll reading a real foreground process
 * group, and the `exit` ending taking the row and the tab with it.
 */
const REAL_DIRECTORY = join(import.meta.dirname, '../../..');

test('opens at a prompt, names a running command, and leaves on exit', async ({}, testInfo) => {
  writeProjectConfig(testInfo.outputPath('hive-config.json'), {
    id: 'nova-web',
    path: REAL_DIRECTORY,
  });
  const app = await launchHive({
    userDataDir: testInfo.outputPath('user-data'),
    configPath: testInfo.outputPath('hive-config.json'),
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('nav[aria-label="Places"]');

  try {
    const tree = await openProject(page, 'nova-web');
    await tree.getByRole('button', { name: 'Terminal in nova-web' }).click();

    const terminal = page.locator('[data-terminal-id^="term-"]').last();
    await expect(terminal).toBeVisible();
    const id = (await terminal.getAttribute('data-terminal-id'))!;

    const row = tree.getByRole('button', { name: new RegExp(`^${id}`) });
    await expect(row).toContainText('at prompt');
    // Round two draws a header over a terminal too (TerminalLine).
    await expect(page.getByTestId('session-header')).toBeVisible();

    await terminal.click();
    await page.keyboard.type('sleep 3');
    await page.keyboard.press('Enter');
    await expect(row).toContainText('sleep', { timeout: 5_000 });
    await expect(row).toContainText('at prompt', { timeout: 8_000 });

    await tree.screenshot({ path: 'test-results/evidence/terminal-row.png' });

    await page.keyboard.type('exit');
    await page.keyboard.press('Enter');
    await expect(terminal).toHaveCount(0, { timeout: 5_000 });
    await expect(row).toHaveCount(0);
    // Back on the console, with nothing kept.
    await expect(page.getByTestId('session-table-empty')).toBeVisible();
  } finally {
    await app.close();
  }
});
