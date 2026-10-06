import { expect, test } from '@playwright/test';

import { PHRASES } from '../../../src/lib/swarm/phrases';
import { expectCreatureDrawn, readCreature } from '../fixtures/creature';
import { goToOvermind } from '../fixtures/places';

/**
 * The swarm layer, in a real browser against production output.
 *
 * Unit tests prove the pools, the hook and the drawing's plumbing. They cannot
 * prove that the creature's canvas actually paints, that it is laid out rather
 * than collapsed to nothing, or that a flavour line actually reaches the stage —
 * all three are build-and-layout claims, and happy-dom has no canvas and
 * performs no layout.
 *
 * The app boots empty, which is exactly the state this whole change is about,
 * so every surface asserted here is on screen at load with no setup.
 */

const APP_URL = '/?sim=0';

test.beforeEach(async ({ page }) => {
  await page.goto(APP_URL);
  await goToOvermind(page);
});

test('the dormant orchestrator holds a creature and a line', async ({ page }) => {
  const empty = page.getByTestId('session-table-empty');
  await expect(empty).toBeVisible();

  // Painted, laid out at the size it was asked for, not collapsed.
  await expectCreatureDrawn(empty.locator('[data-creature="overlord"]'));

  await expect(empty).toContainText('No sessions running — start one with New session.');

  const text = (await empty.textContent()) ?? '';
  const drew = PHRASES['empty.sessions'].some((phrase) => text.includes(phrase));
  expect(drew, `no phrase from empty.sessions in: ${text}`).toBe(true);
});

test('holds the creature still when the user asked for less motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(APP_URL);
  await goToOvermind(page);
  const creature = page.getByTestId('session-table-empty').locator('[data-creature="overlord"]');
  await expectCreatureDrawn(creature);

  const first = await readCreature(creature);
  await page.waitForTimeout(500);
  expect((await readCreature(creature)).digest).toBe(first.digest);
});

/*
  Round two draws no empty panel (HIVE-211): the stage pages that say why are
  asserted by round-two.spec.ts, and the pools by the unit tests.
*/
