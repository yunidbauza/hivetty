import { expect, type Locator, type Page } from '@playwright/test';

/** The round-two frame is up: what every spec waits on before its first claim. */
export const BOOT = 'nav[aria-label="Places"]';

export type PlaceName = 'Home' | 'Sessions' | 'Work' | 'Agents' | 'PRs';

export const bar = (page: Page): Locator => page.getByRole('navigation', { name: 'Places' });

/** A place's button. With a count it is named "Sessions, 2 working", so the label is matched at the start. */
export const placeButton = (page: Page, name: PlaceName): Locator =>
  bar(page).getByRole('button', { name: new RegExp(`^${name}(,|$)`) });

/**
 * Go to a place without folding its panel. A click on the current place
 * toggles the panel (ui-store `selectPlace`), the same trap the old rail-tab
 * helper guarded against.
 */
export async function goToPlace(page: Page, name: PlaceName): Promise<void> {
  const button = placeButton(page, name);
  if ((await button.getAttribute('aria-current')) !== 'page') await button.click();
  await expect(button).toHaveAttribute('aria-current', 'page');
}

/**
 * The Overmind on the stage. A place change keeps whatever holds the stage (a
 * session, a terminal, an agent's page); a second click on Sessions, already
 * current, returns the stage to the Overmind (ui-store `selectPlace`).
 *
 * Under 1,200px the list panel overlays the stage instead of taking a column
 * (HIVE-211), so there a further click folds it off the Overmind's controls.
 */
export async function goToOvermind(page: Page): Promise<void> {
  await goToPlace(page, 'Sessions');
  const head = page.getByRole('main').getByRole('heading', { level: 1, name: /^Overmind/ });
  if (!(await head.isVisible())) await placeButton(page, 'Sessions').click();
  await expect(head).toBeVisible();
  const list = page.getByRole('region', { name: 'Sessions list' });
  if ((await page.evaluate(() => window.innerWidth)) < 1200 && (await list.isVisible())) {
    await placeButton(page, 'Sessions').click();
    await expect(list).toBeHidden();
  }
}

/** The unfiltered Overmind's New session, scoped to the stage. */
export const overmindNewSession = (page: Page): Locator =>
  page.getByRole('main').getByRole('button', { name: 'New session', exact: true });

/** The Overmind with its transcript shown: round two folds it into the dock until asked (HIVE-197). */
export async function openConsole(page: Page): Promise<void> {
  await goToOvermind(page);
  const show = page.getByRole('button', { name: /^Show the console/ });
  if (await show.isVisible()) await show.click();
  await expect(page.getByRole('button', { name: /^Hide the console/ })).toBeVisible();
}

/** The Sessions list with one project unfolded (rows start folded). Answers the list. */
export async function openProject(page: Page, name: string): Promise<Locator> {
  await goToPlace(page, 'Sessions');
  const list = page.getByRole('region', { name: 'Sessions list' });
  await expect(list).toBeVisible();
  const unfold = list.getByRole('button', { name: `Unfold ${name}`, exact: true });
  if (await unfold.isVisible()) await unfold.click();
  await expect(list.getByRole('button', { name: `Fold ${name}`, exact: true })).toBeVisible();
  return list;
}
