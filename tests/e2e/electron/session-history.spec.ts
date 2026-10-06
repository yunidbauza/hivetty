import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { test as base, expect } from '@playwright/test';

import { SESSION_HISTORY_FILE } from '../../../electron/shared/session-history-contract';
import { claudeProjectDir } from '../../../electron/main/sessions/title-origin';
import { goToOvermind } from '../fixtures/places';

import {
  launchHive,
  startSession,
  writeProjectConfig,
} from './fixtures/hive-app';

/**
 * The fleet survives a quit (HIVE-87).
 *
 * This spec deliberately does **not** use the `hive` fixture, for the reason
 * `window-state.spec.ts` gives about geometry: the fixture gives one app per
 * test, and the only honest proof here is two launches against the same profile
 * with a genuine `close()` in between. Asserting that `sessions.json` was
 * written would prove the session history writes; it would not prove the
 * fleet comes back, which is the whole feature.
 *
 * It is also the only place anything checks the *inference* end to end — that a
 * session which was running at the quit returns as `closed` rather than as the
 * `working` the file still says it was.
 */
const test = base;

const PROJECT = 'nova-web';
const REAL_DIRECTORY = join(import.meta.dirname, '../../..');

/** The uuid main pinned as `claude --session-id` for `id`, read from its own history file. */
function recordedSessionUuid(userDataDir: string, id: string): string {
  const records = JSON.parse(readFileSync(join(userDataDir, SESSION_HISTORY_FILE), 'utf8')) as {
    id: string;
    sessionUuid?: string;
  }[];
  const uuid = records.find((record) => record.id === id)?.sessionUuid;
  if (uuid === undefined) throw new Error(`the session history has no uuid for ${id}`);
  return uuid;
}

test('start a session, quit, relaunch — it is still listed, under ENDED', async ({}, testInfo) => {
  const userDataDir = testInfo.outputPath('user-data');
  const configPath = testInfo.outputPath('hive-config.json');
  writeProjectConfig(configPath, { id: PROJECT, path: REAL_DIRECTORY });
  /*
    A replaced HOME, because main looks for the transcript under
    `homedir()/.claude` and this spec writes one. The real `~/.claude` is never
    touched; `session-panel.spec.ts` stages its transcript the same way.
  */
  const home = testInfo.outputPath('home');
  const env = { HOME: home };

  const first = await launchHive({ userDataDir, configPath, env });
  const firstWindow = await first.firstWindow();
  await firstWindow.waitForLoadState('domcontentloaded');
  await firstWindow.waitForSelector('nav[aria-label="Places"]');

  const id = await startSession(firstWindow, PROJECT);

  /*
    The session-history write is debounced at 400ms like the window state's, and the
    shutdown flush races the pty teardown by design — so this waits rather than
    relying on the flush, which is exactly the guarantee the module refuses to
    make.
  */
  await firstWindow.waitForTimeout(700);
  await first.close();

  /*
    The transcript Claude would have written on the first message. The stub
    `claude` never writes one, so the spec stands in for it, under the uuid main
    recorded rather than one the spec made up.
  */
  const projects = join(home, '.claude', 'projects', claudeProjectDir(REAL_DIRECTORY));
  mkdirSync(projects, { recursive: true });
  writeFileSync(
    join(projects, `${recordedSessionUuid(userDataDir, id)}.jsonl`),
    `${JSON.stringify({ type: 'user', message: { role: 'user', content: 'hello' } })}\n`,
  );

  const second = await launchHive({ userDataDir, configPath, env });
  const secondWindow = await second.firstWindow();
  await secondWindow.waitForLoadState('domcontentloaded');
  await secondWindow.waitForSelector('nav[aria-label="Places"]');

  try {
    await goToOvermind(secondWindow);
    /*
      Round two boots on Home, so the table is one place away.

      ENDED, not PREVIOUS RUN. That group is gone: it was a layout answer to an
      ordering problem — while the lists were in insertion order, the top of
      ENDED was always its oldest row — and the fleet lists sort by recency now,
      so last run's rows land among this run's by when they actually ended.

      Anchored because the group heading carries its count, "ENDED · 1"
      (HIVE-197), and the counts line above the table reads "… · 1 ended".
    */
    await expect(secondWindow.getByText(/^ENDED · \d+$/)).toBeVisible();
    await expect(secondWindow.getByText('PREVIOUS RUN')).toBeHidden();

    /*
      Anchored, because the row is no longer the only button that names this
      session: HIVE-93 put a `resume` control beside it, whose accessible name
      is `resume <id>`. An unanchored pattern matches both and Playwright's
      strict mode — correctly — refuses to guess which one the test meant.
    */
    // The fleet table's row: the Sessions list draws one for it too.
    const row = secondWindow
      .getByTestId('session-table')
      .getByRole('button', { name: new RegExp(`^${id}\\b`) });
    await expect(row).toBeVisible();

    /*
      An ending, whichever one the quit produced.

      Deliberately not pinned to one word. Which ending this row carries depends
      on the race the session history documents and refuses to arbitrate: if the pty exit
      is forwarded before the app finishes tearing down, `settleExit` records
      `terminated`; if the app dies first, the record still says `working` and
      the renderer infers an app-close, which reads `done` (HIVE-93 — it read
      `closed` until that story folded the third status away). Both are correct
      outcomes of the same quit, and asserting one of them here would be
      asserting the race.

      What is invariant — and what this spec exists for — is that the row comes
      back and is grouped as a previous run. The inference itself is pinned
      deterministically in `tests/stores/hive-store.test.ts`, where there is no
      race to lose.
    */
    const ending = await row.textContent();
    expect(ending).toMatch(/done|terminated/);

    /*
      Openability follows the ending, so it is *read* from the row rather than
      assumed — and that is the whole repair (HIVE-92 found it; HIVE-88 caused
      it).

      The branch that used to be here is gone with the rule it pinned. HIVE-88
      made a restored row the one ending that *opened*, because clicking it was
      how the conversation resumed; HIVE-93 gave resume its own control, so the
      row is inert again like every other ending and this can go back to being
      unconditional.

      Which also restores the property the branch was working around: the
      assertion above deliberately refuses to arbitrate the quit race, and this
      one now holds for either outcome rather than only for `terminated`.
    */
    await expect(row).toBeDisabled();

    /*
      The way back is a control, not the row (HIVE-93), and both endings of the
      quit race offer it. A uuid is not a conversation: main offers resume only
      once Claude has written the transcript (#269), which is why one was staged
      above. A session from a previous run that has a transcript is resumable
      whatever its ending (`resumableUuid` bars only a session still running in
      this run), so this holds without reading the race. Without the
      transcript there is no control; `history.test.ts` pins that half.
    */
    const resume = secondWindow.getByTestId('session-table').getByRole('button', {
      name: new RegExp(`^resume ${id}`),
    });
    await expect(resume).toBeVisible();
  } finally {
    await second.close();
  }
});

test('a fresh profile still boots with an empty fleet', async ({}, testInfo) => {
  /*
    The other half of the claim: history is additive. A machine that has never
    run The Hive must open exactly as it did before this feature existed, and a
    deleted `sessions.json` must return it to that state rather than erroring.
  */
  const app = await launchHive({
    userDataDir: testInfo.outputPath('user-data'),
    configPath: testInfo.outputPath('hive-config.json'),
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await window.waitForSelector('nav[aria-label="Places"]');

  try {
    await goToOvermind(window);
    await expect(window.getByTestId('session-table-empty')).toBeVisible();
    await expect(window.getByText(/^ENDED · \d+$/)).toBeHidden();
  } finally {
    await app.close();
  }
});
