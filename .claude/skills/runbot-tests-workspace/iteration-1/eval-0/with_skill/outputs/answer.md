# Runbot results for `master-mail-call-action-list-js-tref-nby`

## Conclusion

The latest batch is **red**. The only failing slot is **Enterprise Tests**, with **2 failed of 342 tests** in the website post-install tour tests.

- **Batch:** [2549935](https://runbot.odoo.com/runbot/batch/2549935) — status `error`, ~3 hours old (project: master / rd-1)
- **Failing slot:** `Enterprise Tests` (build 112108520). All other slots (Community Run, Enterprise Run, Templates, Upgrade, Check Style/Security, etc.) passed.
- **Failing child build:** 112109070 — "Post install tests for website" (`start_post_install_tests`)

## Failure 1 — tour `custom_popup_snippet` (JS crash)

- **Test:** `TestSnippets.test_custom_popup_snippet`
- **Source:** `/data/build/odoo/addons/website/tests/test_snippets.py:144`
- **Tour:** `custom_popup_snippet`
- **Root cause:** Uncaught JS `TypeError: Cannot read properties of undefined (reading 'after')` thrown in `website.website_builder_assets.min.js` at `onSelect` → `selectSnippet` → `onClick`. The website builder crashes when selecting/inserting the snippet — something the tour clicks resolves to `undefined` before calling `.after()` on it.
- **Reproduce:**
  ```
  ./odoo-bin -d test --test-enable --stop-after-init --test-tags odoo.addons.website.tests.test_snippets.TestSnippets.test_custom_popup_snippet
  ```
- **Chrome log:** http://runbot118.odoo.com/runbot/static/build/112109070-master/tests/112109070-master-all/chrome_logs/chrome_log_20260527_171644_311278_test_custom_popup_snippet.txt

## Failure 2 — tour `conditional_visibility_4` (step timeout)

- **Test:** `TestUi.test_10_website_conditional_visibility`
- **Source:** `/data/build/odoo/addons/website/tests/test_ui.py:444`
- **Tour:** `conditional_visibility_4`
- **Root cause:** Step 20/20 ("Check the order on the 'Invisible Elements' panel") timed out after 10000 ms. Trigger `.o_we_invisible_el_panel div:nth-child(3):contains('Text - Image')` was never found — the expected ordering / entry in the Invisible Elements panel did not appear.
- **Reproduce:**
  ```
  ./odoo-bin -d test --test-enable --stop-after-init --test-tags odoo.addons.website.tests.test_ui.TestUi.test_10_website_conditional_visibility
  ```
- **Chrome log:** http://runbot118.odoo.com/runbot/static/build/112109070-master/tests/112109070-master-all/chrome_logs/chrome_log_20260527_172314_875232_test_10_website_conditional_visibility.txt

## Useful links

- Full `start_post_install_tests` log: http://runbot118.odoo.com/runbot/static/build/112109070-master/logs/start_post_install_tests.txt
- Artifact zip: https://runbot118.odoo.com/runbot/static/build/112109070-master/logs/112109070-master-all.zip

## Note

Both failures are in `website` builder/UI tours. Given the branch name (`mail-call-action-list-js`) these look like a website-builder JS regression rather than a flaky timeout — failure 1 is a hard JS exception in the snippet-builder code, and failure 2 (panel ordering) plausibly stems from the same builder breakage. Worth checking the JS changes touching snippet selection / invisible-elements panel ordering.
