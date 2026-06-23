---
name: runbot-tests
description: >-
  Investigate Odoo Runbot test failures for a branch using the runbot-next CLI.
  Use this whenever someone asks about Runbot results — "what failed on branch
  X", "show me the last tests / latest batch for <branch>", "why is this build
  red", "get the test failures / tour failures / traceback for a Runbot build or
  batch", or wants to find the reproduce command for a failing Odoo test. Works
  from the runbot-next repo and fetches public Runbot pages, parses them, and
  returns structured Python, tour, and Hoot test failures without scraping by
  hand.
---

# Investigating Runbot test failures

The `runbot-next` CLI turns public Odoo Runbot pages (projects → branches →
batches → builds → logs) into structured JSON. Use it to answer "what failed and
why" for a branch without opening a browser or scraping HTML.

## Prerequisites

- Run from the repo root (where `package.json` for `runbot-next` lives). All
  commands below assume that working directory.
- `bun` must be installed (the CLI is `src/cli.ts`).
- Network access to `https://runbot.odoo.com` (the default base URL).

Invoke the CLI with either form — they're equivalent:

```sh
bun run src/cli.ts <command> [...args]
bun run runbot <command> [...args]      # script alias in package.json
```

Add `--json` to any command to get raw JSON instead of the pretty console dump.
Prefer `--json` when you need to read fields reliably or pipe into `jq`.

## The core workflow

Investigating "the last tests for branch `<branch>`" is almost always these
three steps. Don't guess build IDs — discover them.

### 1. Find the branch's batches (newest first)

```sh
bun run src/cli.ts batches --search <branch-name> --json
```

- The list is ordered newest-first, so the **first entry is the latest batch**.
- Each entry has `id` (the batch id), `path`, `buildIds`, and a `status`
  (`success` / `error` / running). An `error` status means something in that
  batch failed — that's your target.
- Default project is `/runbot/rd-1` (the `master` project). For a different
  project, pass its path as the first argument:
  `bun run src/cli.ts batches /runbot/rd-2 --search <branch> --json`.
- Add `--pr` to restrict to branches that have an associated PR.

### 2. Find which build slot failed

```sh
bun run src/cli.ts build-names <batch-id> --json
```

This lists every build slot in the batch with its `status`. Scan for the slot(s)
with `status: "error"`. Typical slots: `Community Run`, `Enterprise Run`,
`Enterprise Tests`, `Community Unit`, `Upgrade current`. The `*Tests`/`*Unit`
slots are where test failures usually surface.

### 3. Pull the parsed test failures

By batch + slot name (most ergonomic — no build id needed):

```sh
bun run src/cli.ts tests --batch <batch-id> --slot "Enterprise Tests" --exact
```

Or directly by build id (e.g. the failing id from step 2):

```sh
bun run src/cli.ts tests <build-id>
```

Useful flags:

- `--exact` — match the slot name exactly. Use it to avoid substring collisions
  (e.g. `Run` matches both `Community Run` and `Enterprise Run`; `Tests` is
  usually unique).
- `--summary` — also include the run's summary lines (totals, slowest tests).
- `--unparsed` — include error log chunks the parser couldn't classify. Reach
  for this when `tests` comes back empty but the slot is red — the failure
  format may be unrecognized, and the raw chunks still tell you what broke.

## Reading the `tests` output

Each entry in the `tests` array is one failure. The fields that matter:

- `kind` — `python`, `tour`, or `hoot`.
- `title` — the test name, e.g. `TestSnippets.test_custom_popup_snippet`.
- `pythonTest` / `pythonFile` — fully-qualified test path and source file:line.
- `tourName` — for tour failures, the JS tour that failed.
- `command` — **the reproduce command**. This is the single most useful field;
  it's the exact `./odoo-bin ... --test-tags ...` invocation to rerun the test
  locally. Surface it to the user.
- `crashes` — structured JS/Python errors (title + message + stack), including
  uncaught browser errors that precede a tour failure.
- `lines` / `sourceLines` — the raw `FAIL:`/traceback log lines.
- `child` — the child build the failure came from, with `links` (full logs,
  Chrome logs, Mailhog, artifact zip). Use these URLs to dig deeper.

## Going deeper

When the parsed failure isn't enough:

- `bun run src/cli.ts build <build-id> --json` — full build page: commit info
  plus `run`, `log`, `artifact`, `database`, and `mailhog` links.
- `bun run src/cli.ts link <build-id> <kind> [match]` — resolve one link of a
  kind (`run`, `base`, `database_selector`, `mailhog`, `log`, `artifact`). Use
  this to grab a runnable build URL or a specific log file fast.
- `bun run src/cli.ts batch <batch-id> --json` — bundle metadata, commits, and
  every build reference in the batch.
- `bun run src/cli.ts build-in-batch <batch-id> <build-id> --json` — build
  details in a batch context.

To read an actual log file, take a `log`-kind URL from the build/test output and
fetch it (the CLI's link/build commands give you the URL; fetch with your normal
tools).

## Reference

- `bun run src/cli.ts projects --json` — list public Runbot projects and their
  paths (to find the right `path` for step 1).
- `bun run src/cli.ts tools --json` — full list of underlying tools and their
  input schemas.
- `bun run src/cli.ts help` — command usage.

## Reporting back

Lead with the conclusion: which batch (with status and age), which slot failed,
and the failing test name(s). For each failure give the reproduce `command`, the
source `pythonFile`/line, and a one-line root cause from `crashes`/`lines`.
Include the relevant log/artifact URL so the user can verify. If nothing failed,
say so plainly rather than padding.
