# CLI commands run

All run from `/Volumes/Goadrive/git-repos/skill-runbot`.

```sh
# 1. Find the branch's batches (newest first)
bun run src/cli.ts batches --search master-mail-call-action-list-js-tref-nby --json

# 2. List build slots in the latest batch to find the failing one
bun run src/cli.ts build-names 2549935 --json

# 3. Pull parsed test failures for the failing slot
bun run src/cli.ts tests --batch 2549935 --slot "Enterprise Tests" --exact --summary --json
```
