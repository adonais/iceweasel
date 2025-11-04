/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Injects the form autofill section into about:preferences.
 */

const MANAGE_ADDRESSES_URL =
  "chrome://formautofill/content/manageAddresses.xhtml";
const MANAGE_CREDITCARDS_URL =
  "chrome://formautofill/content/manageCreditCards.xhtml";

import { FormAutofill } from "resource://autofill/FormAutofill.sys.mjs";
import { FormAutofillUtils } from "resource://gre/modules/shared/FormAutofillUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  OSKeyStore: "resource://gre/modules/OSKeyStore.sys.mjs",
});

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () =>
    new Localization(
      [
        "toolkit/formautofill/formAutofill.ftl",
        "branding/brand.ftl",
        "browser/preferences/preferences.ftl",
      ],
      true
    )
);

const { ENABLED_AUTOFILL_ADDRESSES_PREF, ENABLED_AUTOFILL_CREDITCARDS_PREF } =
  FormAutofill;

const FORM_AUTOFILL_CONFIG = {
  payments: {
    l10nId: "autofill-payment-methods-header",
    items: [
      {
        id: "saveAndFillPayments",
        l10nId: "autofill-payment-methods-checkbox-message-2",
        supportPage: "credit-card-autofill",
        items: [
          {
            id: "requireOSAuthForPayments",
            l10nId: "autofill-reauth-payment-methods-checkbox-2",
            supportPage:
              "credit-card-autofill#w_require-authentication-for-autofill",
          },
        ],
      },
      {
        id: "savedPaymentsButton",
        l10nId: "autofill-payment-methods-manage-payments-button",
        control: "moz-box-button",
      },
    ],
  },
  addresses: {
    l10nId: "autofill-addresses-header",
    items: [
      {
        id: "saveAndFillAddresses",
        l10nId: "autofill-addresses-checkbox-message",
        supportPage: "automatically-fill-your-address-web-forms",
      },
      {
        id: "savedAddressesButton",
        l10nId: "autofill-addresses-manage-addresses-button",
        control: "moz-box-button",
      },
    ],
  },
};

export function FormAutofillPreferences() {}

FormAutofillPreferences.prototype = {
  /**
   * Create the Form Autofill preference group.
   *
   * @param   {HTMLDocument} document
   * @returns {XULElement}
   */
  init(document) {
    this.createPreferenceGroup(document);
    return this.refs.formAutofillFragment;
  },

  /**
   * Remove event listeners and the preference group.
   */
  uninit() {
    this.refs.formAutofillGroup.remove();
  },

  /**
   * Create Form Autofill preference group
   *
   * @param  {HTMLDocument} document
   */
  createPreferenceGroup(document) {
    const win = document.ownerGlobal;
    this.refs = {};
    this.refs.formAutofillGroup = document.querySelector(
      "#formAutofillGroupBox"
    );

    let showAddressUI = FormAutofill.isAutofillAddressesAvailable;
    let showCreditCardUI = FormAutofill.isAutofillCreditCardsAvailable;

    if (!showAddressUI && !showCreditCardUI) {
      return;
    }

    win.Preferences.addAll([
      // Credit cards and addresses
      { id: ENABLED_AUTOFILL_ADDRESSES_PREF, type: "bool" },
      { id: ENABLED_AUTOFILL_CREDITCARDS_PREF, type: "bool" },
      {
        id: "extensions.formautofill.creditCards.os-auth.locked.enabled",
        type: "bool",
      },
    ]);

    win.Preferences.addSetting({
      id: "saveAndFillAddresses",
      pref: ENABLED_AUTOFILL_ADDRESSES_PREF,
      visible: () => FormAutofill.isAutofillAddressesAvailable,
    });
    win.Preferences.addSetting({
      id: "savedAddressesButton",
      pref: null,
      visible: () => FormAutofill.isAutofillAddressesAvailable,
      onUserClick: ({ target }) => {
        target.ownerGlobal.gSubDialog.open(MANAGE_ADDRESSES_URL);
      },
    });

    win.Preferences.addSetting({
      id: "saveAndFillPayments",
      pref: ENABLED_AUTOFILL_CREDITCARDS_PREF,
      visible: () => FormAutofill.isAutofillCreditCardsAvailable,
    });
    win.Preferences.addSetting({
      id: "savedPaymentsButton",
      pref: null,
      visible: () => FormAutofill.isAutofillCreditCardsAvailable,
      onUserClick: ({ target }) => {
        target.ownerGlobal.gSubDialog.open(MANAGE_CREDITCARDS_URL);
      },
    });
    win.Preferences.addSetting({
      id: "requireOSAuthForPayments",
      visible: () => lazy.OSKeyStore.canReauth(),
      get: () => FormAutofillUtils.getOSAuthEnabled(),
      async set(checked) {
        await FormAutofillPreferences.prototype.trySetOSAuthEnabled(
          win,
          checked
        );
      },
      setup: emitChange => {
        Services.obs.addObserver(emitChange, "OSAuthEnabledChange");
        return () =>
          Services.obs.removeObserver(emitChange, "OSAuthEnabledChange");
      },
    });

    let paymentsGroup = document.querySelector(
      "setting-group[groupid=payments]"
    );
    paymentsGroup.config = FORM_AUTOFILL_CONFIG.payments;
    paymentsGroup.getSetting = win.Preferences.getSetting.bind(win.Preferences);

    let addressesGroup = document.querySelector(
      "setting-group[groupid=addresses]"
    );
    addressesGroup.config = FORM_AUTOFILL_CONFIG.addresses;
    addressesGroup.getSetting = win.Preferences.getSetting.bind(
      win.Preferences
    );
  },

  async trySetOSAuthEnabled(win, checked) {
    let messageText = await lazy.l10n.formatValueSync(
      "autofill-creditcard-os-dialog-message"
    );
    let captionText = await lazy.l10n.formatValueSync(
      "autofill-creditcard-os-auth-dialog-caption"
    );

    // Calling OSKeyStore.ensureLoggedIn() instead of FormAutofillUtils.verifyOSAuth()
    // since we want to authenticate user each time this setting is changed.

    // Note on Glean collection: because OSKeyStore.ensureLoggedIn() is not wrapped in
    // verifyOSAuth(), it will be documenting "success" for unsupported platforms
    // and won't record "fail_error", only "fail_user_canceled"
    let isAuthorized = (
      await lazy.OSKeyStore.ensureLoggedIn(messageText, captionText, win, false)
    ).authenticated;
    Glean.formautofill.promptShownOsReauth.record({
      trigger: "toggle_pref_os_auth",
      result: isAuthorized ? "success" : "fail_user_canceled",
    });

    if (!isAuthorized) {
      FormAutofillUtils.setOSAuthEnabled(!checked);
      return;
    }

    // If target.checked is checked, enable OSAuth. Otherwise, reset the pref value.
    FormAutofillUtils.setOSAuthEnabled(checked);
    Glean.formautofill.requireOsReauthToggle.record({
      toggle_state: checked,
    });
  },
};
