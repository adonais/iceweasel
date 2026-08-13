/**
 * Test that the password capture doorhanger is keyboard-reachable as soon as it
 * appears on form submission (bug 2050381). Keyboard reachability is controlled
 * by the "noautofocus" attribute on the shared notification panel: when it is
 * removed the panel joins the tab ring, when it is set to "true" the panel is
 * unreachable with Tab.
 */

const FORM_URL =
  "https://example.com/browser/toolkit/components/" +
  "passwordmgr/test/browser/form_basic.html";

async function checkDoorhangerKeyboardReachable({ oldPassword, expectedType }) {
  if (oldPassword) {
    await Services.logins.addLoginAsync(
      LoginTestUtils.testData.formLogin({
        origin: "https://example.com",
        formActionOrigin: "https://example.com",
        username: "username",
        password: oldPassword,
      })
    );
  }

  const formProcessedPromise = listenForTestNotification("FormProcessed");
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: FORM_URL },
    async function (browser) {
      await SimpleTest.promiseFocus(browser.documentGlobal);
      await formProcessedPromise;

      await changeContentFormValues(browser, {
        "#form-basic-username": "username",
        "#form-basic-password": "newPassword",
      });

      let promiseShown = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popupshown"
      );
      let formSubmittedPromise = listenForTestNotification([
        "FormProcessed",
        "ShowDoorhanger",
      ]);
      await SpecialPowers.spawn(browser, [], async function () {
        this.content.document.getElementById("form-basic").submit();
      });
      await formSubmittedPromise;

      let notif = await waitForDoorhanger(browser, expectedType);
      await promiseShown;

      ok(
        !PopupNotifications.panel.hasAttribute("noautofocus"),
        `${expectedType} doorhanger is keyboard focusable on initial submission`
      );

      await cleanupDoorhanger(notif);
    }
  );
  await Services.logins.removeAllUserFacingLoginsAsync();
}

add_task(async function test_save_doorhanger_is_keyboard_reachable() {
  await checkDoorhangerKeyboardReachable({ expectedType: "password-save" });
});

add_task(async function test_change_doorhanger_is_keyboard_reachable() {
  await checkDoorhangerKeyboardReachable({
    oldPassword: "password",
    expectedType: "password-change",
  });
});
