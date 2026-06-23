# Commands run

```sh
# 1. Find the latest batch for the branch (searches /runbot/rd-1 by default)
bun run src/cli.ts batches --search master-mail-call-action-list-js-tref-nby --json

# 2. Inspect the batch to see its build slots and which one failed
bun run src/cli.ts batch 2549935 --json

# 3. Retrieve the parsed test failures for the failing build slot (Enterprise Tests)
bun run src/cli.ts tests 112108520 --json
```

All commands were run from the repo root: /Volumes/Goadrive/git-repos/skill-runbot
