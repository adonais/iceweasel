/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** @import { ChatConversation } from "moz-src:///browser/components/aiwindow/ui/modules/ChatConversation.sys.mjs" */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  JsonSchema: "resource://gre/modules/JsonSchema.sys.mjs",
  GetPageContent: "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs",
  buildConversation:
    "moz-src:///browser/components/aiwindow/models/PromptLoader.sys.mjs",
  loadPrompt:
    "moz-src:///browser/components/aiwindow/models/PromptLoader.sys.mjs",
  MODEL_FEATURES: "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs",
  renderPrompt: "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs",
  openAIEngine:
    "moz-src:///browser/components/aiwindow/models/openAIEngine.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "console", () =>
  console.createInstance({
    prefix: "AITab",
    maxLogLevelPref: "browser.smartwindow.conversation.logLevel",
  })
);

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["preview/aiWindow.ftl"], true)
);

// Dev override: when the pref holds a non-empty string, it is parsed as the
// component schema array instead of the packaged component_schema.json, so
// schemas can be iterated on without rebuilding.
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "overrideComponents",
  "browser.smartwindow.aitab.components",
  "",
  null,
  prefValue => {
    const pref = prefValue.trim();
    if (!pref) {
      return null;
    }
    try {
      return JSON.parse(pref);
    } catch (e) {
      throw new Error(
        `failed to parse browser.smartwindow.aitab.components: ${e.message}`
      );
    }
  }
);

// The external AITab viewer's base URL, or null when the pref is empty or does
// not hold an https URL. The generate_aitab chat tool returns a link to this
// viewer with the page config in the hash fragment; when this is null the tool
// reports that the viewer is not configured.
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "viewerBaseURL",
  "browser.smartwindow.aitab.viewerURL",
  "",
  null,
  prefValue => {
    const parsed = URL.parse(prefValue.trim());
    if (parsed?.protocol != "https:") {
      return null;
    }
    parsed.hash = "";
    return parsed.href;
  }
);

// Packaged component schemas (see models/aitab/jar.mn). The service produces
// a validated page config only.
// component_schema.json is a JSON array of schema objects,
// each identified by a short bare $id (e.g. "header") that is both the key used
// for $ref resolution and the block `type`.
// Spelled out in full rather than assembled from parts: browser_all_files_
// referenced.js greps the tree for the literal URL of every packaged file.
const COMPONENT_SCHEMA_URL =
  "chrome://browser/content/aiwindow/aitab/component_schema.json";
// $id of the top-level page schema within the array.
const PAGE_SCHEMA_NAME = "page";

// Total budget (characters) for page text sent to the model, split evenly
// across the requested tabs so multi-tab requests don't overflow the prompt.
const SOURCE_TEXT_BUDGET = 8000;
// Separator inserted between each page's text in the model prompt.
const PAGE_BREAK = "\n\n<----- PAGE BREAK ---->\n\n";

const MAX_AITAB_URLS = 20;

const CANCELED_ERROR = "page generation was canceled";

/**
 * The AITab generation service. Everything is static: the class holds no
 * per-instance state and is never constructed.
 *
 * Private helpers are referenced as `AITab.#name` rather than `this.#name` so
 * the public methods keep working when callers destructure them off the class.
 */
export class AITab {
  /** @type {Promise<object[]>|undefined} */
  static #packagedComponentsPromise;

  /**
   * Load the component schemas: from the browser.smartwindow.aitab.components
   * pref when it is set (see lazy.overrideComponents), otherwise from the
   * packaged set.
   *
   * @returns {Promise<{env: object}>}
   */
  static async loadAssets() {
    const components =
      lazy.overrideComponents ?? (await AITab.#loadPackagedComponents());
    return { env: AITab.#makeEnv(AITab.#entriesFromComponents(components)) };
  }

  /**
   * Validate a page config against the component schemas. The page config is
   * structured data; rendering it to HTML happens in the external viewer, so
   * this service only validates and never assembles markup.
   *
   * @param {object} page
   * @param {object} env
   * @returns {{ok: true, page: object} | {ok: false, errors: object[]}}
   */
  static buildPage(page, env) {
    if (!env.validator) {
      return { ok: false, errors: [{ message: "no page schema" }] };
    }
    // The page schema $refs every component schema (added to the validator in
    // #makeEnv), so validating the whole page config covers the header, each
    // body block (via blocks[].oneOf), and the footer in one pass.
    const { valid, errors } = env.validator.validate(page);
    if (!valid) {
      return { ok: false, errors };
    }
    return { ok: true, page };
  }

  /** Fetch and cache the packaged component schema array from chrome://. */
  static #loadPackagedComponents() {
    if (!AITab.#packagedComponentsPromise) {
      AITab.#packagedComponentsPromise = fetch(COMPONENT_SCHEMA_URL)
        .then(r => r.json())
        .catch(error => {
          AITab.#packagedComponentsPromise = undefined;
          throw error;
        });
    }
    return AITab.#packagedComponentsPromise;
  }

  /**
   * Build a schema `env` from `[name, schema]` entries, where `name` is the
   * schema's bare $id (e.g. "header") — also the token the schemas' $refs use
   * and the block `type`. Indexes the schemas by name, records the ordered name
   * list, and builds a JsonSchema validator rooted at the page schema with the
   * component schemas registered for $ref resolution.
   *
   * @param {Array<[string, object]>} entries
   * @returns {{byName: object, names: string[], validator: object|null}}
   */
  static #makeEnv(entries) {
    const byName = {};
    const names = [];
    for (const [name, schema] of entries) {
      if (!(name in byName)) {
        names.push(name);
      }
      byName[name] = schema;
    }
    // Build a spec-compliant validator once: the page schema is the root and
    // each component schema is registered under its $id so the page schema's
    // relative $refs (e.g. "list") resolve.
    const pageSchema = byName[PAGE_SCHEMA_NAME];
    let validator = null;
    if (pageSchema) {
      validator = new lazy.JsonSchema.Validator(pageSchema, {
        shortCircuit: false,
      });
      for (const [name, schema] of Object.entries(byName)) {
        if (name !== PAGE_SCHEMA_NAME) {
          // Register under the bare name, not the raw $id: that is the token
          // the page schema's $refs use, and #entriesFromComponents strips a
          // path-style $id down to it.
          validator.addSchema(schema, name);
        }
      }
    }
    return {
      byName,
      names,
      validator,
    };
  }

  /**
   * Convert a JSON array of schema objects into `[name, schema]` entries, keyed
   * by each schema's bare $id (e.g. "header"). The trailing split guards
   * against a path-style $id, but the packaged schemas use bare names.
   *
   * @param {object[]} components
   * @returns {Array<[string, object]>}
   */
  static #entriesFromComponents(components) {
    if (!Array.isArray(components)) {
      throw new Error("aitab component schema must be a JSON array of schemas");
    }
    return components.map(schema => {
      const id = schema?.$id;
      if (!id) {
        throw new Error("aitab component schema entry is missing $id");
      }
      return [id.split("/").pop(), schema];
    });
  }

  /**
   * Build the external viewer URL for a validated page config. The JSON is
   * placed in the hash fragment so it is never sent to the viewer host.
   *
   * @param {string} viewerBase - Pref-configured base URL (https only).
   * @param {object} page - The validated page config.
   * @returns {string}
   */
  static buildViewerURL(viewerBase, page) {
    const url = new URL(viewerBase);
    url.hash = encodeURIComponent(JSON.stringify(page));
    return url.href;
  }

  /**
   * The validated viewer base URL, or null when the viewer is not configured.
   *
   * @returns {string|null}
   */
  static getViewerBaseURL() {
    return lazy.viewerBaseURL;
  }

  /**
   * Generate an AITab from a list of URLs. Each URL's readable content is
   * pulled via get_page_content, then an LLM composes a structured page config
   * that is validated against the packaged schemas. The validated config and
   * its derived metadata are returned to the caller — nothing is persisted and
   * no HTML is assembled here (rendering happens in the external viewer). If
   * generation fails, an `error` string describing the problem is returned
   * instead.
   *
   * @param {object} options
   * @param {string[]} options.urlList - The URLs to include, already expanded
   *   from URL tokens by the tool dispatcher. Trims at MAX_AITAB_URLS urls.
   * @param {string} [options.focus] - What the user wants the page to focus on.
   * @param {AbortSignal} [options.signal] - Cancels the generation. Checked at
   *   every await boundary here and in #generateStructuredPage, and passed to
   *   the page extractions so they can be torn down early.
   * @param {ChatConversation} conversation
   * @returns {Promise<{metadata: object, page: object} | {error: string}>}
   *   The derived metadata and validated page config, or an error description.
   */
  static async generateAITab(
    { urlList, focus = "", signal } = {},
    conversation
  ) {
    const urls = Array.isArray(urlList)
      ? urlList.filter(url => typeof url == "string").slice(0, MAX_AITAB_URLS)
      : [];

    if (!urls.length) {
      return { error: "no URLs were provided to build a page from" };
    }

    if (signal?.aborted) {
      return { error: CANCELED_ERROR };
    }

    // Pull the readable content for each requested URL (order-aligned with
    // urls).
    const contents = await lazy.GetPageContent.getPageContent(
      { url_list: urls, signal },
      conversation
    );

    if (signal?.aborted) {
      return { error: CANCELED_ERROR };
    }

    // Split the source-text budget evenly across the requested tabs so the
    // model prompt stays bounded no matter how many tabs are included.
    const perTabBudget = Math.floor(SOURCE_TEXT_BUDGET / urls.length);

    const urlsUsed = [];
    const sourceParts = [];
    urls.forEach((url, index) => {
      // Prefer the open tab's title for the heading; fall back to the URL.
      const tab = lazy.GetPageContent.getTabWithURL(url);
      const heading = tab?.label || url;
      const text = contents[index] ?? "";
      urlsUsed.push({
        url,
        title: heading,
        favIconUrl: `page-icon:${url}`,
        extractedText: text,
      });
      // Trim each page's text to its share of the budget before sending to the
      // model.
      const budgetedText =
        text.length > perTabBudget ? text.slice(0, perTabBudget) : text;
      sourceParts.push(`## ${heading}\nURL: ${url}\n\n${budgetedText}`);
    });

    const focusText = focus.trim();

    // Compose the page with the LLM. Pages are separated by an explicit
    // page-break marker in the prompt.
    const structured = await AITab.#generateStructuredPage({
      sourceText: sourceParts.join(PAGE_BREAK),
      focus: focusText,
      signal,
    });

    if (signal?.aborted) {
      return { error: CANCELED_ERROR };
    }

    if (structured.error) {
      return { error: structured.error };
    }

    const title =
      structured.page.header?.title ||
      focusText ||
      (urls.length === 1 && urlsUsed[0].title) ||
      lazy.l10n.formatValueSync("ai-tab-default-page-title");

    const metadata = {
      id: AITab.#slugify(title),
      title,
      howCreated: "chat",
      context: {
        creationPrompt: focusText,
        urlsUsed,
        relevantMemories: [],
      },
      components: structured.page.blocks || [],
    };

    return { metadata, page: structured.page };
  }

  /**
   * Extract a JSON object from the model's text output, tolerating markdown
   * code fences or surrounding prose.
   *
   * Internal, but not private: the xpcshell test exercises it directly.
   *
   * @param {string} text
   * @returns {object|null}
   */
  static parsePageConfig(text) {
    // The outermost {...} span covers the common cases in two indexOf scans: a
    // bare object, an object inside a ```json fence, and an object wrapped in
    // unfenced prose (e.g. "Here is the page: {...} — let me know if...").
    const page = AITab.#parseJsonSpan(text);
    if (page) {
      return page;
    }
    // The span only misses when prose on either side of a fenced block has
    // braces of its own, so fall back to the region between the first pair of
    // fences. Any language tag is left in it, which is harmless:
    // #parseJsonSpan starts at "{".
    const open = text.indexOf("```");
    const close = open < 0 ? -1 : text.indexOf("```", open + 3);
    const fenced =
      close > open ? AITab.#parseJsonSpan(text.slice(open + 3, close)) : null;
    if (fenced) {
      return fenced;
    }
    lazy.console.error("failed to parse page config JSON", text);
    return null;
  }

  /**
   * Ask the model for a validated page config for the given source content.
   * Returns the validated page config on success, or an object with an `error`
   * string describing why generation failed.
   *
   * @param {object} options Options, as detailed in the Tool specification for AITab
   * @param {string} [options.focus] Focus of page information.
   * @param {string} options.sourceText Page content separated by PAGE_BREAK_TOKEN
   * @param {AbortSignal} [options.signal] - Cancels the generation.
   * @returns {Promise<{page: object} | {error: string}>}
   */
  static async #generateStructuredPage({ sourceText, focus, signal }) {
    try {
      const { env } = await AITab.loadAssets();

      const { conversation, system, user } = await AITab.#resolvePromptSet();
      conversation.setSystemMessage(
        lazy.renderPrompt(system, { schemas: AITab.#schemaText(env) })
      );
      conversation.addUserMessage(
        lazy.renderPrompt(user, { focus: focus ?? "", pageContent: sourceText })
      );

      if (signal?.aborted) {
        return { error: CANCELED_ERROR };
      }

      // The signal is deliberately not forwarded to run(): an AbortSignal
      // cannot be structured-cloned to the engine actor, so the model call can
      // only be abandoned once it resolves.
      const response = await conversation.run({
        fxAccountToken: await lazy.openAIEngine.getFxAccountToken(),
      });

      if (signal?.aborted) {
        return { error: CANCELED_ERROR };
      }

      const text = response?.finalOutput?.trim();
      lazy.console.debug(
        `model returned ${text?.length || 0} chars`,
        text ? text.slice(0, 500) : response
      );
      if (!text) {
        return { error: "the model returned an empty response" };
      }

      const page = AITab.parsePageConfig(text);
      if (!page) {
        lazy.console.error("model did not return valid JSON:", text);
        return { error: "the model did not return valid JSON" };
      }

      const result = AITab.buildPage(page, env);
      if (!result.ok) {
        lazy.console.error(
          "page config failed validation",
          result.errors,
          page
        );
        return {
          error: "the generated page did not match the required format",
        };
      }

      lazy.console.debug("structured page validated successfully");
      return { page: result.page };
    } catch (error) {
      lazy.console.error("structured generation failed", error);
      return { error: `page generation failed: ${error?.message ?? error}` };
    }
  }

  /**
   * Load the aitab prompt templates and engine from Remote Settings. The
   * "ai-window-prompts" collection ships a packaged dump
   * (services/settings/dumps/main/ai-window-prompts.json), so the records are
   * always available — offline and on first run — without an in-tree fallback.
   * A genuine failure propagates and is surfaced as a generation error by the
   * caller.
   *
   * @returns {Promise<{conversation: object, system: string, user: string}>}
   */
  static async #resolvePromptSet() {
    const conversation = await lazy.buildConversation(
      lazy.MODEL_FEATURES.AITAB
    );
    const [{ prompt: system }, { prompt: user }] = await Promise.all([
      lazy.loadPrompt(lazy.MODEL_FEATURES.AITAB, {
        module: "system-instructions",
      }),
      lazy.loadPrompt(lazy.MODEL_FEATURES.AITAB, { module: "user-data" }),
    ]);
    return { conversation, system, user };
  }

  /**
   * Concatenate the loaded component schemas for injection into a prompt's
   * `{schemas}` placeholder.
   *
   * @param {object} env
   * @returns {string}
   */
  static #schemaText(env) {
    // Compact JSON (no indentation) and drop validator-only keys ($id/$schema)
    // the model doesn't need: the `=== name ===` header already identifies each
    // schema, so this trims prompt tokens without losing any guidance.
    return env.names
      .map(name => {
        const schema = { ...env.byName[name] };
        delete schema.$id;
        delete schema.$schema;
        return `=== ${name} ===\n${JSON.stringify(schema)}`;
      })
      .join("\n\n");
  }

  /**
   * Parse the span from the first "{" to the last "}" of `text` as JSON, or
   * null when there is no such span or it does not parse.
   *
   * @param {string} text
   * @returns {object|null}
   */
  static #parseJsonSpan(text) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) {
      return null;
    }
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  /**
   * Turn a title into a lowercase snake_case slug.
   *
   * @param {string} title
   * @returns {string}
   */
  static #slugify(title) {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);
    // A title with no ASCII alphanumerics at all (e.g. one written in Japanese)
    // slugs to the empty string, which is not a usable identifier.
    return slug || "aitab";
  }
}
