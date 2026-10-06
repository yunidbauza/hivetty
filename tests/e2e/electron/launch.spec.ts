import { expectCreatureDrawn } from '../fixtures/creature';
import { goToOvermind } from '../fixtures/places';

import { expect, test } from './fixtures/hive-app';

/**
 * The app boots (story 085).
 *
 * "It works in the browser build" is not "the desktop app works", and this is
 * the file that stops the two being confused.
 */

test('opens exactly one window, titled and visible', async ({ hive, page }) => {
  await page.waitForSelector('nav[aria-label="Places"]');

  const window = await hive.evaluate(({ BrowserWindow }) => {
    const all = BrowserWindow.getAllWindows();
    return {
      count: all.length,
      visible: all[0]!.isVisible(),
      title: all[0]!.getTitle(),
    };
  });

  // One window by design (story 000).
  expect(window.count).toBe(1);
  expect(window.visible).toBe(true);
  expect(window.title).toBe('Hive');
});

test('renders the real app, not an empty shell', async ({ page }) => {
  // The whole premise of the epic: the renderer we already shipped IS the
  // desktop app's UI.
  await expect(page.getByRole('navigation', { name: 'Places' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
});

test('shows no white flash — the window paints the app background', async ({
  hive,
  page,
}) => {
  await page.waitForSelector('nav[aria-label="Places"]');

  const background = await hive.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.getBackgroundColor(),
  );

  // --cc-bg. The default is white, and on a dark app that is the flash people
  // notice on every cold launch (story 081).
  expect(background.toLowerCase()).toBe('#10152a');
});

test('loads the dock icon as the bar\'s brand under file://', async ({ page }) => {
  // A root-relative src 404s silently under file:// (story 083); a loaded image has a natural width.
  const brand = page.getByRole('navigation', { name: 'Places' }).getByRole('img', { name: 'Hive TTY' });
  await expect(brand).toBeVisible();
  await expect.poll(() => brand.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});

test('draws the empty fleet\'s creature on its canvas', async ({ page }) => {
  // The creature is what round two shows on an empty fleet. It was a WebP,
  // where a root-relative URL 404s silently under file:// (story 083); it is
  // drawn now (HIVE-221), so what can break is a canvas that never paints.
  await goToOvermind(page);
  await expectCreatureDrawn(page.getByTestId('session-table-empty').locator('[data-creature]').first());
});

test('is the desktop target, so it shows no demo chip', async ({ page }) => {
  await page.waitForSelector('nav[aria-label="Places"]');

  await expect(page.getByText('demo', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => typeof window.hive)).toBe('object');
});

test('the activity bar fits every label at the 11px floor (HIVE-225)', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Places' });
  await expect(nav).toBeVisible();
  const items = await nav.locator('button').evaluateAll((buttons) =>
    buttons.map((b) => ({
      label: b.textContent?.trim() ?? '',
      fits: b.scrollWidth <= b.clientWidth,
      size: getComputedStyle(b).fontSize,
    })),
  );
  const labelled = items.filter((i) => i.label !== '');
  expect(labelled.length).toBeGreaterThanOrEqual(5);
  for (const item of labelled) {
    expect(item, item.label).toMatchObject({ fits: true });
    expect(Number.parseFloat(item.size), item.label).toBeGreaterThanOrEqual(11);
  }
});
