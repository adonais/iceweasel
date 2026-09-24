/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { FormHistory } = ChromeUtils.importESModule(
  "resource://gre/modules/FormHistory.sys.mjs"
);

const FORM_URL =
  "https://example.com/browser/toolkit/components/" +
  "passwordmgr/test/browser/form_expanded.html";

/**
 * #PopupAutoComplete is shared between content fields and the doorhanger's
 * username field, so open it from a dark content field first to leave a scheme
 * on it.
 */
async function openContentPopupFromDarkField() {
  const html = `<input type="text" name="field1" style="color-scheme: dark">`;
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: `data:text/html,${encodeURIComponent(html)}` },
    async browser => {
      let popup = browser.autoCompletePopup;
      await SpecialPowers.spawn(browser, [], () =>
        content.document.querySelector("input").focus()
      );
      await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
      await TestUtils.waitForCondition(() => popup.popupOpen, "popup opened");
      Assert.equal(
        popup.style.colorScheme,
        "dark",
        "The content field set the popup's scheme"
      );

      let hidden = BrowserTestUtils.waitForEvent(popup, "popuphidden");
      await BrowserTestUtils.synthesizeKey("VK_ESCAPE", {}, browser);
      await hidden;
    }
  );
}

async function openDoorhangerUsernamePopup(browser) {
  await changeContentFormValues(browser, {
    "#form-expanded-username": "someUsername",
  });
  await changeContentFormValues(browser, {
    "#form-expanded-password": "somePassword",
  });

  await waitForDoorhanger(browser, "any");
  let notification = getCaptureDoorhanger("any");
  let { panel } = PopupNotifications;
  if (panel.state != "open") {
    let shown = BrowserTestUtils.waitForEvent(panel, "popupshown");
    if (panel.state != "showing") {
      EventUtils.synthesizeMouseAtCenter(notification.anchorElement, {});
    }
    await shown;
  }

  let popup = document.getElementById("PopupAutoComplete");
  let shown = BrowserTestUtils.waitForEvent(popup, "popupshown");
  panel.querySelector("#password-notification-username").dropmarkerEl.click();
  await shown;
  return popup;
}

add_setup(async function () {
  await FormHistory.update([
    { op: "remove" },
    { op: "add", fieldname: "field1", value: "value1" },
  ]);
  await SpecialPowers.pushPrefEnv({
    set: [
      // Content prefers dark while the chrome window is light, so a popup
      // following content rather than the field it belongs to stands out.
      ["layout.css.prefers-color-scheme.content-override", 0],
      ["ui.systemUsesDarkTheme", 0],
      ["signon.capture.inputChanges.enabled", true],
    ],
  });
  registerCleanupFunction(() => FormHistory.update({ op: "remove" }));
});

add_task(async function test_doorhanger_username_popup_color_scheme() {
  await openContentPopupFromDarkField();

  await LoginTestUtils.clearData();
  let formProcessed = listenForTestNotification("FormProcessed");
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: FORM_URL },
    async browser => {
      await formProcessed;
      let popup = await openDoorhangerUsernamePopup(browser);

      Assert.equal(
        popup.style.colorScheme,
        "",
        "The doorhanger's field left no content scheme on the popup"
      );
      Assert.ok(
        !InspectorUtils.isUsedColorSchemeDark(popup),
        "The popup follows the light chrome window"
      );

      let hidden = BrowserTestUtils.waitForEvent(popup, "popuphidden");
      popup.hidePopup();
      await hidden;
    }
  );

  await cleanupDoorhanger();
});
