# Commands run

All run from `/Volumes/Goadrive/git-repos/skill-runbot`.

```sh
# 1. Find the branch's batches (newest first)
bun run src/cli.ts batches --search master-mail-call-action-list-js-tref-nby --json

# 2. Find which build slot failed in the latest batch
bun run src/cli.ts build-names 2549935 --json

# 3. Pull parsed test failures for the red Enterprise Tests slot
bun run src/cli.ts tests --batch 2549935 --slot "Enterprise Tests" --exact --json
```
