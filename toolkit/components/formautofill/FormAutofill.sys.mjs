/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";
import { Region } from "resource://gre/modules/Region.sys.mjs";
import { AddressMetaDataLoader } from "resource://gre/modules/shared/AddressMetaDataLoader.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AutofillDataTypes: "resource://gre/modules/shared/AutofillDataTypes.sys.mjs",
});

const BROWSER_SEARCH_REGION_PREF = "browser.search.region";
const ENABLED_AUTOFILL_ADDRESSES_PREF =
  "extensions.formautofill.addresses.enabled";
const ENABLED_AUTOFILL_ADDRESSES_CAPTURE_PREF =
  "extensions.formautofill.addresses.capture.enabled";
const ENABLED_AUTOFILL_ADDRESSES_CAPTURE_REQUIRED_FIELDS_PREF =
  "extensions.formautofill.addresses.capture.requiredFields";
const ENABLED_AUTOFILL_CREDITCARDS_PREF =
  "extensions.formautofill.creditCards.enabled";
const AUTOFILL_CREDITCARDS_OS_AUTH_LOCKED_PREF =
  "extensions.formautofill.creditCards.os-auth.locked.enabled";
const AUTOFILL_CREDITCARDS_HIDE_UI_PREF =
  "extensions.formautofill.creditCards.hideui";
const FORM_AUTOFILL_SUPPORT_RTL_PREF = "extensions.formautofill.supportRTL";
const AUTOFILL_CREDITCARDS_AUTOCOMPLETE_OFF_PREF =
  "extensions.formautofill.creditCards.ignoreAutocompleteOff";
const AUTOFILL_ADDRESSES_AUTOCOMPLETE_OFF_PREF =
  "extensions.formautofill.addresses.ignoreAutocompleteOff";
const ENABLED_AUTOFILL_CAPTURE_ON_FORM_REMOVAL_PREF =
  "extensions.formautofill.heuristics.captureOnFormRemoval";
const ENABLED_AUTOFILL_CAPTURE_ON_PAGE_NAVIGATION_PREF =
  "extensions.formautofill.heuristics.captureOnPageNavigation";
const ENABLED_AUTOFILL_SAME_ORIGIN_WITH_TOP =
  "extensions.formautofill.heuristics.autofillSameOriginWithTop";
const ENABLED_AUTOFILL_DETECT_DYNAMIC_FORM_CHANGES_PREF =
  "extensions.formautofill.heuristics.detectDynamicFormChanges";
const AUTOFILL_FILL_ON_DYNAMIC_FORM_CHANGES_TIMEOUT_PREF =
  "extensions.formautofill.heuristics.fillOnDynamicFormChanges.timeout";
const AUTOFILL_FILL_ON_DYNAMIC_FORM_CHANGES_PREF =
  "extensions.formautofill.heuristics.fillOnDynamicFormChanges";
const AUTOFILL_REFILL_ON_SITE_CLEARING_VALUE_PREF =
  "extensions.formautofill.heuristics.refillOnSiteClearingFields";
const AUTOFILL_REFILL_ON_SITE_CLEARING_VALUE_TIMEOUT_PREF =
  "extensions.formautofill.heuristics.refillOnSiteClearingFields.timeout";

export const FormAutofill = {
  ENABLED_AUTOFILL_ADDRESSES_PREF,
  ENABLED_AUTOFILL_ADDRESSES_CAPTURE_PREF,
  ENABLED_AUTOFILL_CAPTURE_ON_FORM_REMOVAL_PREF,
  ENABLED_AUTOFILL_CAPTURE_ON_PAGE_NAVIGATION_PREF,
  ENABLED_AUTOFILL_SAME_ORIGIN_WITH_TOP,
  ENABLED_AUTOFILL_CREDITCARDS_PREF,
  ENABLED_AUTOFILL_DETECT_DYNAMIC_FORM_CHANGES_PREF,
  AUTOFILL_CREDITCARDS_OS_AUTH_LOCKED_PREF,
  AUTOFILL_CREDITCARDS_AUTOCOMPLETE_OFF_PREF,
  AUTOFILL_ADDRESSES_AUTOCOMPLETE_OFF_PREF,
  AUTOFILL_FILL_ON_DYNAMIC_FORM_CHANGES_PREF,
  AUTOFILL_FILL_ON_DYNAMIC_FORM_CHANGES_TIMEOUT_PREF,
  AUTOFILL_REFILL_ON_SITE_CLEARING_VALUE_PREF,
  AUTOFILL_REFILL_ON_SITE_CLEARING_VALUE_TIMEOUT_PREF,

  _region: null,

  get DEFAULT_REGION() {
    return this._region || Region.home || "US";
  },

  set DEFAULT_REGION(region) {
    this._region = region;
  },

  /**
   * Determines if an autofill feature should be enabled based on the "available"
   * and "supportedCountries" parameters.
   *
   * @param {string} available Available can be one of the following: "on", "detect", "off".
   * "on" forces the particular Form Autofill feature on, while "detect" utilizes the supported countries
   * to see if the feature should be available.
   * @param {string[]} supportedCountries
   * @returns {boolean} `true` if autofill feature is supported in the current browser search region
   */
  _isSupportedRegion(available, supportedCountries) {
    if (available == "on") {
      return true;
    } else if (available == "detect") {
      if (!FormAutofill.supportRTL && Services.locale.isAppLocaleRTL) {
        return false;
      }

      return supportedCountries.includes(FormAutofill.browserSearchRegion);
    }
    return false;
  },

  /**
   * Return true if the given data type's autofill is available for a specific
   * country. Unlike `isAutofillTypeAvailable`, which tests the browser's own
   * region, this tests a caller-supplied country (e.g. a record's country).
   *
   * @param {string} typeId
   * @param {string} country A region code, or null/empty to ignore the region.
   * @returns {boolean} `true` if the data type's autofill is available there
   */
  isAutofillTypeAvailableInCountry(typeId, country) {
    const type = lazy.AutofillDataTypes.get(typeId);
    if (!type) {
      return false;
    }
    if (Services.prefs.getBoolPref(type.experimentPref, false)) {
      return true;
    }
    const available = Services.prefs.getStringPref(type.availablePref, "off");
    if (country && available == "detect") {
      return Services.prefs
        .getStringPref(type.supportedCountriesPref, "")
        .split(",")
        .includes(country.toUpperCase());
    }
    return available == "on";
  },
  /**
   * Whether the given data type (by AutofillDataTypes id) is available to use
   * in this browser. A type is available when its `availablePref` permits the
   * current region (see `_isSupportedRegion`) or its optional `experimentPref`
   * forces it on. If the feature is not available, there is no user-facing way
   * to enable it.
   *
   * @param {string} typeId
   * @returns {boolean} `true` if the data type's autofill is available
   */
  isAutofillTypeAvailable(typeId) {
    const type = lazy.AutofillDataTypes.get(typeId);
    if (!type) {
      return false;
    }
    const isUserInSupportedRegion = this._isSupportedRegion(
      Services.prefs.getStringPref(type.availablePref, "off"),
      Services.prefs.getStringPref(type.supportedCountriesPref, "").split(",")
    );
    return (
      isUserInSupportedRegion ||
      Services.prefs.getBoolPref(type.experimentPref, false)
    );
  },

  /**
   * Whether the user has enabled the given data type (by AutofillDataTypes id).
   *
   * @param {string} typeId
   * @returns {boolean} `true` if the data type's autofill is enabled
   */
  isAutofillTypeEnabled(typeId) {
    const type = lazy.AutofillDataTypes.get(typeId);
    return (
      !!type &&
      this.isAutofillTypeAvailable(typeId) &&
      Services.prefs.getBoolPref(type.enabledPref, false)
    );
  },

  /**
   * Whether any autofill data type is available to use in this browser.
   *
   * @returns {boolean}
   */
  get isAnyAutofillFeatureAvailable() {
    return lazy.AutofillDataTypes.all.some(type =>
      this.isAutofillTypeAvailable(type.id)
    );
  },

  /**
   * Whether the user has any autofill data type enabled.
   *
   * @returns {boolean}
   */
  get isAutofillEnabled() {
    return lazy.AutofillDataTypes.all.some(type =>
      this.isAutofillTypeEnabled(type.id)
    );
  },

  defineLogGetter(scope, logPrefix) {
    // A logging helper for debug logging to avoid creating Console objects
    // or triggering expensive JS -> C++ calls when debug logging is not
    // enabled.
    //
    // Console objects, even natively-implemented ones, can consume a lot of
    // memory, and since this code may run in every content process, that
    // memory can add up quickly. And, even when debug-level messages are
    // being ignored, console.debug() calls can be expensive.
    //
    // This helper avoids both of those problems by never touching the
    // console object unless debug logging is enabled.
    scope.debug = function debug() {
      if (FormAutofill.logLevel.toLowerCase() == "debug") {
        this.log.debug(...arguments);
      }
    };

    let { ConsoleAPI } = ChromeUtils.importESModule(
      "resource://gre/modules/Console.sys.mjs"
    );
    return new ConsoleAPI({
      maxLogLevelPref: "extensions.formautofill.loglevel",
      prefix: logPrefix,
    });
  },
};

// TODO: Bug 1747284. Use Region.home instead of reading "browser.serach.region"
// by default. However, Region.home doesn't observe preference change at this point,
// we should also fix that issue.
XPCOMUtils.defineLazyPreferenceGetter(
  FormAutofill,
  "browserSearchRegion",
  BROWSER_SEARCH_REGION_PREF,
  FormAutofill.DEFAULT_REGION
);
XPCOMUtils.defineLazyPreferenceGetter(
  FormAutofill,
  "logLevel",
  "extensions.formautofill.loglevel",
  "Warn"
);

XPCOMUtils.defineLazyPreferenceGetter(
  FormAutofill,
  "isAutofillAddressesCaptureEnabled",
  ENABLED_AUTOFILL_ADDRESSES_CAPTURE_PREF
);
XPCOMUtils.defineLazyPreferenceGetter(
  FormAutofill,
  "isAutofillCreditCardsHideUI",
  AUTOFILL_CREDITCARDS_HIDE_UI_PREF
);
XPCOMUtils.defineLazyPreferenceGetter(
  FormAutofill,
  "supportRTL",
  FORM_AUTOFILL_SUPPORT_RTL_PREF
);
XPCOMUtils.defineLazyPreferenceGetter(
  FormAutofill,
  "creditCardsAutocompleteOff",
  AUTOFILL_CREDITCARDS_AUTOCOMPLETE_OFF_PREF
);
XPCOMUtils.defineLazyPreferenceGetter(
  FormAutofill,
  "addressesAutocompleteOff",
  AUTOFILL_ADDRESSES_AUTOCOMPLETE_OFF_PREF
);
XPCOMUtils.defineLazyPreferenceGetter(
  FormAutofill,
  "captureOnFormRemoval",
  ENABLED_AUTOFILL_CAPTURE_ON_FORM_REMOVAL_PREF
);
XPCOMUtils.defineLazyPreferenceGetter(
  FormAutofill,
  "captureOnPageNavigation",
  ENABLED_AUTOFILL_CAPTURE_ON_PAGE_NAVIGATION_PREF
);
XPCOMUtils.defineLazyPreferenceGetter(
  FormAutofill,
  "addressCaptureRequiredFields",
  ENABLED_AUTOFILL_ADDRESSES_CAPTURE_REQUIRED_FIELDS_PREF,
  null,
  null,
  val => val?.split(",").filter(v => !!v)
);
XPCOMUtils.defineLazyPreferenceGetter(
  FormAutofill,
  "autofillSameOriginWithTop",
  ENABLED_AUTOFILL_SAME_ORIGIN_WITH_TOP
);

XPCOMUtils.defineLazyPreferenceGetter(
  FormAutofill,
  "detectDynamicFormChanges",
  "extensions.formautofill.heuristics.detectDynamicFormChanges",
  false
);

XPCOMUtils.defineLazyPreferenceGetter(
  FormAutofill,
  "fillOnDynamicFormChanges",
  "extensions.formautofill.heuristics.fillOnDynamicFormChanges",
  false
);

XPCOMUtils.defineLazyPreferenceGetter(
  FormAutofill,
  "fillOnDynamicFormChangeTimeout",
  "extensions.formautofill.heuristics.fillOnDynamicFormChanges.timeout",
  0
);

XPCOMUtils.defineLazyPreferenceGetter(
  FormAutofill,
  "refillOnSiteClearingFields",
  "extensions.formautofill.heuristics.refillOnSiteClearingFields",
  false
);

XPCOMUtils.defineLazyPreferenceGetter(
  FormAutofill,
  "refillOnSiteClearingFieldsTimeout",
  "extensions.formautofill.heuristics.refillOnSiteClearingFields.timeout",
  0
);

ChromeUtils.defineLazyGetter(FormAutofill, "countries", () =>
  AddressMetaDataLoader.getCountries()
);
