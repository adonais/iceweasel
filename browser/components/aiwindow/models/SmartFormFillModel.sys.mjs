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
 * Reports the model and prompt version a request is about to be sent with.
 * Called after both are resolved and before the request leaves, so callers can
 * record it whether or not a response ever arrives.
 *
 * @typedef {(info: {model: string, promptVersion: string}) => void} ModelInfoCallback
 */

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
 * @typedef {object} GenerateFormValuesBatchResponse
 * @property {Array<FieldValue>} fields The field decisions from the LLM
 * @property {Array<string>} memories_used Ids of the memories the model says it
 * used
 * @property {Array<string>} tabs_used Urls of the context tabs the model says
 * it used
 */

/**
 * @typedef {object} GenerateFormValuesBatchSummary
 * @property {number} total The total overall number of batches
 * @property {number} failed The number of batches that failed
 */

/**
 * @typedef {GenerateFormValuesBatchResponse & {batches: GenerateFormValuesBatchSummary}} GenerateFormValuesResponse
 */

const MAX_FIELDS_PER_GENERATION_REQUEST = 20;
const MAX_CONCURRENT_VALUES_BATCH_REQUESTS = 2;

let activeValuesBatchRequests = 0;
const pendingValuesBatchRequests = [];

/**
 * Starts executing queued batches from generateFormValues()
 */
function startPendingValuesBatchRequests() {
  while (
    activeValuesBatchRequests < MAX_CONCURRENT_VALUES_BATCH_REQUESTS &&
    pendingValuesBatchRequests.length
  ) {
    const pendingRequest = pendingValuesBatchRequests.shift();
    const { request, options, resolve, reject } = pendingRequest;

    options.signal?.removeEventListener("abort", pendingRequest.onAbort);
    activeValuesBatchRequests++;

    generateFormValuesBatch(request, options).then(
      value => {
        activeValuesBatchRequests--;
        resolve(value);
        startPendingValuesBatchRequests();
      },
      error => {
        activeValuesBatchRequests--;
        reject(error);
        startPendingValuesBatchRequests();
      }
    );
  }
}

/**
 * Adds a request to the queue for generating values.
 *
 * @param {GenerateFormValuesRequestBody} request
 * @param {object} [options={}]
 * @param {AbortSignal} [options.signal]
 *
 * @returns {Promise<GenerateFormValuesBatchResponse>}
 */
function queueValuesBatchRequest(request, options) {
  const { signal } = options;
  signal?.throwIfAborted();

  const { promise, resolve, reject } = Promise.withResolvers();
  const pendingRequest = {
    request,
    options,
    resolve,
    reject,
    onAbort: null,
  };

  if (signal) {
    pendingRequest.onAbort = () => {
      const index = pendingValuesBatchRequests.indexOf(pendingRequest);
      if (index === -1) {
        return;
      }
      pendingValuesBatchRequests.splice(index, 1);
      reject(signal.reason);
    };
    signal.addEventListener("abort", pendingRequest.onAbort, { once: true });
  }

  pendingValuesBatchRequests.push(pendingRequest);
  startPendingValuesBatchRequests();
  return promise;
}

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
    tabs_used: {
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
  required: ["memories_used", "tabs_used", "fields"],
  additionalProperties: false,
};

/**
 * Generates values for one batch of fields.
 *
 * @param {GenerateFormValuesRequestBody} request
 * @param {object} [param1={}]
 * @param {AbortSignal} [param1.signal]
 * @param {ModelInfoCallback} [param1.onDispatch]
 *
 * @returns {Promise<GenerateFormValuesBatchResponse>}
 */
async function generateFormValuesBatch(request, { signal, onDispatch } = {}) {
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

  onDispatch?.({ model, promptVersion: version });

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
    tabs_used: [],
    fields: [],
  });
}

/**
 * Calls to the LLM for Smart Form Fill
 */
export const SmartFormFillModel = {
  /**
   * Checks whether a failed Smart Form Fill model request can be retried.
   *
   * @param {unknown} error The request failure to classify.
   *
   * @returns {boolean} Whether the error is worth retrying
   */
  isRetryableRequestError(error) {
    return openAIEngine.isRetryableError(error);
  },

  /**
   * Trigger LLM request to classify form fields
   *
   * @param {ClassifyFieldsRequestBody} request
   * @param {object} [param1={}]
   * @param {AbortSignal} [param1.signal]
   * @param {ModelInfoCallback} [param1.onDispatch]
   *
   * @returns {Promise<ClassificationResponse>}
   */
  async classifyFields(request, { signal, onDispatch } = {}) {
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

    onDispatch?.({ model, promptVersion: version });

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
   * @param {ModelInfoCallback} [param1.onDispatch]
   *
   * @returns {Promise<RelevantTabsResponse>}
   */
  async findRelevantTabs(request, { signal, onDispatch } = {}) {
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

    onDispatch?.({ model, promptVersion: version });

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
   * @param {ModelInfoCallback} [param1.onDispatch] Called by every batch that
   * gets as far as sending, so a batch failing before that does not cost the
   * caller its report. Every batch resolves the same feature config, so callers
   * should keep the first call and ignore the rest.
   *
   * @returns {Promise<GenerateFormValuesResponse>}
   */
  async generateFormValues(request, { signal, onDispatch } = {}) {
    signal?.throwIfAborted();

    const requests = [];
    for (
      let index = 0;
      index < request.fields.length;
      index += MAX_FIELDS_PER_GENERATION_REQUEST
    ) {
      requests.push(
        queueValuesBatchRequest(
          {
            ...request,
            fields: request.fields.slice(
              index,
              index + MAX_FIELDS_PER_GENERATION_REQUEST
            ),
          },
          { signal, onDispatch }
        )
      );
    }

    const results = await Promise.allSettled(requests);
    signal?.throwIfAborted();

    // A batch that fails only costs its own fields, so the ones that answered
    // still get filled. Nothing answering is a failed request, not an empty one.
    const fulfilled = results.filter(({ status }) => status === "fulfilled");
    if (!fulfilled.length) {
      throw results[0].reason;
    }

    return {
      fields: fulfilled.flatMap(({ value }) => value.fields ?? []),
      memories_used: [
        ...new Set(fulfilled.flatMap(({ value }) => value.memories_used ?? [])),
      ],
      tabs_used: [
        ...new Set(fulfilled.flatMap(({ value }) => value.tabs_used ?? [])),
      ],
      batches: {
        total: results.length,
        failed: results.length - fulfilled.length,
      },
    };
  },
};
