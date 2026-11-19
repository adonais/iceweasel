"use strict";

const { AppMenuNotifications } = ChromeUtils.importESModule(
  "resource://gre/modules/AppMenuNotifications.sys.mjs"
);

async function waitForFullscreen() {
  let browser = gBrowser.selectedBrowser;
  await BrowserTestUtils.waitForEvent(window, "fullscreen");
  if (Services.appinfo.OS === "Darwin") {
    await SpecialPowers.spawn(browser, [], async () => {
      if (!content.browsingContext.isActive) {
        await ContentTaskUtils.waitForEvent(
          content.document,
          "visibilitychange",
          true,
          () => content.browsingContext.isActive
        );
      }
    });
  }
}

add_task(async function testFullscreen() {
  if (Services.appinfo.OS !== "Darwin") {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.fullscreen.autohide", false]],
    });
  }

  is(
    PanelUI.notificationPanel.state,
    "closed",
    "update-manual doorhanger is closed."
  );
  let mainActionCalled = false;
  let mainAction = {
    callback: () => {
      mainActionCalled = true;
    },
  };
  AppMenuNotifications.showNotification("update-manual", mainAction);
  await BrowserTestUtils.waitForEvent(PanelUI.notificationPanel, "popupshown");

  isnot(
    PanelUI.notificationPanel.state,
    "closed",
    "update-manual doorhanger is showing."
  );
  let notifications = [...PanelUI.notificationPanel.children].filter(
    n => !n.hidden
  );
  is(
    notifications.length,
    1,
    "PanelUI doorhanger is only displaying one notification."
  );
  let doorhanger = notifications[0];
  is(
    doorhanger.id,
    "appMenu-update-manual-notification",
    "PanelUI is displaying the update-manual notification."
  );

  let fullscreenPromise = waitForFullscreen();
  EventUtils.synthesizeKey("KEY_F11");
  await fullscreenPromise;
  isnot(
    PanelUI.notificationPanel.state,
    "closed",
    "update-manual doorhanger is still showing after entering fullscreen."
  );

  let popuphiddenPromise = BrowserTestUtils.waitForEvent(
    PanelUI.notificationPanel,
    "popuphidden"
  );
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
    content.document.documentElement.requestFullscreen();
  });
  await popuphiddenPromise;
  await new Promise(executeSoon);
  is(
    PanelUI.notificationPanel.state,
    "closed",
    "update-manual doorhanger is hidden after entering DOM fullscreen."
  );

  let popupshownPromise = BrowserTestUtils.waitForEvent(
    PanelUI.notificationPanel,
    "popupshown"
  );
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
    content.document.exitFullscreen();
  });
  await popupshownPromise;
  await new Promise(executeSoon);
  isnot(
    PanelUI.notificationPanel.state,
    "closed",
    "update-manual doorhanger is shown after exiting DOM fullscreen."
  );
  isnot(
    PanelUI.menuButton.getAttribute("badge-status"),
    "update-manual",
    "Badge is not displaying on PanelUI button."
  );

  doorhanger.button.click();
  ok(mainActionCalled, "Main action callback was called");
  is(
    PanelUI.notificationPanel.state,
    "closed",
    "update-manual doorhanger is closed."
  );
  is(
    PanelUI.menuButton.hasAttribute("badge-status"),
    false,
    "Should not have a badge status"
  );

  fullscreenPromise = BrowserTestUtils.waitForEvent(window, "fullscreen");
  EventUtils.synthesizeKey("KEY_F11");
  await fullscreenPromise;
});
