/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { SmartFormFillModel } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs"
);
const { MockEngineManager } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);
const {
  MODEL_FEATURES,
  getRemoteClient,
  _setRemoteClientForTesting,
  _clearRemoteClientForTesting,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);

const CUSTOM_PROMPTS_PREF = "browser.smartwindow.customPrompts";
const PURPOSE = "smart-form-fill";

const VALUE_GENERATION_MODULES = [
  {
    feature: MODEL_FEATURES.SMART_FORM_FILL,
    id: "smart-form-fill--value-generation-system-instructions--generic--v1",
    kind: "module",
    model: "generic",
    module: "value-generation-system-instructions",
    prompts: "You help a user fill out web form fields.",
    version: "1.0",
  },
  {
    feature: MODEL_FEATURES.SMART_FORM_FILL,
    id: "smart-form-fill--value-generation-user-data--generic--v1",
    kind: "module",
    model: "generic",
    module: "value-generation-user-data",
    prompts:
      "Current page title:\n{title}\n\n" +
      "Current page url:\n{url}\n\n" +
      "Current page text:\n{pageText}\n\n" +
      "Relevant memories about the user:\n{memories}\n\n" +
      "Relevant open tabs:\n{pageContext}\n\n" +
      "Available candidate tokens:\n{candidateTokens}\n\n" +
      "Fields to fill:\n{fields}",
    version: "1.0",
  },
];

async function useValueGenerationPrompts() {
  const records = await getRemoteClient().get();
  const params = records.find(
    record =>
      record.feature === MODEL_FEATURES.SMART_FORM_FILL &&
      record.kind === "params" &&
      record.is_default
  );
  const moduleNames = new Set(
    VALUE_GENERATION_MODULES.map(record => record.module)
  );
  const moduleIds = new Set(VALUE_GENERATION_MODULES.map(record => record.id));

  _setRemoteClientForTesting({
    get: async () => [
      ...records.filter(
        record => record !== params && !moduleIds.has(record.id)
      ),
      {
        ...params,
        modules: [
          ...params.modules.filter(module => !moduleNames.has(module.name)),
          ...VALUE_GENERATION_MODULES.map(record => ({
            name: record.module,
            version: record.version,
          })),
        ],
      },
      ...VALUE_GENERATION_MODULES,
    ],
  });
}

describe("SmartFormFillModel", () => {
  let mockEngineMan;

  beforeEach(async () => {
    await SpecialPowers.pushPrefEnv({
      clear: [[CUSTOM_PROMPTS_PREF]],
    });
    mockEngineMan = new MockEngineManager();
  });

  afterEach(async () => {
    mockEngineMan.rejectAllRequests();
    mockEngineMan.cleanupMocks();
    await SpecialPowers.popPrefEnv();
  });

  describe("classifyFields", () => {
    it("uses the field detection prompts and returns classifications", async () => {
      const fields = [
        {
          id: "field-1",
          label: "Email address",
          name: "email",
          inputType: "email",
          options: [],
        },
      ];
      const requestPromise = SmartFormFillModel.classifyFields({
        task: "classify",
        enumVersion: "sff-fieldtypes-1",
        page: {
          title: "Example form",
          url: "https://example.com/form",
        },
        fields,
      });

      const { request, respond } = await mockEngineMan.captureRequest({
        purpose: PURPOSE,
      });

      Assert.equal(request.args.length, 2);
      Assert.equal(request.args[0].role, "system");
      Assert.stringContains(
        request.args[0].content,
        "You classify each field of a web form into exactly one type"
      );
      Assert.stringContains(
        request.args[0].content,
        "Valid field types (choose exactly one per field"
      );
      Assert.deepEqual(request.args[1], {
        role: "user",
        content:
          "Page title:\nExample form\n\n" +
          "Page url:\nhttps://example.com/form\n\n" +
          `Fields to classify:\n${JSON.stringify(fields)}`,
      });
      Assert.deepEqual(request.tools, []);

      const responseFormat = request.inferenceParams.response_format;
      Assert.equal(responseFormat.type, "json_schema");
      Assert.equal(
        responseFormat.json_schema.name,
        "SmartFormFillFieldClassification"
      );
      Assert.deepEqual(responseFormat.json_schema.schema.required, ["fields"]);

      respond(
        JSON.stringify({
          fields: [
            {
              id: "field-1",
              type: "email",
              confidence: "high",
            },
          ],
        })
      );

      Assert.deepEqual(await requestPromise, {
        fields: [
          {
            id: "field-1",
            type: "email",
            confidence: "high",
          },
        ],
      });
    });
  });

  describe("findRelevantTabs", () => {
    it("uses the tab selection prompts and returns relevant tabs", async () => {
      const fields = [
        {
          id: "field-1",
          label: "Company",
          inputType: "text",
          options: [],
        },
      ];
      const tabs = [
        {
          id: "tab-1",
          title: "Professional profile",
          url: "https://example.com/profile",
        },
      ];
      const requestPromise = SmartFormFillModel.findRelevantTabs({
        task: "select_tabs",
        page: {
          title: "Job application",
          url: "https://example.com/jobs/apply",
        },
        maxSelectedTabs: 3,
        tabs,
        fields,
      });

      const { request, respond } = await mockEngineMan.captureRequest({
        purpose: PURPOSE,
      });

      Assert.equal(request.args.length, 2);
      Assert.equal(request.args[0].role, "system");
      Assert.stringContains(
        request.args[0].content,
        "decide which of the user's open browser tabs could help autofill"
      );
      Assert.deepEqual(request.args[1], {
        role: "user",
        content:
          "FORM THE USER IS FILLING\n" +
          "Title: Job application\n" +
          "URL: https://example.com/jobs/apply\n" +
          "Fields it is asking for:\n" +
          `${JSON.stringify(fields)}\n\n` +
          "THE USER'S OTHER OPEN TABS (title and URL only)\n" +
          `${JSON.stringify(tabs)}\n\n` +
          "maxSelectedTabs: 3\n\n" +
          "Which of these tabs could help fill this form? " +
          "Include every tab that plausibly could.",
      });
      Assert.deepEqual(request.tools, []);

      const responseFormat = request.inferenceParams.response_format;
      Assert.equal(responseFormat.type, "json_schema");
      Assert.equal(
        responseFormat.json_schema.name,
        "SmartFormFillRelevantTabs"
      );
      Assert.deepEqual(responseFormat.json_schema.schema.required, [
        "selectedTabs",
      ]);

      respond(
        JSON.stringify({
          selectedTabs: [
            {
              id: "tab-1",
              relevance: "high",
              reason: "Your professional profile",
            },
          ],
        })
      );

      Assert.deepEqual(await requestPromise, {
        selectedTabs: [
          {
            id: "tab-1",
            relevance: "high",
            reason: "Your professional profile",
          },
        ],
      });
    });
  });

  describe("generateFormValues", () => {
    beforeEach(async () => {
      await useValueGenerationPrompts();
    });

    afterEach(() => {
      _clearRemoteClientForTesting();
    });

    it("uses the value generation prompts and returns fill actions", async () => {
      const candidates = [{ token: "$EMAIL_1", type: "email" }];
      const fields = [
        {
          id: "field-email",
          label: "Email address",
          inputType: "email",
          options: [],
          type: "email",
          classificationConfidence: "high",
        },
        {
          id: "field-reason",
          label: "Why are you interested?",
          inputType: "textarea",
          options: [],
          type: "contextual",
          classificationConfidence: "high",
        },
      ];
      const relevantTabs = [
        {
          title: "Example role",
          url: "https://example.com/jobs/role",
          tabContent: "The role focuses on browser engineering.",
        },
      ];
      const requestPromise = SmartFormFillModel.generateFormValues({
        task: "generate",
        page: {
          title: "Job application",
          url: "https://example.com/jobs/apply",
        },
        fields,
        candidates,
        context: {
          pageText: "Apply for the example role.",
          relevantTabs,
          memories: [],
        },
      });

      const { request, respond } = await mockEngineMan.captureRequest({
        purpose: PURPOSE,
      });

      Assert.equal(request.args.length, 2);
      Assert.deepEqual(request.args[0], {
        role: "system",
        content: "You help a user fill out web form fields.",
      });
      Assert.deepEqual(request.args[1], {
        role: "user",
        content:
          "Current page title:\nJob application\n\n" +
          "Current page url:\nhttps://example.com/jobs/apply\n\n" +
          "Current page text:\nApply for the example role.\n\n" +
          "Relevant memories about the user:\n[]\n\n" +
          `Relevant open tabs:\n${JSON.stringify(relevantTabs)}\n\n` +
          `Available candidate tokens:\n${JSON.stringify(candidates)}\n\n` +
          `Fields to fill:\n${JSON.stringify(fields)}`,
      });
      Assert.deepEqual(request.tools, []);

      const responseFormat = request.inferenceParams.response_format;
      Assert.equal(responseFormat.type, "json_schema");
      Assert.equal(responseFormat.json_schema.name, "SmartFormFillFormValues");
      Assert.deepEqual(responseFormat.json_schema.schema.required, [
        "memories_used",
        "tabs_used",
        "fields",
      ]);

      respond(
        JSON.stringify({
          memories_used: [],
          fields: [
            {
              id: "field-email",
              action: "fill_from_token",
              token: "$EMAIL_1",
              confidence: "high",
            },
            {
              id: "field-reason",
              action: "generate",
              value: "I am interested in browser engineering.",
              confidence: "high",
            },
          ],
        })
      );

      Assert.deepEqual(await requestPromise, {
        memories_used: [],
        // Absent from the answer above, so the merged result reports it empty.
        tabs_used: [],
        fields: [
          {
            id: "field-email",
            action: "fill_from_token",
            token: "$EMAIL_1",
            confidence: "high",
          },
          {
            id: "field-reason",
            action: "generate",
            value: "I am interested in browser engineering.",
            confidence: "high",
          },
        ],
        // One batch, because the form fits in a single request.
        batches: { total: 1, failed: 0 },
      });
    });
  });
});
