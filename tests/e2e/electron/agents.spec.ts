import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import { goToOvermind, goToPlace, openConsole } from '../fixtures/places';

import {
  expectAgentSource,
  fillAgentSource,
} from './fixtures/agent-source';
import { expectSavedAs, newAgentPage, showSource } from './fixtures/agent-page';
import { launchHive, SHIPPED_AGENTS } from './fixtures/hive-app';

/**
 * The authored agent's own row in the fleet table. The shipped agents are
 * seeded beside it on every launch (HIVE-162), so "the" agent row is no longer
 * one row (retro D).
 */
const watcherRow = (page: Page) =>
  page.getByTestId('agent-row').filter({ hasText: 'slack-watcher' });

/**
 * The Agents tab and the agent view, against the built app (HIVE-116).
 *
 * The unit suites prove each half against a store seeded by hand: a grouped
 * panel from three fixtures, a view from one entity, a run log from a line
 * batch. None of them answers what this file is for:
 *
 * - does a definition on disk reach the **rail**, grouped and labelled, through
 *   the real registry, the real IPC and the real store sync?
 * - does clicking that row put the agent view on the centre stage — and, the
 *   half no jsdom test can see, does it put *no terminal* there?
 * - does the two-column split actually lay out, and does it collapse when the
 *   stage is narrow rather than when the window is?
 *
 * No real run is started here. Waking an agent spawns a real `claude`, which
 * is `pnpm test:agent`'s job (`tests/live/agent-conformance.test.ts`) and
 * costs money; this spec is about what the renderer draws around it. The one
 * run it does start (HIVE-204, the run table's selection) is against a stub
 * executable, as `agent-task-runs.spec.ts` does.
 */

const EMPTY_CONFIG = JSON.stringify({ version: 2, projects: [] }, null, 2);

const DEFINITION = `---
name: slack-watcher
description: Watches the channel
icon: ChatCircleDots
wake:
  every: 5m
autonomy: ask
---
Read your ledger inbox first.
`;

async function launchWithConfig(outputPath: (name: string) => string): Promise<{
  app: ElectronApplication;
  page: Page;
}> {
  const configPath = outputPath('hive-config.json');

  writeFileSync(configPath, EMPTY_CONFIG);

  const app = await launchHive({
    userDataDir: outputPath('user-data'),
    configPath,
    // Scratch skill roots, for the reason `agents-settings.spec.ts` gives: a
    // name installed on the developer's machine must not decide the result.
    env: { CLAUDE_CONFIG_DIR: outputPath('claude-config') },
  });
  const page = await app.firstWindow();

  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('nav[aria-label="Places"]');

  return { app, page };
}

/**
 * Author one agent on its page, from Settings › Agents' New agent (HIVE-204),
 * then go back to the Overmind.
 */
async function authorAgent(page: Page, { stay = false }: { stay?: boolean } = {}): Promise<void> {
  await newAgentPage(page);
  await showSource(page);
  await fillAgentSource(page, DEFINITION);
  await page.getByRole('button', { name: 'Save' }).click();
  await expectSavedAs(page, 'slack-watcher');

  // Back to the Overmind, where the specs below start. Round two's agent page
  // has no back button, and the bar is the way out.
  if (stay) return;
  await goToOvermind(page);
}

/**
 * The reported bug, in a real browser: the Description field "doesn't allow
 * spaces".
 *
 * No unit test could have caught it as a *user* experiences it, and none of the
 * flows above go near it — `authorAgent` fills the Source tab, so the Form tab's
 * controlled inputs are never typed into at all. The mechanism needed a real
 * keystroke sequence against a real React commit: the value round-trips through
 * `patchFrontmatter`/`readFrontmatter` on every character, the read trims, and
 * the space was gone before the next character arrived — so the field silently
 * ate every one, and `Watches my open PRs` came out `Watchesmyopenprs`-shaped.
 *
 * Typed rather than `fill()`ed, deliberately: `fill()` sets the value in one
 * commit and would pass on the broken build. Only per-character typing
 * reproduces it.
 */
test('accepts spaces typed into the agent form fields', async ({}, testInfo) => {
  const { app, page } = await launchWithConfig((name) => testInfo.outputPath(name));

  await newAgentPage(page);

  const description = page.getByRole('textbox', { name: 'description' });

  await description.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('watches my open PRs');

  await expect(description).toHaveValue('watches my open PRs');

  // The list fields carry the same defect, where `[a, b]` is the documented
  // syntax and the space after the comma was equally unreachable.
  const tools = page.getByRole('textbox', { name: 'tools' });

  await tools.click();
  await page.keyboard.type('[Bash(gh *), Read]');

  await expect(tools).toHaveValue('[Bash(gh *), Read]');

  /*
    And what was typed is what the file holds — modulo the trimming the buffer
    does at the ends, which is the behaviour the draft exists to hide from the
    typist rather than to defeat.
  */
  await showSource(page);

  await expectAgentSource(page, /description: watches my open PRs/);
  await expectAgentSource(page, /tools: \[Bash\(gh \*\), Read\]/);

  await app.close();
});

/**
 * The source pane says what the body is for.
 *
 * Every frontmatter field has a `FIELD_HELP` sentence under its control; the
 * body had none anywhere, and it is the field users read as a description of
 * the agent rather than as the work it does on every wake.
 */
test('tells the author what the body below the frontmatter does', async ({}, testInfo) => {
  const { app, page } = await launchWithConfig((name) => testInfo.outputPath(name));

  await newAgentPage(page);
  await showSource(page);

  await expect(page.getByText(/carried out on every wake/)).toBeVisible();

  await app.close();
});

test('lists an authored agent in its lane, and folds the lane', async ({}, testInfo) => {
  const { app, page } = await launchWithConfig((name) => testInfo.outputPath(name));

  try {
    await authorAgent(page);

    await goToPlace(page, 'Agents');

    const panel = page.locator('[data-panel="agents"]');

    /*
      A definition that has never run rests, so it files under Burrowed
      (HIVE-204), and its row says the state in words in its name — the tile's
      colour is never the only carrier.
    */
    const lane = panel.getByRole('region', { name: 'Burrowed' });

    await expect(lane.getByRole('button', { name: /^slack-watcher, sleeping/ })).toBeVisible();

    // The lane folds from its header, and unfolds again.
    const header = lane.getByRole('button', { expanded: true });

    await header.click();
    await expect(lane.getByRole('button', { expanded: false })).toBeVisible();
    await expect(lane.getByRole('button', { name: /^slack-watcher, / })).toBeHidden();

    await lane.getByRole('button', { expanded: false }).click();
    await expect(lane.getByRole('button', { name: /^slack-watcher, sleeping/ })).toBeVisible();
  } finally {
    await app.close();
  }
});

test('opens the agent view — and no terminal — when the row is clicked', async ({}, testInfo) => {
  const { app, page } = await launchWithConfig((name) => testInfo.outputPath(name));

  try {
    await authorAgent(page);
    await goToPlace(page, 'Agents');
    await page
      .locator('[data-panel="agents"]')
      .getByRole('button', { name: /^slack-watcher, / })
      .click();

    const view = page.locator('[data-view="agent"]');

    await expect(view).toBeVisible();

    // The five facts, from a definition that has never run.
    for (const label of ['Status', 'Wake', 'Next', 'Today', 'Session']) {
      await expect(view.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(view.getByText('0 runs · $0.00')).toBeVisible();
    await expect(view.getByText('every 5m')).toBeVisible();

    /*
      The half no unit test can prove: nothing terminal-shaped is on the stage.

      An agent tab used to mount a session meta bar over a read-only xterm with
      a message row beneath it. A jsdom suite can assert those components are
      absent from a tree; only the built app can show that the surface a person
      actually sees is the agent view and nothing else.
    */
    await expect(page.getByTestId('session-header')).toHaveCount(0);
    await expect(
      page.locator('[data-testid="terminal-surface"]:visible'),
    ).toHaveCount(0);
    await expect(page.getByLabel(/^Message /)).toHaveCount(0);

    // Its own input, which says what it does.
    await expect(view.getByText(/as the overmind/i)).toBeVisible();
    await expect(view.getByText(/not a terminal/i)).toBeVisible();

    /*
      And it fills the stage.

      The view and the (now empty) terminal region are siblings in one flex
      column, both `flex-1`, so leaving the region visible split the height in
      half and left the bottom of the stage blank. The first version of this
      spec asserted the two regions' relative positions and never that the view
      reached the bottom, which is exactly how that shipped past it.
    */
    const stage = page.getByRole('main');
    const stageBox = await stage.boundingBox();
    const viewBox = await view.boundingBox();

    if (stageBox === null || viewBox === null) {
      throw new Error('the stage did not lay out');
    }

    expect(viewBox.height).toBeGreaterThan(stageBox.height * 0.8);
  } finally {
    await app.close();
  }
});

test('lays the run log and the ledger side by side, and stacks them when the stage is narrow', async ({}, testInfo) => {
  const { app, page } = await launchWithConfig((name) => testInfo.outputPath(name));

  try {
    await authorAgent(page);
    await goToPlace(page, 'Agents');
    await page
      .locator('[data-panel="agents"]')
      .getByRole('button', { name: /^slack-watcher, / })
      .click();

    const log = page.locator('[data-region="run-log"]');
    const ledger = page.locator('[data-region="ledger"]');

    await expect(log).toBeVisible();
    await expect(ledger).toBeVisible();

    const wide = async () => ({
      log: await log.boundingBox(),
      ledger: await ledger.boundingBox(),
    });

    const before = await wide();

    if (before.log === null || before.ledger === null) {
      throw new Error('regions did not lay out');
    }

    // Side by side: the ledger starts to the right of the log, on the same row.
    expect(before.ledger.x).toBeGreaterThan(before.log.x);
    expect(Math.abs(before.ledger.y - before.log.y)).toBeLessThan(4);
    // And the log is the wider of the two — it is the elastic half.
    expect(before.log.width).toBeGreaterThan(before.ledger.width);

    /*
      Now narrow the *window* until the stage crosses 720px. A media query would
      also pass this; what makes the container query the right tool is that the
      bar and the list panel take width, so the stage can be narrow inside a wide window. This
      asserts the collapse happens at all — `resolve-view` and the component
      tests carry the rest.
    */
    await page.setViewportSize({ width: 760, height: 800 });

    const after = await wide();

    if (after.log === null || after.ledger === null) {
      throw new Error('regions did not lay out after resize');
    }

    // Stacked: the ledger is now below the log rather than beside it.
    expect(after.ledger.y).toBeGreaterThan(after.log.y);
  } finally {
    await app.close();
  }
});

/**
 * The fleet table's AGENTS group (HIVE-117).
 *
 * Here rather than in `session-table.test.tsx` for the reason
 * `table-alignment.spec.ts` states about its own column: happy-dom performs no
 * layout, so a component test can prove a cell **exists** and never that it
 * sits under the heading that names it. The whole design of this group is that
 * its columns are the *same* columns — an agent spends `PROJECT` and `BRANCH`
 * on its wake, and every column after that has to stay put — which is a claim
 * about geometry that only a real browser can answer.
 *
 * Still no run is started: waking an agent spawns a real `claude`, which is
 * `pnpm test:agent`'s job and costs money.
 */
test('lists agents in the fleet table, under a heading, in the same columns', async ({}, testInfo) => {
  const { app, page } = await launchWithConfig((name) => testInfo.outputPath(name));

  try {
    await authorAgent(page);

    const table = page.getByTestId('session-table');

    // The authored one, plus the shipped agents seeded beside it.
    await expect(
      table.getByText(`AGENTS · ${SHIPPED_AGENTS.length + 1}`),
    ).toBeVisible();

    const row = watcherRow(page);

    await expect(row).toBeVisible();
    // The wake, in the two cells a session spends on its checkout.
    await expect(row.locator('[data-col="wake"]')).toHaveText('every 5m');
    // The status is a word on screen, never colour alone.
    await expect(row.locator('[data-col="status"]')).toHaveText('sleeping');
    // Never run, so the age cell says so rather than guessing.
    await expect(row.locator('[data-col="last-used"]')).toContainText('—');

    /*
      The columns line up with the header's, which is the claim the group's
      whole layout rests on. Rounded before comparing for
      `table-alignment.spec.ts`'s reason: these are fractional CSS pixels in a
      flex line whose free space is divided three ways, and an exact match would
      fail on a rounding difference rather than on a regression.
    */
    for (const col of ['status', 'last-used', 'pr']) {
      const xs = await page
        .locator(`[data-col="${col}"]`)
        .evaluateAll((cells) =>
          cells.map((cell) => Math.round(cell.getBoundingClientRect().x)),
        );

      // The header's cell and the agent's, at minimum.
      expect(xs.length).toBeGreaterThanOrEqual(2);
      expect(new Set(xs).size).toBe(1);
    }
  } finally {
    await app.close();
  }
});

test('opens the agent view from the fleet table row', async ({}, testInfo) => {
  const { app, page } = await launchWithConfig((name) => testInfo.outputPath(name));

  try {
    await authorAgent(page);

    await watcherRow(page).getByRole('button').click();

    await expect(page.locator('[data-view="agent"]')).toBeVisible();
  } finally {
    await app.close();
  }
});

/**
 * The console's `agents` verb, against the real registry and the real IPC.
 *
 * The store suite proves the row's text from a hand-seeded entity. What it
 * cannot prove is that a definition on **disk** reaches the console at all —
 * that is the registry, the `agents:list` channel and the store sync, and this
 * is the only place all three are real.
 */
test('prints the agents table in the console', async ({}, testInfo) => {
  const { app, page } = await launchWithConfig((name) => testInfo.outputPath(name));

  try {
    await authorAgent(page);
    await openConsole(page);

    const input = page.getByRole('textbox', { name: 'Overmind command' });

    await input.click();
    await input.fill('agents');
    await input.press('Enter');

    // The transcript is an xterm, read through its DOM renderer.
    const transcript = page.getByRole('main').locator('.xterm');

    await expect(transcript).toContainText('slack-watcher');
    await expect(transcript).toContainText('every 5m');
    await expect(transcript).toContainText('0 runs');
  } finally {
    await app.close();
  }
});

/**
 * Pause and resume, round-tripped through the real channels (HIVE-117).
 *
 * The unit suites drive a mocked bridge. This is the only place the click,
 * `agents:pause`, the write to `agents.json`, the `agents:status` push and
 * every surface that redraws from it are all the real ones. The ticket's
 * criterion is that the status round-trips "in the rail, the table and
 * `agents.json`" — the table is asserted here, and it is drawn from the file.
 */
test('pauses and resumes from the console, and the table agrees', async ({}, testInfo) => {
  const { app, page } = await launchWithConfig((name) => testInfo.outputPath(name));

  try {
    await authorAgent(page);
    await openConsole(page);

    const status = watcherRow(page).locator('[data-col="status"]');
    const input = page.getByRole('textbox', { name: 'Overmind command' });
    const transcript = page.getByRole('main').locator('.xterm');

    await expect(status).toHaveText('sleeping');

    await input.click();
    await input.fill('pause slack-watcher');
    await input.press('Enter');

    // The table redraws from main's `agents:status` push, not a local guess.
    await expect(status).toHaveText('paused');

    /*
      And a wake does not happen now — the consequence the status exists to
      have. The refusal comes from `RunTracker.run`, so it proves the pause
      reached `agents.json` rather than only the renderer's copy of it.

      Since HIVE-126 the console says *queued* rather than refusing outright:
      the manual path routes through the scheduler, which keeps the run on
      `pendingWake` and flushes it on resume. This line is the end-to-end proof
      of that — the wording comes from `agentRunQueued`, and reaching it at all
      means main queued rather than dropped.
    */
    await input.fill('run slack-watcher');
    await input.press('Enter');
    await expect(transcript).toContainText(
      'queued for slack-watcher — resume it to run',
    );

    await input.fill('resume slack-watcher');
    await input.press('Enter');

    /*
      `working` **or** `sleeping`, and the alternation is the point (HIVE-126).

      Resume flushes the queue, so the run this test queued a moment ago starts
      here — where before this story a resume only restored the status. Which of
      the two lands depends on whether the flushed wake could build a command:
      with a real `claude` on PATH it spawns and the row reads `working`; on a
      machine without one the wake is refused `invalid` and the row settles back
      to `sleeping`. Pinning either would make this spec depend on the
      developer's machine, which is what `pnpm test:agent` is for.

      What it proves either way is what it always proved: the pause was lifted
      in `agents.json`, not just in the renderer's copy of it.
    */
    await expect(status).toHaveText(/^(working|sleeping)$/);
  } finally {
    await app.close();
  }
});

/**
 * The agent view's own Pause control, wired in this story.
 *
 * Asserted against the **rail**, which is always on screen: the agent view has
 * no "Back to overmind" button — that control lives on a session's meta bar,
 * and HIVE-116 deliberately mounts no meta bar for an agent — so there is no
 * navigation back to the table from here, and none is needed. What matters is
 * that the click reached main and a second surface redrew from the push.
 */
test('pauses from the row’s slot, and the row agrees', async ({}, testInfo) => {
  const { app, page } = await launchWithConfig((name) => testInfo.outputPath(name));

  try {
    await authorAgent(page);
    await goToPlace(page, 'Agents');

    const panel = page.locator('[data-panel="agents"]');
    const row = panel.getByRole('button', { name: /^slack-watcher, / });

    await expect(row).toHaveAccessibleName(/^slack-watcher, sleeping/);

    // The slot's actions show on hover (HIVE-204); the page header has none.
    await row.hover();
    await panel.getByRole('button', { name: 'Pause slack-watcher' }).click();

    await expect(row).toHaveAccessibleName(/^slack-watcher, paused/);
    // The control names the move, not the state — one button, not two.
    await row.hover();
    await expect(panel.getByRole('button', { name: 'Resume slack-watcher' })).toBeVisible();
    // One play icon (#74): a paused agent refuses a run, so its row offers Resume and no Run now.
    await expect(panel.getByRole('button', { name: 'Run slack-watcher now' })).toHaveCount(0);

    await row.click();
    const view = page.locator('[data-view="agent"]');
    await expect(view).toBeVisible();
    /*
      The page header has no Pause. A paused agent's prompt row is the pause bar
      (HIVE-211), and its Resume is the one such control on the page.
    */
    await expect(view.getByRole('button', { name: /Pause/ })).toHaveCount(0);
    const pauseBar = view.getByRole('status').filter({ hasText: 'slack-watcher is paused.' });
    await expect(pauseBar.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
    await expect(view.getByRole('button', { name: /Resume/ })).toHaveCount(1);
  } finally {
    await app.close();
  }
});

/**
 * A run, start to finish, against a stub `claude` (HIVE-204): the run table
 * selects the newest run and the output heading names it.
 *
 * The stub is `agent-task-runs.spec.ts`'s idea — an executable that writes the
 * `stream-json` lines the fold reads and exits — so the run costs nothing and
 * everything between the row and the process is the real thing. The definition
 * has no `wake:` so the scheduler starts nothing of its own.
 */
const STUB = `#!/bin/sh
printf '%s\\n' '{"type":"system","subtype":"init","session_id":"stub","mcp_servers":[]}'
printf '%s\\n' '{"type":"assistant","message":{"id":"m1","content":[{"type":"text","text":"swept the channel"}]}}'
sleep 3
printf '%s\\n' '{"type":"result","subtype":"success","num_turns":1,"total_cost_usd":0.001,"session_id":"stub"}'
`;

const STUB_DEFINITION = `---
name: sweeper
description: Sweeps once when asked
icon: Ghost
---
Sweep the channel.
`;

test('runs from the row, and the run table selects the newest run', async ({}, testInfo) => {
  test.setTimeout(90_000);

  const configPath = testInfo.outputPath('hive-config.json');
  const stub = testInfo.outputPath('stub-claude');
  const folder = join(dirname(configPath), 'agents', 'sweeper');

  writeFileSync(stub, STUB);
  chmodSync(stub, 0o755);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'AGENT.md'), STUB_DEFINITION);
  writeFileSync(configPath, JSON.stringify({ version: 2, projects: [], claudeCommand: stub }));

  const app = await launchHive({
    userDataDir: testInfo.outputPath('user-data'),
    configPath,
    env: { CLAUDE_CONFIG_DIR: testInfo.outputPath('claude-config') },
  });
  const page = await app.firstWindow();

  try {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('nav[aria-label="Places"]');
    await goToPlace(page, 'Agents');

    const panel = page.locator('[data-panel="agents"]');
    const row = panel.getByRole('button', { name: /^sweeper, / });

    await row.hover();
    await panel.getByRole('button', { name: 'Run sweeper now' }).click();
    await expect(panel.getByRole('region', { name: 'Morphing' })).toBeVisible();

    /*
      A second press while it works is answered in line 2 — queued behind the
      run in flight — for five seconds.
    */
    await row.hover();
    await panel.getByRole('button', { name: 'Run sweeper now' }).click();

    const notice = panel.getByRole('status');

    await expect(notice).toContainText('sweeper');
    await expect(notice).toBeHidden({ timeout: 7_000 });

    await row.click();

    const receipts = page.getByTestId('run-receipts');

    // Every run finishes (the queued one too); the table follows the newest,
    // and the heading names it.
    await expect(receipts.locator('[data-live-run]')).toHaveCount(0, { timeout: 30_000 });
    await expect(receipts.locator('[role="button"]').first()).toBeVisible();
    await expect(receipts.locator('[aria-current="true"]')).toHaveCount(1);
    await expect(receipts.locator('[role="button"]').first()).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('run-output-heading')).toContainText(/^Output#/);
    await expect(page.getByTestId('run-output-heading')).toContainText('done');
  } finally {
    await app.close();
  }
});

/**
 * Drafts are kept, not guarded (HIVE-204): an edit survives a trip to Activity
 * and back, and Save is what makes it saved.
 */
test('keeps an unsaved definition across Activity and back, until Save', async ({}, testInfo) => {
  const { app, page } = await launchWithConfig((name) => testInfo.outputPath(name));

  try {
    await authorAgent(page, { stay: true });

    const description = page.getByRole('textbox', { name: 'description' });

    await description.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' closely');
    await expect(page.getByText('unsaved', { exact: true })).toBeVisible();

    await page.getByRole('radio', { name: 'Activity' }).click();
    await expect(page.getByText('Status', { exact: true })).toBeVisible();
    await page.getByRole('radio', { name: 'Definition' }).click();

    await expect(page.getByText('unsaved', { exact: true })).toBeVisible();
    await expect(description).toHaveValue('Watches the channel closely');

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('saved', { exact: true })).toBeVisible();
  } finally {
    await app.close();
  }
});
