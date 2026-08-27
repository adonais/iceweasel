/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  getTabList: "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs",
  FormHistory: "resource://gre/modules/FormHistory.sys.mjs",
  MemoriesManager:
    "moz-src:///browser/components/aiwindow/models/memories/MemoriesManager.sys.mjs",
  SmartFormFillModel:
    "moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs",
});

/** @typedef {import("moz-src:///browser/components/aiwindow/models/Tools.sys.mjs").TabInfo} TabInfo */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").Candidate} Candidate */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").ClassificationResponse} ClassificationResponse */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").ClassifyFieldsRequestBody} ClassifyFieldsRequestBody */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").FieldData} FieldData */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").FieldDataForClassification} FieldDataForClassification */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").GenerateFormValuesResponse} GenerateFormValuesResponse */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").PageInfo} PageInfo */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").RelevantTabsResponse} RelevantTabsResponse */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").RelevantTabRequestBody} RelevantTabRequestBody */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").TabData} TabData */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").RelevantTab} RelevantTab */
/** @typedef {import("moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillDocument.sys.mjs").FormData} FormData */

/**
 * @typedef {{
 *   id: string,
 *   value: string,
 * }} FillInstruction
 */

/**
 * @typedef {{
 *   id: string,
 *   fields: Array<FillInstruction>,
 * }} FillFormResult
 */

/**
 * @typedef {{
 *   candidates: Array<Candidate>,
 *   valuesByToken: Map<string, string>,
 * }} CandidateResult
 */

/**
 * @typedef {{
 *   relevantTabsCompleted: boolean,
 *   classificationsCompleted: boolean,
 * }} InitializationResult
 */

// TODO: Adjust this based on evals for optimal amount
const MAX_TABS = 30;

// Max number of tabs for the LLM to select
const MAX_SELECTED_TABS = 5;

/**
 * Smart Form Fill controller, orchestrates logic for SFF
 */
export class SmartFormFillController {
  /**
   * The relevant page info for the form
   *
   * @type {PageInfo}
   */
  #pageInfo;

  /**
   * Serializable form data.
   *
   * @type {Array<FormData> | null | undefined}
   */
  #formDataList;

  /**
   * Model-facing tab data.
   *
   * @type {Array<TabData> | null | undefined}
   */
  #tabList;

  /**
   * Tab data for model calls by stable ID.
   *
   * @type {Map<string, TabData> | null}
   */
  #tabsById;

  /**
   * Counter for stable tab IDs.
   *
   * @type {number}
   */
  #tabCounter;

  /**
   * Relevant-tab request controllers by form ID.
   *
   * @type {Map<string, AbortController> | null}
   */
  #abortRelevantTabsControllers;

  /**
   * Classification request controllers by form ID.
   *
   * @type {Map<string, AbortController> | null}
   */
  #abortClassificationControllers;

  /**
   * Value-generation request controllers by form ID.
   *
   * @type {Map<string, AbortController> | null}
   */
  #abortValueGenerationControllers;

  /**
   * Relevant-tab responses by form ID.
   *
   * @type {Map<string, RelevantTabsResponse> | null}
   */
  #relevantTabsByFormId;

  /**
   * Classification responses by form ID.
   *
   * @type {Map<string, ClassificationResponse> | null}
   */
  #classifiedFieldsByFormId;

  /**
   * Whether the controller has been destroyed.
   *
   * @type {boolean}
   */
  #destroyed;

  /**
   * Creates a controller for Smart Form Fill
   *
   * @param {PageInfo} pageInfo The page info for the tab
   */
  constructor(pageInfo) {
    this.#pageInfo = pageInfo;
    this.#destroyed = false;
    this.#tabCounter = 0;
    this.#tabsById = new Map();
    this.#relevantTabsByFormId = new Map();
    this.#classifiedFieldsByFormId = new Map();

    this.#abortRelevantTabsControllers = new Map();
    this.#abortClassificationControllers = new Map();
    this.#abortValueGenerationControllers = new Map();
  }

  /**
   * Gets list of relevant tabs as selected by LLM
   *
   * @param {string} formId
   *
   * @returns {Array<RelevantTab>}
   */
  getRelevantTabsFor(formId) {
    return this.#relevantTabsByFormId.get(formId)?.selectedTabs ?? [];
  }

  /**
   * Gets TabData for a stable tab ID
   *
   * @param {string} tabId
   *
   * @returns {TabData | undefined}
   */
  getRelevantTabData(tabId) {
    return this.#tabsById.get(tabId);
  }

  /**
   * Generates values for a form.
   *
   * @param {string} formId
   * @param {Set<string>} emptyFieldIds
   * @param {Array<RelevantTab>} selectedTabs
   * @param {Map<string, string>} tabContentById
   * @param {string} pageText
   *
   * @returns {Promise<FillFormResult | null>}
   */
  async autofill(
    formId,
    emptyFieldIds,
    selectedTabs,
    tabContentById,
    pageText
  ) {
    const formData = this.#formDataList.find(({ id }) => id === formId);
    if (!formData) {
      return null;
    }

    const emptyFields = formData.fields.filter(field =>
      emptyFieldIds.has(field.id)
    );
    if (!emptyFields.length) {
      return null;
    }

    return this.#generateFormValues(
      formId,
      emptyFields,
      selectedTabs,
      tabContentById,
      pageText
    );
  }

  /**
   * Updates the FormData list when the page detects form updates
   *
   * @param {Array<FormData>} formDataList
   *
   * @returns {Promise<InitializationResult>}
   */
  async updateFormData(formDataList) {
    this.#abortRequests(
      this.#abortRelevantTabsControllers,
      this.#abortClassificationControllers
    );

    this.#formDataList = formDataList;

    return this.#getFormMetadata();
  }

  /**
   * Requests relevant tabs and field classifications.
   *
   * @returns {Promise<InitializationResult>}
   */
  async #getFormMetadata() {
    const [tabs, fields] = await Promise.all([
      Promise.allSettled(this.#getRelevantTabsForForms()),
      Promise.allSettled(this.#getFormFieldClassifications()),
    ]);

    return {
      relevantTabsCompleted: tabs.every(tab => tab.status === "fulfilled"),
      classificationsCompleted: fields.every(
        field => field.status === "fulfilled"
      ),
    };
  }

  /**
   * Generates values for one form.
   *
   * @param {string} id
   * @param {Array<FieldData>} fields
   * @param {Array<RelevantTab>} selectedTabs
   * @param {Map<string, string>} tabContentById
   * @param {string} pageText
   *
   * @returns {Promise<FillFormResult>}
   */
  async #generateFormValues(
    id,
    fields,
    selectedTabs,
    tabContentById,
    pageText
  ) {
    this.#abortValueGenerationControllers.get(id)?.abort();

    const abortCtrl = new AbortController();
    this.#abortValueGenerationControllers.set(id, abortCtrl);

    const classifications = new Map(
      (this.#classifiedFieldsByFormId.get(id)?.fields ?? []).map(result => [
        result.id,
        result,
      ])
    );

    const task = "generate";
    const page = this.#pageInfo;

    // NOTE: These are disabled for v0, will enable in later version
    //const memories = this.#getMemories(page, fields);
    const memories = [];

    const relevantTabs = selectedTabs.map(selectedTab => {
      const { title, url } = this.#tabsById.get(selectedTab.id);

      return {
        title,
        url,
        tabContent: tabContentById.get(selectedTab.id) ?? "",
      };
    });

    const context = { pageText, relevantTabs, memories };

    try {
      const { candidates, valuesByToken } = await this.#getCandidates(fields);
      abortCtrl.signal.throwIfAborted();

      const values = await lazy.SmartFormFillModel.generateFormValues(
        {
          task,
          page,
          fields: this.#getFieldDataForClassification(fields).map(field => {
            const classification = classifications.get(field.id);
            const { localGuess, localConfidence, ...fieldData } = field;
            let classificationConfidence = "low";
            if (localConfidence > 0.6) {
              classificationConfidence = "high";
            } else if (localConfidence > 0.3) {
              classificationConfidence = "medium";
            }

            return {
              ...fieldData,
              type: classification?.type ?? localGuess ?? "unknown",
              classificationConfidence:
                classification?.confidence ?? classificationConfidence,
            };
          }),
          candidates,
          context,
        },
        { signal: abortCtrl.signal }
      );
      abortCtrl.signal.throwIfAborted();

      const fillInstructions = this.#getFillInstructions(
        values,
        fields,
        valuesByToken
      );

      return {
        id,
        fields: fillInstructions,
      };
    } finally {
      this.#removeAbortController(
        this.#abortValueGenerationControllers,
        id,
        abortCtrl
      );
    }
  }

  /**
   * Gets relevant memories for a set of fields on a page
   *
   * @param {PageInfo} pageInfo
   * @param {Array<FieldData>} fields
   *
   * @returns {Promise<Array<string>>}
   */
  // eslint-disable-next-line no-unused-private-class-members -- will be enabled in v0+
  async #getMemories(pageInfo, fields) {
    const hostname = URL.parse(pageInfo.url)?.hostname ?? "";
    const site = hostname ? `Site: ${hostname}` : "";
    const contextMessage = [
      `The user is completing a form on "${pageInfo.title}".`,
      site,
      "The form requests:",
      ...fields.map(field =>
        [
          field.label,
          field.inputType,
          field.placeholder,
          field.textBefore,
          field.textAfter,
        ]
          .filter(Boolean)
          .join(" ")
      ),
    ].join("\n");

    const relevantMemories =
      await lazy.MemoriesManager.getRelevantMemories(contextMessage);

    return relevantMemories.map(
      relevant_memory => relevant_memory.memory_summary
    );
  }

  /**
   * Resolves model results into fill instructions.
   *
   * @param {GenerateFormValuesResponse} values
   * @param {Array<FieldData>} fields
   * @param {Map<string, string>} valuesByToken
   *
   * @returns {Array<FillInstruction>}
   */
  #getFillInstructions(values, fields, valuesByToken) {
    const fieldIds = new Set(fields.map(field => field.id));
    const resolvedFieldIds = new Set();
    const fillInstructions = [];

    for (const result of values.fields) {
      if (
        result.confidence !== "high" ||
        !fieldIds.has(result.id) ||
        resolvedFieldIds.has(result.id)
      ) {
        continue;
      }

      let value;
      switch (result.action) {
        case "fill_from_token":
          value = result.token ? valuesByToken.get(result.token) : undefined;
          break;

        case "generate":
          value = result.value;
          break;

        default:
          continue;
      }

      if (!value || typeof value !== "string") {
        continue;
      }

      fillInstructions.push({ id: result.id, value });
      resolvedFieldIds.add(result.id);
    }

    return fillInstructions;
  }

  /**
   * Builds stored-value candidates for fields.
   *
   * @param {Array<FieldData>} fields
   * @returns {Promise<CandidateResult>}
   */
  async #getCandidates(fields) {
    const candidates = [];
    const valuesByToken = new Map();
    const typeCounts = new Map();

    for (const field of fields) {
      if (!field.localGuess) {
        continue;
      }

      const value = await this.#getStoredValue(field);
      if (!value) {
        continue;
      }

      const type = field.localGuess;
      const count = (typeCounts.get(type) ?? 0) + 1;
      typeCounts.set(type, count);

      const token = `$${type.toUpperCase().replaceAll("-", "_")}_${count}`;

      candidates.push({ token, type });
      valuesByToken.set(token, value);
    }

    return { candidates, valuesByToken };
  }

  /**
   * Gets the latest Form History value for a field.
   *
   * @param {FieldData} field
   * @returns {Promise<string | null>}
   */
  async #getStoredValue(field) {
    if (!field.formHistoryName) {
      return null;
    }

    try {
      const results = await lazy.FormHistory.search(["value", "lastUsed"], {
        fieldname: field.formHistoryName,
      });

      if (!results?.length) {
        return null;
      }

      results.sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0));

      return results[0].value ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Initializes field classifications and relevant tabs.
   *
   * @param {Array<FormData>} formDataList
   * @returns {Promise<InitializationResult>}
   */
  async initialize(formDataList) {
    this.#formDataList = formDataList;
    this.#tabList = this.#getTabData(lazy.getTabList(MAX_TABS));

    const initialized = await this.#getFormMetadata();

    if (this.#destroyed) {
      return {
        relevantTabsCompleted: false,
        classificationsCompleted: false,
      };
    }

    return initialized;
  }

  /**
   * Aborts requests and clears their controller maps.
   *
   * @param {...Map<string, AbortController>} controllerMaps
   */
  #abortRequests(...controllerMaps) {
    const controllers = controllerMaps.flatMap(map => [...map.values()]);

    for (const controller of controllers) {
      controller.abort();
    }

    for (const map of controllerMaps) {
      map.clear();
    }
  }

  /**
   * Removes a request controller if it is still current.
   *
   * @param {Map<string, AbortController> | null} controllers
   * @param {string} id
   * @param {AbortController} controller
   */
  #removeAbortController(controllers, id, controller) {
    if (controllers?.get(id) === controller) {
      controllers.delete(id);
    }
  }

  /**
   * Cancels requests and clears controller state.
   */
  destroy() {
    this.#formDataList = null;
    this.#tabCounter = 0;
    this.#tabList = null;

    this.#tabsById.clear();
    this.#tabsById = null;

    this.#abortRequests(
      this.#abortRelevantTabsControllers,
      this.#abortClassificationControllers,
      this.#abortValueGenerationControllers
    );

    this.#abortRelevantTabsControllers = null;
    this.#abortClassificationControllers = null;
    this.#abortValueGenerationControllers = null;

    this.#relevantTabsByFormId.clear();
    this.#relevantTabsByFormId = null;

    this.#classifiedFieldsByFormId.clear();
    this.#classifiedFieldsByFormId = null;

    this.#destroyed = true;
  }

  /**
   * Returns relevant tabs with valid, unique IDs.
   *
   * @param {Array<RelevantTab>} selectedTabs
   * @returns {Array<RelevantTab>}
   */
  #getValidRelevantTabs(selectedTabs) {
    if (!Array.isArray(selectedTabs)) {
      return [];
    }

    const seen = new Set();

    return selectedTabs
      .filter(tab => {
        const id = tab?.id;
        if (!this.#tabsById.has(id) || seen.has(id)) {
          return false;
        }

        seen.add(id);
        return true;
      })
      .slice(0, MAX_SELECTED_TABS);
  }

  /**
   * Starts relevant-tab requests for all forms.
   *
   * @returns {Array<Promise<RelevantTabsResponse>>}
   */
  #getRelevantTabsForForms() {
    const promises = [];
    for (const { id, fields } of this.#formDataList) {
      const abortCtrl = new AbortController();
      this.#abortRelevantTabsControllers.set(id, abortCtrl);

      const promise = lazy.SmartFormFillModel.findRelevantTabs(
        this.#getRelevantTabRequestBody(fields),
        { signal: abortCtrl.signal }
      )
        .then(relevantTabCandidates => {
          abortCtrl.signal.throwIfAborted();

          const relevantTabs = {
            selectedTabs: this.#getValidRelevantTabs(
              relevantTabCandidates?.selectedTabs
            ),
          };
          this.#relevantTabsByFormId.set(id, relevantTabs);

          return relevantTabs;
        })
        .finally(() => {
          this.#removeAbortController(
            this.#abortRelevantTabsControllers,
            id,
            abortCtrl
          );
        });

      promises.push(promise);
    }

    return promises;
  }

  /**
   * Starts field-classification requests for all forms.
   *
   * @returns {Array<Promise<ClassificationResponse>>}
   */
  #getFormFieldClassifications() {
    const promises = [];
    for (const { id, fields } of this.#formDataList) {
      const abortCtrl = new AbortController();
      this.#abortClassificationControllers.set(id, abortCtrl);

      const promise = lazy.SmartFormFillModel.classifyFields(
        this.#getClassifyFieldsRequestBody(fields),
        { signal: abortCtrl.signal }
      )
        .then(classifiedFields => {
          abortCtrl.signal.throwIfAborted();
          this.#classifiedFieldsByFormId.set(id, classifiedFields);

          return classifiedFields;
        })
        .finally(() => {
          this.#removeAbortController(
            this.#abortClassificationControllers,
            id,
            abortCtrl
          );
        });

      promises.push(promise);
    }

    return promises;
  }

  /**
   * Builds model-facing field data for classification and tab selection.
   *
   * @param {Array<FieldData>} fields
   * @returns {Array<FieldDataForClassification>}
   */
  #getFieldDataForClassification(fields) {
    return fields.map(field => ({
      id: field.id,
      label: field.label,
      name: field.name,
      inputType: field.inputType,
      placeholder: field.placeholder,
      autocomplete: field.autocomplete,
      maxlength: field.maxlength,
      options: field.options,
      textBefore: field.textBefore,
      textAfter: field.textAfter,
      localGuess: field.localGuess,
      localConfidence: field.localConfidence,
    }));
  }

  /**
   * Builds a field-classification request.
   *
   * @param {Array<FieldData>} fields
   * @returns {ClassifyFieldsRequestBody}
   */
  #getClassifyFieldsRequestBody(fields) {
    const task = "classify";
    const enumVersion = "sff-fieldtypes-1";
    const page = this.#pageInfo;
    const classificationFields = this.#getFieldDataForClassification(fields);

    return { task, enumVersion, page, fields: classificationFields };
  }

  /**
   * Builds a relevant-tabs request.
   *
   * @param {Array<FieldData>} fields
   * @returns {RelevantTabRequestBody}
   */
  #getRelevantTabRequestBody(fields) {
    const task = "select_tabs";
    const page = this.#pageInfo;
    const tabs = this.#tabList;
    const maxSelectedTabs = MAX_SELECTED_TABS;
    const classificationFields = this.#getFieldDataForClassification(fields);

    return {
      task,
      page,
      maxSelectedTabs,
      tabs,
      fields: classificationFields,
    };
  }

  /**
   * Converts open tabs to model-facing data.
   *
   * @param {Array<TabInfo>} tabList
   * @returns {Array<TabData>}
   */
  #getTabData(tabList) {
    return tabList.map(tab => {
      const id = `t${++this.#tabCounter}`;
      const { url, title } = tab;

      const tabData = {
        id,
        url,
        title,
      };

      this.#tabsById.set(id, tabData);

      return tabData;
    });
  }
}
