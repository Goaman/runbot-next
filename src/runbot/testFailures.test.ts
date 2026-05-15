import { describe, expect, test } from "bun:test";
import samples from "../../examples/runbot-failures/visible-log-samples.json";
import { parseRunbotTestFailures, parseUnparsedRunbotTestFailures, type RunbotTestLogEntry } from "./testFailures";

describe("parseRunbotTestFailures", () => {
  test("classifies Hoot, tour, and Python wrapper failures", () => {
    const tests = parseRunbotTestFailures(samples as RunbotTestLogEntry[]);

    expect(tests.map((item) => item.kind)).toEqual(["hoot", "hoot", "tour"]);
    expect(tests[0]!.jsTest).toContain("@web/views/kanban");
    expect(tests[0]!.pythonTest).toBe("odoo.addons.web.tests.test_js.test_unit_desktop");
    expect(tests[0]!.preset).toBe("desktop");
    expect(tests[1]!.preset).toBe("mobile");
    expect(tests[2]!.pythonTest).toBe("odoo.addons.mass_mailing.tests.test_mailing_ui.test_snippets_mailing_menu_toolbar_tour__0");
    expect(tests[2]!.runner).toBe("start_tour");
    expect(tests[2]!.tourName).toBe("mass_mailing_snippets_menu_toolbar");
    expect(tests[2]!.title).toBe("mass_mailing_snippets_menu_toolbar");
  });

  test("filters summary-only errors by default", () => {
    const tests = parseRunbotTestFailures(samples as RunbotTestLogEntry[]);
    expect(tests.some((item) => item.kind === "summary")).toBe(false);
  });

  test("parses Hoot failures whose detail starts on the next line", () => {
    const tests = parseRunbotTestFailures([
      {
        child: {
          id: 42,
          name: "web",
          status: "error",
          path: "/runbot/build/42",
          links: [],
        },
        status: "error",
        logs: [
          {
            date: "2026-05-14 12:00:00",
            level: "ERROR",
            isError: true,
            message:
              '[HOOT] Test "@html_editor/toolbar/should focus the editable area after selecting a font size item" failed:\nExpected editable area to be focused',
          },
        ],
      },
    ]);

    expect(tests).toHaveLength(1);
    expect(tests[0]!.kind).toBe("hoot");
    expect(tests[0]!.jsTest).toBe("@html_editor/toolbar/should focus the editable area after selecting a font size item");
    expect(tests[0]!.lines[0]!.message).toBe("Expected editable area to be focused");
  });

  test("splits multiple Hoot failures from one visible log row", () => {
    const message = `[HOOT] Test "@html_editor/toolbar/should focus the editable area after selecting a font size item" failed:

Failed assertion:

2. [toBeFocused] element <input> should be focused
2.1. (<input>)
> Focused: <div.odoo-editor-editable>
[HOOT] Test "@html_editor/toolbar/should not create empty extra nodes while changing format of link" failed:

Failed assertion:

2. [toBeFocused] element <input> should be focused
2.1. (<input>)
> Focused: <div.odoo-editor-editable>
Some tests failed: see above for details
Failed tests link: http://127.0.0.1:8069/web/tests?preset=desktop&id=5fdaf6d7&id=d7a6eec0&debugTest=true&debug=assets
1 failed, 0 error(s) of 521 tests when loading database '110646480-master-all'
[HOOT] Test "@mail/chatter/web/attachment_box/attachment box auto-closed on switch to record wih no attachments" failed:

Failed assertions:

3. [toBe] expected values to be strictly equal (Failed to find 0 of ".o-mail-AttachmentBox" (Timeout of 3 seconds). Found 1 instead.)
> Expected: true
> Received: false`;
    const sourceLine = {
      date: "2026-05-14 12:00:00",
      level: "ERROR",
      isError: true,
      message,
    };
    const tests = parseRunbotTestFailures([
      {
        child: {
          id: 42,
          name: "web",
          status: "error",
          path: "/runbot/build/42",
          links: [],
        },
        status: "error",
        logs: [sourceLine],
      },
    ]);

    expect(tests.map((item) => item.jsTest)).toEqual([
      "@html_editor/toolbar/should focus the editable area after selecting a font size item",
      "@html_editor/toolbar/should not create empty extra nodes while changing format of link",
      "@mail/chatter/web/attachment_box/attachment box auto-closed on switch to record wih no attachments",
    ]);
    expect(tests.every((item) => item.kind === "hoot")).toBe(true);
    expect(tests[0]!.lines[0]!.message).toContain("Failed assertion:");
    expect(tests[0]!.lines[0]!.message).not.toContain("should not create empty extra nodes");
    expect(tests[1]!.lines[0]!.message).not.toContain("Some tests failed");
    expect(tests.every((item) => item.sourceLines[0] === sourceLine)).toBe(true);
  });

  test("links Hoot failures to the Python browser_js test that ran them", () => {
    const tests = parseRunbotTestFailures([
      {
        child: {
          id: 42,
          name: "web",
          status: "error",
          path: "/runbot/build/42",
          links: [],
        },
        status: "error",
        logs: [
          {
            date: "2026-05-14 12:00:00",
            level: "ERROR",
            isError: true,
            message: '[HOOT] Test "@html_editor/toolbar/should focus the editable area after selecting a font size item" failed:\nFailed assertion',
          },
          {
            date: "2026-05-14 12:00:01",
            level: "ERROR",
            isError: true,
            message:
              'FAIL: WebSuite.test_unit_desktop Traceback (most recent call last): File " /data/build/odoo/addons/web/tests/test_js.py ", line 201, in test_unit_desktop self.browser_js(f\'/web/tests?&headless&loglevel=2&preset=desktop&timeout=15000{filters}\', "", "", login=\'admin\', timeout=timeout, success_signal="[HOOT] Test suite succeeded", error_checker=unit_test_error_checker) File " /data/build/odoo/odoo/tests/common.py ", line 2836, in browser_js self.fail(str(error)) AssertionError: Some tests failed: see above for details Failed tests link: http://127.0.0.1:8069/web/tests?preset=desktop&id=5fdaf6d7&debugTest=true&debug=assets',
          },
        ],
      },
    ]);

    expect(tests).toHaveLength(1);
    expect(tests[0]!.jsTest).toBe("@html_editor/toolbar/should focus the editable area after selecting a font size item");
    expect(tests[0]!.runner).toBe("browser_js");
    expect(tests[0]!.pythonTest).toBe("odoo.addons.web.tests.test_js.test_unit_desktop");
    expect(tests[0]!.pythonFile).toBe("/data/build/odoo/addons/web/tests/test_js.py");
    expect(tests[0]!.command).toContain("--test-tags odoo.addons.web.tests.test_js.test_unit_desktop");
  });

  test("extracts the failed tour name from start_tour tracebacks", () => {
    const tests = parseRunbotTestFailures([
      {
        child: {
          id: 42,
          name: "tour child",
          status: "error",
          path: "/runbot/build/42",
          links: [],
        },
        status: "error",
        logs: [
          {
            date: "2026-05-14 12:00:00",
            level: "ERROR",
            isError: true,
            message:
              'FAIL: TestMailingUi.test_snippets_mailing_menu_toolbar_tour__0 Traceback (most recent call last): File " /data/build/odoo/addons/mass_mailing/tests/test_mailing_ui.py ", line 95, in test_snippets_mailing_menu_toolbar_tour__0 self.start_tour(\'/odoo\', \'mass_mailing_snippets_menu_toolbar\', login=\'admin\') AssertionError: The tour mass_mailing_snippets_menu_toolbar failed at step click on snippets menu',
          },
        ],
      },
    ]);

    expect(tests).toHaveLength(1);
    expect(tests[0]!.kind).toBe("tour");
    expect(tests[0]!.runner).toBe("start_tour");
    expect(tests[0]!.tourName).toBe("mass_mailing_snippets_menu_toolbar");
    expect(tests[0]!.title).toBe("mass_mailing_snippets_menu_toolbar");
    expect(tests[0]!.pythonTest).toBe("odoo.addons.mass_mailing.tests.test_mailing_ui.test_snippets_mailing_menu_toolbar_tour__0");
  });

  test("extracts the failed tour name from start_pos_tour tracebacks", () => {
    const tests = parseRunbotTestFailures([
      {
        child: {
          id: 42,
          name: "pos child",
          status: "error",
          path: "/runbot/build/42",
          links: [],
        },
        status: "error",
        logs: [
          {
            date: "2026-05-14 12:00:00",
            level: "ERROR",
            isError: true,
            message:
              'FAIL: TestFrontend.test_transfering_orders Traceback (most recent call last): File " /data/build/odoo/addons/pos_restaurant/tests/test_frontend.py ", line 123, in test_transfering_orders self.start_pos_tour(\'test_transfering_orders\', login="pos_user") AssertionError: Tour failed',
          },
        ],
      },
    ]);

    expect(tests).toHaveLength(1);
    expect(tests[0]!.tourName).toBe("test_transfering_orders");
    expect(tests[0]!.title).toBe("test_transfering_orders");
  });

  test("attaches direct tour step failures and browser crashes to the matching Python tour", () => {
    const entries: RunbotTestLogEntry[] = [
      {
        child: {
          id: 42,
          name: "website child",
          status: "error",
          path: "/runbot/build/42",
          links: [],
        },
        status: "error",
        logs: [
          {
            date: "2026-05-14 12:00:00",
            level: "ERROR",
            isError: true,
            message:
              'FAIL: TestUi.test_course_publisher Traceback (most recent call last): File " /data/build/odoo/addons/website_slides/tests/test_ui_wslides.py ", line 100, in test_course_publisher self.start_tour("/slides", "course_publisher_standard", login="demo") AssertionError: tour failed',
          },
          {
            date: "2026-05-14 12:00:01",
            level: "ERROR",
            isError: true,
            message:
              "TypeError: Cannot read properties of undefined (reading 'options')\nat RatingPopupComposer.renderAt (http://127.0.0.1:8069/web/assets/web.assets_frontend_lazy.min.js:6909:109)",
          },
          {
            date: "2026-05-14 12:00:02",
            level: "ERROR",
            isError: true,
            message:
              'FAILED: [31/77] Tour course_publisher_standard → Step eLearning: click on tag dropdown (trigger: :iframe [data-id="0"] button.o_select_menu_toggler). Element has not been found.',
          },
        ],
      },
    ];

    const tests = parseRunbotTestFailures(entries);
    expect(tests).toHaveLength(1);
    expect(tests[0]!.tourName).toBe("course_publisher_standard");
    expect(tests[0]!.crashes).toHaveLength(1);
    expect(tests[0]!.crashes![0]!.title).toBe("TypeError: Cannot read properties of undefined (reading 'options')");
    expect(tests[0]!.lines.some((line) => line.message.includes("click on tag dropdown"))).toBe(true);
    expect(parseUnparsedRunbotTestFailures(entries)).toHaveLength(0);
  });

  test("can include summary rows when requested", () => {
    const tests = parseRunbotTestFailures(samples as RunbotTestLogEntry[], { includeSummary: true });
    expect(tests.some((item) => item.kind === "summary")).toBe(true);
  });

  test("builds copyable local commands", () => {
    const tests = parseRunbotTestFailures(samples as RunbotTestLogEntry[]);
    expect(tests[0]!.command).toContain("--test-tags odoo.addons.web.tests.test_js.test_unit_desktop");
    expect(tests[0]!.command).toContain("preset=desktop");
    expect(tests[2]!.command).toBe("./odoo-bin -d test --test-enable --stop-after-init --test-tags odoo.addons.mass_mailing.tests.test_mailing_ui.test_snippets_mailing_menu_toolbar_tour__0");
  });

  test("reports unparsed error chunks separately", () => {
    const entries: RunbotTestLogEntry[] = [
      {
        child: {
          id: 42,
          name: "web",
          status: "error",
          path: "/runbot/build/42",
          links: [],
        },
        status: "error",
        logs: [
          {
            date: "2026-05-14 12:00:00",
            level: "ERROR",
            isError: true,
            message: "Unexpected browser console error without a known test wrapper",
          },
          {
            date: "2026-05-14 12:00:01",
            level: "ERROR",
            isError: true,
            message: '[HOOT] Test "@web/example" failed:\nExpected true to be false',
          },
        ],
      },
    ];

    const unparsed = parseUnparsedRunbotTestFailures(entries);
    expect(unparsed).toHaveLength(1);
    expect(unparsed[0]!.child.id).toBe(42);
    expect(unparsed[0]!.message).toBe("Unexpected browser console error without a known test wrapper");
  });
});
