/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test reused popupnotifications must update its
// secondary button between "split" and "default" as secondary actions change.

function test() {
  waitForExplicitFinish();

  let popupnotification = document.createXULElement("popupnotification");
  popupnotification.id = "dropmarker-reuse-test-notification";
  popupnotification.hidden = true;
  document.documentElement.appendChild(popupnotification);
  registerCleanupFunction(() => popupnotification.remove());

  setup();
}

var tests = [
  {
    id: "two-secondary-actions",
    run() {
      this.notifyObj = new BasicNotification(this.id);
      this.notifyObj.id = "dropmarker-reuse-test";
      this.notifyObj.secondaryActions = [
        { label: "Second", accessKey: "S", callback() {} },
        { label: "Third", accessKey: "T", callback() {} },
      ];
      showNotification(this.notifyObj);
    },
    onShown(popup) {
      let notification = popup.childNodes[0];
      ok(!notification.hasAttribute("dropmarkerhidden"), "dropmarker is shown");
      is(notification.secondaryButton.type, "split", "split button");
      triggerMainCommand(popup);
    },
    onHidden() {},
  },
  {
    id: "one-secondary-action-after-reuse",
    run() {
      this.notifyObj = new BasicNotification(this.id);
      this.notifyObj.id = "dropmarker-reuse-test";
      this.notifyObj.secondaryActions = [
        { label: "Second", accessKey: "S", callback() {} },
      ];
      showNotification(this.notifyObj);
    },
    onShown(popup) {
      let notification = popup.childNodes[0];
      ok(notification.hasAttribute("dropmarkerhidden"), "dropmarker is hidden");
      is(notification.secondaryButton.type, "default", "default button");
      triggerMainCommand(popup);
    },
    onHidden() {},
  },
];
