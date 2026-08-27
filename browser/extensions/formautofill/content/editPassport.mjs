/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { EditPassportDialog } from "chrome://formautofill/content/editDialog.mjs";
import { EditPassport } from "chrome://formautofill/content/autofillEditForms.mjs";

// Use ChromeUtils to load resource:// modules — the dialog's CSP restricts
// ES module imports to chrome:// URLs only.
const { FormAutofill } = ChromeUtils.importESModule(
  "resource://autofill/FormAutofill.sys.mjs"
);

// The form's fields are custom elements that are registered lazily. Wait for
// them to be defined before constructing the dialog so that loadRecord can
// assign values to fully upgraded elements.
await Promise.all([
  customElements.whenDefined("moz-input-text"),
  customElements.whenDefined("moz-select"),
  customElements.whenDefined("moz-option"),
]);

const { record } = window.arguments?.[0] ?? {};

// Populate the country dropdown before constructing EditPassport so that
// loadRecord() can pre-select the record's country value.
const countrySelect = document.getElementById("passport-country");
for (let [code, countryName] of FormAutofill.countries) {
  let option = document.createElement("moz-option");
  option.setAttribute("value", code);
  option.setAttribute("label", countryName);
  countrySelect.appendChild(option);
}

const fieldContainer = new EditPassport(
  {
    form: document.getElementById("form"),
  },
  record
);

new EditPassportDialog(
  {
    title: document.querySelector("title"),
    fieldContainer,
    controlsContainer: document.getElementById("controls-container"),
    cancel: document.getElementById("cancel"),
    save: document.getElementById("save"),
  },
  record
);
