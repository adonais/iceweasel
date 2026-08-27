/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test that a notification opting into `lowerPanelLevel` lowers the panel's
// popup level to "parent" so a popup hosted inside it (such as the password
// doorhanger's autocomplete dropdown) can stack above the panel, and that the
// attribute is cleared again for notifications that don't request it.

function test() {
  waitForExplicitFinish();
  setup();
}

var tests = [
  {
    id: "lowerPanelLevel-set",
    run() {
      this.notifyObj = new BasicNotification(this.id);
      this.notifyObj.addOptions({ lowerPanelLevel: true });
      showNotification(this.notifyObj);
    },
    onShown(popup) {
      is(
        popup.getAttribute("level"),
        "parent",
        "panel level is lowered to parent when lowerPanelLevel is set"
      );
      triggerMainCommand(popup);
    },
    onHidden() {},
  },
  {
    id: "lowerPanelLevel-unset",
    run() {
      this.notifyObj = new BasicNotification(this.id);
      showNotification(this.notifyObj);
    },
    onShown(popup) {
      ok(
        !popup.hasAttribute("level"),
        "panel level attribute is cleared without lowerPanelLevel"
      );
      triggerMainCommand(popup);
    },
    onHidden() {},
  },
];
