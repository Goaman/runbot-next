# Why is the Enterprise Tests build red on `master-mail-call-action-list-js-tref-nby`?

## Short answer

The Enterprise Tests build failed because **two website JS tours crash with the same uncaught JavaScript error**:

```
TypeError: Cannot read properties of undefined (reading 'after')
    at onSelect (website.website_builder_assets.min.js)
    at Object.selectSnippet (website.website_builder_assets.min.js)
    at component.onClick (website.website_builder_assets.min.js)
```

The post-install test step summary reports: **`2 failed, 0 error(s) of 342 tests`**.

Both failures originate in the website "website_builder" assets (the snippet `selectSnippet` / `onSelect` code path), which is consistent with the branch name (`mail-call-action-list-js` — a JS change). The error is an uncaught client-side `TypeError` thrown while selecting a snippet, which aborts the tour and fails the Python test that drives it.

## Failing build

- Branch: `master-mail-call-action-list-js-tref-nby`
- Batch: `2549935` (status: error)
- Enterprise Tests build slot: build `112108520` (status: error)
- Failing sub-build (post-install tests): `112109070` — "Post install tests for website / restore / start_post_install_tests"

## The two failing tests

1. `odoo.addons.website.tests.test_snippets.TestSnippets.test_custom_popup_snippet`
   - File: `addons/website/tests/test_snippets.py` (line 144, `start_tour(...)`)
   - Tour: `custom_popup_snippet`
   - Crash: `UncaughtTypeError: Cannot read properties of undefined (reading 'after')` in `selectSnippet`/`onSelect`.

2. `odoo.addons.website.tests.test_ui.TestUi.test_10_website_conditional_visibility`
   - File: `addons/website/tests/test_ui.py`
   - Tour: `conditional_visibility_4`

Both are `start_tour` (HttpCase tour) tests. The Python assertion is just `self.fail(str(error))` in `odoo/tests/common.py:browser_js` — the real cause is the browser-side `TypeError` above, almost certainly introduced by the JS change on this branch.

## Commands to reproduce the failing test locally

The Runbot post-install step runs each tour test isolated with this exact command (taken from the build log):

```sh
# Test 1 (custom_popup_snippet)
./odoo-bin -d test --test-enable --stop-after-init \
  --test-tags odoo.addons.website.tests.test_snippets.TestSnippets.test_custom_popup_snippet

# Test 2 (conditional_visibility)
./odoo-bin -d test --test-enable --stop-after-init \
  --test-tags odoo.addons.website.tests.test_ui.TestUi.test_10_website_conditional_visibility
```

Run from your odoo checkout (community + enterprise addons on the path, on the `master-mail-call-action-list-js-tref-nby` branch). Add `--addons-path=...` for community + enterprise and `-i website` to install on a fresh DB if needed, e.g.:

```sh
./odoo-bin -d test_db --addons-path=addons,../enterprise -i website --stop-after-init
./odoo-bin -d test_db --addons-path=addons,../enterprise \
  --test-enable --stop-after-init \
  --test-tags odoo.addons.website.tests.test_snippets.TestSnippets.test_custom_popup_snippet
```

## How I found this (runbot-next CLI)

```sh
bun run src/cli.ts batches --search master-mail-call-action-list-js-tref-nby --json
bun run src/cli.ts batch 2549935 --json          # find the "Enterprise Tests" slot -> build 112108520 (error)
bun run src/cli.ts tests 112108520 --summary --json   # 2 failed tours + summary
bun run src/cli.ts tests 112108520 --json             # full crash details incl. the reproduction command
```
