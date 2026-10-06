import { expect, test, type Page } from '@playwright/test';

/**
 * Round two in both themes on the web target (HIVE-210). The web target has no
 * projects, so Home is the first-run page and the comb lives in the electron
 * spec (home-comb.spec.ts). With nothing to list it draws no list panel either
 * (HIVE-211), so the panel's colour is checked in list-panel.spec.ts (electron).
 * The theme is seeded before the first frame.
 */
const GROUND = { dark: 'rgb(16, 21, 42)', light: 'rgb(253, 253, 251)' } as const;

const bar = (page: Page) => page.getByRole('navigation', { name: 'Places' });
const bg = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((mode) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem(
          'hive.appearance',
          JSON.stringify({ version: 3, state: { theme: mode } }),
        );
      }, theme);
      await page.goto('/?sim=0');
      await expect(bar(page)).toBeVisible();
    });

    test('Home: the first-run page on the ground', async ({ page }, testInfo) => {
      await expect(page.getByText('An empty hive')).toBeVisible();
      await expect.poll(() => bg(page, 'body')).toBe(GROUND[theme]);
      await page.screenshot({ path: testInfo.outputPath(`home-${theme}.png`) });
    });

    for (const place of ['Sessions', 'Work', 'Agents'] as const) {
      test(`${place}: the ground, and no list without items`, async ({ page }, testInfo) => {
        await bar(page).getByRole('button', { name: place, exact: true }).click();
        await expect(page.getByRole('region', { name: `${place} list` })).toHaveCount(0);
        if (place === 'Sessions') {
          await expect(page.getByRole('heading', { level: 1, name: 'Overmind' })).toBeVisible();
        }
        await expect.poll(() => bg(page, 'body')).toBe(GROUND[theme]);
        await page.screenshot({
          path: testInfo.outputPath(`${place.toLowerCase()}-${theme}.png`),
        });
      });
    }
  });
}
