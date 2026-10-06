import { TITLEBAR_HEIGHT } from '../../../electron/shared/window';
import { goToOvermind, overmindNewSession } from '../fixtures/places';

import { expect, test } from './fixtures/hive-app';

/**
 * Window chrome (story 085).
 *
 * `titleBarStyle: 'hiddenInset'` removes the native title bar so the app's own
 * strip and bar are the only chrome. That has consequences the renderer has to
 * honour, and this file is where they stop being assumed.
 */

test('has no native title bar stacked above the app', async ({
  hive,
  page,
}) => {
  await page.waitForSelector('nav[aria-label="Places"]');

  const chrome = await hive.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]!;
    const bounds = window.getBounds();
    const content = window.getContentBounds();
    return { titleBarHeight: bounds.height - content.height };
  });

  // Two stacked bars is exactly what hiddenInset exists to prevent.
  expect(chrome.titleBarHeight).toBe(0);
});

test('the New session button actually responds to a click', async ({ page }) => {
  await goToOvermind(page);
  await overmindNewSession(page).click();
  // The search box, not the title: with no project mapped the picker has no visible title (#77).
  await expect(page.getByRole('textbox', { name: 'Search all projects' })).toBeVisible();
});

test('the traffic lights get their own row above the bar', async ({ page }) => {
  await page.waitForSelector('nav[aria-label="Places"]');

  // The strip is the top of the window, and the bar begins where it ends.
  const strip = page.getByTestId('title-bar');
  await expect(strip).toBeVisible();
  const stripBox = (await strip.boundingBox())!;
  const barBox = (await page.getByRole('navigation', { name: 'Places' }).boundingBox())!;
  expect(Math.round(stripBox.y)).toBe(0);
  expect(Math.round(barBox.y)).toBe(Math.round(stripBox.y + stripBox.height));
});

test('the lights are positioned inside the strip, not over the bar', async ({
  hive,
  page,
}) => {
  await page.waitForSelector('nav[aria-label="Places"]');

  /**
   * The half a page screenshot cannot prove.
   *
   * The traffic lights are drawn by macOS *over* the window, outside the web
   * contents entirely, so `page.screenshot()` shows the strip and never the
   * buttons in it. Asked from the main process instead, this is the actual
   * claim: the buttons are inside the 32px strip rather than floating over the
   * bar below it.
   */
  const lights = await hive.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]!;
    return window.getWindowButtonPosition();
  });

  // macOS draws them 12px across, so the whole button clears the strip's edge.
  expect(lights).not.toBeNull();
  expect(lights!.y).toBeGreaterThanOrEqual(0);
  expect(lights!.y + 12).toBeLessThanOrEqual(TITLEBAR_HEIGHT);
  expect(lights!.x).toBe(16);
});

test('the strip is draggable, so the window can still be moved', async ({ page }) => {
  // Without a native title bar the drag regions are the only way to move the
  // window. The strip is 32px of otherwise-empty panel; if it is not draggable
  // it is dead space.
  const region = await page
    .getByTestId('title-bar')
    .evaluate((element) =>
      getComputedStyle(element).getPropertyValue('-webkit-app-region'),
    );

  expect(region).toBe('drag');
});
