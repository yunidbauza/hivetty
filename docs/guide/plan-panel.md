# The plan panel

While a session works through a plan, the session panel's **Plan** tab shows the
tasks and how far along they are. Its session row carries the same count.

**On this page:** [What it shows](#what-it-shows) ·
[Where the tasks come from](#where-the-tasks-come-from) ·
[When it appears and leaves](#when-it-appears-and-leaves) ·
[The count on the session row](#the-count-on-the-session-row) ·
[Open and close it](#open-and-close-it)

## What it shows

The **Plan** tab is the first tab of the [session panel](tour.md#the-session-panel), at the
window's right edge. It lists every task by name. The one Claude is on shows its present-tense
wording ("Pushing the branch") under the title. Each task shows how long it ran, or has been
running, and the tab's head adds up the total. Times start when a task first goes in progress,
so rewriting the list does not reset them.

Closed, the session panel is a 46px strip with the plan on top:

| Part | Means |
| --- | --- |
| `3/7` at the top | tasks done, out of all of them |
| A numbered ring | a task not started yet |
| A green ring, pulsing | the task Claude is on now |
| A filled green check | a task that is done |
| `✓` at the top | every task is done |

**Where it came from** appears when the session has written a `hive:plan` file.
It names the file and the time it was written; click it to open the plan in the
editor. The file stays there after the tasks move on to Claude's own list, and
goes when the session ends.

A session started from a ticket also has a **Ticket** tab, between Plan and Files: the
ticket's criteria, its latest comment and its links. See [The Ticket
tab](work-and-prs.md#the-ticket-tab).

## Where the tasks come from

A session has one plan at a time. When more than one source offers one, the
higher one in this list wins:

1. **Claude's own task list.** When Claude breaks work into tasks with its task
   tools, those tasks are the plan, ticked as Claude works through them.
   A subagent's tasks are left out.
2. **A `hive:plan` file.** When the session writes or edits a plan in its
   repository's `.hive/plans/` folder, the plan's tasks show up. `hive:work-on`
   and `hive:goal-on` both write one, so their sessions always have a plan.
   The file must sit under the folder the session is working in. It is read
   again at the end of every turn, so a step ticked some other way, from a
   shell command or by hand, still shows. A builder
   agent working that plan ticks them off through the ledger as it goes:
   in progress when it starts a task, done when the task's commit lands.
3. **Plan mode.** When you approve Claude's plan in plan mode, its steps show
   up as proposed tasks, none started, until one of the sources above takes
   over.

## When it appears and leaves

The Plan tab appears as soon as the session's plan has a task. It leaves whenever
the conversation ends: `/clear`, `/done`, a plain `/exit`, a crash or a kill, a
restart, or the terminal closing.

## The count on the session row

The same `done/total` sits in green after the session's status, both in the
Sessions panel and in the overmind's fleet table. You can see how far a
background session has got without opening it.

## Open and close it

Click **›** at the end of the tabs, or press `⌘⌥B`, to close the session panel to its
strip; click the plan's rings or any icon on the strip, or press `⌘⌥B` again, to open it.
It remembers whether it was open. Under 1,200px wide it stays a strip.
