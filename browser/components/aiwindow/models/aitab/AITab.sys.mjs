/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** @import { ChatConversation } from "moz-src:///browser/components/aiwindow/ui/modules/ChatConversation.sys.mjs" */
/** @import { Conversation } from "moz-src:///browser/components/aiwindow/models/Conversation.sys.mjs" */

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
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
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

// Dev override: when the pref holds a non-empty string, it is parsed as an
// A2UICatalog instead of the packaged component_schema.json, so the catalog
// can be iterated on without rebuilding.
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "overrideCatalog",
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
// viewer with the surface in the hash fragment; when this is null the tool
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

// Packaged A2UI component catalog (see models/aitab/jar.mn). The service
// produces a validated surface only.
//
// component_schema.json is an A2UI-compatible *catalog*: a single JSON-Schema
// object with a `components` map (name -> property schema), shared `$defs`.
const COMPONENT_SCHEMA_URL =
  "chrome://browser/content/aiwindow/aitab/component_schema.json";
// The `component` type every surface's root must use.
const ROOT_COMPONENT = "Page";
// The id the single root component must carry.
const ROOT_ID = "root";
// JSON Schema dialect the per-component validators declare.
const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

// Total budget (characters) for page text sent to the model, split evenly
// across the requested tabs so multi-tab requests don't overflow the prompt.
const SOURCE_TEXT_BUDGET = 10000;
// Separator inserted between each page's text in the model prompt.
const PAGE_BREAK = "\n\n<----- PAGE BREAK ---->\n\n";

const MAX_AITAB_URLS = 20;

const CANCELED_ERROR = "page generation was canceled";

/**
 * A JSON Schema object from the catalog: a component's property schema, one of
 * the shared `$defs`, or any subschema of those. Only the keywords the
 * validation walk itself inspects are listed here; every other JSON Schema
 * keyword may be present and is handled by the compiled validators.
 *
 * @typedef {object} A2UISchema
 * @property {string} [$ref] - Reference into the catalog's `$defs`, e.g. "#/$defs/DynamicString".
 * @property {string} [type] - JSON Schema type of the described value.
 * @property {A2UISchema[]} [oneOf] - Alternative shapes the value may take,
 *   e.g. a literal array or an `A2UIDataBinding` to one.
 * @property {Record<string, A2UISchema>} [properties] - Property name to its schema.
 * @property {A2UISchema} [items] - Schema each element of an array must satisfy.
 * @property {string[]} [required] - Names of the properties that must be present.
 */

/**
 * An A2UI component catalog: the packaged component_schema.json, or the object
 * held by the browser.smartwindow.aitab.components pref. A single JSON-Schema
 * document whose `components` map holds one property schema per component
 * type, all sharing the document's `$defs`.
 *
 * @typedef {object} A2UICatalog
 * @property {Record<string, A2UISchema>} components - Component type name to its property schema.
 * @property {Record<string, A2UISchema>} [$defs] - Definitions the component schemas `$ref`.
 * @property {string} [catalogId] - Identifier of the catalog.
 * @property {string} [title] - Human-readable catalog name.
 * @property {string} [description] - What the catalog covers.
 */

/**
 * A surface: the generated page, as a flat list of component instances plus
 * the data model their bindings resolve against.
 *
 * @typedef {object} A2UISurface
 * @property {A2UIComponent[]} components - Every component instance, as a flat
 *   adjacency list: parent/child structure comes from the id references, not
 *   from this array's order.
 * @property {A2UIDataModel} [dataModel] - The data the components bind to.
 */

/**
 * One component instance in a surface. Alongside the two discriminators, a
 * component carries the catalog properties declared for its type (see
 * `#propsOf`), each either a literal or an `A2UIDataBinding`; `header` and
 * `children` are the two such properties this module reads directly.
 *
 * @typedef {object} A2UIComponent
 * @property {string} id - Unique within the surface; the root component's id is ROOT_ID.
 * @property {string} component - A component type name from the catalog.
 * @property {A2UIIdReference} [header] - Id of this component's header component.
 * @property {A2UIIdReference} [children] - Ids of this component's child components.
 */

/**
 * A component's catalog properties: a component instance minus its `id` and
 * `component` discriminators, which the per-component schemas don't declare.
 *
 * @typedef {Record<string, *>} A2UIComponentProps
 */

/**
 * A surface's data model: an arbitrary JSON tree that binding paths resolve
 * into. Keeps real content out of the component instances.
 *
 * @typedef {Record<string, *>} A2UIDataModel
 */

/**
 * A binding to a value in the data model. `path` is a JSON-Pointer (RFC 6901),
 * absolute from the data-model root when it starts with "/", otherwise
 * relative to the enclosing template scope.
 *
 * @typedef {object} A2UIDataBinding
 * @property {string} path - Pointer to the bound value.
 */

/**
 * A template repeater: instantiates the `componentId` component once per
 * element of the array bound at `path`.
 *
 * @typedef {object} A2UITemplateRef
 * @property {string} componentId - Id of the template component.
 * @property {string} path - Absolute JSON-Pointer to the array to repeat over.
 */

/**
 * Related components, always referenced by id and never inlined: a single id,
 * a fixed ordered list of ids, or a template repeater.
 *
 * @typedef {string|string[]|A2UITemplateRef} A2UIIdReference
 */

/**
 * A compiled JSON Schema validator: the part of a `JsonSchema.Validator`
 * instance this module uses.
 *
 * @typedef {object} SchemaValidator
 * @property {(instance: *) => {valid: boolean, errors: ValidationError[]}} validate -
 *   Validates one instance against the compiled schema, collecting every
 *   failure (the validators are built with shortCircuit off).
 */

/**
 * Everything needed to validate a surface against one catalog: the catalog
 * itself, its component type names in catalog order, and one compiled
 * validator per component type.
 *
 * @typedef {object} ValidationEnv
 * @property {A2UICatalog} catalog - The catalog the validators were built from.
 * @property {string[]} names - Component type names, in catalog order.
 * @property {Record<string, SchemaValidator>} validators - Component type name to its props validator.
 */

/**
 * A single validation failure. Errors raised by this module carry `message`
 * (plus `component` or `dataPath` when the failure is attributable to one);
 * errors coming out of a JsonSchema validator carry the JSON Schema
 * output-unit fields instead.
 *
 * @typedef {object} ValidationError
 * @property {string} [message] - Description, for errors raised by this module.
 * @property {string} [component] - Id of the offending component instance.
 * @property {string} [dataPath] - JSON-Pointer of the offending data-model value.
 * @property {string} [error] - Description, for errors from a JsonSchema validator.
 * @property {string} [keyword] - The JSON Schema keyword that failed.
 * @property {string} [keywordLocation] - Pointer to the failed keyword within the schema.
 * @property {string} [instanceLocation] - Pointer to the failing value within the validated instance.
 */

/**
 * The outcome of validating a surface: the surface itself when it is valid,
 * every collected failure otherwise.
 *
 * @typedef {{ok: true, surface: A2UISurface} | {ok: false, errors: ValidationError[]}} SurfaceResult
 */

/**
 * One source page a surface was generated from, in the order requested.
 *
 * @typedef {object} AITabSource
 * @property {string} url - The page the content was pulled from.
 * @property {string} title - The open tab's label, falling back to the URL.
 * @property {string} favIconUrl - A `page-icon:` URL for `url`.
 * @property {string|null} imageUrl - Cached og:image, or null when there is none.
 * @property {string} extractedText - Untruncated readable page text.
 */

/**
 * How a surface came to be: what was asked for, and what it was built from.
 *
 * @typedef {object} AITabContext
 * @property {string} creationPrompt - The user's focus, or "" when none was given.
 * @property {AITabSource[]} urlsUsed - The source pages, in the order requested.
 * @property {object[]} relevantMemories - Memories that informed the page.
 */

/**
 * Metadata derived from a validated surface, for the caller to persist or
 * display. Not sent to the viewer, which only receives the surface.
 *
 * @typedef {object} AITabMetadata
 * @property {string} id - Slug of `title` (see `#slugify`).
 * @property {string} title - The surface's Header title, falling back to the
 *   user's focus, the single source page's title, then a localized default.
 * @property {string} howCreated - How the page was generated.
 * @property {AITabContext} context - What the page was generated from.
 * @property {A2UIComponent[]} components - The surface's components.
 */

/**
 * The result of a generation attempt: metadata plus the validated surface, or
 * a description of what went wrong.
 *
 * @typedef {{metadata: AITabMetadata, surface: A2UISurface} | {error: string}} AITabResult
 */

/**
 * The aitab prompt set: a conversation wired to the aitab model, and the two
 * prompt templates to render into it.
 *
 * @typedef {object} PromptSet
 * @property {Conversation} conversation - Conversation wired to the aitab model.
 * @property {string} system - System-instructions template, taking `{schemas}`.
 * @property {string} user - User-data template, taking `{focus}` and `{pageContent}`.
 */

/**
 * The AITab generation service. Everything is static: the class holds no
 * per-instance state and is never constructed.
 *
 * Private helpers are referenced as `AITab.#name` rather than `this.#name` so
 * the public methods keep working when callers destructure them off the class.
 */
export class AITab {
  /** @type {Promise<A2UICatalog>|undefined} */
  static #packagedCatalogPromise;

  /**
   * Load the component catalog: from the browser.smartwindow.aitab.components
   * pref when it is set (see lazy.overrideCatalog), otherwise from the packaged
   * catalog. Returns a validation `env` built from it.
   *
   * @returns {Promise<{env: ValidationEnv}>}
   */
  static async loadAssets() {
    const catalog =
      lazy.overrideCatalog ?? (await AITab.#loadPackagedCatalog());
    return { env: AITab.#makeEnv(catalog) };
  }

  /**
   * Validate a surface against the catalog. A surface is a flat list of
   * component instances plus a data model; validation covers, in one pass:
   * the shape of the surface, that exactly one component is the `root` Page,
   * that every component's props match its catalog schema, that all id
   * references resolve, and that every absolute data binding resolves in the
   * data model.
   *
   * @param {A2UISurface} surface
   * @param {ValidationEnv} env
   * @returns {SurfaceResult}
   */
  static buildSurface(surface, env) {
    if (!env.validators) {
      return { ok: false, errors: [{ message: "no component catalog" }] };
    }
    const components = surface?.components;
    if (!Array.isArray(components)) {
      return {
        ok: false,
        errors: [{ message: "surface.components must be an array" }],
      };
    }
    const dataModel = surface.dataModel ?? {};
    const errors = [];

    // Structural: unique ids, exactly one root, root is a Page.
    const ids = components.map(c => c?.id);
    const idSet = new Set();
    for (const id of ids) {
      if (typeof id != "string" || !id) {
        errors.push({ message: "every component needs a string id" });
      } else if (idSet.has(id)) {
        errors.push({ message: `duplicate component id "${id}"` });
      } else {
        idSet.add(id);
      }
    }
    const roots = components.filter(c => c?.id === ROOT_ID);
    if (roots.length !== 1) {
      errors.push({
        message: `expected exactly one component with id "${ROOT_ID}", found ${roots.length}`,
      });
    } else if (roots[0].component !== ROOT_COMPONENT) {
      errors.push({
        message: `the "${ROOT_ID}" component must be a ${ROOT_COMPONENT}, got "${roots[0].component}"`,
      });
    }

    // Per-component: known type + props validate against catalog schema.
    for (const comp of components) {
      const validator = env.validators[comp?.component];
      if (!validator) {
        errors.push({
          message: `unknown component "${comp?.component}" (id "${comp?.id}")`,
        });
        continue;
      }
      const { valid, errors: propErrors } = validator.validate(
        AITab.#propsOf(comp)
      );
      if (!valid) {
        for (const e of propErrors) {
          errors.push({ ...e, component: comp.id });
        }
      }
    }

    // Id-reference integrity: header/children (and template targets).
    for (const comp of components) {
      AITab.#checkRefs(comp?.header, idSet, `${comp?.id}.header`, errors);
      AITab.#checkRefs(comp?.children, idSet, `${comp?.id}.children`, errors);
    }

    // Binding integrity: absolute { path } bindings must resolve in dataModel.
    for (const comp of components) {
      if (!comp) {
        continue;
      }
      AITab.#checkBindings(AITab.#propsOf(comp), dataModel, comp.id, errors);
    }

    // Bound-array item validation: when an array prop is a { path } binding, its
    // items live in the data model — which the per-component (literal) schema
    // can't reach — so resolve the array and validate each item against the
    // array's item schema from the catalog.
    const itemCache = new Map();
    for (const comp of components) {
      const compSchema = comp && env.catalog.components[comp.component];
      if (!compSchema) {
        continue;
      }
      AITab.#checkBoundArrays(
        compSchema,
        AITab.#propsOf(comp),
        env.catalog,
        dataModel,
        comp.id,
        errors,
        itemCache
      );
    }

    if (errors.length) {
      return { ok: false, errors };
    }
    return { ok: true, surface };
  }

  /**
   * Fetch and cache the packaged catalog object from chrome://.
   *
   * @returns {Promise<A2UICatalog>}
   */
  static #loadPackagedCatalog() {
    if (!AITab.#packagedCatalogPromise) {
      AITab.#packagedCatalogPromise = fetch(COMPONENT_SCHEMA_URL)
        .then(r => r.json())
        .catch(error => {
          AITab.#packagedCatalogPromise = undefined;
          throw error;
        });
    }
    return AITab.#packagedCatalogPromise;
  }

  /**
   * Build a validation `env` from an A2UI catalog. Compiles one JsonSchema
   * validator per component type (each rooted at that component's property
   * schema, with the catalog's shared `$defs` inlined so `#/$defs/...` refs
   * resolve), and records the ordered component-name list.
   *
   * @param {A2UICatalog} catalog
   * @returns {ValidationEnv}
   */
  static #makeEnv(catalog) {
    if (!catalog || typeof catalog != "object" || !catalog.components) {
      throw new Error("aitab catalog must be an object with a components map");
    }
    const $defs = catalog.$defs ?? {};
    const names = Object.keys(catalog.components);
    const validators = {};
    for (const name of names) {
      // Each per-type doc carries the shared $defs so the component's internal
      // `#/$defs/...` references resolve. No $id: each validator is standalone
      // and there are no cross-document refs to resolve.
      const doc = {
        $schema: JSON_SCHEMA_DIALECT,
        $defs,
        ...catalog.components[name],
      };
      validators[name] = new lazy.JsonSchema.Validator(doc, {
        shortCircuit: false,
      });
    }
    return { catalog, names, validators };
  }

  /**
   * Push an error for every id reference in `value` that is not a known
   * component id. `value` may be a single id string, an array of id strings, or
   * a template `{ componentId, path }` object (children).
   *
   * @param {A2UIIdReference} value
   * @param {Set<string>} idSet
   * @param {string} where
   * @param {ValidationError[]} errors
   */
  static #checkRefs(value, idSet, where, errors) {
    if (value == null) {
      return;
    }
    if (typeof value == "string") {
      if (!idSet.has(value)) {
        errors.push({ message: `${where} references missing id "${value}"` });
      }
    } else if (Array.isArray(value)) {
      for (const v of value) {
        AITab.#checkRefs(v, idSet, where, errors);
      }
    } else if (
      typeof value == "object" &&
      typeof value.componentId == "string"
    ) {
      if (!idSet.has(value.componentId)) {
        errors.push({
          message: `${where} template references missing id "${value.componentId}"`,
        });
      }
    }
  }

  /**
   * Walk a props object for binding objects `{ path }` and push an error for
   * every absolute path (starting with "/") that does not resolve in the data
   * model. Relative paths (template scope) are not checked here.
   *
   * @param {A2UIComponentProps|*} value - Props object, or any nested value
   *   reached while walking one.
   * @param {A2UIDataModel} dataModel
   * @param {string} where
   * @param {ValidationError[]} errors
   */
  static #checkBindings(value, dataModel, where, errors) {
    if (Array.isArray(value)) {
      for (const v of value) {
        AITab.#checkBindings(v, dataModel, where, errors);
      }
      return;
    }
    if (!value || typeof value != "object") {
      return;
    }
    const keys = Object.keys(value);
    if (keys.length === 1 && typeof value.path == "string") {
      if (
        value.path.startsWith("/") &&
        AITab.#resolvePath(dataModel, value.path) === undefined
      ) {
        errors.push({
          message: `${where}: binding path "${value.path}" not found in dataModel`,
        });
      }
      return;
    }
    for (const v of Object.values(value)) {
      AITab.#checkBindings(v, dataModel, where, errors);
    }
  }

  /**
   * A component instance's catalog properties: everything but the `id` and
   * `component` discriminators, which the per-component schemas don't declare.
   *
   * @param {A2UIComponent} comp
   * @returns {A2UIComponentProps}
   */
  static #propsOf(comp) {
    const props = { ...comp };
    delete props.id;
    delete props.component;
    return props;
  }

  /**
   * Resolve a JSON-Pointer (RFC 6901) into `root`. Returns the pointed-at value
   * (truthy check at the callsite treats `undefined` as "not found"; a present
   * value — including empty string/array — is considered resolved).
   *
   * @param {A2UIDataModel} root
   * @param {string} pointer - Absolute pointer starting with "/".
   * @returns {*}
   */
  static #resolvePath(root, pointer) {
    let node = root;
    for (let seg of pointer.slice(1).split("/")) {
      if (node == null || typeof node != "object") {
        return undefined;
      }
      seg = seg.replace(/~1/g, "/").replace(/~0/g, "~");
      node = node[seg];
    }
    return node;
  }

  /**
   * True when `v` is an `A2UIDataBinding`: an object with just a string
   * `path`.
   *
   * @param {*} v
   * @returns {boolean}
   */
  static #isBinding(v) {
    return (
      !!v &&
      typeof v == "object" &&
      !Array.isArray(v) &&
      typeof v.path == "string" &&
      Object.keys(v).length === 1
    );
  }

  /**
   * Resolve a schema that may be `{ $ref: "#/$defs/X", ...siblings }` to its target `$def`.
   *
   * @param {A2UISchema} schema - Schema that may be a `$ref` into the catalog.
   * @param {A2UICatalog} catalog - The catalog holding `$defs`.
   * @returns {A2UISchema} The resolved `$def`, or `schema` when it is not a `$ref`.
   */
  static #resolveDef(schema, catalog) {
    if (schema && typeof schema.$ref == "string") {
      const name = schema.$ref.replace(/^#\/\$defs\//, "");
      return catalog.$defs?.[name] ?? schema;
    }
    return schema;
  }

  /**
   * Compile + cache a validator for an array item schema (with catalog `$defs` in scope).
   *
   * @param {A2UISchema} itemSchema - Schema each array element must satisfy.
   * @param {A2UICatalog} catalog - The catalog whose `$defs` the item schema may $ref.
   * @param {Map<string, SchemaValidator>} cache - Per-validation compiled-validator cache.
   * @returns {SchemaValidator} A JsonSchema validator for `itemSchema`.
   */
  static #itemValidator(itemSchema, catalog, cache) {
    return cache.getOrInsertComputed(
      JSON.stringify(itemSchema),
      () =>
        new lazy.JsonSchema.Validator(
          {
            $schema: JSON_SCHEMA_DIALECT,
            $defs: catalog.$defs ?? {},
            ...itemSchema,
          },
          { shortCircuit: false }
        )
    );
  }

  /**
   * Walk `value` against its catalog `schema`; wherever the schema is a
   * `oneOf` of [ array-of-items, DataBinding ] and the value is a `{ path }`
   * binding, resolve the array from the data model and validate each element
   * against the array's item schema. Recurses into object properties so nested
   * arrays (e.g. Header.references.items) are covered. Literal arrays are
   * already validated by the per-component validator, so they are skipped here.
   *
   * @param {A2UISchema} schema
   * @param {*} value
   * @param {A2UICatalog} catalog
   * @param {A2UIDataModel} dataModel
   * @param {string} where
   * @param {ValidationError[]} errors
   * @param {Map<string, SchemaValidator>} cache
   */
  static #checkBoundArrays(
    schema,
    value,
    catalog,
    dataModel,
    where,
    errors,
    cache
  ) {
    schema = AITab.#resolveDef(schema, catalog);
    if (!schema || value == null) {
      return;
    }
    if (Array.isArray(schema.oneOf)) {
      const arrayBranch = schema.oneOf.find(
        s => s && s.type === "array" && s.items
      );
      if (arrayBranch && AITab.#isBinding(value)) {
        if (!value.path.startsWith("/")) {
          return; // relative paths aren't resolvable from the root here
        }
        const arr = AITab.#resolvePath(dataModel, value.path);
        if (arr === undefined) {
          return; // missing path already reported by #checkBindings
        }
        if (!Array.isArray(arr)) {
          errors.push({
            message: `${where}: data at "${value.path}" must be an array`,
          });
          return;
        }
        const iv = AITab.#itemValidator(arrayBranch.items, catalog, cache);
        arr.forEach((item, i) => {
          const { valid, errors: itemErrors } = iv.validate(item);
          if (!valid) {
            for (const e of itemErrors) {
              errors.push({ ...e, dataPath: `${value.path}/${i}` });
            }
          }
        });
      }
      return;
    }
    const props = schema.properties;
    if (props && typeof value == "object" && !Array.isArray(value)) {
      for (const [k, sub] of Object.entries(props)) {
        if (k in value) {
          AITab.#checkBoundArrays(
            sub,
            value[k],
            catalog,
            dataModel,
            `${where}/${k}`,
            errors,
            cache
          );
        }
      }
    }
  }

  /**
   * Build the external viewer URL for a validated surface. The JSON is placed
   * in the hash fragment so it is never sent to the viewer host.
   *
   * @param {string} viewerBase - Pref-configured base URL (https only).
   * @param {A2UISurface} surface - The validated surface.
   * @returns {string}
   */
  static buildViewerURL(viewerBase, surface) {
    const url = new URL(viewerBase);
    url.hash = encodeURIComponent(JSON.stringify(surface));
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
   * pulled via get_page_content, then an LLM composes a structured A2UI surface
   * that is validated against the packaged catalog. The validated surface and
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
   *   every await boundary here and in #generateStructuredSurface, and passed to
   *   the page extractions so they can be torn down early.
   * @param {ChatConversation} conversation
   * @returns {Promise<AITabResult>} The derived metadata and validated
   *   surface, or an error description.
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

    /** @type {AITabSource[]} */
    const urlsUsed = [];
    const sourceParts = [];
    for (const [index, url] of urls.entries()) {
      // Prefer the open tab's title for the heading; fall back to the URL.
      const tab = lazy.GetPageContent.getTabWithURL(url);
      const heading = tab?.label || url;
      const text = contents[index] ?? "";
      // Best-effort og:image lookup ("" when none cached), gated on the same
      // access-control decision as the page text so a refused URL leaks no
      // image either.
      const imageUrl = lazy.GetPageContent.isContentAllowed(url, conversation)
        ? await AITab.#getPageImage(url)
        : "";
      urlsUsed.push({
        url,
        title: heading,
        favIconUrl: `page-icon:${url}`,
        imageUrl: imageUrl || null,
        extractedText: text,
      });
      // Trim each page's text to its share of the budget before sending to the
      // model.
      const budgetedText =
        text.length > perTabBudget ? text.slice(0, perTabBudget) : text;
      // Omit the Image: line when absent so the model never echoes an empty
      // value.
      const head = imageUrl
        ? `## ${heading}\nURL: ${url}\nImage: ${imageUrl}\n\n`
        : `## ${heading}\nURL: ${url}\n\n`;
      sourceParts.push(`${head}${budgetedText}`);
    }

    if (signal?.aborted) {
      return { error: CANCELED_ERROR };
    }

    const focusText = focus.trim();

    // Compose the surface with the LLM. Pages are separated by an explicit
    // page-break marker in the prompt.
    const structured = await AITab.#generateStructuredSurface({
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
      AITab.#titleFromSurface(structured.surface) ||
      focusText ||
      (urls.length === 1 && urlsUsed[0].title) ||
      lazy.l10n.formatValueSync("ai-tab-default-page-title");

    /** @type {AITabMetadata} */
    const metadata = {
      id: AITab.#slugify(title),
      title,
      howCreated: "chat",
      context: {
        creationPrompt: focusText,
        urlsUsed,
        relevantMemories: [],
      },
      components: structured.surface.components || [],
    };

    return { metadata, surface: structured.surface };
  }

  /**
   * The page title for metadata: the Header component's `title`, resolving a
   * `{ path }` binding against the surface's data model when needed.
   *
   * @param {A2UISurface} surface
   * @returns {string}
   */
  static #titleFromSurface(surface) {
    const header = (surface?.components || []).find(
      c => c?.component === "Header"
    );
    const title = header?.title;
    if (typeof title == "string") {
      return title;
    }
    if (title && typeof title == "object" && typeof title.path == "string") {
      const value = title.path.startsWith("/")
        ? AITab.#resolvePath(surface.dataModel ?? {}, title.path)
        : undefined;
      return typeof value == "string" ? value : "";
    }
    return "";
  }

  /**
   * Look up a page's preview-image (og:image) URL from Places. Never rejects;
   * returns "" on failure or when none is cached.
   *
   * @param {string} url
   * @returns {Promise<string>}
   */
  static async #getPageImage(url) {
    try {
      const pageInfo = await lazy.PlacesUtils.history
        .fetch(url, { includeMeta: true })
        .catch(() => null);
      // previewImageURL is a URL object when the page cached an og:image.
      return pageInfo?.previewImageURL ? pageInfo.previewImageURL.href : "";
    } catch (e) {
      lazy.console.debug("getPageImage failed", url, e);
      return "";
    }
  }

  /**
   * Extract a JSON object from the model's text output, tolerating markdown
   * code fences or surrounding prose.
   *
   * Internal, but not private: the xpcshell test exercises it directly.
   *
   * @param {string} text
   * @returns {A2UISurface|null} The candidate surface, not yet validated
   *   against the catalog.
   */
  static parsePageConfig(text) {
    // The outermost {...} span covers the common cases in two indexOf scans: a
    // bare object, an object inside a ```json fence, and an object wrapped in
    // unfenced prose (e.g. "Here is the page: {...} — let me know if...").
    const surface = AITab.#parseJsonSpan(text);
    if (surface) {
      return surface;
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
    lazy.console.error("failed to parse surface JSON", text);
    return null;
  }

  /**
   * Ask the model for a validated surface for the given source content.
   * Returns the validated surface on success, or an object with an `error`
   * string describing why generation failed.
   *
   * @param {object} options Options, as detailed in the Tool specification for AITab
   * @param {string} [options.focus] Focus of page information.
   * @param {string} options.sourceText Page content separated by PAGE_BREAK_TOKEN
   * @param {AbortSignal} [options.signal] - Cancels the generation.
   * @returns {Promise<{surface: A2UISurface} | {error: string}>}
   */
  static async #generateStructuredSurface({ sourceText, focus, signal }) {
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

      const surface = AITab.parsePageConfig(text);
      if (!surface) {
        lazy.console.error("model did not return valid JSON:", text);
        return { error: "the model did not return valid JSON" };
      }

      const result = AITab.buildSurface(surface, env);
      if (!result.ok) {
        lazy.console.error("surface failed validation", result.errors, surface);
        return {
          error: "the generated page did not match the required format",
        };
      }

      lazy.console.debug("structured surface validated successfully");
      return { surface: result.surface };
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
   * @returns {Promise<PromptSet>}
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
   * Serialize the catalog for a prompt's `{schemas}` placeholder: the shared
   * `$defs` once up front (the component schemas reference them), then each
   * component's property schema. Compact (no indentation). The natural-language
   * assembly rules live in the Remote Settings system-instructions prompt, not
   * here — this method injects catalog data only.
   *
   * @param {ValidationEnv} env
   * @returns {string}
   */
  static #schemaText(env) {
    const { catalog, names } = env;
    const parts = [];
    if (catalog.$defs) {
      parts.push(`=== $defs (shared) ===\n${JSON.stringify(catalog.$defs)}`);
    }
    for (const name of names) {
      parts.push(
        `=== ${name} ===\n${JSON.stringify(catalog.components[name])}`
      );
    }
    return parts.join("\n\n");
  }

  /**
   * Parse the span from the first "{" to the last "}" of `text` as JSON, or
   * null when there is no such span or it does not parse.
   *
   * @param {string} text
   * @returns {A2UISurface|null}
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
