/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** An event emitted when a setting changes. */
export class SettingChangedEvent extends Event {
  static eventName = "devtools-setting-changed";

  /**
   * @param {object} details
   * @param {string} details.action
   */
  constructor({ action }) {
    super(SettingChangedEvent.eventName, {
      bubbles: true,
      composed: true,
    });
    this.action = action;
  }
}
