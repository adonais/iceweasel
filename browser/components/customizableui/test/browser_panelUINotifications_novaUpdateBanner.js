/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AppMenuNotifications } = ChromeUtils.importESModule(
  "resource://gre/modules/AppMenuNotifications.sys.mjs"
);

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({ set: [["browser.nova.enabled", true]] });
});

registerCleanupFunction(async function () {
  await SpecialPowers.popPrefEnv();
});

async function showBannerInNewWindow(notificationId) {
  let win = await BrowserTestUtils.openNewBrowserWindow();
  AppMenuNotifications.showBadgeOnlyNotification(notificationId);

  let menuButton = win.document.getElementById("PanelUI-menu-button");
  let shown = BrowserTestUtils.waitForEvent(win.PanelUI.mainView, "ViewShown");
  menuButton.click();
  await shown;

  let banner = win.document.getElementById("appMenu-update-banner");
  await BrowserTestUtils.waitForMutationCondition(
    banner,
    { attributes: true, attributeFilter: ["notificationid", "hidden"] },
    () =>
      !banner.hidden && banner.getAttribute("notificationid") === notificationId
  );

  return { win, banner };
}

async function cleanup(win) {
  AppMenuNotifications.removeNotification(/.*/);
  await BrowserTestUtils.closeWindow(win);
}

add_task(async function testUpdateRestartUsesAriaLabelledby() {
  let { win, banner } = await showBannerInNewWindow("update-restart");

  is(
    banner.getAttribute("aria-labelledby"),
    "appMenu-update-banner-title appMenu-update-banner-description",
    "Banner should reference inline title + description via aria-labelledby"
  );

  let inner = banner.querySelector(".appMenu-update-banner-text");
  ok(inner, "Two-line text container should exist in markup");
  ok(
    BrowserTestUtils.isVisible(inner),
    "Two-line title/description should be visible for update-restart"
  );

  await cleanup(win);
});

add_task(async function testUpdateRestartClickCallsMainAction() {
  let mainActionCalled = false;
  let mainAction = {
    callback: () => {
      mainActionCalled = true;
    },
  };

  let win = await BrowserTestUtils.openNewBrowserWindow();
  AppMenuNotifications.showNotification("update-restart", mainAction, null, {
    dismissed: true,
  });

  let menuButton = win.document.getElementById("PanelUI-menu-button");
  let shown = BrowserTestUtils.waitForEvent(win.PanelUI.mainView, "ViewShown");
  menuButton.click();
  await shown;

  let banner = win.document.getElementById("appMenu-update-banner");
  await BrowserTestUtils.waitForMutationCondition(
    banner,
    { attributes: true, attributeFilter: ["notificationid", "hidden"] },
    () =>
      !banner.hidden &&
      banner.getAttribute("notificationid") === "update-restart"
  );

  banner.click();
  ok(mainActionCalled, "Main action callback fires when the banner is clicked");

  await cleanup(win);
});

add_task(async function testOtherUpdateStatesKeepLabel() {
  for (let id of [
    "update-available",
    "update-downloading",
    "update-manual",
    "update-unsupported",
  ]) {
    let { win, banner } = await showBannerInNewWindow(id);

    ok(
      !banner.hasAttribute("aria-labelledby"),
      `Banner should not set aria-labelledby for ${id}`
    );
    ok(
      banner.hasAttribute("data-l10n-id"),
      `Banner should have data-l10n-id for ${id} under nova`
    );

    let inner = banner.querySelector(".appMenu-update-banner-text");
    ok(
      !BrowserTestUtils.isVisible(inner),
      `Two-line title/description should be hidden for ${id}`
    );

    await cleanup(win);
  }
});
