/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// These tests use a credit-card autocomplete popup because it is the only
// satchel-style popup that actually previews form fields. Plain form-history
// entries carry no fillMessageName, so AutoCompleteParent.clearAutoCompletePreview()
// bails early for them and there is no preview to observe (bug 2057175).

add_setup(async function () {
  await setStorage(TEST_CREDIT_CARD_1);
  registerCleanupFunction(removeAllRecords);
});

async function pointerSelectFirstRow(browser) {
  const previewComplete = TestUtils.topicObserved(
    "formautofill-preview-complete"
  );
  const [firstItem] = getDisplayedPopupItems(browser);
  await TestUtils.waitForCondition(() => {
    browser.autoCompletePopup.mLastMoveTime = 0;
    EventUtils.synthesizeMouseAtCenter(firstItem, { type: "mousemove" });
    return browser.autoCompletePopup.selectedIndex == 0;
  }, "pointer should select the first credit-card row");
  await previewComplete;
  return firstItem;
}

// Moving the pointer off the panel must clear a previewed credit-card entry.
add_task(async function test_cc_preview_cleared_on_pointer_leave() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: CREDITCARD_FORM_URL },
    async function (browser) {
      await openPopupOn(browser, "#cc-number");
      const firstItem = await pointerSelectFirstRow(browser);

      await SpecialPowers.spawn(browser, [], async function () {
        const ccNumber = content.document.getElementById("cc-number");
        Assert.equal(
          ccNumber.autofillState,
          "preview",
          "cc-number should be previewed while hovered"
        );
        Assert.ok(
          ccNumber.previewValue,
          "cc-number should have a preview value"
        );
      });

      // move the pointer off the panel
      const clearComplete = TestUtils.topicObserved(
        "formautofill-preview-complete"
      );
      firstItem.dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: null })
      );
      await clearComplete;

      Assert.equal(
        browser.autoCompletePopup.selectedIndex,
        -1,
        "pointer selection should be cleared when the pointer leaves"
      );
      await SpecialPowers.spawn(browser, [], async function () {
        const ccNumber = content.document.getElementById("cc-number");
        Assert.equal(
          ccNumber.autofillState,
          "",
          "cc-number preview state should be cleared"
        );
        Assert.equal(
          ccNumber.previewValue,
          "",
          "cc-number preview value should be cleared"
        );
      });

      await closePopup(browser);
    }
  );
});

// Clearing the selection alone does not clear the preview: previewAutoCompleteEntry()
// bails when the index is -1, so it is the explicit clearAutoCompletePreview() call
// in the mouseout handler that removes the preview.
add_task(async function test_cc_selection_cleared_keeps_preview() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: CREDITCARD_FORM_URL },
    async function (browser) {
      await openPopupOn(browser, "#cc-number");
      await pointerSelectFirstRow(browser);

      // Clear the selection without going through the mouseout handler.
      browser.autoCompletePopup.selectedIndex = -1;
      Assert.equal(
        browser.autoCompletePopup.selectedIndex,
        -1,
        "the selection should be cleared"
      );

      await SpecialPowers.spawn(browser, [], async function () {
        const ccNumber = content.document.getElementById("cc-number");
        Assert.equal(
          ccNumber.autofillState,
          "preview",
          "clearing the selection alone should keep the preview displayed"
        );
        Assert.ok(
          ccNumber.previewValue,
          "the preview value should still be displayed"
        );
      });

      await closePopup(browser);
    }
  );
});
