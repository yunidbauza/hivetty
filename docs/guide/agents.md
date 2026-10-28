# Agents

An agent is a `claude` that works in the background. It wakes on a schedule, a message or a
Slack mention, does one job, reports through the [ledger](ledger.md), and goes back to
sleep. It asks you before it does anything you have not allowed.

**On this page:** [What an agent is](#what-an-agent-is) · [Create an agent](#create-an-agent) ·
[AGENT.md reference](#agentmd-reference) · [When an agent wakes](#when-an-agent-wakes) ·
[The tools fence](#the-tools-fence) · [Watch an agent work](#watch-an-agent-work) ·
[Task runs](#task-runs) · [Memory and rotation](#memory-and-rotation)

## What an agent is

One file, `~/.hive/agents/<name>/AGENT.md`: frontmatter that says when and how it runs, and a
body that is its standing job. Each wake is one headless `claude -p` run that resumes the
last one, so it remembers.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/diagrams/agent-wake.dark.svg">
  <img src="../assets/diagrams/agent-wake.light.svg" alt="An agent wakes, reads its ledger inbox, does its job, then either asks you and waits for the answer or reports done">
</picture>

## Agents the app ships

Agents come with HiveTTY: the app's own `resources/agents/` is copied into
`~/.hive/agents` on launch, the way shipped skills are ([Custom skills](skills.md)).
Today that is **builder**, which builds an approved plan in its own worktree and opens
the draft PR, **shipper**, the PR endgame, **acr**, the reviewer it asks (named after the
review tool it runs, `acr`, which is a command on the machine, not this agent), and **fixer**,
which works through a PR's findings on the PR branch. Your edits win, and updates still arrive
around them: each setting and the prompt update on their own, so a `limits.parallel` you raised
stays raised while a new prompt and new keys such as `lane:` still land. Settings › Agents marks
an agent you changed with a blue dot and names what differs, with **Reset to shipped**. If you
rewrote the prompt and a newer one ships, the dot turns amber and the new prompt is held until
you choose **Compare**, **Take shipped prompt** or **Keep mine**. An agent you deleted stays deleted.

## Create an agent

The Agents panel head's **+** opens a new agent's page on **Definition**. The form sits
on the left and the file's source on the right; both edit the same text. Drag the line
between them to give either more room (each keeps a minimum width; double-click the line
to put it back). When the stage is narrower than 900px they become **Form | Source**
tabs. The bar above them names the file, or says *not saved yet*, and
reads **unsaved** in amber until you **Save**.

Your edits are kept: go to another agent or another place and come back, and the unsaved
text is still there. **Revert** puts it back to what is on disk. **Delete** asks first,
then removes the folder and closes the page.

**Settings › Agents** lists your agents and edits them in place: click one, or
**+ New agent**, and the same editor opens beside the list behind **Form | Source** tabs,
with Settings still open. It shares the page's unsaved text, so an edit made in one shows
in the other. A file you write by hand shows up without a restart, and a broken one is
listed with its problem.

![Settings › Agents with the form for standup-bot](../assets/guide/21-agent-form.png)

**Example.** An agent that checks your PRs every half hour and asks before it comments:

```yaml
---
name: pr-patrol
description: Watches my open PRs and asks before it comments on any of them
icon: ph-git-pull-request
model: sonnet
effort: medium
wake:
  every: 30m
  check: always            # the work lives on GitHub, not in the ledger
  quiet: 22:00-07:00
  on: [ledger]
tools: [Read, Grep, Bash(gh pr *)]
autonomy: ask
limits:
  turns: 30
  budget_usd: 2
  daily_usd: 10
---

Check my open pull requests with `gh pr list --author @me`.
When one has a failing check or an unanswered review comment, ask me with
ledger_ask what to do, naming the PR in the first line.
When nothing needs me, end the turn without posting.
```

Write the body as an instruction ("watch X, when you find Y, do Z"), not a description.

## AGENT.md reference

Keys are snake_case. An unknown key is an error, not ignored.

| Key | Values | Default |
| --- | --- | --- |
| `name` | lower-case, digits, dashes; equals the folder name | required |
| `description` | one line, shown in the Agents panel | required |
| `icon` | a Phosphor icon name, like `ph-robot` | required |
| `model` / `effort` | as for sessions | Claude's default |
| `wake.every` | `5m`, `2h`, `daily` (whole minutes, at least 1m) | none |
| `wake.at` / `wake.days` | `[09:00, 17:00]` / `[mon, tue, …]` | none |
| `wake.on` | `ledger`, `slack.mention`, `slack.app_mention`, `slack.channel:#name` | none |
| `wake.quiet` | `23:00-07:00` | none |
| `wake.check` | `onchange` or `always` | `onchange` |
| `tools` | rules that run without asking: `Read`, `Bash(git *)`, `mcp__slack__*` | none |
| `autonomy` | `ask` (ask before anything consequential) or `act` | `ask` |
| `skills` | skill names to allow | none |
| `mcp` | `[slack]` | none |
| `lane` | `thread` or `repo`, see [Lanes](#lanes) | none |
| `limits.turns` | turns per wake | 40 |
| `limits.budget_usd` / `limits.daily_usd` | per-wake / per-day spend cap | none |
| `limits.rotate_after` | wakes before a fresh session | 50 |
| `limits.parallel` | runs at once, across lanes and task runs | 1 |
| `container.*` | run inside a container, see [Containers](containers.md) | none |

A `#` after two or more spaces starts a comment; after one space it is text, so
`slack.channel:#eng` works.

## When an agent wakes

| Trigger | Set by |
| --- | --- |
| Every N minutes | `wake.every` |
| At set times | `wake.at`, optionally `wake.days` |
| A ledger entry addressed to it | `wake.on: [ledger]` |
| **▶ Run now**, or `run <agent>` | you |
| A Slack mention or channel message | `wake.on: [slack.app_mention]` and Socket Mode |

- Scheduled wakes can be up to a minute late. A missed window wakes once, however long the
  app was closed.
- **Quiet hours** hold scheduled wakes; messages still wake it.
- With `check: onchange` (the default), a tick with nothing new is skipped. The **Wake** tile
  counts skips. Use `check: always` when the work lives outside the ledger.
- An agent that is **asking** skips scheduled wakes; your answer is its wake.
- `limits.daily_usd` holds every wake once the day's spend reaches it, and says so in the
  inbox. A held wake runs when a run ends or the next day.

## Lanes

`lane: thread` or `lane: repo` lets an agent hold several conversations at once. With
`thread`, each new ask opens its own conversation and keeps it until that ask closes. With
`repo`, each `meta.repo` gets one conversation that every ask for that repository joins. The
agent's standing conversation stays: it takes schedules, broadcasts and anything no lane
claims. Each lane has its own session, working directory and queue.

Up to `limits.parallel` runs go at once, counted across every lane and task run. A second
wake on a busy lane waits for that lane's run to end, a wake over the cap waits for any run
to end, and a wake over the day's budget waits for a run to end or for the next day. Nothing
is dropped: the entry stays queued on its lane. The mechanism is in
[agents and the ledger](../agents-and-ledger.md).

## The tools fence

`tools:` lists what the agent may do **without asking**. Anything else is stopped and becomes
a permission card in your [inbox](inbox.md), showing the real call. Choose **once**, a
family like `git *`, or **all Bash**. A permanent grant is written back into `tools:`.

Commands with `;`, `&`, `|`, `<`, `>`, a backtick, `$(` or a newline are always asked. The hive ledger tools are
always allowed.

### Unattended merges

The shipper agent does not hold `gh pr merge`, so every merge it reaches stops at the
fence and becomes a card. **Settings › Projects › ⋯ › Merge PRs unattended** is the
consent to skip that card for one project: it writes `autoMerge: true` on the entry, and
from then on each shipper wake carries a grant for `gh pr merge … --repo <that repository>`
and nothing else. Other projects' merges still ask. The repository is read from `gh` when
the app starts and when a wake first needs it; a project `gh` cannot place grants nothing,
and its merge asks as before.

## Watch an agent work

![The agent page: Activity with its status tiles, run log and ledger](../assets/guide/10-agent-view.png)

- **The Agents panel**: three lanes, each folding under its name. **Summons** holds what
  needs you (asking, failed, or a definition that will not parse), asking first.
  **Morphing** holds what is working. **Burrowed** holds what rests: sleeping, then paused,
  since nothing wakes a paused agent. The panel's head counts summons and morphing, and the
  bar's Agents icon counts what is working.
- **A row** is the agent's hexagon (amber when it asks, red when it failed, green while it
  works, a count when more than one run is live), its name with the age of its last word,
  and that last word: what it last put on the ledger (`ask a3 Reply to Marcos?`,
  `done Shipped #303`). Hover or focus it for **▶ Run now** and **⏸ Pause**; a paused
  agent offers only **▶ Resume**, since it would refuse a run; an answer that is not a start shows in the row for five seconds.

![The Agents place: the agents' lanes in the list panel](../assets/guide/09-agents-tab.png)

- **Agent page** (click an agent): the agent's name over its description, the
  **Activity | Definition** switch and **Run now**. **Run now** works from both views; with unsaved
  edits it says to save first, because a wake reads the file and not what is on screen.
- **Activity**: one row of facts (Status, Wake, Next, Today `N runs · $X`, Session); the
  **run table** (Outcome, Turns, Took, Cost) over the output, beside the agent's ledger.
  The table selects a run and the output's heading names it (`Output #4d7d5c5e done · 5
  turns · 13s · $0.12`); click a row, or Enter or Space on it, to read another. A new run
  takes the selection only if you were on the latest one, so a run you picked stays put.
  A failed outcome reads red with its reason beside it, an asking one amber.
- The box at the bottom posts to the agent. `answer a1 yes, go ahead` answers its open ask; the ref works in any case (`a1` or `A1`).
- **Paused.** A paused agent's Status reads amber, and the box gives way to a bar: "acr is
  paused. Nothing wakes it, not the ledger, not a schedule, until you resume it." **Resume**
  brings the box back with whatever you had typed in it.
- **No agents yet.** With no agent defined, the Agents place has no list and
  the stage offers **New agent**.
- To stop a run now, use `kill <agent>` in the console.

## Task runs

With `limits.parallel` above 1, `run pr-patrol review PR 1234` (or `@hive pr-patrol …` in
[Slack](slack.md)) starts a **task run**: a fresh session for one job, beside the standing
one. Past the limit, runs queue.

## Memory and rotation

Every wake resumes the same conversation. After `rotate_after` wakes, the agent is asked to
leave a handoff note, and the next wake starts a fresh session that opens with it.
`rotate <agent>` does that now.

A resumed conversation keeps the instructions it started with, so editing an agent's
definition (or an app update to its preamble) rotates it the same way: the next wake
hands off under the old instructions, and the one after starts fresh on the new ones.
