/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const UPDATES_PANE = SRD_PREF_VALUE ? "paneAbout" : "paneGeneral";

add_task(async function test_updates_managed_by_os_message_bar() {
  await openPreferencesViaOpenPreferencesAPI(UPDATES_PANE, { leaveOpen: true });
  let win = gBrowser.selectedBrowser.contentWindow;

  let updatesManagedByOSControl = await settingControlRenders(
    "updatesManagedByOS",
    win
  );
  let updatesManagedByOSMessageBar = updatesManagedByOSControl.controlEl;

  let isPackagedApp = Services.sysinfo.getProperty("isPackagedApp");
  is(
    BrowserTestUtils.isHidden(updatesManagedByOSMessageBar),
    win.AppConstants.MOZ_UPDATER && !isPackagedApp,
    "updatesManagedByOS message bar is shown only when running as a packaged app"
  );

  if (win.AppConstants.MOZ_UPDATER && !isPackagedApp) {
    let updateRadioGroupControl = await settingControlRenders(
      "updateRadioGroup",
      win
    );
    let updateRadioGroup = updateRadioGroupControl.controlEl;
    if (BrowserTestUtils.isVisible(updateRadioGroup)) {
      await assertRadioGroupAccessibleName(updateRadioGroup);
    } else {
      info("Update installation controls are intentionally hidden");
    }
  }

  gBrowser.removeCurrentTab();
});
