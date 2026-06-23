# Runbot results for branch `master-mail-call-action-list-js-tref-nby`

## Conclusion: NO — the last batch did NOT pass.

The latest (and only) batch for this branch is **batch 2549935** (~3 hours old),
status **error**.

Of the 12 build slots, 11 passed. One slot failed:

- **Enterprise Tests** (build `112108520`) — status `error`

All other slots succeeded: Minimal check, Odoo LS Check, Community Run,
Enterprise Run, Templates enterprise, Upgrade current, Distro check, Check Style,
Check Security odoo, Code Owner, CLA.

## Test summary

From the failing child build `112109070` (Post-install tests for website):

> **2 failed, 0 error(s) of 342 tests** when loading database `112109070-master-all`

Both failures are **website tour tests**.

### 1. `TestSnippets.test_custom_popup_snippet` (tour `custom_popup_snippet`)

- Kind: tour failure caused by an uncaught JS error in the website builder.
- Root cause: `TypeError: Cannot read properties of undefined (reading 'after')`
  thrown in `onSelect` → `selectSnippet` (website.website_builder_assets), i.e.
  selecting a snippet crashes the builder.
- Source: `/data/build/odoo/addons/website/tests/test_snippets.py:144`
- Reproduce:
  ```
  ./odoo-bin -d test --test-enable --stop-after-init --test-tags odoo.addons.website.tests.test_snippets.TestSnippets.test_custom_popup_snippet
  ```

### 2. `TestUi.test_10_website_conditional_visibility` (tour `conditional_visibility_4`)

- Kind: tour failure (timeout on a tour step).
- Root cause: Step 20/20 "Check the order on the 'Invisible Elements' panel"
  could not find element
  `.o_we_invisible_el_panel div:nth-child(3):contains('Text - Image')` — TIMEOUT
  after 10000 ms.
- Source: `/data/build/odoo/addons/website/tests/test_ui.py:444`
- Reproduce:
  ```
  ./odoo-bin -d test --test-enable --stop-after-init --test-tags odoo.addons.website.tests.test_ui.TestUi.test_10_website_conditional_visibility
  ```

Both failures relate to the website builder's snippet/invisible-elements
handling, suggesting a single underlying JS regression in the builder assets.

## Useful URLs (child build 112109070)

- Full post-install test log:
  http://runbot118.odoo.com/runbot/static/build/112109070-master/logs/start_post_install_tests.txt
- Chrome log (custom_popup_snippet):
  http://runbot118.odoo.com/runbot/static/build/112109070-master/tests/112109070-master-all/chrome_logs/chrome_log_20260527_171644_311278_test_custom_popup_snippet.txt
- Chrome log (conditional_visibility):
  http://runbot118.odoo.com/runbot/static/build/112109070-master/tests/112109070-master-all/chrome_logs/chrome_log_20260527_172314_875232_test_10_website_conditional_visibility.txt
- Artifacts zip:
  https://runbot118.odoo.com/runbot/static/build/112109070-master/logs/112109070-master-all.zip
