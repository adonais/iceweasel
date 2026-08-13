/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  FormAutofill: "resource://autofill/FormAutofill.sys.mjs",
  FormAutofillUtils: "resource://gre/modules/shared/FormAutofillUtils.sys.mjs",
});

// Defines template descriptors for generating elements in convertLayoutToUI.
const fieldTemplates = {
  commonAttributes(item) {
    return {
      id: item.fieldId,
      name: item.fieldId,
      value: item.value ?? "",
    };
  },
  "moz-input-text": function (item) {
    return {
      tag: "moz-input-text",
      ...this.commonAttributes(item),
    };
  },
  "moz-textarea": function (item) {
    return {
      tag: "moz-textarea",
      ...this.commonAttributes(item),
    };
  },
  "moz-select": function (item) {
    return {
      tag: "moz-select",
      children: item.options.map(({ value, text }) => ({
        tag: "moz-option",
        value,
        label: text,
      })),
      ...this.commonAttributes(item),
    };
  },
};

/**
 * Creates an HTML element with specified attributes and children.
 *
 * @param {string} tag - Tag name for the element to create.
 * @param {object} options - Options object containing attributes and children.
 * @param {object} options.attributes - Element's Attributes/Props (id, class, etc.)
 * @param {Array} options.children - Element's children (array of objects with tag and options).
 * @returns {HTMLElement} The newly created element.
 */
const createElement = (tag, { children = [], ...attributes }) => {
  const element = document.createElement(tag);

  for (let [attributeName, attributeValue] of Object.entries(attributes)) {
    if (attributeName in element) {
      element[attributeName] = attributeValue;
    } else {
      element.setAttribute(attributeName, attributeValue);
    }
  }

  for (let { tag: childTag, ...childRest } of children) {
    element.appendChild(createElement(childTag, childRest));
  }

  return element;
};

/**
 * Generator that creates UI elements from `fields` object, using localization from `l10nStrings`.
 *
 * @param {Array} fields - Array of objects as returned from `FormAutofillUtils.getFormLayout`.
 * @param {object} l10nStrings - Key-value pairs for field label localization.
 * @yields {HTMLElement} - A div container with a moz-* field element inside.
 */
function* convertLayoutToUI(fields, l10nStrings) {
  for (const item of fields) {
    // eslint-disable-next-line no-nested-ternary
    const fieldTag = item.options
      ? "moz-select"
      : item.multiline
        ? "moz-textarea"
        : "moz-input-text";

    const container = createElement("div", {
      id: `${item.fieldId}-container`,
      class: `container ${item.newLine ? "new-line" : ""}`,
    });

    const { tag, ...rest } = fieldTemplates[fieldTag](item);
    const field = createElement(tag, rest);
    field.setAttribute("label", l10nStrings[item.l10nId] ?? "");
    if (item.type) {
      field.dataset.type = item.type;
    }
    if (item.required) {
      field.dataset.required = "true";
    }
    if (item.pattern) {
      field.dataset.pattern = item.pattern;
    }

    container.appendChild(field);
    yield container;
  }
}

/**
 * Retrieves the current form data from the current form element on the page.
 * NOTE: We are intentionally not using FormData here because on iOS we have states where
 *       selects are disabled and FormData ignores disabled elements. We want getCurrentFormData
 *       to always refelect the exact state of the form.
 *
 * @returns {object} An object containing key-value pairs of form data.
 */
export const getCurrentFormData = () => {
  const formData = {};
  for (const element of document.querySelector("form").elements) {
    formData[element.name] = element.value ?? "";
  }
  return formData;
};

/**
 * Checks if the form can be submitted based on the number of non-empty values.
 * TODO(Bug 1891734): Add address validation. Right now we don't do any validation. (2 fields mimics the old behaviour ).
 *
 * @returns {boolean} True if the form can be submitted
 */
export const canSubmitForm = () => {
  const formData = getCurrentFormData();
  const validValues = Object.values(formData).filter(Boolean);
  return validValues.length >= 2;
};

/**
 * Validates the address form, marking invalid fields with the [invalid] attribute.
 *
 * @returns {boolean} True if all fields are valid.
 */
export const validateAddressForm = () => {
  const form = document.querySelector("form");
  let firstInvalidField = null;
  for (const field of form.elements) {
    if (!field.inputEl) {
      continue;
    }
    if (field.dataset.type) {
      field.inputEl.type = field.dataset.type;
    }
    if (field.dataset.required === "true") {
      field.inputEl.required = true;
    }
    if (field.dataset.pattern) {
      field.inputEl.pattern = field.dataset.pattern;
    }
    const valid = field.inputEl.checkValidity();
    field.toggleAttribute("invalid", !valid);
    if (!valid && !firstInvalidField) {
      firstInvalidField = field;
    }
  }
  if (firstInvalidField) {
    firstInvalidField.inputEl.reportValidity();
    return false;
  }
  return true;
};

/**
 * Generates a form layout based on record data and localization strings.
 *
 * @param {HTMLFormElement} formElement - Target form element.
 * @param {object} record - Address record, includes at least country code defaulted to FormAutofill.DEFAULT_REGION.
 * @param {object} l10nStrings - Localization strings map.
 */
export const createFormLayoutFromRecord = (
  formElement,
  record = { country: lazy.FormAutofill.DEFAULT_REGION },
  l10nStrings = {}
) => {
  // Always clear select values because they are not persisted between countries.
  // For example from US with state NY, we don't want the address-level1 to be NY
  // when changing to another country that doesn't have state options
  const selects = formElement.querySelectorAll("moz-select:not(#country)");
  for (const select of selects) {
    select.value = "";
  }

  // Get old data to persist before clearing form
  const formData = getCurrentFormData();
  record = {
    ...record,
    ...formData,
  };

  formElement.innerHTML = "";
  const fields = lazy.FormAutofillUtils.getFormLayout(record);

  // Country field should appear beside the address-level1 field. If address-level1
  // is absent fall back to placing country after address-level2.
  const countryIdx = fields.findIndex(f => f.fieldId === "country");
  if (countryIdx > -1) {
    const anchorIdx = Math.max(
      fields.findIndex(f => f.fieldId === "address-level1"),
      fields.findIndex(f => f.fieldId === "address-level2")
    );
    if (anchorIdx > -1 && countryIdx > anchorIdx + 1) {
      const [country] = fields.splice(countryIdx, 1);
      fields.splice(anchorIdx + 1, 0, country);
    }
  }

  const layoutGenerator = convertLayoutToUI(fields, l10nStrings);

  for (const fieldElement of layoutGenerator) {
    formElement.appendChild(fieldElement);
  }

  document.querySelector("#country").addEventListener(
    "change",
    ev =>
      // Allow some time for the user to type
      // before we set the new country and re-render
      setTimeout(() => {
        record.country = ev.target.value;
        createFormLayoutFromRecord(formElement, record, l10nStrings);
      }, 300),
    { once: true }
  );

  // Used to notify tests that the form has been updated and is ready
  window.dispatchEvent(new CustomEvent("FormReadyForTests"));
};
