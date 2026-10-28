# Jira and pull requests

**Work** on the bar lists your Jira tickets. **PRs** on the bar lists your GitHub pull
requests. Both refresh every 60 seconds; overscroll either list to refresh now.

**On this page:** [Connect Jira](#connect-jira) · [The Work list](#the-work-list) ·
[Start a session from a ticket](#start-a-session-from-a-ticket) · [The PRs list](#the-prs-list)

## Connect Jira

Until Jira is connected, Work has no list at all: the stage reads **Jira isn't connected**,
with **Connect Jira** and **Learn what HiveTTY reads**, both of which open
**Settings › Integrations**. If the first read fails, the same page shows Jira's error and
**Retry**. Connected with nothing assigned, it reads **No tickets for you**.

1. Open **Settings › Integrations** and scroll to **JIRA**.
2. **Site**: the bare hostname, like `your-team.atlassian.net`. A pasted `https://` is trimmed.
3. **Account email**: the address you sign in to Jira with.
4. **API token**: create one at id.atlassian.com, paste it, then **Test connection**.

![Settings › Integrations: GitHub token source, gh status, and the Jira site](../assets/guide/16-settings-integrations.png)

The site and email live in `~/.hive/config.json`. The token does not: it is encrypted with
the macOS Keychain and never leaves the main process.

```json
"jira": {
  "site": "your-team.atlassian.net",
  "email": "you@example.com"
}
```

## The Work list

By default it shows:

```text
assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC
```

Set **JQL override** in the same Settings band to change it. Your query **replaces** the
default; it is not added to it.

On each ticket you can move it through its workflow, read and add comments, and see the PRs
and sessions linked to it. Type in **Search tickets** to search every ticket, any assignee,
any status; tick **Mine only** to narrow it.

When a refresh fails after a good read, the list stays and an amber line above it says when:
"Couldn't reach Jira at 10:42. Showing what was loaded at 10:31." **Try again** re-reads.
The PRs list does the same for GitHub.

## The ticket page

**Work** is a place of its own. The list panel lists your tickets in three groups,
**In progress**, **To do** and **Done** (Done starts folded; click a group's name to fold
or unfold it). The panel's head counts the tickets and how many **need you**.

Each row is one line of title and one line of facts: the key, then the one thing that
matters most about the ticket right now, first match wins:

- `waiting on you`: a session on it is asking you something.
- `2 findings on #412`: a review left findings on its pull request.
- `builder · task 3 done`: an agent's latest progress on it.
- `session working`, `1 idle session`, or `no session`.

A status that differs from its group, like `In Review` inside In progress, leads the line.
The dot is amber when the ticket needs you, green while a session or an agent works it, and
an empty ring otherwise. The magnifier shows **Search tickets**; a search replaces the list.

Click a row and the ticket's page fills the stage. Work opens on the first ticket, and
afterwards on the one you last opened; if that one leaves the list, the ticket after it
takes its place (the first, when it was the last). PRs and Agents do the same.

- **The top**: the key (it opens Jira), the status pill (click it to move the ticket),
  the title, then the description.
- **Conversation**: Jira's newest 50 comments, oldest first. **Comments | Everything**
  switches between the comments alone and the comments with what the agents and sessions
  posted about the ticket, in time order. Hover a comment for **Reply** and **Copy link**.
  Reply addresses the box below to its author and starts the comment with an @mention of
  them, drawn as a chip above the box; **×** removes it, and Escape in an empty box forgets
  the reply and its chips. Reply on an agent's comment adds no chip, since that comment is
  yours in Jira. Type `@` and two characters to search everyone on the Jira site: ↑/↓ move,
  Enter picks a person into a chip, Esc closes the list. **Could not search Jira** means the
  search failed; the box still works. A comment may be mentions alone. The box posts to
  Jira, where everyone on the ticket sees it, and Jira notifies each person mentioned.
  A comment HiveTTY posted for an agent shows the agent's glyph, its name and **via the
  Hive**. That is a label, not proof: anyone who can edit the issue can set it.
- **Properties**, on the right: status, priority and side (read off a title's `[P4]` and
  `[BE]` tags when it has them), project, assignee, the agent on it and its epic; the
  sessions and pull requests on it; and the actions: **New session**, **Move to** the next
  status when there is one, and **Open in Jira**.

The page re-reads the ticket every minute while it is open. A read that fails says so in
its section with **Retry**, and what was already on screen stays, marked with its time.

## The Ticket tab

A session started from a ticket has a **Ticket** tab in the session panel,
so what was asked for sits beside what the session says it did. Top to bottom:

- **The top**: the key, the type and the status pill, then the title.
- **Acceptance criteria**: the list items under the description's "Acceptance" or
  "Acceptance criteria" heading. With no such list it shows the **Description** instead.
- **Latest comment**: the newest one, with its author and time.
- **Links**: a line of verdict, a drawing, and a row for each kind of link that opens its
  list. Click a ticket in a list, or in the drawing, to open it on the Work page.
- **The footer**: **Move to** the next status when there is one, and **Open the ticket ›**,
  which opens the ticket's page on Work.

The verdict is amber when something open blocks the ticket: `Blocked by 2 open: HIVE-188,
HIVE-190.` Otherwise it is green: `Clear to go.` then `Nothing blocks it`, `Its one blocker
is done` or `All 3 blockers are done`, and `; 1 ticket waits on it` or `; 4 tickets wait on
it` when others wait on this one.

The drawing, the constellation, puts the ticket in the middle of its epic's ring. What it
**waits on** is on the upper arc and what **waits on it** on the lower, one cell per ticket:
a check for done, a filled dot for in progress, an empty ring for to do, amber when it is
a blocker not done. Past six on an arc it shows five and a `+N`. Related tickets are beads
on the ring's left, labelled only up to three of them. The session's pull request is to the
right. Keys in the ticket's own project drop the prefix. The epic's name heads the ring,
with `done/total` when Jira can count its children. With five links or fewer, a ticket the
ticket blocks also shows the first ticket **it** blocks, one step further out.

"Blocks" means Jira's link type of that name, whatever its wording; every other type
(Relates, Duplicate) is a bead. A ticket with no links says `No linked tickets`.

The tab reads the ticket when it opens, and again every minute while it is the visible
tab. A failed read says so with **Retry**, and what was already shown stays.

## The PR tab

A session that has opened a pull request gets a **PR** tab in its panel, between
Ticket and Files (HIVE-209). Top to bottom: `#313 · INCUBATING · open`, the
title, `head → base · +75 −6 · 2 files`; **Checks 2 of 4**, one row per check in
GitHub's order with its time (`41s`, `running 2m`, `queued`); **Review**, the
shipper while it holds the PR ("took it · checks running") and each reviewer,
requested or with a verdict; **Open threads**, each unresolved thread as
`path:line` with its first comment — click one to open the file at that line;
then **Open on GitHub** and **Show in PRs**. The details re-read once a minute,
only while the tab is showing.

The tab and its strip icon appear when the sweep first matches a PR to the
session's branch; the panel does not switch to it. Both carry a dot in the PR's
flap tone: amber when it needs you, green while it moves, grey for a draft,
parked or remembered PR, brand once merged. A PR the sweep can no longer see
(remembered) shows its number, "last seen" and Open on GitHub only.

## Start a session from a ticket

Click **New session** under a ticket page's Actions. The picker opens with the ticket key filled in, because a
ticket does not say which repository it belongs to. Pick the project and press Enter.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/diagrams/ticket-to-pr.dark.svg">
  <img src="../assets/diagrams/ticket-to-pr.light.svg" alt="A Jira ticket starts a session named for it; its branch becomes a pull request that links back to the session">
</picture>

The session is named for the ticket, and names stay unique: `ABC-123`, then `ABC-123-2`.
From here, [Working a ticket](workflow.md) walks the rest of the way to Done.

### The ticket workflow

**Settings › Integrations › Jira › Ticket workflow** decides what a session started from a ticket does first:

- **Just open** (the default): the session opens at an empty prompt.
- **Run a skill**: the skill runs on the ticket as the session's first message, `/hive:work-on ABC-123`.
  Pick one of your skills, or **Type one…** for another plugin's, like `workstream:work-on`.
- **Hand to an agent**: either **The session asks it** (the session's first message has it `ledger_ask` the
  agent with the ticket), or **Instead of a session** (no terminal opens; the picker's **Wake builder** asks
  the agent and takes you to its page).

An **Extra prompt** goes after the ticket key every time, and can use `{key}`, `{title}`, `{type}` and `{url}`.
The setting shows what it will send for an example ticket.

The picker shows the result as its **First message** line. Change it there for one session; ⌥↵ starts at an
empty prompt whatever the setting says. In `config.json` the setting is `jira.workflow`:

```json
"jira": {
  "workflow": { "kind": "skill", "skill": "hive:work-on", "prompt": "keep it to one PR" }
}
```

or `{ "kind": "agent", "agent": "builder", "via": "session" }` (`via` is `session` or `wake`).

## The PRs list

The list comes from the GitHub CLI, run as you, with two searches:

```text
is:pr author:@me is:open   sort:updated-desc
is:pr author:@me is:merged sort:updated-desc    (kept for 24 hours)
```

Each row opens the pull request's page on the stage, with its conversation, files, checks
and the session whose branch made it. **Search pull requests** filters the list. HiveTTY stores no GitHub token; `gh` uses its own login, or `GH_TOKEN` /
`GITHUB_TOKEN` if set.

**Checks.** The PR page's Checks tab shows the branch's latest run without
opening GitHub: the last eight pushes as squares (click one to see it), every
job as a box laid out by its `needs`, a failed job glowing red with its steps
and its log cut to the failing assertion beside them, and **Re-run failed**.
The graph takes the stage's whole width; the zoom bar above it steps from 25%
to 200%, **Fit to width** shows all of a wide one, and the percentage goes back
to 100%. A trackpad pinch, or the scroll wheel with ⌘ or Ctrl held, zooms
about the pointer. The tab carries a red dot while a check fails, and clicking a check in the
right-hand column opens it here. Checks from outside GitHub Actions (a deploy
preview, a scanner) sit in a row under the graph with a link out. The tab reads
GitHub only while it is open.

If the list stays empty, run `gh auth status`. **Settings › Integrations › Command line** shows
which `gh` HiveTTY found and who it is signed in as.

The PRs place says this itself. With `gh` signed out the stage reads **The
GitHub CLI isn't signed in**, shows `gh auth login`, and offers **Open a terminal** (in the
project on stage, else the first project) and **Check again**. `gh` not installed and no
GitHub project get their own titles with the same two buttons.

## What the agents are doing

When the workflow agents are on a piece of work, the rows say so. A ticket an agent is
working shows its newest progress under its title, named by the agent: `builder · task N done`,
`shipper · ci`, `fixer · fix`; a PR the shipper is shipping shows one
more badge, `shipping`, beside the GitHub ones. A draft without it is one nobody is driving.
Both are read off the ledger: the badge goes when the shipper releases its claim on the PR, the agent line when the ledger tail
rolls past it, and a ticket worked inline shows nothing extra. To look at what the
builder or the fixer has on disk, `term builder` in the console opens a terminal on
the worktree it last posted.
