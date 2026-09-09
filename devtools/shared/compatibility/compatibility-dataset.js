/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const CSS_PROPERTIES_DATASET_URL =
  "resource://devtools/shared/compatibility/dataset/css-properties.json";
const MOCK_CSS_PROPERTIES_DATASET_URL =
  "resource://testing-common/devtools/compatibility/mock-css-properties.json";

// Preference to enable using the mocked dataset. Defaults to false.
const MOCK_DATASET_PREF = "devtools.compatibility.use-mock-dataset";

/**
 * Return the MDN compatibility data for CSS properties, either local snapshot
 * of https://github.com/mdn/browser-compat-data, unless a test opted into the
 * mock dataset via devtools.compatibility.use-mock-dataset=true.
 *
 * @returns {object} The compat data, keyed by CSS property name.
 */
function getCSSPropertiesCompatData() {
  return require(
    Services.prefs.getBoolPref(MOCK_DATASET_PREF, false)
      ? MOCK_CSS_PROPERTIES_DATASET_URL
      : CSS_PROPERTIES_DATASET_URL
  );
}

module.exports = {
  getCSSPropertiesCompatData,
};
