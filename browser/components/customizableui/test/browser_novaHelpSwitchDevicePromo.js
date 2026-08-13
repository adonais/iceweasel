/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({ set: [["browser.nova.enabled", true]] });
});

registerCleanupFunction(async function () {
  await SpecialPowers.popPrefEnv();
});

async function openHelpView() {
  await gCUITestUtils.openMainMenu();
  PanelUI.showHelpView(document.getElementById("PanelUI-menu-button"));
  let helpView = document.getElementById("PanelUI-helpView");
  await BrowserTestUtils.waitForEvent(helpView, "ViewShowing");
  return helpView;
}

add_task(async function testNovaPromoReplacesHelpSwitchDevice() {
  let helpView = await openHelpView();

  ok(
    !helpView.querySelector("#appMenu_helpSwitchDevice"),
    "appMenu_helpSwitchDevice should not be present when nova is enabled"
  );

  let promo = helpView.querySelector("#appMenu-nova-switch-device-promo");
  ok(promo, "Nova switch device promo should be present when nova is enabled");

  await gCUITestUtils.hideMainMenu();
});

add_task(async function testSwitchDeviceButtonPresentWithoutNova() {
  await SpecialPowers.pushPrefEnv({ set: [["browser.nova.enabled", false]] });

  let helpView = await openHelpView();

  ok(
    helpView.querySelector("#appMenu_helpSwitchDevice"),
    "appMenu_helpSwitchDevice should be present when nova is disabled"
  );
  ok(
    !helpView.querySelector("#appMenu-nova-switch-device-promo"),
    "Nova switch device promo should not be present when nova is disabled"
  );

  await gCUITestUtils.hideMainMenu();
  await SpecialPowers.popPrefEnv();
});

add_task(
  async function testNovaPromoSupportLinkCallsOpenSwitchingDevicesPage() {
    let switchingDevicesPageOpened = false;
    let originalFn = window.openSwitchingDevicesPage;
    window.openSwitchingDevicesPage = () => {
      switchingDevicesPageOpened = true;
    };

    let helpView = await openHelpView();

    let link = helpView.querySelector("#appMenu-nova-switch-device-link");
    ok(link, "Nova switch device support link should exist");
    link.click();

    ok(
      switchingDevicesPageOpened,
      "openSwitchingDevicesPage should be called when the support link is clicked"
    );

    window.openSwitchingDevicesPage = originalFn;
    await gCUITestUtils.hideMainMenu();
  }
);
