/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const lazy = {};

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () =>
    new Localization([
      "branding/brand.ftl",
      "toolkit/main-window/autocomplete.ftl",
    ])
);

const TITLE_L10N_IDS = {
  password: "autocomplete-delete-password-title",
  address: "autocomplete-delete-address-title",
  payment: "autocomplete-delete-payment-method-title",
};

export const AutocompleteRemoveRecord = {
  async passwordOSAuthStrings() {
    const platform = AppConstants.platform;
    const ids = [{ id: "autocomplete-remove-password-os-auth-dialog-caption" }];
    if (platform == "win" || platform == "macosx") {
      ids.push({
        id: `autocomplete-remove-password-os-auth-dialog-message-${platform}`,
      });
    }
    const [caption, message = null] = await lazy.l10n.formatValues(ids);
    return { message, caption };
  },

  /**
   * @param {ChromeWindow} chromeWindow
   * @param {string} recordType
   * @param {string} [flowId] The flow id of the dropdown the removal came from.
   */
  async confirmRemoval(chromeWindow, recordType, flowId = "") {
    const [title, message, confirmButton] = await lazy.l10n.formatValues([
      { id: TITLE_L10N_IDS[recordType] },
      { id: "autocomplete-remove-record-message" },
      { id: "autocomplete-delete-record-button" },
    ]);

    const flags =
      Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0 +
      Services.prompt.BUTTON_TITLE_CANCEL * Services.prompt.BUTTON_POS_1;

    const result = await Services.prompt.asyncConfirmEx(
      chromeWindow.browsingContext,
      Services.prompt.MODAL_TYPE_INTERNAL_WINDOW,
      title,
      message,
      flags,
      confirmButton,
      null,
      null,
      null,
      false,
      {}
    );

    const confirmed =
      result.QueryInterface(Ci.nsIPropertyBag2).get("buttonNumClicked") == 0;
    Glean.autocomplete.recordDialogInteraction.record({
      record_type: recordType,
      interaction_type: confirmed ? "confirm" : "cancel",
      update_type: "delete",
      flow_id: flowId,
    });
    return confirmed;
  },
};
