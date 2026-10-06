import { expect, test, type Page } from '@playwright/test';

import { bar, goToOvermind, overmindNewSession, placeButton } from '../fixtures/places';

/**
 * The bar stays live while a full-stage overlay is open.
 *
 * Both overlays fill the centre stage and leave the surrounding chrome on
 * screen on purpose. Radix's default modality then marked that chrome
 * `aria-hidden` with `pointer-events: none`, so every control around the stage
 * looked live and did nothing — and the click that reached none of them
 * dismissed the overlay instead.
 *
 * These are browser-only claims. Nothing in a unit test can see
 * `pointer-events`, because happy-dom performs no layout and never resolves
 * whether a click would land.
 */

const APP_URL = '/?sim=0';

const gear = (page: Page) => bar(page).getByRole('button', { name: 'Settings', exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto(APP_URL);
  await page.waitForSelector('nav[aria-label="Places"]');
});

test('the bar stays clickable while settings is open', async ({ page }) => {
  await gear(page).click();
  await expect(page.getByRole('button', { name: 'Close settings' })).toBeVisible();

  /**
   * The two properties that made the chrome a lie. Asserted directly rather
   * than through a click, so a regression names its own cause.
   */
  await expect(bar(page)).not.toHaveAttribute('aria-hidden', 'true');
  expect(await bar(page).evaluate((nav) => getComputedStyle(nav).pointerEvents)).toBe('auto');

  // It acts: a place click lands, and leaving for another place closes Settings (ui-store selectPlace).
  await placeButton(page, 'Work').click();
  await expect(placeButton(page, 'Work')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Close settings' })).toBeHidden();
});

test('the bar stays clickable while the picker is open', async ({ page }) => {
  await goToOvermind(page);
  await overmindNewSession(page).click();
  await expect(page.getByPlaceholder('search all projects…')).toBeVisible();

  await expect(bar(page)).not.toHaveAttribute('aria-hidden', 'true');
  expect(await bar(page).evaluate((nav) => getComputedStyle(nav).pointerEvents)).toBe('auto');
});

/**
 * The two routes out that must survive losing outside-dismissal. Escape is the
 * one a keyboard user reaches for; the button is the one everyone else does.
 */
test('settings still closes on Escape and on its own button', async ({ page }) => {
  await gear(page).click();
  await expect(page.getByRole('button', { name: 'Close settings' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Close settings' })).toBeHidden();

  await gear(page).click();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await expect(page.getByRole('button', { name: 'Close settings' })).toBeHidden();
});

test('the picker still closes on Escape', async ({ page }) => {
  await goToOvermind(page);
  await overmindNewSession(page).click();
  await expect(page.getByPlaceholder('search all projects…')).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.getByPlaceholder('search all projects…')).toBeHidden();
});
