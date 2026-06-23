# Last tests for branch `master-mail-call-action-list-js-tref-nby`

## Summary

The latest Runbot batch for this branch is **#2549935** (created ~3 hours ago on 2026-05-27, project `/runbot/rd-1`).
The batch is in **error** status. Out of 12 build slots, only one failed:

| Build slot | Build ID | Status |
|---|---|---|
| Minimal check | 112107869 | success |
| Odoo LS Check | 112108517 | success |
| Community Run | 112108518 | success |
| Enterprise Run | 112108519 | success |
| **Enterprise Tests** | **112108520** | **error** |
| Templates enterprise | 112108521 | success |
| Upgrade current | 112109345 | success |
| Distro check | 112108522 | success |
| Check Style | 112108523 | success |
| Check Security odoo | 112108524 | success |
| Code Owner | 112108525 | success |
| CLA | 112107870 | success |

## Failing tests (build slot "Enterprise Tests", build 112108520)

Two test failures were parsed, both `website` tours that failed in the child build
**112109070** ("Post install tests for website / restore / start_post_install_tests", duration 31m):

### 1. `TestSnippets.test_custom_popup_snippet`
- Python test: `odoo.addons.website.tests.test_snippets.TestSnippets.test_custom_popup_snippet`
- File: `/data/build/odoo/addons/website/tests/test_snippets.py:144`
- Tour: `custom_popup_snippet`
- Failure: JavaScript crash during the tour —
  `UncaughtTypeError: Cannot read properties of undefined (reading 'after')`
  thrown at `onSelect` in `website.website_builder_assets.min.js` (via `selectSnippet` -> `onClick`).
  The build reported it twice: once as the FAIL assertion and once as a browser
  "Error received after termination" crash, both with the same `'after'` TypeError.
- Reproduce locally:
  `./odoo-bin -d test --test-enable --stop-after-init --test-tags odoo.addons.website.tests.test_snippets.TestSnippets.test_custom_popup_snippet`

### 2. `TestUi.test_10_website_conditional_visibility`
- Python test: `odoo.addons.website.tests.test_ui.TestUi.test_10_website_conditional_visibility`
- File: `/data/build/odoo/addons/website/tests/test_ui.py:444`
- Tour: `conditional_visibility_4`
- Failure: tour step timeout —
  `FAILED: [20/20] Tour conditional_visibility_4 -> Step "Check the order on the 'Invisible Elements' panel"`
  (trigger `.o_we_invisible_el_panel div:nth-child(3):contains('Text - Image')`).
  `Element ... has not been found. TIMEOUT step failed to complete within 10000 ms.`
- Reproduce locally:
  `./odoo-bin -d test --test-enable --stop-after-init --test-tags odoo.addons.website.tests.test_ui.TestUi.test_10_website_conditional_visibility`

## Interpretation

Both failures are in the `website` addon and relate to the website builder /
snippet-selection UI. The first is a hard JS crash (`Cannot read properties of
undefined (reading 'after')`) on snippet selection; the second is a tour timeout
where an expected "Invisible Elements" panel entry never appears. Given the branch
name (`...action-list-js...`) targets JS/UI behavior, these failures are likely
caused by the branch's changes rather than unrelated flakiness, though the second
(a timeout) could be a downstream effect of the same builder breakage.

## Useful links (from build 112109070)
- Full start_post_install_tests log: http://runbot118.odoo.com/runbot/static/build/112109070-master/logs/start_post_install_tests.txt
- Full restore log: http://runbot118.odoo.com/runbot/static/build/112109070-master/logs/restore.txt
- Chrome log (custom_popup_snippet): http://runbot118.odoo.com/runbot/static/build/112109070-master/tests/112109070-master-all/chrome_logs/chrome_log_20260527_171644_311278_test_custom_popup_snippet.txt
- Chrome log (conditional_visibility): http://runbot118.odoo.com/runbot/static/build/112109070-master/tests/112109070-master-all/chrome_logs/chrome_log_20260527_172314_875232_test_10_website_conditional_visibility.txt
- Artifacts zip: https://runbot118.odoo.com/runbot/static/build/112109070-master/logs/112109070-master-all.zip
