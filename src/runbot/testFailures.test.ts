import { describe, expect, test } from "bun:test";
import samples from "../../examples/runbot-failures/visible-log-samples.json";
import { parseRunbotTestFailures, parseUnparsedRunbotTestFailures, type RunbotTestLogEntry } from "./testFailures";

describe("parseRunbotTestFailures", () => {
  test("classifies Hoot, tour, and Python wrapper failures", () => {
    const tests = parseRunbotTestFailures(samples as RunbotTestLogEntry[]);

    expect(tests.map((item) => item.kind)).toEqual(["hoot", "hoot", "tour"]);
    expect(tests[0]!.jsTest).toContain("@web/views/kanban");
    expect(tests[0]!.pythonTest).toBe("odoo.addons.web.tests.test_js.WebSuite.test_unit_desktop");
    expect(tests[0]!.preset).toBe("desktop");
    expect(tests[1]!.preset).toBe("mobile");
    expect(tests[2]!.pythonTest).toBe("odoo.addons.mass_mailing.tests.test_mailing_ui.TestMailingUi.test_snippets_mailing_menu_toolbar_tour__0");
    expect(tests[2]!.runner).toBe("start_tour");
    expect(tests[2]!.tourName).toBe("mass_mailing_snippets_menu_toolbar");
    expect(tests[2]!.title).toBe("TestMailingUi.test_snippets_mailing_menu_toolbar_tour__0");
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
    expect(tests[0]!.pythonTest).toBe("odoo.addons.web.tests.test_js.WebSuite.test_unit_desktop");
    expect(tests[0]!.pythonFile).toBe("/data/build/odoo/addons/web/tests/test_js.py");
    expect(tests[0]!.command).toContain("--test-tags odoo.addons.web.tests.test_js.WebSuite.test_unit_desktop");
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
    expect(tests[0]!.title).toBe("TestMailingUi.test_snippets_mailing_menu_toolbar_tour__0");
    expect(tests[0]!.pythonTest).toBe("odoo.addons.mass_mailing.tests.test_mailing_ui.TestMailingUi.test_snippets_mailing_menu_toolbar_tour__0");
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
    expect(tests[0]!.title).toBe("TestFrontend.test_transfering_orders");
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
    expect(tests[0]!.command).toContain("--test-tags odoo.addons.web.tests.test_js.WebSuite.test_unit_desktop");
    expect(tests[0]!.command).toContain("preset=desktop");
    expect(tests[2]!.command).toBe("./odoo-bin -d test --test-enable --stop-after-init --test-tags odoo.addons.mass_mailing.tests.test_mailing_ui.TestMailingUi.test_snippets_mailing_menu_toolbar_tour__0");
  });

  test("deduplicates a Hoot failure that reappears in a retry pass", () => {
    const message = `[HOOT] Test "@web/core/template/source-file: component with primary inherit reports correct file per access" failed:

Failed assertions:

2. [toBe] expected values to be strictly equal
> Expected: undefined
> Received: undefined

3. [errors] 1 unverified error(s)

Error during test:

Cannot read properties of undefined (reading 'filename')`;
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
          { date: "2026-03-11 17:46:37", level: "ERROR", isError: true, message },
          { date: "2026-03-11 17:58:05", level: "ERROR", isError: true, message },
        ],
      },
    ]);

    expect(tests).toHaveLength(1);
    expect(tests[0]!.lines).toHaveLength(1);
    expect(tests[0]!.sourceLines).toHaveLength(1);
    expect(tests[0]!.lines[0]!.message).toContain("Cannot read properties of undefined (reading 'filename')");
  });

  test("deduplicates browser crashes with the same message attached to a tour", () => {
    const crashMessage =
      "TypeError: Cannot read properties of undefined (reading 'describeMe')\n    at TourAutomatic.throwError (http://127.0.0.1:8069/web/assets/tours.js:599:162)";
    const entries: RunbotTestLogEntry[] = [
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
            date: "2026-03-11 18:00:00",
            level: "ERROR",
            isError: true,
            message:
              'FAIL: TestSelfOrder.test_online_payment_mobile_self_order_preparation_changes Traceback (most recent call last): File " /data/build/odoo/addons/pos_online_payment_self_order/tests/test_self_order_mobile.py ", line 50, in test_online_payment_mobile_self_order_preparation_changes self.start_tour(self.pos_config._get_self_order_route(), \'test_online_payment_mobile_self_order_preparation_changes\') AssertionError: tour failed',
          },
          { date: "2026-03-11 18:02:25", level: "ERROR", isError: true, message: crashMessage },
          { date: "2026-03-11 18:02:31", level: "ERROR", isError: true, message: crashMessage },
          { date: "2026-03-11 18:02:35", level: "ERROR", isError: true, message: crashMessage },
        ],
      },
    ];

    const tests = parseRunbotTestFailures(entries);
    expect(tests).toHaveLength(1);
    expect(tests[0]!.crashes).toHaveLength(1);
  });

  test("attaches a crash logged just before its FAIL to the right test, even with a summary in between", () => {
    const crashMessage =
      "Error received after termination: TypeError: Cannot read properties of undefined (reading 'describeMe')\nat TourAutomatic.throwError (http://127.0.0.1:8069/web/assets/1/c468e6f/pos_self_order.assets_tests.min.js:599:162)";
    const failA =
      'FAIL: TestSelfOrderFakePayment.test_online_payment_mobile_no_confirmation_page\nTraceback (most recent call last):\nFile " /data/build/odoo/addons/pos_online_payment_self_order/tests/test_self_order_fake_payment.py ", line 42, in test_online_payment_mobile_no_confirmation_page\nself.start_tour(self_route, "test_online_payment_mobile_self_order_preparation_changes")\nAssertionError: tour failed';
    const failB =
      'FAIL: TestSelfOrderMobile.test_online_payment_self_pay_after_meal_table\nTraceback (most recent call last):\nFile " /data/build/odoo/addons/pos_online_payment_self_order/tests/test_self_order_mobile.py ", line 67, in test_online_payment_self_pay_after_meal_table\nself.start_tour(self_route, "self_mobile_online_payment_meal")\nAssertionError: tour failed';
    const entries: RunbotTestLogEntry[] = [
      {
        child: {
          id: 103751432,
          name: "pos child",
          status: "error",
          path: "/runbot/build/103751432",
          links: [],
        },
        status: "error",
        logs: [
          { date: "2026-03-11 18:02:25", level: "ERROR", isError: true, message: crashMessage },
          { date: "2026-03-11 18:02:26", level: "ERROR", isError: true, message: failA },
          { date: "2026-03-11 18:03:29", level: "ERROR", isError: true, message: crashMessage },
          { date: "2026-03-11 18:03:30", level: "ERROR", isError: true, message: "Some tests failed: see above for details" },
          { date: "2026-03-11 18:03:31", level: "ERROR", isError: true, message: failB },
        ],
      },
    ];

    const tests = parseRunbotTestFailures(entries);
    expect(tests).toHaveLength(2);
    const a = tests.find((t) => t.pythonTest?.endsWith("test_online_payment_mobile_no_confirmation_page"));
    const b = tests.find((t) => t.pythonTest?.endsWith("test_online_payment_self_pay_after_meal_table"));
    expect(a?.crashes).toHaveLength(1);
    expect(b?.crashes).toHaveLength(1);
    expect(parseUnparsedRunbotTestFailures(entries)).toHaveLength(0);
  });

  test("promotes a JS error embedded in an AssertionError to a browser crash", () => {
    const failMessage =
      'FAIL: TestFrontEnd.test_front_end_ui\n' +
      'Traceback (most recent call last):\n' +
      '  File "/usr/lib/python3/dist-packages/freezegun/api.py", line 789, in wrapper\n' +
      '    result = func(*args, **kwargs)\n' +
      '  File " /data/build/enterprise/planning/tests/test_front_end.py ", line 56, in test_front_end_ui\n' +
      "    self.start_tour(front_end_thibault_url[self.employee_thibault.id], 'planning_front_end_tour')\n" +
      '  File " /data/build/odoo/odoo/tests/common.py ", line 2658, in start_tour\n' +
      '    self.browser_js(...)\n' +
      '  File " /data/build/odoo/odoo/tests/common.py ", line 2632, in browser_js\n' +
      '    self.fail(str(error))\n' +
      "AssertionError: UncaughtTypeError: Cannot read properties of undefined (reading 'describeMe')\n" +
      '    at TourAutomatic.throwError (http://127.0.0.1:8069/web/assets/1/598cf7a/web.__assets_tests_call__.min.js:679:162)\n' +
      '    at beforeUnloadHandler (http://127.0.0.1:8069/web/assets/1/598cf7a/web.__assets_tests_call__.min.js:674:45)';
    const tests = parseRunbotTestFailures([
      {
        child: {
          id: 103751431,
          name: "planning child",
          status: "error",
          path: "/runbot/build/103751431",
          links: [],
        },
        status: "error",
        logs: [{ date: "2026-03-11 17:45:02", level: "ERROR", isError: true, message: failMessage }],
      },
    ]);
    expect(tests).toHaveLength(1);
    expect(tests[0]!.crashes).toHaveLength(1);
    const crash = tests[0]!.crashes![0]!;
    expect(crash.title).toBe(
      "UncaughtTypeError: Cannot read properties of undefined (reading 'describeMe')",
    );
    expect(crash.message).toContain("\n");
    expect(crash.message).toContain("at TourAutomatic.throwError");
  });

  test("keeps two tests with the same method name but different classes separate", () => {
    const traceback =
      'Traceback (most recent call last):\n' +
      'File " /data/build/odoo/addons/pos_online_payment_self_order/tests/test_self_order_mobile.py ", line 103, in test_online_payment_mobile_self_order_preparation_changes\n' +
      "self.start_tour(self.pos_config._get_self_order_route(), 'test_online_payment_mobile_self_order_preparation_changes')\n" +
      'AssertionError: tour failed';
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
            date: "2026-03-11 18:00:00",
            level: "ERROR",
            isError: true,
            message: `FAIL: TestSelfOrderFakePayment.test_online_payment_mobile_self_order_preparation_changes ${traceback}`,
          },
          {
            date: "2026-03-11 18:00:01",
            level: "ERROR",
            isError: true,
            message: `FAIL: TestSelfOrderMobile.test_online_payment_mobile_self_order_preparation_changes ${traceback}`,
          },
        ],
      },
    ]);

    expect(tests).toHaveLength(2);
    expect(tests.map((t) => t.pythonTest)).toEqual([
      "odoo.addons.pos_online_payment_self_order.tests.test_self_order_mobile.TestSelfOrderFakePayment.test_online_payment_mobile_self_order_preparation_changes",
      "odoo.addons.pos_online_payment_self_order.tests.test_self_order_mobile.TestSelfOrderMobile.test_online_payment_mobile_self_order_preparation_changes",
    ]);
    expect(tests.map((t) => t.title)).toEqual([
      "TestSelfOrderFakePayment.test_online_payment_mobile_self_order_preparation_changes",
      "TestSelfOrderMobile.test_online_payment_mobile_self_order_preparation_changes",
    ]);
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
