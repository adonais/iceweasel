/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromiseTestUtils.sys.mjs"
);
PromiseTestUtils.allowMatchingRejectionsGlobally(/Not in fullscreen mode/);

SimpleTest.requestCompleteLog();

async function requestNotificationPermission(browser) {
  return SpecialPowers.spawn(browser, [], () => {
    return content.Notification.requestPermission();
  });
}

async function requestCameraPermission(browser) {
  return SpecialPowers.spawn(browser, [], () =>
    content.navigator.mediaDevices
      .getUserMedia({ video: true, fake: true })
      .then(
        () => true,
        () => false
      )
  );
}

add_task(async function test_fullscreen_closes_permissionui_prompt() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.webnotifications.requireuserinteraction", false],
      ["permissions.fullscreen.allowed", false],
    ],
  });

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com"
  );
  let browser = tab.linkedBrowser;

  let popupShown, requestResult, popupHidden;

  popupShown = BrowserTestUtils.waitForEvent(
    window.PopupNotifications.panel,
    "popupshown"
  );

  info("Requesting notification permission");
  requestResult = requestNotificationPermission(browser);
  await popupShown;

  info("Entering DOM full-screen");
  popupHidden = BrowserTestUtils.waitForEvent(
    window.PopupNotifications.panel,
    "popuphidden"
  );

  await DOMFullscreenTestUtils.changeFullscreen(browser, true);

  await popupHidden;

  is(
    await requestResult,
    "default",
    "Expect permission request to be cancelled"
  );

  await DOMFullscreenTestUtils.changeFullscreen(browser, false);

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_fullscreen_closes_webrtc_permission_prompt() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["media.navigator.permission.fake", true],
      ["media.navigator.permission.force", true],
      ["permissions.fullscreen.allowed", false],
    ],
  });

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com"
  );
  let browser = tab.linkedBrowser;
  let popupShown, requestResult, popupHidden;

  popupShown = BrowserTestUtils.waitForEvent(
    window.PopupNotifications.panel,
    "popupshown"
  );

  info("Requesting camera permission");
  requestResult = requestCameraPermission(browser);

  await popupShown;

  info("Entering DOM full-screen");
  popupHidden = BrowserTestUtils.waitForEvent(
    window.PopupNotifications.panel,
    "popuphidden"
  );
  await DOMFullscreenTestUtils.changeFullscreen(browser, true);

  await popupHidden;

  is(
    await requestResult,
    false,
    "Expect webrtc permission request to be cancelled"
  );

  await DOMFullscreenTestUtils.changeFullscreen(browser, false);

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_permission_prompt_closes_fullscreen() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.webnotifications.requireuserinteraction", false],
      ["permissions.fullscreen.allowed", false],
    ],
  });

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com"
  );
  let browser = tab.linkedBrowser;
  info("Entering DOM full-screen");
  await DOMFullscreenTestUtils.changeFullscreen(browser, true);

  let popupShown = BrowserTestUtils.waitForEvent(
    window.PopupNotifications.panel,
    "popupshown"
  );
  let fullScreenExit = DOMFullscreenTestUtils.waitForFullScreenState(
    browser,
    false
  );

  info("Requesting notification permission");
  requestNotificationPermission(browser).catch(() => {});
  await popupShown;

  info("Waiting for full-screen exit");
  await fullScreenExit;

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

function triggerMainCommand(popup) {
  let notifications = popup.childNodes;
  ok(!!notifications.length, "at least one notification displayed");
  let notification = notifications[0];
  info("Triggering main command for notification " + notification.id);
  EventUtils.synthesizeMouseAtCenter(notification.button, {});
}

add_task(
  async function test_permission_prompt_closes_fullscreen_and_extends_security_delay() {
    const TEST_SECURITY_DELAY = 500;
    await SpecialPowers.pushPrefEnv({
      set: [
        ["dom.webnotifications.requireuserinteraction", false],
        ["permissions.fullscreen.allowed", false],
        ["security.notification_enable_delay", TEST_SECURITY_DELAY],
        ["ui.prefersReducedMotion", 0],
        // macOS is not affected by the sec delay bug because it uses the native
        // macOS full screen API. Revert back to legacy behavior so we can also
        // test on macOS. If this pref is removed in the future we can consider
        // skipping the testcase for macOS altogether.
        ["full-screen-api.macos-native-full-screen", false],
      ],
    });

    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      "https://example.com"
    );
    let browser = tab.linkedBrowser;
    info("Entering DOM full-screen");
    await DOMFullscreenTestUtils.changeFullscreen(browser, true);

    let popupShown = BrowserTestUtils.waitForPopupEvent(
      window.PopupNotifications.panel,
      "shown"
    );
    let fullScreenExit = DOMFullscreenTestUtils.waitForFullScreenState(
      browser,
      false
    );

    info("Requesting notification permission");
    requestNotificationPermission(browser).catch(() => {});
    await popupShown;

    let notificationHiddenPromise = BrowserTestUtils.waitForPopupEvent(
      window.PopupNotifications.panel,
      "hidden"
    );

    info("Waiting for full-screen exit");
    await fullScreenExit;

    info("Wait for original security delay to expire.");
    SimpleTest.requestFlakyTimeout(
      "Wait for original security delay to expire."
    );
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(resolve => setTimeout(resolve, TEST_SECURITY_DELAY));

    info(
      "Trigger main action via button click during the extended security delay"
    );
    triggerMainCommand(PopupNotifications.panel);

    let notification = PopupNotifications.getNotification(
      "web-notifications",
      gBrowser.selectedBrowser
    );

    // Linux in CI seems to skip the full screen animation, which means its not
    // affected by the bug and we can't test extension of the sec delay here.
    if (Services.appinfo.OS == "Linux") {
      // skip this, intermittent passing on Ubuntu 24.04
    } else {
      ok(
        notification &&
          !notification.dismissed &&
          BrowserTestUtils.isVisible(PopupNotifications.panel.firstChild),
        "Notification should still be open because we clicked during the security delay."
      );
    }

    // If the notification is no longer shown (test failure) skip the remaining
    // checks.
    if (!notification) {
      // Cleanup
      BrowserTestUtils.removeTab(tab);
      await SpecialPowers.popPrefEnv();
      // Remove the granted notification permission.
      Services.perms.removeAll();
      return;
    }

    Assert.greater(
      notification.timeShown,
      performance.now(),
      "Notification timeShown property should be in the future, because the security delay was extended."
    );

    // Ensure that once the security delay has passed the notification can be
    // closed again.
    let fakeTimeShown = TEST_SECURITY_DELAY + 500;
    info(`Manually set timeShown to ${fakeTimeShown}ms in the past.`);
    notification.timeShown = performance.now() - fakeTimeShown;

    info("Trigger main action via button click outside security delay");
    triggerMainCommand(PopupNotifications.panel);

    info("Wait for panel to be hidden.");
    await notificationHiddenPromise;

    ok(
      !PopupNotifications.getNotification(
        "web-notifications",
        gBrowser.selectedBrowser
      ),
      "Should not longer see the notification."
    );

    // Cleanup
    BrowserTestUtils.removeTab(tab);
    await SpecialPowers.popPrefEnv();
    // Remove the granted notification permission.
    Services.perms.removeAll();
  }
);

add_task(
  async function test_permission_prompt_security_delay_with_reduced_motion() {
    const TEST_SECURITY_DELAY = 5000;
    await SpecialPowers.pushPrefEnv({
      set: [
        ["dom.webnotifications.requireuserinteraction", false],
        ["permissions.fullscreen.allowed", false],
        ["security.notification_enable_delay", TEST_SECURITY_DELAY],
        ["ui.prefersReducedMotion", 1],
        ["full-screen-api.macos-native-full-screen", false],
      ],
    });

    await BrowserTestUtils.withNewTab("https://example.com", async browser => {
      await TestUtils.waitForCondition(
        () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
      let transitionStartCount = 0;
      let startObserver = () => transitionStartCount++;
      Services.obs.addObserver(startObserver, "fullscreen-transition-start");
      let principal = browser.contentPrincipal;
      registerCleanupFunction(() => {
        Services.obs.removeObserver(
          startObserver,
          "fullscreen-transition-start"
        );
        Services.perms.removeFromPrincipal(principal, "desktop-notification");
      });
      await DOMFullscreenTestUtils.changeFullscreen(browser, true);
      let popupShown = BrowserTestUtils.waitForPopupEvent(
        PopupNotifications.panel,
        "shown"
      );
      let fullscreenExited = DOMFullscreenTestUtils.waitForFullScreenState(
        browser,
        false
      );
      let permissionResult = requestNotificationPermission(browser);
      await Promise.all([popupShown, fullscreenExited]);

      is(transitionStartCount, 0, "Reduced motion suppresses fullscreen fades");
      let notification = PopupNotifications.getNotification(
        "web-notifications",
        browser
      );
      ok(notification, "The permission notification is shown");
      Assert.lessOrEqual(
        notification.timeShown,
        ChromeUtils.now(),
        "Without a fade, the notification does not need an extended delay"
      );

      triggerMainCommand(PopupNotifications.panel);
      ok(
        PopupNotifications.isPanelOpen && !notification.dismissed,
        "The normal security delay still blocks the permission button"
      );
      is(
        PopupNotifications.getNotification("web-notifications", browser),
        notification,
        "The permission request remains pending during the security delay"
      );

      notification.timeShown = ChromeUtils.now() - TEST_SECURITY_DELAY - 500;
      let popupHidden = BrowserTestUtils.waitForPopupEvent(
        PopupNotifications.panel,
        "hidden"
      );
      triggerMainCommand(PopupNotifications.panel);
      await popupHidden;
      is(await permissionResult, "granted", "The button works after the delay");
    });
    await SpecialPowers.popPrefEnv();
  }
);
