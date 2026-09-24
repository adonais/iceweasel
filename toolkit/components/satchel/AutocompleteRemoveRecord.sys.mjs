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
  password: "autocomplete-remove-password-title",
  address: "autocomplete-remove-address-title",
  payment: "autocomplete-remove-payment-method-title",
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

  async confirmRemoval(chromeWindow, recordType) {
    const [title, message, confirmButton] = await lazy.l10n.formatValues([
      { id: TITLE_L10N_IDS[recordType] },
      { id: "autocomplete-remove-record-message" },
      { id: "autocomplete-remove-record-button" },
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

    return (
      result.QueryInterface(Ci.nsIPropertyBag2).get("buttonNumClicked") == 0
    );
  },
};
