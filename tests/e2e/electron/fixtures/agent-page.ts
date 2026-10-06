import { expect, type Page } from '@playwright/test';

import { goToPlace } from '../../fixtures/places';

/**
 * Driving the agent editor from a browser test: on the agent page's Definition
 * view (HIVE-204), side by side, and in Settings › Agents, which edits in place
 * again with Form | Source tabs.
 */

/** Settings › Agents, as every authoring flow reaches it. */
export async function openSettingsAgents(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  // Scoped to Settings' nav: the bar has an Agents place of the same name.
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name: 'Agents' })
    .click();
}

/** Open a new agent's page from the Agents panel's + (HIVE-204). */
export async function newAgentPage(page: Page): Promise<void> {
  await goToPlace(page, 'Agents');
  await page.locator('[data-panel="agents"]').getByRole('button', { name: 'New agent', exact: true }).click();
  await expect(page.locator('[data-view="agent"]')).toBeVisible();
  await expect(page.getByText('New agent', { exact: true })).toBeVisible();
}

/**
 * Write a new agent in Settings › Agents, beside the list.
 *
 * `exact`, because the agents panel's own "New agent" + can be on screen
 * beside the overlay and shares the words.
 */
export async function newAgentInSettings(page: Page): Promise<void> {
  await openSettingsAgents(page);
  await page.getByRole('button', { name: '+ New agent', exact: true }).click();
  await expect(page.getByText('not saved yet', { exact: true })).toBeVisible();
}

/**
 * Settings, and the page below 900px of stage, keep the Form | Source tabs; the
 * page at or above shows both panes and hides the tabs. Either way, after this
 * the named pane is on screen.
 */
async function show(page: Page, pane: 'Form' | 'Source'): Promise<void> {
  const tab = page.getByRole('tab', { name: pane });
  if (await tab.isVisible()) await tab.click();
}

export const showSource = (page: Page): Promise<void> => show(page, 'Source');
export const showForm = (page: Page): Promise<void> => show(page, 'Form');

/** Save landed: the bar names the file and reads saved. */
export async function expectSavedAs(page: Page, name: string): Promise<void> {
  await expect(page.getByText(new RegExp(`/${name}/AGENT\\.md$`))).toBeVisible();
  await expect(page.getByText('saved', { exact: true })).toBeVisible();
}
