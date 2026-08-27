/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "console", function () {
  return console.createInstance({ prefix: "SmartFormFillDocument" });
});

ChromeUtils.defineESModuleGetters(lazy, {
  FormLikeFactory: "resource://gre/modules/FormLikeFactory.sys.mjs",
  FormAutofillHeuristics:
    "resource://gre/modules/shared/FormAutofillHeuristics.sys.mjs",
  FormAutofillUtils: "resource://gre/modules/shared/FormAutofillUtils.sys.mjs",
  SmartFormFillUtils:
    "moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillUtils.sys.mjs",
});

const INPUTS_SELECTOR = "input, textarea";

// NOTE: Field attribute changes are not observed in the initial version.
// Changes affecting grouping or classification can leave cached data stale.
const MUTATION_OBSERVER_OPTIONS = {
  attributes: false,
  childList: true,
  subtree: true,
};

// List of input types current being autofilled by SmartFormFill
const SUPPORTED_INPUT_TYPES = [
  "text",
  "email",
  "tel",
  "number",
  "search",
  "month",
];

/**
 * @typedef {{
 *  action: string,
 *  autocomplete: string,
 *  ownerDocument: Document,
 *  rootElement: HTMLElement,
 *  elements: Array<HTMLElement>,
 * }} FormLike
 */

/**
 * @typedef {import("resource://gre/modules/shared/FieldScanner.sys.mjs").FieldDetail} FieldDetail
 */

/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").FieldData} FieldData */
/** @typedef {import("moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillUtils.sys.mjs").SmartFormFillUtils} SmartFormFillUtils */

/**
 * @typedef {HTMLInputElement | HTMLTextAreaElement} SmartFormFillField
 */

/**
 * @typedef {{
 *  formId?: string,
 *  formLike: FormLike,
 *  fields: Array<SmartFormFillField>,
 *  fieldDetailsList?: Array<FieldDetail>,
 * }} FormGroup
 */

/**
 * @typedef {{
 *   formId: string,
 *   formFields: Array<SffFormField>
 * }} SffForm
 */

/**
 * @typedef {{
 *   fieldId: string,
 *   field: SmartFormFillField,
 *   details: FieldDetail | null
 * }} SffFormField
 */

/**
 * @typedef {object} FormData
 * @property {string} id The form id
 * @property {Array<FieldData>} fields The list of fields for the form
 */

/**
 * @typedef {{
 *   id: string,
 *   emptyFieldIds: Set<string>,
 * }} FocusedForm
 */

/**
 * SmartFormFillDocument
 */
export class SmartFormFillDocument {
  /**
   * Whether the module has completed initializing
   *
   * @type {boolean}
   */
  #initialized;

  /**
   * Whether the module has been destroyed
   *
   * @type {boolean}
   */
  #destroyed;

  /**
   * The document element that this instance manages
   *
   * @type {Document | null}
   */
  #doc;

  /**
   * Nearby-text utilities for the managed document.
   *
   * @type {SmartFormFillUtils | null}
   */
  #utils;

  /**
   * A map of form IDs to FormGroup objects
   *
   * @type {Map<string, FormGroup> | null}
   */
  #forms;

  /**
   * A map of form root elements to FormGroup objects
   *
   * @type {Map<HTMLElement, FormGroup> | null}
   */
  #formRoots;

  /**
   * MutationObserver to watch for form inputs that are added
   *
   * @type {MutationObserver | null}
   */
  #observer;

  /**
   * Root elements being observed for DOM mutations
   *
   * @type {WeakSet<HTMLElement | ShadowRoot> | null}
   */
  #observedRoots;

  /**
   * Form counter to generate form IDs
   *
   * @type {number}
   */
  #formCounter;

  /**
   * Field IDs map by SmartFormFillField
   *
   * @type {WeakMap<SmartFormFillField, string> | null}
   */
  #fieldIds;

  /**
   * SmartFormFillField by field id
   *
   * @type {Map<string, SmartFormFillField> | null}
   */
  #fieldsById;

  /**
   * Field counter used to create stable field ids
   *
   * @type {number}
   */
  #fieldCounter;

  /**
   * Callback to handle dynamic form updates after page load
   *
   * @type {((formDataList: Array<FormData>) => void) | null}
   */
  #onFormUpdate;

  /**
   * Map to collect affected groups during rapid
   * form mutations.
   *
   * @type {Map<HTMLElement, FormGroup> | null}
   */
  #formUpdateAffectedGroupsMap;

  /**
   * Pending form-update timeout
   *
   * @type {number | null}
   */
  #formUpdateTimeout;

  /**
   * Creates a manager for a document.
   *
   * @param {Document} doc
   */
  constructor(doc) {
    this.#initialized = false;
    this.#destroyed = false;
    this.#doc = doc;
    this.#utils = new lazy.SmartFormFillUtils();
    this.#forms = new Map();
    this.#formRoots = new Map();
    this.#observer = null;
    this.#observedRoots = new WeakSet();
    this.#formCounter = 0;
    this.#fieldIds = new WeakMap();
    this.#fieldsById = new Map();
    this.#fieldCounter = 0;
    this.#onFormUpdate = null;
    this.#formUpdateAffectedGroupsMap = null;
    this.#formUpdateTimeout = null;
  }

  /**
   * Initialize SmartFormFieldDocument, sets up mutation observer
   * and runs initial field detection.
   *
   * @param {((formDataList: Array<FormData>) => void) | null} onFormUpdate Callback to handle form updates
   *
   * @returns {Promise<void>}
   */
  async initialize(onFormUpdate) {
    if (this.#initialized || this.#destroyed) {
      return;
    }

    try {
      this.#monitorDocument();
      await this.#detectFields();

      if (this.#destroyed) {
        return;
      }

      this.#onFormUpdate = onFormUpdate;

      this.#initialized = true;
    } catch (error) {
      if (!this.#destroyed) {
        lazy.console.error(
          "Smart Form Fill document initialization failed, SFF is not available",
          error
        );

        this.destroy();
      }

      throw error;
    }
  }

  /**
   * Module tear down.
   */
  destroy() {
    if (this.#destroyed) {
      return;
    }

    this.#destroyed = true;

    this.#formCounter = 0;
    this.#fieldCounter = 0;

    if (this.#formUpdateTimeout) {
      this.#doc.defaultView.clearTimeout(this.#formUpdateTimeout);
    }

    this.#doc = null;
    this.#utils = null;

    this.#forms.clear();
    this.#forms = null;

    this.#formRoots.clear();
    this.#formRoots = null;

    this.#observer?.disconnect();
    this.#observer = null;
    this.#observedRoots = null;

    this.#fieldsById.clear();
    this.#fieldsById = null;

    this.#fieldIds = null;

    this.#onFormUpdate = null;
    this.#formUpdateTimeout = null;
    this.#formUpdateAffectedGroupsMap = null;
  }

  /**
   * Gets the form data in a serializable form in the schema
   * expected by the LLM.
   *
   * @returns {Array<FormData>}
   */
  getFormData() {
    const forms = this.#getForms();

    return forms.map(({ formId: id, formFields }) => {
      const fields = formFields.map(formField => this.#getFieldData(formField));

      return { id, fields };
    });
  }

  /**
   * Gets the focused form and its empty field IDs.
   *
   * @returns {FocusedForm | null}
   */
  getFocusedForm() {
    const field = this.#getFocusedField();
    if (!field) {
      return null;
    }

    const rootElement = lazy.FormLikeFactory.findRootForField(field);
    const group = this.#formRoots.get(rootElement);
    if (!group?.formId || !group.fields.includes(field)) {
      return null;
    }

    const emptyFieldIds = new Set(
      group.fields
        .filter(
          formField =>
            this.#isSupportedField(formField) &&
            this.#isFillableField(formField)
        )
        .map(formField => this.#getFieldId(formField))
    );

    return {
      id: group.formId,
      emptyFieldIds,
    };
  }

  /**
   * Fill form fields
   *
   * @param {object} param
   * @param {string} param.id The stable Form ID
   * @param {Array<{id: string, value: string}>} param.fields Fill instructions
   */
  fillForm({ id, fields }) {
    const group = this.#forms.get(id);

    if (!group || !Array.isArray(fields)) {
      return;
    }

    const filledFieldIds = new Set();
    const formFields = new Set(group.fields);
    for (const { id: fieldId, value } of fields) {
      if (filledFieldIds.has(fieldId)) {
        continue;
      }

      const field = this.#fieldsById.get(fieldId);

      const valid =
        field &&
        field.isConnected &&
        formFields.has(field) &&
        lazy.FormLikeFactory.findRootForField(field) ===
          group.formLike.rootElement &&
        this.#isSupportedField(field) &&
        this.#isFillableField(field);

      if (!valid) {
        continue;
      }

      if (!value || typeof value !== "string") {
        continue;
      }

      field.setUserInput(value);
      field.autofillState = lazy.FormAutofillUtils.FIELD_STATES.AUTO_FILLED;
      filledFieldIds.add(fieldId);
    }
  }

  /**
   * Serializes a form field for model requests.
   *
   * @param {SffFormField} formField
   *
   * @returns {FieldData}
   *
   * @private
   */
  #getFieldData({ fieldId: id, field, details }) {
    return {
      id,
      label: this.#getFieldLabel(field),
      name: field.name,
      formHistoryName: field.name || field.id,
      inputType: field.type,
      placeholder: field.placeholder,
      autocomplete: field.autocomplete,
      maxlength: field.maxLength > -1 ? field.maxLength : null,
      options: [],
      textBefore: this.#utils.findNearbyText(field),
      textAfter: this.#utils.findNearbyText(field, false),
      ...(details?.fieldName && {
        localGuess: details.fieldName,
      }),
      ...(details?.confidence && {
        localConfidence: details.confidence,
      }),
    };
  }

  /**
   * Normalize values that have repeated spaces or need trim
   *
   * @param {string | null | undefined} value
   *
   * @returns {string} Normalized string
   */
  #normalize(value) {
    return value?.replace(/\s+/g, " ").trim() ?? "";
  }

  /**
   * Gets a label for the field, either by associated label,
   * aria-labelledby, or aria-label
   *
   * @param {SmartFormFillField} field
   *
   * @returns {string}
   */
  #getFieldLabel(field) {
    let label = Array.from(field.labels ?? [])
      .map(labelEl => this.#normalize(labelEl.textContent))
      .filter(Boolean)
      .join(" ");

    if (label) {
      return label;
    }

    const root = field.getRootNode();
    label = field
      .getAttribute("aria-labelledby")
      ?.split(/\s+/)
      .map(id => this.#normalize(root.getElementById?.(id)?.textContent))
      .filter(Boolean)
      .join(" ");

    return label || this.#normalize(field.getAttribute("aria-label"));
  }

  /**
   * @param {SmartFormFillField} field
   *
   * @returns {string}
   */
  #getFieldId(field) {
    let fieldId = this.#fieldIds.get(field);

    if (!fieldId) {
      fieldId = `f_${++this.#fieldCounter}`;

      this.#fieldIds.set(field, fieldId);
      this.#fieldsById.set(fieldId, field);
    }

    return fieldId;
  }

  /**
   * Gets the Smart Form Fill supported fields for
   * each form and any available field details.
   *
   * @returns {Array<SffForm>}
   */
  #getForms() {
    const forms = [];

    for (const [formId, formGroup] of this.#forms.entries()) {
      const { fields, fieldDetailsList = [] } = formGroup;
      const fieldMap = this.#toFieldMap(fieldDetailsList);

      const formFields = fields
        .filter(field => this.#isSupportedField(field))
        .map(field => {
          const fieldId = this.#getFieldId(field);
          const details = fieldMap.get(field) ?? null;
          return { fieldId, field, details };
        });

      if (formFields.length) {
        forms.push({ formId, formFields });
      }
    }

    return forms;
  }

  /**
   * Converts array of FieldDetail objects to a Map for lookups
   *
   * @param {Array<FieldDetail>} fieldDetailsList
   *
   * @returns {Map<HTMLElement, FieldDetail>}
   *
   * @private
   */
  #toFieldMap(fieldDetailsList) {
    return new Map(
      fieldDetailsList.map(fieldDetails => [fieldDetails.element, fieldDetails])
    );
  }

  /**
   * Checks if the element is supported by Smart Form Fill
   *
   * @param {HTMLElement} element
   *
   * @returns {boolean}
   *
   * @private
   */
  #isSupportedField(element) {
    return (
      HTMLTextAreaElement.isInstance(element) ||
      (HTMLInputElement.isInstance(element) &&
        SUPPORTED_INPUT_TYPES.includes(element.type))
    );
  }

  /**
   * Gets the focused supported field.
   *
   * @returns {SmartFormFillField | null}
   *
   * @private
   */
  #getFocusedField() {
    let field = this.#doc.activeElement;

    while (field?.shadowRoot?.activeElement) {
      field = field.shadowRoot.activeElement;
    }

    return this.#isSupportedField(field) ? field : null;
  }

  /**
   * Checks whether a field can currently be filled.
   *
   * @param {SmartFormFillField} field
   *
   * @returns {boolean}
   *
   * @private
   */
  #isFillableField(field) {
    return (
      field.value.trim() === "" &&
      lazy.FormAutofillUtils.isFieldVisible(field) &&
      !field.disabled &&
      !field.readOnly
    );
  }

  /**
   * Initializes the MutationObserver used to track fields added to or
   * removed from the document and discovered shadow roots.
   *
   * @private
   */
  #monitorDocument() {
    this.#observer = new this.#doc.defaultView.MutationObserver(mutations => {
      this.#onMutation(mutations);
    });

    this.#observeRoot(this.#doc.documentElement);
  }

  /**
   * Adds an element as a root to be observed for changes
   * so shadow roots can be observed for fields.
   *
   * @param {HTMLElement | ShadowRoot} root
   *
   * @private
   */
  #observeRoot(root) {
    if (this.#observedRoots.has(root)) {
      return;
    }

    this.#observedRoots.add(root);
    this.#observer.observe(root, MUTATION_OBSERVER_OPTIONS);
  }

  /**
   * Removes fields that are disconnected or no longer associated with their
   * tracked form root, and adds changed groups to the affected groups map.
   *
   * @param {Map<HTMLElement, FormGroup>} affectedGroups
   *
   * @private
   */
  #removeStaleFields(affectedGroups) {
    for (const [rootElement, group] of this.#formRoots) {
      const currentFields = group.fields.filter(
        field =>
          field.isConnected &&
          lazy.FormLikeFactory.findRootForField(field) === rootElement
      );

      if (currentFields.length !== group.fields.length) {
        // Clear IDs for fields no longer in group
        const currentFieldSet = new Set(currentFields);
        for (const field of group.fields) {
          if (currentFieldSet.has(field)) {
            continue;
          }

          const fieldId = this.#fieldIds.get(field);
          if (fieldId) {
            this.#fieldsById.delete(fieldId);
            this.#fieldIds.delete(field);
          }
        }

        group.fields.splice(0, group.fields.length, ...currentFields);
        affectedGroups.set(rootElement, group);
      }
    }
  }

  /**
   * Collects fields recursively from element nodes added by a
   * mutation, including fields in shadow roots.
   *
   * @param {MutationRecord} mutation
   *
   * @returns {Array<SmartFormFillField>}
   *
   * @private
   */
  #getAddedFields(mutation) {
    const addedFields = Array.from(mutation.addedNodes)
      .filter(addedNode => !!addedNode.matches)
      .flatMap(addedNode => Array.from(this.#getFields(addedNode)));

    return addedFields;
  }

  /**
   * Adds a field to its existing form group, or creates and registers a new
   * group for the field's root element.
   *
   * @param {SmartFormFillField} field
   *
   * @returns {FormGroup}
   *
   * @private
   */
  #addFieldToGroup(field) {
    const formLike = lazy.FormLikeFactory.createFromField(field);

    let group = this.#formRoots.get(formLike.rootElement);

    if (!group) {
      group = { formLike, fields: [] };

      Object.defineProperty(formLike, "elements", {
        value: group.fields,
        enumerable: true,
      });

      this.#formRoots.set(formLike.rootElement, group);
    }

    if (!group.fields.includes(field)) {
      group.fields.push(field);
    }

    return group;
  }

  /**
   * Reclassifies affected form groups, removes empty groups, and registers
   * newly discovered groups.
   *
   * @param {Map<HTMLElement, FormGroup>} affectedGroups
   *
   * @private
   */
  #updateFormGroups(affectedGroups) {
    for (const affectedGroup of affectedGroups.values()) {
      if (!affectedGroup.fields.length) {
        this.#forms.delete(affectedGroup.formId);
        this.#formRoots.delete(affectedGroup.formLike.rootElement);
        continue;
      }

      const fieldDetailsList = lazy.FormAutofillHeuristics.getFormInfo(
        affectedGroup.formLike,
        false
      );

      if (!affectedGroup.formId) {
        const formId = `form_${++this.#formCounter}`;
        affectedGroup.formId = formId;

        this.#forms.set(formId, affectedGroup);
      }

      affectedGroup.fieldDetailsList = fieldDetailsList;
    }
  }

  /**
   * Handles document mutations by removing stale fields, tracking newly added
   * fields, and updating classification data for affected form groups.
   *
   * @param {Array<MutationRecord>} mutations
   *
   * @private
   */
  #onMutation(mutations) {
    const affectedGroups = new Map();

    if (
      mutations.some(
        mutation =>
          mutation.type === "childList" && mutation.removedNodes.length
      )
    ) {
      this.#removeStaleFields(affectedGroups);
    }

    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }

      const addedFields = this.#getAddedFields(mutation);

      for (const addedField of addedFields) {
        if (!addedField.isConnected) {
          continue;
        }

        const group = this.#addFieldToGroup(addedField);
        affectedGroups.set(group.formLike.rootElement, group);
      }
    }

    if (!affectedGroups.size) {
      return;
    }

    if (this.#formUpdateTimeout) {
      this.#doc.defaultView.clearTimeout(this.#formUpdateTimeout);
    }

    this.#formUpdateAffectedGroupsMap = new Map([
      ...(this.#formUpdateAffectedGroupsMap ?? []),
      ...affectedGroups,
    ]);

    this.#formUpdateTimeout = this.#doc.defaultView.setTimeout(() => {
      const groups = this.#formUpdateAffectedGroupsMap;
      this.#formUpdateAffectedGroupsMap = null;

      this.#formUpdateTimeout = null;

      this.#triggerFormUpdate(groups);
    }, 300);
  }

  /**
   * Triggers the form updates
   *
   * @param {Map<HTMLElement, FormGroup>} affectedGroups
   */
  #triggerFormUpdate(affectedGroups) {
    this.#utils.clearCache();
    this.#updateFormGroups(affectedGroups);

    if (typeof this.#onFormUpdate === "function") {
      this.#onFormUpdate(this.getFormData());
    }
  }

  /**
   * Detects, groups, and locally classifies fields present during initialization.
   *
   * @returns {Promise<void>}
   *
   * @private
   */
  async #detectFields() {
    for (const field of this.#getFields(this.#doc)) {
      this.#addFieldToGroup(field);
    }

    this.#updateFormGroups(this.#formRoots);
  }

  /**
   * Recursively yields Smart Form Fill fields from a document, element, or
   * shadow root and registers discovered open shadow roots for observation.
   *
   * @param {Document | Element | ShadowRoot} rootElement
   * @yields {SmartFormFillField}
   *
   * @private
   */
  *#getFields(rootElement) {
    if (rootElement.matches && rootElement.matches(INPUTS_SELECTOR)) {
      yield rootElement;
    }

    if (rootElement.shadowRoot) {
      this.#observeRoot(rootElement.shadowRoot);
      yield* this.#getFields(rootElement.shadowRoot);
    }

    for (const element of rootElement.querySelectorAll("*")) {
      if (element.matches(INPUTS_SELECTOR)) {
        yield element;
      }

      if (element.shadowRoot) {
        this.#observeRoot(element.shadowRoot);
        yield* this.#getFields(element.shadowRoot);
      }
    }
  }
}
