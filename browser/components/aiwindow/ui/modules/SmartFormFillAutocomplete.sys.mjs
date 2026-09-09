/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { SUPPORTED_INPUT_TYPES } from "chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs";

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

/** @typedef {import("moz-src:///browser/components/aiwindow/ui/actors/SmartFormFillParent.sys.mjs").SmartFormFillParent} SmartFormFillParent */

const lazy = {};

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["preview/aiWindow.ftl"], true)
);

ChromeUtils.defineESModuleGetters(lazy, {
  AIWindow:
    "moz-src:///browser/components/aiwindow/ui/modules/AIWindow.sys.mjs",
});

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "SFF_ENABLED",
  "browser.smartwindow.smartformfill.enabled",
  false
);

const AUTOFILL_ICON =
  "chrome://browser/content/aiwindow/assets/sff-autofill-icon.svg";

/**
 * @typedef {object} SmartFormFillAutocompleteSource
 * @property {string} label
 *   Display name of the source tab.
 * @property {string} favicon
 *   Favicon URL for the source tab.
 */

/**
 * @typedef {object} SmartFormFillAutocompleteItemOptions
 * @property {string} image
 *   URL of the image displayed with the autocomplete entry.
 * @property {string} label
 *   Primary text displayed for the entry.
 * @property {string} sourcesLabel
 *   Label to use before listing tab sources.
 * @property {boolean} loading
 *   Whether the relevant tabs are still loading.
 * @property {string} loadingLabel
 *   The label to show when relevant tabs are still loading.
 * @property {string | null} emptySourcesLabel
 *   The label to show when no relevant tabs were selected.
 * @property {string} [focusElementId]
 *   Identifier for the field associated with the autocomplete search.
 * @property {string} ariaLabel
 *   Accessible label for the entry.
 */

/**
 * Autocomplete item used to populate a Smart Form Fill option
 * in the autocomplete menu.
 */
class SmartFormFillAutocompleteItem {
  style = "smartFormFill";
  value = "";

  /**
   * @param {SmartFormFillAutocompleteItemOptions} options
   *   Data used to populate and handle the autocomplete entry.
   */
  constructor({
    image,
    label,
    sourcesLabel,
    loading,
    loadingLabel,
    emptySourcesLabel,
    focusElementId,
    ariaLabel,
  }) {
    this.image = image;
    this.label = label;
    this.comment = JSON.stringify({
      type: "smartFormFill",
      sourcesLabel,
      ariaLabel,

      loading,
      loadingLabel,
      emptySourcesLabel,

      fillMessageName: "SmartFormFill:Start",
      fillMessageData: {
        focusElementId,
      },

      secondaryAction: {
        type: "edit",
        fillMessageName: "SmartFormFill:EditSources",
        fillMessageData: {},
      },
    });
  }
}

/**
 * Provides Smart Form Fill entries to Firefox autocomplete providers.
 */
export const SmartFormFillAutocomplete = {
  /**
   * Requests Smart Form Fill entries for an autocomplete provider.
   *
   * @param {object} options
   * @param {BrowsingContext} options.browsingContext
   *   Browsing context associated with the autocomplete search.
   * @param {string} options.searchString
   *   Current autocomplete search string.
   * @param {string} options.inputType
   *   Type of the input associated with the search.
   * @param {string} [options.focusElementId]
   *   Identifier for the field associated with the search.
   * @returns {Promise<Array<SmartFormFillAutocompleteItem>>}
   *   An array containing the Smart Form Fill entry, or an empty array when
   *   it should not be shown.
   */
  async autocompleteItemsAsync({
    browsingContext,
    searchString,
    inputType,
    focusElementId,
  }) {
    const isSupportedInput =
      inputType == "textarea" || SUPPORTED_INPUT_TYPES.includes(inputType);
    const smartWindowActive = lazy.AIWindow.isAIWindowActive(
      browsingContext?.topChromeWindow
    );

    if (!isSupportedInput || !lazy.SFF_ENABLED || !smartWindowActive) {
      return [];
    }

    try {
      const sffActor =
        browsingContext.currentWindowGlobal.getActor("SmartFormFill");
      const result = await sffActor.searchAutoCompleteEntries(searchString, {
        focusElementId,
      });

      return result?.entries ?? [];
    } catch {
      return [];
    }
  },

  /**
   * Creates the autocomplete item for Smart Form Fill
   *
   * @param {object} options
   * @param {SmartFormFillParent} options.sffActor
   *   Actor providing the form's relevant-tab state.
   * @param {string} options.formId
   *   Stable identifier for the focused form.
   * @param {string} [options.focusElementId]
   *   Identifier for the field associated with the autocomplete search.
   * @returns {Promise<Array<SmartFormFillAutocompleteItem>>}
   *   An array containing the Smart Form Fill entry.
   */
  async createItemsAsync({ sffActor, formId, focusElementId }) {
    const [label, loadingLabel, sourcesLabel] = await lazy.l10n.formatValues([
      { id: "ai-smart-form-fill-autocomplete-label" },
      { id: "ai-smart-form-fill-autocomplete-loading" },
      { id: "ai-smart-form-fill-autocomplete-sources-label" },
    ]);
    const relevantTabsReady = sffActor.areRelevantTabsReady(formId);

    const hasSources =
      relevantTabsReady && sffActor.getSelectedTabSources(formId).length;

    const loading = !relevantTabsReady;
    const emptySourcesLabel =
      relevantTabsReady && !hasSources
        ? await lazy.l10n.formatValue(
            sffActor.hasSourceTabs
              ? "ai-smart-form-fill-autocomplete-choose-tabs"
              : "ai-smart-form-fill-autocomplete-open-tabs"
          )
        : null;

    const item = new SmartFormFillAutocompleteItem({
      image: AUTOFILL_ICON,
      label,
      sourcesLabel,
      loading,
      loadingLabel,
      emptySourcesLabel,
      focusElementId,
      ariaLabel: label,
    });

    return [item];
  },

  /**
   * Adds parent-only source data to the rendered Smart Form Fill row.
   *
   * @param {object} options
   * @param {MozBrowser} options.browser
   *   Browser that owns the autocomplete popup.
   * @param {Array<SmartFormFillAutocompleteSource>} options.sources
   *   Relevant tab sources to display.
   */
  updatePopupSources({ browser, sources }) {
    const item = browser.autoCompletePopup.querySelector(
      '[originaltype="smartFormFill"]'
    );
    const row = item?.querySelector("autocomplete-row-item");

    if (row) {
      row.sources = sources;
    }
  },
};
