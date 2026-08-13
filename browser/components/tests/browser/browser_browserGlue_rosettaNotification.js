/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const kNotificationSelector =
  'notification-message[message-bar-type="infobar"]' +
  '[value="rosetta-translated"]';

function closeExistingNotification() {
  const notification = document.querySelector(kNotificationSelector);
  if (notification) {
    notification.remove();
  }
  Assert.equal(
    null,
    document.querySelector(kNotificationSelector),
    "No more notification"
  );
}

function setRosettaStatus(isTranslated) {
  Services.sysinfo
    .QueryInterface(Ci.nsIWritablePropertyBag2)
    .setPropertyAsBool("rosettaStatus", isTranslated);
}

async function getNotification(shouldBeNull = false) {
  await TestUtils.waitForCondition(() => {
    const notification = document.querySelector(kNotificationSelector);
    if (shouldBeNull) {
      return notification === null;
    }
    return notification !== null;
  }, "Waiting for Rosetta notification");
  return document.querySelector(kNotificationSelector);
}

const { RosettaUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/RosettaUtils.sys.mjs"
);

add_setup(function setup() {
  RosettaUtils.sessionDismissed = false;
  closeExistingNotification();
  const originalValue = Services.sysinfo
    .QueryInterface(Ci.nsIWritablePropertyBag2)
    .getPropertyAsBool("rosettaStatus");
  registerCleanupFunction(() => {
    RosettaUtils.sessionDismissed = false;
    setRosettaStatus(originalValue);
    closeExistingNotification();
  });
});

add_task(async function doNotShowNotificationWhenNotTranslated() {
  setRosettaStatus(false);
  RosettaUtils.maybeWarnAboutRosetta(window);

  const notification = await getNotification(true);
  Assert.equal(null, notification, "Notification is not shown outside Rosetta");
});

add_task(async function showNotificationWhenTranslated() {
  setRosettaStatus(true);
  RosettaUtils.maybeWarnAboutRosetta(window);

  const notification = await getNotification();
  Assert.notEqual(null, notification, "Notification is shown under Rosetta");
  Assert.equal(
    notification.priority,
    window.gNotificationBox.PRIORITY_INFO_HIGH,
    "Has high info priority"
  );
  Assert.equal(notification.dismissable, true, "Notification is dismissable");
  Assert.ok(
    notification.querySelector('[href*="firefox-rosetta-macos"]'),
    "Notification links to the Rosetta support article"
  );
  const label = notification.getAttribute("label") || notification.textContent;
  Assert.ok(
    !label.includes("rosetta-translated-message"),
    "FTL string was displayed properly"
  );
  closeExistingNotification();
});

add_task(async function onlyOneNotificationPerWindow() {
  setRosettaStatus(true);
  RosettaUtils.maybeWarnAboutRosetta(window);
  const first = await getNotification();
  RosettaUtils.maybeWarnAboutRosetta(window);
  const second = await getNotification();
  Assert.strictEqual(first, second, "Only one notification shown per window");
  closeExistingNotification();
});

add_task(async function notificationShownInNewWindows() {
  setRosettaStatus(true);
  const win2 = await BrowserTestUtils.openNewBrowserWindow();
  await TestUtils.waitForCondition(
    () => win2.document.querySelector(kNotificationSelector) !== null,
    "Waiting for Rosetta notification in new window"
  );
  const notification = win2.document.querySelector(kNotificationSelector);
  Assert.ok(notification, "New window shows Rosetta notification");
  await BrowserTestUtils.closeWindow(win2);
});

add_task(async function dismissalSilencesSession() {
  setRosettaStatus(true);
  RosettaUtils.maybeWarnAboutRosetta(window);
  const notification = await getNotification();

  const win2 = await BrowserTestUtils.openNewBrowserWindow();
  Assert.ok(
    win2.document.querySelector(kNotificationSelector),
    "Second window shows the banner before dismissal"
  );

  notification.dismiss();
  await getNotification(true);

  RosettaUtils.maybeWarnAboutRosetta(window);
  Assert.equal(
    null,
    document.querySelector(kNotificationSelector),
    "Dismissed notification does not return in same window"
  );

  await TestUtils.waitForCondition(
    () => win2.document.querySelector(kNotificationSelector) === null,
    "Banner cleared from other already-open windows on dismissal"
  );
  await BrowserTestUtils.closeWindow(win2);

  const win3 = await BrowserTestUtils.openNewBrowserWindow();
  Assert.equal(
    null,
    win3.document.querySelector(kNotificationSelector),
    "Dismissed notification does not appear in new windows this session"
  );
  await BrowserTestUtils.closeWindow(win3);
});
