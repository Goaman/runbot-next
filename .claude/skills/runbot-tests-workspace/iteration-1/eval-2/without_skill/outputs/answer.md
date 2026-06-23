# Branch `master-mail-call-action-list-js-tref-nby` — Last Batch Result

**No, the last batch did not pass.** It failed (Runbot status: **error**).

## Batch overview
- **Batch ID:** 2549935 (`/runbot/batch/2549935`)
- **Bundle / branch:** master-mail-call-action-list-js-tref-nby
- **Version:** master
- **Created:** 2026-05-27 16:38:31 (about 3 hours before this check)
- **Overall status:** error

### Build slots
All build slots passed **except one**:

| Build slot | Status |
|---|---|
| Minimal check | success |
| Odoo LS Check | success |
| Community Run | success |
| Enterprise Run | success |
| **Enterprise Tests** | **error (FAILED)** |
| Templates enterprise | success |
| Upgrade current | success |
| Distro check | success |
| Check Style | success |
| Check Security odoo | success |
| Code Owner | success |
| CLA | success |

The single failing slot is **Enterprise Tests** (build id `112108520`).

## Test failures
Both failures are JS/browser **tour tests** in the `website` module, occurring in the
post-install child build `112109070` ("Post install tests for website"). Both are frontend
("website builder") failures, consistent with this being a mail/JS branch touching shared
web assets.

### 1. `TestSnippets.test_custom_popup_snippet`
- Tour: `custom_popup_snippet`
- File: `odoo/addons/website/tests/test_snippets.py`, line 144
- Failure: an uncaught JS error crashed the tour:
  ```
  UncaughtTypeError: Cannot read properties of undefined (reading 'after')
      at onSelect (website.website_builder_assets.min.js)
      at selectSnippet (...)
      at onClick (...)
  ```
  i.e. clicking/selecting a snippet in the website builder threw a TypeError
  (`undefined.after`), aborting the tour.

### 2. `TestUi.test_10_website_conditional_visibility`
- Tour: `conditional_visibility_4`
- File: `odoo/addons/website/tests/test_ui.py`, line 444
- Failure: tour step timeout:
  ```
  FAILED: [20/20] Tour conditional_visibility_4 →
  Step "Check the order on the 'Invisible Elements' panel"
  (trigger: .o_we_invisible_el_panel div:nth-child(3):contains('Text - Image')).
  Element has not been found.
  TIMEOUT step failed to complete within 10000 ms.
  ```
  The expected element never appeared in the "Invisible Elements" panel, so the final
  step (20/20) timed out.

## Summary
- 2 failing tests, both website-builder browser tours, both in the Enterprise Tests slot.
- Failure #1 is a hard JS TypeError in the snippet-selection code path
  (`onSelect`/`selectSnippet` reading `.after` of `undefined`).
- Failure #2 is a tour timeout where an "Invisible Elements" panel entry ("Text - Image")
  did not render in the expected order/position.
- Both point at regressions in the website builder frontend assets on this branch. The rest
  of the pipeline (community/enterprise runs, style, security, upgrade, etc.) is green.
