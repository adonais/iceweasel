/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-disable mozilla/balanced-listeners */ // Not relevant since the document gets unloaded.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  FormAutofillUtils: "resource://gre/modules/shared/FormAutofillUtils.sys.mjs",
});

class EditAutofillForm {
  constructor(elements) {
    this._elements = elements;
  }

  /**
   * Fill the form with a record object.
   *
   * @param  {object} [record = {}]
   */
  loadRecord(record = {}) {
    for (let field of this._elements.form.elements) {
      let value = record[field.id];
      value = typeof value == "undefined" ? "" : value;
      field.value = value;
    }
    if (!record.guid) {
      // Reset the dirty value flag and validity state.
      this._elements.form.reset();
    } else {
      for (let field of this._elements.form.elements) {
        this.updateCustomValidity(field);
      }
    }
  }

  /**
   * Get a record from the form suitable for a save/update in storage.
   *
   * @returns {object}
   */
  buildFormObject() {
    let initialObject = {};
    if (this.hasMailingAddressFields) {
      // Start with an empty string for each mailing-address field so that any
      // fields hidden for the current country are blanked in the return value.
      initialObject = {
        "street-address": "",
        "address-level3": "",
        "address-level2": "",
        "address-level1": "",
        "postal-code": "",
      };
    }

    return Array.from(this._elements.form.elements).reduce((obj, input) => {
      if (!input.disabled) {
        obj[input.id] = input.value;
      }
      return obj;
    }, initialObject);
  }

  /**
   * Handle events
   *
   * @param  {DOMEvent} event
   */
  handleEvent(event) {
    switch (event.type) {
      case "change": {
        this.handleChange(event);
        break;
      }
      case "input": {
        this.handleInput(event);
        break;
      }
    }
  }

  // Clear the CSS error state when the user starts correcting a field.
  handleChange(event) {
    event.target.removeAttribute("invalid");
  }

  handleInput(event) {
    event.target.removeAttribute("invalid");
  }

  /**
   * Attach event listener
   */
  attachEventListeners() {
    this._elements.form.addEventListener("input", this);
  }

  /**
   * Run custom validity routines specific to the field and type of form.
   *
   * @param {DOMElement} _field The field that will be validated.
   */
  updateCustomValidity(_field) {}
}

export class EditCreditCard extends EditAutofillForm {
  /**
   * @param {HTMLElement[]} elements
   * @param {object} record with a decrypted cc-number
   * @param {object} addresses in an object with guid keys for the billing address picker.
   */
  constructor(elements, record, addresses) {
    super(elements);

    this._addresses = addresses;
    Object.assign(this._elements, {
      ccNumber: this._elements.form.querySelector("#cc-number"),
      invalidCardNumberStringElement: this._elements.form.querySelector(
        "#invalidCardNumberString"
      ),
      month: this._elements.form.querySelector("#cc-exp-month"),
      year: this._elements.form.querySelector("#cc-exp-year"),
      billingAddress: this._elements.form.querySelector("#billingAddressGUID"),
      billingAddressRow:
        this._elements.form.querySelector(".billingAddressRow"),
    });

    this.attachEventListeners();
    this.loadRecord(record, addresses);
  }

  loadRecord(record, addresses, preserveFieldValues) {
    // _record must be updated before generateYears and generateBillingAddressOptions are called.
    this._record = record;
    this._addresses = addresses;
    this.generateBillingAddressOptions(preserveFieldValues);
    if (!preserveFieldValues) {
      // Re-generating the months will reset the selected option.
      this.generateMonths();
      // Re-generating the years will reset the selected option.
      this.generateYears();
      super.loadRecord(record);
      // moz-select populates its options from slotted <moz-option> children
      // asynchronously, so a value assigned synchronously above is discarded
      // once the options are processed. Re-apply the selected values after the
      // elements have finished updating.
      this.#applySelectValues(record);
    }
  }

  async #applySelectValues(record) {
    let selects = [
      this._elements.month,
      this._elements.year,
      this._elements.billingAddress,
    ];
    await Promise.all(selects.map(select => select.updateComplete));
    for (let select of selects) {
      let value = record?.[select.id];
      select.value = value == undefined ? "" : value.toString();
    }
  }

  generateMonths() {
    const count = 12;

    // Clear the list
    this._elements.month.textContent = "";

    // Empty month option
    let emptyOption = document.createElement("moz-option");
    emptyOption.setAttribute("value", "");
    emptyOption.setAttribute("label", "");
    this._elements.month.appendChild(emptyOption);

    // Populate month list. Format: "month number - month name"
    let dateFormat = new Intl.DateTimeFormat(navigator.language, {
      month: "long",
    }).format;
    for (let i = 0; i < count; i++) {
      let monthNumber = (i + 1).toString();
      let monthName = dateFormat(new Date(1970, i));
      let option = document.createElement("moz-option");
      option.setAttribute("value", monthNumber);
      // XXX: Bug 1446164 - Localize this string.
      option.setAttribute(
        "label",
        `${monthNumber.padStart(2, "0")} - ${monthName}`
      );
      this._elements.month.appendChild(option);
    }
  }

  generateYears() {
    const count = 20;
    const currentYear = new Date().getFullYear();
    const ccExpYear = this._record && this._record["cc-exp-year"];

    // Clear the list
    this._elements.year.textContent = "";

    // Provide an empty year option
    let emptyOption = document.createElement("moz-option");
    emptyOption.setAttribute("value", "");
    emptyOption.setAttribute("label", "");
    this._elements.year.appendChild(emptyOption);

    if (ccExpYear && ccExpYear < currentYear) {
      let option = document.createElement("moz-option");
      option.setAttribute("value", String(ccExpYear));
      option.setAttribute("label", String(ccExpYear));
      this._elements.year.appendChild(option);
    }

    for (let i = 0; i < count; i++) {
      let year = currentYear + i;
      let option = document.createElement("moz-option");
      option.setAttribute("value", String(year));
      option.setAttribute("label", String(year));
      this._elements.year.appendChild(option);
    }

    if (ccExpYear && ccExpYear > currentYear + count) {
      let option = document.createElement("moz-option");
      option.setAttribute("value", String(ccExpYear));
      option.setAttribute("label", String(ccExpYear));
      this._elements.year.appendChild(option);
    }
  }

  generateBillingAddressOptions(preserveFieldValues) {
    let billingAddressGUID;
    if (preserveFieldValues && this._elements.billingAddress.value) {
      billingAddressGUID = this._elements.billingAddress.value;
    } else if (this._record) {
      billingAddressGUID = this._record.billingAddressGUID;
    }

    this._elements.billingAddress.textContent = "";

    let emptyOption = document.createElement("moz-option");
    emptyOption.setAttribute("value", "");
    emptyOption.setAttribute("label", "");
    this._elements.billingAddress.appendChild(emptyOption);

    let hasAddresses = false;
    for (let [guid, address] of Object.entries(this._addresses)) {
      hasAddresses = true;
      let option = document.createElement("moz-option");
      option.setAttribute("value", guid);
      option.setAttribute(
        "label",
        lazy.FormAutofillUtils.getAddressLabel(address)
      );
      this._elements.billingAddress.appendChild(option);
    }

    if (billingAddressGUID) {
      this._elements.billingAddress.value = billingAddressGUID;
    }

    this._elements.billingAddressRow.hidden = !hasAddresses;
  }

  attachEventListeners() {
    this._elements.form.addEventListener("change", this);
    super.attachEventListeners();
  }

  handleInput(event) {
    // Clear the error message if cc-number is valid
    if (
      event.target == this._elements.ccNumber &&
      lazy.FormAutofillUtils.isCCNumber(this._elements.ccNumber.value)
    ) {
      let inputEl = this._elements.ccNumber.inputEl;
      if (inputEl) {
        inputEl.setCustomValidity("");
      }
    }
    super.handleInput(event);
  }

  /**
   * Sets required and pattern constraints on inner input elements so that
   * native constraint validation works when validateForm() is called.
   */
  setupValidation() {
    if (this._validationSetup) {
      return;
    }
    this._validationSetup = true;

    let ccEl = this._elements.ccNumber;
    if (ccEl?.inputEl) {
      ccEl.inputEl.required = true;
      ccEl.inputEl.minLength = 14;
      ccEl.inputEl.pattern = "[\\- 0-9]+";
    }

    for (let id of ["cc-exp-month", "cc-exp-year", "cc-name"]) {
      let el = this._elements.form.querySelector(`#${id}`);
      if (el?.inputEl) {
        el.inputEl.required = true;
      }
    }
  }

  /**
   * Validates each form field via its inner input element.
   *
   * @returns {boolean} True if all fields are valid.
   */
  validateForm() {
    this.setupValidation();
    let firstInvalidField = null;
    for (let field of this._elements.form.elements) {
      if (field.inputEl) {
        const valid = field.inputEl.checkValidity();
        field.toggleAttribute("invalid", !valid);
        if (!valid && !firstInvalidField) {
          firstInvalidField = field;
        }
      }
    }
    if (firstInvalidField) {
      firstInvalidField.inputEl.reportValidity();
      return false;
    }
    return true;
  }

  updateCustomValidity(field) {
    super.updateCustomValidity(field);

    // Mark the cc-number field as invalid if the number is empty or invalid.
    if (
      field == this._elements.ccNumber &&
      !lazy.FormAutofillUtils.isCCNumber(field.value)
    ) {
      let invalidCardNumberString =
        this._elements.invalidCardNumberStringElement.textContent;
      let inputEl = field.inputEl;
      if (inputEl) {
        inputEl.setCustomValidity(invalidCardNumberString || " ");
      }
    }
  }
}
