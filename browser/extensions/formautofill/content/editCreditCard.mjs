/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { EditCreditCardDialog } from "chrome://formautofill/content/editDialog.mjs";
import { EditCreditCard } from "chrome://formautofill/content/autofillEditForms.mjs";

// The form's fields are custom elements that are registered lazily. Wait for
// them to be defined before constructing the dialog so that loadRecord can
// assign values to fully upgraded elements.
await Promise.all([
  customElements.whenDefined("moz-input-text"),
  customElements.whenDefined("moz-select"),
  customElements.whenDefined("moz-option"),
]);

const { record } = window.arguments?.[0] ?? {};

const fieldContainer = new EditCreditCard(
  {
    form: document.getElementById("form"),
  },
  record,
  []
);

new EditCreditCardDialog(
  {
    title: document.querySelector("title"),
    fieldContainer,
    controlsContainer: document.getElementById("controls-container"),
    cancel: document.getElementById("cancel"),
    save: document.getElementById("save"),
  },
  record
);
