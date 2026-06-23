# Commands run

All run from the repo root `/Volumes/Goadrive/git-repos/skill-runbot`.

```sh
# Inspect repo / CLI
cat package.json
cat README.md
bun run src/cli.ts --help

# List projects to find the right one (branch is R&D / rd-1)
bun run src/cli.ts projects

# Find the batch for the branch
bun run src/cli.ts batches /runbot/rd-1 --search master-mail-call-action-list-js-tref-nby --json

# Batch details (build slots + statuses) -> batch 2549935, Enterprise Tests = error
bun run src/cli.ts batch 2549935 --json

# Test failures for the failing build slot (Enterprise Tests, build 112108520)
bun run src/cli.ts tests 112108520 --json
bun run src/cli.ts tests 112108520 --summary --json

# Concise extraction of failing tests / messages via jq
bun run src/cli.ts tests 112108520 --json | jq -r '.tests[] | "\(.kind) | \(.title) | tour=\(.tourName) | \(.pythonTest)"'
bun run src/cli.ts tests 112108520 --json | jq -r '.tests[] | "=== \(.title) (tour: \(.tourName)) | child build \(.child.id) status=\(.child.status) ===\n" + ([.lines[].message] | first) + "\n"'
```
