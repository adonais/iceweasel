/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

const { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);

AddonTestUtils.initMochitest(this);

// Regression test for Bug 2059855. This test verifies that the permissions
// popup gets focused on open, but without auto-focusing the controls inside
// it to prevent the user to accidentally grant permissions.
add_task(async function test_permission_prompt_focus() {
  const id = "permissions-panel-focus-test@test.mozilla.org";
  const xpi = AddonTestUtils.createTempWebExtensionFile({
    manifest: {
      browser_specific_settings: { gecko: { id } },
      name: "Test Panel autofocus",
      // Request some permissions that are expected to be prompt the user
      // to be granted.
      permissions: ["history", "https://*/*"],
      // Make sure there isn't a private browsing checkbox in the controls
      // expected to be part of the install-required permissions doorhanger.
      incognito: "not_allowed",
    },
  });

  await BrowserTestUtils.withNewTab("about:blank", async () => {
    const dialogPromise = promisePopupNotificationShown(
      "addon-webext-permissions"
    );

    gURLBar.value = xpi.path;
    gURLBar.focus();
    is(
      document.activeElement,
      gURLBar.inputField,
      "URLBar.inputField expected to be initially focused"
    );

    EventUtils.synthesizeKey("KEY_Enter");

    const panel = await dialogPromise;

    ok(
      !panel.contains(document.activeElement),
      "Panel controls expected to not be focused yet"
    );

    is(document.activeElement, document.body, "Focus moved to the browser UI");

    // Mock keyboard navigation inside the panel.
    EventUtils.synthesizeKey("KEY_Tab");
    ok(
      panel.contains(document.activeElement),
      "Tab should have moved the focus into the permission prompt"
    );
    isnot(
      document.activeElement,
      panel.button,
      "The first Tab stop should never be the button that grants the permissions"
    );

    let wasCancelledByUser = null;

    let promiseInstallCancelled = AddonTestUtils.promiseInstallEvent(
      "onInstallCancelled",
      (install, cancelledByUser) => {
        if (install.addon.id !== id) {
          return false;
        }

        wasCancelledByUser = cancelledByUser;
        return true;
      }
    );
    panel.secondaryButton.click();
    ok(
      !PopupNotifications.isPanelOpen,
      "Permission popup should be closed / closing"
    );
    info("Wait onInstallCancelled install event");
    await promiseInstallCancelled;
    is(
      wasCancelledByUser,
      true,
      "Expect onInstallCancelled to pass cancelledByUser set to true"
    );
  });
});
