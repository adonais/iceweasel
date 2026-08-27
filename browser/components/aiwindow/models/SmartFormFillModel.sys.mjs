/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  makeJSONSchemaBlob,
  MODEL_FEATURES,
  parseAndExtractJSON,
  renderPrompt,
} from "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs";
import { openAIEngine } from "moz-src:///browser/components/aiwindow/models/openAIEngine.sys.mjs";
import {
  buildConversation,
  loadPrompt,
} from "moz-src:///browser/components/aiwindow/models/PromptLoader.sys.mjs";

/**
 * @typedef {object} FieldClassification
 * @property {string} id The stable field ID
 * @property {string} type The classification type
 * @property {"low" | "medium" | "high"} confidence Classification confidence
 * level
 */

/**
 * @typedef {object} ClassificationResponse
 * @property {Array<FieldClassification>} fields List of classified fields
 */

/**
 * @typedef {object} PageInfo
 * @property {string} title The page title
 * @property {string} url The page url
 */

/**
 * @typedef {object} SelectOptionFormData
 * @property {string} id Option id for select option value matching on FE
 * @property {string} label Visible option text supplied to the model
 */

/**
 * @typedef {object} FieldData Locally collected form field data
 * @property {string} id Field id to map values to
 * @property {string} [label] Label text associated with the field
 * @property {string} [name] The element name attribute. It may be descriptive
 * or opaque
 * @property {string} formHistoryName The name to use to query FormHistory for
 * stored values. This property is not sent to the LLM.
 * @property {string} inputType Control type such as text, email, textarea,
 * select
 * @property {string} [placeholder] Placeholder text shown inside the control
 * @property {string} [autocomplete] The HTML autocomplete attribute, when
 * present
 * @property {number | null} [maxlength] Maximum allowed character count, null
 * when not present
 * @property {Array<SelectOptionFormData>} options Dropdown choices, empty for
 * non-select controls
 * @property {string} [textBefore] Nearest visible text immediately preceding
 * the current DOM element
 * @property {string} [textAfter] Bounded visible text immediately after the
 * field
 * @property {string} [localGuess] Result from local deterministic
 * heuristics/local model. The LLM may keep or override it
 * @property {number} [localConfidence] Confidence score from local model
 */

/**
 * @typedef {Omit<FieldData, "formHistoryName">} FieldDataForClassification
 * Field data sent in a classification request
 */

/**
 * @typedef {object} TabData
 * @property {string} id The stable ID for the tab
 * @property {string} url The url for the tab
 * @property {string} title The tab's title
 */

/**
 * @typedef {Omit<
 *   FieldDataForClassification,
 *   "localGuess" | "localConfidence"
 * > & {
 *   type: string,
 *   classificationConfidence: "low" | "medium" | "high"
 * }} FieldDataForValueGen Field data for an LLM form-fill request
 */

/**
 * @typedef {object} ClassifyFieldsRequestBody
 * @property {"classify"} task The LLM task type
 * @property {"sff-fieldtypes-1"} enumVersion Enums version
 * @property {PageInfo} page Info about the page the form is on
 * @property {Array<FieldDataForClassification>} fields List of fields to
 * classify
 */

/**
 * @typedef {object} RelevantTab
 * @property {string} id The stable tab ID
 * @property {"high" | "medium" | "low"} relevance Expected usefulness to the
 * form-filling task
 * @property {string} [reason] Debug explanation of result
 */

/**
 * @typedef {object} RelevantTabsResponse
 * @property {Array<RelevantTab>} selectedTabs The tabs relevant to the form in
 * the request body
 */

/**
 * @typedef {object} RelevantTabRequestBody
 * @property {"select_tabs"} task The LLM task
 * @property {PageInfo} page Info about the page the form is on
 * @property {number} maxSelectedTabs Max number of tabs for the LLM to choose
 * @property {Array<TabData>} tabs List of tabs for the LLM to choose from
 * @property {Array<FieldDataForClassification>} fields Form fields used to
 * determine relevance
 */

/**
 * @typedef {object} Candidate
 * @property {string} token Local value token
 * @property {string} type Local type guess
 */

/**
 * @typedef {object} TabCandidate
 * @property {string} title Tab title
 * @property {string} url Tab url
 * @property {string} tabContent The tab content
 */

/**
 * @typedef {object} Context
 * @property {string} [pageText] Text of the current page
 * @property {Array<TabCandidate>} [relevantTabs] Tabs for context
 * @property {Array<string>} [memories] List of memories
 */

/**
 * @typedef {object} GenerateFormValuesRequestBody
 * @property {"generate"} task The LLM task type
 * @property {PageInfo} page Info about the page the form is on
 * @property {Array<FieldDataForValueGen>} fields List of fields to fill
 * @property {Array<Candidate>} candidates List of local value candidates
 * @property {Context} context Current page context data
 */

/**
 * @typedef {object} FieldValue
 * @property {string} id The stable field ID
 * @property {"fill_from_token" | "select_option" | "generate" | "skip"} action The action the LLM decided for the value
 * @property {string} [token] Candidate token, present only when action is
 * "fill_from_token"
 * @property {"high" | "medium" | "low"} confidence The LLM's value confidence
 * @property {string} [optionId] Select option stable ID, present only when
 * action is
 * "select_option"
 * @property {string} [value] Generated value, present only when action is
 * "generate"
 */

/**
 * @typedef {object} GenerateFormValuesResponse
 * @property {Array<FieldValue>} fields The field decisions from the LLM
 * @property {Array<string>} memories_used List of memories that were used
 */

const MAX_FIELDS_PER_GENERATION_REQUEST = 20;

const FIELD_CLASSIFICATION_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          confidence: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
        },
        required: ["id", "type", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["fields"],
  additionalProperties: false,
};

const RELEVANT_TABS_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    selectedTabs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          relevance: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
          reason: { type: "string" },
        },
        required: ["id", "relevance"],
        additionalProperties: false,
      },
    },
  },
  required: ["selectedTabs"],
  additionalProperties: false,
};

const FORM_VALUES_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    memories_used: {
      type: "array",
      items: { type: "string" },
    },
    fields: {
      type: "array",
      items: {
        oneOf: [
          {
            type: "object",
            properties: {
              id: { type: "string" },
              action: {
                type: "string",
                enum: ["fill_from_token"],
              },
              token: { type: "string" },
              confidence: {
                type: "string",
                enum: ["high", "medium", "low"],
              },
            },
            required: ["id", "action", "token", "confidence"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              id: { type: "string" },
              action: {
                type: "string",
                enum: ["generate"],
              },
              value: { type: "string" },
              confidence: {
                type: "string",
                enum: ["high", "medium", "low"],
              },
            },
            required: ["id", "action", "value", "confidence"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              id: { type: "string" },
              action: {
                type: "string",
                enum: ["select_option"],
              },
              optionId: { type: "string" },
              confidence: {
                type: "string",
                enum: ["high", "medium", "low"],
              },
            },
            required: ["id", "action", "optionId", "confidence"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              id: { type: "string" },
              action: {
                type: "string",
                enum: ["skip"],
              },
              confidence: {
                type: "string",
                enum: ["high", "medium", "low"],
              },
            },
            required: ["id", "action", "confidence"],
            additionalProperties: false,
          },
        ],
      },
    },
  },
  required: ["memories_used", "fields"],
  additionalProperties: false,
};

/**
 * Generates values for one batch of fields.
 *
 * @param {GenerateFormValuesRequestBody} request
 * @param {object} [param1={}]
 * @param {AbortSignal} [param1.signal]
 *
 * @returns {Promise<GenerateFormValuesResponse>}
 */
async function generateFormValuesBatch(request, { signal } = {}) {
  signal?.throwIfAborted();

  const conversation = await buildConversation(MODEL_FEATURES.SMART_FORM_FILL);
  signal?.throwIfAborted();

  const model = conversation.engine.model;
  const [{ prompt: systemPrompt, version }, { prompt: userPromptTemplate }] =
    await Promise.all([
      loadPrompt(MODEL_FEATURES.SMART_FORM_FILL, {
        module: "value-generation-system-instructions",
        model,
      }),
      loadPrompt(MODEL_FEATURES.SMART_FORM_FILL, {
        module: "value-generation-user-data",
        model,
      }),
    ]);
  signal?.throwIfAborted();

  const userPrompt = renderPrompt(userPromptTemplate, {
    title: request.page.title,
    url: request.page.url,
    pageText: request.context.pageText ?? "",
    memories: JSON.stringify(request.context.memories ?? []),
    pageContext: JSON.stringify(request.context.relevantTabs ?? []),
    candidateTokens: JSON.stringify(request.candidates),
    fields: JSON.stringify(request.fields),
  });

  conversation.setSystemMessage({
    body: systemPrompt,
    version,
  });
  conversation.addUserMessage(userPrompt);

  const response = await conversation.run({
    fxAccountToken: await openAIEngine.getFxAccountToken(),
    tools: [],
    inferenceParams: {
      response_format: makeJSONSchemaBlob(
        "SmartFormFillFormValues",
        FORM_VALUES_RESPONSE_SCHEMA
      ),
    },
  });

  signal?.throwIfAborted();
  return parseAndExtractJSON(response, {
    memories_used: [],
    fields: [],
  });
}

/**
 * Calls to the LLM for Smart Form Fill
 */
export const SmartFormFillModel = {
  /**
   * Trigger LLM request to classify form fields
   *
   * @param {ClassifyFieldsRequestBody} request
   * @param {object} [param1={}]
   * @param {AbortSignal} [param1.signal]
   *
   * @returns {Promise<ClassificationResponse>}
   */
  async classifyFields(request, { signal } = {}) {
    signal?.throwIfAborted();

    const conversation = await buildConversation(
      MODEL_FEATURES.SMART_FORM_FILL
    );
    signal?.throwIfAborted();

    const model = conversation.engine.model;
    const [{ prompt: systemPrompt, version }, { prompt: userPromptTemplate }] =
      await Promise.all([
        loadPrompt(MODEL_FEATURES.SMART_FORM_FILL, {
          module: "field-detection-system-instructions",
          model,
        }),
        loadPrompt(MODEL_FEATURES.SMART_FORM_FILL, {
          module: "field-detection-user-data",
          model,
        }),
      ]);
    signal?.throwIfAborted();

    const userPrompt = renderPrompt(userPromptTemplate, {
      title: request.page.title,
      url: request.page.url,
      fields: JSON.stringify(request.fields),
    });

    conversation.setSystemMessage({
      body: systemPrompt,
      version,
    });
    conversation.addUserMessage(userPrompt);

    const response = await conversation.run({
      fxAccountToken: await openAIEngine.getFxAccountToken(),
      tools: [],
      inferenceParams: {
        response_format: makeJSONSchemaBlob(
          "SmartFormFillFieldClassification",
          FIELD_CLASSIFICATION_RESPONSE_SCHEMA
        ),
      },
    });

    signal?.throwIfAborted();
    return parseAndExtractJSON(response, { fields: [] });
  },

  /**
   * Trigger LLM request to find relevant tabs for a form
   *
   * @param {RelevantTabRequestBody} request
   * @param {object} [param1={}]
   * @param {AbortSignal} [param1.signal]
   *
   * @returns {Promise<RelevantTabsResponse>}
   */
  async findRelevantTabs(request, { signal } = {}) {
    signal?.throwIfAborted();

    const conversation = await buildConversation(
      MODEL_FEATURES.SMART_FORM_FILL
    );
    signal?.throwIfAborted();

    const model = conversation.engine.model;
    const [{ prompt: systemPrompt, version }, { prompt: userPromptTemplate }] =
      await Promise.all([
        loadPrompt(MODEL_FEATURES.SMART_FORM_FILL, {
          module: "tab-selection-system-instructions",
          model,
        }),
        loadPrompt(MODEL_FEATURES.SMART_FORM_FILL, {
          module: "tab-selection-user-data",
          model,
        }),
      ]);
    signal?.throwIfAborted();

    const userPrompt = renderPrompt(userPromptTemplate, {
      title: request.page.title,
      url: request.page.url,
      fields: JSON.stringify(request.fields),
      tabs: JSON.stringify(request.tabs),
      max_selected_tabs: request.maxSelectedTabs,
    });

    conversation.setSystemMessage({
      body: systemPrompt,
      version,
    });
    conversation.addUserMessage(userPrompt);

    const response = await conversation.run({
      fxAccountToken: await openAIEngine.getFxAccountToken(),
      tools: [],
      inferenceParams: {
        response_format: makeJSONSchemaBlob(
          "SmartFormFillRelevantTabs",
          RELEVANT_TABS_RESPONSE_SCHEMA
        ),
      },
    });

    signal?.throwIfAborted();
    return parseAndExtractJSON(response, {
      selectedTabs: [],
    });
  },

  /**
   * Trigger LLM request to generate values for a form
   *
   * @param {GenerateFormValuesRequestBody} request
   * @param {object} [param1={}]
   * @param {AbortSignal} [param1.signal]
   *
   * @returns {Promise<GenerateFormValuesResponse>}
   */
  async generateFormValues(request, { signal } = {}) {
    signal?.throwIfAborted();

    const requests = [];
    for (
      let index = 0;
      index < request.fields.length;
      index += MAX_FIELDS_PER_GENERATION_REQUEST
    ) {
      requests.push(
        generateFormValuesBatch(
          {
            ...request,
            fields: request.fields.slice(
              index,
              index + MAX_FIELDS_PER_GENERATION_REQUEST
            ),
          },
          { signal }
        )
      );
    }

    // TODO - Bug 2059870 cap for fields/concurrency
    const responses = await Promise.all(requests);
    signal?.throwIfAborted();

    return {
      fields: responses.flatMap(response => response.fields),
      memories_used: [
        ...new Set(responses.flatMap(response => response.memories_used)),
      ],
    };
  },
};
