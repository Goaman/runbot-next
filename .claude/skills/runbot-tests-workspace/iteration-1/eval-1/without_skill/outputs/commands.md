# Commands run

Repo exploration:

```sh
ls -la
cat package.json
cat README.md
ls -R src/runbot
# read src/cli.ts
```

Investigation via the runbot-next CLI:

```sh
bun run src/cli.ts batches --search master-mail-call-action-list-js-tref-nby --json
bun run src/cli.ts batch 2549935 --json
bun run src/cli.ts tests 112108520
bun run src/cli.ts tests 112108520 --summary --json
bun run src/cli.ts tests 112108520 --json
```

Reproduction commands the failing build itself used (from the parsed log `command` field):

```sh
./odoo-bin -d test --test-enable --stop-after-init \
  --test-tags odoo.addons.website.tests.test_snippets.TestSnippets.test_custom_popup_snippet

./odoo-bin -d test --test-enable --stop-after-init \
  --test-tags odoo.addons.website.tests.test_ui.TestUi.test_10_website_conditional_visibility
```
