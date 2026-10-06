import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { launchHive, resizeTo, writeProjectConfig } from './fixtures/hive-app';

/**
 * Round two's list panel in a real window (HIVE-211).
 *
 * Electron rather than the web project: with no list without items, the
 * browser target (no project, no Jira, no gh, no agent) never draws a panel at
 * all. A configured project is what gives Sessions something to list, and a
 * real window is the only place a width can cross 1,200px.
 */
const PROJECT = 'nova-web';
const REAL_DIRECTORY = join(import.meta.dirname, '../../..');

const bar = (page: Page) => page.getByRole('navigation', { name: 'Places' });
const sessionsList = (page: Page) => page.getByRole('region', { name: 'Sessions list' });
const GROUND = { dark: 'rgb(16, 21, 42)', light: 'rgb(253, 253, 251)' } as const;
const PANEL = { dark: 'rgb(20, 26, 51)', light: 'rgb(255, 255, 255)' } as const;

async function open(testInfo: { outputPath: (name: string) => string }) {
  const configPath = testInfo.outputPath('hive-config.json');
  writeProjectConfig(configPath, { id: PROJECT, path: REAL_DIRECTORY });
  const app = await launchHive({ userDataDir: testInfo.outputPath('user-data'), configPath });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('nav[aria-label="Places"]');
  return { app, page };
}

test('the rail chord toggles the panel', async ({}, testInfo) => {
  const { app, page } = await open(testInfo);
  try {
    await bar(page).getByRole('button', { name: 'Sessions', exact: true }).click();
    await expect(sessionsList(page)).toBeVisible();

    const chord = process.platform === 'darwin' ? 'Meta+b' : 'Control+Shift+b';
    await page.keyboard.press(chord);
    await expect(sessionsList(page)).toHaveCount(0);
    await page.keyboard.press(chord);
    await expect(sessionsList(page)).toBeVisible();
  } finally {
    await app.close();
  }
});

test('under 1,200px the list panel overlays and closes on a pick; widening restores it', async ({}, testInfo) => {
  const { app, page } = await open(testInfo);
  try {
    await resizeTo(app, page, 1100);
    await bar(page).getByRole('button', { name: 'Sessions', exact: true }).click();
    await expect(sessionsList(page)).toBeVisible();
    await expect(sessionsList(page)).toHaveCSS('position', 'absolute');
    await expect(page.getByTestId('list-veil')).toBeVisible();

    await sessionsList(page).getByRole('button', { name: new RegExp(`^${PROJECT}`) }).click();
    await expect(sessionsList(page)).toHaveCount(0);
    await expect(page.getByTestId('list-veil')).toHaveCount(0);

    // The bar icon opens it again, and Escape closes it.
    await bar(page).getByRole('button', { name: 'Sessions', exact: true }).click();
    await expect(sessionsList(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sessionsList(page)).toHaveCount(0);

    await resizeTo(app, page, 1440);
    await bar(page).getByRole('button', { name: 'Sessions', exact: true }).click();
    await expect(sessionsList(page)).toHaveCSS('position', 'static');
    await expect(page.getByTestId('list-veil')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('crossing below 1,200px with the panel open closes it', async ({}, testInfo) => {
  const { app, page } = await open(testInfo);
  try {
    await bar(page).getByRole('button', { name: 'Sessions', exact: true }).click();
    await expect(sessionsList(page)).toHaveCSS('position', 'static');

    await resizeTo(app, page, 1100);
    await expect(sessionsList(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Overmind' })).toBeVisible();
  } finally {
    await app.close();
  }
});

test('at 1,100px the session panel is a strip and the list takes no column; widening restores the panel', async ({}, testInfo) => {
  const { app, page } = await open(testInfo);
  try {
    await bar(page).getByRole('button', { name: 'Sessions', exact: true }).click();
    await sessionsList(page).getByRole('button', { name: new RegExp(`^${PROJECT}`) }).click();
    await page.getByRole('main').getByRole('button', { name: `New session in ${PROJECT}`, exact: true }).click();
    await expect(page.locator('[data-terminal-id^="sess-"]').last()).toBeVisible();

    const sessionPanel = page.getByRole('complementary', { name: 'Session panel' });
    // Open by default while wide: the tabs show.
    await expect(page.getByRole('tablist')).toBeVisible();

    await resizeTo(app, page, 1100);
    // The session panel collapses to its strip (HIVE-201), and the list panel, closed by the crossing, takes no column.
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await expect(sessionPanel).toBeVisible();
    await expect(sessionsList(page)).toHaveCount(0);

    await resizeTo(app, page, 1440);
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeGreaterThan(1200);
    await expect(page.getByRole('tablist')).toBeVisible();
  } finally {
    await app.close();
  }
});

/*
  The panel on its ground in both themes (HIVE-210). Here rather than in the web
  light-theme spec: the browser target has nothing to list, so it draws no panel.
*/
for (const theme of ['dark', 'light'] as const) {
  test(`the panel and the ground in ${theme}`, async ({}, testInfo) => {
    const { app, page } = await open(testInfo);
    try {
      await page.evaluate((mode) => {
        const stored = JSON.parse(localStorage.getItem('hive.appearance') ?? '{"version":3,"state":{}}') as {
          version: number;
          state: object;
        };
        localStorage.setItem('hive.appearance', JSON.stringify({ ...stored, state: { ...stored.state, theme: mode } }));
      }, theme);
      await page.reload();
      await page.waitForSelector('nav[aria-label="Places"]');
      await bar(page).getByRole('button', { name: 'Sessions', exact: true }).click();
      await expect(sessionsList(page)).toBeVisible();
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(GROUND[theme]);
      await expect
        .poll(() => sessionsList(page).evaluate((el) => getComputedStyle(el).backgroundColor))
        .toBe(PANEL[theme]);
    } finally {
      await app.close();
    }
  });
}
