"use strict";

const BASE = "https://www.example.com/browser/dom/tests/browser/";
const TEST_URL = BASE + "file_beforeunload_select.html";

const { PromptTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromptTestUtils.sys.mjs"
);

// Changing a <select> value via the native popup should allow beforeunload
// dialogs. Native popups handle mouse events at the widget level, so
// EventStateManager never sees a mouseup to set mUserHasInteracted. But the
// initial click to open the popup does set sticky activation via pointerdown,
// and the beforeunload check should use that instead.
add_task(async function test_select_change_allows_beforeunload() {
  await SpecialPowers.pushPrefEnv({
    set: [["dom.require_user_interaction_for_beforeunload", true]],
  });

  await BrowserTestUtils.withNewTab(TEST_URL, async browser => {
    // Simulate user gesture activation (sticky activation) as would happen
    // from the pointerdown that opens the native <select> popup.
    await SpecialPowers.spawn(browser, [], async () => {
      SpecialPowers.wrap(content.document).notifyUserGestureActivation();
    });

    let dialogPromise = PromptTestUtils.handleNextPrompt(
      browser,
      {
        modalType: Services.prompt.MODAL_TYPE_CONTENT,
        promptType: "confirmEx",
      },
      { buttonNumClick: 0 }
    );
    let loadedPromise = BrowserTestUtils.browserLoaded(browser);

    BrowserTestUtils.startLoadingURIString(browser, BASE + "dummy.html");
    await Promise.all([dialogPromise, loadedPromise]);

    ok(true, "beforeunload dialog was shown after user gesture activation");
  });

  await SpecialPowers.popPrefEnv();
});
