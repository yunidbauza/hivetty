import { basename, join } from 'node:path';

import { expect, test } from '@playwright/test';

import { openProject } from '../fixtures/places';

import { launchHive, startSession, writeProjectConfig } from './fixtures/hive-app';

/**
 * Two of the three entry points, in the built app (entry points).
 *
 * The Sessions list's link and the session menu's item both end in a real
 * spawn through main; only the built app can prove the menu is reachable and
 * that "terminal here" lands at the session's directory.
 * The console verb is proved by the store's tests: it calls the same action.
 */
const REAL_DIRECTORY = join(import.meta.dirname, '../../..');

test('the list opens a terminal, and terminal here opens one beside a session', async ({}, testInfo) => {
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
    await (await openProject(page, 'nova-web')).getByRole('button', { name: 'Terminal in nova-web' }).click();

    const first = page.locator('[data-terminal-id^="term-"]').last();
    await expect(first).toBeVisible();

    await startSession(page, 'nova');
    await page.getByRole('button', { name: 'Session menu' }).click();
    await page.getByRole('menuitem', { name: /^Terminal here/ }).click();

    const terminals = page.locator('[data-terminal-id^="term-"]');
    await expect(terminals).toHaveCount(2);
    const tree = await openProject(page, 'nova-web');
    const secondId = (await terminals.last().getAttribute('data-terminal-id'))!;
    const row = tree.getByRole('button', { name: new RegExp(`^${secondId}`) });
    // The directory tail beneath the row is where the session is standing.
    await expect(row).toContainText(basename(REAL_DIRECTORY));

    await tree.screenshot({ path: 'test-results/evidence/terminal-entry-points.png' });
  } finally {
    await app.close();
  }
});
