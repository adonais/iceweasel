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
const EDIT_CREDIT_CARD_URL =
  "chrome://formautofill/content/editCreditCard.xhtml";

import { FormAutofill } from "resource://autofill/FormAutofill.sys.mjs";
import { FormAutofillUtils } from "resource://gre/modules/shared/FormAutofillUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  OSKeyStore: "resource://gre/modules/OSKeyStore.sys.mjs",
  formAutofillStorage: "resource://autofill/FormAutofillStorage.sys.mjs",
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

export class FormAutofillPreferences {
  /**
   * Create the Form Autofill preference group.
   *
   * @param   {HTMLDocument} document
   * @returns {XULElement}
   */
  init(document) {
    this.createPreferenceGroup(document);
  }

  /**
   * Create Form Autofill preference group
   *
   * @param  {HTMLDocument} document
   */
  createPreferenceGroup(document) {
    const win = document.ownerGlobal;
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
      onUserClick: e => {
        e.preventDefault();

        if (Services.prefs.getBoolPref("browser.settings-redesign.enabled")) {
          e.target.ownerGlobal.gotoPref("paneManagePayments");
        } else {
          e.target.ownerGlobal.gSubDialog.open(MANAGE_CREDITCARDS_URL);
        }
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
  }

  async initializePaymentsStorage() {
    await lazy.formAutofillStorage.initialize();
  }

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
  }

  async makePaymentsListItems() {
    const records = await lazy.formAutofillStorage.creditCards.getAll();
    if (!records.length) {
      return [];
    }

    const items = records.map(record => {
      const config = {
        id: "payment-item",
        control: "moz-box-item",
        l10nId: "payment-moz-box-item",
        iconSrc: "chrome://formautofill/content/icon-credit-card-generic.svg",
        l10nArgs: {
          cardNumber: record["cc-number"].replace(/^(\*+)(\d+)$/, "$2$1"),
          expDate: record["cc-exp"].replace(/^(\d{4})-\d{2}$/, "XX/$1"),
        },
        options: [
          {
            control: "moz-button",
            iconSrc: "chrome://global/skin/icons/delete.svg",
            type: "icon",
            controlAttrs: {
              slot: "actions",
              action: "remove",
              guid: record.guid,
            },
          },
          {
            control: "moz-button",
            iconSrc: "chrome://global/skin/icons/edit.svg",
            type: "icon",
            controlAttrs: {
              slot: "actions",
              action: "edit",
              guid: record.guid,
            },
          },
        ],
      };

      return config;
    });

    return [
      {
        id: "payments-list-header",
        control: "moz-box-item",
        l10nId: "payments-list-item-label",
      },
      ...items,
    ];
  }

  /**
   * Open the browser window modal to prompt the user whether
   * or they want to remove their payment.
   *
   * @param  {string} guid
   *          The guid of the payment item we are prompting to remove.
   * @param  {object} browsingContext
   *          Browsing context to open the prompt in
   * @param  {string} title
   *          The title text displayed in the modal to prompt the user with
   * @param  {string} confirmBtn
   *        The text for confirming removing a payment method
   * @param  {string} cancelBtn
   *        The text for cancelling removing a payment method
   */
  async openRemovePaymentDialog(
    guid,
    browsingContext,
    title,
    confirmBtn,
    cancelBtn
  ) {
    const flags =
      Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0 +
      Services.prompt.BUTTON_TITLE_CANCEL * Services.prompt.BUTTON_POS_1;
    const result = await Services.prompt.asyncConfirmEx(
      browsingContext,
      Services.prompt.MODAL_TYPE_INTERNAL_WINDOW,
      title,
      null,
      flags,
      confirmBtn,
      cancelBtn,
      null,
      null,
      false
    );

    const propBag = result.QueryInterface(Ci.nsIPropertyBag2);
    // Confirmed
    if (propBag.get("buttonNumClicked") === 0) {
      lazy.formAutofillStorage.creditCards.remove(guid);
    }
  }

  async openEditCreditCardDialog(guid, window) {
    const creditCard = await lazy.formAutofillStorage.creditCards.get(guid);
    return FormAutofillPreferences.openEditCreditCardDialog(creditCard, window);
  }
  /**
   * Open the edit credit card dialog to create/edit a credit card.
   *
   * @param  {object} creditCard
   *         The credit card we want to edit.
   */
  static async openEditCreditCardDialog(creditCard, window) {
    // Ask for reauth if user is trying to edit an existing credit card.
    if (creditCard) {
      const promptMessage = FormAutofillUtils.reauthOSPromptMessage(
        "autofill-edit-payment-method-os-prompt-macos",
        "autofill-edit-payment-method-os-prompt-windows",
        "autofill-edit-payment-method-os-prompt-other"
      );
      let verified;
      let result;
      try {
        verified = await FormAutofillUtils.verifyUserOSAuth(
          FormAutofill.AUTOFILL_CREDITCARDS_OS_AUTH_LOCKED_PREF,
          promptMessage
        );
        result = verified ? "success" : "fail_user_canceled";
      } catch (ex) {
        result = "fail_error";
        throw ex;
      } finally {
        Glean.formautofill.promptShownOsReauth.record({
          trigger: "edit",
          result,
        });
      }
      if (!verified) {
        return;
      }
    }

    let decryptedCCNumObj = {};
    let errorResult = 0;
    if (creditCard && creditCard["cc-number-encrypted"]) {
      try {
        decryptedCCNumObj["cc-number"] = await lazy.OSKeyStore.decrypt(
          creditCard["cc-number-encrypted"],
          "formautofill_cc"
        );
      } catch (ex) {
        errorResult = ex.result;
        if (ex.result == Cr.NS_ERROR_ABORT) {
          // User shouldn't be ask to reauth here, but it could happen.
          // Return here and skip opening the dialog.
          return;
        }
        // We've got ourselves a real error.
        // Recover from encryption error so the user gets a chance to re-enter
        // unencrypted credit card number.
        decryptedCCNumObj["cc-number"] = "";
        console.error(ex);
      } finally {
        Glean.creditcard.osKeystoreDecrypt.record({
          isDecryptSuccess: errorResult === 0,
          errorResult,
          trigger: "edit",
        });
      }
    }
    let decryptedCreditCard = Object.assign({}, creditCard, decryptedCCNumObj);
    window.gSubDialog.open(
      EDIT_CREDIT_CARD_URL,
      { features: "resizable=no" },
      {
        record: decryptedCreditCard,
      }
    );
  }
}
