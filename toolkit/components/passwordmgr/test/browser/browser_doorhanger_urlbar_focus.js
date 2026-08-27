/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test that the password doorhanger doesn't interfere with focus handling of
 * the rest of the browser chrome while it is open.
 */

"use strict";

const TEST_URL =
  "https://example.com/browser/toolkit/components/passwordmgr/test/browser/form_basic.html";

async function withOpenDoorhanger(taskFn) {
  const formProcessedPromise = listenForTestNotification("FormProcessed");
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL },
    async function (browser) {
      await SimpleTest.promiseFocus(browser.documentGlobal);
      await formProcessedPromise;

      await changeContentFormValues(browser, {
        "#form-basic-username": "username",
        "#form-basic-password": "password",
      });

      const formSubmittedPromise = listenForTestNotification([
        "FormProcessed",
        "ShowDoorhanger",
      ]);
      await SpecialPowers.spawn(browser, [], async function () {
        this.content.document.getElementById("form-basic").submit();
      });
      await formSubmittedPromise;

      const notif = await waitForDoorhanger(browser, "password-save");

      try {
        await taskFn(browser, notif);
      } finally {
        await cleanupDoorhanger(notif);
        await cleanupPasswordNotifications();
        await Services.logins.removeAllUserFacingLoginsAsync();
      }
    }
  );
}

function focusDoorhangerUsernameField() {
  const usernameField = document.getElementById(
    "password-notification-username"
  );
  usernameField.focus();
  Assert.equal(
    usernameField.shadowRoot.activeElement,
    usernameField.inputEl,
    "The username field's inner input is focused"
  );
}

async function clickUrlbarAndAssertUrlIsSelected() {
  const panelHidden = BrowserTestUtils.waitForEvent(
    PopupNotifications.panel,
    "popuphidden"
  );
  EventUtils.synthesizeNativeMouseEvent({
    type: "click",
    target: gURLBar.inputField,
    atCenter: true,
  });
  await panelHidden;

  await TestUtils.waitForCondition(
    () => gURLBar.focused,
    "Waiting for the address bar to be focused"
  );
  Assert.equal(
    gURLBar.inputField.selectionStart,
    0,
    "Selection starts at the beginning of the URL"
  );
  Assert.equal(
    gURLBar.inputField.selectionEnd,
    gURLBar.value.length,
    "The whole URL is selected"
  );
}

// Only one task may click the address bar with a native event: two native
// clicks at the same spot land close enough together for the platform to
// report the second one as a double click.
add_task(async function test_click_urlbar_selects_url() {
  await withOpenDoorhanger(clickUrlbarAndAssertUrlIsSelected);
});

add_task(async function test_focus_returns_to_content_on_dismiss() {
  await withOpenDoorhanger(async function (browser) {
    focusDoorhangerUsernameField();
    await hideDoorhangerPopup();
    await TestUtils.waitForTick();

    Assert.equal(
      document.activeElement,
      browser,
      "Focus returned to the content browser"
    );
  });
});
