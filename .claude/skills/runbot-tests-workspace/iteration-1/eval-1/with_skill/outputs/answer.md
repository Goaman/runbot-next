# Enterprise Tests red on `master-mail-call-action-list-js-tref-nby`

## Conclusion

The latest batch for the branch (**batch 2549935**, ~3 hours old, status **error**)
has its **Enterprise Tests** slot (build **112108520**) red. Two `website` tours
fail in the post-install run (child build **112109070**):

1. **`TestSnippets.test_custom_popup_snippet`** — the real root cause.
2. **`TestUi.test_10_website_conditional_visibility`** — fails right after, almost
   certainly a knock-on effect of the same broken code.

## Root cause

`test_custom_popup_snippet` dies on an **uncaught JS TypeError** thrown while
selecting/dropping a snippet in the website builder:

```
UncaughtTypeError: Cannot read properties of undefined (reading 'after')
  at onSelect (website.website_builder_assets.min.js)
  at selectSnippet (...)
  at onClick (...)
```

So when the tour clicks to add the custom popup snippet, the builder's
`onSelect` handler reads `.after` off an `undefined` value and crashes. Because
the website builder JS is broken, the second tour
(`test_10_website_conditional_visibility`) then times out at step 20/20 waiting
for an Invisible Elements panel entry (`Text - Image`) that never appears — i.e.
the same builder breakage cascading into the conditional-visibility tour.

Given the branch name (`...-js-tref-...`), this points at a JS change in the
website builder snippet-selection code on this branch.

- Source: `addons/website/tests/test_snippets.py:144` (tour `custom_popup_snippet`)
- Source: `addons/website/tests/test_ui.py:444` (tour `conditional_visibility_4`)

## Reproduce commands (run locally)

Primary failure (the one to fix first):

```sh
./odoo-bin -d test --test-enable --stop-after-init \
  --test-tags odoo.addons.website.tests.test_snippets.TestSnippets.test_custom_popup_snippet
```

Secondary / cascading failure:

```sh
./odoo-bin -d test --test-enable --stop-after-init \
  --test-tags odoo.addons.website.tests.test_ui.TestUi.test_10_website_conditional_visibility
```

## Evidence / logs

- Build page: https://runbot.odoo.com/runbot/batch/2549935/build/112108520
- Child build (post-install website tests): https://runbot.odoo.com/runbot/build/112109070
- Chrome log for the popup crash:
  http://runbot118.odoo.com/runbot/static/build/112109070-master/tests/112109070-master-all/chrome_logs/chrome_log_20260527_171644_311278_test_custom_popup_snippet.txt
- Full post-install test log:
  http://runbot118.odoo.com/runbot/static/build/112109070-master/logs/start_post_install_tests.txt
- Artifact bundle:
  https://runbot118.odoo.com/runbot/static/build/112109070-master/logs/112109070-master-all.zip
